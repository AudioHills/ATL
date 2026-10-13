// Low-poly box-built characters and guns.
import * as THREE from 'three';
import { nameTag } from './textures.js';

const M = {};
function mats() {
  if (M.ready) return M;
  M.black = new THREE.MeshStandardMaterial({ color: 0x1c1d20, metalness: 0.7, roughness: 0.45 });
  M.poly = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, metalness: 0.1, roughness: 0.8 });
  M.wood = new THREE.MeshStandardMaterial({ color: 0x7a4422, metalness: 0.0, roughness: 0.7 });
  M.gold = new THREE.MeshStandardMaterial({ color: 0xe0b23a, metalness: 1.0, roughness: 0.25 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xd8dbe0, metalness: 1.0, roughness: 0.18 });
  M.tan = new THREE.MeshStandardMaterial({ color: 0x8c7a5b, metalness: 0.1, roughness: 0.8 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0x223355, metalness: 0.9, roughness: 0.05 });
  M.red = new THREE.MeshBasicMaterial({ color: 0xff2020 });
  M.blade = new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 1.0, roughness: 0.2 });
  M.ready = true;
  return M;
}

function part(g, w, h, d, x, y, z, mat, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}
function cyl(g, r, len, x, y, z, mat, axis = 'z', seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.set(x, y, z);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  g.add(m);
  return m;
}

