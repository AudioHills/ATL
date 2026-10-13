// Pooled visual effects: tracers, muzzle flashes, impact puffs, explosions.
import * as THREE from 'three';
import { smokeSprite, flashSprite } from './textures.js';
import { bulletHole } from './materials.js';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = [];
    this.tracerGeo = new THREE.BoxGeometry(1, 1, 1);
    this.tracerGeo.translate(0, 0, 0.5); // extends along +z, which lookAt aims at the target
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.heliTracerMat = new THREE.MeshBasicMaterial({ color: 0xff6040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.pool = { tracer: [], puff: [], flash: [] };
    this.smokeTex = smokeSprite();
    this.flashTex = flashSprite();
    this.light = new THREE.PointLight(0xffaa55, 0, 30, 1.5);
    this.group.add(this.light);
    this.lightT = 0;
    this.casingGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.03, 8);
    this.casingMat = new THREE.MeshStandardMaterial({ color: 0xc89b3c, metalness: 1, roughness: 0.25 });
    this.casings = [];
    this.holeGeo = new THREE.PlaneGeometry(0.11, 0.11);
    this.holeMat = new THREE.MeshStandardMaterial({ map: bulletHole(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.9 });
    this.holes = [];
    this.holeI = 0;
  }

  casing(pos, vel) {
    let c = this.casings.find((k) => k.t <= 0);
    if (!c) {
      if (this.casings.length >= 40) c = this.casings.reduce((a, b) => (a.t < b.t ? a : b));
      else { c = { mesh: new THREE.Mesh(this.casingGeo, this.casingMat), vel: new THREE.Vector3(), spin: new THREE.Vector3() }; c.mesh.castShadow = true; this.group.add(c.mesh); this.casings.push(c); }
    }
    c.mesh.visible = true;
    c.mesh.position.copy(pos);
    c.vel.copy(vel);
    c.spin.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
    c.t = 3;
    c.bounces = 0;
  }

  hole(pos, normal) {
    let m = this.holes[this.holeI];
    if (!m) { m = new THREE.Mesh(this.holeGeo, this.holeMat); this.group.add(m); this.holes[this.holeI] = m; }
    this.holeI = (this.holeI + 1) % 90;
    m.position.copy(pos).addScaledVector(normal, 0.01);
    m.lookAt(pos.x + normal.x, pos.y + normal.y, pos.z + normal.z);
    m.rotateZ(Math.random() * Math.PI * 2);
    const sc = 0.7 + Math.random() * 0.6;
    m.scale.set(sc, sc, 1);
    m.visible = true;
  }

  take(kind, make) {
    const p = this.pool[kind];
    const o = p.length ? p.pop() : make();
    o.visible = true;
    if (!o.parent) this.group.add(o);
    return o;
  }

  tracer(from, to, heli) {
    const m = this.take('tracer', () => new THREE.Mesh(this.tracerGeo, this.tracerMat));
    m.material = heli ? this.heliTracerMat : this.tracerMat;
    const len = from.distanceTo(to);
    // show only a streak segment that travels
    m.position.copy(from);
    m.lookAt(to);
    const w = heli ? 0.05 : 0.025;
    m.scale.set(w, w, Math.min(len, 6));
    this.items.push({ kind: 'tracer', o: m, t: 0, life: Math.min(0.12, 0.03 + len / 600), from: from.clone(), to: to.clone(), len });
  }

  puff(pos, color, size = 0.4, life = 0.35, rise = 0.6) {
    const s = this.take('puff', () => new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false })));
    s.material.color.set(color);
    s.material.opacity = 0.8;
    s.material.blending = THREE.NormalBlending;
    s.position.copy(pos);
    s.scale.setScalar(size);
    this.items.push({ kind: 'puff', o: s, t: 0, life, size, rise });
  }

  flash(pos, size = 0.6, life = 0.05) {
    const s = this.take('flash', () => new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    s.material.rotation = Math.random() * Math.PI;
    s.material.opacity = 1;
    s.position.copy(pos);
    s.scale.setScalar(size);
    this.items.push({ kind: 'flash', o: s, t: 0, life, size });
  }

  impact(pos, normal, blood) {
    if (blood) {
      for (let i = 0; i < 3; i++) {
        const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2));
        this.puff(p, 0x8a0a0a, 0.25 + Math.random() * 0.2, 0.3, -0.5);
      }
    } else {
      const p = pos.clone();
      if (normal) p.addScaledVector(normal, 0.05);
      this.puff(p, 0xb8b0a0, 0.3, 0.4, 0.4);
      this.flash(p, 0.18, 0.04);
    }
  }

  explosion(pos) {
    this.flash(pos.clone().setY(pos.y + 0.6), 6, 0.18);
    for (let i = 0; i < 9; i++) {
      const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, Math.random() * 1.5 + 0.3, (Math.random() - 0.5) * 2.5));
      this.puff(p, i < 3 ? 0xff8a2a : 0x3a3633, 2 + Math.random() * 2, 1.2 + Math.random() * 0.8, 1.5);
    }
    this.light.position.copy(pos).setY(pos.y + 1.5);
    this.light.intensity = 200;
    this.lightT = 0.25;
  }

  muzzleLight(pos) {
    if (this.lightT > 0.06) return;
    this.light.position.copy(pos);
    this.light.intensity = 12;
    this.lightT = 0.05;
  }

  update(dt) {
    for (const c of this.casings) {
      if (c.t <= 0) continue;
      c.t -= dt;
      if (c.t <= 0) { c.mesh.visible = false; continue; }
      if (c.bounces < 3) {
        c.vel.y -= 18 * dt;
        c.mesh.position.addScaledVector(c.vel, dt);
        c.mesh.rotation.x += c.spin.x * dt; c.mesh.rotation.y += c.spin.y * dt; c.mesh.rotation.z += c.spin.z * dt;
        if (c.mesh.position.y < 0.01) {
          c.mesh.position.y = 0.01; c.vel.y *= -0.35; c.vel.x *= 0.5; c.vel.z *= 0.5; c.spin.multiplyScalar(0.5); c.bounces++;
          if (c.bounces >= 3) { c.mesh.rotation.set(Math.PI / 2, 0, Math.random() * 6); }
        }
      }
    }
    if (this.lightT > 0) {
      this.lightT -= dt;
      if (this.lightT <= 0) this.light.intensity = 0;
      else this.light.intensity *= 0.8;
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = it.t / it.life;
      if (k >= 1) {
        it.o.visible = false;
        this.pool[it.kind].push(it.o);
        this.items.splice(i, 1);
        continue;
      }
      if (it.kind === 'tracer') {
        const seg = Math.min(it.len, 6);
        const head = Math.min(it.len, it.len * k * 1.3 + seg);
        const start = Math.max(0, head - seg);
        it.o.position.lerpVectors(it.from, it.to, start / it.len);
        it.o.scale.z = Math.max(0.01, head - start);
      } else if (it.kind === 'puff') {
        it.o.scale.setScalar(it.size * (1 + k * 1.5));
        it.o.material.opacity = 0.8 * (1 - k);
        it.o.position.y += it.rise * dt;
      } else if (it.kind === 'flash') {
        it.o.material.opacity = 1 - k;
      }
    }
  }

  clear() {
    for (const c of this.casings) { c.t = 0; c.mesh.visible = false; }
    for (const h of this.holes) if (h) h.visible = false;
    for (const it of this.items) { it.o.visible = false; this.pool[it.kind].push(it.o); }
    this.items.length = 0;
    this.light.intensity = 0;
  }
}
