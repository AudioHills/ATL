// A single match: soldiers, modes, scoring, combat resolution, killstreaks.
import * as THREE from 'three';
import { World } from './world.js';
import { Effects } from './effects.js';
import { Soldier, RADIUS } from './soldier.js';
import { BotBrain } from './bot.js';
import { buildCharacter, setCharacterGun, poseCharacter } from './models.js';
import { raySphere, rayBox, boxNormal } from './physics.js';
import { MAPS } from './maps.js';
import {
  TEAMS, WEAPONS, MODES, DIFFICULTY, BOT_NAMES, PRIMARIES, SECONDARIES, PERKS, STREAKS, GUN_LADDER, DEFAULT_CLASSES,
} from './config.js';
import { flagTex } from './textures.js';

const FFA_COLORS = ['#e53935', '#43a047', '#1e88e5', '#fdd835', '#8e24aa', '#00acc1', '#f4511e', '#6d4c41', '#ec407a', '#7cb342', '#5c6bc0', '#26a69a'];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _dir = new THREE.Vector3();

function randomLoadout() {
  if (Math.random() < 0.5) return DEFAULT_CLASSES[Math.floor(Math.random() * DEFAULT_CLASSES.length)];
  return {
    primary: PRIMARIES[Math.floor(Math.random() * PRIMARIES.length)],
    secondary: SECONDARIES[Math.floor(Math.random() * SECONDARIES.length)],
    perks: PERKS.map((slot) => slot[Math.floor(Math.random() * slot.length)].id),
  };
}

export class Game {
  constructor(app, opts) {
    this.app = app;
    this.scene = app.scene;
    this.audio = app.audio;
    this.hud = app.hud;
    this.opts = opts;
    this.mode = MODES[opts.mode];
    this.def = MAPS[opts.map];
    this.diffKey = opts.difficulty;
    this.diff = DIFFICULTY[opts.difficulty];
    this.teams = this.mode.teams;
    this.world = new World(this.scene, this.def, { lowGfx: opts.lowGfx });
    this.effects = new Effects(this.scene);
    this.soldiers = [];
    this.bots = [];
    this.time = 0;
    this.timeLeft = this.mode.time;
    this.teamScore = { A: 0, B: 0 };
    this.ended = false;
    this.grenades = [];
    this.strikes = [];
    this.helis = [];
    this.uav = new Map(); // key: team id or soldier id -> until
    this.tags = [];
    this.flags = [];
    this.firstBlood = false;
    this.pathBudget = 3;
    this.announced60 = false;
    this.leadState = 0;
    this.setupSoldiers();
    if (this.mode.id === 'dom') this.setupFlags();
    for (const s of this.soldiers) this.spawn(s, true);
  }

  dispose() {
    this.world.dispose();
    this.scene.remove(this.effects.group);
    for (const s of this.soldiers) if (s.model) this.scene.remove(s.model.root);
    for (const g of this.grenades) this.scene.remove(g.mesh);
    for (const t of this.tags) this.scene.remove(t.mesh);
    for (const f of this.flags) this.scene.remove(f.group);
    for (const h of this.helis) this.scene.remove(h.mesh);
    for (const st of this.strikes) if (st.plane) this.scene.remove(st.plane);
  }

  // ---------- setup ----------
  setupSoldiers() {
    const o = this.opts;
    const total = Math.max(2, o.bots + 1);
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const playerTeam = this.teams ? o.team : 'p0';
    const player = new Soldier({
      name: o.playerName || 'You', team: playerTeam, isPlayer: true,
      color: this.teams ? TEAMS[playerTeam].color : '#ffffff', loadout: o.loadout,
    });
    this.player = player;
    this.soldiers.push(player);
    for (let i = 1; i < total; i++) {
      let team;
      if (this.teams) {
        const enemy = playerTeam === 'A' ? 'B' : 'A';
        // player's team gets one fewer bot so teams are even (player counts)
        team = i % 2 === 1 ? enemy : playerTeam;
      } else team = 'b' + i;
      const color = this.teams ? TEAMS[team].color : FFA_COLORS[i % FFA_COLORS.length];
      const s = new Soldier({ name: names[i % names.length], team, color, loadout: randomLoadout() });
      const isMate = this.teams && team === playerTeam;
      s.model = buildCharacter(color, { name: isMate ? s.name : null, tagColor: '#7fd3ff' });
      this.scene.add(s.model.root);
      s.brain = new BotBrain(s, this);
      this.soldiers.push(s);
      this.bots.push(s);
    }
  }

