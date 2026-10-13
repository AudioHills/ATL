// Minimal collision math: axis-aligned boxes, rays, spheres.

export function box(minX, minY, minZ, maxX, maxY, maxZ, tag) {
  return { minX, minY, minZ, maxX, maxY, maxZ, tag };
}

// Returns distance along a normalized ray to the box, or Infinity.
export function rayBox(ox, oy, oz, dx, dy, dz, b, maxT) {
  let tmin = 0, tmax = maxT;
  if (Math.abs(dx) < 1e-9) { if (ox < b.minX || ox > b.maxX) return Infinity; }
  else {
    const inv = 1 / dx;
    let t1 = (b.minX - ox) * inv, t2 = (b.maxX - ox) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dy) < 1e-9) { if (oy < b.minY || oy > b.maxY) return Infinity; }
  else {
    const inv = 1 / dy;
    let t1 = (b.minY - oy) * inv, t2 = (b.maxY - oy) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < b.minZ || oz > b.maxZ) return Infinity; }
  else {
    const inv = 1 / dz;
    let t1 = (b.minZ - oz) * inv, t2 = (b.maxZ - oz) * inv;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return Infinity;
  const t = tca - Math.sqrt(r * r - d2);
  return t >= 0 && t <= maxT ? t : Infinity;
}

// Normal of the box face hit at point p (for impact decals / bounces).
export function boxNormal(b, px, py, pz) {
  const e = 0.02;
  if (Math.abs(px - b.minX) < e) return [-1, 0, 0];
  if (Math.abs(px - b.maxX) < e) return [1, 0, 0];
  if (Math.abs(py - b.maxY) < e) return [0, 1, 0];
  if (Math.abs(py - b.minY) < e) return [0, -1, 0];
  if (Math.abs(pz - b.minZ) < e) return [0, 0, -1];
  return [0, 0, 1];
}
