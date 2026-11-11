// Bot navigation on the grey-box manor: a small hand-placed waypoint graph per
// floor (ground, gallery) joined by the grand staircase, line-of-sight checks
// against the map boxes inflated by the body radius, and Dijkstra.
import { BOXES, RAMPS } from '../shared/map.js';
import { CHAR_SHAPE } from '../shared/movement.js';
import type { Vec3 } from '../shared/types.js';

export type Level = 'ground' | 'ramp' | 'gallery';

interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

const MARGIN = CHAR_SHAPE.radius + 0.05;
const RAMP = RAMPS[0];

function inflate(r: Rect, m: number): Rect {
  return { minX: r.minX - m, maxX: r.maxX + m, minZ: r.minZ - m, maxZ: r.maxZ + m };
}

/** Obstacles for someone standing on a floor at height `y`. */
function obstaclesFor(y: number): Rect[] {
  const out: Rect[] = [];
  for (const b of BOXES) {
    if (!b.solid && b.kind !== 'railing') continue;
    if (b.max.y > y + CHAR_SHAPE.stepUp && b.min.y < y + CHAR_SHAPE.height) {
      out.push(inflate({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z }, MARGIN));
    }
  }
  if (y < 1) {
    // The staircase is a wall from the ground (except its first step).
    out.push(inflate({ minX: RAMP.minX - 0.1, maxX: RAMP.maxX + 0.1, minZ: RAMP.zEnd, maxZ: RAMP.zStart - 0.9 }, MARGIN));
  } else {
    // From the gallery, everything beyond the railing line is a drop.
    out.push({ minX: -9, maxX: RAMP.minX - 0.05, minZ: -7.95, maxZ: 7 });
    out.push({ minX: RAMP.maxX + 0.05, maxX: 9, minZ: -7.95, maxZ: 7 });
  }
  return out;
}

const OBSTACLES: Record<'ground' | 'gallery', Rect[]> = { ground: obstaclesFor(0), gallery: obstaclesFor(3) };

export function levelOf(p: Vec3): Level {
  const onRampXZ = p.x >= RAMP.minX - 0.05 && p.x <= RAMP.maxX + 0.05 && p.z <= RAMP.zStart - 0.3 && p.z >= RAMP.zEnd - 0.05;
  if (onRampXZ && p.y > 0.25 && p.y < 2.85) return 'ramp';
  return p.y > 2 ? 'gallery' : 'ground';
}

function segHitsRect(ax: number, az: number, bx: number, bz: number, r: Rect): boolean {
  // Slab test in 2D.
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const test = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  if (!test(-dx, ax - r.minX)) return false;
  if (!test(dx, r.maxX - ax)) return false;
  if (!test(-dz, az - r.minZ)) return false;
  if (!test(dz, r.maxZ - az)) return false;
  return t0 < t1;
}

export function hasLOS(a: Vec3, b: Vec3, level: 'ground' | 'gallery'): boolean {
  for (const r of OBSTACLES[level]) if (segHitsRect(a.x, a.z, b.x, b.z, r)) return false;
  return true;
}

/** Move a point out of any inflated obstacle on its floor (e.g. an heirloom on a pedestal → in front of it). */
export function freePoint(p: Vec3, level?: Level): Vec3 {
  const lv = level ?? levelOf(p);
  if (lv === 'ramp') return { ...p };
  const q = { x: p.x, y: lv === 'gallery' ? 3 : 0, z: p.z };
  for (let iter = 0; iter < 6; iter++) {
    let moved = false;
    for (const r of OBSTACLES[lv]) {
      if (q.x <= r.minX || q.x >= r.maxX || q.z <= r.minZ || q.z >= r.maxZ) continue;
      const opts = [
        { d: q.x - r.minX, x: r.minX - 0.02, z: q.z },
        { d: r.maxX - q.x, x: r.maxX + 0.02, z: q.z },
        { d: q.z - r.minZ, x: q.x, z: r.minZ - 0.02 },
        { d: r.maxZ - q.z, x: q.x, z: r.maxZ + 0.02 },
      ].filter((o) => o.x > -7.6 && o.x < 15.6 && o.z > -11.6 && o.z < 5.6);
      opts.sort((a, b) => a.d - b.d);
      if (opts.length) { q.x = opts[0].x; q.z = opts[0].z; moved = true; }
    }
    if (!moved) break;
  }
  return q;
}

interface Node { id: number; p: Vec3; level: 'ground' | 'gallery' }

const G = (x: number, z: number): Vec3 => ({ x, y: 0, z });
const U = (x: number, z: number): Vec3 => ({ x, y: 3, z });

