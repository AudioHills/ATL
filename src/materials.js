// Physically based surface sets generated at load time: color, normal and roughness maps
// painted together so details (mortar, window recesses, puddles) line up across all three.
import * as THREE from 'three';

const cache = new Map();

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Two canvases drawn in lockstep: color (c) and height (h). Roughness is optional (r).
function surface(w, h, withRough) {
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const c = mk(), hc = mk(), rc = withRough ? mk() : null;
  const g = c.getContext('2d'), hg = hc.getContext('2d'), rg = rc ? rc.getContext('2d') : null;
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, w, h);
  if (rg) { rg.fillStyle = '#d0d0d0'; rg.fillRect(0, 0, w, h); }
  return { c, hc, rc, g, hg, rg, w, h };
}

function grain(ctx, w, h, amt, r, mono = true) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amt;
    d[i] += n; d[i + 1] += mono ? n : (r() - 0.5) * amt; d[i + 2] += mono ? n : (r() - 0.5) * amt;
  }
  ctx.putImageData(img, 0, 0);
}

// Soft value noise blotches, painted as translucent ellipses.
function blotches(ctx, w, h, n, r, color, alpha, size) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = color.replace('A', (r() * alpha).toFixed(3));
    ctx.beginPath();
    ctx.ellipse(r() * w, r() * h, r() * size + size * 0.2, r() * size * 0.6 + size * 0.1, r() * 3, 0, 7);
    ctx.fill();
  }
}

function heightToNormal(hc, strength) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const og = out.getContext('2d');
  const img = og.createImageData(w, h), d = img.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
    const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    let nx = -dx, ny = dy, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  return out;
}

