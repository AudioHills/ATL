// Third-person characters: jointed, physically shaded bodies with IK-driven arms.
import * as THREE from 'three';
import { RoundedBoxGeometry } from '../lib/addons/geometries/RoundedBoxGeometry.js';
import { nameTag } from './textures.js';
import * as MT from './materials.js';
import { buildGun, mats } from './guns.js';

export const SKINS = [0x5a3a24, 0x6b4428, 0x3d2616, 0x8a5a3a, 0x4a2f1c, 0xa0704a, 0x2e1d12];
const HATS = ['cap', 'durag', 'beanie', 'none', 'cap', 'bucket', 'none'];
const JEANS = ['#283a5c', '#1d2333', '#3a4e70', '#2b2b2b', '#4a3e30'];
const SHOES = [0xf2f2f2, 0x111111, 0xb71c1c, 0xe0c9a0];

function cap(r, len, mat, seg = 12) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, seg), mat);
}

// Third-person soldier. Root sits at the feet, facing -z.
export function buildCharacter(color, opts = {}) {
  const m = mats();
  const skin = opts.skin ?? SKINS[Math.floor(Math.random() * SKINS.length)];
  const root = new THREE.Group();
  const top = MT.fabricSet('#' + new THREE.Color(color).getHexString(), 'cotton');
  const shirt = new THREE.MeshStandardMaterial({ map: top.map, normalMap: top.normalMap, roughness: 0.95 });
  const jean = MT.fabricSet(JEANS[Math.floor(Math.random() * JEANS.length)], 'denim');
  const pants = new THREE.MeshStandardMaterial({ map: jean.map, normalMap: jean.normalMap, roughness: 0.9 });
  const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.5 });
  const shoeCol = SHOES[Math.floor(Math.random() * SHOES.length)];
  const shoe = new THREE.MeshStandardMaterial({ color: shoeCol, roughness: 0.55 });
  const sole = new THREE.MeshStandardMaterial({ color: shoeCol === 0xf2f2f2 ? 0xe8e8e8 : 0xf0f0f0, roughness: 0.8 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x0d0b0a, roughness: 0.9 });
  const body = new THREE.Group();
  root.add(body);

  const pelvis = new THREE.Group(); pelvis.position.y = 0.92; body.add(pelvis);
  const hips = cap(0.13, 0.16, pants); hips.rotation.z = Math.PI / 2; hips.scale.set(1, 1, 0.75); pelvis.add(hips);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 6, 20), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }));
  belt.rotation.x = Math.PI / 2; belt.scale.set(1.12, 0.78, 1); belt.position.y = 0.07; pelvis.add(belt);

  const legs = [], knees = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.1, -0.02, 0); pelvis.add(hip);
    const thigh = cap(0.085, 0.28, pants); thigh.position.y = -0.21; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
    const shin = cap(0.07, 0.3, pants); shin.position.y = -0.2; knee.add(shin);
    // baggy jeans stack at the ankle
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.08, 12), pants); stack.position.y = -0.38; knee.add(stack);
    const foot = new THREE.Group(); foot.position.y = -0.42; knee.add(foot);
    const upperShoe = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.09, 0.27, 2, 0.04), shoe); upperShoe.position.set(0, -0.0, -0.05); foot.add(upperShoe);
    const soleM = new THREE.Mesh(new RoundedBoxGeometry(0.115, 0.03, 0.285, 2, 0.012), sole); soleM.position.set(0, -0.05, -0.05); foot.add(soleM);
    const swoosh = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.02, 0.1), new THREE.MeshStandardMaterial({ color: shoeCol === 0x111111 ? 0xffffff : 0x111111 }));
    swoosh.position.set(s * 0.057, -0.005, -0.04); swoosh.rotation.x = 0.2; foot.add(swoosh);
    legs.push(hip); knees.push(knee);
  }

  const spine = new THREE.Group(); spine.position.y = 0.05; pelvis.add(spine);
  const torso = cap(0.16, 0.26, shirt, 16); torso.position.y = 0.26; torso.scale.set(1.12, 1, 0.74); spine.add(torso);
  const chest = cap(0.12, 0.14, shirt, 16); chest.rotation.z = Math.PI / 2; chest.position.y = 0.43; chest.scale.set(1, 1.2, 0.85); spine.add(chest);
  // hoodie details
  const pocket = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.11, 0.04, 2, 0.015), shirt); pocket.position.set(0, 0.16, -0.12); spine.add(pocket);
  const hood = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.045, 8, 16, Math.PI * 1.3), shirt);
  hood.rotation.set(Math.PI / 2 + 0.4, 0, -Math.PI * 0.15); hood.position.set(0, 0.56, 0.05); spine.add(hood);
  const stringM = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 });
  for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 4), stringM); d.position.set(s * 0.04, 0.45, -0.145); spine.add(d); }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.1, 12), skinM); neck.position.y = 0.55; spine.add(neck);
  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 24), m.gold);
  chain.rotation.x = Math.PI / 2 - 0.35; chain.position.set(0, 0.52, -0.03); spine.add(chain);
  const pend = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.065, 0.015, 2, 0.006), m.gold); pend.position.set(0, 0.43, -0.135); spine.add(pend);

  const head = new THREE.Group(); head.position.y = 0.58; spine.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), skinM); skull.scale.set(0.93, 1.1, 1.0); skull.position.y = 0.11; head.add(skull);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), skinM); jaw.scale.set(1, 0.8, 1); jaw.position.set(0, 0.04, -0.02); head.add(jaw);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.04, 8), skinM); nose.rotation.x = -Math.PI / 2 + 0.3; nose.position.set(0, 0.1, -0.11); head.add(nose);
  const eyeW = new THREE.MeshStandardMaterial({ color: 0xe8e2d8, roughness: 0.3 });
  const iris = new THREE.MeshStandardMaterial({ color: 0x1a0f08, roughness: 0.1 });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), eyeW); e.position.set(s * 0.038, 0.13, -0.093); e.scale.set(1, 0.7, 0.6); head.add(e);
    const ir = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), iris); ir.position.set(s * 0.038, 0.13, -0.1); head.add(ir);
    const brow = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.009, 0.012, 1, 0.003), hair); brow.position.set(s * 0.04, 0.155, -0.097); brow.rotation.z = -s * 0.12; head.add(brow);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), skinM); ear.scale.set(0.5, 1, 0.8); ear.position.set(s * 0.104, 0.11, 0); head.add(ear);
  }
  const mouth = new THREE.Mesh(new RoundedBoxGeometry(0.045, 0.008, 0.01, 1, 0.003), new THREE.MeshStandardMaterial({ color: 0x3a1c14 })); mouth.position.set(0, 0.06, -0.1); head.add(mouth);
  // hair: short fade cap, optional beard
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.113, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), hair);
  hairCap.scale.set(0.95, 1.1, 1.02); hairCap.position.y = 0.115; head.add(hairCap);
  if (Math.random() < 0.45) {
    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.088, 14, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.4), hair);
    beard.scale.set(1, 0.9, 1); beard.position.set(0, 0.075, -0.015); head.add(beard);
  }
  const hat = opts.hat ?? HATS[Math.floor(Math.random() * HATS.length)];
  const hatCol = opts.hatColor ?? (Math.random() < 0.5 ? color : 0x111111);
  const hatMat = new THREE.MeshStandardMaterial({ color: hatCol, roughness: 0.85 });
  if (hat === 'cap') {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.118, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hatMat); crown.scale.set(1, 0.85, 1.05); crown.position.y = 0.16; head.add(crown);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 20, 1, false, -Math.PI / 2 - 0.9, 1.8), hatMat);
    const back = Math.random() < 0.4;
    brim.position.set(0, 0.165, back ? 0.07 : -0.07); brim.rotation.y = back ? Math.PI : 0; brim.rotation.x = back ? -0.1 : 0.1; head.add(brim);
  } else if (hat === 'durag') {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.118, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshPhysicalMaterial({ color: hatCol, roughness: 0.25, sheen: 1, sheenColor: 0xffffff })); c.scale.set(0.97, 1.08, 1.04); c.position.y = 0.115; head.add(c);
    const t = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.008, 0.24, 1, 0.003), c.material); t.position.set(0, 0.08, 0.17); t.rotation.x = 1.1; head.add(t);
  } else if (hat === 'beanie') {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hatMat); c.scale.set(1, 1.15, 1.05); c.position.y = 0.13; head.add(c);
    const fold = new THREE.Mesh(new THREE.CylinderGeometry(0.121, 0.122, 0.04, 18), hatMat); fold.position.y = 0.15; head.add(fold);
  } else if (hat === 'bucket') {
    const pts = [new THREE.Vector2(0, 0.08), new THREE.Vector2(0.1, 0.075), new THREE.Vector2(0.115, 0.0), new THREE.Vector2(0.17, -0.03)];
    const c = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), new THREE.MeshStandardMaterial({ color: hatCol, roughness: 0.9, side: THREE.DoubleSide })); c.position.y = 0.17; head.add(c);
  }
  if (Math.random() < 0.35) {
    const shades = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.035, 0.02, 2, 0.008), new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.05, metalness: 0.5, clearcoat: 1 }));
    shades.position.set(0, 0.13, -0.11); head.add(shades);
  }

  const arms = [], elbows = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.19, 0.47, 0); spine.add(sh);
    const delt = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), shirt); sh.add(delt);
    const upper = cap(0.06, 0.2, shirt); upper.position.y = -0.14; sh.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.29; sh.add(elbow);
    const fore = cap(0.052, 0.18, shirt); fore.position.y = -0.12; elbow.add(fore);
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.038, 0.05, 10), skinM); wrist.position.y = -0.25; elbow.add(wrist);
    const hnd = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.09, 0.08, 2, 0.02), skinM); hnd.position.y = -0.3; elbow.add(hnd);
    arms.push(sh); elbows.push(elbow);
  }
  const gunHolder = new THREE.Group();
  gunHolder.position.set(0.1, 0.36, -0.26);
  spine.add(gunHolder);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // soft contact shadow under the feet
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshBasicMaterial({ map: MT.blobShadow(), transparent: true, depthWrite: false, opacity: 0.7 }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; blob.renderOrder = 1; root.add(blob);

  let tag = null;
  if (opts.name) {
    tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTag(opts.name, opts.tagColor || '#fff'), depthTest: false, transparent: true }));
    tag.scale.set(1.6, 0.3, 1); tag.position.y = 2.2; tag.renderOrder = 5;
    root.add(tag);
  }

  return { root, body, pelvis, spine, upper: spine, head, legs, knees, arms, elbows, gunHolder, tag, shirt, skin, gunModel: null, blob };
}