  setupFlags() {
    const letters = ['A', 'B', 'C'];
    this.def.flags.forEach(([x, z], i) => {
      const group = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 4.0, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; group.add(ring);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(3.6, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05; group.add(disc);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      pole.position.y = 1.6; group.add(pole);
      const banner = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.04), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      banner.position.set(0.58, 2.8, 0); group.add(banner);
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: flagTex(letters[i], '#555'), depthTest: false, transparent: true }));
      icon.scale.set(1.2, 1.2, 1); icon.position.y = 4.4; icon.renderOrder = 6; group.add(icon);
      group.position.set(x, 0, z);
      this.scene.add(group);
      this.flags.push({ letter: letters[i], x, z, owner: null, progress: 0, ring, disc, banner, icon, group, contested: false });
    });
  }

  // ---------- helpers ----------
  isEnemy(a, b) { return a !== b && a.team !== b.team; }
  teamOf(s) { return this.teams ? s.team : s.id; }
  hasUav(s) {
    const t = this.uav.get(this.teams ? s.team : s.id);
    return t && t > this.time;
  }
  enemyUavUp(s) {
    for (const [k, t] of this.uav) if (t > this.time && k !== (this.teams ? s.team : s.id)) return true;
    return false;
  }
  now() { return this.time; }

  equip(s) {
    if (this.mode.id === 'gun') {
      s.equip([GUN_LADDER[Math.min(s.gunLevel, GUN_LADDER.length - 1)]]);
    } else {
      s.equip([s.loadout.primary, s.loadout.secondary]);
    }
    if (s.model) setCharacterGun(s.model, s.weapon.def.model);
  }

  // ---------- spawning ----------
  spawn(s, initial) {
    if (s.isPlayer && this.pendingLoadout) { s.setLoadout(this.pendingLoadout); this.pendingLoadout = null; }
    if (s.brain && !initial && Math.random() < 0.25) s.setLoadout(randomLoadout());
    const p = this.pickSpawn(s, initial);
    s.pos.set(p[0], 0, p[1]);
    s.pos.y = this.world.groundAt(p[0], p[1], RADIUS, 0);
    s.vel.set(0, 0, 0);
    // face the middle of the map
    const cx = (this.world.minX + this.world.maxX) / 2, cz = (this.world.minZ + this.world.maxZ) / 2;
    s.yaw = Math.atan2(-(cx - p[0]), -(cz - p[1])) + (Math.random() - 0.5) * 0.6;
    s.pitch = 0;
    s.health = 100;
    s.alive = true;
    s.crouch = false; s.crouchAmt = 0; s.sprinting = false;
    s.damageBy.clear();
    s.grenades = 2;
    s.spawnTime = this.time;
    s.lastFired = -99;
    this.equip(s);
    if (s.model) { s.model.root.visible = true; s.model.root.rotation.set(0, s.yaw, 0); s.model.root.position.copy(s.pos); }
    if (s.brain) s.brain.reset();
    if (s.isPlayer) this.app.player?.onSpawn();
  }

  pickSpawn(s, initial) {
    const w = this.world;
    let cands = [];
    if (this.teams) {
      const own = this.def.spawns[s.team];
      const other = this.def.spawns[s.team === 'A' ? 'B' : 'A'];
      cands = own.map((p) => ({ p, bonus: 18 }));
      if (!initial) {
        cands.push(...other.map((p) => ({ p, bonus: 0 })));
        for (let i = 0; i < 6; i++) cands.push({ p: w.randomWalkablePoint(0, 0, 60), bonus: -5 });
      }
    } else {
      cands = [...this.def.spawns.A, ...this.def.spawns.B].map((p) => ({ p, bonus: 0 }));
      for (let i = 0; i < 10; i++) cands.push({ p: w.randomWalkablePoint(0, 0, 60), bonus: 0 });
    }
    let best = null, bs = -Infinity;
    for (const c of cands) {
      const [x, z] = c.p;
      let minD = 60, seen = false, mateNear = 0;
      for (const o of this.soldiers) {
        if (!o.alive || o === s) continue;
        const d = Math.hypot(o.pos.x - x, o.pos.z - z);
        if (this.isEnemy(s, o)) {
          minD = Math.min(minD, d);
          if (d < 45 && !seen && w.los(o.pos.x, o.eyeY, o.pos.z, x, 1.5, z)) seen = true;
        } else if (d < 15) mateNear++;
      }
      // spread out initial spawns
      let crowd = 0;
      for (const o of this.soldiers) if (o.alive && o !== s && Math.hypot(o.pos.x - x, o.pos.z - z) < 1.5) crowd++;
      const score = Math.min(minD, 40) + c.bonus - (seen ? 35 : 0) + Math.min(mateNear, 2) * 3 - crowd * 50 + Math.random() * 6;
      if (score > bs) { bs = score; best = c.p; }
    }
    const [i, j] = w.nearestWalkable(best[0] + (Math.random() - 0.5), best[1] + (Math.random() - 0.5));
    return w.cellCenter(i, j);
  }

  // ---------- combat ----------
  muzzlePos(s, out) {
    if (s.isPlayer) {
      s.aimDir(_dir);
      const right = _v2.set(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
      return out.set(s.pos.x, s.eyeY, s.pos.z).addScaledVector(_dir, 0.7).addScaledVector(right, 0.12 * (1 - s.adsT)).add({ x: 0, y: -0.1, z: 0 });
    }
    if (s.model && s.model.muzzle) { s.model.muzzle.getWorldPosition(out); return out; }
    return out.set(s.pos.x, s.eyeY - 0.2, s.pos.z);
  }

  fire(s) {
    const def = s.weapon.def;
    s.lastFired = this.time;
    if (def.melee) { this.melee(s, true); return; }
    const pellets = def.pellets || 1;
    const spread = s.spread();
    const ox = s.pos.x, oy = s.eyeY, oz = s.pos.z;
    const muzzle = this.muzzlePos(s, new THREE.Vector3());
    s.aimDir(_dir);
    const base = _dir.clone();
    // build an orthonormal basis for the spread cone
    const up = Math.abs(base.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(base, up).normalize();
    const up2 = new THREE.Vector3().crossVectors(right, base).normalize();
    let anyHit = false;
    for (let k = 0; k < pellets; k++) {
      const r = spread * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
      const d = base.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up2, Math.sin(a) * r).normalize();
      const hit = this.traceBullet(s, ox, oy, oz, d, 300);
      const end = new THREE.Vector3(ox + d.x * hit.t, oy + d.y * hit.t, oz + d.z * hit.t);
      if (k < 3 || Math.random() < 0.3) this.effects.tracer(muzzle, end);
      if (hit.soldier) {
        anyHit = true;
        let dmg = this.falloff(def, hit.t);
        if (hit.head) dmg *= def.head;
        if (s.hasPerk('stopping')) dmg *= 1.2;
        this.effects.impact(end, null, true);
        this.damage(hit.soldier, dmg, s, s.weapon.id, { head: hit.head, fromX: ox, fromZ: oz, dist: hit.t, pellet: pellets > 1 });
      } else if (hit.hit) {
        const n = hit.hit === 'floor' ? new THREE.Vector3(0, 1, 0) : hit.hit === 'ceiling' ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(...boxNormal(hit.hit, end.x, end.y, end.z));
        if (Math.random() < (pellets > 1 ? 0.35 : 1)) this.effects.impact(end, n, false);
      }
    }
    void anyHit;
    s.bloom = Math.min(s.bloom + def.recoil * 0.45, 6);
    this.effects.flash(muzzle, s.isPlayer ? 0.0 : 0.55, 0.05);
    this.effects.muzzleLight(muzzle);
    this.playShot(s, def);
    for (const b of this.bots) if (b !== s && b.alive) b.brain.hear(s.pos.x, s.pos.z, this.time);
  }

  playShot(s, def) {
    const p = this.player;
    if (s.isPlayer) { this.audio.shot(def.sound, 0, 0); return; }
    const dx = s.pos.x - p.pos.x, dz = s.pos.z - p.pos.z;
    const dist = Math.hypot(dx, dz);
    // pan: project onto player's right vector
    const pan = dist > 0.1 ? (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / dist : 0;
    this.audio.shot(def.sound, dist, pan * 0.8);
  }

  falloff(def, d) {
    if (d <= def.r1) return def.dmg;
    if (d >= def.r2) return def.minDmg;
    return def.dmg + (def.minDmg - def.dmg) * (d - def.r1) / (def.r2 - def.r1);
  }

  traceBullet(s, ox, oy, oz, d, maxT) {
    const wh = this.world.raycast(ox, oy, oz, d.x, d.y, d.z, maxT);
    let t = wh.t, soldier = null, head = false;
    for (const o of this.soldiers) {
      if (!o.alive || o === s || !this.isEnemy(s, o)) continue;
      const dx = o.pos.x - ox, dz = o.pos.z - oz;
      if (dx * dx + dz * dz > (t + 1) * (t + 1)) continue;
      const th = raySphere(ox, oy, oz, d.x, d.y, d.z, o.pos.x, o.headY, o.pos.z, 0.2, t);
      if (th < t) { t = th; soldier = o; head = true; }
      const top = o.pos.y + 1.5 - 0.45 * o.crouchAmt;
      const tb = rayBox(ox, oy, oz, d.x, d.y, d.z, { minX: o.pos.x - 0.3, maxX: o.pos.x + 0.3, minY: o.pos.y, maxY: top, minZ: o.pos.z - 0.3, maxZ: o.pos.z + 0.3 }, t);
      if (tb < t) { t = tb; soldier = o; head = false; }
    }
    return { t, soldier, head, hit: soldier ? null : wh.hit };
  }

  melee(s, isKnifeWeapon) {
    if (s.meleeT > 0 && !isKnifeWeapon) return;
    s.meleeT = isKnifeWeapon ? 0.0 : 0.6;
    s.lastFired = this.time;
    this.audio.swish();
    s.aimDir(_dir);
    let best = null, bd = isKnifeWeapon ? 2.6 : 2.2;
    for (const o of this.soldiers) {
      if (!o.alive || !this.isEnemy(s, o)) continue;
      const dx = o.pos.x - s.pos.x, dz = o.pos.z - s.pos.z, dy = o.chestY - s.eyeY;
      const d = Math.hypot(dx, dz);
      if (d > bd || Math.abs(dy) > 1.5) continue;
      const dot = (dx * _dir.x + dz * _dir.z) / (d * Math.hypot(_dir.x, _dir.z) || 1);
      if (dot < 0.55 && d > 1.0) continue;
      if (!this.world.los(s.pos.x, s.eyeY, s.pos.z, o.pos.x, o.chestY, o.pos.z)) continue;
      best = o; bd = d;
    }
    if (best) {
      // lunge
      s.vel.x += (best.pos.x - s.pos.x) * 3; s.vel.z += (best.pos.z - s.pos.z) * 3;
      this.damage(best, 200, s, 'knife', { melee: true, fromX: s.pos.x, fromZ: s.pos.z, dist: bd });
    }
  }

  damage(v, amount, attacker, weaponId, o = {}) {
    if (!v.alive || this.ended) return;
    if (attacker && attacker !== v && !this.isEnemy(attacker, v)) return;
    // spawn protection until you shoot
    if (attacker !== v && this.time - v.spawnTime < 1.5 && v.lastFired < v.spawnTime) amount *= 0.25;
    if (v.isPlayer) amount *= this.diff.dmgTaken;
    v.health -= amount;
    v.lastHurt = this.time;
    v.lastAttacker = attacker;
    if (attacker && attacker !== v) v.damageBy.set(attacker.id, { s: attacker, t: this.time });
    const killed = v.health <= 0;
    if (attacker && attacker.isPlayer && attacker !== v) {
      this.hud.hitmarker(!!o.head, killed);
      if (!o.pellet || killed || !this._pelletTick) { this.audio.hitmarker(o.head); this._pelletTick = true; setTimeout(() => (this._pelletTick = false), 30); }
    }
    if (v.isPlayer) {
      this.hud.damageFrom(o.fromX ?? v.pos.x, o.fromZ ?? v.pos.z, amount);
      if (Math.random() < 0.5) this.audio.hurt();
    }
    if (v.brain && attacker && attacker !== v) v.brain.hear(attacker.pos.x, attacker.pos.z, this.time);
    if (killed) this.kill(v, attacker, weaponId, o);
  }

  kill(v, k, weaponId, o) {
    v.alive = false;
    v.health = 0;
    v.deaths++;
    v.deadT = 0;
    v.bestStreak = Math.max(v.bestStreak, v.streak);
    const victimStreak = v.streak;
    v.streak = 0;
    v.streaksEarned.clear();
    v.respawnAt = this.time + (v.isPlayer ? 3.2 : 2.6 + Math.random());
    v.lastKiller = k && k !== v ? k : null;
    v.deathPos = v.pos.clone();
    const wname = o.explosive ? (weaponId === 'airstrike' ? 'Airstrike' : weaponId === 'heli' ? 'Ghetto Bird' : 'Frag') : (WEAPONS[weaponId]?.name || 'Knife');
    if (o.melee && weaponId !== 'knife') weaponId = 'knife';
    this.hud.killfeed(k && k !== v ? k : null, v, o.melee ? 'Knife' : wname, !!o.head);

    if (k && k !== v) {
      k.kills++;
      k.streak++;
      k.bestStreak = Math.max(k.bestStreak, k.streak);
      if (o.head) k.headshots++;
      let pts = 100;
      const medals = [];
      if (o.head) { pts += 50; medals.push(['Headshot', 50]); }
      if (!this.firstBlood) { this.firstBlood = true; medals.push(['First Blood', 100]); pts += 100; }
      if (this.time - k.lastKillTime < 4) k.multiKill++; else k.multiKill = 1;
      k.lastKillTime = this.time;
      const multi = { 2: 'Double Kill', 3: 'Triple Kill', 4: 'Fury Kill', 5: 'Frenzy Kill' }[k.multiKill] || (k.multiKill > 5 ? 'Mega Kill' : null);
      if (multi) { medals.push([multi, 50 * k.multiKill]); pts += 50 * k.multiKill; }
      if (k.lastKiller === v) { medals.push(['Payback', 50]); pts += 50; k.lastKiller = null; }
      if ((o.dist || 0) > 40 && !o.explosive) { medals.push(['Longshot', 50]); pts += 50; }
      if (o.melee) { medals.push(['Up Close & Personal', 50]); pts += 50; }
      if (victimStreak >= 3) { medals.push(['Buzzkill', 75]); pts += 75; }
      if (k.streak === 5) medals.push(['Rampage', 0]);
      if (k.streak === 10) medals.push(['Untouchable', 0]);
      if (!k.alive) { medals.push(['Afterlife', 25]); pts += 25; }
      k.score += pts;
      if (k.hasPerk('scavenger')) {
        for (const w of k.weapons) w.reserve = Math.max(w.reserve, Math.min(w.def.reserve, w.reserve + w.def.mag));
        k.grenades = Math.max(k.grenades, 1);
      }
      if (k.isPlayer) {
        this.audio.kill();
        this.hud.popup(`+${100}`, 'Kill');
        for (const [m, p] of medals) this.hud.medal(m, p);
      }
      // killstreak rewards (not from streak kills in gun game)
      if (this.mode.id !== 'gun' && !o.streakKill) this.checkStreaks(k);
      // mode scoring
      if (this.mode.id === 'tdm') this.teamScore[k.team]++;
      if (this.mode.id === 'gun') this.gunGameKill(k, v, o);
    } else if (this.mode.id === 'gun' && v.gunLevel > 0 && !k) {
      // suicide drops a level in gun game
    }
    // assists
    for (const [, d] of v.damageBy) {
      const a = d.s;
      if (a === k || this.time - d.t > 6 || !a) continue;
      a.assists++; a.score += 50;
      if (a.isPlayer) this.hud.popup('+50', 'Assist');
    }
    if (this.mode.id === 'kc') this.dropTag(v);

    // body
    if (v.model) {
      v.deathFall = { dir: Math.random() < 0.5 ? 1 : -1, side: (Math.random() - 0.5) * 0.6 };
    }
    if (v.isPlayer) {
      this.app.player.onDeath(k && k !== v ? k : null, wname);
    }
    this.checkEnd();
  }

  gunGameKill(k, v, o) {
    k.gunLevel++;
    if (k.gunLevel >= GUN_LADDER.length) { k.score += 500; this.checkEnd(true); return; }
    k.score += 50;
    if (o.melee && v.gunLevel > 0) {
      v.gunLevel--;
      if (v.isPlayer) this.hud.announce('SET BACK! Knifed down a level', '#ff5252', 2);
      if (k.isPlayer) this.hud.medal('Humiliation', 100);
    }
    if (k.alive) {
      const before = k.weapon.def.name;
      this.equip(k);
      if (k.isPlayer) {
        this.app.player.onWeaponsChanged();
        this.hud.announce(`${before} → ${k.weapon.def.name}`, '#ffd54f', 1.6);
        this.audio.pickup();
      }
    }
    if (k.gunLevel === GUN_LADDER.length - 1) {
      this.hud.announce(k.isPlayer ? 'KNIFE LEVEL — GET A STAB' : `${k.name} is on the KNIFE`, '#ff9100', 2.5);
    }
  }

  checkStreaks(k) {
    const hard = k.hasPerk('hardline') ? 1 : 0;
    for (const st of STREAKS) {
      const need = st.kills - hard;
      if (k.streak >= need && !k.streaksEarned.has(st.id)) {
        k.streaksEarned.add(st.id);
        if (!k.streaksReady.includes(st.id)) k.streaksReady.push(st.id);
        if (k.isPlayer) {
          this.hud.announce(`${st.name.toUpperCase()} READY — PRESS [${st.key}]`, '#00e5ff', 2.5);
          this.audio.streak();
        }
      }
    }
  }

  activateStreak(s, id) {
    const i = s.streaksReady.indexOf(id);
    if (i < 0 || !s.alive) return false;
    s.streaksReady.splice(i, 1);
    const mine = this.teams ? this.player.team === s.team : s.isPlayer;
    const key = this.teams ? s.team : s.id;
    if (id === 'uav') {
      this.uav.set(key, Math.max(this.uav.get(key) || 0, this.time) + 30);
      this.hud.announce(mine ? 'UAV ONLINE' : 'ENEMY UAV SPOTTED', mine ? '#00e5ff' : '#ff5252', 2);
      this.audio.beep(mine);
    } else if (id === 'airstrike') {
      this.callAirstrike(s);
      this.hud.announce(mine ? 'AIRSTRIKE INBOUND' : 'ENEMY AIRSTRIKE INBOUND!', mine ? '#00e5ff' : '#ff5252', 2.5);
    } else if (id === 'heli') {
      this.spawnHeli(s);
      this.hud.announce(mine ? 'GHETTO BIRD IN THE AIR' : 'ENEMY CHOPPER OVERHEAD!', mine ? '#00e5ff' : '#ff5252', 2.5);
    }
    return true;
  }

  // ---------- killstreak entities ----------
  callAirstrike(s) {
    const targets = this.soldiers.filter((o) => o.alive && this.isEnemy(s, o)).sort(() => Math.random() - 0.5).slice(0, 3).map((o) => [o.pos.x, o.pos.z]);
    while (targets.length < 3) {
      const f = this.def.flags[Math.floor(Math.random() * this.def.flags.length)];
      targets.push([f[0], f[1]]);
    }
    const bombs = [];
    let t = 1.6;
    for (const [x, z] of targets) {
      for (let k = 0; k < 3; k++) {
        bombs.push({ at: this.time + t, x: x + (Math.random() - 0.5) * 6, z: z + (Math.random() - 0.5) * 6 });
        t += 0.18;
      }
      t += 0.25;
    }
    let plane = null;
    if (!this.world.indoor) {
      plane = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({ color: 0x2b3036 });
      const fus = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 9), mat); plane.add(fus);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.2, 2.4), mat); wing.position.z = 0.5; plane.add(wing);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 1.6), mat); tail.position.set(0, 1.1, 3.8); plane.add(tail);
      const [ax, az] = targets[0], [bx, bz] = targets[targets.length - 1];
      const dir = new THREE.Vector3(bx - ax, 0, bz - az);
      if (dir.lengthSq() < 1) dir.set(1, 0, 0);
      dir.normalize();
      plane.userData = { from: new THREE.Vector3(ax, 45, az).addScaledVector(dir, -120), dir, start: this.time };
      plane.lookAt(plane.userData.from.clone().sub(dir));
      plane.position.copy(plane.userData.from);
      this.scene.add(plane);
      setTimeout(() => this.audio.jet(), 600);
    }
    this.strikes.push({ owner: s, bombs, plane, end: this.time + t + 2 });
  }

  spawnHeli(s) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x1e2126 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 4.2), mat); g.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 4.5), mat); tail.position.set(0, 0.3, 4); g.add(tail);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 1.2), new THREE.MeshLambertMaterial({ color: 0x223344 })); glass.position.set(0, 0.2, -2.2); g.add(glass);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.35), new THREE.MeshLambertMaterial({ color: 0x111111 })); rotor.position.y = 1.15; g.add(rotor);
    const rotor2 = rotor.clone(); rotor2.rotation.y = Math.PI / 2; g.add(rotor2);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshBasicMaterial({ color: s.team === this.player.team ? 0x00e5ff : 0xff1744 }));
    light.position.set(0, -0.9, -1.5); g.add(light);
    const indoor = this.world.indoor;
    if (indoor) g.scale.setScalar(0.45);
    this.scene.add(g);
    const w = this.world;
    this.helis.push({
      owner: s, mesh: g, rotors: [rotor, rotor2], until: this.time + 30, ang: Math.random() * 6,
      h: indoor ? 5.6 : 20, R: Math.min(w.maxX - w.minX, w.maxZ - w.minZ) * (indoor ? 0.32 : 0.3),
      cx: (w.minX + w.maxX) / 2, cz: (w.minZ + w.maxZ) / 2, target: null, retarget: 0, fireCd: 0, burst: 0,
    });
  }

  updateStreakEntities(dt) {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const st = this.strikes[i];
      for (const b of st.bombs) {
        if (!b.done && this.time >= b.at) { b.done = true; this.explode(new THREE.Vector3(b.x, 0.2, b.z), st.owner, 'airstrike', 8, 180); }
      }
      if (st.plane) {
        const u = st.plane.userData;
        st.plane.position.copy(u.from).addScaledVector(u.dir, (this.time - u.start) * 85);
      }
      if (this.time > st.end) { if (st.plane) this.scene.remove(st.plane); this.strikes.splice(i, 1); }
    }
    for (let i = this.helis.length - 1; i >= 0; i--) {
      const h = this.helis[i];
      h.ang += dt * 0.22;
      const x = h.cx + Math.cos(h.ang) * h.R, z = h.cz + Math.sin(h.ang) * h.R;
      h.mesh.position.set(x, h.h + Math.sin(this.time * 1.3) * 0.4, z);
      h.mesh.rotation.y = -h.ang + Math.PI;
      h.mesh.rotation.z = 0.12;
      for (const r of h.rotors) r.rotation.y += dt * 30;
      h.retarget -= dt;
      if (h.retarget <= 0) {
        h.retarget = 0.4;
        h.target = null;
        let bd = 70;
        for (const o of this.soldiers) {
          if (!o.alive || !this.isEnemy(h.owner, o)) continue;
          const d = Math.hypot(o.pos.x - x, o.pos.z - z, o.pos.y - h.h);
          if (d < bd && this.world.los(x, h.h - 1.2, z, o.pos.x, o.chestY, o.pos.z)) { bd = d; h.target = o; }
        }
      }
      h.fireCd -= dt;
      if (h.target && h.target.alive && h.fireCd <= 0) {
        h.burst++;
        h.fireCd = h.burst % 10 === 0 ? 0.9 : 0.09;
        const from = new THREE.Vector3(x, h.h - 1.2, z);
        const tgt = new THREE.Vector3(h.target.pos.x, h.target.chestY, h.target.pos.z);
        const d = tgt.clone().sub(from).normalize();
        d.x += (Math.random() - 0.5) * 0.06; d.y += (Math.random() - 0.5) * 0.06; d.z += (Math.random() - 0.5) * 0.06; d.normalize();
        const hit = this.traceBullet(h.owner, from.x, from.y, from.z, d, 150);
        const end = from.clone().addScaledVector(d, hit.t);
        this.effects.tracer(from, end, true);
        if (hit.soldier) { this.effects.impact(end, null, true); this.damage(hit.soldier, 24, h.owner, 'heli', { explosive: true, streakKill: true, fromX: x, fromZ: z, dist: hit.t }); }
        else this.effects.impact(end, new THREE.Vector3(0, 1, 0), false);
        const dist = Math.hypot(x - this.player.pos.x, z - this.player.pos.z);
        this.audio.shot({ f: 700, d: 0.1, g: 0.8, thump: 60 }, dist, 0);
      }
      if (this.time > h.until) { this.scene.remove(h.mesh); this.helis.splice(i, 1); }
    }
  }

  // ---------- grenades ----------
  throwGrenade(s, power = 1) {
    if (s.grenades <= 0 || !s.alive) return false;
    s.grenades--;
    s.aimDir(_dir);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshLambertMaterial({ color: 0x3b4a2a }));
    const pos = new THREE.Vector3(s.pos.x, s.eyeY - 0.1, s.pos.z).addScaledVector(_dir, 0.4);
    const vel = _dir.clone().multiplyScalar(9 + 9 * power);
    vel.y += 3.5;
    vel.x += s.vel.x * 0.5; vel.z += s.vel.z * 0.5;
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.grenades.push({ owner: s, pos, vel, t: 2.3, mesh });
    this.audio.swish();
    return true;
  }

  updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.t -= dt;
      const steps = 3;
      for (let k = 0; k < steps; k++) {
        const h = dt / steps;
        g.vel.y -= 22 * h;
        const prev = g.pos.clone();
        g.pos.addScaledVector(g.vel, h);
        if (g.pos.y < 0.09) { g.pos.y = 0.09; g.vel.y *= -0.35; g.vel.x *= 0.7; g.vel.z *= 0.7; }
        if (g.pos.y > this.world.ceiling - 0.1) { g.pos.y = this.world.ceiling - 0.1; g.vel.y *= -0.3; }
        for (const c of this.world.near(g.pos.x, g.pos.z, 1)) {
          if (c.tag === 'fence') continue;
          if (g.pos.x > c.minX && g.pos.x < c.maxX && g.pos.y > c.minY && g.pos.y < c.maxY && g.pos.z > c.minZ && g.pos.z < c.maxZ) {
            if (prev.y >= c.maxY) { g.pos.y = c.maxY + 0.09; g.vel.y *= -0.35; g.vel.x *= 0.7; g.vel.z *= 0.7; }
            else if (prev.x <= c.minX || prev.x >= c.maxX) { g.pos.x = prev.x; g.vel.x *= -0.4; g.vel.z *= 0.8; }
            else if (prev.z <= c.minZ || prev.z >= c.maxZ) { g.pos.z = prev.z; g.vel.z *= -0.4; g.vel.x *= 0.8; }
            else { g.pos.copy(prev); g.vel.multiplyScalar(-0.3); }
          }
        }
      }
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += dt * 10;
      if (g.t <= 0) {
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
        this.explode(g.pos, g.owner, 'frag', 7, 150);
      }
    }
  }

  explode(pos, owner, kind, R, maxDmg) {
    this.effects.explosion(pos);
    const p = this.player;
    const dist = Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z);
    const pan = dist > 0.1 ? ((pos.x - p.pos.x) * Math.cos(p.yaw) - (pos.z - p.pos.z) * Math.sin(p.yaw)) / dist : 0;
    this.audio.explosion(dist, pan);
    this.app.player?.shake(Math.max(0, 1 - dist / 30) * 0.8);
    for (const o of this.soldiers) {
      if (!o.alive) continue;
      if (o !== owner && !this.isEnemy(owner, o)) continue;
      const d = Math.hypot(o.pos.x - pos.x, o.chestY - (pos.y + 0.5), o.pos.z - pos.z);
      if (d > R) continue;
      if (!this.world.los(pos.x, pos.y + 0.4, pos.z, o.pos.x, o.chestY, o.pos.z)) continue;
      const dmg = maxDmg * Math.pow(1 - d / R, 0.8) * (o === owner ? 0.6 : 1);
      this.damage(o, dmg, owner, kind, { explosive: true, streakKill: kind !== 'frag', fromX: pos.x, fromZ: pos.z, dist: d });
    }
    for (const b of this.bots) if (b.alive) b.brain.hear(pos.x, pos.z, this.time);
  }

  // ---------- modes ----------
  dropTag(v) {
    const g = new THREE.Group();
    const color = this.teams ? TEAMS[v.team].hex : 0xffd54f;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 18), new THREE.MeshStandardMaterial({ color: 0xffd54f, metalness: 1, roughness: 0.2, emissive: 0x332200 }));
    g.add(ring);
    const pend = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.05), new THREE.MeshBasicMaterial({ color }));
    pend.position.y = -0.28; g.add(pend);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.effects.smokeTex, color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(1.4, 1.4, 1); g.add(glow);
    g.position.set(v.pos.x, v.pos.y + 0.9, v.pos.z);
    this.scene.add(g);
    this.tags.push({ x: v.pos.x, z: v.pos.z, y: v.pos.y, team: v.team, victim: v, mesh: g, until: this.time + 30 });
  }

  updateTags(dt) {
    for (let i = this.tags.length - 1; i >= 0; i--) {
      const t = this.tags[i];
      t.mesh.rotation.y += dt * 3;
      t.mesh.position.y = t.y + 0.9 + Math.sin(this.time * 4 + i) * 0.12;
      let taken = null;
      for (const s of this.soldiers) {
        if (!s.alive) continue;
        if (Math.hypot(s.pos.x - t.x, s.pos.z - t.z) < 2.1 && Math.abs(s.pos.y - t.y) < 1.8) { taken = s; break; }
      }
      if (taken) {
        if (taken.team !== t.team) {
          this.teamScore[taken.team]++;
          taken.confirms++;
          taken.score += 50;
          if (taken.isPlayer) { this.hud.popup('+50', 'Chain Snatched'); this.audio.pickup(); }
        } else {
          taken.score += 50;
          if (taken.isPlayer) { this.hud.popup('+50', 'Kill Denied'); this.audio.pickup(); }
        }
        if (t.victim.isPlayer && taken.team !== t.team) this.hud.announce('Your chain got snatched', '#ff5252', 1.5);
      }
      if (taken || this.time > t.until) {
        this.scene.remove(t.mesh);
        this.tags.splice(i, 1);
        if (taken) this.checkEnd();
      }
    }
  }

  updateFlags(dt) {
    this.domTick = (this.domTick || 0) + dt;
    const tick = this.domTick >= 1;
    if (tick) this.domTick -= 1;
    for (const f of this.flags) {
      let a = 0, b = 0;
      const inside = [];
      for (const s of this.soldiers) {
        if (!s.alive) continue;
        if (Math.hypot(s.pos.x - f.x, s.pos.z - f.z) < 3.8) { if (s.team === 'A') a++; else b++; inside.push(s); }
      }
      f.contested = a > 0 && b > 0;
      f.playerInside = inside.includes(this.player);
      if (!f.contested && (a || b)) {
        const team = a ? 'A' : 'B';
        const n = a || b;
        const rate = dt / 6 * (1 + 0.35 * (n - 1)) * (team === 'A' ? 1 : -1);
        if (f.owner !== team) {
          const before = f.progress;
          f.progress = Math.max(-1, Math.min(1, f.progress + rate));
          if (f.owner && Math.sign(before) !== Math.sign(f.progress) && before !== 0) {
            f.owner = null;
          }
          if ((team === 'A' && f.progress >= 1) || (team === 'B' && f.progress <= -1)) {
            f.owner = team;
            for (const s of inside) {
              s.captures++; s.score += 150;
              if (s.isPlayer) { this.hud.popup('+150', `Captured ${f.letter}`); }
            }
            const mine = team === this.player.team;
            this.hud.announce(mine ? `WE GOT ${f.letter}` : `THEY TOOK ${f.letter}`, mine ? '#00e5ff' : '#ff5252', 2);
            this.audio.capture(mine);
          }
        } else {
          // owner standing on it slowly restores full ownership
          f.progress = Math.max(-1, Math.min(1, f.progress + rate));
        }
      } else if (!a && !b && !f.owner) {
        f.progress *= Math.max(0, 1 - dt * 0.3);
      }
      if (tick && f.owner) this.teamScore[f.owner]++;
      // visuals
      const col = f.owner ? (f.owner === this.player.team ? 0x29b6f6 : 0xff3d3d) : 0xffffff;
      f.ring.material.color.setHex(f.contested ? 0xffd600 : col);
      f.disc.material.color.setHex(col);
      f.banner.material.color.setHex(f.owner ? TEAMS[f.owner].hex : 0xdddddd);
      const iconCol = f.owner ? (f.owner === this.player.team ? '#1e88e5' : '#e53935') : '#555555';
      if (f.iconCol !== iconCol) { f.icon.material.map = flagTex(f.letter, iconCol); f.iconCol = iconCol; }
    }
    if (tick) this.checkEnd();
  }

  checkEnd(gunWin) {
    if (this.ended) return;
    let over = false;
    if (this.teams) {
      if (this.teamScore.A >= this.mode.limit || this.teamScore.B >= this.mode.limit) over = true;
    } else if (this.mode.id === 'gun') {
      if (gunWin || this.soldiers.some((s) => s.gunLevel >= GUN_LADDER.length)) over = true;
    } else if (this.soldiers.some((s) => s.kills >= this.mode.limit)) over = true;
    if (this.timeLeft <= 0) over = true;
    if (over) this.endMatch();
  }

  standings() {
    const key = this.mode.id === 'gun' ? (s) => s.gunLevel * 10000 + s.kills * 10 - s.deaths * 0.01 : this.teams ? (s) => s.score : (s) => s.kills * 10000 + s.score;
    return [...this.soldiers].sort((a, b) => key(b) - key(a));
  }

  endMatch() {
    this.ended = true;
    let win;
    if (this.teams) {
      const my = this.teamScore[this.player.team], their = this.teamScore[this.player.team === 'A' ? 'B' : 'A'];
      win = my > their ? 'win' : my < their ? 'lose' : 'draw';
    } else {
      const st = this.standings();
      const place = st.indexOf(this.player);
      win = place === 0 ? 'win' : place <= 2 ? 'top3' : 'lose';
    }
    this.result = win;
    this.app.onMatchEnd(this, win);
  }

  // ---------- frame ----------
  update(dt) {
    if (this.ended) { this.effects.update(dt); this.animateModels(dt); return; }
    this.time += dt;
    this.timeLeft -= dt;
    this.pathBudget = 3;
    if (this.timeLeft <= 60 && !this.announced60) { this.announced60 = true; this.hud.announce('ONE MINUTE REMAINING', '#ffd54f', 2); this.audio.beep(true); }
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.checkEnd(); if (this.ended) return; }

    // bots
    for (const b of this.bots) {
      if (!b.alive) {
        b.deadT += dt;
        if (this.time >= b.respawnAt) this.spawn(b);
        continue;
      }
      const input = b.brain.update(dt, this.time);
      if (b.sprinting && input.z < 0.5) b.sprinting = false;
      const shoot = b.updateWeapon(dt, input.fire, input.ads);
      if (shoot) this.fire(b);
      b.physics(dt, this.world, input, input.jump);
      // quick melee when someone is in your face
      const t = b.brain.target;
      if (t && t.alive && !b.weapon.def.melee && b.meleeT <= 0 && Math.hypot(t.pos.x - b.pos.x, t.pos.z - b.pos.z) < 1.7 && Math.random() < dt * 2) this.melee(b);
    }
    this.app.player.update(dt);
    if (!this.player.alive) {
      this.player.deadT += dt;
    }
    this.updateGrenades(dt);
    this.updateStreakEntities(dt);
    if (this.mode.id === 'dom') this.updateFlags(dt);
    if (this.mode.id === 'kc') this.updateTags(dt);
    this.world.update(dt, this.time);
    this.effects.update(dt);
    this.animateModels(dt);
    this.updateLeadAnnouncer();
  }

  updateLeadAnnouncer() {
    if (!this.teams) return;
    const my = this.teamScore[this.player.team], their = this.teamScore[this.player.team === 'A' ? 'B' : 'A'];
    const st = my > their ? 1 : my < their ? -1 : 0;
    if (st !== this.leadState && (my + their) > 3) {
      if (st === 1) this.hud.announce('WE TOOK THE LEAD', '#00e5ff', 1.6);
      if (st === -1) this.hud.announce('WE LOST THE LEAD', '#ff5252', 1.6);
      this.leadState = st;
    }
  }

  animateModels(dt) {
    for (const s of this.bots) {
      const m = s.model;
      if (!m) continue;
      m.root.position.copy(s.pos);
      if (s.alive) {
        m.root.rotation.set(0, s.yaw, 0);
        m.body.rotation.set(0, 0, 0);
        m.body.position.x = 0;
        poseCharacter(m, { speed: Math.hypot(s.vel.x, s.vel.z), phase: s.walkPhase, pitch: s.pitch, crouch: s.crouchAmt });
        if (m.tag) m.tag.visible = true;
      } else {
        const k = Math.min(1, s.deadT / 0.45);
        const e = 1 - Math.pow(1 - k, 3);
        const f = s.deathFall || { dir: 1, side: 0 };
        m.root.rotation.set(0, s.yaw, 0);
        m.body.rotation.set(-f.dir * e * Math.PI / 2 * 0.95, 0, f.side * e);
        m.body.position.y = -e * 0.1;
        if (m.tag) m.tag.visible = false;
        if (s.deadT > 2.4) m.root.position.y -= (s.deadT - 2.4) * 0.8;
        m.root.visible = s.deadT < 3;
      }
    }
  }
}
