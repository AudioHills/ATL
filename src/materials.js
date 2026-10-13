// Physically based surface sets, generated at load time.
//
// Every set is painted from tileable noise fields (periodic Perlin fBm, Worley cells,
// rasterised masks) into float buffers sized in real-world meters, then baked into
//   map        albedo (sRGB; alpha is a facade wall mask)
//   normalMap  tangent-space normal derived from the height buffer (Sobel)
//   orm        R = cavity/AO, G = roughness, B = metalness (or a facade wall mask)
// std() wraps MeshStandardMaterial with a shader layer that adds world-space macro
// variation and anti-tiling, ground-contact grime, wet streets with puddles, micro
// detail maps for close-ups and parallax-mapped room interiors behind facade windows.
import * as THREE from 'three';
import { paintTag } from './textures.js';

// ---------------- config ----------------

const CFG = { quality: 'high', wet: false, night: false, indoor: false };
let BASE = 1; // texture resolution scale for the quality setting (Low halves everything)
let SC = 1; // working scale (BASE, or a quarter of it while streaming a preview)
const GU = { uWet: { value: 0 }, uNight: { value: 0 } };

// Called by World before building a map. Safe to call repeatedly.
// The very first world (the menu backdrop) streams in: every set is generated at quarter
// resolution immediately and refined to full resolution in the background, so the page is
// interactive quickly. Later worlds (matches) generate at full resolution up front.
let configured = 0, PROG = false;
export function configure(o = {}) {
  Object.assign(CFG, o);
  const s = CFG.quality === 'low' ? 0.5 : 1;
  if (s !== BASE) { BASE = SC = s; purge(); }
  GU.uWet.value = CFG.wet ? 1 : 0;
  GU.uNight.value = CFG.night ? 1 : 0;
  configured++;
  PROG = configured === 1 && o.progressive !== false;
  evict();
}
// Free sets (and the materials built on them) that neither the previous nor the current
// world touched, so walking through every map doesn't accumulate textures forever.
function evict() {
  const dead = new Set();
  for (const [k, set] of cache) {
    if (!set || !set.orm || (set.used ?? 0) >= configured - 1) continue;
    dead.add(set.map); dead.add(set.normalMap); dead.add(set.orm);
    cache.delete(k); pending.delete(k);
  }
  if (!dead.size) return;
  // textures still referenced by surviving sets (shared structure maps) stay alive
  for (const set of cache.values()) if (set) for (const t of [set.map, set.normalMap, set.orm]) dead.delete(t);
  for (const [k, m] of matCache) {
    const U = m.userData.surface;
    if (m.map && (dead.has(m.map.__base) || (U && dead.has(U.tORM.value)))) { m.dispose(); matCache.delete(k); }
  }
  for (const t of dead) {
    if (!t) continue;
    for (const c of clones.get(t) || []) { c.dispose(); repCache.delete(c.__repKey); }
    clones.delete(t);
    t.dispose();
  }
}

const cache = new Map();
const fields = new Map();
const pending = new Map(); // cache key -> full-resolution generator still owed
function purge() {
  for (const set of cache.values()) for (const k of ['map', 'normalMap', 'orm']) set && set[k] && set[k].dispose && set[k].dispose();
  for (const t of details.values()) t.dispose();
  cache.clear(); fields.clear(); details.clear(); repCache.clear(); matCache.clear(); pending.clear(); clones.clear();
}
const R = (n) => Math.max(16, Math.round(n * SC));

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

let inJob = false, depth = 0;
// Noise fields are only shared within one top-level generation; drop them afterwards.
function gen(make) {
  depth++;
  try { return make(); } finally { if (--depth === 0) fields.clear(); }
}
function cached(key, make) {
  const k = key + '@' + BASE;
  let v = cache.get(k);
  if (v) {
    if ((inJob || !PROG) && pending.has(k)) upgrade(k);
    v.used = configured;
    if (v.facade && v.facade.wall) v.facade.wall.used = configured;
    return v;
  }
  const t0 = performance.now();
  if (PROG && !inJob) {
    const sc = SC; SC = BASE / 4;
    try { v = gen(make); } finally { SC = sc; }
    cache.set(k, v);
    if (v && v.orm) { pending.set(k, make); schedule(); }
  } else {
    v = gen(make);
    cache.set(k, v);
  }
  if (v) v.used = configured;
  if (globalThis.__texlog) console.log('TEX', k, PROG && !inJob ? 'preview' : 'full', (performance.now() - t0).toFixed(0), 'at', performance.now().toFixed(0));
  return v;
}
// Regenerate a streamed set at full resolution and swap the pixels into the live textures.
function upgrade(k) {
  const make = pending.get(k);
  if (!make) return;
  pending.delete(k);
  const was = inJob, sc = SC;
  inJob = true; SC = BASE;
  let nv;
  try { nv = gen(make); } finally { inJob = was; SC = sc; }
  const ov = cache.get(k);
  for (const t of ['map', 'normalMap', 'orm']) if (ov[t] && nv[t] && ov[t] !== nv[t]) moveTex(ov[t], nv[t]);
  for (const key of Object.keys(nv)) if (!['map', 'normalMap', 'orm', 'roughnessMap', 'aoMap', 'metalnessMap', 'id', 'facade'].includes(key)) ov[key] = nv[key];
  if (ov.facade && nv.facade) Object.assign(ov.facade, { ...nv.facade, wall: ov.facade.wall });
}
const clones = new Map(); // texture -> repeat clones sharing its source
function moveTex(dst, src) {
  const all = [dst, ...(clones.get(dst) || [])];
  for (const t of all) { t.dispose(); t.mipmaps = src.mipmaps; }
  dst.image = src.image;
  for (const t of all) t.needsUpdate = true;
}
let timer = 0;
function schedule() { if (!timer) timer = setTimeout(tick, 60); }
function tick() {
  timer = 0;
  if (!PROG) return;
  const k = pending.keys().next().value;
  if (k === undefined) return;
  upgrade(k);
  schedule();
}
function memo(key, make) {
  let v = fields.get(key);
  if (!v) { v = make(); fields.set(key, v); }
  return v;
}

// ---------------- math helpers ----------------

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ss = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
function rgb(c) {
  if (typeof c === 'number') return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
  let s = String(c).replace('#', '');
  if (s.length === 3) s = s.split('').map((ch) => ch + ch).join('');
  const v = parseInt(s, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function hsl2rgb(h, s, l) {
  const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)];
}
function rgb2hsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function jitterColor(base, r, dh, ds, dl) {
  const [h, s, l] = rgb2hsl(base);
  return hsl2rgb(((h + (r() - 0.5) * dh) % 1 + 1) % 1, clamp01(s + (r() - 0.5) * ds), clamp01(l + (r() - 0.5) * dl));
}

function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------------- tileable noise fields ----------------

function perlinInto(out, w, h, cx, cy, seed, amp, ridge) {
  const n = cx * cy, gx = new Float32Array(n), gy = new Float32Array(n);
  for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const a = hash2(i, j, seed) * 6.2831853; gx[j * cx + i] = Math.cos(a); gy[j * cx + i] = Math.sin(a);
  }
  const txs = new Float32Array(w), sxs = new Float32Array(w), i0 = new Int32Array(w), i1 = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    const fx = (x + 0.5) / w * cx, ix = Math.floor(fx), t = fx - ix;
    txs[x] = t; sxs[x] = t * t * t * (t * (t * 6 - 15) + 10); i0[x] = ix % cx; i1[x] = (ix + 1) % cx;
  }
  for (let y = 0; y < h; y++) {
    const fy = (y + 0.5) / h * cy, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
    const r0 = (iy % cy) * cx, r1 = ((iy + 1) % cy) * cx;
    let o = y * w;
    for (let x = 0; x < w; x++, o++) {
      const tx = txs[x], a = r0 + i0[x], b = r0 + i1[x], c = r1 + i0[x], d = r1 + i1[x];
      const n00 = gx[a] * tx + gy[a] * ty, n10 = gx[b] * (tx - 1) + gy[b] * ty;
      const n01 = gx[c] * tx + gy[c] * (ty - 1), n11 = gx[d] * (tx - 1) + gy[d] * (ty - 1);
      const sx = sxs[x], nx0 = n00 + (n10 - n00) * sx, nx1 = n01 + (n11 - n01) * sx;
      const v = nx0 + (nx1 - nx0) * sy;
      out[o] += (ridge ? 0.7 - Math.abs(v) * 2 : v) * amp;
    }
  }
}
// Normalise to roughly [0,1] using mean/std (±2σ), clamped.
function normalize(a) {
  let m = 0; for (let i = 0; i < a.length; i++) m += a[i];
  m /= a.length;
  let v = 0; for (let i = 0; i < a.length; i++) v += (a[i] - m) * (a[i] - m);
  const k = 1 / (4 * Math.sqrt(v / a.length) || 1);
  for (let i = 0; i < a.length; i++) a[i] = clamp01(0.5 + (a[i] - m) * k);
  return a;
}
// fBm with cx cells across (cy derived from aspect unless given), periodic over the tile.
function fbm(w, h, cx, oct, seed, gain = 0.5, cy, ridge = false) {
  cx = Math.max(1, Math.round(cx));
  cy = Math.max(1, Math.round(cy ?? cx * h / w));
  return memo(`f${w}x${h}:${cx}:${cy}:${oct}:${seed}:${gain}:${ridge}`, () => {
    // evaluate at the lowest resolution that still resolves the finest octave, then upsample
    let oc = 0;
    while (oc < oct && (cx << oc) <= w / 1.5 && (cy << oc) <= h / 1.5) oc++;
    const f = Math.min(1, Math.max((cx << (oc - 1)) * 6 / w, (cy << (oc - 1)) * 6 / h));
    const lw = Math.max(8, Math.round(w * f)), lh = Math.max(8, Math.round(h * f));
    const low = new Float32Array(lw * lh);
    let amp = 1;
    for (let o = 0; o < oc; o++) { perlinInto(low, lw, lh, cx << o, cy << o, seed + o * 101, amp, ridge); amp *= gain; }
    normalize(low);
    return lw === w && lh === h ? low : upsample(low, lw, lh, w, h);
  });
}
function upsample(src, sw, sh, w, h) {
  const out = new Float32Array(w * h), kx = sw / w, ky = sh / h;
  const x0s = new Int32Array(w), x1s = new Int32Array(w), fxs = new Float32Array(w);
  for (let x = 0; x < w; x++) { const fx = (x + 0.5) * kx - 0.5, ix = Math.floor(fx); fxs[x] = fx - ix; x0s[x] = ((ix % sw) + sw) % sw; x1s[x] = (x0s[x] + 1) % sw; }
  for (let y = 0; y < h; y++) {
    const fy = (y + 0.5) * ky - 0.5, iy = Math.floor(fy), ty = fy - iy, r0 = (((iy % sh) + sh) % sh) * sw, r1 = ((((iy + 1) % sh) + sh) % sh) * sw;
    let o = y * w;
    for (let x = 0; x < w; x++, o++) {
      const tx = fxs[x], a = src[r0 + x0s[x]], b = src[r0 + x1s[x]], c = src[r1 + x0s[x]], d = src[r1 + x1s[x]];
      out[o] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}
// Worley cells: f1, f2 (in cell units) and a per-cell random id.
function worley(w, h, cx, seed, jit = 1, cy) {
  cx = Math.max(1, Math.round(cx));
  cy = Math.max(1, Math.round(cy ?? cx * h / w));
  return memo(`w${w}x${h}:${cx}:${cy}:${seed}:${jit}`, () => {
    const n = cx * cy, ox = new Float32Array(n), oy = new Float32Array(n), cid = new Float32Array(n);
    for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
      const k = j * cx + i;
      ox[k] = 0.5 + (hash2(i, j, seed) - 0.5) * jit; oy[k] = 0.5 + (hash2(i, j, seed + 7) - 0.5) * jit; cid[k] = hash2(i, j, seed + 13);
    }
    const f1 = new Float32Array(w * h), f2 = new Float32Array(w * h), id = new Float32Array(w * h);
    const kx = cx / w, ky = cy / h;
    const xi = new Int32Array(w * 3), xc = new Float32Array(w * 3), fxs = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const fx = (x + 0.5) * kx, ix = Math.floor(fx); fxs[x] = fx;
      for (let d = 0; d < 3; d++) { const ci = ix + d - 1; xi[x * 3 + d] = ((ci % cx) + cx) % cx; xc[x * 3 + d] = ci; }
    }
    let o = 0;
    for (let y = 0; y < h; y++) {
      const fy = (y + 0.5) * ky, iy = Math.floor(fy);
      const rj0 = (((iy - 1) % cy + cy) % cy) * cx, rj1 = ((iy % cy + cy) % cy) * cx, rj2 = (((iy + 1) % cy + cy) % cy) * cx;
      for (let x = 0; x < w; x++, o++) {
        const fx = fxs[x];
        let d1 = 1e9, d2 = 1e9, best = 0;
        for (let dj = 0; dj < 3; dj++) {
          const row = dj === 0 ? rj0 : dj === 1 ? rj1 : rj2, cyv = iy + dj - 1 - fy;
          for (let di = 0; di < 3; di++) {
            const k = row + xi[x * 3 + di];
            const dx = xc[x * 3 + di] + ox[k] - fx, dy = cyv + oy[k], dd = dx * dx + dy * dy;
            if (dd < d1) { d2 = d1; d1 = dd; best = cid[k]; } else if (dd < d2) d2 = dd;
          }
        }
        f1[o] = Math.sqrt(d1); f2[o] = Math.sqrt(d2); id[o] = best;
      }
    }
    return { f1, f2, id };
  });
}
function white(n, seed) {
  return memo(`n${n}:${seed}`, () => { const r = rng(seed), a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = r(); return a; });
}
// Separable wrap-around box blur (2 passes ≈ gaussian). Running sums, no modulo in inner loops.
function blur(src, w, h, r, passes = 2) {
  r = Math.max(1, Math.min(Math.round(r), (w >> 1) - 1, (h >> 1) - 1));
  let a = Float32Array.from(src);
  const b = new Float32Array(w * h), inv = 1 / (2 * r + 1), ext = new Float32Array(w + 2 * r + 2), sums = new Float32Array(w);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let k = 0; k < r; k++) ext[k] = a[o + w - r + k];
      ext.set(a.subarray(o, o + w), r);
      for (let k = 0; k <= r; k++) ext[r + w + k] = a[o + k];
      let sm = 0;
      for (let k = 0; k <= 2 * r; k++) sm += ext[k];
      for (let x = 0; x < w; x++) { b[o + x] = sm * inv; sm += ext[x + 2 * r + 1] - ext[x]; }
    }
    sums.fill(0);
    for (let k = -r; k <= r; k++) { const o = (((k % h) + h) % h) * w; for (let x = 0; x < w; x++) sums[x] += b[o + x]; }
    for (let y = 0; y < h; y++) {
      const o = y * w, add = ((y + r + 1) % h) * w, sub = (((y - r) % h + h) % h) * w;
      for (let x = 0; x < w; x++) { a[o + x] = sums[x] * inv; sums[x] += b[add + x] - b[sub + x]; }
    }
  }
  return a;
}
// Rasterise shapes into a [0,1] mask (red channel). draw(g, w, h) paints in white.
function raster(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.fillStyle = g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
  draw(g, w, h);
  const d = g.getImageData(0, 0, w, h).data, out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
  return out;
}
// Up to three masks rasterised in one canvas (one per colour channel, additive) so a
// single getImageData readback serves them all.
function rasterN(w, h, draws) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
  const cols = ['#f00', '#0f0', '#00f'];
  draws.forEach((d, k) => { if (!d) return; g.save(); g.fillStyle = g.strokeStyle = cols[k]; d(g, w, h); g.restore(); });
  const px = g.getImageData(0, 0, w, h).data, n = w * h;
  return draws.map((d, k) => { if (!d) return null; const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = px[i * 4 + k] / 255; return o; });
}
// Draw fn at the 9 wrap offsets so shapes crossing an edge tile seamlessly.
function wrap9(g, w, h, fn) {
  for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.save(); g.translate(ox, oy); fn(g); g.restore(); }
}
// Random-walk crack polyline with optional branches.
function crackPaths(r, n, w, h, len, step, branch = 0.3) {
  const paths = [];
  const walk = (x, y, a, steps) => {
    const pts = [[x, y]];
    for (let k = 0; k < steps; k++) {
      a += (r() - 0.5) * 0.9; x += Math.cos(a) * step * (0.6 + r() * 0.8); y += Math.sin(a) * step * (0.6 + r() * 0.8);
      pts.push([x, y]);
      if (r() < branch * 0.15 && paths.length < n * 4) walk(x, y, a + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6), Math.floor(steps * 0.4));
    }
    paths.push(pts);
  };
  for (let i = 0; i < n; i++) walk(r() * w, r() * h, r() * 6.283, len);
  return paths;
}
function strokePaths(g, paths, lw) {
  g.lineWidth = lw;
  for (const p of paths) { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let k = 1; k < p.length; k++) g.lineTo(p[k][0], p[k][1]); g.stroke(); }
}
// Paint full-colour RGBA with canvas 2D (text, posters...). Returns unpremultiplied bytes.
function paint(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  draw(g, w, h);
  return g.getImageData(0, 0, w, h).data;
}

