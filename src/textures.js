// Procedural canvas textures, so the game ships with zero image assets.
import * as THREE from 'three';

const cache = new Map();

function rnd(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTex(key, w, h, draw, repeat = true) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

function noise(g, w, h, amt, r) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

export function brick(color = '#8a3b2a', key = 'brick') {
  return canvasTex(key + color, 256, 256, (g, w, h) => {
    const r = rnd(7);
    g.fillStyle = '#5b5148'; g.fillRect(0, 0, w, h);
    const bh = 16, bw = 42;
    for (let y = 0; y < h; y += bh) {
      const off = (y / bh) % 2 ? bw / 2 : 0;
      for (let x = -bw; x < w + bw; x += bw) {
        const c = new THREE.Color(color);
        c.offsetHSL(0, (r() - 0.5) * 0.1, (r() - 0.5) * 0.12);
        g.fillStyle = '#' + c.getHexString();
        g.fillRect(x + off + 1, y + 1, bw - 3, bh - 3);
      }
    }
    noise(g, w, h, 28, r);
  });
}

export function concrete(base = '#7d7b78', key = 'concrete') {
  return canvasTex(key + base, 256, 256, (g, w, h) => {
    const r = rnd(11);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.08})`;
      g.beginPath(); g.arc(r() * w, r() * h, r() * 30 + 5, 0, 7); g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
    noise(g, w, h, 30, r);
  });
}

export function asphalt() {
  return canvasTex('asphalt', 512, 512, (g, w, h) => {
    const r = rnd(3);
    g.fillStyle = '#2b2b2e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '90,90,90'},${r() * 0.12})`;
      g.beginPath(); g.ellipse(r() * w, r() * h, r() * 60 + 10, r() * 30 + 5, r() * 3, 0, 7); g.fill();
    }
    g.strokeStyle = 'rgba(15,15,15,0.7)'; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y);
      for (let j = 0; j < 8; j++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
    noise(g, w, h, 34, r);
  });
}

export function roadLines() {
  return canvasTex('roadlines', 128, 512, (g, w, h) => {
    const r = rnd(4);
    g.fillStyle = '#2b2b2e'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 34, r);
    g.fillStyle = '#d8b13a';
    g.fillRect(w / 2 - 7, 0, 5, h); g.fillRect(w / 2 + 2, 0, 5, h);
  });
}

export function sidewalk() {
  return canvasTex('sidewalk', 256, 256, (g, w, h) => {
    const r = rnd(5);
    g.fillStyle = '#8f8c86'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 26, r);
    g.strokeStyle = 'rgba(30,30,30,0.5)'; g.lineWidth = 3;
    g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  });
}

export function dirt() {
  return canvasTex('dirt', 256, 256, (g, w, h) => {
    const r = rnd(9);
    g.fillStyle = '#5a4733'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '40,30,20' : '120,100,70'},${r() * 0.3})`;
      g.fillRect(r() * w, r() * h, r() * 4 + 1, r() * 4 + 1);
    }
    noise(g, w, h, 30, r);
  });
}

export function grass() {
  return canvasTex('grass', 256, 256, (g, w, h) => {
    const r = rnd(10);
    g.fillStyle = '#3d5a2a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = `rgba(${40 + r() * 60},${70 + r() * 70},${20 + r() * 30},0.6)`;
      g.fillRect(r() * w, r() * h, 1, r() * 5 + 2);
    }
    for (let i = 0; i < 15; i++) {
      g.fillStyle = 'rgba(90,70,40,0.35)';
      g.beginPath(); g.arc(r() * w, r() * h, r() * 18 + 4, 0, 7); g.fill();
    }
  });
}

export function court() {
  return canvasTex('court', 512, 512, (g, w, h) => {
    const r = rnd(12);
    g.fillStyle = '#2f5d7a'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 20, r);
    g.strokeStyle = '#eee'; g.lineWidth = 5;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.beginPath(); g.moveTo(10, h / 2); g.lineTo(w - 10, h / 2); g.stroke();
    g.beginPath(); g.arc(w / 2, h / 2, 50, 0, 7); g.stroke();
    g.beginPath(); g.arc(w / 2, 10, 170, 0, Math.PI); g.stroke();
    g.beginPath(); g.arc(w / 2, h - 10, 170, Math.PI, 0); g.stroke();
    g.strokeRect(w / 2 - 50, 10, 100, 120); g.strokeRect(w / 2 - 50, h - 130, 100, 120);
    g.fillStyle = 'rgba(255,140,30,0.85)'; g.font = 'bold 64px Impact, sans-serif'; g.textAlign = 'center';
    g.save(); g.translate(w / 2, h / 2 + 22); g.fillText('Z6', 0, 0); g.restore();
  }, false);
}

export function tile() {
  return canvasTex('tile', 256, 256, (g, w, h) => {
    const r = rnd(13);
    g.fillStyle = '#b9b3a6'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.08})`; g.fillRect(x, y, 32, 32);
    }
    g.strokeStyle = 'rgba(60,60,60,0.6)'; g.lineWidth = 2;
    for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
    noise(g, w, h, 14, r);
  });
}