export function setCharacterGun(ch, model) {
  if (ch.gunModel === model) return;
  ch.gunHolder.clear();
  const gun = buildGun(model);
  gun.group.scale.setScalar(1.1);
  gun.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  ch.gunHolder.add(gun.group);
  ch.gunModel = model;
  ch.muzzle = gun.muzzle;
  ch.gripPt = new THREE.Vector3(...gun.grip).multiplyScalar(1.1);
  ch.forePt = new THREE.Vector3(...gun.fore).multiplyScalar(1.1);
  ch.pistol = ['pistol', 'pistol_ext', 'deagle', 'revolver', 'knife'].includes(model);
}

// Two-bone IK: rotate shoulder and elbow so the hand lands on target (spine space).
const DOWN = new THREE.Vector3(0, -1, 0);
const _d = new THREE.Vector3(), _n = new THREE.Vector3(), _u = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3(), _pole = new THREE.Vector3(), _q = new THREE.Quaternion();
function ik(sh, elbow, target, side) {
  const a = 0.29, b = 0.3;
  _d.subVectors(target, sh.position);
  const d = Math.min(a + b - 0.002, Math.max(0.08, _d.length()));
  _d.normalize();
  _pole.set(side * 0.7, -1, 0.5).normalize();
  _n.crossVectors(_d, _pole);
  if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0);
  _n.normalize();
  const alpha = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  _u.copy(_d).applyAxisAngle(_n, alpha);
  sh.quaternion.setFromUnitVectors(DOWN, _u);
  _e.copy(sh.position).addScaledVector(_u, a);
  _f.subVectors(target, _e).normalize();
  _q.copy(sh.quaternion).invert();
  _f.applyQuaternion(_q);
  elbow.quaternion.setFromUnitVectors(DOWN, _f);
}
const _gp = new THREE.Vector3(), _fp = new THREE.Vector3();

