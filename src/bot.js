// Bot brain: perception, target selection, aiming, navigation and objective play.
import { findPath, gridLine } from './nav.js';

const TAU = Math.PI * 2;
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

export class BotBrain {
  constructor(soldier, game) {
    this.s = soldier;
    this.game = game;
    this.reset();
    this.skillJitter = 0.85 + Math.random() * 0.3;
  }

  reset() {
    this.target = null;
    this.reactT = 0;
    this.trackT = 0;
    this.path = null; this.pathI = 0; this.repathAt = 0;
    this.goal = null; this.goalKind = null; this.goalUntil = 0;
    this.perceiveAt = 0;
    this.strafe = 0; this.strafeT = 0;
    this.burstT = 0; this.pauseT = 0;
    this.lastPos = null; this.stuckT = 0;
    this.heard = null;
    this.aimOffYaw = 0; this.aimOffPitch = 0;
    this.lookYaw = null;
    this.crouchT = 0;
    this.nadeCd = 6 + Math.random() * 8;
    this.semiT = 0;
    this.lastSeen = null;
    this.streakDelay = 0;
  }

  hear(x, z, t) {
    const dx = x - this.s.pos.x, dz = z - this.s.pos.z;
    if (dx * dx + dz * dz < 45 * 45) this.heard = { x, z, t };
  }