export function wallTile(color = '#d9c38a') {
  return canvasTex('walltile' + color, 256, 256, (g, w, h) => {
    const r = rnd(14);
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(80,70,50,0.5)'; g.lineWidth = 2;
    for (let y = 0; y <= h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? 0 : 16; x <= w; x += 32) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 16); g.stroke(); }
    g.fillStyle = '#c0392b'; g.fillRect(0, h * 0.62, w, 10);
    noise(g, w, h, 16, r);
  });
}

export function metal(base = '#666b70', key = 'metal') {
  return canvasTex(key + base, 128, 128, (g, w, h) => {
    const r = rnd(15);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 8) {
      g.fillStyle = `rgba(0,0,0,${0.12 + r() * 0.08})`; g.fillRect(i, 0, 3, h);
    }
    for (let i = 0; i < 20; i++) {
      g.fillStyle = `rgba(120,60,20,${r() * 0.35})`;
      g.beginPath(); g.arc(r() * w, r() * h, r() * 10 + 2, 0, 7); g.fill();
    }
    noise(g, w, h, 20, r);
  });
}

export function chainlink() {
  // Woven galvanized mesh: 4 diamonds per tile (props repeat it every 0.5 m, so ~12 cm
  // links), shaded round wire with over/under knuckles. Mips are built by hand with
  // coverage-preserving alpha so the alpha-tested mesh doesn't dissolve at distance.
  if (cache.has('chainlink3')) return cache.get('chainlink3');
  const S = 256, n = 4, step = S / n;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.lineCap = 'round';
  const wire = (x0, y0, x1, y1) => {
    for (const [lw, col] of [[7, 'rgba(70,74,78,1)'], [5, 'rgba(150,156,162,1)'], [2.4, 'rgba(205,210,215,1)'], [1, 'rgba(245,248,250,1)']]) {
      g.strokeStyle = col; g.lineWidth = lw;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
  };
  for (let k = -n; k <= n * 2; k++) {
    wire(k * step, 0, k * step + S, S);
    wire(k * step + S, 0, k * step, S);
  }
  for (let y = 0; y <= n * 2; y++) for (let x = 0; x <= n * 2; x++) {
    if ((x + y) % 2) continue;
    g.fillStyle = 'rgba(190,195,200,1)'; g.beginPath(); g.arc(x * step / 2, y * step / 2, 3.4, 0, 7); g.fill();
  }
  const base = new Uint8Array(g.getImageData(0, 0, S, S).data);
  const levels = [{ data: base, width: S, height: S }];
  let src = base, w = S, lvl = 0;
  while (w > 1) {
    const dw = w >> 1, dst = new Uint8Array(dw * dw * 4);
    lvl++;
    for (let y = 0; y < dw; y++) for (let x = 0; x < dw; x++) {
      const a = ((y * 2) * w + x * 2) * 4, b = a + 4, cc = a + w * 4, d = cc + 4, o = (y * dw + x) * 4;
      const al = src[a + 3] + src[b + 3] + src[cc + 3] + src[d + 3];
      for (let k = 0; k < 3; k++) {
        const wsum = src[a + k] * src[a + 3] + src[b + k] * src[b + 3] + src[cc + k] * src[cc + 3] + src[d + k] * src[d + 3];
        dst[o + k] = al ? wsum / al : 0;
      }
      dst[o + 3] = Math.min(255, (al / 4) * (1 + Math.min(lvl, 4) * 0.35));
    }
    levels.push({ data: dst, width: dw, height: dw });
    src = dst; w = dw;
  }
  const t = new THREE.DataTexture(base, S, S, THREE.RGBAFormat);
  t.mipmaps = levels; t.generateMipmaps = false;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.flipY = false; t.needsUpdate = true;
  cache.set('chainlink3', t);
  return t;
}

// Facade with lit/unlit windows and a storefront band at the bottom.
export function facade(wallColor, seed, opts = {}) {
  const key = `facade${wallColor}${seed}${opts.store ? 's' : ''}`;
  return canvasTex(key, 256, 512, (g, w, h) => {
    const r = rnd(seed);
    if (opts.brick) {
      g.drawImage(brick(wallColor).image, 0, 0); g.drawImage(brick(wallColor).image, 0, 256);
    } else {
      g.fillStyle = wallColor; g.fillRect(0, 0, w, h);
      noise(g, w, h, 22, r);
    }
    const rows = 4, cols = 3;
    const top = 20, bottom = opts.store ? 150 : 30;
    const cellH = (h - top - bottom) / rows, cellW = w / cols;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const lit = r() < (opts.lit ?? 0.35);
      const wx = x * cellW + 16, wy = top + y * cellH + 14, ww = cellW - 32, wh = cellH - 30;
      g.fillStyle = '#1a1a1a'; g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      g.fillStyle = lit ? (r() < 0.5 ? '#ffd889' : '#a8d4ff') : '#20272e';
      g.fillRect(wx, wy, ww, wh);
      if (!lit && r() < 0.4) { g.fillStyle = '#c9c1a4'; g.fillRect(wx, wy, ww, wh * 0.4); }
      g.fillStyle = '#111'; g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      if (r() < 0.25) { g.fillStyle = '#5a3d2a'; g.fillRect(wx - 2, wy + wh, ww + 4, 6); }
    }
    if (opts.store) {
      g.fillStyle = '#121212'; g.fillRect(0, h - 140, w, 140);
      g.fillStyle = r() < 0.5 ? '#ffe7a8' : '#cfe8ff'; g.globalAlpha = 0.85;
      g.fillRect(10, h - 120, w * 0.55, 100); g.globalAlpha = 1;
      g.fillStyle = '#3a3a3a'; g.fillRect(w * 0.65, h - 125, w * 0.28, 125);
      g.strokeStyle = '#777'; g.lineWidth = 3;
      for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(10, h - 120 + i * 20); g.lineTo(10 + w * 0.55, h - 120 + i * 20); g.stroke(); }
    }
    if (opts.tag) drawTag(g, w, h * 0.78, r, w * 0.9);
  });
}