function tex(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

function finish(key, s, strength, extra = {}) {
  const set = {
    map: tex(s.c, true),
    normalMap: tex(heightToNormal(s.hc, strength), false),
    roughnessMap: s.rc ? tex(s.rc, false) : null,
    height: s.hc,
    ...extra,
  };
  cache.set(key, set);
  return set;
}

function cached(key, make) { return cache.get(key) || make(); }

// ---------------- surfaces ----------------

export function asphaltSet(wet) {
  return cached('asphalt' + wet, () => {
    const s = surface(512, 512, true), r = rng(3);
    const { g, hg, rg, w, h } = s;
    g.fillStyle = '#2e2e30'; g.fillRect(0, 0, w, h);
    // aggregate
    for (let i = 0; i < 9000; i++) {
      const x = r() * w, y = r() * h, sz = r() * 2 + 0.6, v = 30 + r() * 50;
      g.fillStyle = `rgb(${v},${v},${v + 2})`; g.fillRect(x, y, sz, sz);
      hg.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.4})`; hg.fillRect(x, y, sz, sz);
    }
    blotches(g, w, h, 30, r, 'rgba(0,0,0,A)', 0.25, 90);
    blotches(g, w, h, 12, r, 'rgba(110,105,100,A)', 0.1, 70);
    // patched sections and cracks
    for (let i = 0; i < 3; i++) {
      const x = r() * w, y = r() * h, pw = 60 + r() * 120, ph = 40 + r() * 80;
      g.fillStyle = 'rgba(20,20,22,0.45)'; g.fillRect(x, y, pw, ph);
      hg.fillStyle = 'rgba(160,160,160,0.5)'; hg.fillRect(x, y, pw, ph);
    }
    g.lineCap = hg.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      let x = r() * w, y = r() * h;
      g.beginPath(); hg.beginPath(); g.moveTo(x, y); hg.moveTo(x, y);
      for (let k = 0; k < 10; k++) { x += (r() - 0.5) * 34; y += (r() - 0.5) * 34; g.lineTo(x, y); hg.lineTo(x, y); }
      g.strokeStyle = 'rgba(10,10,10,0.8)'; g.lineWidth = 1.6; g.stroke();
      hg.strokeStyle = '#202020'; hg.lineWidth = 2.5; hg.stroke();
    }
    // oil stains
    blotches(g, w, h, 8, r, 'rgba(5,5,10,A)', 0.4, 30);
    grain(g, w, h, 14, r);
    grain(hg, w, h, 40, r);
    // roughness: puddles are mirror-smooth when wet
    rg.fillStyle = '#c8c8c8'; rg.fillRect(0, 0, w, h);
    if (wet) {
      for (let i = 0; i < 14; i++) {
        const x = r() * w, y = r() * h, rx = 20 + r() * 70, ry = 12 + r() * 40, a = r() * 3;
        const grd = rg.createRadialGradient(x, y, 0, x, y, rx);
        grd.addColorStop(0, '#0a0a0a'); grd.addColorStop(0.7, '#202020'); grd.addColorStop(1, 'rgba(200,200,200,0)');
        rg.fillStyle = grd; rg.beginPath(); rg.ellipse(x, y, rx, ry, a, 0, 7); rg.fill();
        g.fillStyle = 'rgba(8,8,12,0.35)'; g.beginPath(); g.ellipse(x, y, rx * 0.9, ry * 0.9, a, 0, 7); g.fill();
        hg.fillStyle = 'rgba(128,128,128,0.9)'; hg.beginPath(); hg.ellipse(x, y, rx * 0.8, ry * 0.8, a, 0, 7); hg.fill();
      }
      grain(rg, w, h, 30, r);
    } else grain(rg, w, h, 40, r);
    return finish('asphalt' + wet, s, 3);
  });
}

export function roadSet(wet) {
  return cached('road' + wet, () => {
    const base = asphaltSet(wet);
    const s = surface(256, 1024, true), r = rng(4);
    const { g, hg, rg, w, h } = s;
    for (let y = 0; y < h; y += 512) { g.drawImage(base.map.image, 0, y, 256, 512); rg.drawImage(base.roughnessMap.image, 0, y, 256, 512); }
    hg.drawImage(base.map.image, 0, 0, 256, 1024);
    // worn double yellow
    for (const x of [w / 2 - 5, w / 2 + 2]) {
      for (let y = 0; y < h; y += 1) {
        g.fillStyle = `rgba(214,170,50,${r() < 0.06 ? 0.25 : 0.7 + r() * 0.25})`; g.fillRect(x, y, 3, 1);
      }
      rg.fillStyle = '#909090'; rg.fillRect(x, 0, 3, h);
      hg.fillStyle = 'rgba(200,200,200,0.5)'; hg.fillRect(x, 0, 3, h);
    }
    // tire tracks
    for (const x of [40, 210]) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x - 14, 0, 28, h); rg.fillStyle = 'rgba(150,150,150,0.25)'; rg.fillRect(x - 14, 0, 28, h); }
    return finish('road' + wet, s, 2.5);
  });
}

export function sidewalkSet() {
  return cached('sidewalk', () => {
    const s = surface(512, 512, true), r = rng(5);
    const { g, hg, rg, w, h } = s;
    g.fillStyle = '#9b978f'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 40, r, 'rgba(60,55,50,A)', 0.12, 80);
    blotches(g, w, h, 30, r, 'rgba(255,255,250,A)', 0.06, 60);
    // gum spots and stains
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(40,40,40,${r() * 0.35})`; g.beginPath(); g.arc(r() * w, r() * h, r() * 3 + 1, 0, 7); g.fill(); }
    grain(g, w, h, 22, r);
    grain(hg, w, h, 50, r);
    // expansion joints
    for (const v of [0, w / 2]) {
      g.fillStyle = 'rgba(40,38,35,0.8)'; g.fillRect(v, 0, 3, h); g.fillRect(0, v, w, 3);
      hg.fillStyle = '#202020'; hg.fillRect(v, 0, 4, h); hg.fillRect(0, v, w, 4);
    }
    for (let i = 0; i < 4; i++) {
      let x = r() * w, y = r() * h; hg.beginPath(); g.beginPath(); hg.moveTo(x, y); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; hg.lineTo(x, y); g.lineTo(x, y); }
      hg.strokeStyle = '#303030'; hg.lineWidth = 2; hg.stroke(); g.strokeStyle = 'rgba(30,30,30,0.6)'; g.lineWidth = 1; g.stroke();
    }
    grain(rg, w, h, 40, r);
    return finish('sidewalk', s, 3);
  });
}