// Gun points toward -z. Returns { group, muzzle, sightY, mag, grip:[x,y,z], fore:[x,y,z] }
export function buildGun(model) {
  const m = mats();
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  let mag = null, sightY = 0.06, grip = [0, -0.07, 0.02], fore = [0, -0.05, -0.3];
  switch (model) {
    case 'ak': {
      part(g, 0.065, 0.085, 0.42, 0, 0, -0.08, m.black);
      cyl(g, 0.013, 0.42, 0, 0.012, -0.5, m.black);
      part(g, 0.075, 0.07, 0.24, 0, -0.005, -0.38, m.wood);
      part(g, 0.06, 0.03, 0.22, 0, 0.05, -0.36, m.wood);
      part(g, 0.055, 0.1, 0.32, 0, -0.03, 0.27, m.wood, 0.12);
      part(g, 0.045, 0.11, 0.05, 0, -0.08, 0.06, m.wood, -0.35);
      mag = new THREE.Group();
      part(mag, 0.045, 0.13, 0.08, 0, -0.06, 0, m.black, 0.2);
      part(mag, 0.045, 0.1, 0.075, 0, -0.16, -0.035, m.black, 0.55);
      mag.position.set(0, -0.04, -0.15); g.add(mag);
      part(g, 0.01, 0.045, 0.01, 0, 0.045, -0.66, m.black);
      part(g, 0.03, 0.02, 0.04, 0, 0.055, -0.05, m.black);
      muzzle.position.set(0, 0.012, -0.73);
      sightY = 0.065; fore = [0, -0.05, -0.38];
      break;
    }
    case 'draco': {
      part(g, 0.065, 0.085, 0.4, 0, 0, -0.06, m.black);
      cyl(g, 0.014, 0.18, 0, 0.012, -0.36, m.black);
      part(g, 0.075, 0.075, 0.2, 0, -0.005, -0.33, m.wood);
      part(g, 0.045, 0.11, 0.05, 0, -0.08, 0.09, m.wood, -0.35);
      part(g, 0.05, 0.05, 0.06, 0, -0.01, 0.17, m.black);
      mag = new THREE.Group();
      part(mag, 0.045, 0.13, 0.08, 0, -0.06, 0, m.gold, 0.2);
      part(mag, 0.045, 0.1, 0.075, 0, -0.16, -0.035, m.gold, 0.55);
      mag.position.set(0, -0.04, -0.13); g.add(mag);
      part(g, 0.01, 0.045, 0.01, 0, 0.045, -0.42, m.black);
      muzzle.position.set(0, 0.012, -0.46);
      sightY = 0.065; fore = [0, -0.05, -0.32];
      break;
    }
    case 'ar': {
      part(g, 0.06, 0.08, 0.36, 0, 0, -0.08, m.poly);
      part(g, 0.07, 0.075, 0.3, 0, 0, -0.38, m.black);
      cyl(g, 0.012, 0.2, 0, 0.0, -0.6, m.black);
      part(g, 0.03, 0.02, 0.5, 0, 0.05, -0.2, m.black);
      // open-frame red dot so you can see through it when aiming
      part(g, 0.05, 0.012, 0.07, 0, 0.066, -0.08, m.black);
      part(g, 0.006, 0.055, 0.03, -0.026, 0.092, -0.1, m.black);
      part(g, 0.006, 0.055, 0.03, 0.026, 0.092, -0.1, m.black);
      part(g, 0.058, 0.006, 0.03, 0, 0.122, -0.1, m.black);
      part(g, 0.003, 0.003, 0.002, 0, 0.092, -0.1, m.red);
      part(g, 0.05, 0.08, 0.26, 0, -0.02, 0.24, m.poly);
      part(g, 0.04, 0.1, 0.05, 0, -0.08, 0.05, m.poly, -0.3);
      mag = new THREE.Group();
      part(mag, 0.04, 0.15, 0.07, 0, -0.075, 0, m.poly, 0.12);
      mag.position.set(0, -0.04, -0.14); g.add(mag);
      muzzle.position.set(0, 0, -0.71);
      sightY = 0.092; fore = [0, -0.05, -0.36];
      break;
    }
    case 'mac': {
      part(g, 0.06, 0.1, 0.24, 0, 0, -0.05, m.black);
      cyl(g, 0.012, 0.08, 0, 0.02, -0.21, m.black);
      part(g, 0.01, 0.025, 0.01, 0, 0.06, -0.15, m.black);
      mag = new THREE.Group();
      part(mag, 0.04, 0.22, 0.05, 0, -0.11, 0, m.black);
      mag.position.set(0, -0.04, 0.02); g.add(mag);
      part(g, 0.02, 0.02, 0.18, 0.035, 0.0, 0.14, m.chrome);
      muzzle.position.set(0, 0.02, -0.26);
      sightY = 0.07; grip = [0, -0.1, 0.02]; fore = [0, -0.06, -0.13];
      break;
    }
    case 'pump': {
      cyl(g, 0.018, 0.62, 0, 0.02, -0.42, m.black);
      cyl(g, 0.016, 0.5, 0, -0.02, -0.38, m.black);
      part(g, 0.065, 0.08, 0.22, 0, 0, -0.02, m.black);
      mag = part(g, 0.06, 0.05, 0.18, 0, -0.02, -0.38, m.wood);
      part(g, 0.055, 0.1, 0.34, 0, -0.04, 0.26, m.wood, 0.15);
      part(g, 0.01, 0.015, 0.01, 0, 0.045, -0.7, m.chrome);
      muzzle.position.set(0, 0.02, -0.74);
      sightY = 0.05; fore = [0, -0.05, -0.38];
      break;
    }
    case 'sniper': {
      part(g, 0.06, 0.08, 0.4, 0, 0, -0.05, m.tan);
      cyl(g, 0.014, 0.6, 0, 0.01, -0.55, m.black);
      cyl(g, 0.028, 0.32, 0, 0.09, -0.06, m.black);
      cyl(g, 0.036, 0.06, 0, 0.09, -0.24, m.black);
      cyl(g, 0.032, 0.05, 0, 0.09, 0.11, m.black);
      part(g, 0.055, 0.12, 0.34, 0, -0.03, 0.3, m.tan, 0.06);
      part(g, 0.04, 0.1, 0.05, 0, -0.08, 0.1, m.tan, -0.3);
      part(g, 0.015, 0.015, 0.06, 0.045, 0.03, 0.05, m.chrome, 0, 0, 0);
      mag = new THREE.Group(); part(mag, 0.04, 0.07, 0.08, 0, -0.035, 0, m.black); mag.position.set(0, -0.04, -0.05); g.add(mag);
      muzzle.position.set(0, 0.01, -0.86);
      sightY = 0.09; fore = [0, -0.05, -0.32];
      break;
    }
    case 'lmg': {
      part(g, 0.09, 0.11, 0.5, 0, 0, -0.08, m.black);
      cyl(g, 0.017, 0.4, 0, 0.01, -0.5, m.black);
      part(g, 0.1, 0.03, 0.2, 0, 0.07, -0.1, m.black);
      part(g, 0.07, 0.09, 0.28, 0, -0.03, 0.3, m.poly, 0.1);
      part(g, 0.04, 0.11, 0.05, 0, -0.09, 0.1, m.poly, -0.3);
      mag = new THREE.Group();
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 16), m.black);
      drum.rotation.z = Math.PI / 2; drum.position.set(0, -0.1, 0); mag.add(drum);
      mag.position.set(0, -0.03, -0.12); g.add(mag);
      part(g, 0.01, 0.2, 0.01, -0.04, -0.1, -0.55, m.black, 0.3);
      part(g, 0.01, 0.2, 0.01, 0.04, -0.1, -0.55, m.black, 0.3);
      muzzle.position.set(0, 0.01, -0.71);
      sightY = 0.09; fore = [0, -0.06, -0.36];
      break;
    }
    case 'pistol':
    case 'pistol_ext': {
      part(g, 0.035, 0.035, 0.19, 0, 0.02, -0.05, m.black);
      part(g, 0.032, 0.03, 0.15, 0, -0.01, -0.04, m.poly);
      part(g, 0.032, 0.11, 0.045, 0, -0.07, 0.03, m.poly, -0.2);
      part(g, 0.006, 0.01, 0.006, 0, 0.042, -0.13, m.black);
      mag = new THREE.Group();
      if (model === 'pistol_ext') {
        part(mag, 0.028, 0.2, 0.04, 0, -0.1, 0, m.poly, -0.2);
        part(g, 0.02, 0.012, 0.006, 0, 0.03, 0.043, m.poly); // the switch plate
      } else part(mag, 0.028, 0.02, 0.04, 0, -0.01, 0, m.poly);
      mag.position.set(0, -0.12, 0.045); g.add(mag);
      muzzle.position.set(0, 0.02, -0.15);
      sightY = 0.045; grip = [0, -0.08, 0.03]; fore = [0.0, -0.08, 0.0];
      break;
    }
    case 'deagle': {
      part(g, 0.04, 0.05, 0.25, 0, 0.025, -0.07, m.chrome);
      part(g, 0.036, 0.035, 0.2, 0, -0.01, -0.06, m.chrome);
      part(g, 0.036, 0.12, 0.05, 0, -0.075, 0.03, m.black, -0.2);
      part(g, 0.008, 0.012, 0.008, 0, 0.055, -0.18, m.chrome);
      mag = new THREE.Group(); part(mag, 0.03, 0.02, 0.045, 0, -0.01, 0, m.black); mag.position.set(0, -0.13, 0.045); g.add(mag);
      muzzle.position.set(0, 0.025, -0.2);
      sightY = 0.06; grip = [0, -0.08, 0.03]; fore = [0, -0.08, 0];
      break;
    }
    case 'revolver': {
      cyl(g, 0.012, 0.09, 0, 0.02, -0.1, m.chrome);
      const c = cyl(g, 0.03, 0.05, 0, 0.0, -0.03, m.chrome, 'z', 6);
      void c;
      part(g, 0.03, 0.04, 0.09, 0, 0.0, 0.01, m.chrome);
      part(g, 0.034, 0.1, 0.045, 0, -0.06, 0.05, m.wood, -0.35);
      mag = new THREE.Group(); mag.position.set(0, 0, -0.03); g.add(mag);
      muzzle.position.set(0, 0.02, -0.15);
      sightY = 0.04; grip = [0, -0.07, 0.05]; fore = [0, -0.07, 0.02];
      break;
    }
    case 'knife': {
      part(g, 0.025, 0.03, 0.12, 0, 0, 0.04, m.poly);
      const b = part(g, 0.006, 0.035, 0.19, 0, 0.005, -0.12, m.blade);
      b.scale.set(1, 1, 1);
      mag = new THREE.Group(); g.add(mag);
      muzzle.position.set(0, 0, -0.2);
      sightY = 0.02; grip = [0, -0.02, 0.04]; fore = [0, -0.06, 0.05];
      break;
    }
    default: {
      part(g, 0.06, 0.08, 0.5, 0, 0, -0.2, m.black);
      muzzle.position.set(0, 0, -0.5);
    }
  }
  g.add(muzzle);
  return { group: g, muzzle, sightY, mag, grip, fore };
}