// ---------------- surface buffers & baking ----------------

function surf(w, h) {
  const n = w * h;
  return { w, h, n, R: new Float32Array(n), G: new Float32Array(n), B: new Float32Array(n), H: new Float32Array(n), Ro: new Float32Array(n).fill(0.85), A: null, Me: null, AO: null };
}

let setId = 0;
// Gamma-correct mip chain built on the CPU (sRGB mip generation is very slow in some
// software GL paths, and averaging in linear space keeps distant surfaces from darkening).
const S2L = new Float32Array(256).map((_, i) => lin(i / 255));
const L2S = new Uint8Array(4096).map((_, i) => { const c = i / 4095; return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255); });
function mipChain(bytes, w, h, srgb) {
  const levels = [{ data: bytes, width: w, height: h }];
  let src = bytes, sw = w, sh = h;
  while (sw > 1 || sh > 1) {
    const dw = Math.max(1, sw >> 1), dh = Math.max(1, sh >> 1), dst = new Uint8Array(dw * dh * 4);
    for (let y = 0; y < dh; y++) {
      const y0 = Math.min(sh - 1, y * 2), y1 = Math.min(sh - 1, y * 2 + 1);
      for (let x = 0; x < dw; x++) {
        const x0 = Math.min(sw - 1, x * 2), x1 = Math.min(sw - 1, x * 2 + 1);
        const a = (y0 * sw + x0) * 4, b = (y0 * sw + x1) * 4, c = (y1 * sw + x0) * 4, d = (y1 * sw + x1) * 4, o = (y * dw + x) * 4;
        if (srgb) {
          for (let k = 0; k < 3; k++) dst[o + k] = L2S[((S2L[src[a + k]] + S2L[src[b + k]] + S2L[src[c + k]] + S2L[src[d + k]]) * 1023.75) | 0];
        } else {
          for (let k = 0; k < 3; k++) dst[o + k] = (src[a + k] + src[b + k] + src[c + k] + src[d + k] + 2) >> 2;
        }
        dst[o + 3] = (src[a + 3] + src[b + 3] + src[c + 3] + src[d + 3] + 2) >> 2;
      }
    }
    levels.push({ data: dst, width: dw, height: dh });
    src = dst; sw = dw; sh = dh;
  }
  return levels;
}
function dataTex(bytes, w, h, srgb) {
  const t = new THREE.DataTexture(bytes, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (srgb) { t.mipmaps = mipChain(bytes, w, h, true); t.generateMipmaps = false; } else t.generateMipmaps = true;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = SC < 1 ? 4 : 8;
  t.needsUpdate = true;
  return t;
}
// Rows are stored bottom-up so v=1 is the top of the painted image (canvas convention).
function albedoBytes(s) {
  const { w, h, R: r, G: g, B: b, A: a } = s, out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    let i = y * w, o = (h - 1 - y) * w * 4;
    for (let x = 0; x < w; x++, i++, o += 4) {
      out[o] = clamp01(r[i]) * 255 + 0.5; out[o + 1] = clamp01(g[i]) * 255 + 0.5; out[o + 2] = clamp01(b[i]) * 255 + 0.5;
      out[o + 3] = a ? clamp01(a[i]) * 255 + 0.5 : 255;
    }
  }
  return out;
}
function normalBytes(H, w, h, k) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const ym = ((y - 1 + h) % h) * w, y0 = y * w, yp = ((y + 1) % h) * w;
    let o = (h - 1 - y) * w * 4;
    for (let x = 0; x < w; x++, o += 4) {
      const xm = (x - 1 + w) % w, xp = (x + 1) % w;
      const dx = (H[ym + xp] + 2 * H[y0 + xp] + H[yp + xp]) - (H[ym + xm] + 2 * H[y0 + xm] + H[yp + xm]);
      const dy = (H[yp + xm] + 2 * H[yp + x] + H[yp + xp]) - (H[ym + xm] + 2 * H[ym + x] + H[ym + xp]);
      let nx = -dx * k, ny = dy * k;
      const l = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      out[o] = (nx * l * 0.5 + 0.5) * 255 + 0.5; out[o + 1] = (ny * l * 0.5 + 0.5) * 255 + 0.5; out[o + 2] = (l * 0.5 + 0.5) * 255 + 0.5; out[o + 3] = 255;
    }
  }
  return out;
}
// Cavity AO from the height field (small + medium radius), multiplied by any painted AO.
function cavity(s, k1 = 2.5, k2 = 1.2, r1 = 2, r2 = 8) {
  const { w, h, H, n } = s;
  const b1 = blur(H, w, h, Math.max(1, r1 * SC)), b2 = blur(H, w, h, Math.max(2, r2 * SC));
  const ao = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const c = Math.max(0, b1[i] - H[i]) * k1 + Math.max(0, b2[i] - H[i]) * k2;
    ao[i] = clamp01(1 - Math.min(0.85, c)) * (s.AO ? s.AO[i] : 1);
  }
  return ao;
}
function ormBytes(s, ao, bChan) {
  const { w, h, Ro } = s, out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    let i = y * w, o = (h - 1 - y) * w * 4;
    for (let x = 0; x < w; x++, i++, o += 4) {
      out[o] = clamp01(ao[i]) * 255 + 0.5; out[o + 1] = clamp01(Ro[i]) * 255 + 0.5;
      out[o + 2] = bChan ? clamp01(bChan[i]) * 255 + 0.5 : 0; out[o + 3] = 255;
    }
  }
  return out;
}
function meanLum(s) {
  let t = 0, c = 0;
  for (let i = 0; i < s.n; i += 13, c++) t += 0.2126 * S2L[(clamp01(s.R[i]) * 255) | 0] + 0.7152 * S2L[(clamp01(s.G[i]) * 255) | 0] + 0.0722 * S2L[(clamp01(s.B[i]) * 255) | 0];
  return t / c;
}
// o: normal strength, ao params, plus material hints copied onto the set:
//   tileM (meters per texture tile), detail ('stone'|'metal'|'wood'|'plaster'), detM,
//   ground, antitile, grime, macro, pud (puddle threshold).
function halve(a, w, h) {
  if (!a) return null;
  const hw = w >> 1, hh = h >> 1, o = new Float32Array(hw * hh);
  for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) { const i = y * 2 * w + x * 2; o[y * hw + x] = (a[i] + a[i + 1] + a[i + w] + a[i + w + 1]) * 0.25; }
  return o;
}
function bake(s, o = {}) {
  // o.half: normal + ORM at half resolution (albedo stays full res)
  const t = o.half ? { w: s.w >> 1, h: s.h >> 1, n: (s.w >> 1) * (s.h >> 1), H: halve(s.H, s.w, s.h), Ro: halve(s.Ro, s.w, s.h), Me: halve(s.Me, s.w, s.h), AO: halve(s.AO, s.w, s.h) } : s;
  const ao = cavity(t, o.ao1, o.ao2, o.half ? (o.aoR1 ?? 2) / 2 : o.aoR1, o.half ? (o.aoR2 ?? 8) / 2 : o.aoR2);
  const k = (o.normal ?? 3) * SC / 8 * (o.half ? 0.5 : 1);
  const set = {
    id: ++setId,
    map: dataTex(albedoBytes(s), s.w, s.h, true),
    normalMap: dataTex(normalBytes(t.H, t.w, t.h, k), t.w, t.h, false),
    orm: dataTex(ormBytes(t, ao, t.Me), t.w, t.h, false),
    lum: meanLum(s),
    metal: !!s.Me,
    tileM: o.tileM ?? 2, detail: o.detail ?? null, detM: o.detM ?? 0.6, detStr: o.detStr ?? 0.5,
    ground: !!o.ground, antitile: !!o.antitile, grime: o.grime ?? !o.ground, macro: o.macro ?? 0.8, pud: o.pud ?? 0.6,
  };
  set.roughnessMap = set.orm; set.aoMap = set.orm; set.metalnessMap = s.Me ? set.orm : null;
  return set;
}
// A recoloured variant sharing normal + ORM with a structural set.
function recolor(base, s, extra = {}) {
  return { ...base, ...extra, id: ++setId, map: dataTex(albedoBytes(s), s.w, s.h, true), lum: meanLum(s) };
}

// ---------------- micro detail maps ----------------
// RGBA (linear): RG = normal xy, B = albedo modulation (0.5 = none), A = roughness modulation.
const details = new Map();
function detailTex(kind) {
  const key = kind + '@' + SC;
  if (details.has(key)) return details.get(key);
  const w = R(512), n = w * w, H = new Float32Array(n), Al = new Float32Array(n).fill(0.5), Rm = new Float32Array(n).fill(0.5);
  const wn = white(n, 77);
  if (kind === 'stone' || kind === 'plaster') {
    const big = kind === 'stone';
    const wc = worley(w, w, big ? 40 : 70, 5, 1), f = fbm(w, w, 24, 3, 6), f2 = fbm(w, w, 64, 2, 9);
    for (let i = 0; i < n; i++) {
      const g = ss(0.48, 0.15, wc.f1[i]) * (wc.id[i] > (big ? 0.25 : 0.45) ? 1 : 0);
      const pit = ss(0.12, 0.04, wc.f2[i] - wc.f1[i]) * (big ? 0.4 : 0.2);
      H[i] = g * (0.5 + wc.id[i] * 0.5) * (big ? 0.9 : 0.5) + (f[i] - 0.5) * 0.5 + (f2[i] - 0.5) * 0.35 + (wn[i] - 0.5) * 0.18 - pit;
      Al[i] = 0.5 + (big ? (wc.id[i] - 0.5) * g * 0.35 : 0) + (f2[i] - 0.5) * 0.12 + (wn[i] - 0.5) * 0.08 - pit * 0.3;
      Rm[i] = 0.5 - g * 0.12 + (f[i] - 0.5) * 0.2;
    }
  } else if (kind === 'metal') {
    const f = fbm(w, w, 16, 3, 12), str = fbm(w, w, 2, 3, 13, 0.5, 96);
    const sc = raster(w, w, (g) => {
      const r = rng(5);
      g.globalAlpha = 0.6;
      for (let i = 0; i < 220; i++) {
        const x = r() * w, y = r() * w, a = (r() - 0.5) * 0.6 + (r() < 0.5 ? 0 : 1.57), l = 10 + r() * 70;
        g.lineWidth = 0.6 + r() * 0.8; g.globalAlpha = 0.25 + r() * 0.6;
        wrap9(g, w, w, (gg) => { gg.beginPath(); gg.moveTo(x, y); gg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); gg.stroke(); });
      }
    });
    for (let i = 0; i < n; i++) {
      H[i] = (str[i] - 0.5) * 0.35 + (f[i] - 0.5) * 0.3 - sc[i] * 0.5 + (wn[i] - 0.5) * 0.08;
      Al[i] = 0.5 + sc[i] * 0.18 + (f[i] - 0.5) * 0.08;
      Rm[i] = 0.5 - sc[i] * 0.25 + (str[i] - 0.5) * 0.25;
    }
  } else { // wood
    const f = fbm(w, w, 1, 4, 21, 0.5, 48), f2 = fbm(w, w, 6, 3, 22);
    for (let i = 0; i < n; i++) {
      const y = Math.floor(i / w);
      const v = Math.sin((y / w) * 6.283 * 40 + f[i] * 9 + f2[i] * 2) * 0.5 + 0.5;
      H[i] = v * 0.4 + (f[i] - 0.5) * 0.3 + (wn[i] - 0.5) * 0.1;
      Al[i] = 0.5 + (v - 0.5) * 0.12;
      Rm[i] = 0.5 + (v - 0.5) * 0.15;
    }
  }
  const nb = normalBytes(H, w, w, 0.5 * SC);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = ((w - 1 - y) * w + x) * 4;
    nb[o + 2] = clamp01(Al[i]) * 255; nb[o + 3] = clamp01(Rm[i]) * 255;
  }
  const t = dataTex(nb, w, w, false);
  details.set(key, t);
  return t;
}

// ---------------- generators ----------------

// Asphalt in physical units: mW x mH meters across the buffer.
function asphaltLayer(s, mW, mH, seed) {
  const { w, h, n, R: Rr, G, B, H, Ro } = s;
  const cx = (m) => Math.max(1, Math.round(mW / m));
  const mac = fbm(w, h, cx(5), 4, seed), mid = fbm(w, h, cx(1.1), 3, seed + 1), grit = fbm(w, h, cx(0.12), 2, seed + 2);
  const st = worley(w, h, cx(0.045), seed + 3, 1);
  const crk = worley(w, h, cx(1.4), seed + 5, 0.9), crkM = fbm(w, h, cx(4), 3, seed + 6);
  const wn = white(n, seed + 9);
  const r = rng(seed + 11), ppm = w / mW;
  // long cracks and sealed "tar snakes"
  const snakes = crackPaths(r, 5, w, h, 26, 0.45 * ppm, 0.5);
  const cracks = crackPaths(r, 10, w, h, 18, 0.25 * ppm, 0.6);
  const [tarM, thin] = rasterN(w, h, [(g) => { wrap9(g, w, h, (gg) => strokePaths(gg, snakes, 0.06 * ppm)); }, (g) => { wrap9(g, w, h, (gg) => strokePaths(gg, cracks, Math.max(1, 0.012 * ppm))); }]);
  const tar = blur(tarM, w, h, 1, 1);
  // patches and oil
  const patchShapes = [], oil = [];
  for (let i = 0; i < 3; i++) patchShapes.push([r() * w, r() * h, (0.8 + r() * 2.2) * ppm, (0.6 + r() * 1.6) * ppm, (r() - 0.5) * 0.2]);
  for (let i = 0; i < 9; i++) oil.push([r() * w, r() * h, (0.15 + r() * 0.5) * ppm, (0.1 + r() * 0.3) * ppm, r() * 3]);
  const [patch, oilR] = rasterN(w, h, [(g) => wrap9(g, w, h, (gg) => { for (const [x, y, pw, ph, a] of patchShapes) { gg.save(); gg.translate(x, y); gg.rotate(a); gg.fillRect(-pw / 2, -ph / 2, pw, ph); gg.restore(); } }),
    (g) => wrap9(g, w, h, (gg) => { const rr = rng(seed + 12); for (const [x, y, rx, ry, a] of oil) { gg.globalAlpha = 0.5 + rr() * 0.5; gg.beginPath(); gg.ellipse(x, y, rx, ry, a, 0, 7); gg.fill(); } })]);
  const patchE = blur(patch, w, h, 2, 1);
  const oilM = blur(oilR, w, h, 0.06 * ppm, 2);
  for (let i = 0; i < n; i++) {
    const m = mac[i], md = mid[i], gr = grit[i];
    const stone = ss(0.42, 0.2, st.f1[i]) * (st.id[i] > 0.2 ? 1 : 0);
    const pt = patch[i], edge = clamp01(patchE[i] * (1 - patchE[i]) * 4);
    let v = 0.27 + (m - 0.5) * 0.09 + (md - 0.5) * 0.06 + (gr - 0.5) * 0.05 + (wn[i] - 0.5) * 0.05;
    v += stone * (st.id[i] - 0.45) * 0.13 * (1 - pt * 0.6);
    v -= pt * 0.06;
    let hh = 0.5 + (md - 0.5) * 0.25 + stone * (0.25 + st.id[i] * 0.2) * (1 - pt * 0.5) + (gr - 0.5) * 0.18 + (wn[i] - 0.5) * 0.1 + pt * 0.08;
    let ro = 0.9 - stone * 0.14 + (m - 0.5) * 0.08 - pt * 0.05;
    // block-crack network where the mask allows (alligator cracking in worn zones)
    const e = crk.f2[i] - crk.f1[i] + (gr - 0.5) * 0.04;
    const cm = ss(0.66, 0.8, crkM[i]);
    const c = Math.max(cm * ss(0.035, 0.0, e), thin[i] * (1 - pt));
    v *= 1 - c * 0.8; hh -= c * 0.22; ro = mix(ro, 1, c);
    // sealant snakes: glossy, slightly raised, jet black
    const t = tar[i] * (1 - pt);
    v = mix(v, 0.07, t); ro = mix(ro, 0.32, t); hh += t * 0.12;
    // patch seams
    v -= edge * 0.04; hh -= edge * 0.15;
    // oil drips: darker and smoother
    const ol = oilM[i] * 0.9;
    v *= 1 - ol * 0.45; ro = mix(ro, 0.5, ol * 0.7);
    const warm = (m - 0.5) * 0.02;
    Rr[i] = v * (1.0 + warm); G[i] = v; B[i] = v * (1.02 - warm);
    H[i] = hh; Ro[i] = ro;
  }
}