export function concreteSet(color = '#8c8984', key = '') {
  return cached('concrete' + color + key, () => {
    const s = surface(512, 512, true), r = rng(11 + key.length);
    const { g, hg, rg, w, h } = s;
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 60, r, 'rgba(0,0,0,A)', 0.09, 90);
    blotches(g, w, h, 30, r, 'rgba(255,255,255,A)', 0.05, 70);
    // water streaks
    for (let i = 0; i < 25; i++) {
      const x = r() * w, len = 60 + r() * 200;
      const grd = g.createLinearGradient(x, 0, x, len);
      grd.addColorStop(0, 'rgba(30,25,20,0.18)'); grd.addColorStop(1, 'rgba(30,25,20,0)');
      g.fillStyle = grd; g.fillRect(x, 0, 3 + r() * 8, len);
    }
    // form-tie holes
    for (let y = 64; y < h; y += 128) for (let x = 64; x < w; x += 128) {
      g.fillStyle = 'rgba(40,40,40,0.5)'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
      hg.fillStyle = '#303030'; hg.beginPath(); hg.arc(x, y, 5, 0, 7); hg.fill();
    }
    grain(g, w, h, 18, r);
    grain(hg, w, h, 60, r);
    grain(rg, w, h, 30, r);
    return finish('concrete' + color + key, s, 2.5);
  });
}

export function brickSet(color = '#8a3b2a') {
  return cached('brick' + color, () => {
    const s = surface(512, 512, true), r = rng(7);
    const { g, hg, rg, w, h } = s;
    g.fillStyle = '#6d655c'; g.fillRect(0, 0, w, h);
    hg.fillStyle = '#383838'; hg.fillRect(0, 0, w, h);
    const bh = 22, bw = 64;
    for (let y = 0; y < h; y += bh) {
      const off = (y / bh) % 2 ? bw / 2 : 0;
      for (let x = -bw; x < w + bw; x += bw) {
        const c = new THREE.Color(color);
        c.offsetHSL((r() - 0.5) * 0.02, (r() - 0.5) * 0.15, (r() - 0.5) * 0.14);
        g.fillStyle = '#' + c.getHexString();
        g.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
        hg.fillStyle = `rgb(${190 + r() * 40},${190},${190})`;
        hg.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
        // chipped corners
        if (r() < 0.2) { g.fillStyle = 'rgba(80,70,60,0.7)'; g.fillRect(x + off + 2 + r() * (bw - 10), y + 2, 6, 4); }
      }
    }
    blotches(g, w, h, 25, r, 'rgba(20,15,10,A)', 0.18, 90);
    blotches(g, w, h, 12, r, 'rgba(230,225,210,A)', 0.08, 60);
    grain(g, w, h, 26, r);
    grain(hg, w, h, 50, r);
    grain(rg, w, h, 30, r);
    return finish('brick' + color, s, 4);
  });
}

export function metalSet(color = '#6b7077', kind = 'painted') {
  return cached('metal' + color + kind, () => {
    const s = surface(256, 256, true), r = rng(15 + kind.length);
    const { g, hg, rg, w, h } = s;
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    if (kind === 'corrugated') {
      for (let x = 0; x < w; x++) {
        const v = Math.sin(x / w * Math.PI * 16);
        hg.fillStyle = `rgb(${128 + v * 110},128,128)`; hg.fillRect(x, 0, 1, h);
        g.fillStyle = `rgba(0,0,0,${0.08 + (v < 0 ? -v * 0.15 : 0)})`; g.fillRect(x, 0, 1, h);
      }
    }
    // rust and chipped paint
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = r() * h, rr = r() * 14 + 2;
      const grd = g.createRadialGradient(x, y, 0, x, y, rr);
      grd.addColorStop(0, 'rgba(110,55,20,0.75)'); grd.addColorStop(1, 'rgba(110,55,20,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
      rg.fillStyle = 'rgba(255,255,255,0.6)'; rg.beginPath(); rg.arc(x, y, rr * 0.7, 0, 7); rg.fill();
    }
    for (let i = 0; i < 14; i++) {
      const x = r() * w, len = 30 + r() * 90;
      const grd = g.createLinearGradient(x, h * r(), x, h);
      grd.addColorStop(0, 'rgba(90,45,15,0.25)'); grd.addColorStop(1, 'rgba(90,45,15,0)');
      g.fillStyle = grd; g.fillRect(x, 0, 2 + r() * 4, len + h * 0.5);
    }
    grain(g, w, h, 14, r);
    grain(hg, w, h, 16, r);
    rg.globalCompositeOperation = 'source-over';
    grain(rg, w, h, 40, r);
    return finish('metal' + color + kind, s, kind === 'corrugated' ? 6 : 1.5);
  });
}

