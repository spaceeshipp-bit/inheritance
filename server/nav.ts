// Bot navigation: each map's hand-placed waypoint graph (shared/maps/*: its
// ground floor, and the manor's gallery joined by the grand staircase),
// line-of-sight checks against the map boxes inflated by the body radius, and
// Dijkstra. Paths never leave the map they start in.
import { BOXES, MAPS, MAP_IDS, RAMPS, mapAt, type MapDef, type MapId } from '../shared/map.js';
import { CHAR_SHAPE } from '../shared/movement.js';
import type { Vec3 } from '../shared/types.js';

export type Level = 'ground' | 'ramp' | 'gallery';

interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

const MARGIN = CHAR_SHAPE.radius + 0.05;
/** The manor's grand staircase (the only stairs, and the only upper floor, so far). */
const RAMP = MAPS.manor.ramps[0];

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
  for (const r of RAMPS) {
    const lo = Math.min(r.zStart, r.zEnd), hi = Math.max(r.zStart, r.zEnd);
    const onRampXZ = p.x >= r.minX - 0.05 && p.x <= r.maxX + 0.05 && p.z <= hi - 0.3 && p.z >= lo - 0.05;
    if (onRampXZ && p.y > r.yStart + 0.25 && p.y < r.yEnd - 0.15) return 'ramp';
  }
  return p.y > 2 ? 'gallery' : 'ground';
}

/** The map a point is in (the manor if it is somewhere between maps). */
function mapOf(p: Vec3): MapDef {
  return mapAt(p) ?? MAPS.manor;
}

function segHitsRect(ax: number, az: number, bx: number, bz: number, r: Rect): boolean {
  // Slab test in 2D (no closures: this runs thousands of times a second for the bots).
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-12) {
    if (ax < r.minX || ax > r.maxX) return false;
  } else {
    let ta = (r.minX - ax) / dx, tb = (r.maxX - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-12) {
    if (az < r.minZ || az > r.maxZ) return false;
  } else {
    let ta = (r.minZ - az) / dz, tb = (r.maxZ - az) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
  }
  return t0 < t1;
}

export function hasLOS(a: Vec3, b: Vec3, level: 'ground' | 'gallery'): boolean {
  for (const r of OBSTACLES[level]) if (segHitsRect(a.x, a.z, b.x, b.z, r)) return false;
  return true;
}

/** Comfortably inside one of the map's volumes (0.4 m in from its walls). */
function inOpen(x: number, z: number, m: MapDef): boolean {
  return m.inside.some((v) => x > v.min.x + 0.4 && x < v.max.x - 0.4 && z > v.min.z + 0.4 && z < v.max.z - 0.4);
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
      ].filter((o) => inOpen(o.x, o.z, mapOf(p)));
      opts.sort((a, b) => a.d - b.d);
      if (opts.length) { q.x = opts[0].x; q.z = opts[0].z; moved = true; }
    }
    if (!moved) break;
  }
  return q;
}

interface Node { id: number; p: Vec3; level: 'ground' | 'gallery'; map: MapId }

/** The manor's stair ends (they link its two floors). */
export const STAIR_FOOT: Vec3 = MAPS.manor.nav.stairFoot as Vec3;
export const STAIR_TOP: Vec3 = MAPS.manor.nav.stairTop as Vec3;

const NODES: Node[] = [];
let FOOT_ID = -1, TOP_ID = -1;
for (const id of MAP_IDS) {
  const nav = MAPS[id].nav;
  for (const p of nav.ground) NODES.push({ id: NODES.length, p, level: 'ground', map: id });
  if (nav.stairFoot) { if (id === 'manor') FOOT_ID = NODES.length; NODES.push({ id: NODES.length, p: nav.stairFoot, level: 'ground', map: id }); }
  for (const p of nav.upper ?? []) NODES.push({ id: NODES.length, p, level: 'gallery', map: id });
  if (nav.stairTop) { if (id === 'manor') TOP_ID = NODES.length; NODES.push({ id: NODES.length, p: nav.stairTop, level: 'gallery', map: id }); }
}

const flat = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

const EDGES: { to: number; w: number }[][] = NODES.map(() => []);
for (const a of NODES) {
  for (const b of NODES) {
    if (b.id <= a.id || a.level !== b.level || a.map !== b.map) continue;
    if (hasLOS(a.p, b.p, a.level)) {
      const w = flat(a.p, b.p);
      EDGES[a.id].push({ to: b.id, w });
      EDGES[b.id].push({ to: a.id, w });
    }
  }
}
EDGES[FOOT_ID].push({ to: TOP_ID, w: 7 });
EDGES[TOP_ID].push({ to: FOOT_ID, w: 7 });

/** Waypoints the graph knows on one map (for wandering), optionally on one floor. */
export function waypoints(map: MapId, level?: 'ground' | 'gallery'): Vec3[] {
  return NODES.filter((n) => n.map === map && (!level || n.level === level)).map((n) => ({ ...n.p }));
}

/** Grandma's beat on a map (where the bot Grandma wanders). */
export function beatPoints(map: MapId): Vec3[] {
  return MAPS[map].nav.beat.map((p) => ({ ...p }));
}

function connect(p: Vec3, level: Level): { to: number; w: number }[] {
  if (level === 'ramp') return [{ to: FOOT_ID, w: flat(p, STAIR_FOOT) }, { to: TOP_ID, w: flat(p, STAIR_TOP) }];
  const map = mapOf(p).id;
  const out: { to: number; w: number }[] = [];
  for (const n of NODES) if (n.map === map && n.level === level && hasLOS(p, n.p, level)) out.push({ to: n.id, w: flat(p, n.p) });
  if (out.length === 0) {
    // Stuck in a corner: link to the nearest node on this floor anyway.
    let best: Node | null = null;
    for (const n of NODES) if (n.map === map && n.level === level && (!best || flat(p, n.p) < flat(p, best.p))) best = n;
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