  update(dt, now) {
    const s = this.s, g = this.game, diff = g.diff;
    const input = { x: 0, z: 0, jump: false, fire: false, ads: false };

    if (now >= this.perceiveAt) {
      this.perceiveAt = now + 0.12 + Math.random() * 0.08;
      this.perceive(now);
    }
    // use killstreaks
    if (s.streaksReady.length) {
      this.streakDelay += dt;
      if (this.streakDelay > 1.5) { g.activateStreak(s, s.streaksReady[0]); this.streakDelay = 0; }
    }

    const t = this.target;
    const w = s.weapon, def = w.def;
    if (t && t.alive) {
      this.trackT += dt;
      const dx = t.pos.x - s.pos.x, dz = t.pos.z - s.pos.z;
      const dist = Math.hypot(dx, dz);
      // desired aim: chest, sometimes head, with error that shrinks while tracking
      const aimY = this.aimHead ? t.headY : t.chestY - 0.1;
      const wantYaw = Math.atan2(-dx, -dz);
      const wantPitch = Math.atan2(aimY - s.eyeY, dist);
      const errScale = diff.aimErr * this.skillJitter * Math.max(0.25, 1 - this.trackT * diff.aimLearn * 0.5) * (Math.PI / 180);
      if (Math.random() < dt * 4) {
        this.aimOffYaw = (Math.random() - 0.5) * 2 * errScale;
        this.aimOffPitch = (Math.random() - 0.5) * 1.4 * errScale;
      }
      const turn = (4 + diff.aimLearn * 2) * dt;
      const dy = angDiff(s.yaw, wantYaw + this.aimOffYaw);
      s.yaw += Math.max(-turn, Math.min(turn, dy));
      const dp = wantPitch + this.aimOffPitch - s.pitch;
      s.pitch += Math.max(-turn, Math.min(turn, dp));

      this.reactT -= dt;
      const onTarget = Math.abs(dy) < 0.12 + 1.2 / Math.max(dist, 1);
      if (def.melee) {
        // knife: run at them
        this.moveToward(t.pos.x, t.pos.z, input, dt, now, true);
        input.fire = dist < 2.4 && onTarget;
        s.sprinting = dist > 5;
      } else {
        const inRange = dist < def.r2 * 1.6 + 10;
        if (this.reactT <= 0 && onTarget && inRange) {
          if (def.auto) {
            if (this.pauseT > 0) this.pauseT -= dt;
            else {
              input.fire = true;
              this.burstT += dt;
              const burstLen = dist > 25 ? 0.35 : 1.2;
              if (this.burstT > burstLen * diff.fireHold) { this.burstT = 0; this.pauseT = 0.15 + Math.random() * 0.25; }
            }
          } else {
            this.semiT -= dt;
            if (this.semiT <= 0) { input.fire = true; this.semiT = 60 / def.rpm + 0.08 + Math.random() * 0.25 / diff.fireHold; }
          }
        }
        input.ads = dist > 9 && !def.scope ? true : def.scope ? dist > 6 : false;
        s.sprinting = false;
        // movement while fighting: strafe, close distance with close-range guns
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafe = Math.random() < 0.3 ? 0 : Math.random() < 0.5 ? -1 : 1; this.strafeT = 0.4 + Math.random() * 1.0; }
        input.x = this.strafe;
        const ideal = def.r1 * 0.8;
        if (dist > ideal + 6) input.z = 0.8; else if (dist < Math.min(ideal * 0.4, 4)) input.z = -0.6;
        if (input.z > 0) {
          // when pushing, follow a path so we don't walk into walls
          const steer = this.steer(dt, now, t.pos.x, t.pos.z);
          if (steer) { const rel = this.worldToLocal(steer[0], steer[1]); input.x = rel.x * 0.8 + this.strafe * 0.3; input.z = rel.z * 0.8; }
        }
        // kill confirmed: grab nearby chains even mid-fight
        if (g.mode.id === 'kc') {
          let tag = null, td = 16;
          for (const tg of g.tags) {
            // confirming enemy chains is worth the risk; denying only if it's right there
            const d2 = Math.hypot(tg.x - s.pos.x, tg.z - s.pos.z) * (tg.team === s.team ? 3 : 1);
            if (d2 < td) { td = d2; tag = tg; }
          }
          if (tag) {
            const st = this.steer(dt, now, tag.x, tag.z) || [tag.x, tag.z];
            const rel = this.worldToLocal(st[0], st[1]);
            input.x = rel.x; input.z = rel.z;
          }
        }
        this.crouchT -= dt;
        if (this.crouchT <= 0) { s.crouch = Math.random() < 0.18 && dist > 12; this.crouchT = 1 + Math.random() * 2; }
        // grenades
        this.nadeCd -= dt;
        if (this.nadeCd <= 0 && dist > 9 && dist < 24 && s.grenades > 0 && Math.random() < 0.4) {
          g.throwGrenade(s, Math.min(1, dist / 22));
          this.nadeCd = 10 + Math.random() * 12;
        } else if (this.nadeCd <= 0) this.nadeCd = 3;
      }
      if (w.mag === 0 && w.reserve > 0) s.startReload();
      this.lastSeen = { x: t.pos.x, z: t.pos.z, t: now };
    } else {
      this.target = null;
      this.trackT = 0;
      s.crouch = false;
      // objective / hunting
      if (g.mode.id === 'kc' && this.goalKind !== 'tag' && g.tags.length && Math.random() < dt * 3) {
        for (const tg of g.tags) {
          if (Math.hypot(tg.x - s.pos.x, tg.z - s.pos.z) * (tg.team === s.team ? 2 : 1) < 30) { this.goal = [tg.x, tg.z]; this.goalKind = 'tag'; this.goalUntil = now + 10; this.path = null; break; }
        }
      }
      if (this.goalKind === 'tag' && this.goal && !g.tags.some((tg) => tg.x === this.goal[0] && tg.z === this.goal[1])) this.goal = null;
      if (!this.goal || now > this.goalUntil || this.atGoal()) this.pickGoal(now);
      const steer = this.steer(dt, now, this.goal[0], this.goal[1]);
      if (steer) {
        const rel = this.worldToLocal(steer[0], steer[1]);
        input.x = rel.x; input.z = rel.z;
        const far = Math.hypot(this.goal[0] - s.pos.x, this.goal[1] - s.pos.z) > 12;
        s.sprinting = far && rel.z > 0.7 && this.goalKind !== 'hold';
      } else s.sprinting = false;
      // look where we're going, or toward a noise
      let lookYaw;
      if (this.heard && now - this.heard.t < 3) lookYaw = Math.atan2(-(this.heard.x - s.pos.x), -(this.heard.z - s.pos.z));
      else if (steer) lookYaw = Math.atan2(-(steer[0] - s.pos.x), -(steer[1] - s.pos.z));
      else lookYaw = s.yaw + Math.sin(now * 0.8 + s.id) * 0.02;
      const d = angDiff(s.yaw, lookYaw);
      s.yaw += Math.max(-dt * 5, Math.min(dt * 5, d));
      s.pitch += (0 - s.pitch) * Math.min(1, dt * 4);
      if (w.mag < w.def.mag * 0.4 && w.reserve > 0) s.startReload();
      if (this.heard && now - this.heard.t < 1 && this.goalKind !== 'objective' && Math.random() < 0.02) {
        this.goal = [this.heard.x, this.heard.z]; this.goalKind = 'investigate'; this.goalUntil = now + 8; this.path = null;
      }
    }

