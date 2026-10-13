// Builds a playable map (meshes, colliders, nav grid, lighting) from a map definition.
import * as THREE from 'three';
import * as TX from './textures.js';
import { box, rayBox } from './physics.js';

const repCache = new Map();
function rep(tex, rx, ry) {
  const key = tex.uuid + ':' + rx.toFixed(2) + ':' + ry.toFixed(2);
  if (repCache.has(key)) return repCache.get(key);
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  repCache.set(key, t);
  return t;
}

const matCache = new Map();
function lam(color, map, extra = {}) {
  const key = `${color}|${map ? map.uuid : ''}|${JSON.stringify(extra)}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshLambertMaterial({ color, map: map || null, ...extra });
  matCache.set(key, m);
  return m;
}
function basic(color, map, extra = {}) {
  return new THREE.MeshBasicMaterial({ color, map: map || null, ...extra });
}

export class World {
  constructor(scene, def, opts = {}) {
    this.scene = scene;
    this.def = def;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];
    this.lampLights = [];
    this.animated = [];
    this.lightBudget = opts.lowGfx ? 2 : 7;
    const [x0, x1, z0, z1] = def.bounds;
    this.minX = x0; this.maxX = x1; this.minZ = z0; this.maxZ = z1;
    this.ceiling = def.ceiling || 60;
    this.indoor = !!def.indoor;
    this.buildEnvironment(opts);
    this.buildGround();
    this.buildBounds();
    for (const p of def.props) this.buildProp(p);
    this.mergeStatic();
    this.buildNav();
    this.buildBuckets();
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    if (this.sky) this.scene.remove(this.sky);
    for (const l of this.envLights) this.scene.remove(l);
  }

  // ---------- environment ----------
  buildEnvironment(opts) {
    const th = this.def.theme;
    this.scene.background = new THREE.Color(th.skyBot);
    this.scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
    this.envLights = [];
    const hemi = new THREE.HemisphereLight(th.hemiTop, th.hemiBot, th.hemiI);
    const amb = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(hemi, amb); this.envLights.push(hemi, amb);
    const sun = new THREE.DirectionalLight(th.sun, th.sunI);
    const sd = new THREE.Vector3(...th.sunDir).normalize();
    sun.position.copy(sd.multiplyScalar(90));
    sun.castShadow = !opts.lowGfx;
    const ext = Math.max(this.maxX - this.minX, this.maxZ - this.minZ) * 0.62;
    sun.shadow.camera.left = -ext; sun.shadow.camera.right = ext;
    sun.shadow.camera.top = ext; sun.shadow.camera.bottom = -ext;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun); this.scene.add(sun.target); this.envLights.push(sun, sun.target);
    this.sun = sun;

    if (!this.indoor) {
      const skyGeo = new THREE.SphereGeometry(400, 24, 12);
      const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: new THREE.Color(th.skyTop) }, bot: { value: new THREE.Color(th.skyBot) } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.15,0.0,1.0); gl_FragColor = vec4(mix(bot, top, h),1.0); }',
      });
      const sky = new THREE.Mesh(skyGeo, skyMat);
      sky.renderOrder = -10;
      this.sky = new THREE.Group();
      this.sky.add(sky);
      if (th.stars) {
        const pts = [];
        for (let i = 0; i < 700; i++) {
          const u = Math.random() * Math.PI * 2, v = Math.random() * 0.45 + 0.08;
          pts.push(Math.cos(u) * Math.cos(v) * 380, Math.sin(v) * 380, Math.sin(u) * Math.cos(v) * 380);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        this.sky.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false, fog: false })));
      }
      if (th.skyline) {
        const tex = TX.skyline();
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, side: THREE.BackSide, depthWrite: false, color: th.stars ? 0xffffff : 0x8899aa });
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(260, 260, 70, 48, 1, true), mat);
        cyl.position.y = 20;
        this.sky.add(cyl);
      }
      this.scene.add(this.sky);
    }
  }

  buildGround() {
    const th = this.def.theme;
    const w = this.maxX - this.minX + 40, d = this.maxZ - this.minZ + 40;
    const cx = (this.minX + this.maxX) / 2, cz = (this.minZ + this.maxZ) / 2;
    const base = { asphalt: TX.asphalt(), dirt: TX.dirt(), tile: TX.tile(), grass: TX.grass() }[th.ground] || TX.asphalt();
    const scale = th.ground === 'tile' ? 3 : 8;
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lam(0xffffff, rep(base, w / scale, d / scale)));
    g.rotation.x = -Math.PI / 2; g.position.set(cx, 0, cz); g.receiveShadow = true;
    this.group.add(g);
    for (const p of this.def.patches || []) {
      let tex, sx = 6, sz = 6;
      switch (p.tex) {
        case 'road': tex = TX.roadLines(); sx = p.w; sz = 12; break;
        case 'sidewalk': tex = TX.sidewalk(); sx = 3; sz = 3; break;
        case 'dirt': tex = TX.dirt(); sx = 8; sz = 8; break;
        case 'grass': tex = TX.grass(); sx = 6; sz = 6; break;
        case 'court': tex = TX.court(); sx = p.w; sz = p.d; break;
        case 'concrete': tex = TX.concrete('#8a8780'); sx = 4; sz = 4; break;
        case 'asphaltp': tex = TX.asphalt(); sx = 8; sz = 8; break;
        case 'track': tex = TX.dirt(); sx = 4; sz = 4; break;
        default: tex = TX.concrete(); break;
      }
      const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), lam(p.tex === 'track' ? 0x777777 : 0xffffff, rep(tex, p.w / sx, p.d / sz)));
      m.rotation.x = -Math.PI / 2; m.position.set(p.x, p.y ?? 0.015, p.z); m.receiveShadow = true;
      this.group.add(m);
      if (p.tex === 'track') {
        const railMat = lam(0x9a9a9a, null);
        for (const off of [-0.75, 0.75]) {
          const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, p.d), railMat);
          r.position.set(p.x + off, 0.07, p.z); this.group.add(r);
        }
        const tieMat = lam(0x3e2c1e, null);
        const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.08, 0.25), tieMat, Math.floor(p.d / 0.9));
        const mtx = new THREE.Matrix4();
        for (let i = 0; i < ties.count; i++) { mtx.makeTranslation(p.x, 0.04, p.z - p.d / 2 + i * 0.9); ties.setMatrixAt(i, mtx); }
        this.group.add(ties);
      }
    }
    if (this.indoor) {
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lam(0xb0b4ba, rep(TX.concrete('#9a9ea4'), w / 6, d / 6)));
      ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, this.ceiling, cz);
      this.group.add(ceil);
      const panelMat = basic(0xf2f7ff);
      for (let z = this.minZ + 6; z < this.maxZ - 2; z += 9) {
        for (const x of [-25, -14, 0, 14, 25]) {
          const pnl = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 4), panelMat);
          pnl.position.set(x, this.ceiling - 0.05, z); this.group.add(pnl);
        }
      }
      // a few real lights to sell the fluorescent look
      for (const [x, z] of [[0, -36], [0, 0], [0, 36], [-25, -20], [25, 20]]) {
        if (this.lightBudget-- <= 0) break;
        const l = new THREE.PointLight(0xe8f2ff, 40, 34, 1.6);
        l.position.set(x, this.ceiling - 0.6, z); this.group.add(l);
      }
    }
  }

  buildBounds() {
    const H = this.indoor ? this.ceiling : 6;
    const th = this.def.theme;
    const t = 0.8;
    const sides = [
      [this.minX - t / 2, (this.minZ + this.maxZ) / 2, t, this.maxZ - this.minZ + t * 2],
      [this.maxX + t / 2, (this.minZ + this.maxZ) / 2, t, this.maxZ - this.minZ + t * 2],
      [(this.minX + this.maxX) / 2, this.minZ - t / 2, this.maxX - this.minX, t],
      [(this.minX + this.maxX) / 2, this.maxZ + t / 2, this.maxX - this.minX, t],
    ];
    const tex = this.indoor ? TX.wallTile() : TX.brick('#5d4a3e', 'bwall');
    for (const [x, z, w, d] of sides) {
      const len = Math.max(w, d);
      const m = this.addBox(x, 0, z, w, H, d, lam(0xffffff, rep(tex, len / (this.indoor ? 4 : 3), H / (this.indoor ? 4 : 3))), { cast: false });
      m.receiveShadow = true;
    }
    if (!this.indoor) {
      // graffiti along the perimeter
      let seed = 100;
      for (let i = 0; i < 10; i++) {
        const side = i % 4;
        const along = (Math.random() - 0.5) * 0.8;
        let x, z, rotY;
        if (side === 0) { x = this.minX + 0.02; z = (this.minZ + this.maxZ) / 2 + along * (this.maxZ - this.minZ); rotY = Math.PI / 2; }
        else if (side === 1) { x = this.maxX - 0.02; z = (this.minZ + this.maxZ) / 2 + along * (this.maxZ - this.minZ); rotY = -Math.PI / 2; }
        else if (side === 2) { z = this.minZ + 0.02; x = (this.minX + this.maxX) / 2 + along * (this.maxX - this.minX); rotY = 0; }
        else { z = this.maxZ - 0.02; x = (this.minX + this.maxX) / 2 + along * (this.maxX - this.minX); rotY = Math.PI; }
        this.addDecal(TX.graffiti(seed++), x, 2.2, z, 6, 3, rotY);
      }
    }
    void th;
  }

  // ---------- helpers ----------
  addBox(x, y, z, w, h, d, mat, o = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    m.castShadow = o.cast !== false; m.receiveShadow = true;
    (o.parent || this.group).add(m);
    if (o.collide !== false) this.colliders.push(box(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, o.tag));
    return m;
  }

  addDecal(tex, x, y, z, w, h, rotY, mat) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat || new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.05, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(x, y, z); m.rotation.y = rotY;
    this.group.add(m);
    return m;
  }

  // rot: 0 -> long axis along z, 1 -> along x
  dims(rot, w, l) { return rot % 2 ? [l, w] : [w, l]; }

  addSign(text, opts, x, y, z, w, h, rotY) {
    const tex = TX.sign(text, opts.bg, opts.fg, opts);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basic(0xffffff, tex));
    m.position.set(x, y, z); m.rotation.y = rotY;
    this.group.add(m);
    if (opts.glow) this.animated.push({ type: 'neon', mesh: m, phase: Math.random() * 10 });
    return m;
  }

  pointLight(color, x, y, z, intensity = 30, dist = 22) {
    if (this.lightBudget <= 0) return;
    this.lightBudget--;
    const l = new THREE.PointLight(color, intensity, dist, 1.7);
    l.position.set(x, y, z);
    this.group.add(l);
  }

  // ---------- props ----------
  buildProp(p) {
    const fn = this['prop_' + p.t];
    if (fn) fn.call(this, p);
  }

  prop_building(p) {
    const seed = Math.floor(Math.abs(p.x * 13 + p.z * 7)) + 1;
    const fac = TX.facade(p.color, seed, { brick: p.brick, store: p.store, tag: p.tag });
    const facX = lam(0xffffff, rep(fac, Math.max(1, Math.round(p.d / 6)), 1));
    const facZ = lam(0xffffff, rep(fac, Math.max(1, Math.round(p.w / 6)), 1));
    const roof = lam(0x3a3a3a, rep(TX.concrete('#4a4a4a'), p.w / 6, p.d / 6));
    const mats = [facX, facX, roof, roof, facZ, facZ];
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), mats);
    m.position.set(p.x, p.h / 2, p.z); m.castShadow = true; m.receiveShadow = true;
    this.group.add(m);
    this.colliders.push(box(p.x - p.w / 2, 0, p.z - p.d / 2, p.x + p.w / 2, p.h, p.z + p.d / 2, 'building'));
    // parapet + rooftop clutter
    const par = lam(0x2a2a2a, null);
    this.addBox(p.x, p.h, p.z - p.d / 2 + 0.15, p.w, 0.6, 0.3, par, { collide: false });
    this.addBox(p.x, p.h, p.z + p.d / 2 - 0.15, p.w, 0.6, 0.3, par, { collide: false });
    this.addBox(p.x - p.w / 2 + 0.15, p.h, p.z, 0.3, 0.6, p.d, par, { collide: false });
    this.addBox(p.x + p.w / 2 - 0.15, p.h, p.z, 0.3, 0.6, p.d, par, { collide: false });
    const ac = lam(0x9a9a9a, rep(TX.metal('#9a9a9a'), 1, 1));
    this.addBox(p.x + p.w * 0.2, p.h, p.z - p.d * 0.15, 2, 1.2, 1.6, ac, { collide: false });
    if (p.sign) {
      const s = p.sign;
      const span = s.face === 'e' || s.face === 'w' ? p.d : p.w;
      const sw = Math.min(span * 0.85, 11), sh = sw / 4;
      const y = Math.min(p.h - sh / 2 - 0.3, 3.2 + sh / 2);
      const off = 0.08;
      let x = p.x, z = p.z, ry = 0;
      if (s.face === 'e') { x = p.x + p.w / 2 + off; ry = Math.PI / 2; }
      if (s.face === 'w') { x = p.x - p.w / 2 - off; ry = -Math.PI / 2; }
      if (s.face === 'n') { z = p.z + p.d / 2 + off; ry = 0; }
      if (s.face === 's') { z = p.z - p.d / 2 - off; ry = Math.PI; }
      this.addSign(s.text, s, x, y, z, sw, sh, ry);
      // awning
      const dir = { e: [1, 0], w: [-1, 0], n: [0, 1], s: [0, -1] }[s.face];
      const aw = new THREE.Mesh(new THREE.BoxGeometry(dir[0] ? 1.4 : span * 0.7, 0.12, dir[0] ? span * 0.7 : 1.4), lam(s.bg, null));
      aw.position.set(x + dir[0] * 0.7, 2.7, z + dir[1] * 0.7);
      aw.rotation.set(dir[1] * 0.25, 0, -dir[0] * 0.25);
      aw.castShadow = true;
      this.group.add(aw);
      if (s.glow) this.pointLight(s.fg, x + dir[0] * 2, y, z + dir[1] * 2, 18, 14);
    }
  }

  prop_car(p) {
    const donk = !!p.donk;
    const lift = p.lift ? 1.9 : 0;
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: p.wreck ? new THREE.Color(p.color).multiplyScalar(0.5) : p.color, metalness: 0.5, roughness: p.wreck ? 0.9 : 0.35 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0b0f14, metalness: 0.8, roughness: 0.1 });
    const wheelR = donk ? 0.62 : 0.36;
    const bodyY = wheelR + 0.05 + (donk ? 0.2 : 0);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.75, 4.5), bodyMat);
    body.position.y = bodyY + 0.37; g.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.3), glass);
    cab.position.set(0, bodyY + 1.05, -0.2); g.add(cab);
    const cabTop = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 2.1), bodyMat);
    cabTop.position.set(0, bodyY + 1.38, -0.2); g.add(cabTop);
    const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, donk ? 0.42 : 0.3, 14);
    const tire = lam(0x111111, null);
    const rim = new THREE.MeshStandardMaterial({ color: donk ? 0xf5f5f5 : 0x777777, metalness: 1, roughness: 0.15 });
    if (!p.wreck || Math.random() < 0.5) {
      for (const [wx, wz] of [[-0.9, 1.45], [0.9, 1.45], [-0.9, -1.45], [0.9, -1.45]]) {
        const w = new THREE.Mesh(wheelGeo, tire); w.rotation.z = Math.PI / 2; w.position.set(wx, wheelR, wz); g.add(w);
        const r = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.65, wheelR * 0.65, donk ? 0.44 : 0.32, 12), rim);
        r.rotation.z = Math.PI / 2; r.position.copy(w.position); g.add(r);
      }
    }
    const hl = basic(p.wreck ? 0x333333 : 0xfff6d0);
    const tl = basic(p.wreck ? 0x330000 : 0xff1a1a);
    for (const sx of [-0.65, 0.65]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.05), hl); a.position.set(sx, bodyY + 0.5, 2.26); g.add(a);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.05), tl); b.position.set(sx, bodyY + 0.55, -2.26); g.add(b);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(p.x, lift, p.z);
    g.rotation.y = (p.rot % 2 ? Math.PI / 2 : 0) + (p.wreck ? (Math.random() - 0.5) * 0.15 : 0);
    if (p.wreck) g.rotation.z = (Math.random() - 0.5) * 0.06;
    this.group.add(g);
    const [w, l] = this.dims(p.rot, 2.0, 4.6);
    const top = lift + bodyY + 1.4;
    this.colliders.push(box(p.x - w / 2, lift > 0 ? lift + bodyY - 0.05 : 0, p.z - l / 2, p.x + w / 2, top, p.z + l / 2, 'car'));
    if (lift) {
      const post = lam(0xd32f2f, null);
      for (const sx of [-1.35, 1.35]) this.addBox(p.x + sx, 0, p.z, 0.25, lift + 0.4, 0.25, post);
      const arm = lam(0x555555, null);
      this.addBox(p.x, lift - 0.1, p.z, 2.9, 0.12, 3.6, arm, { collide: false });
    }
  }

  prop_bus(p) {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xe9e9e9, metalness: 0.3, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.9, 11), white); body.position.y = 1.75; g.add(body);
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.64, 0.9, 10), lam(0x111820, null)); win.position.y = 2.4; g.add(win);
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(2.66, 0.18, 11.02), lam(0xff6f00, null)); s1.position.y = 1.6; g.add(s1);
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(2.66, 0.12, 11.02), lam(0x1565c0, null)); s2.position.y = 1.35; g.add(s2);
    for (const z of [-3.6, 3.6]) for (const x of [-1.25, 1.25]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12), lam(0x111111, null));
      w.rotation.z = Math.PI / 2; w.position.set(x, 0.5, z); g.add(w);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(p.x, 0, p.z);
    this.group.add(g);
    this.addSign('MARTA', { bg: '#1565c0', fg: '#fff' }, p.x + 1.34, 2.95, p.z, 3, 0.75, Math.PI / 2);
    this.addSign('MARTA', { bg: '#1565c0', fg: '#fff' }, p.x - 1.34, 2.95, p.z, 3, 0.75, -Math.PI / 2);
    this.colliders.push(box(p.x - 1.3, 0, p.z - 5.5, p.x + 1.3, 3.2, p.z + 5.5, 'car'));
  }

  prop_barrier(p) {
    const [w, l] = this.dims(p.rot, 0.7, 3.2);
    this.addBox(p.x, 0, p.z, w, 1.05, l, lam(0xbdbdbd, rep(TX.concrete('#bdbdbd'), 1, 0.4)));
  }

  prop_lamp(p) {
    const pole = lam(0x3b3b3b, null);
    const h = p.wall ? 4.5 : 6.5;
    this.addBox(p.x, 0, p.z, 0.22, h, 0.22, pole, { collide: !p.wall });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.4), basic(new THREE.Color(this.def.theme.lamps)));
    head.position.set(p.x, h, p.z); this.group.add(head);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.smokeSprite(), color: this.def.theme.lamps, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(3, 3, 1); glow.position.set(p.x, h - 0.1, p.z); this.group.add(glow);
    this.pointLight(this.def.theme.lamps, p.x, h - 0.3, p.z, 160, 28);
  }

  prop_dumpster(p) {
    const [w, l] = this.dims(p.rot, 1.5, 2.2);
    const mat = lam(0x2e5a34, rep(TX.metal('#2e5a34', 'dump'), 1, 1));
    this.addBox(p.x, 0, p.z, w, 1.35, l, mat);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.08, l + 0.08), lam(0x1d3d22, null));
    lid.position.set(p.x, 1.4, p.z); lid.rotation.x = 0.05; this.group.add(lid);
  }

  prop_fence(p) {
    const alongX = Math.abs(p.x2 - p.x1) > Math.abs(p.z2 - p.z1);
    const len = alongX ? Math.abs(p.x2 - p.x1) : Math.abs(p.z2 - p.z1);
    const cx = (p.x1 + p.x2) / 2, cz = (p.z1 + p.z2) / 2, H = 2.6;
    const tex = rep(TX.chainlink(), len / 0.6, H / 0.6);
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), mat);
    m.position.set(cx, H / 2, cz); m.rotation.y = alongX ? 0 : Math.PI / 2; this.group.add(m);
    const post = lam(0x888888, null);
    for (let i = 0; i <= Math.ceil(len / 3); i++) {
      const t = Math.min(1, i * 3 / len);
      this.addBox(p.x1 + (p.x2 - p.x1) * t, 0, p.z1 + (p.z2 - p.z1) * t, 0.1, H, 0.1, post, { collide: false });
    }
    const w = alongX ? len : 0.15, d = alongX ? 0.15 : len;
    this.colliders.push(box(cx - w / 2, 0, cz - d / 2, cx + w / 2, H, cz + d / 2, 'fence'));
  }

  prop_crates(p) {
    const mat = lam(0x9c7a4c, rep(TX.metal('#8d6e45', 'wood'), 1, 1));
    this.addBox(p.x, 0, p.z, 1.3, 1.3, 1.3, mat);
    this.addBox(p.x + 1.35, 0, p.z + 0.2, 1.3, 1.3, 1.3, mat);
    this.addBox(p.x + 0.6, 1.3, p.z + 0.1, 1.2, 1.2, 1.2, mat);
    this.addBox(p.x - 0.2, 0, p.z + 1.4, 1.1, 1.0, 1.1, mat);
  }

  prop_wall(p) {
    const tex = p.tex === 'walltile' ? TX.wallTile() : p.tex === 'metal' ? TX.metal(p.color || '#9e9e9e', 'wallmetal') : TX.concrete('#8f8b84', 'cwall');
    const len = Math.max(p.w, p.d);
    this.addBox(p.x, 0, p.z, p.w, p.h, p.d, lam(0xffffff, rep(tex, len / 4, p.h / 4)));
    const alongX = p.w > p.d;
    const half = (alongX ? p.d : p.w) / 2 + 0.03;
    if (p.graf) {
      for (const s of [-1, 1]) {
        const x = alongX ? p.x : p.x + s * half, z = alongX ? p.z + s * half : p.z;
        const ry = alongX ? (s > 0 ? 0 : Math.PI) : (s > 0 ? Math.PI / 2 : -Math.PI / 2);
        this.addDecal(TX.graffiti(p.graf * 2 + (s > 0 ? 1 : 0)), x, Math.min(p.h * 0.55, 1.6), z, Math.min(len * 0.95, 6), Math.min(p.h * 0.9, 2.6), ry);
      }
    }
    if (p.sign) {
      for (const s of [-1, 1]) {
        const x = alongX ? p.x : p.x + s * half, z = alongX ? p.z + s * half : p.z;
        const ry = alongX ? (s > 0 ? 0 : Math.PI) : (s > 0 ? Math.PI / 2 : -Math.PI / 2);
        const sw = Math.min(len * 0.6, 10);
        const style = p.tex === 'walltile' ? { bg: '#1b1b1b', fg: '#fff', border: '#ff6f00' } : { bg: '#263238', fg: '#ffca28' };
        this.addSign(p.sign, style, x, Math.min(p.h - 1, 4.6), z, sw, sw / 4, ry);
      }
    }
  }

  prop_tires(p) {
    const mat = lam(0x161616, null);
    const geo = new THREE.TorusGeometry(0.42, 0.18, 8, 14);
    for (let s = 0; s < 2; s++) {
      const n = 3 + ((p.x + s) & 1);
      for (let i = 0; i < n; i++) {
        const t = new THREE.Mesh(geo, mat);
        t.rotation.x = Math.PI / 2; t.position.set(p.x + s * 1.2, 0.18 + i * 0.36, p.z + s * 0.3);
        t.castShadow = true; this.group.add(t);
      }
      this.colliders.push(box(p.x + s * 1.2 - 0.6, 0, p.z + s * 0.3 - 0.6, p.x + s * 1.2 + 0.6, 0.36 * n, p.z + s * 0.3 + 0.6, 'prop'));
    }
  }

  prop_container(p) {
    const [w, l] = this.dims(p.rot, 2.45, 6.1);
    const mat = lam(0xffffff, rep(TX.metal(p.color, 'cont'), 3, 1));
    this.addBox(p.x, 0, p.z, w, 2.6, l, mat);
  }

  prop_tree(p) {
    this.addBox(p.x, 0, p.z, 0.4, 3.2, 0.4, lam(0x4e342e, null));
    const leaves = lam(0x2f5a26, null);
    for (const [ox, oy, oz, r] of [[0, 4.2, 0, 1.9], [0.9, 3.6, 0.4, 1.3], [-0.8, 3.8, -0.5, 1.4]]) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leaves);
      c.position.set(p.x + ox, oy, p.z + oz); c.castShadow = true; this.group.add(c);
    }
  }

  prop_bench(p) {
    const [w, l] = this.dims(p.rot, 0.6, 2.2);
    this.addBox(p.x, 0, p.z, w, 0.5, l, lam(0x6d4c41, null));
  }

  prop_hoop(p) {
    const dir = p.rot === 2 ? -1 : 1;
    this.addBox(p.x, 0, p.z - dir * 1.1, 0.18, 3.6, 0.18, lam(0x37474f, null));
    const bb = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.06), lam(0xf5f5f5, null));
    bb.position.set(p.x, 3.35, p.z - dir * 0.95); this.group.add(bb);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 16), lam(0xff5722, null));
    rim.rotation.x = Math.PI / 2; rim.position.set(p.x, 3.05, p.z - dir * 0.65); this.group.add(rim);
  }

  prop_playground(p) {
    const red = lam(0xc62828, null), yel = lam(0xfbc02d, null), blu = lam(0x1565c0, null);
    for (const [ox, oz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) this.addBox(p.x + ox, 0, p.z + oz, 0.18, 3.0, 0.18, red, { collide: false });
    this.addBox(p.x, 0, p.z, 3, 1.3, 3, blu);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 4), yel);
    roof.position.set(p.x, 3.6, p.z); roof.rotation.y = Math.PI / 4; this.group.add(roof);
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 3.2), yel);
    slide.position.set(p.x + 2.6, 0.7, p.z); slide.rotation.z = 0; slide.rotation.x = 0;
    slide.rotation.set(0, Math.PI / 2, -0.4); this.group.add(slide);
  }

  prop_train(p) {
    const g = new THREE.Group();
    const silver = new THREE.MeshStandardMaterial({ color: 0xc7cbd1, metalness: 0.8, roughness: 0.35, map: rep(TX.metal('#c7cbd1', 'train'), 4, 1) });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 3.3, p.len), silver); body.position.y = 1.95; g.add(body);
    const win = new THREE.Mesh(new THREE.BoxGeometry(3.04, 0.9, p.len - 1.2), lam(0x0e1a28, null)); win.position.y = 2.55; g.add(win);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.25, p.len + 0.02), lam(0xff6f00, null)); stripe.position.y = 1.7; g.add(stripe);
    const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.12, p.len + 0.02), lam(0x1565c0, null)); stripe2.position.y = 1.45; g.add(stripe2);
    const under = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, p.len - 1), lam(0x222222, null)); under.position.y = 0.3; g.add(under);
    for (let z = -p.len / 2 + 3; z < p.len / 2 - 2; z += 4.5) {
      for (const s of [-1, 1]) {
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.3, 1.4), lam(0x8f949b, null));
        door.position.set(s * 1.52, 1.75, z); g.add(door);
      }
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(p.x, 0, p.z); this.group.add(g);
    for (const s of [-1, 1]) this.addSign('MARTA', { bg: '#0d47a1', fg: '#fff' }, p.x + s * 1.54, 3.25, p.z, 2.4, 0.6, s * Math.PI / 2);
    this.colliders.push(box(p.x - 1.5, 0, p.z - p.len / 2, p.x + 1.5, 3.6, p.z + p.len / 2, 'car'));
  }

  prop_pillar(p) {
    this.addBox(p.x, 0, p.z, 1.1, this.ceiling, 1.1, lam(0xffffff, rep(TX.wallTile('#e6d9b8'), 0.5, 2)));
  }

  prop_turnstile(p) {
    this.addBox(p.x, 0, p.z, 1.0, 1.05, 0.6, lam(0x90a4ae, rep(TX.metal('#90a4ae', 'turn'), 1, 1)));
  }

  prop_box(p) {
    this.addBox(p.x, 0, p.z, p.w, p.h, p.d, lam(p.color, rep(TX.metal(p.color, 'boxm'), 1, 1)));
    if (p.label) {
      const alongX = p.w > p.d;
      const half = (alongX ? p.d : p.w) / 2 + 0.03;
      const len = Math.max(p.w, p.d);
      for (const s of [-1, 1]) {
        const x = alongX ? p.x : p.x + s * half, z = alongX ? p.z + s * half : p.z;
        const ry = alongX ? (s > 0 ? 0 : Math.PI) : (s > 0 ? Math.PI / 2 : -Math.PI / 2);
        this.addSign(p.label, { bg: '#111', fg: '#fff' }, x, p.h * 0.7, z, len * 0.8, len * 0.2, ry);
      }
    }
  }

  prop_roof(p) {
    this.addBox(p.x, p.y, p.z, p.w, 0.35, p.d, lam(0x5a5a5a, rep(TX.metal('#6a6a6a', 'roof'), p.w / 4, 1)));
    const lightMat = basic(0xfff8e1);
    for (const x of [-9, 0, 9]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(3, 0.06, 0.5), lightMat);
      l.position.set(p.x + x, p.y - 0.05, p.z); this.group.add(l);
    }
    this.pointLight(0xfff1d0, p.x - 6, p.y - 0.8, p.z, 25, 16);
    this.pointLight(0xfff1d0, p.x + 6, p.y - 0.8, p.z, 25, 16);
  }

  prop_carstack(p) {
    const cols = [0x8e2a2a, 0x2a4e8e, 0x5a5a5a, 0x7a6a2a, 0x2a6a4a, 0x6a2a6a, 0x9a9a9a];
    let s = p.seed * 97 + 3;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < p.n; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: cols[Math.floor(r() * cols.length)], metalness: 0.4, roughness: 0.8, map: rep(TX.metal('#aaaaaa', 'crush'), 2, 1) });
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.05, 4.1), mat);
      m.position.set(p.x + (r() - 0.5) * 0.2, 0.53 + i * 1.08, p.z + (r() - 0.5) * 0.25);
      m.rotation.set((r() - 0.5) * 0.06, (r() - 0.5) * 0.2, (r() - 0.5) * 0.06);
      m.castShadow = m.receiveShadow = true; this.group.add(m);
    }
    this.colliders.push(box(p.x - 1.15, 0, p.z - 2.15, p.x + 1.15, p.n * 1.08, p.z + 2.15, 'prop'));
  }

  prop_crane(p) {
    const yel = lam(0xf9a825, null);
    this.addBox(p.x, 0, p.z, 1.2, 20, 1.2, yel);
    this.addBox(p.x - 6, 19, p.z, 16, 0.8, 0.8, yel, { collide: false });
    this.addBox(p.x - 12, 0, p.z, 0.05, 19, 0.05, lam(0x222222, null), { collide: false });
    this.addBox(p.x - 12, 3, p.z, 2, 1.2, 2, lam(0x424242, null), { collide: false });
  }

  prop_trailer(p) {
    this.addBox(p.x, 0, p.z, 8, 3, 3.2, lam(0xeeeeee, rep(TX.metal('#e8e8e8', 'trail'), 3, 1)));
    this.addSign(p.label, { bg: '#1b5e20', fg: '#fff' }, p.x, 2.3, p.z + 1.63, 3, 0.75, 0);
  }

  prop_billboard(p) {
    const ry = (p.rot || 0) * Math.PI / 2;
    const g = new THREE.Group();
    const post = lam(0x333333, null);
    for (const s of [-3, 3]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 0.3), post); m.position.set(s, 3, -0.3); g.add(m);
    }
    const board = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.2), basic(0xffffff, TX.sign(p.text, '#111', '#ffb300', { sub: p.sub, border: '#ffb300' })));
    board.position.set(0, 7.2, 0); g.add(board);
    g.position.set(p.x, 0, p.z); g.rotation.y = ry;
    this.group.add(g);
  }

  // Merge static meshes that share a material into one draw call each.
  mergeStatic() {
    const skip = new Set(this.animated.map((a) => a.mesh));
    const buckets = new Map();
    this.group.updateMatrixWorld(true);
    this.group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || skip.has(o)) return;
      const g = o.geometry;
      if (!g.attributes.position || !g.attributes.normal || !g.attributes.uv) return;
      const key = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(o);
    });
    const nm = new THREE.Matrix3();
    const v = new THREE.Vector3();
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      let nv = 0, ni = 0;
      for (const o of list) { nv += o.geometry.attributes.position.count; ni += o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count; }
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
      const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      let vo = 0, io = 0;
      for (const o of list) {
        const g = o.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
        nm.getNormalMatrix(o.matrixWorld);
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld);
          pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
          v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
          nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z;
          uv[(vo + i) * 2] = U.getX(i); uv[(vo + i) * 2 + 1] = U.getY(i);
        }
        if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
        else for (let i = 0; i < P.count; i++) idx[io++] = i + vo;
        vo += P.count;
        o.parent.remove(o);
        g.dispose();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, list[0].material);
      m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow;
      m.renderOrder = list[0].renderOrder;
      this.group.add(m);
    }
  }

  // ---------- queries ----------
  buildBuckets() {
    this.bucketSize = 8;
    this.bw = Math.ceil((this.maxX - this.minX + 4) / this.bucketSize);
    this.bh = Math.ceil((this.maxZ - this.minZ + 4) / this.bucketSize);
    this.buckets = Array.from({ length: this.bw * this.bh }, () => []);
    for (const c of this.colliders) {
      const i0 = this.bx(c.minX), i1 = this.bx(c.maxX), j0 = this.bz(c.minZ), j1 = this.bz(c.maxZ);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) this.buckets[j * this.bw + i].push(c);
    }
  }
  bx(x) { return Math.max(0, Math.min(this.bw - 1, Math.floor((x - this.minX + 2) / this.bucketSize))); }
  bz(z) { return Math.max(0, Math.min(this.bh - 1, Math.floor((z - this.minZ + 2) / this.bucketSize))); }

  near(x, z, r) {
    const out = [];
    const i0 = this.bx(x - r), i1 = this.bx(x + r), j0 = this.bz(z - r), j1 = this.bz(z + r);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      for (const c of this.buckets[j * this.bw + i]) if (!out.includes(c)) out.push(c);
    }
    return out;
  }

  // Raycast against world geometry. Fences don't stop bullets.
  raycast(ox, oy, oz, dx, dy, dz, maxT, solidFences = false) {
    let best = maxT, hit = null;
    for (const c of this.colliders) {
      if (!solidFences && c.tag === 'fence') continue;
      const t = rayBox(ox, oy, oz, dx, dy, dz, c, best);
      if (t < best) { best = t; hit = c; }
    }
    // floor & ceiling
    if (dy < 0) { const t = -oy / dy; if (t < best) { best = t; hit = 'floor'; } }
    if (dy > 0 && this.indoor) { const t = (this.ceiling - oy) / dy; if (t < best) { best = t; hit = 'ceiling'; } }
    return { t: best, hit };
  }

  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    return this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len).hit === null;
  }

  groundAt(x, z, r, feetY) {
    let g = 0;
    for (const c of this.near(x, z, r + 1)) {
      if (x + r <= c.minX || x - r >= c.maxX || z + r <= c.minZ || z - r >= c.maxZ) continue;
      if (c.maxY <= feetY + 0.55 && c.maxY > g) g = c.maxY;
    }
    return g;
  }

  // Slide a soldier-sized box (half-width r, height h) by (dx, dz).
  move(pos, r, h, dx, dz) {
    const feet = pos.y;
    const blocks = (c) => c.maxY > feet + 0.55 && c.minY < feet + h;
    pos.x += dx;
    for (const c of this.near(pos.x, pos.z, r + 2)) {
      if (!blocks(c)) continue;
      if (pos.x + r > c.minX && pos.x - r < c.maxX && pos.z + r > c.minZ && pos.z - r < c.maxZ) {
        if (dx > 0) pos.x = c.minX - r - 0.001; else if (dx < 0) pos.x = c.maxX + r + 0.001;
        else { pos.x = (pos.x < (c.minX + c.maxX) / 2) ? c.minX - r - 0.001 : c.maxX + r + 0.001; }
      }
    }
    pos.z += dz;
    for (const c of this.near(pos.x, pos.z, r + 2)) {
      if (!blocks(c)) continue;
      if (pos.x + r > c.minX && pos.x - r < c.maxX && pos.z + r > c.minZ && pos.z - r < c.maxZ) {
        if (dz > 0) pos.z = c.minZ - r - 0.001; else if (dz < 0) pos.z = c.maxZ + r + 0.001;
        else { pos.z = (pos.z < (c.minZ + c.maxZ) / 2) ? c.minZ - r - 0.001 : c.maxZ + r + 0.001; }
      }
    }
    pos.x = Math.max(this.minX + r, Math.min(this.maxX - r, pos.x));
    pos.z = Math.max(this.minZ + r, Math.min(this.maxZ - r, pos.z));
  }

  // Head bump check for jumping under things.
  ceilingAt(x, z, r, feetY) {
    let c0 = this.ceiling;
    for (const c of this.near(x, z, r + 1)) {
      if (x + r <= c.minX || x - r >= c.maxX || z + r <= c.minZ || z - r >= c.maxZ) continue;
      if (c.minY > feetY + 0.5 && c.minY < c0) c0 = c.minY;
    }
    return c0;
  }

  // ---------- navigation grid ----------
  buildNav() {
    const cs = 1;
    this.cs = cs;
    this.gw = Math.floor((this.maxX - this.minX) / cs);
    this.gh = Math.floor((this.maxZ - this.minZ) / cs);
    this.blocked = new Uint8Array(this.gw * this.gh);
    const inf = 0.5;
    for (const c of this.colliders) {
      if (c.minY > 1.85 || c.maxY < 0.3) continue;
      const i0 = Math.max(0, Math.floor((c.minX - inf - this.minX) / cs));
      const i1 = Math.min(this.gw - 1, Math.floor((c.maxX + inf - this.minX) / cs));
      const j0 = Math.max(0, Math.floor((c.minZ - inf - this.minZ) / cs));
      const j1 = Math.min(this.gh - 1, Math.floor((c.maxZ + inf - this.minZ) / cs));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const cx = this.minX + (i + 0.5) * cs, cz = this.minZ + (j + 0.5) * cs;
        if (cx > c.minX - inf && cx < c.maxX + inf && cz > c.minZ - inf && cz < c.maxZ + inf) this.blocked[j * this.gw + i] = 1;
      }
    }
    for (let i = 0; i < this.gw; i++) { this.blocked[i] = 1; this.blocked[(this.gh - 1) * this.gw + i] = 1; }
    for (let j = 0; j < this.gh; j++) { this.blocked[j * this.gw] = 1; this.blocked[j * this.gw + this.gw - 1] = 1; }
  }

  cellOf(x, z) {
    return [Math.max(0, Math.min(this.gw - 1, Math.floor((x - this.minX) / this.cs))), Math.max(0, Math.min(this.gh - 1, Math.floor((z - this.minZ) / this.cs)))];
  }
  cellCenter(i, j) { return [this.minX + (i + 0.5) * this.cs, this.minZ + (j + 0.5) * this.cs]; }
  walkable(i, j) { return i >= 0 && j >= 0 && i < this.gw && j < this.gh && !this.blocked[j * this.gw + i]; }

  nearestWalkable(x, z) {
    const [ci, cj] = this.cellOf(x, z);
    if (this.walkable(ci, cj)) return [ci, cj];
    for (let r = 1; r < 12; r++) {
      for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
        if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
        if (this.walkable(ci + di, cj + dj)) return [ci + di, cj + dj];
      }
    }
    return [ci, cj];
  }

  randomWalkablePoint(cx, cz, radius) {
    for (let k = 0; k < 30; k++) {
      const x = cx + (Math.random() - 0.5) * 2 * radius, z = cz + (Math.random() - 0.5) * 2 * radius;
      const [i, j] = this.cellOf(x, z);
      if (this.walkable(i, j)) return this.cellCenter(i, j);
    }
    const [i, j] = this.nearestWalkable(cx, cz);
    return this.cellCenter(i, j);
  }

  update(dt, time) {
    for (const a of this.animated) {
      if (a.type === 'neon') {
        const f = Math.sin(time * 23 + a.phase) > 0.97 || (Math.sin(time * 0.7 + a.phase) > 0.995) ? 0.35 : 1;
        a.mesh.material.color.setScalar(f);
      }
    }
  }
}