export function woodSet(color = '#7a4a26', key = 'wood') {
  return cached(key + color, () => {
    const s = surface(256, 256, true), r = rng(23);
    const { g, hg, rg, w, h } = s;
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      const v = Math.sin(y * 0.35 + Math.sin(y * 0.05) * 4) * 0.5 + 0.5;
      g.fillStyle = `rgba(30,15,5,${v * 0.25})`; g.fillRect(0, y, w, 1);
      hg.fillStyle = `rgb(${110 + v * 40},128,128)`; hg.fillRect(0, y, w, 1);
    }
    // planks
    for (let y = 0; y < h; y += 64) { g.fillStyle = 'rgba(20,10,5,0.7)'; g.fillRect(0, y, w, 2); hg.fillStyle = '#202020'; hg.fillRect(0, y, w, 3); }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(40,20,8,0.4)'; g.beginPath(); g.ellipse(r() * w, r() * h, 8, 3, 0, 0, 7); g.fill(); }
    grain(g, w, h, 12, r);
    grain(rg, w, h, 25, r);
    return finish(key + color, s, 2);
  });
}

export function fabricSet(color, kind = 'cotton') {
  return cached('fabric' + color + kind, () => {
    const s = surface(128, 128, false), r = rng(31);
    const { g, hg, w, h } = s;
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    if (kind === 'denim') {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x += 2) {
        const d = ((x + y) % 4) < 2;
        g.fillStyle = d ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)'; g.fillRect(x, y, 2, 1);
        hg.fillStyle = d ? '#a0a0a0' : '#606060'; hg.fillRect(x, y, 2, 1);
      }
      blotches(g, w, h, 6, r, 'rgba(255,255,255,A)', 0.1, 30);
    } else {
      for (let y = 0; y < h; y += 2) { hg.fillStyle = '#909090'; hg.fillRect(0, y, w, 1); }
      for (let x = 0; x < w; x += 2) { hg.fillStyle = 'rgba(100,100,100,0.5)'; hg.fillRect(x, 0, 1, h); }
    }
    grain(g, w, h, 10, r);
    return finish('fabric' + color + kind, s, 1.2);
  });
}

export function tileSet(color = '#bdb7aa', size = 32) {
  return cached('tile' + color + size, () => {
    const s = surface(512, 512, true), r = rng(13);
    const { g, hg, rg, w, h } = s;
    g.fillStyle = '#4a4744'; g.fillRect(0, 0, w, h);
    hg.fillStyle = '#303030'; hg.fillRect(0, 0, w, h);
    rg.fillStyle = '#e0e0e0'; rg.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += size) for (let x = 0; x < w; x += size) {
      const c = new THREE.Color(color); c.offsetHSL(0, 0, (r() - 0.5) * 0.06);
      g.fillStyle = '#' + c.getHexString(); g.fillRect(x + 1.5, y + 1.5, size - 3, size - 3);
      hg.fillStyle = '#c0c0c0'; hg.fillRect(x + 1.5, y + 1.5, size - 3, size - 3);
      const rv = (90 + r() * 60) | 0;
      rg.fillStyle = `rgb(${rv},${rv},${rv})`;
      rg.fillRect(x + 1.5, y + 1.5, size - 3, size - 3);
    }
    blotches(g, w, h, 30, r, 'rgba(40,30,20,A)', 0.12, 70);
    grain(g, w, h, 10, r);
    return finish('tile' + color + size, s, 2);
  });
}