    // stuck detection
    if (!this.lastPos) this.lastPos = { x: s.pos.x, z: s.pos.z, t: now };
    if (now - this.lastPos.t > 1.2) {
      const moved = Math.hypot(s.pos.x - this.lastPos.x, s.pos.z - this.lastPos.z);
      if (moved < 0.5 && (Math.abs(input.x) + Math.abs(input.z)) > 0.5) {
        this.stuckT++;
        this.path = null;
        if (this.stuckT > 1) { input.jump = true; this.strafe = -this.strafe || 1; }
        if (this.stuckT > 3) { this.goal = null; this.goalKind = null; this.stuckT = 0; }
      } else this.stuckT = 0;
      this.lastPos = { x: s.pos.x, z: s.pos.z, t: now };
    }
    return input;
  }

  atGoal() {
    const s = this.s;
    const d = Math.hypot(this.goal[0] - s.pos.x, this.goal[1] - s.pos.z);
    if (this.goalKind === 'hold') return false;
    if (this.goalKind === 'objective') return false;
    return d < 2.5;
  }

  perceive(now) {
    const s = this.s, g = this.game;
    let best = null, bestScore = Infinity;
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    for (const o of g.soldiers) {
      if (!o.alive || !g.isEnemy(s, o)) continue;
      const dx = o.pos.x - s.pos.x, dz = o.pos.z - s.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 85) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      const recentlyHurtBy = s.lastAttacker === o && now - s.lastHurt < 2;
      const firing = now - o.lastFired < 0.5 && d < 35;
      if (dot < 0.3 && d > 5 && !recentlyHurtBy && !firing) continue;
      const seeHead = g.world.los(s.pos.x, s.eyeY, s.pos.z, o.pos.x, o.headY, o.pos.z);
      const seeChest = seeHead || g.world.los(s.pos.x, s.eyeY, s.pos.z, o.pos.x, o.chestY, o.pos.z);
      if (!seeChest) continue;
      const score = d * (dot > 0.8 ? 1 : 1.5) * (o === this.target ? 0.6 : 1) * (recentlyHurtBy ? 0.5 : 1);
      if (score < bestScore) { bestScore = score; best = o; }
    }
    if (best !== this.target) {
      this.target = best;
      if (best) {
        const dist = Math.hypot(best.pos.x - s.pos.x, best.pos.z - s.pos.z);
        this.reactT = g.diff.react * (0.75 + Math.random() * 0.6) * (dist < 8 ? 0.8 : 1);
        this.trackT = 0;
        this.aimHead = Math.random() < (g.diffKey === 'veteran' ? 0.4 : 0.2);
        this.burstT = 0;
      }
    }
  }

  pickGoal(now) {
    const s = this.s, g = this.game, w = g.world;
    this.path = null;
    this.goalUntil = now + 12 + Math.random() * 8;
    // objective modes
    if (g.mode.id === 'dom') {
      const flags = g.flags;
      let best = null, bs = Infinity;
      for (const f of flags) {
        const d = Math.hypot(f.x - s.pos.x, f.z - s.pos.z);
        let score = d;
        if (f.owner === s.team) score += 45 + (Math.random() * 30);
        if (f.owner && f.owner !== s.team) score -= 10;
        score += Math.random() * 25;
        if (score < bs) { bs = score; best = f; }
      }
      if (best) {
        const p = w.randomWalkablePoint(best.x, best.z, 2.5);
        this.goal = p; this.goalKind = best.owner === s.team ? 'hunt' : 'objective';
        if (this.goalKind === 'objective') this.goalUntil = now + 25;
        return;
      }
    }
    if (g.mode.id === 'kc' && g.tags.length) {
      let best = null, bd = 40;
      for (const tg of g.tags) {
        const d = Math.hypot(tg.x - s.pos.x, tg.z - s.pos.z) * (tg.team === s.team ? 2 : 1);
        if (d < bd) { bd = d; best = tg; }
      }
      if (best) { this.goal = [best.x, best.z]; this.goalKind = 'tag'; this.goalUntil = now + 10; return; }
    }
    // known enemy positions: UAV or recent sightings
    const uav = g.hasUav(s);
    const enemies = g.soldiers.filter((o) => o.alive && g.isEnemy(s, o) && (uav ? !o.hasPerk('ghost') : now - o.lastFired < 4));
    if (enemies.length && Math.random() < 0.75) {
      enemies.sort((a, b) => Math.hypot(a.pos.x - s.pos.x, a.pos.z - s.pos.z) - Math.hypot(b.pos.x - s.pos.x, b.pos.z - s.pos.z));
      const e = enemies[Math.min(enemies.length - 1, Math.floor(Math.random() * 2))];
      this.goal = w.randomWalkablePoint(e.pos.x, e.pos.z, 4); this.goalKind = 'hunt';
      return;
    }
    if (this.lastSeen && now - this.lastSeen.t < 6) {
      this.goal = w.randomWalkablePoint(this.lastSeen.x, this.lastSeen.z, 3); this.goalKind = 'investigate';
      return;
    }
    // patrol: hot zones (flags positions are good central spots), or random
    const hot = g.def.flags;
    if (Math.random() < 0.6) {
      const f = hot[Math.floor(Math.random() * hot.length)];
      this.goal = w.randomWalkablePoint(f[0], f[1], 8);
    } else {
      this.goal = w.randomWalkablePoint((w.minX + w.maxX) / 2, (w.minZ + w.maxZ) / 2, Math.min(w.maxX - w.minX, w.maxZ - w.minZ) * 0.45);
    }
    this.goalKind = 'patrol';
  }

  // Next waypoint toward (gx, gz) using A* and LOS shortcuts.
  steer(dt, now, gx, gz) {
    const s = this.s, w = this.game.world;
    const here = [s.pos.x, s.pos.z];
    const d = Math.hypot(gx - here[0], gz - here[1]);
    if (d < 0.8) return null;
    if (d < 10 && gridLine(w, here, [gx, gz])) { this.path = null; return [gx, gz]; }
    const moved = this.pathGoal ? Math.hypot(this.pathGoal[0] - gx, this.pathGoal[1] - gz) : Infinity;
    if (!this.path || now > this.repathAt || moved > 3) {
      if (this.game.pathBudget <= 0 && this.path) return this.path[this.pathI] || [gx, gz];
      this.game.pathBudget--;
      this.path = findPath(w, here[0], here[1], gx, gz);
      this.pathI = 0;
      this.pathGoal = [gx, gz];
      this.repathAt = now + 2.5 + Math.random();
      if (!this.path) { this.goalUntil = 0; return [gx, gz]; }
    }
    while (this.pathI < this.path.length - 1) {
      const p = this.path[this.pathI];
      if (Math.hypot(p[0] - here[0], p[1] - here[1]) < 0.9) this.pathI++;
      else break;
    }
    return this.path[this.pathI];
  }

  moveToward(x, z, input, dt, now) {
    const steer = this.steer(dt, now, x, z) || [x, z];
    const rel = this.worldToLocal(steer[0], steer[1]);
    input.x = rel.x; input.z = rel.z;
  }

  // Convert a world target point into local strafe/forward input.
  worldToLocal(x, z) {
    const s = this.s;
    const dx = x - s.pos.x, dz = z - s.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len, nz = dz / len;
    const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
    // forward = (-sy, -cy), right = (cy, -sy)
    return { z: nx * -sy + nz * -cy, x: nx * cy + nz * -sy };
  }
}