export function asphaltSet(wet) {
  // Wetness and puddles are applied in world space by the shader (no tiling repeats),
  // so wet and dry maps share one texture.
  return cached('asphalt', () => {
    const W = R(1024), s = surf(W, W);
    asphaltLayer(s, 10, 10, 31);
    return bake(s, { normal: 2.4, tileM: 10, detail: 'stone', detM: 0.6, detStr: 0.4, ground: true, antitile: true, macro: 1, pud: 0.56, ao1: 2.5, ao2: 1 });
  });
}

export function roadSet(wet) {
  return cached('road', () => {
    const W = R(1024), Hh = R(2048), s = surf(W, Hh), mW = 14, mH = 24;
    asphaltLayer(s, mW, mH, 47);
    const { w, h, n, R: Rr, G, B, H, Ro } = s, ppm = w / mW;
    const wear = fbm(w, h, 6, 4, 61), wear2 = fbm(w, h, 28, 2, 62), wn = white(n, 63);
    const drip = fbm(w, h, 2, 3, 64, 0.5, 60);
    const r = rng(65);
    // trench patch running along the street (continuous, so it can't visibly repeat)
    const tx0 = 4.6 * ppm, tx1 = 5.5 * ppm;
    // a couple of transverse cracks
    const tc = raster(w, h, (g) => {
      for (let i = 0; i < 2; i++) {
        const y = r() * h; let x = 0, yy = y;
        g.lineWidth = Math.max(1, 0.015 * ppm); g.beginPath(); g.moveTo(x, yy);
        while (x < w) { x += 0.3 * ppm; yy += (r() - 0.5) * 0.2 * ppm; g.lineTo(x, yy); }
        g.stroke();
      }
    });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, xm = x / ppm; // meters across
      // trench patch
      const inT = x >= tx0 && x <= tx1 ? 1 : 0, tEdge = (Math.abs(x - tx0) < 2 || Math.abs(x - tx1) < 2) ? 1 : 0;
      if (inT) { Rr[i] *= 0.82; G[i] *= 0.82; B[i] *= 0.84; Ro[i] = Math.min(Ro[i], 0.86); H[i] += 0.05; }
      if (tEdge) { Rr[i] *= 0.6; G[i] *= 0.6; B[i] *= 0.6; H[i] -= 0.2; }
      // wheel paths: polished & darker; oil drip line between them
      let wp = 0;
      for (const c of [3.5, 10.5]) wp = Math.max(wp, ss(0.45, 0.15, Math.abs(Math.abs(xm - c) - 0.95)));
      const dl = Math.max(ss(0.5, 0.0, Math.abs(xm - 3.5)), ss(0.5, 0.0, Math.abs(xm - 10.5))) * ss(0.45, 0.75, drip[i]);
      const k = 1 - wp * 0.1 - dl * 0.35;
      Rr[i] *= k; G[i] *= k; B[i] *= k * 1.01;
      Ro[i] = Ro[i] - wp * 0.12 - dl * 0.25;
      // gutters: dirt, sand and debris along both edges
      const gut = Math.max(ss(0.7, 0.05, xm), ss(mW - 0.7, mW - 0.05, xm)) * (0.6 + wear[i] * 0.6);
      if (gut > 0) {
        const d = gut * 0.55;
        Rr[i] = mix(Rr[i], 0.27 + wn[i] * 0.1, d); G[i] = mix(G[i], 0.24 + wn[i] * 0.08, d); B[i] = mix(B[i], 0.2 + wn[i] * 0.06, d);
        Ro[i] = mix(Ro[i], 0.97, gut); H[i] += (wn[i] - 0.5) * gut * 0.4;
      }
      // transverse cracks
      const t = tc[i];
      if (t > 0) { Rr[i] *= 1 - t * 0.7; G[i] *= 1 - t * 0.7; B[i] *= 1 - t * 0.7; H[i] -= t * 0.5; Ro[i] = mix(Ro[i], 1, t); }
      // markings: double yellow centre line, faded white edge lines
      const cxm = mW / 2;
      let paintM = 0, py = 0;
      if (Math.abs(xm - (cxm - 0.15)) < 0.05 || Math.abs(xm - (cxm + 0.15)) < 0.05) { paintM = 1; py = 1; }
      if (Math.abs(xm - 0.55) < 0.06 || Math.abs(xm - (mW - 0.55)) < 0.06) { paintM = 1; py = 0; }
      if (paintM) {
        const life = ss(0.25, 0.55, wear[i] * 0.7 + wear2[i] * 0.5 + (wn[i] - 0.5) * 0.25) * (py ? 1 : 0.8) * (1 - wp * 0.5);
        if (life > 0) {
          const pc = py ? [0.86, 0.66, 0.18] : [0.84, 0.84, 0.8];
          Rr[i] = mix(Rr[i], pc[0] * (0.85 + wn[i] * 0.15), life); G[i] = mix(G[i], pc[1] * (0.85 + wn[i] * 0.15), life); B[i] = mix(B[i], pc[2] * (0.85 + wn[i] * 0.15), life);
          Ro[i] = mix(Ro[i], 0.62, life); H[i] += life * 0.12;
        }
      }
    }
    return bake(s, { normal: 2.4, tileM: 14, detail: 'stone', detM: 0.6, detStr: 0.4, ground: true, macro: 0.9, pud: 0.55 });
  });
}

export function sidewalkSet() {
  return cached('sidewalk', () => {
    const W = R(1024), s = surf(W, W), mW = 3;
    const { w, h, n, R: Rr, G, B, H, Ro } = s, ppm = w / mW;
    const mac = fbm(w, h, 3, 4, 71), mid = fbm(w, h, 12, 3, 72), grit = fbm(w, h, 60, 2, 73);
    const broom = fbm(w, h, 3, 3, 74, 0.5, 220);
    const pores = worley(w, h, 150, 75, 1), wn = white(n, 76);
    const r = rng(77), slab = 1.5 * ppm;
    // stains and gum
    const rx0 = r() * w * 0.8 + 20, ry0 = r() * h * 0.8 + 20;
    const [gum, stainR, rustR] = rasterN(w, h, [
      (g) => wrap9(g, w, h, (gg) => { const rr = rng(78); for (let i = 0; i < 140; i++) { gg.globalAlpha = 0.5 + rr() * 0.5; gg.beginPath(); gg.arc(rr() * w, rr() * h, (0.006 + rr() * 0.014) * ppm, 0, 7); gg.fill(); } }),
      (g) => wrap9(g, w, h, (gg) => { const rr = rng(79); for (let i = 0; i < 10; i++) { gg.globalAlpha = 0.25 + rr() * 0.5; gg.beginPath(); gg.ellipse(rr() * w, rr() * h, (0.08 + rr() * 0.3) * ppm, (0.05 + rr() * 0.2) * ppm, rr() * 3, 0, 7); gg.fill(); } }),
      (g) => { g.globalAlpha = 0.7; g.beginPath(); g.ellipse(rx0, ry0, 0.12 * ppm, 0.3 * ppm, 0.3, 0, 7); g.fill(); },
    ]);
    const stain = blur(stainR, w, h, 0.04 * ppm, 2), rust = blur(rustR, w, h, 0.05 * ppm, 2);
    // cracks inside a couple of slabs
    const crack = raster(w, h, (g) => {
      for (let i = 0; i < 2; i++) {
        const sx = Math.floor(r() * 2) * slab, sy = Math.floor(r() * 2) * slab;
        g.save(); g.beginPath(); g.rect(sx + 3, sy + 3, slab - 6, slab - 6); g.clip();
        strokePaths(g, crackPaths(rng(90 + i), 1, slab, slab, 14, 0.12 * ppm, 0.7).map((p) => p.map(([x, y]) => [x + sx, y + sy])), Math.max(1, 0.006 * ppm));
        g.restore();
      }
    });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const jx = Math.min(x % slab, slab - (x % slab)), jy = Math.min(y % slab, slab - (y % slab));
      const jd = Math.min(jx, jy); // px to nearest joint
      const sid = hash2(Math.floor(x / slab), Math.floor(y / slab), 7);
      const groove = ss(0.009 * ppm, 0.003 * ppm, jd);
      const bevel = ss(0.004 * ppm, 0.02 * ppm, jd);
      const grime = ss(0.06 * ppm, 0.0, jd) * (0.5 + mac[i] * 0.5);
      // slab tilt adds a subtle per-slab shading shift
      const tilt = ((x % slab) / slab - 0.5) * (sid - 0.5) * 0.12 + ((y % slab) / slab - 0.5) * (hash2(Math.floor(x / slab), Math.floor(y / slab), 9) - 0.5) * 0.12;
      const pit = ss(0.16, 0.06, pores.f1[i]) * (pores.id[i] > 0.55 ? 1 : 0);
      let v = 0.56 + (sid - 0.5) * 0.06 + (mac[i] - 0.5) * 0.12 + (mid[i] - 0.5) * 0.06 + (grit[i] - 0.5) * 0.05 + (broom[i] - 0.5) * 0.04 + (wn[i] - 0.5) * 0.05;
      v -= pit * 0.12 + grime * 0.12 + stain[i] * 0.18 + gum[i] * 0.3 + crack[i] * 0.3;
      v -= groove * 0.3;
      Rr[i] = v * 1.01 - rust[i] * 0.02; G[i] = v * 0.995 - rust[i] * 0.09; B[i] = v * 0.97 - rust[i] * 0.16;
      H[i] = 0.6 + (bevel - 1) * 0.45 - groove * 0.25 + (broom[i] - 0.5) * 0.14 + (grit[i] - 0.5) * 0.12 + (wn[i] - 0.5) * 0.08 - pit * 0.25 + gum[i] * 0.12 - crack[i] * 0.4 + tilt;
      Ro[i] = 0.86 + (mid[i] - 0.5) * 0.1 - gum[i] * 0.25 - stain[i] * 0.15 + grime * 0.06;
    }
    return bake(s, { normal: 2.6, tileM: 3, detail: 'stone', detM: 0.5, detStr: 0.35, ground: true, macro: 0.8, pud: 0.68 });
  });
}

// Concrete: one structure per kind, recoloured per colour.
const VERT = new Set(['cwall', 'jersey', 'trim', 'cope', 'curb', '', 'stucco']);
function concreteStructure(kind) {
  return cached('cstruct' + kind, () => {
    const W = R(['roof', 'trim', 'cope', 'curb', 'ceil', 'stucco'].includes(kind) ? 512 : 1024), s = surf(W, W);
    const { w, h, n, H, Ro } = s;
    const seed = 101 + kind.length * 17;
    const mac = fbm(w, h, 3, 5, seed), mid = fbm(w, h, 10, 3, seed + 1), fine = fbm(w, h, 48, 2, seed + 2);
    const pores = worley(w, h, kind === 'stucco' ? 260 : 140, seed + 3, 1), wn = white(n, seed + 4);
    const streak = fbm(w, h, 40, 2, seed + 5, 0.35, 1);
    const eff = fbm(w, h, 4, 4, seed + 6);
    const val = new Float32Array(n), tint = new Float32Array(n);
    const vertical = VERT.has(kind);
    const r = rng(seed + 7);
    // form-work joints & tie holes on cast walls; saw cuts on floors
    let linesD = null;
    if (kind === 'cwall' || kind === 'ceil') linesD = ((g) => { g.lineWidth = 2 * SC; for (const y of [0, h / 3, (2 * h) / 3]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke(); g.moveTo(0, 0); g.lineTo(0, h); g.stroke(); for (let yy = h / 6; yy < h; yy += h / 3) for (let xx = w / 8; xx < w; xx += w / 4) { g.beginPath(); g.arc(xx, yy, 5 * SC, 0, 7); g.fill(); } });
    if (kind === 'floor') linesD = ((g) => { g.lineWidth = 3 * SC; for (const v of [0, w / 2]) { g.beginPath(); g.moveTo(v, 0); g.lineTo(v, h); g.stroke(); g.beginPath(); g.moveTo(0, v); g.lineTo(w, v); g.stroke(); } });
    if (kind === 'jersey') linesD = ((g) => { g.lineWidth = 2 * SC; for (const y of [h * 0.18, h * 0.62]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } });
    const cracksD = (g) => wrap9(g, w, h, (gg) => { gg.globalAlpha = kind === 'stucco' ? 0.55 : 1; strokePaths(gg, crackPaths(rng(seed + 8), kind === 'stucco' ? 2 : 3, w, h, 16, 14 * SC * (w / 1024), 0.6), Math.max(1, 1.1 * SC)); });
    const swirl = kind === 'floor' ? fbm(w, h, 8, 3, seed + 9, 0.5, undefined, true) : null;
    const scuffD = kind === 'jersey' || kind === 'floor' ? ((g) => { const rr = rng(seed + 10); for (let i = 0; i < 30; i++) { g.globalAlpha = 0.15 + rr() * 0.4; g.lineWidth = (2 + rr() * 8) * SC; const x = rr() * w, y = kind === 'jersey' ? h * (0.75 + rr() * 0.22) : rr() * h; wrap9(g, w, h, (gg) => { gg.beginPath(); gg.moveTo(x, y); gg.quadraticCurveTo(x + 40 * SC, y + (rr() - 0.5) * 20 * SC, x + (60 + rr() * 160) * SC, y + (rr() - 0.5) * 30 * SC); gg.stroke(); }); } }) : null;
    const [lines, cracks, scuff] = rasterN(w, h, [linesD, cracksD, scuffD]);
    for (let i = 0; i < n; i++) {
      const pit = ss(0.2, 0.07, pores.f1[i]) * (pores.id[i] > 0.5 ? 1 : 0);
      let v = 1 + (mac[i] - 0.5) * 0.24 + (mid[i] - 0.5) * 0.12 + (fine[i] - 0.5) * 0.08 + (wn[i] - 0.5) * 0.06;
      v -= pit * 0.25;
      if (vertical) v -= ss(0.55, 0.85, streak[i]) * 0.16 * (0.4 + mac[i]);
      const ef = ss(0.72, 0.9, eff[i]) * (kind === 'stucco' ? 0 : 1);
      v += ef * 0.18;
      const L = lines ? lines[i] : 0;
      v -= L * 0.25 + cracks[i] * 0.35;
      if (scuff) v -= scuff[i] * 0.45;
      if (kind === 'jersey' || kind === 'curb') { const yy = ((i / w) | 0) / h; v -= ss(0.55, 1.0, yy) * 0.22 * (0.6 + mac[i] * 0.8); }
      val[i] = v;
      tint[i] = (mac[i] - 0.5) * 0.06 + ef * 0.05;
      H[i] = 0.5 + (mid[i] - 0.5) * 0.2 + (fine[i] - 0.5) * 0.25 + (wn[i] - 0.5) * (kind === 'stucco' ? 0.3 : 0.1) - pit * 0.45 - L * 0.5 - cracks[i] * 0.4 + (swirl ? (swirl[i] - 0.5) * 0.08 : 0)
        + (kind === 'stucco' ? ss(0.25, 0.05, pores.f1[i]) * 0.35 : 0);
      Ro[i] = (kind === 'floor' ? 0.62 : kind === 'jersey' ? 0.78 : 0.9) + (mac[i] - 0.5) * 0.12 + (fine[i] - 0.5) * 0.06 + pit * 0.05 - (scuff ? scuff[i] * 0.2 : 0) - (swirl ? (swirl[i] - 0.5) * 0.12 : 0);
    }
    const set = bake(s, { normal: kind === 'stucco' ? 3 : 2.4, tileM: 4, detail: kind === 'stucco' ? 'plaster' : 'stone', detM: 0.5, detStr: 0.4, ground: kind === 'floor', antitile: kind === '' || kind === 'roof', macro: 0.9, pud: 0.62 });
    set.val = val; set.tint = tint; set.w = w; set.h = h;
    return set;
  });
}

export function concreteSet(color = '#8c8984', key = '') {
  return cached('concrete' + color + key, () => {
    const st = concreteStructure(key);
    const s = surf(st.w, st.h), c = rgb(color);
    for (let i = 0; i < s.n; i++) {
      const v = st.val[i], t = st.tint[i];
      s.R[i] = c[0] * v * (1 + t); s.G[i] = c[1] * v; s.B[i] = c[2] * v * (1 - t);
    }
    return recolor(st, s);
  });
}

// Brick: 19 bricks across x 60 courses per 4 m tile (real 21 x 6.7 cm pitch),
// running bond with a header course every 6th row, chipped arrises and recessed mortar.
function brickStructure() {
  return cached('bstruct', () => {
    const W = R(1024), s = surf(W, W);
    const { w, h, n, H, Ro } = s;
    const nx = 19, ny = 60, bw = w / nx, bh = h / ny, mort = 0.011 / 0.21 * bw;
    const chip = fbm(w, h, 64, 2, 201), face = fbm(w, h, 40, 3, 202), wn = white(n, 203), mac = fbm(w, h, 3, 4, 204);
    const sand = worley(w, h, 300, 205, 1);
    const bid = new Float32Array(n), inB = new Float32Array(n), edge = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      const row = Math.floor(y / bh), header = row % 6 === 5;
      const cw = header ? bw / 2 : bw, off = header ? bw / 4 : (row % 2 ? bw / 2 : 0);
      const ly = y - row * bh, dy = Math.min(ly, bh - ly);
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const xx = ((x - off) % w + w) % w, col = Math.floor(xx / cw), lx = xx - col * cw, dx = Math.min(lx, cw - lx);
        const id = hash2(col + (header ? 1000 : 0), row, 211);
        const d = Math.min(dx, dy) - mort / 2 - (chip[i] - 0.5) * mort * 1.4 - (id > 0.85 ? (wn[i] - 0.5) * mort * 0.5 : 0);
        const b = ss(-0.5, 0.6, d);
        const bev = ss(0, mort * 1.6, d);
        bid[i] = id; inB[i] = b; edge[i] = 1 - bev;
        const mortarH = 0.18 + ss(0.3, 0.05, sand.f1[i]) * 0.08 + (wn[i] - 0.5) * 0.06;
        const brickH = 0.62 + bev * 0.12 + (face[i] - 0.5) * 0.12 + (id - 0.5) * 0.05 + (wn[i] - 0.5) * 0.05;
        H[i] = mix(mortarH, brickH, b);
        Ro[i] = mix(0.95, 0.8 + (face[i] - 0.5) * 0.15 + (mac[i] - 0.5) * 0.08, b);
      }
    }
    const set = bake(s, { normal: 3.2, tileM: 4, detail: 'stone', detM: 0.45, detStr: 0.35, ao1: 3, ao2: 1.2, macro: 0.55 });
    Object.assign(set, { bid, inB, edge, face, mac, wn, w, h });
    return set;
  });
}