export function wallTileSet(color = '#d9c38a') {
  return cached('walltile' + color, () => {
    const s = surface(512, 512, true), r = rng(14);
    const { g, hg, rg, w, h } = s;
    g.fillStyle = '#7a705a'; g.fillRect(0, 0, w, h); hg.fillStyle = '#404040'; hg.fillRect(0, 0, w, h);
    rg.fillStyle = '#e0e0e0'; rg.fillRect(0, 0, w, h);
    const th = 24, tw = 48;
    for (let y = 0; y < h; y += th) {
      const off = (y / th) % 2 ? tw / 2 : 0;
      for (let x = -tw; x < w + tw; x += tw) {
        const c = new THREE.Color(y > h * 0.6 && y < h * 0.66 ? '#b23a2a' : color); c.offsetHSL(0, 0, (r() - 0.5) * 0.05);
        g.fillStyle = '#' + c.getHexString(); g.fillRect(x + off + 1.5, y + 1.5, tw - 3, th - 3);
        hg.fillStyle = '#c8c8c8'; hg.fillRect(x + off + 1.5, y + 1.5, tw - 3, th - 3);
        rg.fillStyle = '#3a3a3a'; rg.fillRect(x + off + 1.5, y + 1.5, tw - 3, th - 3);
      }
    }
    blotches(g, w, h, 25, r, 'rgba(50,40,20,A)', 0.12, 80);
    grain(g, w, h, 10, r);
    return finish('walltile' + color, s, 3);
  });
}

export function dirtSet() {
  return cached('dirt', () => {
    const s = surface(512, 512, true), r = rng(9);
    const { g, hg, rg, w, h } = s;
    g.fillStyle = '#5e4c38'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 50, r, 'rgba(30,22,15,A)', 0.25, 80);
    blotches(g, w, h, 30, r, 'rgba(140,120,90,A)', 0.15, 60);
    for (let i = 0; i < 4000; i++) {
      const x = r() * w, y = r() * h, sz = r() * 3 + 1, v = r();
      g.fillStyle = v < 0.5 ? 'rgba(30,22,15,0.5)' : 'rgba(150,130,100,0.5)'; g.fillRect(x, y, sz, sz);
      hg.fillStyle = `rgba(255,255,255,${v * 0.5})`; hg.fillRect(x, y, sz, sz);
    }
    // tire ruts
    for (let i = 0; i < 3; i++) { const y = r() * h; hg.fillStyle = 'rgba(40,40,40,0.4)'; hg.fillRect(0, y, w, 14); g.fillStyle = 'rgba(20,15,10,0.15)'; g.fillRect(0, y, w, 14); }
    grain(g, w, h, 20, r); grain(hg, w, h, 60, r); grain(rg, w, h, 20, r);
    return finish('dirt', s, 3);
  });
}

export function grassSet() {
  return cached('grass', () => {
    const s = surface(512, 512, true), r = rng(10);
    const { g, hg, rg, w, h } = s;
    g.fillStyle = '#3e5328'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 30, r, 'rgba(90,70,40,A)', 0.35, 50);
    for (let i = 0; i < 14000; i++) {
      const x = r() * w, y = r() * h, l = r() * 6 + 2;
      g.fillStyle = `rgba(${50 + r() * 70},${80 + r() * 70},${25 + r() * 30},0.7)`; g.fillRect(x, y, 1.2, l);
      hg.fillStyle = `rgba(255,255,255,${r() * 0.6})`; hg.fillRect(x, y, 1.2, l);
    }
    grain(rg, w, h, 20, r);
    return finish('grass', s, 2.5);
  });
}

export function courtSet() {
  return cached('court', () => {
    const s = surface(512, 1024, true), r = rng(12);
    const { g, hg, rg, w, h } = s;
    g.fillStyle = '#2d5872'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, 40, r, 'rgba(0,0,0,A)', 0.12, 90);
    blotches(g, w, h, 20, r, 'rgba(255,255,255,A)', 0.06, 70);
    g.strokeStyle = 'rgba(235,235,230,0.9)'; g.lineWidth = 6;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.beginPath(); g.moveTo(14, h / 2); g.lineTo(w - 14, h / 2); g.stroke();
    g.beginPath(); g.arc(w / 2, h / 2, 60, 0, 7); g.stroke();
    g.beginPath(); g.arc(w / 2, 14, 210, 0, Math.PI); g.stroke();
    g.beginPath(); g.arc(w / 2, h - 14, 210, Math.PI, 0); g.stroke();
    g.strokeRect(w / 2 - 60, 14, 120, 180); g.strokeRect(w / 2 - 60, h - 194, 120, 180);
    g.fillStyle = 'rgba(255,140,30,0.75)'; g.font = '900 110px Impact, sans-serif'; g.textAlign = 'center';
    g.fillText('Z6', w / 2, h / 2 + 38);
    grain(g, w, h, 16, r); grain(hg, w, h, 30, r);
    rg.fillStyle = '#a0a0a0'; rg.fillRect(0, 0, w, h); grain(rg, w, h, 30, r);
    const set = finish('court', s, 1.5);
    for (const k of ['map', 'normalMap', 'roughnessMap']) set[k].wrapS = set[k].wrapT = THREE.ClampToEdgeWrapping;
    return set;
  });
}

