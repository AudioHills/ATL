// A combatant: the human player or a bot. Movement physics and weapon state live here.
import * as THREE from 'three';
import { WEAPONS } from './config.js';

const GRAVITY = 22;
const JUMP_V = 7.4;
export const RADIUS = 0.32;
export const STAND_H = 1.8;
export const CROUCH_H = 1.25;

let nextId = 1;

export class Soldier {
  constructor(opts) {
    this.id = nextId++;
    this.name = opts.name;
    this.team = opts.team;
    this.isPlayer = !!opts.isPlayer;
    this.color = opts.color;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.onGround = true;
    this.crouch = false; this.crouchAmt = 0;
    this.sprinting = false;
    this.health = 100;
    this.alive = false;
    this.respawnAt = 0;
    this.kills = 0; this.deaths = 0; this.score = 0; this.streak = 0; this.assists = 0;
    this.headshots = 0; this.captures = 0; this.confirms = 0; this.bestStreak = 0;
    this.gunLevel = 0;
    this.damageBy = new Map();
    this.streaksReady = [];
    this.streaksEarned = new Set();
    this.lastFired = -99;
    this.lastHurt = -99;
    this.lastKillTime = -99; this.multiKill = 0;
    this.lastKiller = null;
    this.walkPhase = 0;
    this.deadT = 0;
    this.setLoadout(opts.loadout);
  }

  setLoadout(lo) {
    this.loadout = lo;
    this.perks = new Set(lo.perks || []);
  }

  hasPerk(p) { return this.perks.has(p); }

  equip(ids) {
    this.weapons = ids.map((id) => {
      const def = WEAPONS[id];
      return { id, def, mag: def.mag, reserve: def.reserve };
    });
    this.cur = 0;
    this.fireCd = 0; this.burstLeft = 0; this.reloadT = 0; this.swapT = 0.35; this.adsT = 0; this.bloom = 0;
    this.triggerWasDown = false;
    this.meleeT = 0;
  }

  get weapon() { return this.weapons[this.cur]; }

  get height() { return STAND_H - (STAND_H - CROUCH_H) * this.crouchAmt; }
  get eyeY() { return this.pos.y + 1.62 - 0.5 * this.crouchAmt; }
  get headY() { return this.pos.y + 1.66 - 0.48 * this.crouchAmt; }
  get chestY() { return this.pos.y + 1.2 - 0.4 * this.crouchAmt; }

