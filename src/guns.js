// Weapons: beveled, physically shaded gun models and the first-person viewmodel (gloved arms).
import * as THREE from 'three';
import { RoundedBoxGeometry } from '../lib/addons/geometries/RoundedBoxGeometry.js';
import { nameTag } from './textures.js';
import * as MT from './materials.js';

const M = {};
export function mats() {
  if (M.ready) return M;
  const metalN = MT.metalSet('#2a2b2e', 'gun').normalMap;
  M.black = new THREE.MeshStandardMaterial({ color: 0x1e1f22, metalness: 0.85, roughness: 0.38, normalMap: metalN, normalScale: new THREE.Vector2(0.3, 0.3) });
  M.parkerized = new THREE.MeshStandardMaterial({ color: 0x2b2d2f, metalness: 0.6, roughness: 0.6 });
  M.poly = new THREE.MeshStandardMaterial({ color: 0x232323, metalness: 0.05, roughness: 0.72 });
  const wood = MT.woodSet('#7a4422', 'gunwood');
  M.wood = new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normalMap, color: 0xb07040, metalness: 0, roughness: 0.45 });
  M.gold = new THREE.MeshStandardMaterial({ color: 0xe8b84a, metalness: 1.0, roughness: 0.18 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xe0e3e8, metalness: 1.0, roughness: 0.12 });
  M.tan = new THREE.MeshStandardMaterial({ color: 0x8c7a5b, metalness: 0.1, roughness: 0.7 });
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0x1a2a40, metalness: 0.2, roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.35 });
  M.lens = new THREE.MeshPhysicalMaterial({ color: 0x2244aa, metalness: 0.5, roughness: 0.05, clearcoat: 1 });
  M.red = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  M.blade = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 1.0, roughness: 0.15 });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0, roughness: 0.95 });
  M.ready = true;
  return M;
}

const geoCache = new Map();
function rgeo(w, h, d) {
  const key = `${w.toFixed(4)}|${h.toFixed(4)}|${d.toFixed(4)}`;
  let g = geoCache.get(key);
  if (!g) { g = new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.28); geoCache.set(key, g); }
  return g;
}
function part(g, w, h, d, x, y, z, mat, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(rgeo(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}
function cyl(g, r, len, x, y, z, mat, axis = 'z', seg = 16, r2) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r2 ?? r, len, seg), mat);
  m.position.set(x, y, z);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  g.add(m);
  return m;
}
function rail(g, x, y, z0, z1, mat) {
  part(g, 0.024, 0.008, z1 - z0, x, y, (z0 + z1) / 2, mat);
  for (let z = z0 + 0.006; z < z1; z += 0.012) part(g, 0.026, 0.006, 0.006, x, y + 0.006, z, mat);
}
function triggerGuard(g, z, y, mat) {
  const t = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 14, Math.PI), mat);
  t.rotation.set(0, Math.PI / 2, Math.PI); t.position.set(0, y, z); g.add(t);
  part(g, 0.004, 0.018, 0.006, 0, y + 0.008, z, mat, 0.3);
}

