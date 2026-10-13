// Entry point: renderer, menus, profile persistence, match lifecycle.
import * as THREE from 'three';
import { Game } from './game.js';
import { PlayerController } from './player.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { Post } from './post.js';
import { MAPS, MAP_ORDER } from './maps.js';
import {
  TEAMS, WEAPONS, PRIMARIES, SECONDARIES, PERKS, STREAKS, MODES, DIFFICULTY, DEFAULT_CLASSES, RANKS, XP_PER_LEVEL,
} from './config.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STORE_KEY = 'atl-zone-wars-v1';

function loadProfile() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { p = null; }
  const def = {
    name: 'Lil You', xp: 0, level: 0, selectedClass: 0,
    classes: DEFAULT_CLASSES.map((c) => ({ ...c, perks: [...c.perks] })),
    settings: { sens: 1, fov: 85, sfx: 0.8, music: 0.5, gameMusic: false, invert: false, quality: 'high' },
    last: { mode: 'tdm', map: 'bankhead', difficulty: 'regular', bots: 11, team: 'A' },
    stats: { matches: 0, wins: 0, kills: 0, deaths: 0 },
  };
  if (!p) return def;
  if (p.settings && p.settings.lowGfx && !p.settings.quality) p.settings.quality = 'low';
  return { ...def, ...p, settings: { ...def.settings, ...p.settings }, last: { ...def.last, ...p.last }, stats: { ...def.stats, ...p.stats } };
}
function saveProfile(p) { try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ } }

class App {
  constructor() {
    this.profile = loadProfile();
    this.settings = this.profile.settings;
    this.canvas = $('#game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.05, 900);
    this.camera.rotation.order = 'YXZ';
    this.post = new Post(this.renderer, this.scene, this.camera);
    this.applyQuality();
    this.audio = new AudioEngine();
    this.audio.sfxVol = this.settings.sfx; this.audio.musicVol = this.settings.music;
    this.hud = new Hud($('#hud'), this);
    this.hud.show(false);
    this.game = null; this.player = null;
    this.state = 'menu';
    this.clock = new THREE.Clock();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.bindInput();
    this.buildMenus();
    this.menuBackdrop();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.resize(w, h);
  }

  applyQuality() {
    const q = this.settings.quality || 'high';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, { low: 1, medium: 1.25, high: 1.5 }[q]));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.renderer.setSize(innerWidth, innerHeight);
    this.post.setQuality(q, innerWidth, innerHeight);
  }

  applyLook(def) {
    this.renderer.toneMappingExposure = def.theme.exposure || 1;
    this.post.setLook(def.theme.look);
  }

  // a slow fly-over of a random map behind the menu
  menuBackdrop() {
    if (this.backdrop) { this.backdrop.dispose(); this.backdrop = null; }
    import('./world.js').then(({ World }) => {
      if (this.state === 'playing') return;
      const id = MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)];
      this.backdrop = new World(this.scene, MAPS[id], { renderer: this.renderer, quality: this.settings.quality });
      this.backdropT = 0;
      this.applyLook(MAPS[id]);
    });
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.state === 'playing' && this.game) {
      if (!this.paused) {
        this.game.update(dt);
        this.hud.update(dt);
      }
      const p = this.game.player;
      const vm = this.player && p.alive ? { scene: this.player.vmScene, camera: this.player.vmCamera } : null;
      this.post.render(dt, vm, p.alive ? Math.max(0, 1 - p.health / 100) * 0.9 : 0.8);
    } else {
      if (this.backdrop) {
        this.backdropT += dt;
        const w = this.backdrop;
        const t = this.backdropT * 0.05;
        const cx = (w.minX + w.maxX) / 2, cz = (w.minZ + w.maxZ) / 2;
        const R = Math.min(w.maxX - w.minX, w.maxZ - w.minZ) * 0.35;
        this.camera.position.set(cx + Math.cos(t) * R, w.indoor ? 3 : 7, cz + Math.sin(t) * R);
        this.camera.lookAt(cx, w.indoor ? 2 : 2.5, cz);
        this.camera.fov = 70; this.camera.updateProjectionMatrix();
        this.backdrop.update(dt, this.backdropT);
      } else if (this.game) {
        // end screen: keep the last match world spinning
        this.game.update(dt);
      }
      this.post.render(dt, null, 0);
    }
  }

  // ---------- input ----------
  bindInput() {
    const c = this.canvas;
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === c;
      if (this.state === 'playing') {
        if (!locked && !this.game.ended) this.pause(true);
        else if (locked) this.pause(false);
      }
    });
    c.addEventListener('click', () => { if (this.state === 'playing' && !this.game.ended) this.lock(); });
    addEventListener('mousemove', (e) => {
      if (this.state === 'playing' && document.pointerLockElement === c && this.player && !this.paused) {
        this.player.look(e.movementX, e.movementY);
      }
    });
    addEventListener('mousedown', (e) => {
      if (this.state === 'playing' && document.pointerLockElement === c && this.player) this.player.mouseDown(e.button);
    });
    addEventListener('mouseup', (e) => { if (this.player) this.player.mouseUp(e.button); });
    addEventListener('contextmenu', (e) => { if (this.state === 'playing') e.preventDefault(); });
    addEventListener('wheel', (e) => { if (this.state === 'playing' && this.player && !this.paused) this.player.wheel(e.deltaY); }, { passive: true });
    addEventListener('keydown', (e) => {
      if (this.state !== 'playing') return;
      if (e.code === 'Tab') { e.preventDefault(); this.hud.setBoard(true); return; }
      if (['Space', 'ControlLeft'].includes(e.code)) e.preventDefault();
      if (this.paused) return;
      if (!this.game.player.alive && /^Digit[1-5]$/.test(e.code) && this.game.mode.id !== 'gun') {
        this.chooseClass(+e.code.slice(-1) - 1);
        return;
      }
      if (!e.repeat) this.player?.keyDown(e.code);
    });
    addEventListener('keyup', (e) => {
      if (e.code === 'Tab') this.hud.setBoard(false);
      this.player?.keyUp(e.code);
    });
    addEventListener('blur', () => { if (this.player) { this.player.keys.clear(); this.player.mouse = [false, false, false]; } });
  }

  lock() {
    // unadjustedMovement isn't supported everywhere; fall back to a plain lock
    const retry = () => { const q = this.canvas.requestPointerLock(); if (q && q.catch) q.catch(() => {}); };
    try {
      const p = this.canvas.requestPointerLock?.({ unadjustedMovement: true });
      if (p && p.catch) p.catch(retry);
    } catch { retry(); }
  }

  pause(on) {
    this.paused = on;
    $('#pause').classList.toggle('hidden', !on);
    if (on && this.player) { this.player.keys.clear(); this.player.mouse = [false, false, false]; }
  }

  chooseClass(i) {
    if (!this.profile.classes[i]) return;
    this.profile.selectedClass = i;
    saveProfile(this.profile);
    const c = this.profile.classes[i];
    if (this.game) this.game.pendingLoadout = { primary: c.primary, secondary: c.secondary, perks: [...c.perks] };
    this.hud.markClass(i);
  }

  // ---------- menus ----------
  show(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
    if (id) $(id).classList.remove('hidden');
  }

  buildMenus() {
    const p = this.profile;
    $('#player-name').value = p.name;
    $('#player-name').addEventListener('input', (e) => { p.name = e.target.value.slice(0, 18) || 'Lil You'; saveProfile(p); });
    $('#btn-play').onclick = () => { this.audio.init(); this.audio.startMusic(); this.renderSetup(); this.show('#setup'); };
    $('#btn-loadouts').onclick = () => { this.audio.init(); this.audio.startMusic(); this.renderLoadouts(); this.show('#loadouts'); };
    $('#btn-settings').onclick = () => { this.audio.init(); this.renderSettings(); this.show('#settings'); };
    $('#btn-controls').onclick = () => { this.audio.init(); this.show('#controls'); };
    for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => { this.renderMain(); this.show('#main'); };
    $('#btn-start').onclick = () => this.startMatch();
    $('#btn-resume').onclick = () => this.lock();
    $('#btn-quit').onclick = () => this.quitMatch();
    $('#btn-again').onclick = () => this.startMatch();
    $('#btn-menu').onclick = () => this.quitMatch();
    document.addEventListener('pointerdown', () => this.audio.init(), { once: true });
    this.renderMain();
  }

  renderMain() {
    const p = this.profile;
    const need = XP_PER_LEVEL(p.level);
    $('#rank').innerHTML = `<div class="rank-badge">${p.level + 1}</div><div><div class="rank-name">${esc(RANKS[Math.min(p.level, RANKS.length - 1)])}</div><div class="xpbar"><div style="width:${(p.xp / need * 100).toFixed(1)}%"></div></div><div class="xptext">${p.xp} / ${need} XP · ${p.stats.kills} kills · ${p.stats.wins}W / ${p.stats.matches - p.stats.wins}L</div></div>`;
  }

  renderSetup() {
    const L = this.profile.last;
    const modes = Object.values(MODES).map((m) => `<button class="card ${L.mode === m.id ? 'sel' : ''}" data-mode="${m.id}"><b>${esc(m.name)}</b><small>${esc(m.sub)}</small><p>${esc(m.desc)}</p></button>`).join('');
    const maps = MAP_ORDER.map((id) => { const m = MAPS[id]; return `<button class="card map-${id} ${L.map === id ? 'sel' : ''}" data-map="${id}"><b>${esc(m.name)}</b><small>${esc(m.sub)}</small><p>${esc(m.desc)}</p></button>`; }).join('');
    const teams = Object.values(TEAMS).map((t) => `<button class="crew ${L.team === t.id ? 'sel' : ''}" data-team="${t.id}" style="--tc:${t.color}"><b>${esc(t.name)}</b><small>${t.id === 'A' ? 'Eastside · Zone 6' : 'Westside · Bankhead'}</small></button>`).join('');
    const diffs = Object.entries(DIFFICULTY).map(([k, d]) => `<button class="pill ${L.difficulty === k ? 'sel' : ''}" data-diff="${k}">${d.name}</button>`).join('');
    const classes = this.profile.classes.map((c, i) => `<button class="pill ${this.profile.selectedClass === i ? 'sel' : ''}" data-cls="${i}">${esc(c.name)}</button>`).join('');
    $('#setup-body').innerHTML = `
      <h3>Game Mode</h3><div class="cards">${modes}</div>
      <h3>Map</h3><div class="cards">${maps}</div>
      <div class="row2">
        <div><h3>Rep Your Crew</h3><div class="crews">${teams}</div><div class="note" id="crew-note"></div></div>
        <div><h3>Bot Difficulty</h3><div class="pills">${diffs}</div>
          <h3>Players <span id="botcount">${L.bots + 1}</span></h3><input type="range" id="bots" min="3" max="15" value="${L.bots}">
          <h3>Starting Class</h3><div class="pills">${classes}</div></div>
      </div>`;
    const body = $('#setup-body');
    const pick = (attr, key) => body.querySelectorAll(`[data-${attr}]`).forEach((b) => b.addEventListener('click', () => {
      L[key] = b.dataset[attr === 'diff' ? 'diff' : attr];
      body.querySelectorAll(`[data-${attr}]`).forEach((x) => x.classList.toggle('sel', x === b));
      this.audio.click();
      updateNote();
      saveProfile(this.profile);
    }));
    const updateNote = () => {
      const team = MODES[L.mode].teams;
      $('#crew-note').textContent = team ? '' : 'Free-for-all: no crews, everybody is a target.';
      body.querySelector('.crews').style.opacity = team ? 1 : 0.4;
    };
    pick('mode', 'mode'); pick('map', 'map'); pick('team', 'team'); pick('diff', 'difficulty');
    body.querySelectorAll('[data-cls]').forEach((b) => b.addEventListener('click', () => {
      this.profile.selectedClass = +b.dataset.cls;
      body.querySelectorAll('[data-cls]').forEach((x) => x.classList.toggle('sel', x === b));
      saveProfile(this.profile);
    }));
    $('#bots').addEventListener('input', (e) => { L.bots = +e.target.value; $('#botcount').textContent = L.bots + 1; saveProfile(this.profile); });
    updateNote();
  }

  renderLoadouts(sel = this.profile.selectedClass) {
    const p = this.profile;
    const c = p.classes[sel];
    const stat = (label, v) => `<div class="stat"><span>${label}</span><div class="sbar"><div style="width:${Math.max(4, Math.min(100, v))}%"></div></div></div>`;
    const wcard = (id, slot) => {
      const w = WEAPONS[id];
      const dps = w.dmg * w.rpm / 60 * (w.pellets || 1) * (w.burst ? 0.7 : 1);
      return `<button class="wcard ${c[slot] === id ? 'sel' : ''}" data-slot="${slot}" data-w="${id}"><b>${esc(w.name)}</b><small>${esc(w.cls)}</small>
        ${stat('Damage', w.dmg * (w.pellets || 1) / 1.2)}${stat('Fire rate', w.rpm / 12)}${stat('Range', w.r2 / 0.8)}${stat('Accuracy', 100 - w.hip * 8 - w.recoil * 6)}${stat('Mobility', (w.move - 0.8) * 400)}${stat('DPS', dps / 6)}
        <p>${esc(w.desc)}</p></button>`;
    };
    $('#loadouts-body').innerHTML = `
      <div class="lo-classes">${p.classes.map((k, i) => `<button class="${i === sel ? 'sel' : ''}" data-ci="${i}">${esc(k.name)}<small>${esc(WEAPONS[k.primary].name)} · ${esc(WEAPONS[k.secondary].name)}</small></button>`).join('')}
        <button class="ghost" id="lo-reset">Reset to defaults</button></div>
      <div class="lo-edit">
        <input id="lo-name" maxlength="16" value="${esc(c.name)}">
        <h3>Primary</h3><div class="wcards">${PRIMARIES.map((id) => wcard(id, 'primary')).join('')}</div>
        <h3>Secondary</h3><div class="wcards">${SECONDARIES.map((id) => wcard(id, 'secondary')).join('')}</div>
        <h3>Perks</h3><div class="perks">${PERKS.map((slot, si) => `<div class="perkslot"><em>Perk ${si + 1}</em>${slot.map((pk) => `<button class="perk ${c.perks[si] === pk.id ? 'sel' : ''}" data-ps="${si}" data-p="${pk.id}"><b>${esc(pk.name)}</b><small>${esc(pk.desc)}</small></button>`).join('')}</div>`).join('')}</div>
        <h3>Killstreaks</h3><div class="perks">${STREAKS.map((s) => `<div class="perk static"><b>[${s.key}] ${esc(s.name)} · ${s.kills} kills</b><small>${esc(s.desc)}</small></div>`).join('')}</div>
        <p class="note">Every class also carries 2 frag grenades [G] and a quick melee [V].</p>
      </div>`;
    const body = $('#loadouts-body');
    body.querySelectorAll('[data-ci]').forEach((b) => b.onclick = () => { p.selectedClass = +b.dataset.ci; saveProfile(p); this.renderLoadouts(+b.dataset.ci); });
    body.querySelectorAll('[data-w]').forEach((b) => b.onclick = () => { c[b.dataset.slot] = b.dataset.w; saveProfile(p); this.audio.click(); this.renderLoadouts(sel); });
    body.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { c.perks[+b.dataset.ps] = b.dataset.p; saveProfile(p); this.audio.click(); this.renderLoadouts(sel); });
    $('#lo-name').oninput = (e) => { c.name = e.target.value || `Class ${sel + 1}`; saveProfile(p); body.querySelector(`[data-ci="${sel}"]`).firstChild.textContent = c.name; };
    $('#lo-reset').onclick = () => { p.classes = DEFAULT_CLASSES.map((k) => ({ ...k, perks: [...k.perks] })); saveProfile(p); this.renderLoadouts(0); };
  }

  renderSettings() {
    const s = this.settings;
    $('#settings-body').innerHTML = `
      <label>Mouse sensitivity <b id="v-sens">${s.sens.toFixed(2)}</b><input type="range" id="s-sens" min="0.2" max="3" step="0.05" value="${s.sens}"></label>
      <label>Field of view <b id="v-fov">${s.fov}</b><input type="range" id="s-fov" min="65" max="110" step="1" value="${s.fov}"></label>
      <label>Effects volume <b id="v-sfx">${Math.round(s.sfx * 100)}</b><input type="range" id="s-sfx" min="0" max="1" step="0.05" value="${s.sfx}"></label>
      <label>Music volume <b id="v-music">${Math.round(s.music * 100)}</b><input type="range" id="s-music" min="0" max="1" step="0.05" value="${s.music}"></label>
      <label class="chk"><input type="checkbox" id="s-gm" ${s.gameMusic ? 'checked' : ''}> Keep the beat playing during matches</label>
      <label class="chk"><input type="checkbox" id="s-inv" ${s.invert ? 'checked' : ''}> Invert mouse Y</label>
      <div class="qrow"><span>Graphics quality</span><div class="pills">${['low', 'medium', 'high'].map((q) => `<button class="pill ${s.quality === q ? 'sel' : ''}" data-q="${q}">${q[0].toUpperCase() + q.slice(1)}</button>`).join('')}</div></div>
      <p class="note">High: 4K shadows, multisampling, reflections and bloom. Medium: 2K shadows and FXAA. Low: no post-processing or shadows, for older laptops. Lighting changes apply from the next map load.</p>`;
    const bind = (id, key, fmt, apply) => $(id).addEventListener('input', (e) => {
      s[key] = +e.target.value; $(`#v-${key}`).textContent = fmt(s[key]); apply?.(s[key]); saveProfile(this.profile);
    });
    bind('#s-sens', 'sens', (v) => v.toFixed(2));
    bind('#s-fov', 'fov', (v) => v);
    bind('#s-sfx', 'sfx', (v) => Math.round(v * 100), (v) => this.audio.setSfx(v));
    bind('#s-music', 'music', (v) => Math.round(v * 100), (v) => this.audio.setMusic(v));
    $('#s-gm').onchange = (e) => { s.gameMusic = e.target.checked; saveProfile(this.profile); };
    $('#s-inv').onchange = (e) => { s.invert = e.target.checked; saveProfile(this.profile); };
    document.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      s.quality = b.dataset.q; saveProfile(this.profile);
      document.querySelectorAll('[data-q]').forEach((x) => x.classList.toggle('sel', x === b));
      this.applyQuality();
    }));
  }

  // ---------- match lifecycle ----------
  startMatch() {
    this.audio.init();
    const p = this.profile, L = p.last;
    if (this.backdrop) { this.backdrop.dispose(); this.backdrop = null; }
    if (this.game) { this.game.dispose(); this.game = null; }
    this.player = null;
    const cls = p.classes[p.selectedClass] || p.classes[0];
    const team = L.team;
    this.applyLook(MAPS[L.map]);
    this.game = new Game(this, {
      mode: L.mode, map: L.map, difficulty: L.difficulty, bots: L.bots, team,
      playerName: p.name, loadout: { primary: cls.primary, secondary: cls.secondary, perks: [...cls.perks] },
      renderer: this.renderer, quality: this.settings.quality,
    });
    this.player = new PlayerController(this, this.game);
    this.player.onSpawn();
    this.hud.setGame(this.game);
    this.hud.show(true);
    this.show(null);
    this.state = 'playing';
    this.paused = false;
    $('#pause').classList.add('hidden');
    if (this.settings.gameMusic) this.audio.applyMusicGain(true); else this.audio.stopMusic();
    const m = this.game.mode;
    this.hud.announce(`${m.name.toUpperCase()} — ${MAPS[L.map].name.toUpperCase()}`, '#ffd54f', 3);
    this.lock();
  }

  quitMatch() {
    if (document.pointerLockElement) document.exitPointerLock();
    if (this.game) { this.game.dispose(); this.game = null; }
    this.player = null;
    this.state = 'menu';
    this.hud.show(false);
    $('#pause').classList.add('hidden');
    this.renderMain();
    this.show('#main');
    this.audio.applyMusicGain(false);
    this.audio.startMusic();
    this.menuBackdrop();
  }

  onMatchEnd(game, result) {
    const p = this.profile, me = game.player;
    const won = result === 'win';
    const xpGain = me.score + (won ? 1500 : result === 'top3' ? 800 : result === 'draw' ? 600 : 300);
    p.xp += xpGain;
    let ranked = false;
    while (p.xp >= XP_PER_LEVEL(p.level)) { p.xp -= XP_PER_LEVEL(p.level); p.level++; ranked = true; }
    p.stats.matches++; if (won) p.stats.wins++;
    p.stats.kills += me.kills; p.stats.deaths += me.deaths;
    saveProfile(p);
    setTimeout(() => {
      if (document.pointerLockElement) document.exitPointerLock();
      this.state = 'ended';
      this.hud.show(false);
      this.hud.setBoard(false);
      const title = { win: 'WE RUN THE BLOCK', lose: 'YOU GOT SMOKED', draw: 'STALEMATE', top3: 'TOP 3 FINISH' }[result];
      const cls = { win: 'win', lose: 'lose', draw: 'draw', top3: 'win' }[result];
      const st = game.standings();
      const mvp = st[0];
      const rows = st.map((s, i) => `<tr class="${s.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td style="color:${game.teams ? TEAMS[s.team].color : s.color}">${esc(s.name)}</td><td>${game.mode.id === 'gun' ? s.gunLevel + 1 : s.score}</td><td>${s.kills}</td><td>${s.deaths}</td><td>${s.assists}</td><td>${s.bestStreak}</td></tr>`).join('');
      const scoreLine = game.teams
        ? `<div class="end-score"><span style="color:${TEAMS[me.team].color}">${TEAMS[me.team].name} ${game.teamScore[me.team]}</span> — <span style="color:${TEAMS[me.team === 'A' ? 'B' : 'A'].color}">${game.teamScore[me.team === 'A' ? 'B' : 'A']} ${TEAMS[me.team === 'A' ? 'B' : 'A'].name}</span></div>`
        : `<div class="end-score">You placed #${st.indexOf(me) + 1} of ${st.length}</div>`;
      $('#end-body').innerHTML = `
        <div class="end-title ${cls}">${title}</div>${scoreLine}
        <div class="end-mvp">MVP: <b>${esc(mvp.name)}</b> · ${mvp.kills} kills</div>
        <div class="end-xp">+${xpGain} XP${ranked ? ` · <b>RANK UP → ${esc(RANKS[Math.min(p.level, RANKS.length - 1)])} (${p.level + 1})</b>` : ''}</div>
        <div class="end-stats">K/D <b>${(me.kills / Math.max(1, me.deaths)).toFixed(2)}</b> · Headshots <b>${me.headshots}</b> · Best streak <b>${me.bestStreak}</b></div>
        <table class="end-table"><tr><th>#</th><th>Name</th><th>${game.mode.id === 'gun' ? 'Level' : 'Score'}</th><th>K</th><th>D</th><th>A</th><th>Streak</th></tr>${rows}</table>`;
      this.show('#end');
      this.audio.applyMusicGain(false);
      this.audio.startMusic();
    }, 1600);
    this.hud.announce(result === 'win' ? 'VICTORY' : result === 'lose' ? 'DEFEAT' : result === 'draw' ? 'DRAW' : 'TOP 3', result === 'lose' ? '#ff5252' : '#ffd54f', 2);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    window.app = new App();
  } catch (e) {
    document.body.innerHTML = `<div style="color:#fff;font:16px sans-serif;padding:40px">Could not start WebGL: ${esc(e.message)}</div>`;
    throw e;
  }
});