export function brickSet(color = '#8a3b2a') {
  return cached('brick' + color, () => {
    const st = brickStructure();
    const s = surf(st.w, st.h), base = rgb(color);
    const { bid, inB, edge, face, mac, wn } = st;
    const soot = fbm(st.w, st.h, 4, 4, 221), eff = fbm(st.w, st.h, 6, 4, 222);
    const pal = new Map();
    const brickCol = (id) => {
      let c = pal.get(id);
      if (!c) {
        const r = rng(Math.floor(id * 1e6) + 3);
        c = jitterColor(base, r, 0.025, 0.14, 0.12);
        const k = r();
        if (k < 0.07) c = c.map((v) => v * 0.55); // clinker
        else if (k < 0.12) c = [c[0] * 1.08 + 0.05, c[1] * 1.1 + 0.05, c[2] * 1.1 + 0.03]; // pale
        pal.set(id, c);
      }
      return c;
    };
    const mortar = [0.6, 0.58, 0.54];
    for (let i = 0; i < s.n; i++) {
      const c = brickCol(bid[i]), b = inB[i];
      const fv = 1 + (face[i] - 0.5) * 0.18 + (wn[i] - 0.5) * 0.08 - edge[i] * 0.08;
      const mv = 0.9 + (wn[i] - 0.5) * 0.2 + (mac[i] - 0.5) * 0.1;
      let r = mix(mortar[0] * mv, c[0] * fv, b), g = mix(mortar[1] * mv, c[1] * fv, b), bl = mix(mortar[2] * mv, c[2] * fv, b);
      const so = ss(0.45, 0.95, soot[i]) * 0.18, ef = ss(0.78, 0.95, eff[i]) * 0.15;
      r = r * (1 - so) + ef * 0.6; g = g * (1 - so) + ef * 0.6; bl = bl * (1 - so) + ef * 0.58;
      s.R[i] = r; s.G[i] = g; s.B[i] = bl;
    }
    return recolor(st, s);
  });
}

// Metals. ORM.B carries true metalness: bare/galvanised steel = 1, paint and rust = 0.
// Structure (height, roughness, metalness, wear masks) is shared per kind; colour is a cheap recolour.
function metalStructure(kind, galv) {
  return cached('mstruct' + kind + galv, () => {
    const big = kind === 'corrugated';
    const W = R(big ? 1024 : 512), s = surf(W, W);
    const { w, h, n, H, Ro } = s;
    s.Me = new Float32Array(n);
    const seed = 300 + kind.length * 13 + (galv ? 5 : 0);
    const mac = fbm(w, h, 3, 4, seed), mid = fbm(w, h, 12, 3, seed + 1), fine = fbm(w, h, 60, 2, seed + 2), wn = white(n, seed + 3);
    const rustN = fbm(w, h, 14, 4, seed + 4), rustF = fbm(w, h, 40, 3, seed + 5);
    const streak = fbm(w, h, 48, 2, seed + 6, 0.35, 1);
    const spang = galv ? worley(w, h, 28, seed + 7, 1) : null;
    const scratches = raster(w, h, (g) => { const r = rng(seed + 8); for (let i = 0; i < (kind === 'gun' ? 40 : 90); i++) { const x = r() * w, y = r() * h, a = r() * 6.283, l = (8 + r() * 50) * SC * (W / 512); g.lineWidth = (0.6 + r()) * SC; g.globalAlpha = 0.3 + r() * 0.7; wrap9(g, w, h, (gg) => { gg.beginPath(); gg.moveTo(x, y); gg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); gg.stroke(); }); } });
    const edgeWear = kind === 'painted' || kind === 'dump' || kind === 'wreck';
    const wearAmt = kind === 'gun' ? 0 : kind === 'dump' || kind === 'wreck' ? 1 : galv ? 0.3 : 0.65;
    // per-pixel recolour inputs
    const K = new Float32Array(n), RA = new Float32Array(n), RV = new Float32Array(n), CA = new Float32Array(n), BARE = new Uint8Array(n), SA = new Float32Array(n), FA = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let ch = 0;
      if (big && galv) ch = Math.sin((x / w) * 40 * 6.2831853); // 76 mm sinusoidal roofing sheet
      else if (big) { const f = ((x / w) * 12) % 1; ch = ss(0.08, 0.2, f) - ss(0.55, 0.67, f); ch = ch * 2 - 0.6; } // container trapezoid
      const ed = edgeWear ? Math.min(x, w - 1 - x, y, h - 1 - y) / w : 1;
      const edgeM = edgeWear ? ss(0.06, 0.0, ed + (fine[i] - 0.5) * 0.05) : 0;
      // rust concentrates at sheet edges, the bottom splash zone and bleeds down from seams;
      // open faces only get the odd small blister
      const bottom = ss(0.8, 1.0, y / h) * (big ? 1 : 0.6);
      const rust = ss(0.9, 0.97, rustN[i] + (rustF[i] - 0.5) * 0.12 + bottom * 0.65 + edgeM * 0.65) * wearAmt;
      const runSrc = big ? ss(0.4, 0.0, y / h) : edgeM * 0.5 + ss(0.5, 0.0, y / h) * 0.5;
      const run = ss(0.55, 0.85, streak[i]) * Math.min(1, runSrc * 0.9 + ss(0.7, 0.85, rustN[i]) * 0.5) * wearAmt * 0.75;
      const chip = ss(big ? 0.8 : 0.72, big ? 0.86 : 0.8, mid[i] * 0.6 + fine[i] * 0.5 + edgeM * 0.5 + bottom * 0.25) * wearAmt * (galv ? 0 : 1);
      const sc = scratches[i] * (kind === 'gun' ? 0.5 : 1);
      let ro, me, k;
      if (galv) {
        const sp = spang.id[i];
        const wr = ss(0.45, 0.95, mac[i] * 0.7 + mid[i] * 0.4);
        k = 0.8 + (sp - 0.5) * 0.08 + (mac[i] - 0.5) * 0.08 + (wn[i] - 0.5) * 0.03 - ss(0.55, 0.85, streak[i]) * 0.1;
        FA[i] = wr * 0.14 + ss(0.6, 0.9, streak[i]) * 0.12;
        ro = 0.5 + (sp - 0.5) * 0.12 + wr * 0.3 + (mac[i] - 0.5) * 0.1; me = 1 - wr * 0.6;
      } else {
        k = 1 + (mac[i] - 0.5) * 0.12 + (mid[i] - 0.5) * 0.05 + (wn[i] - 0.5) * 0.03;
        ro = (kind === 'gun' ? 0.42 : 0.55) + (mac[i] - 0.5) * 0.15 + (fine[i] - 0.5) * 0.08; me = kind === 'gun' ? 0.9 : 0;
        const fade = ss(0.5, 0.9, mac[i]) * 0.15 * wearAmt;
        FA[i] = fade; ro += fade * 0.3;
        if (chip > 0) { const bare = wn[i] > 0.5 ? 1 : 0; BARE[i] = bare; me = mix(me, bare, chip); ro = mix(ro, bare ? 0.35 : 0.8, chip); }
        if (sc > 0 && kind !== 'gun') { me = mix(me, 1, sc * 0.6); ro = mix(ro, 0.3, sc * 0.5); }
      }
      const ra = Math.max(rust, run * 0.7);
      if (ra > 0) { ro = mix(ro, 0.92, ra); me = mix(me, 0, ra); }
      K[i] = k; RA[i] = ra; RV[i] = 0.75 + rustF[i] * 0.35 + (wn[i] - 0.5) * 0.2; CA[i] = chip; SA[i] = kind === 'gun' || galv ? 0 : sc;
      Ro[i] = ro; s.Me[i] = me;
      H[i] = 0.5 + ch * (big ? 0.9 : 0) + (mid[i] - 0.5) * 0.06 + (fine[i] - 0.5) * 0.05 + rust * (rustF[i] - 0.3) * 0.25 - chip * 0.08 - sc * 0.06 + (wn[i] - 0.5) * 0.02;
    }
    const set = bake(s, { normal: big ? (galv ? 10 : 5) : kind === 'gun' ? 0.8 : 2, tileM: big ? 3 : 1.5, detail: 'metal', detM: 0.4, detStr: 0.3, macro: 0.6, ao1: big ? 0.3 : 2, ao2: big ? 0.2 : 1 });
    Object.assign(set, { K, RA, RV, CA, BARE, SA, FA, galv, w, h });
    return set;
  });
}

// Metals. ORM.B carries true metalness: bare/galvanised steel = 1, paint and rust = 0.
export function metalSet(color = '#6b7077', kind = 'painted') {
  return cached('metal' + color + kind, () => {
    const base = rgb(color), [, sat] = rgb2hsl(base);
    const galv = kind === 'corrugated' && sat < 0.12; // neutral grey corrugated = galvanised sheet
    const st = metalStructure(kind, galv);
    const s = surf(st.w, st.h);
    const { K, RA, RV, CA, BARE, SA, FA } = st;
    for (let i = 0; i < s.n; i++) {
      let r = base[0] * K[i], g = base[1] * K[i], b = base[2] * K[i] * (galv ? 1.01 : 1);
      const fa = FA[i];
      if (galv) { r = mix(r, 0.62, fa); g = mix(g, 0.62, fa); b = mix(b, 0.6, fa); }
      else {
        r = mix(r, 0.7, fa); g = mix(g, 0.7, fa); b = mix(b, 0.7, fa);
        const c = CA[i];
        if (c > 0) { const bare = BARE[i]; r = mix(r, bare ? 0.55 : 0.45, c); g = mix(g, bare ? 0.55 : 0.42, c); b = mix(b, bare ? 0.56 : 0.38, c); }
        const sc = SA[i];
        if (sc > 0) { r = mix(r, 0.6, sc * 0.6); g = mix(g, 0.6, sc * 0.6); b = mix(b, 0.62, sc * 0.6); }
      }
      const ra = RA[i];
      if (ra > 0) { const rv = RV[i]; r = mix(r, 0.33 * rv, ra); g = mix(g, 0.16 * rv, ra); b = mix(b, 0.075 * rv, ra); }
      s.R[i] = r; s.G[i] = g; s.B[i] = b;
    }
    return recolor(st, s);
  });
}

const WOOD_KIND = {
  crate: { plank: 6, weather: 0.3, edges: true, stencil: true }, pallet: { plank: 5, weather: 0.55, edges: true }, tank: { plank: 10, weather: 0.8, vertical: true },
  bark: { bark: true }, bench: { plank: 4, weather: 0.3 }, pole: { creosote: true, vertical: true }, tie: { creosote: true },
  board: { ply: true, weather: 0.35 }, gunwood: { plank: 1, weather: 0, fine: true },
};
export function woodSet(color = '#7a4a26', key = 'wood') {
  return cached(key + color, () => {
    const W = R(512), s = surf(W, W);
    const { w, h, n, R: Rr, G, B, H, Ro } = s;
    const K = WOOD_KIND[key] || { plank: 4, weather: 0.2 };
    const base = rgb(color), seed = 400 + key.length * 7;
    const warp = fbm(w, h, 2, 4, seed, 0.5, 24), warp2 = fbm(w, h, 8, 3, seed + 1), wn = white(n, seed + 2), mac = fbm(w, h, 3, 4, seed + 3);
    const r = rng(seed + 4);
    if (K.bark) {
      const ridges = fbm(w, h, 10, 4, seed + 5, 0.55, 2, true), plates = worley(w, h, 10, seed + 6, 1, 4);
      for (let i = 0; i < n; i++) {
        const v = ridges[i] * 0.6 + ss(0.0, 0.25, plates.f2[i] - plates.f1[i]) * 0.4;
        const k = 0.45 + v * 0.75 + (wn[i] - 0.5) * 0.1;
        const moss = ss(0.65, 0.85, mac[i]) * 0.3;
        Rr[i] = base[0] * k * (1 - moss) + moss * 0.18; G[i] = base[1] * k * (1 - moss) + moss * 0.24; B[i] = base[2] * k * (1 - moss) + moss * 0.08;
        H[i] = v + (wn[i] - 0.5) * 0.1; Ro[i] = 0.95;
      }
      return bake(s, { normal: 6, tileM: 1, detail: 'wood', detM: 0.3, detStr: 0.2, ao1: 3, ao2: 1.5 });
    }
    // knots
    const knots = []; for (let i = 0; i < 5; i++) knots.push([r() * w, r() * h, (6 + r() * 10) * SC]);
    const planks = K.plank || 1, ph = h / planks;
    // stencilled shipping marks (faded spray paint)
    const sten = K.stencil ? raster(w, h, (g) => {
      g.globalAlpha = 0.85; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `900 ${Math.round(w * 0.075)}px Arial, sans-serif`;
      g.fillText(['THIS SIDE UP', 'HANDLE WITH CARE', 'ATL FREIGHT', 'FRAGILE'][Math.floor(r() * 4)], w / 2, h * 0.32);
      g.font = `700 ${Math.round(w * 0.05)}px Arial, sans-serif`;
      g.fillText('LOT ' + (100 + Math.floor(r() * 900)) + ' - ' + (10 + Math.floor(r() * 80)) + ' KG', w / 2, h * 0.68);
    }) : null;
    const stenN = K.stencil ? fbm(w, h, 24, 2, seed + 9) : null;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const pl = Math.floor(y / ph), pid = hash2(pl, 0, seed), ly = y - pl * ph;
      let gy = y + warp[i] * 30 * SC + pid * 100;
      // knot distortion
      let kd = 0;
      for (const [kx, ky, kr] of knots) {
        let dx = x - kx, dy = y - ky; dx -= Math.round(dx / w) * w; dy -= Math.round(dy / h) * h;
        const d = Math.sqrt(dx * dx * 0.25 + dy * dy);
        if (d < kr * 4) { gy += (dy > 0 ? 1 : -1) * Math.max(0, kr * 4 - d) * 0.6; kd = Math.max(kd, ss(kr, kr * 0.3, d)); }
      }
      const ringF = K.creosote ? 30 : K.fine ? 90 : 55;
      const ring = Math.sin((gy / h) * ringF * 6.2831853 + warp2[i] * 3) * 0.5 + 0.5;
      const late = Math.pow(ring, 3);
      const gap = planks > 1 ? ss(2.5 * SC, 0.5 * SC, Math.min(ly, ph - ly)) : 0;
      const pk = 1 + (pid - 0.5) * 0.18;
      let k = pk * (1 - late * 0.28) * (1 + (mac[i] - 0.5) * 0.15 + (wn[i] - 0.5) * 0.06) * (1 - kd * 0.5);
      let c = [base[0] * k, base[1] * k, base[2] * k];
      if (K.ply) {
        // plywood: wide flat grain, a couple of veneer patches, spray stencil smudge
        c = [base[0] * (1 + (warp2[i] - 0.5) * 0.25), base[1] * (1 + (warp2[i] - 0.5) * 0.25), base[2] * (1 + (warp2[i] - 0.5) * 0.2)];
      }
      if (K.creosote) { const kk = 0.6 + ring * 0.25 + (mac[i] - 0.5) * 0.3; c = [base[0] * kk, base[1] * kk, base[2] * kk]; }
      // weathering to silver-grey
      const wt = (K.weather || 0) * ss(0.3, 0.8, mac[i] * 0.8 + ring * 0.3);
      const gry = (c[0] + c[1] + c[2]) / 3 * 0.9 + 0.12;
      c = [mix(c[0], gry, wt), mix(c[1], gry, wt), mix(c[2], gry * 1.02, wt)];
      const split = K.creosote ? ss(0.02, 0.0, Math.abs(warp2[i] - 0.5) - 0.01) * ss(0.4, 0.6, mac[i]) : 0;
      c = c.map((v) => v * (1 - gap * 0.75) * (1 - split * 0.7));
      if (K.edges) {
        // handling grime toward the box edges (texture borders map to box edges)
        const ed = Math.min(x, w - 1 - x, y, h - 1 - y) / w;
        const eg = ss(0.12, 0.0, ed + (mac[i] - 0.5) * 0.06) * 0.45 + ss(0.6, 0.95, mac[i]) * 0.2;
        c = c.map((v) => v * (1 - eg));
      }
      if (sten) {
        const a = sten[i] * ss(0.25, 0.55, stenN[i] + (wn[i] - 0.5) * 0.3) * 0.8;
        c = [mix(c[0], 0.05, a), mix(c[1], 0.05, a), mix(c[2], 0.06, a)];
      }
      Rr[i] = c[0]; G[i] = c[1]; B[i] = c[2];
      H[i] = 0.55 + late * (K.fine ? 0.05 : 0.18) * (1 + wt) - gap * 0.6 - split * 0.5 + (wn[i] - 0.5) * 0.05 + kd * 0.1;
      Ro[i] = (K.fine ? 0.38 : K.creosote ? 0.8 : 0.72) + late * 0.08 + wt * 0.18 + gap * 0.2 + (mac[i] - 0.5) * 0.08;
    }
    return bake(s, { normal: K.fine ? 1.2 : 3, tileM: 1.5, detail: 'wood', detM: 0.35, detStr: 0.3, ao1: 2.5, ao2: 1 });
  });
}