// Gun points toward -z. Returns { group, muzzle, sightY, mag, grip:[x,y,z], fore:[x,y,z] }
export function buildGun(model) {
  const m = mats();
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  let mag = null, sightY = 0.06, grip = [0, -0.07, 0.02], fore = [0, -0.05, -0.3];
  switch (model) {
    case 'ak': {
      part(g, 0.062, 0.07, 0.42, 0, 0, -0.08, m.black);
      part(g, 0.058, 0.03, 0.3, 0, 0.042, -0.06, m.black); // dust cover
      cyl(g, 0.012, 0.42, 0, 0.012, -0.5, m.black, 'z', 12);
      cyl(g, 0.009, 0.3, 0, 0.042, -0.4, m.black, 'z', 10); // gas tube
      cyl(g, 0.018, 0.05, 0, 0.012, -0.72, m.black, 'z', 12); // muzzle brake
      part(g, 0.074, 0.066, 0.24, 0, -0.008, -0.38, m.wood);
      part(g, 0.058, 0.032, 0.22, 0, 0.048, -0.38, m.wood);
      part(g, 0.05, 0.08, 0.32, 0, -0.035, 0.27, m.wood, 0.14);
      part(g, 0.052, 0.05, 0.06, 0, -0.004, 0.11, m.wood);
      part(g, 0.04, 0.11, 0.048, 0, -0.08, 0.06, m.wood, -0.35);
      triggerGuard(g, 0.01, -0.05, m.black);
      part(g, 0.012, 0.008, 0.03, 0.034, 0.03, -0.02, m.black); // charging handle
      mag = new THREE.Group();
      part(mag, 0.042, 0.12, 0.075, 0, -0.06, 0, m.black, 0.2);
      part(mag, 0.042, 0.1, 0.07, 0, -0.16, -0.036, m.black, 0.55);
      mag.position.set(0, -0.035, -0.15); g.add(mag);
      part(g, 0.008, 0.042, 0.01, 0, 0.044, -0.66, m.black);
      part(g, 0.026, 0.02, 0.04, 0, 0.055, -0.05, m.black);
      muzzle.position.set(0, 0.012, -0.76);
      sightY = 0.065; fore = [0, -0.05, -0.38];
      break;
    }
    case 'draco': {
      part(g, 0.062, 0.07, 0.4, 0, 0, -0.06, m.black);
      part(g, 0.058, 0.03, 0.28, 0, 0.042, -0.05, m.black);
      cyl(g, 0.013, 0.18, 0, 0.012, -0.36, m.black, 'z', 12);
      cyl(g, 0.02, 0.05, 0, 0.012, -0.46, m.black, 'z', 12);
      part(g, 0.074, 0.07, 0.2, 0, -0.006, -0.33, m.wood);
      part(g, 0.04, 0.11, 0.048, 0, -0.08, 0.09, m.wood, -0.35);
      part(g, 0.05, 0.05, 0.05, 0, -0.008, 0.17, m.black);
      triggerGuard(g, 0.035, -0.05, m.black);
      mag = new THREE.Group();
      part(mag, 0.042, 0.12, 0.075, 0, -0.06, 0, m.gold, 0.2);
      part(mag, 0.042, 0.1, 0.07, 0, -0.16, -0.036, m.gold, 0.55);
      mag.position.set(0, -0.035, -0.13); g.add(mag);
      part(g, 0.008, 0.042, 0.01, 0, 0.044, -0.42, m.black);
      muzzle.position.set(0, 0.012, -0.49);
      sightY = 0.065; fore = [0, -0.05, -0.32];
      break;
    }
    case 'ar': {
      part(g, 0.056, 0.066, 0.3, 0, 0, -0.06, m.parkerized);
      part(g, 0.05, 0.05, 0.12, 0, -0.04, -0.12, m.parkerized); // mag well
      part(g, 0.068, 0.068, 0.32, 0, 0.004, -0.38, m.black); // handguard
      for (let z = -0.5; z < -0.24; z += 0.04) part(g, 0.07, 0.012, 0.02, 0, -0.03, z, m.black); // vents
      cyl(g, 0.011, 0.2, 0, 0.0, -0.62, m.black, 'z', 12);
      cyl(g, 0.017, 0.06, 0, 0.0, -0.73, m.black, 'z', 6); // birdcage
      rail(g, 0, 0.04, -0.54, 0.06, m.black);
      // open-frame red dot so you can see through it when aiming
      part(g, 0.05, 0.012, 0.07, 0, 0.052, -0.08, m.black);
      part(g, 0.007, 0.055, 0.03, -0.026, 0.08, -0.1, m.black);
      part(g, 0.007, 0.055, 0.03, 0.026, 0.08, -0.1, m.black);
      part(g, 0.058, 0.008, 0.03, 0, 0.11, -0.1, m.black);
      const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.045), m.glass); glassPane.position.set(0, 0.08, -0.105); g.add(glassPane);
      part(g, 0.003, 0.003, 0.002, 0, 0.08, -0.1, m.red);
      cyl(g, 0.02, 0.24, 0, -0.005, 0.14, m.poly, 'z', 12); // buffer tube
      part(g, 0.046, 0.075, 0.16, 0, -0.03, 0.26, m.poly); // stock
      part(g, 0.04, 0.1, 0.05, 0, -0.08, 0.05, m.poly, -0.3);
      triggerGuard(g, 0.0, -0.045, m.parkerized);
      part(g, 0.016, 0.01, 0.03, 0.03, 0.024, 0.07, m.parkerized);
      mag = new THREE.Group();
      part(mag, 0.036, 0.15, 0.066, 0, -0.075, 0, m.parkerized, 0.12);
      mag.position.set(0, -0.06, -0.12); g.add(mag);
      muzzle.position.set(0, 0, -0.77);
      sightY = 0.08; fore = [0, -0.05, -0.36];
      break;
    }
    case 'mac': {
      part(g, 0.056, 0.1, 0.24, 0, 0, -0.05, m.black);
      cyl(g, 0.011, 0.08, 0, 0.02, -0.21, m.black, 'z', 10);
      part(g, 0.008, 0.024, 0.01, 0, 0.06, -0.15, m.black);
      part(g, 0.008, 0.024, 0.01, 0, 0.06, 0.05, m.black);
      triggerGuard(g, -0.02, -0.06, m.black);
      mag = new THREE.Group();
      part(mag, 0.038, 0.22, 0.048, 0, -0.11, 0, m.black);
      mag.position.set(0, -0.04, 0.02); g.add(mag);
      cyl(g, 0.006, 0.2, 0.034, 0.0, 0.14, m.chrome, 'z', 8);
      cyl(g, 0.006, 0.2, -0.034, 0.0, 0.14, m.chrome, 'z', 8);
      part(g, 0.075, 0.03, 0.01, 0, 0.0, 0.24, m.chrome);
      muzzle.position.set(0, 0.02, -0.26);
      sightY = 0.072; grip = [0, -0.1, 0.02]; fore = [0, -0.06, -0.13];
      break;
    }
    case 'pump': {
      cyl(g, 0.017, 0.62, 0, 0.02, -0.42, m.black, 'z', 14);
      cyl(g, 0.015, 0.5, 0, -0.018, -0.38, m.black, 'z', 12);
      part(g, 0.062, 0.078, 0.22, 0, 0, -0.02, m.black);
      mag = part(g, 0.06, 0.05, 0.18, 0, -0.02, -0.38, m.wood);
      for (let z = -0.45; z < -0.3; z += 0.022) part(g, 0.062, 0.004, 0.008, 0, -0.02, z, m.poly);
      part(g, 0.052, 0.1, 0.34, 0, -0.04, 0.26, m.wood, 0.15);
      part(g, 0.055, 0.105, 0.025, 0, -0.065, 0.43, m.rubber, 0.15);
      triggerGuard(g, 0.04, -0.045, m.black);
      cyl(g, 0.005, 0.01, 0, 0.042, -0.7, m.chrome, 'y', 8);
      muzzle.position.set(0, 0.02, -0.74);
      sightY = 0.048; fore = [0, -0.05, -0.38];
      break;
    }
    case 'sniper': {
      part(g, 0.056, 0.07, 0.4, 0, 0, -0.05, m.tan);
      cyl(g, 0.013, 0.6, 0, 0.01, -0.55, m.black, 'z', 12, 0.016);
      cyl(g, 0.022, 0.06, 0, 0.01, -0.86, m.black, 'z', 8);
      cyl(g, 0.026, 0.3, 0, 0.09, -0.06, m.black, 'z', 18);
      cyl(g, 0.036, 0.07, 0, 0.09, -0.24, m.black, 'z', 18, 0.026);
      cyl(g, 0.03, 0.05, 0, 0.09, 0.11, m.black, 'z', 18);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.032, 18), m.lens); lens.position.set(0, 0.09, -0.276); lens.rotation.y = Math.PI; g.add(lens);
      cyl(g, 0.012, 0.03, 0, 0.125, -0.06, m.black, 'y', 10); // turret
      cyl(g, 0.012, 0.03, 0.03, 0.09, -0.06, m.black, 'x', 10);
      part(g, 0.02, 0.03, 0.03, 0, 0.055, -0.14, m.black); part(g, 0.02, 0.03, 0.03, 0, 0.055, 0.04, m.black); // rings
      part(g, 0.052, 0.12, 0.34, 0, -0.03, 0.3, m.tan, 0.06);
      part(g, 0.05, 0.03, 0.12, 0, 0.035, 0.28, m.tan); // cheek riser
      part(g, 0.04, 0.1, 0.05, 0, -0.08, 0.1, m.tan, -0.3);
      triggerGuard(g, 0.06, -0.045, m.black);
      cyl(g, 0.006, 0.05, 0.045, 0.03, 0.05, m.chrome, 'x', 8); // bolt handle
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 8), m.chrome); knob.position.set(0.07, 0.03, 0.05); g.add(knob);
      mag = new THREE.Group(); part(mag, 0.036, 0.06, 0.08, 0, -0.03, 0, m.black); mag.position.set(0, -0.04, -0.05); g.add(mag);
      muzzle.position.set(0, 0.01, -0.9);
      sightY = 0.09; fore = [0, -0.05, -0.32];
      break;
    }
    case 'lmg': {
      part(g, 0.085, 0.1, 0.5, 0, 0, -0.08, m.black);
      cyl(g, 0.017, 0.4, 0, 0.01, -0.5, m.black, 'z', 12);
      cyl(g, 0.028, 0.18, 0, 0.01, -0.38, m.parkerized, 'z', 12); // barrel shroud
      cyl(g, 0.022, 0.05, 0, 0.01, -0.72, m.black, 'z', 6);
      part(g, 0.095, 0.03, 0.2, 0, 0.065, -0.1, m.black);
      cyl(g, 0.008, 0.12, 0, 0.1, -0.1, m.black, 'x', 8); // carry handle
      part(g, 0.065, 0.085, 0.28, 0, -0.03, 0.3, m.poly, 0.1);
      part(g, 0.04, 0.11, 0.05, 0, -0.09, 0.1, m.poly, -0.3);
      triggerGuard(g, 0.06, -0.055, m.black);
      mag = new THREE.Group();
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 24), m.black);
      drum.rotation.z = Math.PI / 2; drum.position.set(0, -0.1, 0); mag.add(drum);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.085, 6), m.parkerized);
      cap.rotation.z = Math.PI / 2; cap.position.set(0, -0.1, 0); mag.add(cap);
      mag.position.set(0, -0.03, -0.12); g.add(mag);
      part(g, 0.008, 0.2, 0.008, -0.04, -0.1, -0.55, m.black, 0.3);
      part(g, 0.008, 0.2, 0.008, 0.04, -0.1, -0.55, m.black, 0.3);
      muzzle.position.set(0, 0.01, -0.75);
      sightY = 0.088; fore = [0, -0.06, -0.36];
      break;
    }
    case 'pistol':
    case 'pistol_ext': {
      part(g, 0.032, 0.034, 0.19, 0, 0.022, -0.05, m.black);
      for (let z = 0.015; z < 0.04; z += 0.006) part(g, 0.034, 0.02, 0.002, 0, 0.022, z, m.poly); // serrations
      part(g, 0.03, 0.03, 0.15, 0, -0.008, -0.04, m.poly);
      part(g, 0.03, 0.11, 0.045, 0, -0.07, 0.03, m.poly, -0.2);
      triggerGuard(g, -0.035, -0.032, m.poly);
      part(g, 0.006, 0.01, 0.006, 0, 0.044, -0.13, m.black);
      part(g, 0.016, 0.008, 0.006, 0, 0.044, 0.035, m.black);
      mag = new THREE.Group();
      if (model === 'pistol_ext') {
        part(mag, 0.026, 0.2, 0.038, 0, -0.1, 0, m.poly, -0.2);
        part(g, 0.02, 0.012, 0.006, 0, 0.03, 0.043, m.poly); // the switch plate
      } else part(mag, 0.026, 0.02, 0.038, 0, -0.01, 0, m.poly);
      mag.position.set(0, -0.12, 0.045); g.add(mag);
      muzzle.position.set(0, 0.022, -0.15);
      sightY = 0.046; grip = [0, -0.08, 0.03]; fore = [0.0, -0.08, 0.0];
      break;
    }
    case 'deagle': {
      part(g, 0.038, 0.05, 0.25, 0, 0.025, -0.07, m.chrome);
      for (let z = 0.0; z < 0.05; z += 0.007) part(g, 0.04, 0.03, 0.002, 0, 0.025, z, m.black);
      part(g, 0.034, 0.035, 0.2, 0, -0.01, -0.06, m.chrome);
      part(g, 0.034, 0.12, 0.05, 0, -0.075, 0.03, m.black, -0.2);
      triggerGuard(g, -0.035, -0.035, m.chrome);
      part(g, 0.008, 0.012, 0.008, 0, 0.055, -0.18, m.chrome);
      mag = new THREE.Group(); part(mag, 0.028, 0.02, 0.044, 0, -0.01, 0, m.black); mag.position.set(0, -0.13, 0.045); g.add(mag);
      muzzle.position.set(0, 0.025, -0.2);
      sightY = 0.06; grip = [0, -0.08, 0.03]; fore = [0, -0.08, 0];
      break;
    }
    case 'revolver': {
      cyl(g, 0.011, 0.09, 0, 0.02, -0.1, m.chrome, 'z', 12);
      part(g, 0.008, 0.012, 0.09, 0, 0.034, -0.1, m.chrome);
      cyl(g, 0.03, 0.05, 0, 0.0, -0.03, m.chrome, 'z', 6);
      part(g, 0.028, 0.04, 0.09, 0, 0.0, 0.01, m.chrome);
      part(g, 0.006, 0.02, 0.012, 0, 0.03, 0.05, m.chrome, 0.6); // hammer
      part(g, 0.034, 0.1, 0.045, 0, -0.06, 0.05, m.wood, -0.35);
      triggerGuard(g, 0.015, -0.03, m.chrome);
      mag = new THREE.Group(); mag.position.set(0, 0, -0.03); g.add(mag);
      muzzle.position.set(0, 0.02, -0.15);
      sightY = 0.042; grip = [0, -0.07, 0.05]; fore = [0, -0.07, 0.02];
      break;
    }
    case 'knife': {
      part(g, 0.024, 0.03, 0.12, 0, 0, 0.04, m.rubber);
      part(g, 0.04, 0.01, 0.012, 0, 0, -0.025, m.black);
      const sh = new THREE.Shape();
      sh.moveTo(0, -0.012); sh.lineTo(0.17, -0.008); sh.quadraticCurveTo(0.2, 0.0, 0.19, 0.016); sh.lineTo(0, 0.018); sh.closePath();
      const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: true, bevelSize: 0.001, bevelThickness: 0.001, bevelSegments: 1 });
      bg.translate(0, 0, -0.002); bg.rotateY(Math.PI / 2);
      const blade = new THREE.Mesh(bg, m.blade); blade.position.set(0, 0.0, -0.03); g.add(blade);
      mag = new THREE.Group(); g.add(mag);
      muzzle.position.set(0, 0, -0.2);
      sightY = 0.02; grip = [0, -0.02, 0.04]; fore = [0, -0.06, 0.05];
      break;
    }
    default: part(g, 0.06, 0.08, 0.5, 0, 0, -0.2, m.black); muzzle.position.set(0, 0, -0.5);
  }
  g.add(muzzle);
  return { group: g, muzzle, sightY, mag, grip, fore };
}