const TAGS = ['ATL', 'ZONE 6', 'A-TOWN', 'WESTSIDE', 'EASTSIDE', '404', 'BANKHEAD', 'SWAG', 'DTA', 'PEACH ST', '1996', 'GO CRAZY', 'SOUTHSIDE', 'TRAP', 'NO CAP', 'Z6R', 'WSK', 'REAPERS', 'KINGS', 'SKRT'];
const TAG_COLORS = ['#ff3d6e', '#30e3ff', '#ffde3b', '#7cff4f', '#ff8a1f', '#c26bff', '#ffffff', '#e8e8e8', '#ff5a1f', '#8e44ff'];
const TAG_FONT = '"Anton", Impact, "Arial Black", "Inter", sans-serif';

function scratchCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

// Spray-painted piece: per-letter hand jitter, soft overspray halo, blurred outline,
// block shadow, two-tone fade fill, highlight flicks, drips, speckle and weathering.
// Draws onto g centred at (cx, cy), scaled to fit maxW. r is a 0..1 random stream.
// Letters are rasterised once into masks; every blurred layer is a single filtered
// drawImage so this stays cheap even on software canvas.
export function paintTag(g, cx, cy, maxW, r, opts = {}) {
  const text = opts.text || TAGS[Math.floor(r() * TAGS.length)];
  const style = opts.style ?? Math.floor(r() * 3); // 0 piece, 1 throw-up (bubble/silver), 2 straight-letter tag
  let col = TAG_COLORS[Math.floor(r() * TAG_COLORS.length)];
  let col2 = TAG_COLORS[Math.floor(r() * TAG_COLORS.length)];
  let line = r() < 0.7 ? '#0d0d10' : TAG_COLORS[Math.floor(r() * TAG_COLORS.length)];
  if (style === 1) { col = r() < 0.6 ? '#d9dde2' : '#f2f2f2'; col2 = '#9aa3ad'; line = '#0b0b0d'; }
  if (style === 2) { line = col; }
  const size = Math.max(36, Math.min(130, (maxW / Math.max(2, text.length)) * 1.4));
  const k = size / 150; // stroke widths below are tuned at 150px
  const pad = size * 0.6;
  const mg = scratchCanvas(10, 10).getContext('2d');
  mg.font = `900 ${size}px ${TAG_FONT}`;
  const letters = [];
  let x = 0;
  for (const ch of text) {
    const w = ch === ' ' ? size * 0.3 : mg.measureText(ch).width;
    const sc = style === 2 ? 0.95 + r() * 0.1 : 0.88 + r() * 0.3;
    letters.push({ ch, x: x + w / 2, y: (r() - 0.5) * size * (style === 2 ? 0.06 : 0.16), rot: (r() - 0.5) * (style === 2 ? 0.08 : 0.3), sc });
    x += w * (style === 1 ? 0.8 : 0.9);
  }
  const W = Math.ceil(x + pad * 2), H = Math.ceil(size * 1.9 + pad);
  const by = H * 0.48;
  const lettersTo = (ctx, mode, lw) => {
    ctx.font = `900 ${size}px ${TAG_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.lineWidth = lw || 1;
    for (const L of letters) {
      if (L.ch === ' ') continue;
      ctx.save(); ctx.translate(pad + L.x, by + L.y); ctx.rotate(L.rot); ctx.scale(L.sc, L.sc * (style === 1 ? 1.12 : 1));
      if (mode === 'fill') ctx.fillText(L.ch, 0, 0); else ctx.strokeText(L.ch, 0, 0);
      ctx.restore();
    }
  };
  // tinted mask helper: draws letters in white then recolours
  const mask = (mode, lw, color) => {
    const c = scratchCanvas(W, H), t = c.getContext('2d');
    t.fillStyle = t.strokeStyle = '#fff';
    lettersTo(t, mode, lw);
    if (mode === 'both') lettersTo(t, 'fill');
    t.globalCompositeOperation = 'source-in'; t.fillStyle = color; t.fillRect(0, 0, W, H);
    return c;
  };
  const c = scratchCanvas(W, H), t = c.getContext('2d');
  // overspray halo
  t.filter = `blur(${Math.max(2, 9 * k)}px)`; t.globalAlpha = style === 2 ? 0.18 : 0.32;
  t.drawImage(mask('both', size * (style === 1 ? 0.34 : 0.26), line), 0, 0);
  t.globalAlpha = 1; t.filter = 'none';
  if (style !== 2) {
    // 3D block shadow (crisp copies, softened once)
    const sh = scratchCanvas(W, H), sg = sh.getContext('2d');
    const fillM = mask('fill', 1, r() < 0.5 ? '#141418' : '#3a1f5c');
    for (let j = 1; j <= 8; j++) sg.drawImage(fillM, j * 1.6 * k, j * 1.6 * k);
    t.filter = `blur(${1.2 * k}px)`; t.drawImage(sh, 0, 0);
    // outline
    t.filter = `blur(${Math.max(0.6, 1.6 * k)}px)`; t.drawImage(mask('both', size * (style === 1 ? 0.2 : 0.14), line), 0, 0);
    t.filter = 'none';
  }
  // fill (two-tone fade) with sweeps and highlights clipped to it
  const f = scratchCanvas(W, H), fg = f.getContext('2d');
  const grd = fg.createLinearGradient(0, by - size * 0.5, 0, by + size * 0.5);
  grd.addColorStop(0, col); grd.addColorStop(0.55, col); grd.addColorStop(1, style === 2 ? col : col2);
  fg.fillStyle = grd; fg.strokeStyle = col;
  lettersTo(fg, 'fill');
  if (style === 2) lettersTo(fg, 'stroke', size * 0.05);
  fg.globalCompositeOperation = 'source-atop';
  const sweeps = scratchCanvas(W, H), swg = sweeps.getContext('2d');
  swg.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    swg.strokeStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.05 + r() * 0.08})`;
    swg.lineWidth = (6 + r() * 16) * k;
    const sx = r() * W, sy = by - size * 0.6 + r() * size * 1.2;
    swg.beginPath(); swg.moveTo(sx, sy); swg.quadraticCurveTo(sx + (40 + r() * 80) * k, sy + (-30 + r() * 60) * k, sx + (120 + r() * 160) * k, sy + (r() - 0.5) * 60 * k); swg.stroke();
  }
  swg.strokeStyle = 'rgba(255,255,255,0.85)'; swg.lineWidth = 4 * k; swg.fillStyle = 'rgba(255,255,255,0.9)';
  for (const L of letters) {
    if (L.ch === ' ' || r() < 0.25) continue;
    const hx = pad + L.x - size * 0.18, hy = by + L.y - size * 0.3;
    swg.beginPath(); swg.moveTo(hx, hy + 18 * k); swg.lineTo(hx, hy); swg.lineTo(hx + 16 * k, hy - 4 * k); swg.stroke();
    swg.beginPath(); swg.arc(hx + 26 * k, hy - 4 * k, 2.5 * k, 0, 7); swg.fill();
  }
  fg.filter = `blur(${Math.max(0.8, 2.5 * k)}px)`; fg.drawImage(sweeps, 0, 0); fg.filter = 'none';
  fg.globalCompositeOperation = 'source-over';
  t.filter = `blur(${Math.max(0.4, 0.9 * k)}px)`; t.drawImage(f, 0, 0); t.filter = 'none';
  // drips from the bottoms of letters
  const dripCol = style === 2 ? col : (r() < 0.5 ? col2 : line);
  t.fillStyle = dripCol; t.globalAlpha = 0.85;
  for (const L of letters) {
    if (L.ch === ' ') continue;
    const n = r() < 0.6 ? 1 + Math.floor(r() * 3) : 0;
    for (let j = 0; j < n; j++) {
      const dx = pad + L.x + (r() - 0.5) * size * 0.4, dy = by + L.y + size * 0.3, len = (12 + r() * r() * 135) * k, wd = (2 + r() * 3) * Math.max(0.5, k);
      t.fillRect(dx - wd / 2, dy, wd, len);
      t.beginPath(); t.arc(dx, dy + len, wd * 0.85, 0, 7); t.fill();
    }
  }
  t.globalAlpha = 1;
  // overspray speckle
  for (let i = 0; i < 700; i++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * W * 0.5;
    t.fillStyle = r() < 0.5 ? col : line; t.globalAlpha = 0.25 + r() * 0.4;
    t.fillRect(W / 2 + Math.cos(a) * d, by + Math.sin(a) * d * 0.35, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  t.globalAlpha = 1;
  // weathering: speckled fade and scuffs
  t.globalCompositeOperation = 'destination-out';
  const age = opts.age ?? r() * 0.8;
  t.fillStyle = '#000';
  for (let i = 0; i < 2500 * age * k; i++) { t.globalAlpha = 0.2 + r() * 0.6; t.fillRect(r() * W, r() * H, 1 + r() * 3 * k, 1 + r() * 3 * k); }
  const scuffs = scratchCanvas(W, H), scg = scuffs.getContext('2d');
  scg.fillStyle = '#000';
  for (let i = 0; i < 6 * age; i++) { scg.globalAlpha = 0.25 + r() * 0.35; scg.beginPath(); scg.ellipse(r() * W, r() * H, (20 + r() * 60) * k, (10 + r() * 30) * k, r() * 3, 0, 7); scg.fill(); }
  t.globalAlpha = 1; t.filter = `blur(${6 * k}px)`; t.drawImage(scuffs, 0, 0);
  t.filter = 'none'; t.globalCompositeOperation = 'source-over';
  // place
  const scale = Math.min(maxW / (W - pad), (opts.maxH || 1e9) / (H - pad * 0.5));
  g.save();
  g.translate(cx, cy);
  g.rotate((r() - 0.5) * 0.12);
  g.scale(scale, scale);
  g.drawImage(c, -W / 2, -H / 2);
  g.restore();
}

function drawTag(g, cx, cy, r, maxW) {
  paintTag(g, cx / 2, cy, maxW, r);
}

export function graffiti(seed) {
  return canvasTex('graf' + seed, 1024, 512, (g, w, h) => {
    const r = rnd(seed * 31 + 1);
    g.clearRect(0, 0, w, h);
    paintTag(g, w / 2, h / 2, w * 0.86, r, { maxH: h * 0.95 });
  }, false);
}

export function sign(text, bg = '#b71c1c', fg = '#fff', opts = {}) {
  const key = `sign${text}${bg}${fg}${opts.sub || ''}`;
  return canvasTex(key, 1024, 256, (g) => {
    const w = 512, h = 128;
    g.scale(2, 2);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = opts.border || 'rgba(255,255,255,0.6)'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = opts.sub ? 64 : 82;
    g.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
    while (g.measureText(text).width > w - 40 && size > 20) { size -= 4; g.font = `900 ${size}px Impact, "Arial Black", sans-serif`; }
    if (opts.glow) { g.shadowColor = fg; g.shadowBlur = 18; }
    g.fillText(text, w / 2, opts.sub ? h * 0.4 : h / 2 + 4);
    if (opts.sub) {
      g.shadowBlur = 0; g.font = 'bold 26px Arial, sans-serif'; g.fillText(opts.sub, w / 2, h * 0.8);
    }
  }, false);
}

export function flagTex(letter, color) {
  return canvasTex('flag' + letter + color, 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = color; g.beginPath(); g.arc(w / 2, h / 2, 56, 0, 7); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#fff'; g.font = '900 72px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(letter, w / 2, h / 2 + 4);
  }, false);
}

export function skyline() {
  return canvasTex('skyline', 2048, 512, (g, w, h) => {
    const r = rnd(21);
    g.clearRect(0, 0, w, h);
    const draw = (x, bw, bh, col, spire) => {
      g.fillStyle = col; g.fillRect(x, h - bh, bw, bh);
      if (spire === 'boa') {
        g.beginPath(); g.moveTo(x, h - bh); g.lineTo(x + bw / 2, h - bh - bw * 0.9); g.lineTo(x + bw, h - bh); g.fill();
        g.fillStyle = '#ffcf5a'; g.fillRect(x + bw / 2 - 3, h - bh - bw * 0.9 - 40, 6, 40);
        g.fillStyle = 'rgba(255,200,80,0.8)';
        g.beginPath(); g.moveTo(x + 8, h - bh); g.lineTo(x + bw / 2, h - bh - bw * 0.8); g.lineTo(x + bw - 8, h - bh); g.closePath(); g.fill();
        g.fillStyle = col;
        g.beginPath(); g.moveTo(x + 18, h - bh + 2); g.lineTo(x + bw / 2, h - bh - bw * 0.6); g.lineTo(x + bw - 18, h - bh + 2); g.closePath(); g.fill();
      } else if (spire === 'needle') {
        g.fillRect(x + bw / 2 - 2, h - bh - 60, 4, 60);
      } else if (spire === 'crown') {
        g.beginPath(); g.moveTo(x, h - bh); g.lineTo(x + bw * 0.2, h - bh - 30); g.lineTo(x + bw * 0.5, h - bh - 10);
        g.lineTo(x + bw * 0.8, h - bh - 30); g.lineTo(x + bw, h - bh); g.fill();
      } else if (spire === 'round') {
        g.beginPath(); g.arc(x + bw / 2, h - bh, bw / 2, Math.PI, 0); g.fill();
      }
      for (let yy = h - bh + 8; yy < h - 4; yy += 9) for (let xx = x + 4; xx < x + bw - 4; xx += 7) {
        if (r() < 0.32) { g.fillStyle = r() < 0.7 ? 'rgba(255,214,140,0.9)' : 'rgba(170,210,255,0.9)'; g.fillRect(xx, yy, 3, 4); }
      }
    };
    // background layer
    for (let x = 0; x < w; x += 30 + r() * 40) draw(x, 30 + r() * 40, 40 + r() * 90, '#14161f');
    // the downtown/midtown cluster
    const towers = [
      [700, 70, 300, 'boa'], [600, 60, 230, 'crown'], [820, 55, 260, 'needle'], [900, 80, 200, 'round'],
      [520, 50, 180], [1000, 60, 170, 'needle'], [1080, 45, 150], [440, 55, 140, 'crown'], [1150, 70, 210, 'round'],
      [1260, 50, 130], [360, 40, 120], [1350, 60, 160, 'needle'],
    ];
    for (const [x, bw, bh, s] of towers) draw(x, bw, bh, '#0b0c12', s);
    for (let x = 1500; x < w; x += 60 + r() * 50) draw(x, 30 + r() * 40, 60 + r() * 60, '#0e1018');
  });
}

export function smokeSprite() {
  return canvasTex('smoke', 64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, false);
}

export function flashSprite() {
  return canvasTex('flash', 64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.25, 'rgba(255,200,80,0.9)'); gr.addColorStop(1, 'rgba(255,120,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,230,150,0.9)'; g.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.cos(a) * w / 2, h / 2 + Math.sin(a) * h / 2); g.stroke();
    }
  }, false);
}

export function nameTag(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 48;
  const g = c.getContext('2d');
  g.font = 'bold 28px Rajdhani, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.strokeText(text, 128, 24);
  g.fillStyle = color; g.fillText(text, 128, 24);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