export function fabricSet(color, kind = 'cotton') {
  return cached('fabric' + color + kind, () => {
    const W = R(256), s = surf(W, W);
    const { w, h, n, R: Rr, G, B, H, Ro } = s;
    const base = rgb(color), wn = white(n, 501), mac = fbm(w, h, 2, 4, 502), fz = fbm(w, h, 24, 2, 503);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let k, hh;
      if (kind === 'denim') {
        // 3/1 twill: diagonal wales, white weft peeking through, fading on high spots
        const tw = ((x + y * 3) % 8) / 8, wale = Math.sin(tw * 6.283) * 0.5 + 0.5;
        const weft = (y % 2 === 0 && (x + y) % 4 === 0) ? 1 : 0;
        const fade = ss(0.45, 0.85, mac[i]) * 0.35;
        k = 0.85 + wale * 0.25 + (wn[i] - 0.5) * 0.12;
        Rr[i] = mix(base[0] * k, 0.75, weft * 0.35 + fade); G[i] = mix(base[1] * k, 0.78, weft * 0.35 + fade); B[i] = mix(base[2] * k, 0.85, weft * 0.3 + fade * 0.8);
        hh = wale * 0.6 + (wn[i] - 0.5) * 0.2;
      } else {
        // jersey knit: tiny V loops in columns
        const cx2 = (x % 4) / 4, cy2 = (y % 6) / 6;
        const loop = Math.max(0, 1 - Math.abs(cx2 - 0.5 - (cy2 - 0.5) * 0.4 * (Math.floor(x / 4) % 2 ? 1 : -1)) * 3);
        k = 0.88 + loop * 0.18 + (fz[i] - 0.5) * 0.12 + (wn[i] - 0.5) * 0.08 + (mac[i] - 0.5) * 0.08;
        Rr[i] = base[0] * k; G[i] = base[1] * k; B[i] = base[2] * k;
        hh = loop * 0.6 + (fz[i] - 0.5) * 0.3 + (wn[i] - 0.5) * 0.15;
      }
      H[i] = hh; Ro[i] = 0.92 + (wn[i] - 0.5) * 0.05;
    }
    return bake(s, { normal: 1.6, tileM: 0.5, ao1: 1.5, ao2: 0.5 });
  });
}

// Floor tiles (size = old 512-texture px per tile → tile count across a 4 m texture).
export function tileSet(color = '#bdb7aa', size = 32) {
  return cached('tile' + color + size, () => {
    const W = R(1024), s = surf(W, W);
    const { w, h, n, R: Rr, G, B, H, Ro } = s;
    const cnt = Math.max(2, Math.round(512 / size)), tp = w / cnt, grout = tp * 0.035;
    const base = rgb(color), wn = white(n, 601), mac = fbm(w, h, 3, 4, 602), mid = fbm(w, h, 14, 3, 603), fine = fbm(w, h, 80, 2, 604);
    const [scuff, gum, crack] = rasterN(w, h, [(g) => { const r = rng(605); for (let i = 0; i < 60; i++) { g.globalAlpha = 0.2 + r() * 0.5; g.lineWidth = (1.5 + r() * 4) * SC; const x = r() * w, y = r() * h, a = r() * 6.28, l = (20 + r() * 70) * SC; wrap9(g, w, h, (gg) => { gg.beginPath(); gg.moveTo(x, y); gg.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 10, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); gg.stroke(); }); } },
      (g) => wrap9(g, w, h, (gg) => { const r = rng(606); for (let i = 0; i < 160; i++) { gg.globalAlpha = 0.5 + r() * 0.5; gg.beginPath(); gg.arc(r() * w, r() * h, (1.5 + r() * 3.5) * SC, 0, 7); gg.fill(); } }),
      (g) => strokePaths(g, crackPaths(rng(607), 4, w, h, 10, 10 * SC, 0.4), Math.max(1, SC))]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const tx = Math.floor(x / tp), ty = Math.floor(y / tp), lx = x - tx * tp, ly = y - ty * tp;
      const d = Math.min(lx, tp - lx, ly, tp - ly);
      const tid = hash2(tx, ty, 611);
      const chip = (tid > 0.9 && d < grout * 3 && wn[i] > 0.4) ? ss(grout * 3, grout, d) : 0;
      const inT = ss(grout * 0.5, grout * 1.2, d) * (1 - chip);
      const bev = ss(grout, grout * 3, d);
      const tk = (1 + (tid - 0.5) * 0.12 + (mid[i] - 0.5) * 0.08 + (fine[i] - 0.5) * 0.05 + (wn[i] - 0.5) * 0.04) * (hash2(tx, ty, 612) > 0.94 ? 0.86 : 1);
      const dirt = mac[i] * 0.14 + ss(grout * 6, grout, d) * 0.14 + 0.1;
      const gv = 0.24 + (mac[i] - 0.5) * 0.1 + (wn[i] - 0.5) * 0.06;
      let r = mix(gv, base[0] * tk, inT), g = mix(gv * 0.96, base[1] * tk * 0.99, inT), b = mix(gv * 0.9, base[2] * tk * 0.96, inT);
      const k = (1 - dirt - scuff[i] * 0.3 * inT - gum[i] * 0.6 - crack[i] * 0.35 * inT) * 0.82;
      Rr[i] = r * k; G[i] = g * k; B[i] = b * k * 0.99;
      H[i] = mix(0.15, 0.6 + bev * 0.12 + (fine[i] - 0.5) * 0.04 + (tid - 0.5) * 0.04, inT) + gum[i] * 0.1 - crack[i] * 0.3;
      Ro[i] = mix(0.92, 0.36 + (tid - 0.5) * 0.08 + dirt * 0.7 + scuff[i] * 0.2 + (mid[i] - 0.5) * 0.12, inT);
    }
    return bake(s, { normal: 2.2, tileM: 4, detail: 'stone', detM: 0.5, detStr: 0.15, ground: true, macro: 0.4, ao1: 3, ao2: 1 });
  });
}

// Glazed subway tile: 32 x 64 tiles per 5 m texture, red band at 60-66% height.
export function wallTileSet(color = '#d9c38a') {
  return cached('walltile' + color, () => {
    const W = R(1024), s = surf(W, W);
    const { w, h, n, R: Rr, G, B, H, Ro } = s;
    const nx = 16, ny = 40, tw = w / nx, th = h / ny, grout = tw * 0.035;
    const base = rgb(color), band = rgb('#a8322a'), wn = white(n, 701), mac = fbm(w, h, 3, 4, 702), streak = fbm(w, h, 32, 2, 703, 0.35, 1), mid = fbm(w, h, 12, 3, 704);
    for (let y = 0; y < h; y++) {
      const row = Math.floor(y / th), ly = y - row * th, off = row % 2 ? tw / 2 : 0;
      const isBand = row >= Math.floor(ny * 0.6) && row < Math.floor(ny * 0.6) + 2;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const xx = (x + off) % w, col = Math.floor(xx / tw), lx = xx - col * tw;
        const d = Math.min(lx, tw - lx, ly, th - ly);
        const tid = hash2(col, row, 711);
        const missing = tid > 0.993 && !isBand;
        const inT = ss(grout * 0.4, grout * 1.1, d) * (missing ? 0 : 1);
        const dome = ss(grout * 0.8, grout * 3.5, d);
        const c = isBand ? band : base;
        const tk = 1 + (tid - 0.5) * 0.07 + (wn[i] - 0.5) * 0.02;
        const grime = ss(0.62, 0.92, streak[i]) * 0.1 + ss(0.5, 0.95, mac[i]) * 0.12;
        const gv = missing ? 0.35 + (wn[i] - 0.5) * 0.15 : 0.5 + (wn[i] - 0.5) * 0.08;
        Rr[i] = mix(gv, c[0] * tk, inT) * (1 - grime); G[i] = mix(gv * 0.97, c[1] * tk, inT) * (1 - grime); B[i] = mix(gv * 0.92, c[2] * tk, inT) * (1 - grime * 1.1);
        H[i] = mix(missing ? 0.05 + (wn[i] - 0.5) * 0.1 : 0.2, 0.55 + dome * 0.2 + (mid[i] - 0.5) * 0.03, inT);
        Ro[i] = mix(0.9, 0.1 + grime * 0.6 + (mid[i] - 0.5) * 0.08, inT);
      }
    }
    return bake(s, { normal: 2.4, tileM: 5, macro: 0.6, ao1: 3, ao2: 1 });
  });
}

export function dirtSet() {
  return cached('dirt', () => {
    const W = R(1024), s = surf(W, W), mW = 10;
    const { w, h, n, R: Rr, G, B, H, Ro } = s, ppm = w / mW;
    const mac = fbm(w, h, 2, 5, 801), mid = fbm(w, h, 9, 4, 802), fine = fbm(w, h, 50, 2, 803), wn = white(n, 804);
    const grav = worley(w, h, mW / 0.028, 805, 1), gravM = fbm(w, h, 5, 4, 806);
    const pebble = worley(w, h, mW / 0.09, 807, 1);
    const mud = worley(w, h, mW / 0.25, 808, 0.9), mudM = fbm(w, h, 3, 4, 809);
    const ruts = fbm(w, h, 1, 3, 810, 0.5, 6);
    const oil = blur(raster(w, h, (g) => wrap9(g, w, h, (gg) => { const r = rng(811); for (let i = 0; i < 7; i++) { gg.globalAlpha = 0.4 + r() * 0.5; gg.beginPath(); gg.ellipse(r() * w, r() * h, (0.2 + r() * 0.6) * ppm, (0.15 + r() * 0.4) * ppm, r() * 3, 0, 7); gg.fill(); } })), w, h, 0.08 * ppm, 2);
    for (let i = 0; i < n; i++) {
      const m = mac[i];
      const dry = ss(0.35, 0.75, m);
      // soil colour: damp dark brown -> dusty grey-tan
      let r = mix(0.3, 0.47, dry), g = mix(0.24, 0.41, dry), b = mix(0.18, 0.33, dry);
      const k = 1 + (mid[i] - 0.5) * 0.18 + (fine[i] - 0.5) * 0.1 + (wn[i] - 0.5) * 0.1;
      r *= k; g *= k; b *= k;
      // gravel: dense where mask is high
      const gd = 0.12 + ss(0.35, 0.75, gravM[i]) * 0.6;
      const st = ss(0.45, 0.25, grav.f1[i]) * (grav.id[i] < gd ? 1 : 0);
      const pb = ss(0.42, 0.28, pebble.f1[i]) * (pebble.id[i] < gd * 0.3 ? 1 : 0);
      const sv = 0.33 + grav.id[i] * 0.22, pv = 0.36 + pebble.id[i] * 0.22;
      r = mix(r, sv * 1.02, st); g = mix(g, sv, st); b = mix(b, sv * 0.95, st);
      r = mix(r, pv * 1.03, pb); g = mix(g, pv, pb); b = mix(b, pv * 0.93, pb);
      // dried mud cracks in low damp areas
      const mc = ss(0.62, 0.8, mudM[i]) * (1 - dry);
      const crack = mc * ss(0.06, 0.0, mud.f2[i] - mud.f1[i]);
      r *= 1 - crack * 0.5; g *= 1 - crack * 0.5; b *= 1 - crack * 0.5;
      // shallow tyre ruts
      const rut = ss(0.62, 0.8, ruts[i]);
      const o = oil[i];
      r *= 1 - o * 0.5 - rut * 0.08; g *= 1 - o * 0.5 - rut * 0.08; b *= 1 - o * 0.48 - rut * 0.08;
      Rr[i] = r; G[i] = g; B[i] = b;
      H[i] = 0.45 + (mid[i] - 0.5) * 0.3 + (fine[i] - 0.5) * 0.2 + (wn[i] - 0.5) * 0.15 + st * (0.3 + grav.id[i] * 0.2) + pb * 0.55 * (1 - pebble.f1[i]) - crack * 0.4 - rut * 0.25;
      Ro[i] = 0.93 + (wn[i] - 0.5) * 0.06 - st * 0.08 - o * 0.35 - (1 - dry) * 0.06;
    }
    return bake(s, { normal: 3.2, tileM: 10, detail: 'stone', detM: 0.5, detStr: 0.5, ground: true, antitile: true, macro: 1, pud: 0.6, ao1: 3, ao2: 1.5 });
  });
}

export function grassSet() {
  return cached('grass', () => {
    const W = R(1024), s = surf(W, W), mW = 7;
    const { w, h, n, R: Rr, G, B, H, Ro } = s, ppm = w / mW;
    const mac = fbm(w, h, 2, 5, 901), mid = fbm(w, h, 8, 3, 902), wn = white(n, 903);
    const soil = new Float32Array(n);
    // base: dark soil-and-thatch
    for (let i = 0; i < n; i++) { const k = 0.85 + (mid[i] - 0.5) * 0.25 + (wn[i] - 0.5) * 0.15; Rr[i] = 0.2 * k; G[i] = 0.25 * k; B[i] = 0.1 * k; H[i] = 0.35 + (wn[i] - 0.5) * 0.1; Ro[i] = 0.95; soil[i] = 1; }
    // blades painted as short strokes, bright tips, darker roots; dead patches by macro mask
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    const hc = document.createElement('canvas'); hc.width = w; hc.height = h;
    const hg = hc.getContext('2d', { willReadFrequently: true });
    hg.fillStyle = '#000'; hg.fillRect(0, 0, w, h);
    const r = rng(904);
    const blades = Math.round(85000 * SC * SC);
    g.lineCap = hg.lineCap = 'round';
    for (let k = 0; k < blades; k++) {
      const x = r() * w, y = r() * h, i = (Math.floor(y) * w + Math.floor(x)) | 0;
      const dead = ss(0.62, 0.8, mac[i] + (r() - 0.5) * 0.15);
      const a = -Math.PI / 2 + (r() - 0.5) * 2.2, len = (0.02 + r() * 0.05) * ppm;
      const hue = mix(0.235 + (r() - 0.5) * 0.04, 0.13, dead), sat = mix(0.38 + r() * 0.12, 0.3, dead), lig = mix(0.21 + r() * 0.07, 0.33 + r() * 0.06, dead) * (0.9 + mid[i] * 0.2);
      const col = hsl2rgb(hue, sat, lig);
      g.strokeStyle = `rgb(${col[0] * 255 | 0},${col[1] * 255 | 0},${col[2] * 255 | 0})`;
      g.lineWidth = (0.9 + r() * 1.1) * SC;
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      wrap9Light(g, w, h, x, y, len, (gg) => { gg.beginPath(); gg.moveTo(x, y); gg.lineTo(x2, y2); gg.stroke(); });
      const hv = 140 + r() * 115;
      hg.strokeStyle = `rgb(${hv | 0},${hv | 0},${hv | 0})`; hg.lineWidth = g.lineWidth;
      wrap9Light(hg, w, h, x, y, len, (gg) => { gg.beginPath(); gg.moveTo(x, y); gg.lineTo(x2, y2); gg.stroke(); });
    }
    const gd = g.getImageData(0, 0, w, h).data, hd = hg.getImageData(0, 0, w, h).data;
    for (let i = 0; i < n; i++) {
      const a = gd[i * 4 + 3] / 255;
      if (a > 0) { Rr[i] = mix(Rr[i], gd[i * 4] / 255, a); G[i] = mix(G[i], gd[i * 4 + 1] / 255, a); B[i] = mix(B[i], gd[i * 4 + 2] / 255, a); Ro[i] = mix(0.95, 0.75, a); }
      H[i] = Math.max(H[i], hd[i * 4] / 255);
    }
    return bake(s, { normal: 1.2, tileM: 7, ground: true, macro: 0.8, pud: 0.7, ao1: 1.2, ao2: 0.6, aoR1: 2, aoR2: 6 });
  });
}
// wrap draw only when a stroke is near an edge (cheaper than 9x for thousands of blades)
function wrap9Light(g, w, h, x, y, rad, fn) {
  fn(g);
  const nx = x < rad ? 1 : x > w - rad ? -1 : 0, ny = y < rad ? 1 : y > h - rad ? -1 : 0;
  if (nx) { g.save(); g.translate(nx * w, 0); fn(g); g.restore(); }
  if (ny) { g.save(); g.translate(0, ny * h); fn(g); g.restore(); }
  if (nx && ny) { g.save(); g.translate(nx * w, ny * h); fn(g); g.restore(); }
}