// Gloved hand with curled fingers. Palm faces -x for the right hand; mirror for the left.
function hand(gloveMat, skinMat, mirror) {
  const h = new THREE.Group();
  const s = mirror ? -1 : 1;
  part(h, 0.03, 0.085, 0.09, 0, 0, 0, gloveMat);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group();
    f.position.set(-s * 0.012, -0.03 + i * 0.002, -0.03 + i * 0.021);
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.022, 4, 8), gloveMat); a.rotation.z = s * 1.2; a.position.set(-s * 0.013, -0.006, 0); f.add(a);
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.016, 4, 8), gloveMat); b.position.set(-s * 0.028, 0.008, 0); b.rotation.z = s * 0.3; f.add(b);
    h.add(f);
  }
  const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.03, 4, 8), gloveMat);
  th.position.set(-s * 0.02, 0.03, -0.035); th.rotation.set(0.9, 0, s * 0.6); h.add(th);
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.03, 12), skinMat);
  wrist.rotation.x = Math.PI / 2; wrist.position.set(0, -0.005, 0.06); h.add(wrist);
  return h;
}

// First-person arms + gun.
export function buildViewmodel(model, sleeveColor, skin) {
  const gun = buildGun(model);
  const root = new THREE.Group();
  root.add(gun.group);
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.55 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.75, metalness: 0.05 });
  const fab = MT.fabricSet('#' + new THREE.Color(sleeveColor).getHexString(), 'cotton');
  const sleeve = new THREE.MeshStandardMaterial({ map: fab.map, normalMap: fab.normalMap, roughness: 0.95 });
  const arm = (pos, toward, isLeft) => {
    const a = new THREE.Group();
    const hd = hand(glove, skinMat, isLeft);
    a.add(hd);
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.26, 6, 12), sleeve);
    forearm.rotation.x = Math.PI / 2; forearm.position.set(0, -0.012, 0.22); a.add(forearm);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.008, 8, 16), sleeve);
    cuff.position.set(0, -0.01, 0.085); a.add(cuff);
    a.position.set(...pos);
    a.rotation.set(0.25, toward, isLeft ? -0.3 : 0.2);
    root.add(a);
    return a;
  };
  const isPistol = ['pistol', 'pistol_ext', 'deagle', 'revolver', 'knife'].includes(model);
  arm([gun.grip[0] + 0.006, gun.grip[1], gun.grip[2]], -0.25, false);
  const left = arm([gun.fore[0] - (isPistol ? 0.03 : 0.02), gun.fore[1] - 0.01, gun.fore[2] + (isPistol ? 0.02 : 0)], isPistol ? 0.15 : 0.55, true);
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return { root, gun, left };
}