// First-person arms + gun.
export function buildViewmodel(model, sleeveColor, skin) {
  const gun = buildGun(model);
  const root = new THREE.Group();
  root.add(gun.group);
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const sleeve = new THREE.MeshStandardMaterial({ color: sleeveColor, roughness: 0.9 });
  const arm = (pos, toward, isLeft) => {
    const a = new THREE.Group();
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.1), skinMat);
    a.add(hand);
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.34), sleeve);
    forearm.position.set(0, -0.02, 0.21);
    a.add(forearm);
    a.position.set(...pos);
    a.rotation.set(0.25, toward, isLeft ? -0.3 : 0.2);
    root.add(a);
    return a;
  };
  const isPistol = ['pistol', 'pistol_ext', 'deagle', 'revolver', 'knife'].includes(model);
  arm([gun.grip[0] + 0.005, gun.grip[1], gun.grip[2]], -0.25, false);
  const left = arm([gun.fore[0] - (isPistol ? 0.03 : 0.02), gun.fore[1], gun.fore[2] + (isPistol ? 0.02 : 0)], isPistol ? 0.15 : 0.55, true);
  return { root, gun, left };
}

export const SKINS = [0x5a3a24, 0x6b4428, 0x3d2616, 0x8a5a3a, 0x4a2f1c, 0xa0704a, 0x2e1d12];
const HATS = ['cap', 'durag', 'beanie', 'none', 'cap', 'bucket'];

