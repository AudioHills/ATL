// Builds a playable map (meshes, colliders, nav grid, lighting) from a map definition.
import * as THREE from 'three';
import { RGBELoader } from '../lib/addons/loaders/RGBELoader.js';
import * as TX from './textures.js';
import * as M from './materials.js';
import { box, rayBox } from './physics.js';
import { rbox, geoCache } from './geo.js';
import { PROPS } from './props.js';

function basic(color, map, extra = {}) {
  return new THREE.MeshBasicMaterial({ color, map: map || null, ...extra });
}
const envCache = new Map();

export class World {
  constructor(scene, def, opts = {}) {
    this.scene = scene;
    this.def = def;
    this.renderer = opts.renderer;
    this.quality = opts.quality || 'high';
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];
    this.animated = [];
    this.lightBudget = { low: 2, medium: 6, high: 10 }[this.quality];
    const [x0, x1, z0, z1] = def.bounds;
    this.minX = x0; this.maxX = x1; this.minZ = z0; this.maxZ = z1;
    this.ceiling = def.ceiling || 60;
    this.indoor = !!def.indoor;
    this.th = def.theme;
    this.night = !!def.theme.stars;
    M.configure?.({ quality: this.quality, wet: !!def.theme.wet, night: this.night, indoor: this.indoor });
    this.buildEnvironment();
    this.buildGround();
    this.buildBounds();
    for (const p of def.props) this.buildProp(p);
    this.buildDetails();
    this.mergeStatic();
    this.buildNav();
    this.buildBuckets();
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry && !geoCache.has(o.geometry)) o.geometry.dispose(); });
    if (this.sky) this.scene.remove(this.sky);
    for (const l of this.envLights) this.scene.remove(l);
    this.scene.environment = null;
    this.disposed = true;
  }

  // ---------- environment ----------
  buildEnvironment() {
    const th = this.th;
    this.scene.background = new THREE.Color(th.skyBot);
    this.scene.fog = new THREE.FogExp2(th.fog, th.fogDensity ?? (this.indoor ? 0.012 : 0.009));
    this.envLights = [];
    const hemi = new THREE.HemisphereLight(th.hemiTop, th.hemiBot, th.hemiI * 0.6);
    this.scene.add(hemi); this.envLights.push(hemi);
    const sun = new THREE.DirectionalLight(th.sun, th.sunI * 1.3);
    const sd = new THREE.Vector3(...th.sunDir).normalize();
    sun.position.copy(sd.multiplyScalar(110));
    sun.castShadow = this.quality !== 'low';
    const ext = Math.max(this.maxX - this.minX, this.maxZ - this.minZ) * 0.62;
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 260 });
    const ms = this.quality === 'high' ? 4096 : 2048;
    sun.shadow.mapSize.set(ms, ms);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target); this.envLights.push(sun, sun.target);
    this.sun = sun;

    if (!this.indoor) this.buildSky();
    this.buildEnvMap();
  }

  buildSky() {
    const th = this.th;
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(th.skyTop) }, bot: { value: new THREE.Color(th.skyBot) },
        cloud: { value: new THREE.Color(th.cloud || (this.night ? '#2a2230' : '#d8d4cc')) },
        glow: { value: new THREE.Color(th.lamps) }, night: { value: this.night ? 1 : 0 },
        cover: { value: th.clouds ?? 0.5 }, sunDir: { value: new THREE.Vector3(...th.sunDir).normalize() },
        sunCol: { value: new THREE.Color(th.sun) }, time: { value: 0 },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform vec3 top, bot, cloud, glow, sunCol, sunDir; uniform float night, cover, time; varying vec3 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<6;i++){ v+=a*n(p); p*=2.03; a*=0.5; } return v; }
        void main(){
          vec3 d = normalize(vP);
          float hgt = clamp(d.y*1.4+0.12, 0.0, 1.0);
          vec3 col = mix(bot, top, pow(hgt, 0.8));
          // sun / moon disc + halo
          float sd = max(dot(d, sunDir), 0.0);
          col += sunCol * (pow(sd, 900.0) * (night > 0.5 ? 1.2 : 6.0) + pow(sd, 12.0) * (night > 0.5 ? 0.05 : 0.25));
          // clouds projected on a dome
          if (d.y > 0.0) {
            vec2 uv = d.xz / (d.y + 0.15) * 1.6 + vec2(time*0.004, time*0.002);
            float c = fbm(uv);
            c = smoothstep(1.0 - cover, 1.0 - cover + 0.35, c);
            float shade = fbm(uv * 1.7 + 3.1);
            vec3 cc = cloud * (0.75 + 0.35 * shade);
            if (night > 0.5) cc += glow * 0.18 * (1.0 - hgt);
            else cc += sunCol * 0.25 * pow(sd, 4.0);
            col = mix(col, cc, c * smoothstep(0.0, 0.18, d.y));
          }
          // city light pollution on the horizon at night
          col += glow * night * 0.22 * exp(-abs(d.y) * 9.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.skyMat = skyMat;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), skyMat);
    sky.renderOrder = -10;
    this.sky = new THREE.Group();
    this.sky.add(sky);
    if (this.th.stars) {
      const pts = [];
      for (let i = 0; i < 900; i++) {
        const u = Math.random() * Math.PI * 2, v = Math.random() * 0.5 + 0.1;
        pts.push(Math.cos(u) * Math.cos(v) * 420, Math.sin(v) * 420, Math.sin(u) * Math.cos(v) * 420);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.sky.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 })));
    }
    if (this.th.skyline) {
      const mat = new THREE.MeshBasicMaterial({ map: TX.skyline(), transparent: true, fog: false, side: THREE.BackSide, depthWrite: false, color: this.night ? 0xffffff : 0x8a96a6 });
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(300, 300, 80, 64, 1, true), mat);
      cyl.position.y = 22;
      this.sky.add(cyl);
    }
    this.scene.add(this.sky);
  }

  // Reflections: real HDR skies for day maps, a generated city-at-night or station
  // environment for the others so wet streets and polished tile pick up colored light.
  buildEnvMap() {
    const r = this.renderer;
    if (!r || this.quality === 'low') return;
    const kind = this.th.env;
    if (envCache.has(this.def.id)) { this.scene.environment = envCache.get(this.def.id); return; }
    const pmrem = new THREE.PMREMGenerator(r);
    if (kind && kind.endsWith('.hdr')) {
      new RGBELoader().load(`assets/hdr/${kind}`, (hdr) => {
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        const rt = pmrem.fromEquirectangular(hdr).texture;
        envCache.set(this.def.id, rt);
        hdr.dispose(); pmrem.dispose();
        if (!this.disposed) this.scene.environment = rt;
      });
      return;
    }
    const es = new THREE.Scene();
    if (this.indoor) {
      es.background = new THREE.Color(0x24262a);
      const room = new THREE.Mesh(new THREE.BoxGeometry(60, 10, 120), new THREE.MeshBasicMaterial({ color: 0x3a3c40, side: THREE.BackSide }));
      room.position.y = 4; es.add(room);
      for (let z = -50; z < 50; z += 9) for (const x of [-14, 0, 14]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf4f8ff).multiplyScalar(6) }));
        p.position.set(x, 8.9, z); es.add(p);
      }
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(60, 0.6, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff7a20).multiplyScalar(2) }));
      stripe.position.set(0, 2, -50); es.add(stripe);
    } else {
      es.background = new THREE.Color(this.th.skyBot).multiplyScalar(0.6);
      const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 16, 8), new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: this.skyMat.uniforms, vertexShader: this.skyMat.vertexShader, fragmentShader: this.skyMat.fragmentShader }));
      es.add(sky);
      // a ring of lit windows, neon and street lamps around the viewer
      const cols = [0xffc870, 0xffb36b, 0xffd9a0, 0x9fd0ff, 0xffb36b, 0xffe08a, 0xff6a6a, 0x7fe3ff];
      for (let i = 0; i < 90; i++) {
        const a = Math.random() * Math.PI * 2, d = 25 + Math.random() * 30;
        const c = new THREE.Color(cols[i % cols.length]).multiplyScalar(1 + Math.random() * 2.5);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8 + Math.random() * 3, 0.5 + Math.random() * 1.5), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
        m.position.set(Math.cos(a) * d, 1 + Math.random() * 14, Math.sin(a) * d); m.lookAt(0, m.position.y, 0); es.add(m);
      }
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: 0x0c0c10 }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -1; es.add(ground);
    }
    const rt = pmrem.fromScene(es, 0.02).texture;
    pmrem.dispose();
    envCache.set(this.def.id, rt);
    this.scene.environment = rt;
  }

  buildGround() {
    const th = this.th;
    const wet = !!th.wet;
    const w = this.maxX - this.minX + 60, d = this.maxZ - this.minZ + 60;
    const cx = (this.minX + this.maxX) / 2, cz = (this.minZ + this.maxZ) / 2;
    const sets = { asphalt: () => M.asphaltSet(wet), dirt: () => M.dirtSet(), tile: () => M.tileSet('#bdb7aa', 48), grass: () => M.grassSet() };
    const set = (sets[th.ground] || sets.asphalt)();
    const scale = th.ground === 'tile' ? 4 : 10;
    const groundMat = M.std({ set, rx: w / scale, ry: d / scale, normal: 1, envI: th.ground === 'tile' ? 0.9 : 1 });
    if (th.ground === 'tile') { groundMat.roughnessMap = null; groundMat.roughness = 0.25; }
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, d), groundMat);
    g.rotation.x = -Math.PI / 2; g.position.set(cx, 0, cz); g.receiveShadow = true;
    this.group.add(g);
    this.sidewalks = [];
    for (const p of this.def.patches || []) {
      let mat, raised = 0;
      switch (p.tex) {
        case 'road': mat = M.std({ set: M.roadSet(wet), rx: 1, ry: p.d / 24 }); break;
        case 'sidewalk': mat = M.std({ set: M.sidewalkSet(), rx: p.w / 3, ry: p.d / 3 }); raised = p.y ? 0.15 : 0; break;
        case 'dirt': mat = M.std({ set: M.dirtSet(), rx: p.w / 10, ry: p.d / 10 }); break;
        case 'grass': mat = M.std({ set: M.grassSet(), rx: p.w / 7, ry: p.d / 7 }); break;
        case 'court': mat = M.std({ set: M.courtSet(), rx: 1, ry: 1 }); break;
        case 'concrete': mat = M.std({ set: M.concreteSet('#8a8780', 'floor'), rx: p.w / 5, ry: p.d / 5 }); break;
        case 'asphaltp': mat = M.std({ set: M.asphaltSet(wet), rx: p.w / 10, ry: p.d / 10 }); break;
        case 'track': mat = M.std({ set: M.dirtSet(), rx: p.w / 4, ry: p.d / 4, color: 0x6a6a6a }); break;
        default: mat = M.std({ set: M.concreteSet() }); break;
      }
      if (raised) {
        // real curb: a raised slab with a concrete lip
        const curb = M.std({ set: M.concreteSet('#a29e96', 'curb'), rx: p.d / 4, ry: 0.1 });
        const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, raised, p.d), [curb, curb, mat, curb, curb, curb]);
        m.position.set(p.x, raised / 2, p.z); m.receiveShadow = true; m.castShadow = false;
        this.group.add(m);
        this.colliders.push(box(p.x - p.w / 2, 0, p.z - p.d / 2, p.x + p.w / 2, raised, p.z + p.d / 2, 'curb'));
        this.sidewalks.push(p);
        continue;
      }
      const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), mat);
      m.rotation.x = -Math.PI / 2; m.position.set(p.x, p.y ?? 0.012, p.z); m.receiveShadow = true;
      this.group.add(m);
      if (p.tex === 'track') {
        const railMat = M.std({ color: 0x8a8a8a, metal: 0.9, rough: 0.35 });
        for (const off of [-0.75, 0.75]) {
          const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, p.d), railMat);
          r.position.set(p.x + off, 0.08, p.z); r.castShadow = true; this.group.add(r);
        }
        const tieMat = M.std({ set: M.woodSet('#3e2c1e', 'tie'), rough: 0.9 });
        const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.1, 0.24), tieMat, Math.floor(p.d / 0.7));
        const mtx = new THREE.Matrix4();
        for (let i = 0; i < ties.count; i++) { mtx.makeTranslation(p.x, 0.05, p.z - p.d / 2 + i * 0.7); ties.setMatrixAt(i, mtx); }
        ties.receiveShadow = true;
        this.group.add(ties);
      }
    }
    if (this.indoor) {
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.std({ set: M.concreteSet('#7d8086', 'ceil'), rx: w / 6, ry: d / 6 }));
      ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, this.ceiling, cz);
      this.group.add(ceil);
      const panel = M.std({ color: 0x222222, emissive: 0xf2f7ff, emissiveIntensity: 3 });
      const housing = M.std({ color: 0x9a9da2, metal: 0.6, rough: 0.4 });
      for (let z = this.minZ + 6; z < this.maxZ - 2; z += 9) {
        for (const x of [-25, -14, 0, 14, 25]) {
          this.addBox(x, this.ceiling - 0.14, z, 1.4, 0.12, 4.2, housing, { collide: false, cast: false });
          const pnl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 3.9), panel);
          pnl.rotation.x = Math.PI / 2; pnl.position.set(x, this.ceiling - 0.145, z); this.group.add(pnl);
        }
      }
      for (const [x, z] of [[0, -40], [0, -13], [0, 13], [0, 40], [-25, -20], [25, 20], [-14, 30], [14, -30]]) {
        if (this.lightBudget-- <= 0) break;
        const l = new THREE.PointLight(0xe8f2ff, 60, 30, 1.6);
        l.position.set(x, this.ceiling - 0.7, z); this.group.add(l);
      }
    }
  }

  buildBounds() {
    const H = this.indoor ? this.ceiling : 6.5;
    const t = 0.8;
    const sides = [
      [this.minX - t / 2, (this.minZ + this.maxZ) / 2, t, this.maxZ - this.minZ + t * 2],
      [this.maxX + t / 2, (this.minZ + this.maxZ) / 2, t, this.maxZ - this.minZ + t * 2],
      [(this.minX + this.maxX) / 2, this.minZ - t / 2, this.maxX - this.minX, t],
      [(this.minX + this.maxX) / 2, this.maxZ + t / 2, this.maxX - this.minX, t],
    ];
    for (const [x, z, w, d] of sides) {
      const len = Math.max(w, d);
      const mat = this.indoor ? M.std({ set: M.wallTileSet(), rx: len / 5, ry: H / 5, rough: 0.6 }) : M.std({ set: M.brickSet('#6b4a3c'), rx: len / 4, ry: H / 4 });
      this.addBox(x, 0, z, w, H, d, mat, { cast: false });
      if (!this.indoor) {
        // coping on top of the perimeter wall
        this.addBox(x, H, z, w + 0.15, 0.2, d + 0.15, M.std({ set: M.concreteSet('#8d8a85', 'cope'), rx: len / 4, ry: 0.2 }), { collide: false });
      }
    }
    if (!this.indoor) {
      let seed = 100;
      for (let i = 0; i < 12; i++) {
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
  }

  // ---------- helpers ----------
  addBox(x, y, z, w, h, d, mat, o = {}) {
    const geo = o.round ? rbox(w, h, d, o.round) : new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y + h / 2, z);
    if (o.ry) m.rotation.y = o.ry;
    m.castShadow = o.cast !== false; m.receiveShadow = true;
    (o.parent || this.group).add(m);
    if (o.collide !== false) this.colliders.push(box(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, o.tag));
    return m;
  }

  addCyl(x, y, z, r1, r2, h, mat, o = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, o.seg || 14), mat);
    m.position.set(x, y + h / 2, z);
    m.castShadow = o.cast !== false; m.receiveShadow = true;
    (o.parent || this.group).add(m);
    if (o.collide) { const r = Math.max(r1, r2); this.colliders.push(box(x - r, y, z - r, x + r, y + h, z + r, o.tag)); }
    return m;
  }

  addDecal(tex, x, y, z, w, h, rotY, mat) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat || new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.05, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.7 }));
    m.position.set(x, y, z); m.rotation.y = rotY;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  groundDecal(tex, x, z, w, d, rot, opacity = 1, y = 0.02) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, opacity, polygonOffset: true, polygonOffsetFactor: -3, roughness: 0.9 }));
    m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(x, y, z); m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  dims(rot, w, l) { return rot % 2 ? [l, w] : [w, l]; }

  addSign(text, opts, x, y, z, w, h, rotY) {
    const tex = TX.sign(text, opts.bg, opts.fg, opts);
    const lit = opts.glow || opts.lit;
    const mat = lit
      ? new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: opts.glow ? 2.2 : 0.9, roughness: 0.4 })
      : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.rotation.y = rotY;
    this.group.add(m);
    // box backing so the sign has depth
    const back = new THREE.Mesh(rbox(w + 0.12, h + 0.12, 0.14, 0.03), M.std({ color: 0x1a1a1c, metal: 0.5, rough: 0.5 }));
    back.position.set(x, y, z); back.rotation.y = rotY; back.translateZ(-0.08); back.castShadow = true;
    this.group.add(back);
    if (opts.glow) this.animated.push({ type: 'neon', mesh: m, phase: Math.random() * 10, base: 2.2 });
    return m;
  }

  pointLight(color, x, y, z, intensity = 30, dist = 22) {
    if (this.lightBudget <= 0) return;
    this.lightBudget--;
    const l = new THREE.PointLight(color, intensity, dist, 1.8);
    l.position.set(x, y, z);
    this.group.add(l);
  }

  insideCollider(x, z, pad = 0.6) {
    for (const c of this.colliders) if (c.tag !== 'curb' && x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return true;
    return false;
  }

  // ---------- props ----------
  buildProp(p) {
    const fn = this['prop_' + p.t];
    if (fn) fn.call(this, p);
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
    if (this.skyMat) this.skyMat.uniforms.time.value = time;
    for (const a of this.animated) {
      if (a.type === 'neon') {
        const f = Math.sin(time * 23 + a.phase) > 0.97 || (Math.sin(time * 0.7 + a.phase) > 0.995) ? 0.35 : 1;
        a.mesh.material.emissiveIntensity = a.base * f;
      }
    }
  }
}

Object.assign(World.prototype, PROPS);
