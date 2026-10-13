// A* over the world's walkability grid, with line-of-sight path smoothing.

class Heap {
  constructor() { this.a = []; }
  push(n, f) { const a = this.a; a.push([n, f]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][1] <= a[i][1]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l][1] < a[m][1]) m = l; if (r < a.length && a[r][1] < a[m][1]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top[0];
  }
  get size() { return this.a.length; }
}

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

export function findPath(world, sx, sz, tx, tz) {
  const [si, sj] = world.nearestWalkable(sx, sz);
  const [ti, tj] = world.nearestWalkable(tx, tz);
  const W = world.gw, N = W * world.gh;
  if (!world._g || world._g.length !== N) {
    world._g = new Float32Array(N); world._from = new Int32Array(N); world._stamp = new Uint32Array(N); world._closed = new Uint32Array(N); world._run = 0;
  }
  const g = world._g, from = world._from, stamp = world._stamp, closed = world._closed;
  const run = ++world._run;
  const start = sj * W + si, goal = tj * W + ti;
  const h = (i, j) => { const dx = Math.abs(i - ti), dz = Math.abs(j - tj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const open = new Heap();
  g[start] = 0; stamp[start] = run; from[start] = -1;
  open.push(start, h(si, sj));
  let found = false, iter = 0;
  while (open.size && iter++ < 9000) {
    const cur = open.pop();
    if (closed[cur] === run) continue;
    closed[cur] = run;
    if (cur === goal) { found = true; break; }
    const ci = cur % W, cj = (cur / W) | 0;
    for (const [di, dj, cost] of DIRS) {
      const ni = ci + di, nj = cj + dj;
      if (!world.walkable(ni, nj)) continue;
      if (di && dj && (!world.walkable(ci + di, cj) || !world.walkable(ci, cj + dj))) continue;
      const n = nj * W + ni;
      if (closed[n] === run) continue;
      const ng = g[cur] + cost;
      if (stamp[n] !== run || ng < g[n]) {
        stamp[n] = run; g[n] = ng; from[n] = cur;
        open.push(n, ng + h(ni, nj));
      }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let c = goal; c !== -1; c = from[c]) cells.push(c);
  cells.reverse();
  // smooth: keep a cell only if we can't walk straight past it
  const pts = cells.map((c) => world.cellCenter(c % W, (c / W) | 0));
  const out = [];
  let anchor = 0;
  for (let k = 2; k < pts.length; k++) {
    if (!gridLine(world, pts[anchor], pts[k])) { out.push(pts[k - 1]); anchor = k - 1; }
  }
  out.push([tx, tz]);
  if (!world.walkable(...world.cellOf(tx, tz))) out[out.length - 1] = pts[pts.length - 1];
  return out;
}

export function gridLine(world, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const steps = Math.ceil(Math.hypot(dx, dz) / (world.cs * 0.4));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const [i, j] = world.cellOf(a[0] + dx * t, a[1] + dz * t);
    if (!world.walkable(i, j)) return false;
  }
  return true;
}
