// What a map is: its geometry (shared by the server's physics and the
// client's renderer), where everyone starts, where heirlooms stand, the
// Dinner table, where Nana's wishes turn up, and where bots can walk.
//
// All maps live in one world, far apart (each in its own `bounds`), so the
// physics, line of sight and ground height simply see every box; a match only
// ever uses its own map's part of the world.
//
// Axes: X east(+)/west(-), Z south(+)/north(-), Y up. Ground floor at y = 0.
import type { Vec3 } from '../types.js';

/** Every map. A new map adds its id here and registers its MapDef in shared/map.ts. */
export type MapId = 'manor' | 'carehome' | 'parlour' | 'cruise';

export type BoxKind = 'floor' | 'wall' | 'slab' | 'railing' | 'counter' | 'table' | 'pedestal' | 'chair' | 'door' | 'ceiling';

export interface Box {
  min: Vec3;
  max: Vec3;
  kind: BoxKind;
  /** Solid for character collision (floors/slabs/counters/walls). Pedestals are solid too. */
  solid: boolean;
  label?: string;
}

/** A straight ramp (a staircase). Height rises linearly along Z from zStart to zEnd. */
export interface Ramp {
  minX: number; maxX: number;
  zStart: number; zEnd: number;
  yStart: number; yEnd: number;
  /** Render as this many steps. */
  steps: number;
  label: string;
}

export interface Room { name: string; min: Vec3; max: Vec3 }
export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }
export interface Volume { min: Vec3; max: Vec3 }

export interface MapDef {
  id: MapId;
  /** "Harrowgate Manor". */
  name: string;
  /** One line for the lobby's map picker. */
  blurb: string;
  /** Everything in the map lies inside this; maps never overlap. */
  bounds: Volume;
  /** Where people and things may be. Outside all of these they are lost (fallen out, overboard) and brought back. */
  inside: Volume[];
  boxes: Box[];
  ramps: Ramp[];
  /** Named rooms, most specific first (names are unique across all maps). */
  rooms: Room[];
  spawns: {
    grandma: Vec3;
    grandmaYaw: number;
    /** Seven cousin spots, the first four the most central (a 5-player match), more than 2 m apart. */
    cousins: Vec3[];
    /** Family Dinner seating round `dinner.table`. */
    dinnerGrandma: Vec3;
    dinnerGrandmaYaw: number;
    dinnerCousins: Vec3[];
    /** Wishes: where the cat starts, where the teacup sits, where her pills turn up. */
    cat: Vec3;
    teacup: Vec3;
    pills: Vec3[];
  };
  /** Where heirlooms can stand (the top of each pedestal). */
  heirloomSpots: Vec3[];
  /** Family Dinner: the table everyone sits round, and the door you excuse yourself at. */
  /**
   * Family Dinner: the table everyone sits round (matching a 'table' box), and
   * the door you excuse yourself at, with what the game calls it ("the kitchen door").
   */
  dinner: { table: Rect; door: { x: number; z: number }; doorName: string };
  nav: {
    /** Ground-floor waypoints (y = 0): in the open, a few metres apart, every room reachable. */
    ground: Vec3[];
    /** An upper floor's waypoints at its height, and the stair ends linking the floors (the manor's gallery). */
    upper?: Vec3[];
    stairFoot?: Vec3;
    stairTop?: Vec3;
    /** Grandma's beat: where the bot Grandma wanders (ground floor). */
    beat: Vec3[];
  };
  /** Told to everyone when someone leaves the map and is brought back; {name} is replaced. */
  lostToast?: string;
  /**
   * Places you can fall through but not stand in (over a ship's side, down to
   * the sea): someone (or something) here is not brought back until they drop
   * below the bottom of it, so the fall is seen.
   */
  drops?: Volume[];
  /** Height of the ground where there is no floor box (default 0). The sea around a ship is far below. */
  voidFloor?: number;
}

export const WALL = 0.3;

export function box(kind: BoxKind, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, label?: string, solid = true): Box {
  return {
    kind, solid, label,
    min: { x: Math.min(x0, x1), y: Math.min(y0, y1), z: Math.min(z0, z1) },
    max: { x: Math.max(x0, x1), y: Math.max(y0, y1), z: Math.max(z0, z1) },
  };
}

/** The top centre of every pedestal: where heirlooms stand. */
export function pedestalTops(boxes: Box[]): Vec3[] {
  return boxes.filter((b) => b.kind === 'pedestal').map((b) => ({ x: (b.min.x + b.max.x) / 2, y: b.max.y, z: (b.min.z + b.max.z) / 2 }));
}