const GROUND_POINTS: Vec3[] = [
  // Front hall
  G(-6.5, -6.5), G(-6.5, -1), G(-6.5, 1.2), G(-4, -0.6), G(-3.6, 4.6), G(-0.5, 0.8), G(0, 3.4), G(3, -0.6),
  G(3.6, 4.6), G(6.2, -6.5), G(6.2, -1), G(6.2, 2), G(-3, -6), G(3, -6), G(-2.5, -5), G(2.5, -5),
  G(-4.5, -10), G(4.5, -10), G(0, -10.2), G(-6.5, 4.0), G(-1.4, 2.6),
  // Kitchen doorway (both sides)
  G(7.3, 0), G(9.0, 0),
  // Kitchen
  G(9.6, -3.8), G(12, -4.2), G(14.6, -3.8), G(9.6, 2.6), G(12, 2.4), G(14.3, 2.1), G(14.8, -1.2),
  // Pantry
  G(14.3, 3.9), G(14.8, 5.0),
];
const GALLERY_POINTS: Vec3[] = [U(-3, -9.7), U(3, -9.7), U(-6.5, -9.6), U(6.5, -9.6), U(-1.2, -10.8), U(1.2, -10.8), U(-5, -11.3), U(5, -11.3)];

/** Foot and top of the staircase (they link the two floors). */
export const STAIR_FOOT: Vec3 = G(0, -1.3);
export const STAIR_TOP: Vec3 = U(0, -8.7);

const NODES: Node[] = [];
for (const p of GROUND_POINTS) NODES.push({ id: NODES.length, p, level: 'ground' });
const FOOT_ID = NODES.length; NODES.push({ id: FOOT_ID, p: STAIR_FOOT, level: 'ground' });
for (const p of GALLERY_POINTS) NODES.push({ id: NODES.length, p, level: 'gallery' });
const TOP_ID = NODES.length; NODES.push({ id: TOP_ID, p: STAIR_TOP, level: 'gallery' });

const flat = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

const EDGES: { to: number; w: number }[][] = NODES.map(() => []);
for (const a of NODES) {
  for (const b of NODES) {
    if (b.id <= a.id || a.level !== b.level) continue;
    if (hasLOS(a.p, b.p, a.level)) {
      const w = flat(a.p, b.p);
      EDGES[a.id].push({ to: b.id, w });
      EDGES[b.id].push({ to: a.id, w });
    }
  }
}
EDGES[FOOT_ID].push({ to: TOP_ID, w: 7 });
EDGES[TOP_ID].push({ to: FOOT_ID, w: 7 });

/** Waypoints the graph knows (for wandering). */
export function waypoints(level?: 'ground' | 'gallery'): Vec3[] {
  return NODES.filter((n) => !level || n.level === level).map((n) => ({ ...n.p }));
}

/** Hall-only ground waypoints (Grandma's beat). */
export function hallPoints(): Vec3[] {
  return GROUND_POINTS.filter((p) => p.x < 7.5 && p.z > -7).map((p) => ({ ...p }));
}

function connect(p: Vec3, level: Level): { to: number; w: number }[] {
  if (level === 'ramp') return [{ to: FOOT_ID, w: flat(p, STAIR_FOOT) }, { to: TOP_ID, w: flat(p, STAIR_TOP) }];
  const out: { to: number; w: number }[] = [];
  for (const n of NODES) if (n.level === level && hasLOS(p, n.p, level)) out.push({ to: n.id, w: flat(p, n.p) });
  if (out.length === 0) {
    // Stuck in a corner: link to the nearest node on this floor anyway.
    let best: Node | null = null;
    for (const n of NODES) if (n.level === level && (!best || flat(p, n.p) < flat(p, best.p))) best = n;
    if (best) out.push({ to: best.id, w: flat(p, best.p) });
  }
  return out;
}

/**
 * A path from `from` to `to` as a list of points to walk through, ending at
 * `to` (moved out of obstacles). Returns [to] when it is directly reachable.
 */
export function findPath(from: Vec3, to: Vec3): Vec3[] {
  const la = levelOf(from);
  let lb = levelOf(to);
  if (lb === 'ramp') lb = to.y > 1.5 ? 'gallery' : 'ground';
  const goal = freePoint(to, lb);
  if (la === 'ramp') {
    // On the stairs: walk straight up or down.
    if (lb === 'gallery') return [STAIR_TOP, ...findPath(STAIR_TOP, goal).filter((p) => flat(p, STAIR_TOP) > 0.05)];
    return [STAIR_FOOT, ...findPath(STAIR_FOOT, goal).filter((p) => flat(p, STAIR_FOOT) > 0.05)];
  }
  if (la === lb && hasLOS(from, goal, la)) return [goal];
  const startEdges = connect(from, la);
  const goalEdges = connect(goal, lb);
  const n = NODES.length;
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  for (const e of startEdges) if (e.w < dist[e.to]) { dist[e.to] = e.w; prev[e.to] = -1; }
  const goalW = new Map<number, number>();
  for (const e of goalEdges) goalW.set(e.to, e.w);
  let bestGoal = Infinity, bestLast = -1;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] >= bestGoal) break;
    done[u] = true;
    const gw = goalW.get(u);
    if (gw !== undefined && dist[u] + gw < bestGoal) { bestGoal = dist[u] + gw; bestLast = u; }
    for (const e of EDGES[u]) {
      const d = dist[u] + e.w;
      if (d < dist[e.to]) { dist[e.to] = d; prev[e.to] = u; }
    }
  }
  if (bestLast < 0) return [goal];
  const ids: number[] = [];
  for (let u = bestLast; u >= 0; u = prev[u]) ids.push(u);
  ids.reverse();
  return [...ids.map((i) => ({ ...NODES[i].p })), goal];
}
