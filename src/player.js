// Human player: input, first-person camera, viewmodel animation.
import * as THREE from 'three';
import { buildViewmodel } from './guns.js';
import { STREAKS } from './config.js';
import { flashSprite } from './textures.js';

export class PlayerController {
  constructor(app, game) {
    this.app = app;
    this.game = game;
    this.s = game.player;
    this.camera = app.camera;
    this.keys = new Set();
    this.mouse = [false, false, false];
    this.lookDX = 0; this.lookDY = 0;
    this.recoilPunch = 0; this.recoilYawPunch = 0;
    this.shakeAmt = 0;
    this.kick = 0;
    this.swayX = 0; this.swayY = 0;
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
    this.vmScene.add(new THREE.HemisphereLight(0xdde6ff, 0x3a2f28, 1.6));
    const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(1, 2, 1); this.vmScene.add(dl);
    this.vmCache = new Map();
    this.vm = null;
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashSprite(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flash.scale.setScalar(0.18);
    this.flash.visible = false;
    this.flashT = 0;
    this.toggleCrouch = false;
    this.onWeaponsChanged();
  }

  setVm() {
    const w = this.s.weapon;
    if (!w) return;
    const key = w.id;
    if (!this.vmCache.has(key)) {
      const vm = buildViewmodel(w.def.model, this.s.color, 0x6b4428);
      this.vmCache.set(key, vm);
    }
    if (this.vm) this.vmScene.remove(this.vm.root);
    this.vm = this.vmCache.get(key);
    this.vmScene.add(this.vm.root);
    this.vm.gun.muzzle.add(this.flash);
    this.vmId = key;
  }

  onWeaponsChanged() { this.setVm(); }
  onSpawn() {
    this.dead = false;
    this.setVm();
    this.recoilPunch = 0;
    this.app.hud.hideDeath();
  }

  onDeath(killer, weaponName) {
    this.dead = true;
    this.killer = killer;
    this.mouse = [false, false, false];
    this.app.hud.showDeath(killer, weaponName, this.game);
  }

  shake(a) { this.shakeAmt = Math.min(1.2, this.shakeAmt + a); }

  // ---- input (wired by main) ----
  keyDown(code) {
    const s = this.s, g = this.game;
    this.keys.add(code);
    if (!s.alive) {
      if (code === 'Space' && g.time >= s.respawnAt) g.spawn(s);
      return;
    }
    switch (code) {
      case 'KeyR': if (s.startReload()) this.app.audio.reload(); break;
      case 'Digit1': if (s.switchTo(0)) this.setVm(); break;
      case 'Digit2': if (s.switchTo(1)) this.setVm(); break;
      case 'KeyQ': if (s.switchTo(s.cur === 0 ? 1 : 0)) this.setVm(); break;
      case 'KeyC': this.toggleCrouch = !this.toggleCrouch; break;
      case 'KeyG': g.throwGrenade(s, 1); break;
      case 'KeyV': case 'KeyF': if (!s.weapon.def.melee) { g.melee(s); this.meleeAnim = 0.35; } break;
      case 'Digit3': case 'Digit4': case 'Digit5': {
        const st = STREAKS.find((x) => x.key === code.slice(-1));
        if (st) g.activateStreak(s, st.id);
        break;
      }
    }
  }
  keyUp(code) { this.keys.delete(code); }
  mouseDown(b) {
    this.mouse[b] = true;
    const s = this.s;
    if (!s.alive && b === 0 && this.game.time >= s.respawnAt) this.game.spawn(s);
  }
  mouseUp(b) { this.mouse[b] = false; }
  wheel(dy) {
    const s = this.s;
    if (!s.alive || s.weapons.length < 2) return;
    if (s.switchTo(s.cur === 0 ? 1 : 0)) this.setVm();
    void dy;
  }
  look(dx, dy) {
    const sens = this.app.settings.sens * 0.0022 * (1 - this.s.adsT * (this.s.weapon.def.scope ? 0.7 : 0.4));
    this.s.yaw -= dx * sens;
    this.s.pitch -= dy * sens * (this.app.settings.invert ? -1 : 1);
    this.s.pitch = Math.max(-1.5, Math.min(1.5, this.s.pitch));
    this.swayX += dx * 0.00012; this.swayY += dy * 0.00012;
  }

  update(dt) {
    const s = this.s, g = this.game, k = this.keys;
    if (s.alive) {
      const wish = { x: 0, z: 0 };
      if (k.has('KeyW')) wish.z += 1;
      if (k.has('KeyS')) wish.z -= 1;
      if (k.has('KeyA')) wish.x -= 1;
      if (k.has('KeyD')) wish.x += 1;
      const sprintKey = k.has('ShiftLeft') || k.has('ShiftRight');
      s.crouch = this.toggleCrouch || k.has('ControlLeft');
      if (sprintKey && wish.z > 0 && !this.mouse[2]) { s.sprinting = true; s.crouch = false; this.toggleCrouch = false; }
      else s.sprinting = false;
      if (this.mouse[0] && s.sprinting) s.sprinting = false;
      const jump = k.has('Space');
      const shot = s.updateWeapon(dt, this.mouse[0], this.mouse[2]);
      if (s.emptyClick) { this.app.audio.click(); s.emptyClick = false; }
      if (shot) {
        g.fire(s);
        const def = s.weapon.def;
        const rec = def.recoil * (1 - 0.45 * s.adsT) * (s.crouchAmt > 0.5 ? 0.8 : 1);
        s.pitch += rec * 0.0085;
        s.yaw += (Math.random() - 0.45) * rec * 0.006;
        this.recoilPunch += rec * 0.01;
        this.kick = Math.min(1, this.kick + 0.4 + def.recoil * 0.1);
        this.flashT = 0.045;
        this.flash.material.rotation = Math.random() * Math.PI;
      }
      if (s.reloadT > 0 && !this.wasReloading) this.app.audio.reload();
      this.wasReloading = s.reloadT > 0;
      s.physics(dt, g.world, wish, jump);
      if (s.landed) { this.shake(s.landed * 0.3); s.landed = 0; }
    }
    this.updateCamera(dt);
    this.updateViewmodel(dt);
  }

  updateCamera(dt) {
    const s = this.s, cam = this.camera;
    this.recoilPunch *= Math.max(0, 1 - dt * 14);
    this.shakeAmt *= Math.max(0, 1 - dt * 3.5);
    const shk = this.shakeAmt * 0.04;
    if (s.alive) {
      const speed = Math.hypot(s.vel.x, s.vel.z);
      const bob = s.onGround ? Math.sin(s.walkPhase * 2) * Math.min(1, speed / 6) * 0.035 * (1 - s.adsT * 0.8) : 0;
      cam.position.set(s.pos.x, s.eyeY + bob, s.pos.z);
      cam.rotation.order = 'YXZ';
      cam.rotation.set(s.pitch + this.recoilPunch + (Math.random() - 0.5) * shk, s.yaw + (Math.random() - 0.5) * shk, 0);
      const def = s.weapon.def;
      const zoom = 1 + (def.zoom - 1) * s.adsT;
      const sprintFov = s.sprinting ? 6 : 0;
      const fov = (this.app.settings.fov + sprintFov) / zoom;
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 18);
      cam.updateProjectionMatrix();
    } else {
      // death cam: rise above the body and look at the killer
      const t = Math.min(1, s.deadT / 1.2);
      const dp = s.deathPos || s.pos;
      const k = this.killer;
      const look = k && k.alive ? new THREE.Vector3(k.pos.x, k.chestY, k.pos.z) : new THREE.Vector3(dp.x, 0.5, dp.z);
      const from = new THREE.Vector3(dp.x, dp.y + 1.5 + t * 2.5, dp.z);
      if (k) {
        const away = new THREE.Vector3(dp.x - k.pos.x, 0, dp.z - k.pos.z).normalize().multiplyScalar(t * 2.5);
        from.add(away);
      }
      cam.position.lerp(from, Math.min(1, dt * 4));
      const m = new THREE.Matrix4().lookAt(cam.position, look, new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      cam.quaternion.slerp(q, Math.min(1, dt * 5));
      cam.fov += (this.app.settings.fov - cam.fov) * Math.min(1, dt * 5);
      cam.updateProjectionMatrix();
    }
  }

  updateViewmodel(dt) {
    const s = this.s, vm = this.vm;
    if (!vm) return;
    const root = vm.root;
    if (!s.alive) { root.visible = false; return; }
    const def = s.weapon.def;
    const scoped = !!def.scope && s.adsT > 0.92;
    root.visible = !scoped;
    this.app.hud.scope(scoped);
    const pistol = ['pistol', 'pistol_ext', 'deagle', 'revolver', 'knife'].includes(def.model);
    const hip = pistol ? new THREE.Vector3(0.17, -0.17, -0.42) : new THREE.Vector3(0.2, -0.21, -0.5);
    const ads = new THREE.Vector3(0, -vm.gun.sightY, pistol ? -0.42 : -0.36);
    const pos = hip.clone().lerp(ads, s.adsT);
    let rx = 0, ry = 0, rz = 0;
    // bob & sway
    const speed = Math.hypot(s.vel.x, s.vel.z);
    const bobAmt = Math.min(1, speed / 6) * (1 - s.adsT * 0.9) * (s.onGround ? 1 : 0.2);
    pos.x += Math.sin(s.walkPhase) * 0.012 * bobAmt;
    pos.y += Math.abs(Math.cos(s.walkPhase)) * 0.012 * bobAmt;
    this.swayX *= Math.max(0, 1 - dt * 8); this.swayY *= Math.max(0, 1 - dt * 8);
    ry += this.swayX * (1 - s.adsT * 0.8) * 2; rx += this.swayY * (1 - s.adsT * 0.8) * 2;
    // sprint pose
    this.sprintT = (this.sprintT || 0) + ((s.sprinting ? 1 : 0) - (this.sprintT || 0)) * Math.min(1, dt * 10);
    pos.x -= 0.04 * this.sprintT; pos.y -= 0.03 * this.sprintT;
    ry += 0.7 * this.sprintT; rx -= 0.25 * this.sprintT; rz += 0.2 * this.sprintT;
    pos.y += Math.sin(s.walkPhase * 2) * 0.015 * this.sprintT;
    // recoil kick
    this.kick *= Math.max(0, 1 - dt * 16);
    pos.z += this.kick * 0.05 * (1 - s.adsT * 0.5);
    rx += this.kick * 0.09 * (1 - s.adsT * 0.6);
    // reload
    if (s.reloadT > 0) {
      const total = s.reloadTime();
      const p = 1 - s.reloadT / total;
      const dip = Math.sin(Math.min(1, p) * Math.PI);
      rx -= dip * 0.5; rz += dip * 0.6; pos.y -= dip * 0.06;
      if (vm.gun.mag) {
        const out = p > 0.2 && p < 0.65 ? Math.sin((p - 0.2) / 0.45 * Math.PI) : 0;
        vm.gun.mag.position.y = (vm.gun.mag.userData.y0 ??= vm.gun.mag.position.y) - out * 0.25;
      }
    } else if (vm.gun.mag && vm.gun.mag.userData.y0 !== undefined) vm.gun.mag.position.y = vm.gun.mag.userData.y0;
    // weapon swap: rise from below
    if (s.swapT > 0) { pos.y -= s.swapT * 0.5; rx -= s.swapT * 1.2; }
    // quick melee / knife swing
    if (this.meleeAnim > 0 || (def.melee && s.fireCd > 60 / def.rpm - 0.3)) {
      const m = def.melee ? Math.max(0, (s.fireCd - (60 / def.rpm - 0.3)) / 0.3) : this.meleeAnim / 0.35;
      const sw = Math.sin(m * Math.PI);
      pos.x -= sw * 0.12; pos.z -= sw * 0.15; ry += sw * 0.9; rz -= sw * 0.6;
      this.meleeAnim = Math.max(0, (this.meleeAnim || 0) - dt);
    }
    root.position.copy(pos);
    root.rotation.set(rx, ry, rz);
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0 && !def.melee;
    this.vmScene.environment = this.game.scene.environment;
    this.vmCamera.aspect = this.camera.aspect;
    this.vmCamera.updateProjectionMatrix();
  }
}
