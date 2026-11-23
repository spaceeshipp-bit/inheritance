// The world: every map (shared/maps/*), side by side and far apart, so the
// server's physics and the client's renderer use identical geometry. A match
// plays on one map (MatchOptions.map); physics, line of sight and ground
// height simply see every box, which is the same thing since maps never overlap.
//
// Axes: X east(+)/west(-), Z south(+)/north(-), Y up. Ground floor at y = 0.
import type { Vec3 } from './types.js';
import { MANOR, GALLERY_Y, HALL_HEIGHT, KITCHEN_HEIGHT } from './maps/manor.js';
import { CAREHOME } from './maps/carehome.js';
import { PARLOUR } from './maps/parlour.js';
import { CRUISE } from './maps/cruise.js';
import type { Box, MapDef, MapId, Ramp, Room, Volume } from './maps/types.js';

export type { Box, BoxKind, MapDef, MapId, Ramp, Rect, Room, Volume } from './maps/types.js';
export { GALLERY_Y, HALL_HEIGHT, KITCHEN_HEIGHT };

/** Every map, in the order the lobby offers them. */
export const MAPS: Record<MapId, MapDef> = registry([MANOR, CAREHOME, PARLOUR, CRUISE]);
export const MAP_IDS = Object.keys(MAPS) as MapId[];

function registry(defs: MapDef[]): Record<MapId, MapDef> {
  const out = {} as Record<MapId, MapDef>;
  for (const d of defs) out[d.id] = d;
  return out;
}

/** The map with this id (the manor for anything unknown). */
export function mapById(id: string | undefined | null): MapDef {
  return (id && (MAPS as Record<string, MapDef | undefined>)[id]) || MANOR;
}

/** Which map a point is in (by its bounds), or null in the empty space between maps. */
export function mapAt(p: Vec3): MapDef | null {
  for (const id of MAP_IDS) {
    const b = MAPS[id].bounds;
    if (p.x >= b.min.x && p.x <= b.max.x && p.z >= b.min.z && p.z <= b.max.z) return MAPS[id];
  }
  return null;
}

/** All of the world's boxes, ramps and rooms (every map's). */
export const BOXES: Box[] = MAP_IDS.flatMap((id) => MAPS[id].boxes);
export const RAMPS: Ramp[] = MAP_IDS.flatMap((id) => MAPS[id].ramps);
export const ROOMS: Room[] = MAP_IDS.flatMap((id) => MAPS[id].rooms);

/** The manor's (the default map's) heirloom spots and spawns, for code that only knows the manor (dev mock, tests). */
export const HEIRLOOM_SPOTS: Vec3[] = MANOR.heirloomSpots;
export const SPAWNS = MANOR.spawns;

export const HEIRLOOM_VARIANTS = ['vase', 'bust', 'clock', 'urn', 'portrait', 'teapot'] as const;

/** Floor height under (x, z) for something currently at height `y` that can step up `stepUp`. */
export function groundHeight(x: number, z: number, y: number, stepUp = 0.45): number {
  let best = -Infinity;
  for (const b of BOXES) {
    if (!b.solid) continue;
    if (x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z) continue;
    if (b.max.y <= y + stepUp && b.max.y > best) best = b.max.y;
  }
  for (const r of RAMPS) {
    if (x < r.minX || x > r.maxX) continue;
    const lo = Math.min(r.zStart, r.zEnd), hi = Math.max(r.zStart, r.zEnd);
    if (z < lo || z > hi) continue;
    const t = (z - r.zStart) / (r.zEnd - r.zStart);
    const h = r.yStart + t * (r.yEnd - r.yStart);
    if (h <= y + stepUp && h > best) best = h;
  }
  if (best !== -Infinity) return best;
  // No floor here: the map says how far down the ground is (the sea under a ship), else 0.
  return mapAt({ x, y, z })?.voidFloor ?? 0;
}

/** The named room a point is in (most specific first), or 'Outside'. */
export function roomAt(p: Vec3): string {
  const m = mapAt(p);
  if (!m) return 'Outside';
  for (const r of m.rooms) {
    if (p.x >= r.min.x && p.x <= r.max.x && p.z >= r.min.z && p.z <= r.max.z && p.y >= r.min.y - 0.5 && p.y <= r.max.y) return r.name;
  }
  return 'Outside';
}

/** Falling through one of a map's drop zones (over the side of the ship). */
export function inDrop(p: Vec3, m: MapDef): boolean {
  return (m.drops ?? []).some((v) => p.x >= v.min.x && p.x <= v.max.x && p.z >= v.min.z && p.z <= v.max.z && p.y >= v.min.y && p.y <= v.max.y);
}

/** Inside one of a map's volumes, with `margin` to spare sideways and `below` metres of drop allowed. */
export function insideMap(p: Vec3, m: MapDef, margin = 0, below = 0): boolean {
  if (!Number.isFinite(p.x + p.y + p.z)) return false;
  return m.inside.some((v: Volume) => p.x >= v.min.x - margin && p.x <= v.max.x + margin && p.z >= v.min.z - margin && p.z <= v.max.z + margin
    && p.y >= v.min.y - below && p.y <= v.max.y + margin);
}