  aimDir(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  speedMult() {
    let m = this.weapon ? this.weapon.def.move : 1;
    if (this.hasPerk('lightweight')) m *= 1.12;
    return m;
  }

  reloadTime() { return this.weapon.def.reload * (this.hasPerk('fasthands') ? 0.65 : 1); }
  adsTime() { return this.weapon.def.adsTime * (this.hasPerk('fasthands') ? 0.65 : 1); }

  // Movement. wish = local {x: strafe, z: forward} in [-1, 1].
  physics(dt, world, wish, jump) {
    const targetCrouch = this.crouch ? 1 : 0;
    this.crouchAmt += (targetCrouch - this.crouchAmt) * Math.min(1, dt * 12);
    // can't stand up under something
    if (!this.crouch && this.crouchAmt > 0.05) {
      const ceil = world.ceilingAt(this.pos.x, this.pos.z, RADIUS, this.pos.y);
      if (ceil < this.pos.y + STAND_H) this.crouchAmt = Math.max(this.crouchAmt, 1);
    }
    let speed = 5.0 * this.speedMult();
    if (this.sprinting) speed *= 1.45;
    if (this.crouchAmt > 0.5) speed *= 0.5;
    speed *= 1 - 0.4 * this.adsT;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    let wx = -sy * wish.z + cy * wish.x;
    let wz = -cy * wish.z - sy * wish.x;
    const len = Math.hypot(wx, wz);
    if (len > 1) { wx /= len; wz /= len; }
    const accel = this.onGround ? 14 : 3;
    this.vel.x += (wx * speed - this.vel.x) * Math.min(1, dt * accel);
    this.vel.z += (wz * speed - this.vel.z) * Math.min(1, dt * accel);
    if (jump && this.onGround) { this.vel.y = JUMP_V; this.onGround = false; this.crouch = false; }
    this.vel.y -= GRAVITY * dt;
    world.move(this.pos, RADIUS, this.height, this.vel.x * dt, this.vel.z * dt);
    const ground = world.groundAt(this.pos.x, this.pos.z, RADIUS, this.pos.y);
    this.pos.y += this.vel.y * dt;
    const ceil = world.ceilingAt(this.pos.x, this.pos.z, RADIUS, this.pos.y - this.vel.y * dt);
    if (this.pos.y + this.height > ceil && this.vel.y > 0) { this.vel.y = 0; this.pos.y = ceil - this.height; }
    if (this.pos.y <= ground) {
      if (!this.onGround && this.vel.y < -12) this.landed = Math.min(1, -this.vel.y / 20);
      this.pos.y = ground; this.vel.y = 0; this.onGround = true;
    } else if (this.pos.y > ground + 0.05) {
      this.onGround = false;
    }
    // step up onto small ledges
    if (this.onGround && ground > this.pos.y) this.pos.y = ground;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += hs * dt * 1.9;
    return hs;
  }

  // Weapon timers. Returns true when a shot should be fired this frame.
  updateWeapon(dt, trigger, wantAds) {
    const w = this.weapon;
    const def = w.def;
    this.fireCd -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 6);
    if (this.meleeT > 0) this.meleeT -= dt;
    if (this.swapT > 0) { this.swapT -= dt; this.adsT = Math.max(0, this.adsT - dt / 0.2); return false; }
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const need = def.mag - w.mag;
        const take = Math.min(need, w.reserve);
        w.mag += take; w.reserve -= take;
        this.reloadT = 0;
      }
    }
    const adsTarget = wantAds && !this.sprinting && this.reloadT <= 0 && this.meleeT <= 0 ? 1 : 0;
    const rate = 1 / Math.max(0.05, this.adsTime());
    this.adsT += Math.sign(adsTarget - this.adsT) * Math.min(Math.abs(adsTarget - this.adsT), dt * rate);

    if (this.reloadT > 0 || this.meleeT > 0) { this.triggerWasDown = trigger; return false; }
    let fire = false;
    if (def.melee) {
      if (trigger && this.fireCd <= 0) { fire = true; this.fireCd = 60 / def.rpm; }
      this.triggerWasDown = trigger;
      return fire;
    }
    if (this.burstLeft > 0) {
      if (this.fireCd <= 0 && w.mag > 0) { fire = true; this.burstLeft--; this.fireCd = this.burstLeft > 0 ? 60 / def.rpm : def.burstDelay; }
      if (w.mag <= 0) this.burstLeft = 0;
    } else if (trigger && this.fireCd <= 0 && !this.sprinting) {
      const fresh = !this.triggerWasDown;
      if (w.mag <= 0) {
        if (fresh) this.emptyClick = true;
        if (w.reserve > 0) this.startReload();
      } else if (def.auto || fresh) {
        if (def.burst) { this.burstLeft = def.burst - 1; fire = true; this.fireCd = 60 / def.rpm; }
        else { fire = true; this.fireCd = 60 / def.rpm; }
      }
    }
    this.triggerWasDown = trigger;
    if (fire) w.mag--;
    if (w.mag <= 0 && w.reserve > 0 && !fire && this.fireCd <= 0 && this.burstLeft <= 0 && !trigger) this.startReload();
    return fire;
  }

  startReload() {
    const w = this.weapon;
    if (w.def.melee || this.reloadT > 0 || w.mag >= w.def.mag || w.reserve <= 0 || this.swapT > 0) return false;
    this.reloadT = this.reloadTime();
    this.burstLeft = 0;
    this.sprinting = false;
    return true;
  }

  switchTo(i) {
    if (i === this.cur || !this.weapons[i]) return false;
    this.cur = i;
    this.reloadT = 0; this.burstLeft = 0;
    this.swapT = 0.45 * (this.hasPerk('fasthands') ? 0.65 : 1);
    this.adsT = 0;
    return true;
  }

  // Spread in radians for the next shot.
  spread() {
    const def = this.weapon.def;
    let s = def.hip + (def.ads - def.hip) * this.adsT;
    const moving = Math.hypot(this.vel.x, this.vel.z) > 1;
    if (moving) s *= 1.35 + 0.15 * (1 - this.adsT);
    if (!this.onGround) s *= 2;
    if (this.crouchAmt > 0.5) s *= 0.8;
    s += this.bloom * (1 - 0.6 * this.adsT);
    return s * Math.PI / 180;
  }
}
