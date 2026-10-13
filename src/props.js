// Map props and street dressing. Each prop_<type>(p) builds meshes + colliders on the World.
import * as THREE from 'three';
import { RoundedBoxGeometry } from '../lib/addons/geometries/RoundedBoxGeometry.js';
import * as TX from './textures.js';
import * as M from './materials.js';
import { box } from './physics.js';
import { rbox } from './geo.js';

export const PROPS = {
    prop_building(p) {
    const seed = Math.floor(Math.abs(p.x * 13 + p.z * 7)) + 1;
    const fs = M.facadeSet(p.color, seed, { brick: p.brick, store: p.store, tag: p.tag, night: this.night });
    const facX = M.std({ set: fs, rx: Math.max(1, Math.round(p.d / 7)), ry: 1, normal: 1.3 });
    const facZ = M.std({ set: fs, rx: Math.max(1, Math.round(p.w / 7)), ry: 1, normal: 1.3 });
    const roof = M.std({ set: M.concreteSet('#4f4d4a', 'roof'), rx: p.w / 6, ry: p.d / 6 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), [facX, facX, roof, roof, facZ, facZ]);
    m.position.set(p.x, p.h / 2, p.z); m.castShadow = true; m.receiveShadow = true;
    this.group.add(m);
    this.colliders.push(box(p.x - p.w / 2, 0, p.z - p.d / 2, p.x + p.w / 2, p.h, p.z + p.d / 2, 'building'));
    const trim = M.std({ set: M.concreteSet('#8a857c', 'trim'), rx: 4, ry: 0.2 });
    const dark = M.std({ color: 0x2a2826, rough: 0.8 });
    // cornice, parapet cap and base plinth
    this.addBox(p.x, p.h - 0.35, p.z, p.w + 0.3, 0.35, p.d + 0.3, trim, { collide: false });
    this.addBox(p.x, p.h, p.z, p.w + 0.05, 0.7, p.d + 0.05, trim, { collide: false });
    this.addBox(p.x, 0, p.z, p.w + 0.12, 0.45, p.d + 0.12, dark, { collide: false });
    // downspouts at two corners
    const pipe = M.std({ color: 0x5b5f63, metal: 0.7, rough: 0.5 });
    for (const [sx, sz] of [[1, 1], [-1, -1]]) {
      this.addCyl(p.x + sx * (p.w / 2 + 0.1), 0, p.z + sz * (p.d / 2 - 0.4), 0.06, 0.06, p.h, pipe, { cast: true });
    }
    // rooftop clutter
    const ac = M.std({ set: M.metalSet('#a8a8a4'), rough: 0.6, metal: 0.4 });
    this.addBox(p.x + p.w * 0.2, p.h, p.z - p.d * 0.15, 2, 1.2, 1.6, ac, { collide: false, round: 0.05 });
    this.addBox(p.x - p.w * 0.25, p.h, p.z + p.d * 0.2, 1.2, 0.9, 1.2, ac, { collide: false, round: 0.05 });
    if (p.h >= 8 && seed % 2) {
      // water tank on stilts
      const wood = M.std({ set: M.woodSet('#5a4330', 'tank') });
      const tx = p.x - p.w * 0.2, tz = p.z - p.d * 0.2;
      for (const [ox, oz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) this.addCyl(tx + ox, p.h, tz + oz, 0.06, 0.06, 1.6, pipe, { collide: false });
      this.addCyl(tx, p.h + 1.6, tz, 1.2, 1.2, 2.2, wood, { collide: false, seg: 20 });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.8, 20), dark); cone.position.set(tx, p.h + 4.2, tz); cone.castShadow = true; this.group.add(cone);
    }
    // fire escape on the side without the sign, for taller brick buildings
    if (p.brick && p.h >= 9) {
      const face = p.sign?.face === 'e' ? 'w' : 'e';
      this.fireEscape(p, face);
    }
    if (p.sign) {
      const s = p.sign;
      const span = s.face === 'e' || s.face === 'w' ? p.d : p.w;
      const sw = Math.min(span * 0.8, 10.5), sh = sw / 4;
      const y = Math.min(p.h - sh / 2 - 0.6, 3.4 + sh / 2);
      const off = 0.2;
      let x = p.x, z = p.z, ry = 0;
      if (s.face === 'e') { x = p.x + p.w / 2 + off; ry = Math.PI / 2; }
      if (s.face === 'w') { x = p.x - p.w / 2 - off; ry = -Math.PI / 2; }
      if (s.face === 'n') { z = p.z + p.d / 2 + off; ry = 0; }
      if (s.face === 's') { z = p.z - p.d / 2 - off; ry = Math.PI; }
      this.addSign(s.text, { ...s, lit: true }, x, y, z, sw, sh, ry);
      // fabric awning over the storefront
      const dir = { e: [1, 0], w: [-1, 0], n: [0, 1], s: [0, -1] }[s.face];
      const awMat = M.std({ set: M.fabricSet(s.bg, 'cotton'), rx: 4, ry: 1, rough: 0.9 });
      const aw = new THREE.Mesh(rbox(dir[0] ? 1.6 : span * 0.65, 0.08, dir[0] ? span * 0.65 : 1.6, 0.03), awMat);
      aw.position.set(x + dir[0] * 0.75, 2.85, z + dir[1] * 0.75);
      aw.rotation.set(dir[1] * 0.32, 0, -dir[0] * 0.32);
      aw.castShadow = true;
      this.group.add(aw);
      if (s.glow) this.pointLight(s.fg, x + dir[0] * 2.2, y - 0.5, z + dir[1] * 2.2, 25, 14);
      // warm light spilling from the store
      if (p.store) this.pointLight(0xffd9a0, x + dir[0] * 1.5, 2.2, z + dir[1] * 1.5, 14, 10);
    }
  },

    fireEscape(p, face) {
    const iron = M.std({ color: 0x1d1f22, metal: 0.8, rough: 0.55 });
    const dir = face === 'e' ? 1 : -1;
    const x0 = p.x + dir * (p.w / 2 + 0.7);
    const zc = p.z;
    const len = Math.min(p.d * 0.5, 6);
    for (let fy = 3.2; fy < p.h - 1; fy += 3) {
      this.addBox(x0, fy, zc, 1.3, 0.06, len, iron, { collide: false });
      // railings
      this.addBox(x0 + dir * 0.62, fy + 1, zc, 0.04, 0.04, len, iron, { collide: false });
      this.addBox(x0 + dir * 0.62, fy + 0.5, zc, 0.03, 0.03, len, iron, { collide: false });
      for (let k = -len / 2; k <= len / 2 + 0.01; k += 0.6) this.addBox(x0 + dir * 0.62, fy, zc + k, 0.03, 1, 0.03, iron, { collide: false, cast: false });
      // stair between landings
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 3.6), iron);
      st.position.set(x0, fy - 1.5, zc); st.rotation.x = 0.85; st.castShadow = true; this.group.add(st);
    }
  },

    // Sedan built from an extruded side profile: real silhouette, clearcoat paint, rims.
  prop_car(p) {
    const donk = !!p.donk;
    const lift = p.lift ? 1.9 : 0;
    const g = new THREE.Group();
    const paint = new THREE.MeshPhysicalMaterial({
      color: p.wreck ? new THREE.Color(p.color).multiplyScalar(0.45) : p.color,
      metalness: p.wreck ? 0.2 : 0.55, roughness: p.wreck ? 0.75 : 0.32,
      clearcoat: p.wreck ? 0 : 1, clearcoatRoughness: 0.08,
      map: p.wreck ? M.metalSet('#b0b0b0', 'wreck').map : null,
    });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a0e12, metalness: 0.2, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.88 });
    const chrome = M.std({ color: 0xe8e8e8, metal: 1, rough: 0.12 });
    const blackTrim = M.std({ color: 0x111214, rough: 0.6 });
    const tireM = M.std({ color: 0x141414, rough: 0.95 });
    const wheelR = donk ? 0.58 : 0.34;
    const lifts = donk ? 0.32 : 0;
    const W = 1.82;
    // lower body profile (z forward = -), drawn in (z, y)
    // outline runs along the sill from rear to front, arching over each wheel
    const body = new THREE.Shape();
    const AR = wheelR + 0.08;
    body.moveTo(2.3, 0.32);
    body.lineTo(1.45 + AR, 0.32); body.absarc(1.45, 0.32, AR, 0, Math.PI, false);
    body.lineTo(-1.45 + AR, 0.32); body.absarc(-1.45, 0.32, AR, 0, Math.PI, false);
    body.lineTo(-2.3, 0.32);
    for (const [a, b] of [[-2.38, 0.6], [-2.2, 0.86], [-1.15, 0.98], [1.3, 0.98], [2.22, 0.92], [2.36, 0.62]]) body.lineTo(a, b);
    body.closePath();
    const bodyGeo = new THREE.ExtrudeGeometry(body, { depth: W, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 16 });
    bodyGeo.translate(0, 0, -W / 2); bodyGeo.rotateY(-Math.PI / 2);
    const bm = new THREE.Mesh(bodyGeo, paint); g.add(bm);
    // cabin: glass greenhouse + roof + pillars
    const cab = new THREE.Shape();
    const cp = [[1.25, 0.98], [0.55, 1.42], [-0.55, 1.45], [-1.1, 0.98]];
    cab.moveTo(cp[0][0], cp[0][1]); for (const [a, b] of cp.slice(1)) cab.lineTo(a, b); cab.closePath();
    const cabGeo = new THREE.ExtrudeGeometry(cab, { depth: W - 0.22, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
    cabGeo.translate(0, 0, -(W - 0.22) / 2); cabGeo.rotateY(-Math.PI / 2);
    g.add(new THREE.Mesh(cabGeo, glass));
    const roof = new THREE.Mesh(rbox(W - 0.16, 0.06, 1.15, 0.03), paint); roof.position.set(0, 1.45, 0); g.add(roof);
    for (const sx of [-1, 1]) {
      const bp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 0.12), paint); bp.position.set(sx * (W / 2 - 0.12), 1.2, 0.05); g.add(bp);
      const mir = new THREE.Mesh(rbox(0.16, 0.1, 0.12, 0.03), paint); mir.position.set(sx * (W / 2 + 0.06), 1.02, -0.95); g.add(mir);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.16), chrome); handle.position.set(sx * (W / 2 + 0.04), 0.86, sx < 0 ? 0.2 : -0.5); g.add(handle);
    }
    // bumpers, grille, lights, plate
    const fb = new THREE.Mesh(rbox(W + 0.04, 0.22, 0.2, 0.06), donk ? chrome : blackTrim); fb.position.set(0, 0.42, -2.36); g.add(fb);
    const rb = new THREE.Mesh(rbox(W + 0.04, 0.22, 0.2, 0.06), donk ? chrome : blackTrim); rb.position.set(0, 0.42, 2.34); g.add(rb);
    const grille = new THREE.Mesh(rbox(0.9, 0.2, 0.05, 0.02), donk ? chrome : blackTrim); grille.position.set(0, 0.68, -2.4); g.add(grille);
    const hl = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: p.wreck ? 0x000000 : 0xfff2d0, emissiveIntensity: this.night ? 2.5 : 0.6, roughness: 0.1 });
    const tl = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: p.wreck ? 0x000000 : 0xff1010, emissiveIntensity: this.night ? 2 : 0.5, roughness: 0.2 });
    for (const sx of [-0.66, 0.66]) {
      const a = new THREE.Mesh(rbox(0.38, 0.14, 0.06, 0.03), hl); a.position.set(sx, 0.72, -2.4); g.add(a);
      const b = new THREE.Mesh(rbox(0.36, 0.12, 0.06, 0.03), tl); b.position.set(sx, 0.78, 2.37); g.add(b);
    }
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.16), new THREE.MeshStandardMaterial({ map: TX.sign('GA ' + (1000 + Math.floor(Math.random() * 8999)), '#f5f5f5', '#1a237e', { border: '#1a237e' }), roughness: 0.5 }));
    plate.position.set(0, 0.45, 2.47); g.add(plate);
    // wheels: tire + rim + spokes
    if (!p.wreck || Math.random() < 0.6) {
      const tireGeo = new THREE.TorusGeometry(wheelR - 0.08, 0.1 + (donk ? 0.0 : 0.02), 10, 24);
      const rimGeo = new THREE.CylinderGeometry(wheelR - 0.12, wheelR - 0.12, 0.18, 24);
      for (const [wx, wz] of [[-0.86, 1.45], [0.86, 1.45], [-0.86, -1.45], [0.86, -1.45]]) {
        const wg = new THREE.Group();
        const t = new THREE.Mesh(tireGeo, tireM); t.rotation.y = Math.PI / 2; wg.add(t);
        const r = new THREE.Mesh(rimGeo, donk ? chrome : M.std({ color: 0x8a8d92, metal: 0.9, rough: 0.3 })); r.rotation.z = Math.PI / 2; wg.add(r);
        for (let k = 0; k < (donk ? 6 : 5); k++) {
          const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, (wheelR - 0.14) * 2, 0.06), donk ? chrome : blackTrim);
          sp.rotation.x = k / (donk ? 6 : 5) * Math.PI; sp.position.x = Math.sign(wx) * 0.1; wg.add(sp);
        }
        wg.position.set(wx, wheelR, wz);
        g.add(wg);
      }
    }
    // the body sits on the wheels
    for (const c of g.children) if (!(c.isGroup)) c.position.y += lifts;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(p.x, lift, p.z);
    g.rotation.y = (p.rot % 2 ? Math.PI / 2 : 0) + (p.wreck ? (Math.random() - 0.5) * 0.15 : 0);
    if (p.wreck) g.rotation.z = (Math.random() - 0.5) * 0.05;
    this.group.add(g);
    // soft contact shadow
    const [sw, sl] = this.dims(p.rot, 2.6, 5.4);
    this.groundDecal(M.blobShadow(), p.x, p.z, sw, sl, 0, 0.8, lift + 0.025);
    const [w, l] = this.dims(p.rot, 2.0, 4.8);
    const top = lift + 1.5 + lifts;
    this.colliders.push(box(p.x - w / 2, lift > 0 ? lift + 0.3 : 0, p.z - l / 2, p.x + w / 2, top, p.z + l / 2, 'car'));
    if (lift) {
      const post = M.std({ color: 0xc62828, metal: 0.4, rough: 0.5 });
      for (const sx of [-1.4, 1.4]) this.addBox(p.x + sx, 0, p.z, 0.25, lift + 0.4, 0.25, post);
      const arm = M.std({ color: 0x3c3c3c, metal: 0.7, rough: 0.5 });
      this.addBox(p.x, lift - 0.1, p.z, 2.9, 0.12, 3.6, arm, { collide: false });
    }
  },

    prop_bus(p) {
    const g = new THREE.Group();
    const white = new THREE.MeshPhysicalMaterial({ color: 0xeeeeee, metalness: 0.3, roughness: 0.35, clearcoat: 0.8 });
    const body = new THREE.Mesh(rbox(2.6, 2.9, 11.5, 0.25), white); body.position.y = 1.75; g.add(body);
    const win = new THREE.Mesh(rbox(2.64, 0.95, 10.4, 0.05), new THREE.MeshPhysicalMaterial({ color: 0x0b1118, roughness: 0.05, clearcoat: 1 })); win.position.y = 2.4; g.add(win);
    const ws = new THREE.Mesh(rbox(2.4, 1.3, 0.1, 0.05), new THREE.MeshPhysicalMaterial({ color: 0x0b1118, roughness: 0.05, clearcoat: 1 })); ws.position.set(0, 2.2, -5.74); g.add(ws);
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.2, 11.45), M.std({ color: 0xff6f00, rough: 0.4 })); s1.position.y = 1.62; g.add(s1);
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.12, 11.45), M.std({ color: 0x1565c0, rough: 0.4 })); s2.position.y = 1.4; g.add(s2);
    for (const z of [-3.8, 3.8]) for (const x of [-1.2, 1.2]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.14, 10, 20), M.std({ color: 0x141414, rough: 0.95 }));
      w.rotation.y = Math.PI / 2; w.position.set(x, 0.52, z); g.add(w);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16), M.std({ color: 0xbbbbbb, metal: 1, rough: 0.3 }));
      r.rotation.z = Math.PI / 2; r.position.set(x, 0.52, z); g.add(r);
    }
    const dest = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.3), new THREE.MeshStandardMaterial({ map: TX.sign('5 POINTS', '#000', '#ffb300', { glow: true }), emissive: 0xffffff, emissiveMap: TX.sign('5 POINTS', '#000', '#ffb300', { glow: true }), emissiveIntensity: 1.5 }));
    dest.position.set(0, 3.0, -5.81); dest.rotation.y = Math.PI; g.add(dest);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(p.x, 0, p.z);
    this.group.add(g);
    this.addSign('MARTA', { bg: '#1565c0', fg: '#fff' }, p.x + 1.38, 2.95, p.z, 3, 0.75, Math.PI / 2);
    this.addSign('MARTA', { bg: '#1565c0', fg: '#fff' }, p.x - 1.38, 2.95, p.z, 3, 0.75, -Math.PI / 2);
    this.groundDecal(M.blobShadow(), p.x, p.z, 3.4, 12.5, 0, 0.8);
    this.colliders.push(box(p.x - 1.3, 0, p.z - 5.75, p.x + 1.3, 3.2, p.z + 5.75, 'car'));
  },

    // Jersey barrier: real trapezoid cross-section
  prop_barrier(p) {
    const sh = new THREE.Shape();
    sh.moveTo(-0.32, 0); sh.lineTo(0.32, 0); sh.lineTo(0.3, 0.08); sh.lineTo(0.16, 0.32); sh.lineTo(0.1, 1.05); sh.lineTo(-0.1, 1.05); sh.lineTo(-0.16, 0.32); sh.lineTo(-0.3, 0.08); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 3.2, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
    geo.translate(0, 0, -1.6);
    const m = new THREE.Mesh(geo, M.std({ set: M.concreteSet('#b8b4ac', 'jersey'), rx: 1, ry: 0.5 }));
    m.position.set(p.x, 0, p.z); m.rotation.y = p.rot % 2 ? Math.PI / 2 : 0;
    m.castShadow = m.receiveShadow = true; this.group.add(m);
    const [w, l] = this.dims(p.rot, 0.66, 3.2);
    this.colliders.push(box(p.x - w / 2, 0, p.z - l / 2, p.x + w / 2, 1.05, p.z + l / 2, 'prop'));
  },

    // Cobra-head street light
  prop_lamp(p) {
    const pole = M.std({ color: 0x5c5f63, metal: 0.8, rough: 0.45 });
    const h = p.wall ? 4.5 : 7;
    this.addCyl(p.x, 0, p.z, 0.09, 0.14, h, pole, { collide: !p.wall, tag: 'prop' });
    this.addCyl(p.x, 0, p.z, 0.2, 0.22, 0.5, pole, { collide: false });
    // arm curving out over the road
    const toward = p.x < 0 ? 1 : -1;
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(p.x, h - 0.4, p.z), new THREE.Vector3(p.x, h + 0.3, p.z), new THREE.Vector3(p.x + toward * 1.8, h + 0.2, p.z));
    const arm = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.05, 8), pole); arm.castShadow = true; this.group.add(arm);
    const hx = p.x + toward * 2.1, hy = h + 0.15;
    const head = new THREE.Mesh(rbox(0.8, 0.18, 0.38, 0.08), pole); head.position.set(hx, hy, p.z); this.group.add(head);
    const lensMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(this.th.lamps), emissiveIntensity: this.night ? 6 : 1.5 });
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.28), lensMat);
    lens.rotation.x = Math.PI / 2; lens.position.set(hx, hy - 0.095, p.z); this.group.add(lens);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.smokeSprite(), color: this.th.lamps, transparent: true, opacity: this.night ? 0.35 : 0.1, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(2.4, 2.4, 1); glow.position.set(hx, hy - 0.25, p.z); this.group.add(glow);
    this.pointLight(this.th.lamps, hx, hy - 0.4, p.z, this.night ? 220 : 60, 26);
    // light pool on the ground
    if (this.night) {
      const pool = this.groundDecal(TX.smokeSprite(), hx, p.z, 9, 9, 0, 0.18, 0.03);
      pool.material.color = new THREE.Color(this.th.lamps); pool.material.blending = THREE.AdditiveBlending;
    }
  },

    prop_dumpster(p) {
    const [w, l] = this.dims(p.rot, 1.6, 2.3);
    const mat = M.std({ set: M.metalSet('#2c5a33', 'dump'), rough: 0.7, metal: 0.4 });
    this.addBox(p.x, 0.12, p.z, w, 1.25, l, mat, { round: 0.05 });
    const lid = new THREE.Mesh(rbox(w + 0.1, 0.07, l + 0.1, 0.03), M.std({ color: 0x1b1b1b, rough: 0.6 }));
    lid.position.set(p.x, 1.42, p.z); lid.rotation[p.rot % 2 ? 'z' : 'x'] = 0.08; lid.castShadow = true; this.group.add(lid);
    for (const [ox, oz] of [[-0.6, -0.9], [0.6, 0.9], [-0.6, 0.9], [0.6, -0.9]]) {
      const [dx, dz] = p.rot % 2 ? [oz, ox] : [ox, oz];
      this.addCyl(p.x + dx, 0, p.z + dz, 0.08, 0.08, 0.14, M.std({ color: 0x111111 }), { collide: false });
    }
    this.colliders[this.colliders.length - 1].minY = 0;
    this.groundDecal(M.blobShadow(), p.x, p.z, w + 1, l + 1, 0, 0.7);
    // spilled trash bags
    const bag = M.std({ color: 0x111111, rough: 0.25, metal: 0.1 });
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), bag);
      b.scale.set(1, 0.75, 0.9); b.position.set(p.x + (Math.random() - 0.5) * w * 1.6, 0.25, p.z + (p.rot % 2 ? -1 : 1) * (l / 2 + 0.4)); b.castShadow = true;
      this.group.add(b);
    }
  },

    prop_fence(p) {
    const alongX = Math.abs(p.x2 - p.x1) > Math.abs(p.z2 - p.z1);
    const len = alongX ? Math.abs(p.x2 - p.x1) : Math.abs(p.z2 - p.z1);
    const cx = (p.x1 + p.x2) / 2, cz = (p.z1 + p.z2) / 2, H = 2.6;
    const tex = TX.chainlink().clone(); tex.repeat.set(len / 0.5, H / 0.5); tex.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.8, roughness: 0.4 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H - 0.1), mat);
    m.position.set(cx, H / 2, cz); m.rotation.y = alongX ? 0 : Math.PI / 2; m.castShadow = true; this.group.add(m);
    const post = M.std({ color: 0x9a9da0, metal: 0.9, rough: 0.35 });
    for (let i = 0; i <= Math.ceil(len / 3); i++) {
      const t = Math.min(1, i * 3 / len);
      this.addCyl(p.x1 + (p.x2 - p.x1) * t, 0, p.z1 + (p.z2 - p.z1) * t, 0.04, 0.04, H, post, { collide: false });
    }
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 8), post);
    rail.rotation.z = Math.PI / 2; if (!alongX) rail.rotation.set(Math.PI / 2, 0, 0);
    rail.position.set(cx, H - 0.05, cz); this.group.add(rail);
    const w = alongX ? len : 0.15, d = alongX ? 0.15 : len;
    this.colliders.push(box(cx - w / 2, 0, cz - d / 2, cx + w / 2, H, cz + d / 2, 'fence'));
  },

    prop_crates(p) {
    const mat = M.std({ set: M.woodSet('#8a6a42', 'crate'), rough: 0.85 });
    const pallet = M.std({ set: M.woodSet('#6a5236', 'pallet') });
    this.addBox(p.x + 0.65, 0, p.z + 0.1, 2.7, 0.14, 1.4, pallet, { collide: false });
    this.addBox(p.x, 0.14, p.z, 1.3, 1.2, 1.3, mat, { round: 0.02 });
    this.addBox(p.x + 1.35, 0.14, p.z + 0.2, 1.3, 1.2, 1.3, mat, { round: 0.02 });
    this.addBox(p.x + 0.6, 1.34, p.z + 0.1, 1.2, 1.1, 1.2, mat, { round: 0.02 });
    this.addBox(p.x - 0.2, 0, p.z + 1.45, 1.1, 1.0, 1.1, mat, { round: 0.02 });
  },

    prop_wall(p) {
    const len = Math.max(p.w, p.d);
    const set = p.tex === 'walltile' ? M.wallTileSet() : p.tex === 'metal' ? M.metalSet(p.color || '#9e9e9e', 'corrugated') : M.concreteSet('#8f8b84', 'cwall');
    this.addBox(p.x, 0, p.z, p.w, p.h, p.d, M.std({ set, rx: len / (p.tex === 'metal' ? 3 : 4), ry: p.h / 4, metal: p.tex === 'metal' ? 0.5 : 0, rough: p.tex === 'walltile' ? 0.6 : undefined }));
    const alongX = p.w > p.d;
    const half = (alongX ? p.d : p.w) / 2 + 0.03;
    if (p.tex !== 'metal' && p.tex !== 'walltile') {
      this.addBox(p.x, p.h, p.z, p.w + 0.1, 0.12, p.d + 0.1, M.std({ set: M.concreteSet('#8d8a85', 'cope'), rx: len / 4, ry: 0.2 }), { collide: false });
    }
    if (p.graf) {
      for (const s of [-1, 1]) {
        const x = alongX ? p.x : p.x + s * half, z = alongX ? p.z + s * half : p.z;
        const ry = alongX ? (s > 0 ? 0 : Math.PI) : (s > 0 ? Math.PI / 2 : -Math.PI / 2);
        this.addDecal(TX.graffiti(p.graf * 2 + (s > 0 ? 1 : 0)), x, Math.min(p.h * 0.55, 1.6), z, Math.min(len * 0.95, 6), Math.min(p.h * 0.9, 2.6), ry);
      }
    }
    if (p.sign) {
      for (const s of [-1, 1]) {
        const x = alongX ? p.x : p.x + s * (half + 0.1), z = alongX ? p.z + s * (half + 0.1) : p.z;
        const ry = alongX ? (s > 0 ? 0 : Math.PI) : (s > 0 ? Math.PI / 2 : -Math.PI / 2);
        const sw = Math.min(len * 0.6, 10);
        const style = p.tex === 'walltile' ? { bg: '#1b1b1b', fg: '#fff', border: '#ff6f00', lit: true } : { bg: '#263238', fg: '#ffca28' };
        this.addSign(p.sign, style, x, Math.min(p.h - 1, 4.6), z, sw, sw / 4, ry);
      }
    }
  },

    prop_tires(p) {
    const mat = M.std({ color: 0x151515, rough: 0.92 });
    const geo = new THREE.TorusGeometry(0.4, 0.17, 10, 22);
    for (let s = 0; s < 2; s++) {
      const n = 3 + ((p.x + s) & 1);
      for (let i = 0; i < n; i++) {
        const t = new THREE.Mesh(geo, mat);
        t.rotation.set(Math.PI / 2 + (Math.random() - 0.5) * 0.12, 0, Math.random() * 3);
        t.position.set(p.x + s * 1.2 + (Math.random() - 0.5) * 0.08, 0.17 + i * 0.34, p.z + s * 0.3);
        t.castShadow = true; t.receiveShadow = true; this.group.add(t);
      }
      this.colliders.push(box(p.x + s * 1.2 - 0.6, 0, p.z + s * 0.3 - 0.6, p.x + s * 1.2 + 0.6, 0.34 * n, p.z + s * 0.3 + 0.6, 'prop'));
    }
  },

    prop_container(p) {
    const [w, l] = this.dims(p.rot, 2.45, 6.1);
    const mat = M.std({ set: M.metalSet(p.color, 'corrugated'), rx: 4, ry: 1, metal: 0.45, rough: 0.6 });
    const m = this.addBox(p.x, 0, p.z, w, 2.6, l, mat);
    void m;
    // door end with locking bars
    const bar = M.std({ color: 0x777777, metal: 0.9, rough: 0.4 });
    const endZ = p.rot % 2 ? null : p.z + l / 2 + 0.03;
    const endX = p.rot % 2 ? p.x + w / 2 + 0.03 : null;
    for (let k = -0.8; k <= 0.81; k += 0.53) {
      if (endZ !== null) this.addCyl(p.x + k, 0.1, endZ, 0.025, 0.025, 2.4, bar, { collide: false });
      else this.addCyl(endX, 0.1, p.z + k, 0.025, 0.025, 2.4, bar, { collide: false });
    }
    this.addBox(p.x, 2.6, p.z, w + 0.04, 0.08, l + 0.04, M.std({ color: new THREE.Color(p.color).multiplyScalar(0.6), metal: 0.5, rough: 0.6 }), { collide: false });
    this.groundDecal(M.blobShadow(), p.x, p.z, w + 1, l + 1, 0, 0.6);
  },

    prop_tree(p) {
    const bark = M.std({ set: M.woodSet('#4a3626', 'bark'), rough: 0.95 });
    this.addCyl(p.x, 0, p.z, 0.16, 0.26, 3.4, bark, { collide: false });
    this.colliders.push(box(p.x - 0.25, 0, p.z - 0.25, p.x + 0.25, 3.4, p.z + 0.25, 'prop'));
    for (const [a, l, y] of [[0.6, 1.4, 2.6], [2.4, 1.2, 2.9], [4.2, 1.3, 2.4]]) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, l, 6), bark);
      br.position.set(p.x + Math.cos(a) * l * 0.4, y + 0.4, p.z + Math.sin(a) * l * 0.4);
      br.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8); br.castShadow = true; this.group.add(br);
    }
    const tones = [0x2f4f24, 0x3a5c2a, 0x2a4520, 0x46672f];
    for (let i = 0; i < 9; i++) {
      const r = 0.9 + Math.random() * 0.8;
      const geo = new THREE.IcosahedronGeometry(r, 2);
      const pos = geo.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const s = 1 + (Math.random() - 0.5) * 0.28;
        pos.setXYZ(k, pos.getX(k) * s, pos.getY(k) * s * 0.85, pos.getZ(k) * s);
      }
      geo.computeVertexNormals();
      const c = new THREE.Mesh(geo, M.std({ color: tones[i % 4], rough: 0.85, set: M.grassSet(), rx: 0.5, ry: 0.5, normal: 2 }));
      const a = Math.random() * Math.PI * 2, d = Math.random() * 1.3;
      c.position.set(p.x + Math.cos(a) * d, 3.8 + Math.random() * 1.6, p.z + Math.sin(a) * d);
      c.castShadow = true; c.receiveShadow = true; this.group.add(c);
    }
  },

    prop_bench(p) {
    const [w, l] = this.dims(p.rot, 0.6, 2.2);
    const wood = M.std({ set: M.woodSet('#7a5534', 'bench') });
    const iron = M.std({ color: 0x1f2124, metal: 0.8, rough: 0.5 });
    for (let k = -1; k <= 1; k++) {
      const [ox, oz] = p.rot % 2 ? [0, k * 0.18] : [k * 0.18, 0];
      this.addBox(p.x + ox, 0.42, p.z + oz, p.rot % 2 ? l : 0.14, 0.05, p.rot % 2 ? 0.14 : l, wood, { collide: false, round: 0.02 });
    }
    for (const s of [-1, 1]) {
      const [ox, oz] = p.rot % 2 ? [s * (l / 2 - 0.2), 0] : [0, s * (l / 2 - 0.2)];
      this.addBox(p.x + ox, 0, p.z + oz, p.rot % 2 ? 0.06 : w, 0.44, p.rot % 2 ? w : 0.06, iron, { collide: false });
    }
    this.colliders.push(box(p.x - w / 2, 0, p.z - l / 2, p.x + w / 2, 0.5, p.z + l / 2, 'prop'));
  },

    prop_hoop(p) {
    const dir = p.rot === 2 ? -1 : 1;
    const pole = M.std({ color: 0x2e3a42, metal: 0.7, rough: 0.5 });
    this.addCyl(p.x, 0, p.z - dir * 1.2, 0.08, 0.1, 3.4, pole, { collide: true, tag: 'prop' });
    const armC = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5), pole); armC.position.set(p.x, 3.3, p.z - dir * 1.0); this.group.add(armC);
    const bb = new THREE.Mesh(rbox(1.8, 1.05, 0.05, 0.02), M.std({ color: 0xeeeeee, rough: 0.3 }));
    bb.position.set(p.x, 3.35, p.z - dir * 0.75); bb.castShadow = true; this.group.add(bb);
    const sq = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), M.std({ color: 0xc62828 }));
    sq.position.set(p.x, 3.2, p.z - dir * 0.72); sq.rotation.y = dir > 0 ? 0 : Math.PI; this.group.add(sq);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.015, 8, 24), M.std({ color: 0xff5722, metal: 0.6, rough: 0.4 }));
    rim.rotation.x = Math.PI / 2; rim.position.set(p.x, 3.05, p.z - dir * 0.47); this.group.add(rim);
    // chain net
    const net = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.14, 0.4, 12, 3, true), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1, roughness: 0.3, wireframe: true }));
    net.position.set(p.x, 2.85, p.z - dir * 0.47); this.group.add(net);
  },

    prop_playground(p) {
    const red = M.std({ color: 0xc62828, metal: 0.5, rough: 0.4 }), yel = M.std({ color: 0xfbc02d, rough: 0.5 }), blu = M.std({ color: 0x1565c0, rough: 0.5 });
    for (const [ox, oz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) this.addCyl(p.x + ox, 0, p.z + oz, 0.07, 0.07, 3.0, red, { collide: false });
    this.addBox(p.x, 1.15, p.z, 3, 0.15, 3, blu, { collide: false, round: 0.04 });
    this.colliders.push(box(p.x - 1.5, 0, p.z - 1.5, p.x + 1.5, 1.3, p.z + 1.5, 'prop'));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 4), yel);
    roof.position.set(p.x, 3.6, p.z); roof.rotation.y = Math.PI / 4; roof.castShadow = true; this.group.add(roof);
    const slide = new THREE.Mesh(rbox(0.8, 0.08, 3.2, 0.03), yel);
    slide.position.set(p.x + 2.6, 0.7, p.z); slide.rotation.set(0, Math.PI / 2, -0.4); slide.castShadow = true; this.group.add(slide);
  },

    prop_train(p) {
    const g = new THREE.Group();
    const steel = new THREE.MeshPhysicalMaterial({ color: 0xc9cdd3, metalness: 0.9, roughness: 0.3, clearcoat: 0.4, map: M.metalSet('#c7cbd1', 'corrugated').map });
    const body = new THREE.Mesh(rbox(3, 3.3, p.len, 0.3), steel); body.position.y = 1.95; g.add(body);
    const glassM = new THREE.MeshPhysicalMaterial({ color: 0x0b141e, roughness: 0.05, clearcoat: 1 });
    const win = new THREE.Mesh(rbox(3.04, 0.9, p.len - 1.2, 0.05), glassM); win.position.y = 2.55; g.add(win);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.25, p.len - 0.3), M.std({ color: 0xff6f00, rough: 0.4 })); stripe.position.y = 1.7; g.add(stripe);
    const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.12, p.len - 0.3), M.std({ color: 0x1565c0, rough: 0.4 })); stripe2.position.y = 1.45; g.add(stripe2);
    const under = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, p.len - 1), M.std({ color: 0x1c1c1c, metal: 0.6, rough: 0.6 })); under.position.y = 0.3; g.add(under);
    const doorM = M.std({ color: 0x9aa0a8, metal: 0.9, rough: 0.35 });
    for (let z = -p.len / 2 + 3; z < p.len / 2 - 2; z += 4.5) {
      for (const s of [-1, 1]) {
        const door = new THREE.Mesh(rbox(0.05, 2.3, 1.4, 0.02), doorM); door.position.set(s * 1.52, 1.75, z); g.add(door);
        const dw = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.4), glassM); dw.position.set(s * 1.53, 2.4, z - 0.32); g.add(dw);
        const dw2 = dw.clone(); dw2.position.z = z + 0.32; g.add(dw2);
      }
    }
    // interior light glow through the windows
    const inner = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.05, p.len - 1.5), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xe8f2ff, emissiveIntensity: 1.5 }));
    inner.position.y = 3.3; g.add(inner);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(p.x, 0, p.z); this.group.add(g);
    for (const s of [-1, 1]) this.addSign('MARTA', { bg: '#0d47a1', fg: '#fff' }, p.x + s * 1.6, 3.25, p.z, 2.4, 0.6, s * Math.PI / 2);
    this.colliders.push(box(p.x - 1.5, 0, p.z - p.len / 2, p.x + 1.5, 3.6, p.z + p.len / 2, 'car'));
  },

    prop_pillar(p) {
    this.addBox(p.x, 0, p.z, 1.1, this.ceiling, 1.1, M.std({ set: M.wallTileSet('#e6d9b8'), rx: 0.5, ry: 2, rough: 0.5 }), { round: 0.05 });
    this.addBox(p.x, 0, p.z, 1.25, 0.3, 1.25, M.std({ color: 0x2a2a2a, rough: 0.5 }), { collide: false });
  },

    prop_turnstile(p) {
    this.addBox(p.x, 0, p.z, 1.0, 1.05, 0.6, M.std({ color: 0xb0bec5, metal: 0.9, rough: 0.25 }), { round: 0.06 });
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), M.std({ color: 0xdddddd, metal: 1, rough: 0.2 }));
    arm.rotation.x = Math.PI / 2; arm.position.set(p.x, 0.95, p.z + 0.6); this.group.add(arm);
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), new THREE.MeshStandardMaterial({ color: 0, emissive: 0x00e676, emissiveIntensity: 3 }));
    lamp.position.set(p.x, 1.06, p.z); lamp.rotation.x = -Math.PI / 2; this.group.add(lamp);
  },

    prop_box(p) {
    const lit = p.label === 'SODA' || p.label === 'SNACKS' || p.label === 'TICKETS';
    this.addBox(p.x, 0, p.z, p.w, p.h, p.d, M.std({ set: M.metalSet(p.color, 'painted'), metal: 0.5, rough: 0.45 }), { round: 0.05 });
    if (p.label) {
      const alongX = p.w > p.d;
      const half = (alongX ? p.d : p.w) / 2 + 0.03;
      const len = Math.max(p.w, p.d);
      for (const s of [-1, 1]) {
        const x = alongX ? p.x : p.x + s * (half + 0.06), z = alongX ? p.z + s * (half + 0.06) : p.z;
        const ry = alongX ? (s > 0 ? 0 : Math.PI) : (s > 0 ? Math.PI / 2 : -Math.PI / 2);
        this.addSign(p.label, { bg: '#111', fg: '#fff', lit }, x, p.h * 0.72, z, len * 0.8, len * 0.2, ry);
      }
    }
  },

    prop_roof(p) {
    this.addBox(p.x, p.y, p.z, p.w, 0.35, p.d, M.std({ set: M.metalSet('#6a6a6a', 'corrugated'), rx: p.w / 3, ry: 1, metal: 0.5 }));
    // trusses
    const steel = M.std({ color: 0x3a3d40, metal: 0.8, rough: 0.5 });
    for (let x = -p.w / 2 + 2; x < p.w / 2; x += 4) this.addBox(p.x + x, p.y - 0.4, p.z, 0.15, 0.4, p.d, steel, { collide: false });
    const lightMat = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xfff8e1, emissiveIntensity: 3 });
    for (const x of [-9, 0, 9]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(3, 0.06, 0.4), lightMat);
      l.position.set(p.x + x, p.y - 0.45, p.z); this.group.add(l);
    }
    this.pointLight(0xfff1d0, p.x - 6, p.y - 0.9, p.z, 45, 18);
    this.pointLight(0xfff1d0, p.x + 6, p.y - 0.9, p.z, 45, 18);
    // oil stains on the shop floor
    for (let i = 0; i < 4; i++) this.groundDecal(M.blobShadow(), p.x + (Math.random() - 0.5) * p.w * 0.8, p.z + (Math.random() - 0.5) * p.d * 0.6, 1.5 + Math.random() * 2, 1 + Math.random() * 1.5, Math.random() * 3, 0.5, 0.03);
  },

    prop_carstack(p) {
    const cols = ['#8e2a2a', '#2a4e8e', '#5a5a5a', '#7a6a2a', '#2a6a4a', '#6a2a6a', '#9a9a9a'];
    let s = p.seed * 97 + 3;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < p.n; i++) {
      const col = cols[Math.floor(r() * cols.length)];
      const mat = M.std({ set: M.metalSet(col, 'painted'), metal: 0.5, rough: 0.6 });
      // crushed body: a box with jittered vertices
      const geo = new RoundedBoxGeometry(2.1, 1.05, 4.1, 2, 0.12);
      const pos = geo.attributes.position;
      for (let k = 0; k < pos.count; k++) pos.setXYZ(k, pos.getX(k) + (r() - 0.5) * 0.06, pos.getY(k) * (1 + (r() - 0.5) * 0.15), pos.getZ(k) + (r() - 0.5) * 0.06);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.x + (r() - 0.5) * 0.2, 0.53 + i * 1.08, p.z + (r() - 0.5) * 0.25);
      m.rotation.set((r() - 0.5) * 0.06, (r() - 0.5) * 0.2, (r() - 0.5) * 0.06);
      m.castShadow = m.receiveShadow = true; this.group.add(m);
      // squashed glass band
      const gl = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.18, 2.2), new THREE.MeshPhysicalMaterial({ color: 0x0a0e12, roughness: 0.15, clearcoat: 1 }));
      gl.position.copy(m.position).setY(m.position.y + 0.3); gl.rotation.copy(m.rotation); this.group.add(gl);
    }
    this.colliders.push(box(p.x - 1.15, 0, p.z - 2.15, p.x + 1.15, p.n * 1.08, p.z + 2.15, 'prop'));
    this.groundDecal(M.blobShadow(), p.x, p.z, 3, 5, 0, 0.7);
  },

    prop_crane(p) {
    const yel = M.std({ color: 0xf2a313, metal: 0.5, rough: 0.5 });
    // lattice mast
    for (const [ox, oz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) this.addBox(p.x + ox, 0, p.z + oz, 0.12, 20, 0.12, yel, { collide: false });
    for (let y = 1; y < 20; y += 1.4) {
      const d1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.06), yel); d1.position.set(p.x, y, p.z - 0.55); d1.rotation.z = 0.7; this.group.add(d1);
      const d2 = d1.clone(); d2.position.z = p.z + 0.55; d2.rotation.z = -0.7; this.group.add(d2);
    }
    this.colliders.push(box(p.x - 0.65, 0, p.z - 0.65, p.x + 0.65, 20, p.z + 0.65, 'prop'));
    this.addBox(p.x - 6, 19.5, p.z, 16, 0.8, 0.8, yel, { collide: false });
    this.addBox(p.x + 3, 18.5, p.z, 2.5, 2, 2, M.std({ color: 0x4a4a4a, rough: 0.6 }), { collide: false });
    this.addCyl(p.x - 12, 3.5, p.z, 0.02, 0.02, 16, M.std({ color: 0x222222, metal: 1 }), { collide: false });
    this.addBox(p.x - 12, 2.5, p.z, 1.6, 1, 1.6, M.std({ color: 0x3a3a3a, metal: 0.8, rough: 0.4 }), { collide: false, round: 0.1 });
  },

    prop_trailer(p) {
    this.addBox(p.x, 0.4, p.z, 8, 2.8, 3.2, M.std({ set: M.metalSet('#e2e2dc', 'corrugated'), rx: 3, ry: 1, metal: 0.3, rough: 0.5 }));
    this.colliders[this.colliders.length - 1].minY = 0;
    for (const ox of [-3, 3]) this.addBox(p.x + ox, 0, p.z, 0.5, 0.4, 3, M.std({ color: 0x555555 }), { collide: false });
    this.addSign(p.label, { bg: '#1b5e20', fg: '#fff' }, p.x, 2.5, p.z + 1.7, 3, 0.75, 0);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffd9a0, emissiveIntensity: 0.8, roughness: 0.1 }));
    win.position.set(p.x - 2.5, 2.0, p.z + 1.62); this.group.add(win);
  },

    prop_billboard(p) {
    const ry = (p.rot || 0) * Math.PI / 2;
    const g = new THREE.Group();
    const post = M.std({ color: 0x3a3c40, metal: 0.8, rough: 0.5 });
    for (const s of [-3, 3]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 6, 12), post); m.position.set(s, 3, -0.3); m.castShadow = true; g.add(m);
    }
    const tex = TX.sign(p.text, '#111', '#ffb300', { sub: p.sub, border: '#ffb300' });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.2), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: this.night ? 0.9 : 0.15, roughness: 0.5 }));
    board.position.set(0, 7.2, 0); g.add(board);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(10.3, 3.5, 0.25), post); frame.position.set(0, 7.2, -0.15); frame.castShadow = true; g.add(frame);
    const walk = new THREE.Mesh(new THREE.BoxGeometry(10, 0.06, 0.8), post); walk.position.set(0, 5.5, 0.3); g.add(walk);
    g.position.set(p.x, 0, p.z); g.rotation.y = ry;
    this.group.add(g);
  },

    // ---------- street dressing ----------
  // Hydrants, trash cans, utility poles with sagging wires, manholes and litter.
  buildDetails() {
    if (this.indoor) {
      for (let i = 0; i < 25; i++) this.litter((Math.random() - 0.5) * (this.maxX - this.minX), (Math.random() - 0.5) * (this.maxZ - this.minZ));
      return;
    }
    const red = M.std({ color: 0xb71c1c, metal: 0.4, rough: 0.45 });
    const canMat = M.std({ set: M.metalSet('#3a4a3a', 'painted'), metal: 0.6, rough: 0.5 });
    const woodPole = M.std({ set: M.woodSet('#4a3a2a', 'pole'), rough: 0.95 });
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });
    for (const sw of this.sidewalks) {
      const z0 = sw.z - sw.d / 2 + 4, z1 = sw.z + sw.d / 2 - 4;
      const curbX = sw.x + (sw.x < 0 ? sw.w / 2 - 0.35 : -sw.w / 2 + 0.35);
      let k = 0;
      const poles = [];
      for (let z = z0; z <= z1; z += 6) {
        k++;
        const x = curbX;
        if (this.insideCollider(x, z, 0.8)) continue;
        if (k % 5 === 1) {
          // utility pole
          this.addCyl(x, 0.15, z, 0.13, 0.17, 10, woodPole, { collide: true, tag: 'prop' });
          this.addBox(x, 9.1, z, 2.2, 0.12, 0.12, woodPole, { collide: false });
          this.addCyl(x + 0.6, 9.2, z, 0.25, 0.25, 0.7, M.std({ color: 0x777b80, metal: 0.6, rough: 0.5 }), { collide: false });
          poles.push([x, z]);
        } else if (k % 5 === 3) {
          // fire hydrant
          const hx = x, hz = z;
          this.addCyl(hx, 0.15, hz, 0.13, 0.15, 0.6, red, { collide: true, tag: 'prop' });
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), red); cap.position.set(hx, 0.75, hz); cap.castShadow = true; this.group.add(cap);
          const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.38, 10), red); noz.rotation.z = Math.PI / 2; noz.position.set(hx, 0.55, hz); this.group.add(noz);
        } else if (k % 5 === 4) {
          // trash can
          this.addCyl(x, 0.15, z, 0.28, 0.25, 0.95, canMat, { collide: true, tag: 'prop', seg: 16 });
          const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16), canMat); lid.position.set(x, 1.13, z); this.group.add(lid);
        }
      }
      // wires drooping between poles
      for (let i = 0; i + 1 < poles.length; i++) {
        const [ax, az] = poles[i], [bx, bz] = poles[i + 1];
        for (const off of [-0.9, 0, 0.9]) {
          const a = new THREE.Vector3(ax + off, 9.2, az), b = new THREE.Vector3(bx + off, 9.2, bz);
          const mid = a.clone().lerp(b, 0.5); mid.y -= 1.0;
          const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 20, 0.015, 4), wireMat);
          this.group.add(tube);
        }
      }
    }
    // manholes and storm drains on roads
    for (const p of this.def.patches || []) {
      if (p.tex !== 'road') continue;
      for (let z = p.z - p.d / 2 + 10; z < p.z + p.d / 2; z += 22) {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), M.std({ set: M.metalSet('#3a3a3a', 'painted'), metal: 0.8, rough: 0.5 }));
        disc.rotation.x = -Math.PI / 2; disc.position.set(p.x + (Math.random() - 0.5) * 6, 0.02, z); disc.receiveShadow = true; this.group.add(disc);
      }
    }
    const n = 50;
    for (let i = 0; i < n; i++) {
      const x = this.minX + 2 + Math.random() * (this.maxX - this.minX - 4), z = this.minZ + 2 + Math.random() * (this.maxZ - this.minZ - 4);
      if (this.insideCollider(x, z, 0.2)) continue;
      this.litter(x, z);
    }
  },

    litter(x, z) {
    const kind = Math.random();
    if (kind < 0.4) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), M.std({ color: [0xeeeeee, 0xd8c8a0, 0xffffff][Math.floor(Math.random() * 3)], rough: 0.9, side: THREE.DoubleSide }));
      m.rotation.set(-Math.PI / 2 + (Math.random() - 0.5) * 0.3, 0, Math.random() * 6); m.position.set(x, 0.03, z); m.receiveShadow = true; this.group.add(m);
    } else if (kind < 0.7) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 10), M.std({ color: [0xc62828, 0x1565c0, 0x2e7d32, 0xbdbdbd][Math.floor(Math.random() * 4)], metal: 0.9, rough: 0.3 }));
      can.rotation.set(Math.PI / 2, 0, Math.random() * 6); can.position.set(x, 0.035, z); can.castShadow = true; this.group.add(can);
    } else if (kind < 0.85) {
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.26, 10), new THREE.MeshPhysicalMaterial({ color: 0x3b2410, roughness: 0.05, transmission: 0.0, metalness: 0.1, clearcoat: 1 }));
      bottle.rotation.set(Math.PI / 2, 0, Math.random() * 6); bottle.position.set(x, 0.04, z); this.group.add(bottle);
    } else {
      this.groundDecal(M.blobShadow(), x, z, 0.8 + Math.random(), 0.6 + Math.random(), Math.random() * 3, 0.45);
    }
  },
};