export function courtSet() {
  return cached('court', () => {
    const W = R(1024), Hh = R(2048), s = surf(W, Hh);
    const { w, h, n, R: Rr, G, B, H, Ro } = s;
    const mac = fbm(w, h, 3, 5, 1001), mid = fbm(w, h, 12, 3, 1002), wn = white(n, 1003);
    const paintL = paint(w, h, (g) => {
      const S = w / 512;
      g.scale(S, S);
      const W2 = 512, H2 = 1024;
      g.fillStyle = '#b8482e'; // keys painted terracotta
      g.fillRect(W2 / 2 - 60, 14, 120, 180); g.fillRect(W2 / 2 - 60, H2 - 194, 120, 180);
      g.strokeStyle = '#ecebe4'; g.lineWidth = 5;
      g.strokeRect(14, 14, W2 - 28, H2 - 28);
      g.beginPath(); g.moveTo(14, H2 / 2); g.lineTo(W2 - 14, H2 / 2); g.stroke();
      g.beginPath(); g.arc(W2 / 2, H2 / 2, 60, 0, 7); g.stroke();
      g.beginPath(); g.arc(W2 / 2, 14, 210, 0, Math.PI); g.stroke();
      g.beginPath(); g.arc(W2 / 2, H2 - 14, 210, Math.PI, 0); g.stroke();
      g.strokeRect(W2 / 2 - 60, 14, 120, 180); g.strokeRect(W2 / 2 - 60, H2 - 194, 120, 180);
      g.beginPath(); g.arc(W2 / 2, 194, 60, 0, Math.PI); g.stroke();
      g.beginPath(); g.arc(W2 / 2, H2 - 194, 60, Math.PI, 0); g.stroke();
      g.fillStyle = 'rgba(255,140,30,0.9)'; g.font = '900 120px "Anton", Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('Z6', W2 / 2, H2 / 2 + 4);
    });
    const cracks = raster(w, h, (g) => strokePaths(g, crackPaths(rng(1004), 8, w, h, 30, 14 * SC, 0.5), Math.max(1, 1.4 * SC)));
    const scuff = raster(w, h, (g) => { const r = rng(1005); for (let i = 0; i < 120; i++) { g.globalAlpha = 0.1 + r() * 0.35; g.lineWidth = (2 + r() * 6) * SC; const x = r() * w, y = r() * h, a = r() * 6.28, l = (20 + r() * 80) * SC; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 20, y + 10, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } });
    const base = rgb('#2d5872');
    for (let i = 0; i < n; i++) {
      const fade = ss(0.4, 0.9, mac[i]) * 0.25;
      const k = 1 + (mid[i] - 0.5) * 0.12 + (wn[i] - 0.5) * 0.06;
      let r = mix(base[0], 0.5, fade) * k, g = mix(base[1], 0.55, fade) * k, b = mix(base[2], 0.58, fade) * k;
      const pa = paintL[i * 4 + 3] / 255 * (0.75 + mid[i] * 0.35 - ss(0.6, 0.9, wn[i]) * 0.2);
      if (pa > 0) { r = mix(r, paintL[i * 4] / 255 * k, pa); g = mix(g, paintL[i * 4 + 1] / 255 * k, pa); b = mix(b, paintL[i * 4 + 2] / 255 * k, pa); }
      const d = 1 - scuff[i] * 0.3 - cracks[i] * 0.55;
      Rr[i] = r * d; G[i] = g * d; B[i] = b * d;
      H[i] = 0.5 + (mid[i] - 0.5) * 0.15 + (wn[i] - 0.5) * 0.2 + pa * 0.06 - cracks[i] * 0.5;
      Ro[i] = 0.68 + (wn[i] - 0.5) * 0.08 + fade * 0.2 - pa * 0.12 + scuff[i] * 0.1 + cracks[i] * 0.2;
    }
    const set = bake(s, { normal: 2.2, tileM: 16, detail: 'stone', detM: 0.4, detStr: 0.3, ground: true, macro: 0.7, pud: 0.66 });
    for (const k of ['map', 'normalMap', 'orm']) set[k].wrapS = set[k].wrapT = THREE.ClampToEdgeWrapping;
    return set;
  });
}

// ---------------- building facades ----------------
// The facade texture is an overlay: window frames, sills, lintels, storefront and grime.
// Wall areas (alpha = 1, ORM.B = 1) are filled in the shader with a brick or stucco set
// sampled at true physical scale, and glass rects are replaced by ray-marched rooms.
const FAC = { cols: 2, rows: 3, top: 0.045, store: 0.3, plinth: 0.05 };
function facadeLayout(W, H, store) {
  const top = H * FAC.top, bottom = H * (store ? FAC.store : FAC.plinth);
  const cellW = W / FAC.cols, cellH = (H - top - bottom) / FAC.rows;
  const gx = cellW * 0.25, gw = cellW * 0.5, gy = cellH * 0.2, gh = cellH * 0.56;
  const storeH = H * FAC.store, sTop = H - storeH;
  const sg = { x: W * 0.05, y: sTop + storeH * 0.24, w: W * 0.56, h: storeH * 0.62 };
  return { top, bottom, cellW, cellH, gx, gw, gy, gh, storeH, sTop, sg };
}