// Building facade: brick or stucco wall with real-looking windows (frames, sills, blinds,
// interiors) and an optional storefront. Height map recesses the glass; roughness map makes
// it glossy so it picks up sky and city-light reflections.
export function facadeSet(wallColor, seed, opts = {}) {
  const key = `facade${wallColor}${seed}${opts.brick ? 'b' : ''}${opts.store ? 's' : ''}${opts.tag ? 't' : ''}${opts.night ? 'n' : ''}`;
  return cached(key, () => {
    const s = surface(512, 1024, true), r = rng(seed);
    const { g, hg, rg, w, h } = s;
    if (opts.brick) {
      const b = brickSet(wallColor);
      g.drawImage(b.map.image, 0, 0); g.drawImage(b.map.image, 0, 512);
      // reuse the brick relief for the height map
      hg.drawImage(b.height, 0, 0); hg.drawImage(b.height, 0, 512);
      rg.fillStyle = '#d8d8d8'; rg.fillRect(0, 0, w, h);
    } else {
      g.fillStyle = wallColor; g.fillRect(0, 0, w, h);
      blotches(g, w, h, 50, r, 'rgba(0,0,0,A)', 0.08, 120);
      grain(g, w, h, 18, r);
      grain(hg, w, h, 30, r);
      rg.fillStyle = '#e0e0e0'; rg.fillRect(0, 0, w, h);
    }
    const storeH = opts.store ? 300 : 0;
    const rows = 3, cols = 2;
    const top = 40, usable = h - top - storeH - 40;
    const cellH = usable / rows, cellW = w / cols;
    // floor bands
    for (let i = 1; i <= rows; i++) {
      const y = top + i * cellH - 8;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, w, 10);
      hg.fillStyle = '#b0b0b0'; hg.fillRect(0, y - 2, w, 10);
    }
    for (let yi = 0; yi < rows; yi++) for (let xi = 0; xi < cols; xi++) {
      const wx = xi * cellW + 46, wy = top + yi * cellH + 34, ww = cellW - 92, wh = cellH - 80;
      const lit = r() < (opts.lit ?? (opts.night ? 0.45 : 0.15));
      const boarded = !lit && r() < 0.08;
      // lintel + frame
      g.fillStyle = 'rgba(40,36,32,0.9)'; g.fillRect(wx - 10, wy - 14, ww + 20, 12);
      hg.fillStyle = '#d0d0d0'; hg.fillRect(wx - 10, wy - 14, ww + 20, 12);
      g.fillStyle = '#d9d4c8'; g.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
      hg.fillStyle = '#a8a8a8'; hg.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
      if (boarded) {
        const wb = woodSet('#7a5a3a', 'board');
        g.drawImage(wb.map.image, 0, 0, 120, 120, wx, wy, ww, wh);
        hg.fillStyle = '#9a9a9a'; hg.fillRect(wx, wy, ww, wh);
      } else {
        // glass with interior
        const grd = g.createLinearGradient(wx, wy, wx, wy + wh);
        if (lit) {
          const warm = r() < 0.65;
          grd.addColorStop(0, warm ? '#ffe2a8' : '#cfe4ff'); grd.addColorStop(1, warm ? '#b8803a' : '#6a88b0');
        } else {
          grd.addColorStop(0, '#2a3440'); grd.addColorStop(1, '#0d1116');
        }
        g.fillStyle = grd; g.fillRect(wx, wy, ww, wh);
        // blinds / curtains
        const blind = r();
        if (blind < 0.4) {
          const bh = wh * (0.2 + r() * 0.6);
          for (let y = wy; y < wy + bh; y += 5) { g.fillStyle = lit ? 'rgba(255,240,210,0.85)' : 'rgba(170,165,150,0.8)'; g.fillRect(wx, y, ww, 3.5); }
        } else if (blind < 0.6) {
          g.fillStyle = lit ? 'rgba(170,40,40,0.6)' : 'rgba(90,30,30,0.6)'; g.fillRect(wx, wy, ww * 0.35, wh); g.fillRect(wx + ww * 0.65, wy, ww * 0.35, wh);
        }
        // reflection streak
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.moveTo(wx + ww * 0.2, wy); g.lineTo(wx + ww * 0.5, wy); g.lineTo(wx + ww * 0.2, wy + wh); g.lineTo(wx, wy + wh); g.closePath(); g.fill();
        hg.fillStyle = '#1a1a1a'; hg.fillRect(wx, wy, ww, wh);
        rg.fillStyle = '#141414'; rg.fillRect(wx, wy, ww, wh);
        // mullions
        g.fillStyle = '#cfc9bc'; g.fillRect(wx + ww / 2 - 3, wy, 6, wh); g.fillRect(wx, wy + wh * 0.45, ww, 6);
        hg.fillStyle = '#909090'; hg.fillRect(wx + ww / 2 - 3, wy, 6, wh); hg.fillRect(wx, wy + wh * 0.45, ww, 6);
        rg.fillStyle = '#c0c0c0'; rg.fillRect(wx + ww / 2 - 3, wy, 6, wh); rg.fillRect(wx, wy + wh * 0.45, ww, 6);
        // window AC unit
        if (r() < 0.18) {
          const ax = wx + ww * 0.15, ay = wy + wh * 0.55;
          g.fillStyle = '#c7c3b8'; g.fillRect(ax, ay, ww * 0.45, wh * 0.3);
          for (let y = ay + 4; y < ay + wh * 0.3; y += 4) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(ax + 4, y, ww * 0.45 - 8, 1.5); }
          hg.fillStyle = '#e0e0e0'; hg.fillRect(ax, ay, ww * 0.45, wh * 0.3);
          rg.fillStyle = '#b0b0b0'; rg.fillRect(ax, ay, ww * 0.45, wh * 0.3);
        }
      }
      // sill + drip stain
      g.fillStyle = '#bdb6a8'; g.fillRect(wx - 12, wy + wh + 5, ww + 24, 10);
      hg.fillStyle = '#f0f0f0'; hg.fillRect(wx - 12, wy + wh + 5, ww + 24, 10);
      const grd2 = g.createLinearGradient(0, wy + wh + 15, 0, wy + wh + 80);
      grd2.addColorStop(0, 'rgba(20,15,10,0.35)'); grd2.addColorStop(1, 'rgba(20,15,10,0)');
      g.fillStyle = grd2; g.fillRect(wx - 6, wy + wh + 15, ww + 12, 65);
    }
    // cornice
    g.fillStyle = 'rgba(30,28,25,0.85)'; g.fillRect(0, 0, w, 22); hg.fillStyle = '#f0f0f0'; hg.fillRect(0, 4, w, 14);
    if (opts.store) {
      const sy = h - storeH;
      g.fillStyle = '#1b1b1d'; g.fillRect(0, sy, w, storeH);
      hg.fillStyle = '#a0a0a0'; hg.fillRect(0, sy, w, storeH);
      // display window
      const lit = r() < 0.8;
      const grd = g.createLinearGradient(0, sy + 40, 0, h - 20);
      grd.addColorStop(0, lit ? '#fff1c8' : '#2a3038'); grd.addColorStop(1, lit ? '#c99a52' : '#0e1014');
      g.fillStyle = grd; g.fillRect(24, sy + 40, w * 0.58, storeH - 70);
      // shelves and goods
      if (lit) for (let y = sy + 70; y < h - 40; y += 42) {
        g.fillStyle = 'rgba(60,40,20,0.8)'; g.fillRect(24, y, w * 0.58, 4);
        for (let x = 30; x < 24 + w * 0.58 - 10; x += 9 + r() * 6) {
          g.fillStyle = `hsl(${r() * 360},60%,${40 + r() * 20}%)`; g.fillRect(x, y - 12 - r() * 12, 6, 12 + r() * 12);
        }
      }
      // window posters
      for (let i = 0; i < 2; i++) {
        g.fillStyle = ['#ffeb3b', '#e53935', '#ffffff', '#43a047'][Math.floor(r() * 4)];
        g.fillRect(40 + i * 120, sy + 60 + r() * 40, 70, 90);
        g.fillStyle = '#111'; g.font = 'bold 16px Arial'; g.fillText(['EBT', 'ATM', 'LOTTO', 'ICE', 'OPEN'][Math.floor(r() * 5)], 48 + i * 120, sy + 110);
      }
      hg.fillStyle = '#1a1a1a'; hg.fillRect(24, sy + 40, w * 0.58, storeH - 70);
      rg.fillStyle = '#101010'; rg.fillRect(24, sy + 40, w * 0.58, storeH - 70);
      // security gate / door
      const dx = w * 0.68, dw = w * 0.26;
      g.fillStyle = '#4a4c50'; g.fillRect(dx, sy + 30, dw, storeH - 30);
      for (let y = sy + 34; y < h; y += 7) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(dx, y, dw, 2); hg.fillStyle = '#505050'; hg.fillRect(dx, y, dw, 3); }
      rg.fillStyle = '#707070'; rg.fillRect(dx, sy + 30, dw, storeH - 30);
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, sy, w, 10);
    }
    // ground grime
    const grd3 = g.createLinearGradient(0, h - 160, 0, h);
    grd3.addColorStop(0, 'rgba(20,15,10,0)'); grd3.addColorStop(1, 'rgba(20,15,10,0.45)');
    g.fillStyle = grd3; g.fillRect(0, h - 160, w, 160);
    return finish(key, s, 4);
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
    const set = { map: t };
    cache.set('blob', set);
    return set;
  }).map;
}