// Third-person soldier. Root sits at the feet.
export function buildCharacter(color, opts = {}) {
  const m = mats();
  const skin = opts.skin ?? SKINS[Math.floor(Math.random() * SKINS.length)];
  const root = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color });
  const pants = new THREE.MeshLambertMaterial({ color: [0x1f2a44, 0x2b2b2b, 0x3a4a63, 0x4a3b2b][Math.floor(Math.random() * 4)] });
  const skinM = new THREE.MeshLambertMaterial({ color: skin });
  const shoe = new THREE.MeshLambertMaterial({ color: Math.random() < 0.5 ? 0xf0f0f0 : 0x111111 });
  const body = new THREE.Group();
  root.add(body);

  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.12, 0.92, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.88, 0.22), pants); leg.position.y = -0.44; hip.add(leg);
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.1, 0.32), shoe); sh.position.set(0, -0.87, -0.04); hip.add(sh);
    body.add(hip); legs.push(hip);
  }
  const upper = new THREE.Group(); upper.position.y = 0.92; body.add(upper);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirt); torso.position.y = 0.33; upper.add(torso);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.16), shirt); hood.position.set(0, 0.62, 0.12); upper.add(hood);
  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.015, 6, 16, Math.PI), m.gold);
  chain.rotation.set(0, 0, Math.PI); chain.position.set(0, 0.56, -0.16); upper.add(chain);
  const pend = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.02), m.gold); pend.position.set(0, 0.43, -0.165); upper.add(pend);

  const head = new THREE.Group(); head.position.y = 0.7; upper.add(head);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.26), skinM); skull.position.y = 0.14; head.add(skull);
  const hat = opts.hat ?? HATS[Math.floor(Math.random() * HATS.length)];
  const hatMat = new THREE.MeshLambertMaterial({ color: opts.hatColor ?? (Math.random() < 0.5 ? color : 0x111111) });
  if (hat === 'cap') {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.28), hatMat); c.position.y = 0.3; head.add(c);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.16), hatMat); b.position.set(0, 0.27, Math.random() < 0.5 ? -0.2 : 0.2); head.add(b);
  } else if (hat === 'durag') {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.275, 0.12, 0.275), hatMat); c.position.y = 0.25; head.add(c);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.22), hatMat); t.position.set(0, 0.2, 0.22); t.rotation.x = 0.6; head.add(t);
  } else if (hat === 'beanie') {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.28), hatMat); c.position.y = 0.3; head.add(c);
  } else if (hat === 'bucket') {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 8), hatMat); c.position.y = 0.3; head.add(c);
  }
  // shades for some
  if (Math.random() < 0.4) {
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.02), m.black); sh.position.set(0, 0.17, -0.135); head.add(sh);
  }

  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.33, 0.56, 0);
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.58, 0.15), shirt); a.position.y = -0.27; sh.add(a);
    const hnd = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), skinM); hnd.position.y = -0.6; sh.add(hnd);
    upper.add(sh); arms.push(sh);
  }
  const gunHolder = new THREE.Group();
  gunHolder.position.set(0.12, 0.38, -0.32);
  upper.add(gunHolder);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  let tag = null;
  if (opts.name) {
    tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTag(opts.name, opts.tagColor || '#fff'), depthTest: false, transparent: true }));
    tag.scale.set(1.6, 0.3, 1); tag.position.y = 2.25; tag.renderOrder = 5;
    root.add(tag);
  }

  return { root, body, upper, head, legs, arms, gunHolder, tag, shirt, skin, gunModel: null };
}

export function setCharacterGun(ch, model) {
  if (ch.gunModel === model) return;
  ch.gunHolder.clear();
  const gun = buildGun(model);
  gun.group.scale.setScalar(1.15);
  gun.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  ch.gunHolder.add(gun.group);
  ch.gunModel = model;
  ch.muzzle = gun.muzzle;
}

// pose: { speed, phase, pitch, crouch, dead (0..1) }
export function poseCharacter(ch, pose) {
  const sw = Math.sin(pose.phase) * Math.min(1, pose.speed / 5) * 0.7;
  const crouch = pose.crouch || 0;
  ch.legs[0].rotation.x = sw - crouch * 1.1;
  ch.legs[1].rotation.x = -sw - crouch * 0.2;
  ch.legs[0].scale.y = ch.legs[1].scale.y = 1;
  ch.body.position.y = -crouch * 0.45;
  ch.upper.rotation.x = crouch * 0.15;
  const p = pose.pitch || 0;
  // arms hold the weapon forward, following the look pitch
  ch.arms[1].rotation.set(Math.PI / 2 - 0.15 + p, 0, 0.0);
  ch.arms[0].rotation.set(Math.PI / 2 - 0.05 + p, 0, -0.55);
  ch.gunHolder.rotation.x = p;
  ch.gunHolder.position.y = 0.38 + Math.sin(p) * 0.3;
  ch.head.rotation.x = p * 0.7;
}