// pose: { speed, phase, pitch, crouch, dead (0..1) }
export function poseCharacter(ch, pose) {
  const spd = Math.min(1.4, pose.speed / 5);
  const ph = pose.phase;
  const c = pose.crouch || 0;
  const swing = Math.sin(ph) * 0.65 * spd;
  // legs: hip swing + knee bend on the back-swing; crouch folds both
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    const sw = s * swing;
    const kneeBend = Math.max(0, Math.sin(ph * 1 + (s > 0 ? 0 : Math.PI) - 1.2)) * 1.1 * spd;
    ch.legs[i].rotation.x = sw * (1 - c * 0.6) + c * (i === 0 ? 1.45 : 0.25);
    ch.knees[i].rotation.x = -kneeBend - c * (i === 0 ? 1.9 : 1.6);
  }
  // kneel on one knee when crouched: rear leg drops lower
  ch.body.position.y = -c * 0.42 - Math.abs(Math.cos(ph)) * 0.03 * spd;
  ch.spine.rotation.x = c * 0.18 - spd * 0.08;
  const p = pose.pitch || 0;
  // the weapon sits at the shoulder (rifles) or out front (pistols); hands are placed by IK
  const pistol = ch.pistol;
  ch.gunHolder.rotation.x = p;
  ch.gunHolder.position.set(pistol ? 0.03 : 0.11, (pistol ? 0.4 : 0.38) + Math.sin(p) * 0.22, pistol ? -0.42 : -0.24);
  if (ch.gripPt) {
    _gp.copy(ch.gripPt).applyAxisAngle(new THREE.Vector3(1, 0, 0), p).multiplyScalar(1).add(ch.gunHolder.position);
    _fp.copy(ch.forePt).applyAxisAngle(new THREE.Vector3(1, 0, 0), p).add(ch.gunHolder.position);
    if (pistol) _fp.copy(_gp).add(new THREE.Vector3(-0.04, -0.01, 0.02));
    ik(ch.arms[1], ch.elbows[1], _gp, 1);
    ik(ch.arms[0], ch.elbows[0], _fp, -1);
  }
  ch.head.rotation.x = p * 0.6;
  // subtle idle breathing
  ch.spine.scale.y = 1 + Math.sin(performance.now() * 0.002) * 0.004;
}
