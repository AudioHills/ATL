// In-match HUD: crosshair, hitmarkers, killfeed, radar, scores, death & score screens.
import { TEAMS, STREAKS, GUN_LADDER, WEAPONS } from './config.js';

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class Hud {
  constructor(root, app) {
    this.app = app;
    this.root = root;
    root.innerHTML = '';
    this.vignette = el('div', 'vignette', root);
    this.scopeEl = el('div', 'scope', root, '<div class="scope-ring"></div><div class="scope-h"></div><div class="scope-v"></div>');
    this.cross = el('div', 'crosshair', root, '<i class="l"></i><i class="r"></i><i class="t"></i><i class="b"></i><i class="d"></i>');
    this.hit = el('div', 'hitmarker', root, '<i></i><i></i><i></i><i></i>');
    this.dmgDirs = el('div', 'dmgdirs', root);
    this.nadeWarn = el('div', 'nadewarn', root, '<span>💣</span>');
    this.top = el('div', 'topbar', root);
    this.flagsRow = el('div', 'flagsrow', root);
    this.capBar = el('div', 'capbar', root, '<div class="capfill"></div><span></span>');
    this.mmWrap = el('div', 'minimap', root);
    this.mm = el('canvas', '', this.mmWrap);
    this.mm.width = 220; this.mm.height = 220;
    this.mmCtx = this.mm.getContext('2d');
    this.feed = el('div', 'killfeed', root);
    this.popups = el('div', 'popups', root);
    this.medals = el('div', 'medals', root);
    this.ann = el('div', 'announce', root);
    this.ammo = el('div', 'ammo', root);
    this.hint = el('div', 'hint', root);
    this.streaks = el('div', 'streaks', root);
    this.death = el('div', 'death hidden', root);
    this.board = el('div', 'scoreboard hidden', root);
    this.hitT = 0; this.dirs = []; this.annT = 0;
    this.medalQ = []; this.medalT = 0;
  }

  setGame(game) {
    this.game = game;
    this.feed.innerHTML = ''; this.popups.innerHTML = ''; this.medals.innerHTML = '';
    this.dmgDirs.innerHTML = ''; this.dirs = []; this.medalQ = [];
    this.ann.classList.remove('show');
    this.flagsRow.innerHTML = '';
    this.flagEls = [];
    if (game.mode.id === 'dom') {
      for (const f of game.flags) this.flagEls.push(el('div', 'flagchip', this.flagsRow, f.letter));
    }
    this.prerenderMap();
    this.lastBoardRender = 0;
  }

  prerenderMap() {
    const w = this.game.world;
    const s = 3; // px per meter
    const c = document.createElement('canvas');
    c.width = (w.maxX - w.minX) * s; c.height = (w.maxZ - w.minZ) * s;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(20,28,24,0.85)'; g.fillRect(0, 0, c.width, c.height);
    const sorted = [...w.colliders].sort((a, b) => a.maxY - b.maxY);
    for (const b of sorted) {
      if (b.minY > 2.5) continue;
      g.fillStyle = b.maxY > 4 ? 'rgba(150,160,155,0.9)' : b.tag === 'fence' ? 'rgba(120,130,125,0.5)' : 'rgba(100,112,106,0.85)';
      g.fillRect((b.minX - w.minX) * s, (b.minZ - w.minZ) * s, (b.maxX - b.minX) * s, (b.maxZ - b.minZ) * s);
    }
    this.mapImg = c; this.mapScale = s;
  }

  show(v) { this.root.style.display = v ? '' : 'none'; }

  hitmarker(head, kill) {
    this.hit.classList.remove('show', 'kill', 'head');
    void this.hit.offsetWidth;
    this.hit.classList.add('show');
    if (kill) this.hit.classList.add('kill');
    else if (head) this.hit.classList.add('head');
    this.hitT = kill ? 0.35 : 0.18;
  }

  damageFrom(x, z) {
    const d = el('div', 'dmgdir', this.dmgDirs);
    this.dirs.push({ el: d, x, z, t: 1.2 });
  }

  killfeed(k, v, weapon, head) {
    const g = this.game;
    const col = (s) => (g.teams ? (s.team === g.player.team ? '#5ec8ff' : '#ff5a5a') : s.isPlayer ? '#ffe082' : s.color);
    const row = el('div', 'kf', this.feed);
    const kName = k ? `<b style="color:${col(k)}">${esc(k.name)}</b>` : '';
    row.innerHTML = `${kName}<span class="kfw">[${esc(weapon)}]${head ? ' <span class="hs">◉</span>' : ''}</span><b style="color:${col(v)}">${esc(v.name)}</b>`;
    if ((k && k.isPlayer) || v.isPlayer) row.classList.add('me');
    setTimeout(() => row.classList.add('fade'), 4500);
    setTimeout(() => row.remove(), 5200);
    while (this.feed.children.length > 6) this.feed.firstChild.remove();
  }

  popup(points, label) {
    const p = el('div', 'pop', this.popups, `<span class="pts">${esc(points)}</span> ${esc(label)}`);
    setTimeout(() => p.remove(), 1600);
    while (this.popups.children.length > 5) this.popups.firstChild.remove();
  }

  medal(name, pts) {
    this.medalQ.push([name, pts]);
  }

  announce(text, color = '#fff', dur = 2) {
    this.ann.textContent = text;
    this.ann.style.color = color;
    this.ann.classList.remove('show'); void this.ann.offsetWidth; this.ann.classList.add('show');
    this.annT = dur;
  }

  scope(on) { this.scopeEl.classList.toggle('on', !!on); }

  showDeath(killer, weapon, game) {
    this.death.classList.remove('hidden');
    const cls = this.app.profile.classes;
    const sel = this.app.profile.selectedClass;
    const gun = game.mode.id === 'gun';
    this.death.innerHTML = `
      <div class="death-title">YOU GOT CAUGHT LACKIN'</div>
      <div class="death-by">${killer ? `Dropped by <b style="color:${game.teams ? '#ff5a5a' : killer.color}">${esc(killer.name)}</b> · ${esc(weapon)}` : 'You took yourself out.'}</div>
      ${killer ? `<div class="death-hp">They had <b>${Math.max(1, Math.round(killer.health))}</b> HP left</div>` : ''}
      <div class="death-timer"></div>
      ${gun ? '' : `<div class="death-classes">${cls.map((c, i) => `<button data-i="${i}" class="${i === sel ? 'sel' : ''}">${esc(c.name)}<small>${esc(WEAPONS[c.primary].name)} · ${esc(WEAPONS[c.secondary].name)}</small></button>`).join('')}</div>
      <div class="death-note">Pick a class for your next spawn (keys 1–5 work too)</div>`}`;
    this.death.querySelectorAll('button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.app.chooseClass(+b.dataset.i);
    }));
  }
  markClass(i) {
    this.death.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', +b.dataset.i === i));
  }
  hideDeath() { this.death.classList.add('hidden'); }

  renderBoard() {
    const g = this.game;
    const rows = (list) => list.map((s) => `<tr class="${s.isPlayer ? 'me' : ''} ${s.alive ? '' : 'deadrow'}"><td>${esc(s.name)}</td><td>${g.mode.id === 'gun' ? `${s.gunLevel + 1}/${GUN_LADDER.length}` : s.score}</td><td>${s.kills}</td><td>${s.deaths}</td><td>${s.assists}</td>${g.mode.id === 'dom' ? `<td>${s.captures}</td>` : g.mode.id === 'kc' ? `<td>${s.confirms}</td>` : ''}</tr>`).join('');
    const extra = g.mode.id === 'dom' ? '<th>Caps</th>' : g.mode.id === 'kc' ? '<th>Chains</th>' : '';
    const head = `<tr><th>Name</th><th>${g.mode.id === 'gun' ? 'Level' : 'Score'}</th><th>K</th><th>D</th><th>A</th>${extra}</tr>`;
    const st = g.standings();
    if (g.teams) {
      const mine = g.player.team, other = mine === 'A' ? 'B' : 'A';
      const block = (t) => `<div class="sb-team" style="--tc:${TEAMS[t].color}"><div class="sb-th"><span>${TEAMS[t].name}</span><b>${g.teamScore[t]}</b></div><table>${head}${rows(st.filter((s) => s.team === t))}</table></div>`;
      this.board.innerHTML = `<div class="sb-title">${esc(g.mode.name)} · ${esc(g.def.name)}</div>${block(mine)}${block(other)}`;
    } else {
      this.board.innerHTML = `<div class="sb-title">${esc(g.mode.name)} · ${esc(g.def.name)}</div><div class="sb-team" style="--tc:#ffd54f"><table>${head}${rows(st)}</table></div>`;
    }
  }

  setBoard(show) {
    this.board.classList.toggle('hidden', !show);
    if (show) this.renderBoard();
  }

  update(dt) {
    const g = this.game, s = g.player, p = this.app.player;
    // hitmarker
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.hit.classList.remove('show', 'kill', 'head'); }
    // vignette
    const hurt = s.alive ? Math.max(0, 1 - s.health / 100) : 0.6;
    this.vignette.style.opacity = (hurt * 0.95).toFixed(2);
    // health regen
    if (s.alive && s.health < 100 && g.time - s.lastHurt > 4) s.health = Math.min(100, s.health + dt * 35);
    for (const b of g.bots) if (b.alive && b.health < 100 && g.time - b.lastHurt > 4) b.health = Math.min(100, b.health + dt * 35);
    // crosshair
    const def = s.weapon?.def;
    if (def) {
      const showCross = s.alive && !s.sprinting && s.adsT < 0.5 && s.reloadT <= 0 && !def.melee;
      this.cross.style.opacity = showCross ? (1 - s.adsT * 2).toFixed(2) : '0';
      const fovR = (this.app.camera.fov * Math.PI / 180) / 2;
      const gap = Math.max(4, Math.min(80, (s.spread() / Math.tan(fovR)) * (innerHeight / 2)));
      this.cross.style.setProperty('--gap', gap.toFixed(1) + 'px');
    }
    // damage directions
    for (let i = this.dirs.length - 1; i >= 0; i--) {
      const d = this.dirs[i];
      d.t -= dt;
      if (d.t <= 0) { d.el.remove(); this.dirs.splice(i, 1); continue; }
      const ang = Math.atan2(d.x - s.pos.x, d.z - s.pos.z);
      // relative to facing: forward is (-sin yaw, -cos yaw) -> angle yaw + PI
      const rel = ang - (s.yaw + Math.PI);
      d.el.style.transform = `rotate(${-rel}rad)`;
      d.el.style.opacity = Math.min(1, d.t * 1.5).toFixed(2);
    }
    // grenade danger
    let danger = false;
    for (const n of g.grenades) if (n.t < 1.8 && Math.hypot(n.pos.x - s.pos.x, n.pos.z - s.pos.z) < 7) { danger = true; break; }
    this.nadeWarn.classList.toggle('show', danger && s.alive);
    // announcer
    if (this.annT > 0) { this.annT -= dt; if (this.annT <= 0) this.ann.classList.remove('show'); }
    // medals
    this.medalT -= dt;
    if (this.medalQ.length && this.medalT <= 0) {
      const [name, pts] = this.medalQ.shift();
      const m = el('div', 'medal', this.medals, `<div class="medal-badge">${esc(name.split(' ').map((w) => w[0]).join(''))}</div><div class="medal-name">${esc(name)}</div>${pts ? `<div class="medal-pts">+${pts}</div>` : ''}`);
      setTimeout(() => m.remove(), 1500);
      this.medalT = 0.55;
    }
    this.renderTop();
    this.renderAmmo();
    this.renderStreaks();
    this.renderMinimap();
    if (!s.alive) {
      const t = this.death.querySelector('.death-timer');
      if (t) {
        const left = s.respawnAt - g.time;
        t.textContent = left > 0 ? `Respawn in ${left.toFixed(1)}` : 'Click or press SPACE to run it back';
        if (left < -6) g.spawn(s);
      }
    }
    if (!this.board.classList.contains('hidden')) {
      this.lastBoardRender -= dt;
      if (this.lastBoardRender <= 0) { this.renderBoard(); this.lastBoardRender = 0.5; }
    }
    // dom capture bar
    let capF = null;
    if (g.mode.id === 'dom') {
      g.flags.forEach((f, i) => {
        const e = this.flagEls[i];
        const cls = f.owner ? (f.owner === s.team ? 'ours' : 'theirs') : 'neutral';
        e.className = `flagchip ${cls} ${f.contested ? 'contested' : ''}`;
        if (f.playerInside) capF = f;
      });
    }
    if (capF && s.alive) {
      this.capBar.classList.add('show');
      const mine = s.team === 'A' ? capF.progress : -capF.progress;
      const fill = this.capBar.firstChild;
      fill.style.width = `${Math.abs(capF.progress) * 100}%`;
      fill.style.background = mine >= 0 ? '#29b6f6' : '#ff3d3d';
      this.capBar.lastChild.textContent = capF.contested ? `${capF.letter} — CONTESTED` : capF.owner === s.team ? `${capF.letter} — SECURED` : `CAPTURING ${capF.letter}`;
    } else this.capBar.classList.remove('show');
    p && void p;
  }

  renderTop() {
    const g = this.game, s = g.player;
    const m = Math.floor(g.timeLeft / 60), sec = Math.floor(g.timeLeft % 60);
    const timer = `${m}:${String(sec).padStart(2, '0')}`;
    let html;
    if (g.teams) {
      const mine = s.team, other = mine === 'A' ? 'B' : 'A';
      const L = g.mode.limit;
      const bar = (t, side) => `<div class="tb-team ${side}" style="--tc:${TEAMS[t].color}"><div class="tb-name">${TEAMS[t].short}</div><div class="tb-score">${g.teamScore[t]}</div><div class="tb-bar"><div style="width:${Math.min(100, g.teamScore[t] / L * 100)}%"></div></div></div>`;
      html = `${bar(mine, 'left')}<div class="tb-mid"><div class="tb-timer ${g.timeLeft < 60 ? 'low' : ''}">${timer}</div><div class="tb-mode">${g.mode.name}</div></div>${bar(other, 'right')}`;
    } else {
      const st = g.standings();
      const lead = st[0];
      const place = st.indexOf(s) + 1;
      const val = (x) => (g.mode.id === 'gun' ? `Lv ${x.gunLevel + 1}` : x.kills);
      const suffix = (n) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
      html = `<div class="tb-team left" style="--tc:#ffe082"><div class="tb-name">YOU · ${place}${suffix(place)}</div><div class="tb-score">${val(s)}</div></div><div class="tb-mid"><div class="tb-timer ${g.timeLeft < 60 ? 'low' : ''}">${timer}</div><div class="tb-mode">${g.mode.name}</div></div><div class="tb-team right" style="--tc:${lead === s ? '#ffe082' : lead.color}"><div class="tb-name">${lead === s ? (st[1] ? esc(st[1].name) : '—') : esc(lead.name)}</div><div class="tb-score">${lead === s ? (st[1] ? val(st[1]) : 0) : val(lead)}</div></div>`;
    }
    if (html !== this._topHtml) { this.top.innerHTML = html; this._topHtml = html; }
  }

  renderAmmo() {
    const s = this.game.player;
    const w = s.weapon;
    if (!w) return;
    const def = w.def;
    const low = !def.melee && w.mag <= Math.ceil(def.mag * 0.25);
    const g = this.game;
    const gunInfo = g.mode.id === 'gun' ? `<div class="gg">Gun ${s.gunLevel + 1}/${GUN_LADDER.length}${s.gunLevel < GUN_LADDER.length - 1 ? ` · next: ${WEAPONS[GUN_LADDER[s.gunLevel + 1]].name}` : ''}</div>` : '';
    const html = `${gunInfo}<div class="wname">${esc(def.name)} <small>${esc(def.cls)}</small></div>
      <div class="rounds">${def.melee ? '∞' : `<span class="${low ? 'low' : ''}">${w.mag}</span><small>/ ${w.reserve}</small>`}</div>
      <div class="nades">${'<i></i>'.repeat(Math.max(0, s.grenades || 0))}<em>[G]</em></div>`;
    if (html !== this._ammoHtml) { this.ammo.innerHTML = html; this._ammoHtml = html; }
    let hint = '';
    if (s.alive) {
      if (s.reloadT > 0) hint = 'RELOADING';
      else if (!def.melee && w.mag === 0 && w.reserve === 0) hint = 'NO AMMO';
      else if (low && !def.melee) hint = w.mag === 0 ? 'RELOAD [R]' : 'LOW AMMO';
    }
    if (hint !== this._hint) { this.hint.textContent = hint; this.hint.className = 'hint' + (hint ? ' show' : ''); this._hint = hint; }
  }

  renderStreaks() {
    const g = this.game, s = g.player;
    if (g.mode.id === 'gun') { if (this._skHtml !== '') { this.streaks.innerHTML = ''; this._skHtml = ''; } return; }
    const hard = s.hasPerk('hardline') ? 1 : 0;
    const html = STREAKS.map((st) => {
      const need = st.kills - hard;
      const ready = s.streaksReady.includes(st.id);
      const prog = Math.min(1, s.streak / need);
      return `<div class="sk ${ready ? 'ready' : ''}"><div class="sk-key">${st.key}</div><div class="sk-name">${st.name}</div><div class="sk-prog"><div style="width:${ready ? 100 : prog * 100}%"></div></div><div class="sk-need">${ready ? 'READY' : `${Math.min(s.streak, need)}/${need}`}</div></div>`;
    }).join('');
    if (html !== this._skHtml) { this.streaks.innerHTML = html; this._skHtml = html; }
  }

  renderMinimap() {
    const g = this.game, s = g.player, c = this.mmCtx, w = g.world;
    const W = this.mm.width, H = this.mm.height, sc = this.mapScale;
    c.clearRect(0, 0, W, H);
    c.save();
    c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(8,12,10,0.8)'; c.fillRect(0, 0, W, H);
    const yaw = s.alive ? s.yaw : (this._lastYaw ?? 0);
    this._lastYaw = yaw;
    const px = (s.alive ? s.pos.x : (s.deathPos?.x ?? s.pos.x)), pz = (s.alive ? s.pos.z : (s.deathPos?.z ?? s.pos.z));
    c.translate(W / 2, H / 2);
    c.rotate(yaw);
    c.translate(-(px - w.minX) * sc, -(pz - w.minZ) * sc);
    c.drawImage(this.mapImg, 0, 0);
    const toMap = (x, z) => [(x - w.minX) * sc, (z - w.minZ) * sc];
    // flags
    if (g.mode.id === 'dom') {
      for (const f of g.flags) {
        const [x, y] = toMap(f.x, f.z);
        c.fillStyle = f.owner ? (f.owner === s.team ? '#29b6f6' : '#ff3d3d') : '#ddd';
        c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill();
        c.save(); c.translate(x, y); c.rotate(-yaw);
        c.fillStyle = '#111'; c.font = 'bold 11px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(f.letter, 0, 1);
        c.restore();
      }
    }
    if (g.mode.id === 'kc') {
      for (const t of g.tags) {
        const [x, y] = toMap(t.x, t.z);
        c.fillStyle = t.team === s.team ? '#29b6f6' : '#ffd54f';
        c.fillRect(x - 3, y - 3, 6, 6);
      }
    }
    const uav = g.hasUav(s);
    for (const o of g.soldiers) {
      if (o === s || !o.alive) continue;
      const [x, y] = toMap(o.pos.x, o.pos.z);
      if (!g.isEnemy(s, o)) {
        c.fillStyle = '#4fc3f7';
        c.save(); c.translate(x, y); c.rotate(-o.yaw);
        c.beginPath(); c.moveTo(0, -6); c.lineTo(4.5, 4); c.lineTo(-4.5, 4); c.closePath(); c.fill();
        c.restore();
      } else {
        const fired = g.time - o.lastFired < 1.6 && !o.hasPerk('ghost');
        if ((uav && !o.hasPerk('ghost')) || fired) {
          c.fillStyle = fired && !uav ? `rgba(255,50,50,${(1 - (g.time - o.lastFired) / 1.6).toFixed(2)})` : '#ff3232';
          c.beginPath(); c.arc(x, y, 4.5, 0, 7); c.fill();
        }
      }
    }
    for (const h of g.helis) {
      const [x, y] = toMap(h.mesh.position.x, h.mesh.position.z);
      c.fillStyle = h.owner.team === s.team ? '#4fc3f7' : '#ff3232';
      c.font = 'bold 14px sans-serif'; c.textAlign = 'center';
      c.save(); c.translate(x, y); c.rotate(-yaw); c.fillText('✚', 0, 5); c.restore();
    }
    c.restore();
    // player arrow + ring
    c.fillStyle = '#fff';
    c.beginPath(); c.moveTo(W / 2, H / 2 - 8); c.lineTo(W / 2 + 6, H / 2 + 6); c.lineTo(W / 2, H / 2 + 3); c.lineTo(W / 2 - 6, H / 2 + 6); c.closePath(); c.fill();
    c.strokeStyle = uav ? '#29b6f6' : 'rgba(255,255,255,0.35)'; c.lineWidth = uav ? 3 : 2;
    c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); c.stroke();
    if (g.enemyUavUp(s) && !s.hasPerk('ghost')) {
      c.fillStyle = '#ff5252'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.fillText('ENEMY UAV', W / 2, H - 14);
    }
    // north marker
    const na = yaw;
    c.fillStyle = '#ffd54f'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('N', W / 2 + Math.sin(na) * (W / 2 - 12), H / 2 - Math.cos(na) * (H / 2 - 12));
  }
}