export function bulletHole() {
  return cached('hole', () => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), r = rng(77);
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.18, 'rgba(10,10,10,0.95)'); grd.addColorStop(0.35, 'rgba(60,55,50,0.6)'); grd.addColorStop(1, 'rgba(60,55,50,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(20,20,20,0.6)'; g.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * (10 + r() * 14), 32 + Math.sin(a) * (10 + r() * 14)); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const set = { map: t };
    cache.set('hole', set);
    return set;
  }).map;
}

// ---------------- material factory ----------------

const repCache = new Map();
function rep(t, rx, ry) {
  if (!t) return null;
  const key = t.uuid + ':' + rx.toFixed(3) + ':' + ry.toFixed(3);
  let c = repCache.get(key);
  if (!c) { c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; repCache.set(key, c); }
  return c;
}

const matCache = new Map();
// std({ set, color, rx, ry, rough, metal, normal, emissive, ... })
export function std(o = {}) {
  const key = JSON.stringify({ ...o, set: o.set ? o.set.map.uuid : null });
  if (matCache.has(key)) return matCache.get(key);
  const rx = o.rx ?? 1, ry = o.ry ?? 1;
  const p = {
    color: o.color ?? 0xffffff,
    roughness: o.rough ?? 0.85,
    metalness: o.metal ?? 0,
  };
  if (o.set) {
    p.map = rep(o.set.map, rx, ry);
    if (o.set.normalMap) { p.normalMap = rep(o.set.normalMap, rx, ry); p.normalScale = new THREE.Vector2(o.normal ?? 1, o.normal ?? 1); }
    if (o.set.roughnessMap && o.useRough !== false) { p.roughnessMap = rep(o.set.roughnessMap, rx, ry); p.roughness = o.rough ?? 1; }
  }
  if (o.emissive) { p.emissive = new THREE.Color(o.emissive); p.emissiveIntensity = o.emissiveIntensity ?? 1; if (o.emissiveMap) p.emissiveMap = o.emissiveMap; }
  if (o.envI !== undefined) p.envMapIntensity = o.envI;
  if (o.transparent) { p.transparent = true; p.depthWrite = false; }
  if (o.side) p.side = o.side;
  const m = new THREE.MeshStandardMaterial(p);
  matCache.set(key, m);
  return m;
}
