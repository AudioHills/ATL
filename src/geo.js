// Shared cached rounded-box geometry.
import { RoundedBoxGeometry } from '../lib/addons/geometries/RoundedBoxGeometry.js';

export const geoCache = new Map();
export function rbox(w, h, d, r = 0.04) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r}`;
  let g = geoCache.get(key);
  if (!g) { g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)); geoCache.set(key, g); }
  return g;
}