function facadeOverlay(store, tag, variant) {
  return cached(`facov${store ? 's' : ''}${tag ? 't' : ''}${variant}`, () => {
    const W = R(1024), Hh = R(2048), s = surf(W, Hh);
    const { w, h, n, R: Rr, G, B, H, Ro } = s;
    s.A = new Float32Array(n).fill(1);
    const wallM = new Float32Array(n).fill(1);
    s.Me = wallM; // ORM.B = wall mask for normal / roughness
    const L = facadeLayout(w, h, store), S = w / 1024;
    const r = rng(1200 + variant * 31 + (store ? 7 : 0) + (tag ? 3 : 0));
    const mac = fbm(w, h, 2, 4, 1201 + variant), streak = fbm(w, h, 48, 2, 1202 + variant, 0.35, 2), wn = white(n, 1203);
    // wall grime multiplier (white = untouched)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const st = ss(0.55, 0.9, streak[i]) * 0.14 * (0.5 + mac[i]);
      const topSoot = ss(0.15, 0.0, y / h) * 0.12;
      const base = ss(0.8, 1.0, y / h) * 0.18;
      const m = 1 - st - topSoot - base - (mac[i] - 0.5) * 0.12;
      Rr[i] = m; G[i] = m * 0.995; B[i] = m * 0.985;
      H[i] = 0.5; Ro[i] = 0.9;
    }
    // helpers writing non-wall elements
    const rect = (x0, y0, ww, hh, col, hv, ro, opt = {}) => {
      const xa = Math.max(0, Math.floor(x0)), xb = Math.min(w, Math.ceil(x0 + ww)), ya = Math.max(0, Math.floor(y0)), yb = Math.min(h, Math.ceil(y0 + hh));
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
        const i = y * w + x;
        const k = 1 + (wn[i] - 0.5) * (opt.noise ?? 0.06) + (mac[i] - 0.5) * 0.1;
        Rr[i] = col[0] * k; G[i] = col[1] * k; B[i] = col[2] * k;
        s.A[i] = 0; wallM[i] = opt.wall ?? 0;
        const bev = opt.bevel ? ss(0, opt.bevel, Math.min(x - x0, x0 + ww - x, y - y0, y0 + hh - y)) : 1;
        H[i] = hv * (0.85 + 0.15 * bev) + (opt.flat ? 0 : (wn[i] - 0.5) * 0.02); Ro[i] = ro + (opt.flat ? 0 : (wn[i] - 0.5) * 0.05);
      }
    };
    const paints = [];
    const frameCol = [[0.86, 0.84, 0.8], [0.18, 0.17, 0.16], [0.42, 0.33, 0.24], [0.75, 0.73, 0.68]][variant % 4];
    const stone = [0.66, 0.63, 0.57];
    // cornice band
    rect(0, 0, w, L.top * 0.6, [0.5, 0.48, 0.45], 0.8, 0.85, { noise: 0.12 });
    rect(0, L.top * 0.6, w, L.top * 0.12, [0.32, 0.3, 0.28], 0.65, 0.9);
    for (let row = 0; row < FAC.rows; row++) for (let col = 0; col < FAC.cols; col++) {
      const cx0 = col * L.cellW, cy0 = L.top + row * L.cellH;
      const gx = cx0 + L.gx, gy = cy0 + L.gy, gw = L.gw, gh = L.gh;
      const fw = 14 * S;
      // lintel (stone) and sill with drip stain below
      rect(gx - fw * 2, gy - fw * 2.6, gw + fw * 4, fw * 1.8, stone, 0.85, 0.85, { bevel: 3 * S, noise: 0.14 });
      rect(gx - fw * 1.6, gy + gh + fw * 0.6, gw + fw * 3.2, fw * 1.3, stone, 0.95, 0.85, { bevel: 3 * S, noise: 0.14 });
      for (let y = Math.floor(gy + gh + fw * 1.9); y < Math.min(h, gy + gh + fw * 1.9 + 110 * S); y++) for (let x = Math.floor(gx - fw); x < gx + gw + fw; x++) {
        const i = y * w + x; if (s.A[i] < 1) continue;
        const t = (y - (gy + gh + fw * 1.9)) / (110 * S);
        const k = (1 - t) * 0.3 * ss(0.3, 0.7, streak[i] + 0.2);
        Rr[i] *= 1 - k; G[i] *= 1 - k; B[i] *= 1 - k * 0.9;
      }
      // frame
      rect(gx - fw, gy - fw, gw + fw * 2, gh + fw * 2, frameCol, 0.75, 0.5, { bevel: 4 * S });
      // glass (recessed, smooth) – the shader paints the room behind it
      // glass (recessed, smooth) – the shader paints the room behind it
      rect(gx, gy, gw, gh, [0.04, 0.045, 0.05], 0.3, 0.05, { noise: 0, flat: true });
      // dirty glass corners
      for (let y = Math.floor(gy); y < gy + gh; y++) for (let x = Math.floor(gx); x < gx + gw; x++) {
        const i = y * w + x, d = Math.min(x - gx, gx + gw - x, y - gy, gy + gh - y);
        Ro[i] = 0.04 + ss(18 * S, 0, d) * 0.06 + ss(0.6, 0.9, mac[i]) * 0.05;
      }
      // mullion + transom
      rect(gx + gw / 2 - fw * 0.5, gy, fw, gh, frameCol, 0.7, 0.5, { bevel: 2 * S });
      rect(gx, gy + gh * 0.38, gw, fw * 0.8, frameCol, 0.7, 0.5, { bevel: 2 * S });
      // optional window dressing (ORM.B = 0.5): the shader shows it on roughly a third of
      // the windows, picked per facade tile, so it never repeats in lockstep
      const opt = r();
      if (opt < 0.12) {
        rect(gx, gy, gw, gh, [0.55, 0.43, 0.3], 0.62, 0.85, { noise: 0.25, wall: 0.5 });
        for (let k = 0; k < 4; k++) rect(gx, gy + (gh / 4) * k, gw, 3 * S, [0.25, 0.2, 0.15], 0.5, 0.9, { wall: 0.5 });
      } else if (opt < 0.75) {
        const ax = gx + gw * (r() < 0.5 ? 0.06 : 0.54), ay = gy + gh * 0.62, aw = gw * 0.4, ah = gh * 0.26;
        rect(ax, ay, aw, ah, [0.72, 0.7, 0.65], 0.95, 0.6, { bevel: 3 * S, wall: 0.5 });
        for (let yy = ay + 6 * S; yy < ay + ah - 4 * S; yy += 5 * S) rect(ax + 6 * S, yy, aw - 12 * S, 1.6 * S, [0.25, 0.25, 0.25], 0.85, 0.7, { wall: 0.5 });
        // rust drip under it
        for (let y = Math.floor(ay + ah); y < Math.min(h, ay + ah + 90 * S); y++) for (let x = Math.floor(ax + aw * 0.3); x < ax + aw * 0.4; x++) {
          const i = y * w + x; if (s.A[i] < 1) continue; const k = (1 - (y - ay - ah) / (90 * S)) * 0.35;
          Rr[i] *= 1 - k * 0.6; G[i] *= 1 - k; B[i] *= 1 - k * 1.2;
        }
      }
    }
    // ground floor
    if (store) {
      const sTop = L.sTop, sg = L.sg;
      const dark = [[0.09, 0.09, 0.1], [0.32, 0.08, 0.06], [0.06, 0.12, 0.1], [0.2, 0.2, 0.22]][variant % 4];
      // fascia band (sign area) and storefront surround
      rect(0, sTop, w, L.storeH * 0.16, dark, 0.8, 0.45, { noise: 0.1 });
      rect(0, sTop + L.storeH * 0.16, w, L.storeH * 0.04, [0.6, 0.6, 0.6], 0.85, 0.35);
      rect(0, sTop + L.storeH * 0.2, w, L.storeH * 0.8, dark, 0.7, 0.5, { noise: 0.08 });
      // bulkhead tiles under the display window
      const bk = sg.y + sg.h;
      rect(sg.x - 10 * S, bk, sg.w + 20 * S, h - bk, [0.5, 0.48, 0.45], 0.78, 0.4, { noise: 0.2 });
      for (let x = sg.x; x < sg.x + sg.w; x += 48 * S) rect(x, bk, 2 * S, h - bk, [0.2, 0.2, 0.2], 0.7, 0.9);
      // display glass
      rect(sg.x, sg.y, sg.w, sg.h, [0.04, 0.045, 0.05], 0.3, 0.05, { noise: 0, flat: true });
      // aluminium storefront mullions
      for (const fx of [0, 0.5, 1]) rect(sg.x + sg.w * fx - 5 * S, sg.y, 10 * S, sg.h, [0.55, 0.56, 0.58], 0.72, 0.35);
      rect(sg.x, sg.y - 5 * S, sg.w, 10 * S, [0.55, 0.56, 0.58], 0.72, 0.35);
      // posters / stickers stuck on the glass
      const words = ['EBT', 'ATM', 'LOTTO', 'ICE', 'OPEN', 'WIC', 'CASH', 'NO LOITERING', 'HOT WINGS', '24 HRS'];
      paints.push((g) => {
        for (let i = 0; i < 3; i++) {
          const pw = (70 + r() * 70) * S, ph = (90 + r() * 70) * S, px = sg.x + 20 * S + r() * (sg.w - pw - 40 * S), py = sg.y + 20 * S + r() * (sg.h * 0.5);
          const bg = ['#ffeb3b', '#e53935', '#f5f5f5', '#43a047', '#1e88e5', '#ff6f00'][Math.floor(r() * 6)];
          g.save(); g.translate(px, py); g.rotate((r() - 0.5) * 0.06);
          g.fillStyle = bg; g.fillRect(0, 0, pw, ph);
          g.fillStyle = bg === '#f5f5f5' || bg === '#ffeb3b' ? '#111' : '#fff';
          g.font = `900 ${Math.round(26 * S)}px "Anton", Impact, "Arial Black", sans-serif`; g.textAlign = 'center';
          g.fillText(words[Math.floor(r() * words.length)], pw / 2, ph * 0.4, pw * 0.9);
          g.font = `bold ${Math.round(13 * S)}px Arial, sans-serif`; g.fillText('ACCEPTED HERE', pw / 2, ph * 0.62, pw * 0.9);
          g.restore();
        }
        // neon OPEN sign
        g.save(); g.translate(sg.x + sg.w * 0.75, sg.y + sg.h * 0.25);
        g.strokeStyle = '#ff2a4a'; g.lineWidth = 4 * S; g.shadowColor = '#ff2a4a'; g.shadowBlur = 8 * S;
        g.strokeRect(-56 * S, -24 * S, 112 * S, 48 * S);
        g.font = `bold ${Math.round(30 * S)}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#4ad4ff'; g.fillText('OPEN', 0, 2 * S);
        g.restore();
      });
      // roll-down security gate over the door
      const dx = w * 0.66, dw = w * 0.28, dy = sTop + L.storeH * 0.22;
      rect(dx - 8 * S, dy - 14 * S, dw + 16 * S, 14 * S, [0.3, 0.3, 0.32], 0.9, 0.5);
      for (let y = Math.floor(dy); y < h; y++) {
        const ph = ((y - dy) % (9 * S)) / (9 * S), prof = Math.sin(ph * Math.PI);
        for (let x = Math.floor(dx); x < dx + dw; x++) {
          const i = y * w + x;
          const rs = ss(0.6, 0.85, streak[i] * 0.7 + (y - dy) / (h - dy) * 0.4) * 0.6;
          const k = 0.42 + prof * 0.14 + (wn[i] - 0.5) * 0.04;
          Rr[i] = mix(k, 0.36, rs); G[i] = mix(k * 1.01, 0.2, rs); B[i] = mix(k * 1.04, 0.1, rs);
          s.A[i] = 0; wallM[i] = 0; H[i] = 0.6 + prof * 0.25; Ro[i] = mix(0.45, 0.85, rs);
        }
      }
      // gate graffiti scribbles

    } else {
      // stone plinth with splash grime
      const py = h - L.bottom * 0.7;
      rect(0, py, w, h - py, [0.38, 0.36, 0.34], 0.75, 0.85, { noise: 0.2 });
      rect(0, py - 6 * S, w, 6 * S, [0.5, 0.48, 0.45], 0.85, 0.8);
    }
    // graffiti on the wall (paint over brick: colour from overlay, relief from the wall)
    if (tag) {
      // wall pieces: paint lands on masonry only (cut around frames and glass)
      // street-level band between the lowest sills and the storefront / plinth
      const yTop = L.top + 2 * L.cellH + L.gy + L.gh + 34 * S, yBot = store ? L.sTop - 6 * S : h - L.bottom * 0.7 - 10 * S;
      const tc = paint(w, h, (g) => paintTag(g, w * (0.3 + r() * 0.4), (yTop + yBot) / 2, w * 0.7, r, { maxH: (yBot - yTop) * 1.1 }));
      for (let i = 0; i < n; i++) {
        const a = tc[i * 4 + 3] / 255;
        if (a < 0.02 || wallM[i] < 0.75) continue;
        Rr[i] = mix(Rr[i], tc[i * 4] / 255, a); G[i] = mix(G[i], tc[i * 4 + 1] / 255, a); B[i] = mix(B[i], tc[i * 4 + 2] / 255, a);
        Ro[i] = mix(Ro[i], 0.6, a); s.A[i] *= 1 - a;
      }
    }
    if (paints.length) {
      // one readback for posters, gate scribbles and wall pieces
      const pc = paint(w, h, (g) => { for (const f of paints) f(g); });
      for (let i = 0; i < n; i++) {
        const a = pc[i * 4 + 3] / 255;
        if (a < 0.02) continue;
        Rr[i] = mix(Rr[i], pc[i * 4] / 255, a); G[i] = mix(G[i], pc[i * 4 + 1] / 255, a); B[i] = mix(B[i], pc[i * 4 + 2] / 255, a);
        if (wallM[i] < 0.25 && Ro[i] < 0.12) wallM[i] = 0.5; // stickers on shop glass are optional too
        Ro[i] = mix(Ro[i], 0.58, a);
        s.A[i] *= 1 - a; // on walls paint replaces brick colour (relief stays via ORM.B)
      }
    }
    const set = bake(s, { normal: 3, tileM: 7, macro: 0.5, ao1: 3, ao2: 1.5, aoR1: 3, aoR2: 10, half: true });
    const lay = facadeLayout(1, 1, store);
    // uv rects (v up): first window of bottom row, cell pitch, grid; store glass
    set.facade = {
      win: [lay.gx, 1 - (lay.top + 2 * lay.cellH + lay.gy + lay.gh), lay.gw, lay.gh],
      grid: [lay.cellW, lay.cellH, FAC.cols, FAC.rows],
      store: store ? [lay.sg.x, 1 - (lay.sg.y + lay.sg.h), lay.sg.w, lay.sg.h] : [0, 0, 0, 0],
    };
    return set;
  });
}

export function facadeSet(wallColor, seed, opts = {}) {
  const variant = Math.abs(seed | 0) % 2;
  const key = `facade${wallColor}${opts.brick ? 'b' : ''}${opts.store ? 's' : ''}${opts.tag ? 't' : ''}${variant}`;
  return cached(key, () => {
    const ov = facadeOverlay(!!opts.store, !!opts.tag, variant);
    const wall = opts.brick ? brickSet(wallColor) : concreteSet(wallColor, 'stucco');
    return { ...ov, id: ++setId, facade: { ...ov.facade, wall } };
  });
}

// ---------------- small utility textures ----------------

export function blobShadow() {
  return cached('blob', () => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,0.75)'); grd.addColorStop(0.5, 'rgba(0,0,0,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    return { map: t };
  }).map;
}

export function bulletHole() {
  return cached('hole', () => {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), r = rng(77), m = S / 2;
    // pulverised dust ring
    const grd = g.createRadialGradient(m, m, 0, m, m, m * 0.95);
    grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.12, 'rgba(8,8,8,0.98)'); grd.addColorStop(0.2, 'rgba(45,42,38,0.85)');
    grd.addColorStop(0.42, 'rgba(70,66,60,0.45)'); grd.addColorStop(1, 'rgba(60,55,50,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    // spalled chips
    for (let i = 0; i < 9; i++) {
      const a = r() * 6.283, d = m * (0.14 + r() * 0.16), sz = m * (0.05 + r() * 0.08);
      g.fillStyle = `rgba(${150 + r() * 50},${145 + r() * 45},${135 + r() * 40},${0.35 + r() * 0.3})`;
      g.beginPath(); g.moveTo(m + Math.cos(a) * d, m + Math.sin(a) * d);
      g.lineTo(m + Math.cos(a + 0.4) * (d + sz), m + Math.sin(a + 0.4) * (d + sz)); g.lineTo(m + Math.cos(a - 0.3) * (d + sz * 1.3), m + Math.sin(a - 0.3) * (d + sz * 1.3)); g.fill();
    }
    // radial fractures
    g.strokeStyle = 'rgba(15,15,15,0.7)'; g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let a = r() * Math.PI * 2, x = m, y = m, l = m * (0.3 + r() * 0.45);
      g.lineWidth = 1 + r(); g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { a += (r() - 0.5) * 0.5; x += Math.cos(a) * l / 4; y += Math.sin(a) * l / 4; g.lineTo(x, y); }
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,1)'; g.beginPath(); g.arc(m, m, m * 0.09, 0, 7); g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { map: t };
  }).map;
}

// ---------------- material factory ----------------

const repCache = new Map();
function rep(t, rx, ry) {
  if (!t) return null;
  const key = t.uuid + ':' + rx.toFixed(3) + ':' + ry.toFixed(3);
  let c = repCache.get(key);
  if (!c) {
    c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; repCache.set(key, c);
    c.__base = t; c.__repKey = key;
    if (!clones.has(t)) clones.set(t, []);
    clones.get(t).push(c);
  }
  return c;
}

const GLSL_PARS = /* glsl */`
varying vec3 vWPos;
varying vec3 vWN;
uniform float uWet;
uniform float uNight;
uniform sampler2D tORM;
uniform float uMacro;
uniform float uPud;
uniform float uAOI;
#ifdef C_DETAIL
uniform sampler2D tDetail;
uniform float uDetRep;
uniform float uDetStr;
#endif
#ifdef C_FACADE
uniform sampler2D tWall;
uniform sampler2D tWallN;
uniform sampler2D tWallORM;
uniform float uWallScale;
uniform float uWallLum;
uniform vec4 uWin;
uniform vec4 uWinGrid;
uniform vec4 uStore;
#endif
float cH21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float cVN(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(cH21(i), cH21(i + vec2(1.0, 0.0)), u.x), mix(cH21(i + vec2(0.0, 1.0)), cH21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float cFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * cVN(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 17.0; a *= 0.5; }
  return s / 0.9375;
}
`;

const GLSL_MAP = /* glsl */`
#include <map_fragment>
vec3 cN = normalize(vWN);
float cUp = cN.y;
float cWallness = 1.0 - abs(cUp);
vec2 cMP = abs(cUp) > 0.7 ? vWPos.xz : vec2(vWPos.x + vWPos.z, vWPos.y);
vec4 cORM = texture2D(tORM, vMapUv);
#ifdef C_ANTITILE
  vec2 cUV2 = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.41 + vec2(0.37, 0.71);
  float cBl = smoothstep(0.32, 0.68, cFbm(cMP * 0.06 + 5.3));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * texture2D(map, cUV2).rgb, cBl);
  cORM = mix(cORM, texture2D(tORM, cUV2), cBl);
#endif
float cAO = cORM.r;
float cRough = cORM.g;
float cMetal = cORM.b;
vec3 cEmit = vec3(0.0);
vec2 cDetUV = vMapUv;
float cGlassM = 0.0;
vec2 cNUV = vNormalMapUv;
#ifdef C_FACADE
  vec3 cWallNrm = vec3(0.0, 0.0, 1.0);
  float cWallM = cORM.b;
  float cLu = 7.0, cLv = 9.0;
  {
    vec3 dpx = dFdx(vWPos), dpy = dFdy(vWPos);
    vec2 dux = dFdx(vMapUv), duy = dFdy(vMapUv);
    float det = dux.x * duy.y - dux.y * duy.x;
    if (abs(det) > 1e-12) {
      vec3 tu = (dpx * duy.y - dpy * dux.y) / det;
      vec3 tv = (dpy * dux.x - dpx * duy.x) / det;
      float lu = floor(length(tu) * 4.0 + 0.5) * 0.25, lv = floor(length(tv) * 4.0 + 0.5) * 0.25;
      if (lu > 0.4 && lu < 80.0 && lv > 0.4 && lv < 80.0) { cLu = lu; cLv = lv; }
    }
  }
  vec2 cWUV = vMapUv * vec2(cLu, cLv) / uWallScale;
  vec4 cWall = texture2D(tWall, cWUV);
  vec4 cWO = texture2D(tWallORM, cWUV);
  cWallNrm = texture2D(tWallN, cWUV).xyz * 2.0 - 1.0;
  // ---- recessed window openings: frame + glass sit 14 cm behind the wall face ----
  vec2 cUV = vMapUv;
  float cReveal = 0.0;
  {
    vec2 t = fract(vMapUv);
    vec2 cell = floor((t - uWin.xy) / uWinGrid.xy);
    vec2 fexp = vec2(0.0137, 0.0068);
    vec2 o0 = uWin.xy + cell * uWinGrid.xy - fexp, osz = uWin.zw + 2.0 * fexp;
    vec2 lo = (t - o0) / osz;
    if (cell.x >= 0.0 && cell.x <= uWinGrid.z - 1.0 && cell.y >= 0.0 && cell.y <= uWinGrid.w - 1.0 && lo.x >= 0.0 && lo.x <= 1.0 && lo.y >= 0.0 && lo.y <= 1.0) {
      vec3 V = normalize(vWPos - cameraPosition);
      vec3 tu = normalize(cross(vec3(0.0, 1.0, 0.0), cN));
      float dz = max(-dot(V, cN), 0.06);
      vec2 sh = vec2(dot(V, tu), V.y) * (0.14 / dz) / vec2(cLu, cLv);
      vec2 lo2 = lo + sh / osz;
      if (lo2.x < 0.0 || lo2.x > 1.0 || lo2.y < 0.0 || lo2.y > 1.0) cReveal = 1.0;
      else cUV = vMapUv + sh;
    }
  }
  if (cReveal < 0.5 && cUV != vMapUv) {
    sampledDiffuseColor = texture2D(map, cUV);
    cORM = texture2D(tORM, cUV);
    cRough = cORM.g; cAO = cORM.r;
  }
  cNUV = cUV;
  float cWl = dot(cWall.rgb, vec3(0.2126, 0.7152, 0.0722));
  // ORM.B: 1 = wall, 0 = facade detail, 0.5 = optional detail (AC units, boards, posters)
  float cOpt = step(0.3, cORM.b) * step(cORM.b, 0.7);
  cWallM = cReveal > 0.5 ? 1.0 : cORM.b * (1.0 - cOpt);
  float cFace = floor(dot(vWPos, cN) * 2.0 + 0.5);
  vec2 cFid = floor(vMapUv) * 13.17 + vec2(cFace * 0.731 + cN.x * 5.3, cN.z * 9.1 + cFace * 0.17);
  {
    // paint on the wall (graffiti) only survives on some facade tiles, so pieces don't repeat
    float pw = cWallM * (1.0 - sampledDiffuseColor.a) * step(0.38, cH21(cFid + 0.5));
    sampledDiffuseColor = mix(sampledDiffuseColor, vec4(0.88, 0.88, 0.88, 1.0), pw);
  }
  vec3 cPaint = sampledDiffuseColor.rgb * mix(1.0, clamp(cWl / uWallLum, 0.35, 1.7), cWallM);
  diffuseColor.rgb = diffuse * mix(cPaint, cWall.rgb * sampledDiffuseColor.rgb, sampledDiffuseColor.a);
  cRough = mix(cRough, cWO.g, cWallM);
  cAO = mix(cAO, cWO.r, cWallM);
  if (cReveal > 0.5) { diffuseColor.rgb = diffuse * cWall.rgb * 0.75; cAO *= 0.45; cRough = 0.9; }
  cMetal = 0.0;
  cDetUV = cWUV * (uWallScale / 7.0);
  // ---- parallax room interiors behind the glass ----
  {
    vec2 t = fract(cUV), tile = floor(vMapUv);
    vec2 cell = floor((t - uWin.xy) / uWinGrid.xy);
    vec2 loc = (t - (uWin.xy + cell * uWinGrid.xy)) / uWin.zw;
    float inside = step(0.0, cell.x) * step(cell.x, uWinGrid.z - 1.0) * step(0.0, cell.y) * step(cell.y, uWinGrid.w - 1.0)
      * step(0.0, loc.x) * step(loc.x, 1.0) * step(0.0, loc.y) * step(loc.y, 1.0);
    float isStore = 0.0;
    vec2 gsz = uWin.zw;
    if (uStore.z > 0.0) {
      vec2 sl = (t - uStore.xy) / uStore.zw;
      if (sl.x >= 0.0 && sl.x <= 1.0 && sl.y >= 0.0 && sl.y <= 1.0) { loc = sl; inside = 1.0; isStore = 1.0; cell = vec2(17.0, 3.0); gsz = uStore.zw; }
    }
    vec2 wid = cFid + cell * 3.71;
    float hideOpt = cOpt * step(isStore > 0.5 ? 0.55 : 0.33, cH21(wid + 9.7));
    float glass = inside * max(1.0 - smoothstep(0.1, 0.2, cRough), hideOpt) * (1.0 - cReveal);
    cRough = mix(cRough, 0.05, hideOpt * inside);
    if (glass > 0.0) {
      vec3 up = vec3(0.0, 1.0, 0.0);
      vec3 tu = normalize(cross(up, cN));
      float r1 = cH21(wid), r2 = cH21(wid + 1.3), r3 = cH21(wid + 2.7), r4 = cH21(wid + 4.1), r5 = cH21(wid + 5.9), r6 = cH21(wid + 7.3);
      float gw = gsz.x * cLu, gh = gsz.y * cLv;
      float D = mix(3.2, 4.6, r2) + isStore * 1.8;
      float hw = isStore > 0.5 ? gw * 0.5 + 0.3 : max(gw * 0.5 + 0.7, uWinGrid.x * cLu * 0.48);
      float fy = isStore > 0.5 ? -gh * 0.5 - 0.45 : -gh * 0.5 - 0.85;
      float cyy = isStore > 0.5 ? gh * 0.5 + 0.7 : fy + 2.7;
      vec3 V = normalize(vWPos - cameraPosition);
      vec3 d = vec3(dot(V, tu), dot(V, up), min(dot(V, cN), -0.02));
      vec3 p0 = vec3((loc.x - 0.5) * gw, (loc.y - 0.5) * gh, 0.0);
      vec3 bmin = vec3(-hw, fy, -D), bmax = vec3(hw, cyy, 0.0);
      vec3 inv = 1.0 / vec3(abs(d.x) < 1e-4 ? 1e-4 : d.x, abs(d.y) < 1e-4 ? 1e-4 : d.y, d.z);
      vec3 tf = max((bmin - p0) * inv, (bmax - p0) * inv);
      float th = min(min(tf.x, tf.y), tf.z);
      vec3 hp = p0 + d * th;
      float lit = step(r1, mix(0.16, 0.45, uNight));
      if (isStore > 0.5) lit = step(r1, 0.92);
      vec3 wallC = mix(vec3(0.5, 0.42, 0.32), vec3(0.32, 0.38, 0.4), r3) * mix(0.65, 1.1, r4);
      if (r6 > 0.8) wallC = vec3(0.45, 0.2, 0.18);
      if (isStore > 0.5) wallC = vec3(0.42, 0.42, 0.4);
      vec3 alb, nrm;
      float which;
      if (th == tf.z) {
        which = 0.0; alb = wallC; nrm = vec3(0.0, 0.0, 1.0);
        float door = step(abs(hp.x - (r5 - 0.5) * hw), 0.45) * step(hp.y, fy + 2.05) * step(0.5, r6);
        alb = mix(alb, vec3(0.12, 0.08, 0.05), door);
        float pic = step(abs(hp.x + (r5 - 0.5) * hw * 0.8), 0.4) * step(abs(hp.y - (fy + 1.6)), 0.28) * step(r6, 0.55);
        alb = mix(alb, vec3(r4, r2, r6) * 0.45 + 0.05, pic);
      } else if (th == tf.x) {
        which = 1.0; alb = wallC * 0.9; nrm = vec3(-sign(d.x), 0.0, 0.0);
      } else if (d.y < 0.0) {
        which = 2.0; alb = mix(vec3(0.17, 0.1, 0.055), vec3(0.24, 0.22, 0.2), step(0.6, r5)); nrm = vec3(0.0, 1.0, 0.0);
        alb *= 0.85 + 0.15 * step(0.5, fract(hp.x * 3.0 + (r5 > 0.6 ? 0.0 : 100.0)));
        if (isStore > 0.5) { vec2 ck = floor(hp.xz * 3.3); alb = mix(vec3(0.3, 0.29, 0.27), vec3(0.2, 0.2, 0.19), mod(ck.x + ck.y, 2.0)); }
      } else {
        which = 3.0; alb = vec3(0.6); nrm = vec3(0.0, -1.0, 0.0);
        if (isStore > 0.5) { vec2 ct = fract(hp.xz * 1.65); alb = vec3(0.5) * (0.8 + 0.2 * step(0.04, min(ct.x, ct.y))); }
      }
      if (isStore > 0.5 && which < 2.0) {
        // gondola shelving: dark back panel, shelf lips with price strips, packed goods
        float yy = (hp.y - fy) * 2.6;
        float row = floor(yy), sh = fract(yy);
        float shelves = step(0.5, row) * step(row, 4.5);
        float u = (which == 0.0 ? hp.x : hp.z) * 7.0;
        float pw = mix(0.6, 1.6, cH21(vec2(row, floor(u * 0.25)) + wid));
        vec2 gid = vec2(floor(u / pw), row);
        float gh2 = mix(0.45, 0.85, cH21(gid + 3.1));
        vec3 gc = 0.5 + 0.45 * cos(6.2831 * (cH21(gid + wid) + vec3(0.0, 0.33, 0.67)));
        gc = mix(gc, vec3(dot(gc, vec3(0.333))), 0.45) * 0.42;
        float prod = step(0.16, sh) * step(sh, 0.16 + gh2 * 0.8) * step(0.08, fract(u / pw)) * step(0.12, cH21(gid * 1.7));
        alb = mix(alb, vec3(0.06), shelves);
        alb = mix(alb, gc, shelves * prod);
        alb = mix(alb, vec3(0.62, 0.62, 0.6), shelves * step(sh, 0.06));
        alb = mix(alb, vec3(0.75, 0.72, 0.3), shelves * step(sh, 0.025) * step(0.7, fract(u * 0.5)));
      }
      if (isStore > 0.5) {
        // free-standing aisle gondola between the window and the back wall
        float zc = -D * 0.42;
        float tc = (zc - p0.z) / d.z;
        if (tc > 0.0 && tc < th) {
          vec3 pc = p0 + d * tc;
          float gx = pc.x - (r3 - 0.5) * hw * 0.6;
          if (abs(gx) < hw * 0.45 && pc.y < fy + 1.45) {
            th = tc; hp = pc; nrm = vec3(0.0, 0.0, 1.0); which = 4.0;
            float yy = (pc.y - fy) * 2.6, row = floor(yy), sh = fract(yy);
            vec2 gid = vec2(floor(gx * 7.0), row);
            vec3 gc = 0.5 + 0.45 * cos(6.2831 * (cH21(gid + wid + 9.0) + vec3(0.0, 0.33, 0.67)));
            gc = mix(gc, vec3(dot(gc, vec3(0.333))), 0.45) * 0.42;
            alb = mix(vec3(0.06), gc, step(0.15, sh) * step(sh, 0.8) * step(0.1, fract(gx * 7.0)) * step(0.5, row));
            alb = mix(alb, vec3(0.6), step(sh, 0.06) * step(0.5, row));
            alb = mix(alb, vec3(0.08), step(1.43, pc.y - fy) + step(row, 0.5) * 0.8);
          }
        }
      }
      if (isStore < 0.5) {
        float zc = -D * mix(0.45, 0.7, r6);
        float tc = (zc - p0.z) / d.z;
        if (tc > 0.0 && tc < th) {
          vec3 pc = p0 + d * tc;
          float sofa = step(abs(pc.x - (r3 - 0.5) * hw), 0.95) * step(pc.y, fy + 0.85) * step(0.35, r5);
          float lx = (r2 - 0.5) * hw * 1.4;
          float lamp = (step(abs(pc.x + lx), 0.06) * step(pc.y, fy + 1.45) + step(abs(pc.x + lx), 0.22) * step(abs(pc.y - (fy + 1.55)), 0.16)) * step(0.45, r4);
          if (sofa + lamp > 0.5) { th = tc; hp = pc; alb = mix(vec3(0.05, 0.04, 0.035), vec3(0.2, 0.08, 0.06), r5); nrm = vec3(0.0, 0.0, 1.0); which = 4.0; }
        }
      }
      vec3 lc = mix(vec3(1.0, 0.66, 0.36), vec3(0.85, 0.92, 1.0), clamp(step(0.72, r2) + isStore, 0.0, 1.0));
      vec3 lp = vec3(0.0, cyy - 0.35, -D * 0.5);
      vec3 Lv = lp - hp;
      float ld2 = dot(Lv, Lv);
      float ndl = max(dot(nrm, Lv * inversesqrt(ld2)), 0.0) * 0.75 + 0.25;
      float att = 1.0 / (1.0 + ld2 * 0.22);
      vec3 e3 = min(hp - bmin, bmax - hp);
      float ed = which == 0.0 ? min(e3.x, e3.y) : (which == 1.0 ? min(e3.y, e3.z) : (which == 4.0 ? 1.0 : min(e3.x, e3.z)));
      float rao = 0.35 + 0.65 * smoothstep(0.0, 0.8, ed);
      float amb = mix(0.07, 0.006, uNight) * (1.0 + hp.z * 0.12);
      float li = lit * mix(1.6, 2.6, r4) * (isStore > 0.5 ? 0.9 : 1.0) * mix(0.6, 1.0, uNight);
      vec3 rad = alb * rao * (amb + lc * li * att * ndl);
      if (which == 3.0 && isStore < 0.5) rad += lc * li * smoothstep(0.45, 0.1, length(hp.xz - lp.xz)) * 2.5;
      if (which == 3.0 && isStore > 0.5) { vec2 ct = fract(hp.xz * vec2(0.55, 0.8) + 0.25); rad += lc * li * step(0.62, ct.x) * step(0.7, ct.y) * 2.2; }
      // TV glow on some unlit night rooms
      if (lit < 0.5 && r3 > 0.8 && uNight > 0.5) rad += vec3(0.25, 0.4, 0.8) * (0.5 + 0.5 * cH21(wid + floor(vWPos.y))) * 0.15 * rao;
      // blinds and curtains hang at the glass
      float bl = r5 < 0.45 ? r6 * 0.85 : 0.0;
      if (isStore < 0.5 && loc.y > 1.0 - bl) {
        float slat = smoothstep(0.15, 0.35, fract(loc.y * gh * 16.0));
        rad = vec3(0.7, 0.67, 0.6) * (0.45 + 0.55 * slat) * (amb * 1.6 + lc * li * 0.22);
      }
      float cu = (r4 > 0.68 && isStore < 0.5) ? 0.26 : 0.0;
      if (loc.x < cu || loc.x > 1.0 - cu) {
        vec3 cc = vec3(0.45 + 0.4 * r1, 0.22 + 0.3 * r3, 0.18 + 0.3 * r6);
        rad = cc * (0.75 + 0.25 * sin(loc.x * 80.0)) * (amb * 1.4 + lc * li * 0.2);
      }
      float cosv = clamp(-d.z, 0.0, 1.0);
      float F = 0.04 + 0.96 * pow(1.0 - cosv, 5.0);
      cEmit = rad * (1.0 - F) * glass;
      cGlassM = glass;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.006), glass);
      cRough = mix(cRough, 0.04, glass * 0.5);
    }
  }
#endif
#ifdef C_DETAIL
  vec4 cDet = texture2D(tDetail, cDetUV * uDetRep);
  float cDS = uDetStr * (1.0 - cGlassM);
  diffuseColor.rgb *= 1.0 + (cDet.b - 0.5) * 1.2 * cDS;
  cRough = clamp(cRough + (cDet.a - 0.5) * 0.4 * cDS, 0.02, 1.0);
#endif
// world-space macro variation (breaks up tiling over tens of meters)
{
  float m1 = cFbm(cMP * 0.13 + 1.7), m2 = cVN(cMP * 0.9 + 4.1);
  diffuseColor.rgb *= 1.0 + uMacro * ((m1 - 0.5) * 0.42 + (m2 - 0.5) * 0.14);
  cRough = clamp(cRough + uMacro * (m1 - 0.5) * 0.16, 0.02, 1.0);
}
#ifdef C_GRIME
{
  float gn = cFbm(cMP * vec2(1.3, 0.6) + 9.0);
  float g = smoothstep(1.25, 0.0, vWPos.y + (gn - 0.5) * 0.9) * cWallness;
  diffuseColor.rgb *= 1.0 - g * 0.4;
  cRough = mix(cRough, 1.0, g * 0.35);
  float st = cVN(vec2(cMP.x * 2.3, cMP.y * 0.12 + cMP.x * 0.05));
  diffuseColor.rgb *= 1.0 - cWallness * smoothstep(0.6, 0.95, st) * 0.2 * uMacro;
}
#endif
float cWet = 0.0, cPud = 0.0;
if (uWet > 0.5) {
  #ifdef C_GROUND
  if (cUp > 0.9) {
    float pn = cFbm(vWPos.xz * 0.085 + 3.7) + (cVN(vWPos.xz * 2.1) - 0.5) * 0.05 + (1.0 - cAO) * 0.12;
    cPud = smoothstep(uPud, uPud + 0.025, pn);
    cWet = 0.62 + 0.38 * smoothstep(uPud - 0.16, uPud, pn);
  }
  #endif
  #ifdef C_GRIME
  cWet = max(cWet, smoothstep(0.7, 0.0, vWPos.y) * cWallness * 0.85);
  #endif
  float por = 1.0 - cMetal;
  diffuseColor.rgb *= mix(1.0, 0.5, cWet * por);
  cRough = mix(cRough, cRough * 0.35 + 0.05, cWet);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45, cPud);
  cRough = mix(cRough, 0.025, cPud);
}
`;

const GLSL_NORMAL = /* glsl */`
#ifdef USE_NORMALMAP_TANGENTSPACE
  vec3 mapN = texture2D(normalMap, cNUV).xyz * 2.0 - 1.0;
  #ifdef C_ANTITILE
    vec3 cN2 = texture2D(normalMap, cUV2).xyz * 2.0 - 1.0;
    cN2.xy = cN2.xy * mat2(0.8, -0.6, 0.6, 0.8);
    mapN = mix(mapN, cN2, cBl);
  #endif
  #ifdef C_FACADE
    mapN = mix(mapN, cWallNrm, cWallM);
  #endif
  #ifdef C_DETAIL
    mapN.xy += (cDet.xy * 2.0 - 1.0) * cDS * (1.0 - cWet * 0.6);
  #endif
  // standing water and glass are optically flat; damp surfaces lose micro relief
  mapN.xy *= normalScale * (1.0 - cPud) * (1.0 - cGlassM) * (1.0 - cWet * 0.35);
  normal = normalize(tbn * mapN);
#endif
`;

const GLSL_AO = /* glsl */`
#include <aomap_fragment>
{
  float cA = mix(1.0, cAO, uAOI);
  reflectedLight.indirectDiffuse *= cA;
  reflectedLight.directDiffuse *= mix(1.0, cA, 0.5);
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    reflectedLight.indirectSpecular *= computeSpecularOcclusion(saturate(dot(geometryNormal, geometryViewDir)), cA, material.roughness);
  #endif
}
`;

const GLSL_VERT = /* glsl */`
#include <worldpos_vertex>
{
  vec4 cwp = vec4(transformed, 1.0);
  vec3 cwn = objectNormal;
  #ifdef USE_INSTANCING
    cwp = instanceMatrix * cwp;
    cwn = mat3(instanceMatrix) * cwn;
  #endif
  cwp = modelMatrix * cwp;
  vWPos = cwp.xyz;
  vWN = normalize(mat3(modelMatrix) * cwn);
}
`;

function patchShader(shader, U) {
  Object.assign(shader.uniforms, U);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;')
    .replace('#include <worldpos_vertex>', GLSL_VERT);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + GLSL_PARS)
    .replace('#include <map_fragment>', GLSL_MAP)
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(cRough * (0.55 + 0.45 * roughness), 0.02, 1.0);')
    .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * cMetal;')
    .replace('#include <normal_fragment_maps>', GLSL_NORMAL)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += cEmit;')
    .replace('#include <aomap_fragment>', GLSL_AO);
}

const matCache = new Map();
// std({ set, color, rx, ry, rough, metal, normal, emissive, ... })
export function std(o = {}) {
  const key = JSON.stringify({ ...o, set: o.set ? (o.set.id ?? o.set.map.uuid) : null });
  if (matCache.has(key)) return matCache.get(key);
  const rx = o.rx ?? 1, ry = o.ry ?? 1;
  const p = {
    color: o.color ?? 0xffffff,
    roughness: o.rough ?? 0.85,
    metalness: o.metal ?? 0,
  };
  const set = o.set;
  if (set) {
    p.map = rep(set.map, rx, ry);
    if (set.normalMap) { p.normalMap = rep(set.normalMap, rx, ry); p.normalScale = new THREE.Vector2(o.normal ?? 1, o.normal ?? 1); }
    if (set.orm) { p.roughness = 1; p.metalness = set.metal ? 1 : 0; }
    else if (set.roughnessMap && o.useRough !== false) { p.roughnessMap = rep(set.roughnessMap, rx, ry); p.roughness = o.rough ?? 1; }
  }
  if (o.emissive) { p.emissive = new THREE.Color(o.emissive); p.emissiveIntensity = o.emissiveIntensity ?? 1; if (o.emissiveMap) p.emissiveMap = o.emissiveMap; }
  if (o.envI !== undefined) p.envMapIntensity = o.envI;
  if (o.transparent) { p.transparent = true; p.depthWrite = false; }
  if (o.side) p.side = o.side;
  const m = new THREE.MeshStandardMaterial(p);
  if (set && set.orm) {
    const defs = { C_SET: '' };
    const U = { uWet: GU.uWet, uNight: GU.uNight, tORM: { value: set.orm }, uMacro: { value: set.macro ?? 0.8 }, uPud: { value: set.pud ?? 0.6 }, uAOI: { value: 1 } };
    if (set.antitile && BASE >= 1) defs.C_ANTITILE = '';
    if (set.ground) defs.C_GROUND = '';
    if (set.grime && !set.ground) defs.C_GRIME = '';
    const fac = set.facade;
    if (fac) {
      defs.C_FACADE = '';
      const wall = fac.wall;
      Object.assign(U, {
        tWall: { value: wall.map }, tWallN: { value: wall.normalMap }, tWallORM: { value: wall.orm }, uWallScale: { value: wall.tileM || 4 }, uWallLum: { value: Math.max(0.02, wall.lum) },
        uWin: { value: new THREE.Vector4(...fac.win) }, uWinGrid: { value: new THREE.Vector4(...fac.grid) }, uStore: { value: new THREE.Vector4(...fac.store) },
      });
    }
    const dk = fac ? fac.wall.detail : set.detail;
    if (dk && BASE >= 1) {
      defs.C_DETAIL = '';
      const tileM = fac ? 7 : (set.tileM ?? 2);
      U.tDetail = { value: detailTex(dk) };
      U.uDetRep = { value: tileM / ((fac ? fac.wall.detM : set.detM) || 0.6) };
      U.uDetStr = { value: (fac ? fac.wall.detStr : set.detStr) ?? 0.4 };
    }
    m.defines = defs;
    m.onBeforeCompile = (shader) => patchShader(shader, U);
    m.customProgramCacheKey = () => 'cset:' + Object.keys(defs).join(',');
    m.userData.surface = U;
  }
  matCache.set(key, m);
  return m;
}
