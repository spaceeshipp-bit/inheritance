// Line of sight through the grey-box manor: walls, the gallery slab, floors,
// counters, tables, pedestals and the space under the grand staircase block
// sight; railings (thin balusters) do not. Used by the server for everything
// Grandma "sees" (found evidence, who did it, Caught Red-Handed, what her
// snapshot may contain) and by the client's Nana Senses indicator.
import { BOXES, RAMPS, type Box } from './map.js';
import type { Vec3 } from './types.js';

/** Eye height above Grandma's feet. */
export const EYE_HEIGHT = 1.55;
/** A character is "seen" when the ray to their chest is clear. */
export const CHEST_HEIGHT = 1.1;
/** Props are seen at their middle. */
export const PROP_MID = 0.15;

const OCCLUDERS: Box[] = BOXES.filter((b) => b.solid && b.kind !== 'railing');
/** Shrink so points resting on a surface (an item on the floor) are not "inside" it. */
const EPS = 0.02;

/** Does the segment a→b pass through the box (shrunk by EPS)? Slab method. */
function segmentHitsBox(a: Vec3, b: Vec3, box: Box): boolean {
  let t0 = 0, t1 = 1;
  const axes: ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];
  for (const ax of axes) {
    const lo = box.min[ax] + EPS, hi = box.max[ax] - EPS;
    const d = b[ax] - a[ax];
    if (Math.abs(d) < 1e-9) {
      if (a[ax] <= lo || a[ax] >= hi) return false;
      continue;
    }
    let ta = (lo - a[ax]) / d, tb = (hi - a[ax]) / d;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 >= t1) return false;
  }
  return true;
}

/** Is a point inside the solid underside of the staircase? */
function underStairs(p: Vec3): boolean {
  for (const r of RAMPS) {
    if (p.x <= r.minX + EPS || p.x >= r.maxX - EPS) continue;
    const lo = Math.min(r.zStart, r.zEnd), hi = Math.max(r.zStart, r.zEnd);
    if (p.z <= lo || p.z >= hi) continue;
    const t = (p.z - r.zStart) / (r.zEnd - r.zStart);
    const h = r.yStart + t * (r.yEnd - r.yStart);
    if (p.y < h - 0.1 && p.y > r.yStart) return true;
  }
  return false;
}

/** Clear line of sight from `a` to `b` (both world points)? */
export function lineOfSight(a: Vec3, b: Vec3): boolean {
  for (const box of OCCLUDERS) if (segmentHitsBox(a, b, box)) return false;
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  const steps = Math.ceil(len / 0.25);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (underStairs({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })) return false;
  }
  return true;
}

/** Grandma's eye position from her feet. */
export function eyeOf(feet: Vec3): Vec3 {
  return { x: feet.x, y: feet.y + EYE_HEIGHT, z: feet.z };
}

/** A character's chest from their feet. */
export function chestOf(feet: Vec3): Vec3 {
  return { x: feet.x, y: feet.y + CHEST_HEIGHT, z: feet.z };
}
