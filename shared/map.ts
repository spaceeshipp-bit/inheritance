// Harrowgate Manor, grey-box (first playable): the front hall, the grand
// staircase up to the heirloom gallery, and the kitchen with its pantry.
// Shared so the server's physics and the client's renderer use identical geometry.
//
// Axes: X east(+)/west(-), Z south(+)/north(-), Y up. Ground floor at y = 0.
//
//   z=-12 ┌───────────── gallery (y=3, z -12..-8) ─────────────┐
//         │  (ground floor continues underneath the gallery)   │
//   z=-8  │──railing──┐ stairs ┌──railing──                     │┌──────── kitchen ────────┐
//         │           │ x±1.5  │                               ││ z -6..6, x 8..16, h=3     │
//   z=-2  │           └(foot)──┘                               ├┘ doorway z -1.5..1.5       │
//         │                 front hall (x -8..8)              ═══                 ┌pantry┐  │
//         │  Grandma's chair (-5, 3)                          ├┐                  │13..16│  │
//   z=6   └──────────────────── front door (south) ───────────┘└──────────────────┴──3..6┘──┘
import type { Vec3 } from './types.js';

export type BoxKind = 'floor' | 'wall' | 'slab' | 'railing' | 'counter' | 'table' | 'pedestal' | 'chair' | 'door' | 'ceiling';

export interface Box {
  min: Vec3;
  max: Vec3;
  kind: BoxKind;
  /** Solid for character collision (floors/slabs/counters/walls). Pedestals are solid too. */
  solid: boolean;
  label?: string;
}

/** A straight ramp used for the staircase. Height rises linearly along Z from zStart to zEnd. */
export interface Ramp {
  minX: number; maxX: number;
  zStart: number; zEnd: number;
  yStart: number; yEnd: number;
  /** Render as this many steps. */
  steps: number;
  label: string;
}

export interface Room { name: string; min: Vec3; max: Vec3 }

const T = 0.3; // wall thickness
const box = (kind: BoxKind, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, label?: string, solid = true): Box => ({
  kind, solid, label,
  min: { x: Math.min(x0, x1), y: Math.min(y0, y1), z: Math.min(z0, z1) },
  max: { x: Math.max(x0, x1), y: Math.max(y0, y1), z: Math.max(z0, z1) },
});

export const GALLERY_Y = 3;
export const HALL_HEIGHT = 6;
export const KITCHEN_HEIGHT = 3;

export const BOXES: Box[] = [
  // Floors (top surface at y = 0)
  box('floor', -8, -0.2, -12, 8, 0, 6, 'Front hall floor'),
  box('floor', 8, -0.2, -6, 16, 0, 6, 'Kitchen floor'),

  // Gallery slab (top surface at y = 3), with the stair opening between x -1.5..1.5 at z -8..-7.6 handled by the ramp
  box('slab', -8, GALLERY_Y - 0.2, -12, 8, GALLERY_Y, -8, 'Heirloom gallery'),

  // Ceilings (the client draws them as planes): nothing thrown can leave the house.
  box('ceiling', -8.3, HALL_HEIGHT, -12.3, 8.3, HALL_HEIGHT + 0.3, 6.3, 'Hall ceiling'),
  box('ceiling', 8, KITCHEN_HEIGHT, -6.3, 16.3, KITCHEN_HEIGHT + 0.3, 6.3, 'Kitchen ceiling'),

  // Gallery railing along z = -8, leaving a gap for the stairs (x -1.5..1.5)
  box('railing', -8, GALLERY_Y, -8.1, -1.5, GALLERY_Y + 1, -7.9, 'Gallery railing west'),
  box('railing', 1.5, GALLERY_Y, -8.1, 8, GALLERY_Y + 1, -7.9, 'Gallery railing east'),
  // Stair side rails (so you fall off the sides only when shoved hard: low rails)
  box('railing', -1.6, 0, -8, -1.5, 0.5, -2, 'Stair rail west', false),
  box('railing', 1.5, 0, -8, 1.6, 0.5, -2, 'Stair rail east', false),

  // Hall outer walls
  box('wall', -8 - T, 0, -12 - T, 8 + T, HALL_HEIGHT, -12, 'North wall'),
  box('wall', -8 - T, 0, 6, 8 + T, HALL_HEIGHT, 6 + T, 'South wall'),
  box('wall', -8 - T, 0, -12, -8, HALL_HEIGHT, 6, 'West wall'),
  // East hall wall with a doorway to the kitchen at z -1.5..1.5
  box('wall', 8, 0, -12, 8 + T, HALL_HEIGHT, -1.5, 'East wall north'),
  box('wall', 8, 0, 1.5, 8 + T, HALL_HEIGHT, 6, 'East wall south'),
  box('wall', 8, 2.4, -1.5, 8 + T, HALL_HEIGHT, 1.5, 'Kitchen doorway lintel'),

  // Kitchen walls
  box('wall', 8, 0, -6 - T, 16 + T, KITCHEN_HEIGHT, -6, 'Kitchen north wall'),
  box('wall', 8, 0, 6, 16 + T, KITCHEN_HEIGHT, 6 + T, 'Kitchen south wall'),
  box('wall', 16, 0, -6, 16 + T, KITCHEN_HEIGHT, 6, 'Kitchen east wall'),
  // Pantry walls (x 13..16, z 3..6) with a door gap at x 13.8..14.8 on its north side (z = 3)
  box('wall', 13 - T / 2, 0, 3, 13 + T / 2, KITCHEN_HEIGHT, 6, 'Pantry west wall'),
  box('wall', 13, 0, 3 - T / 2, 13.8, KITCHEN_HEIGHT, 3 + T / 2, 'Pantry north wall west'),
  box('wall', 14.8, 0, 3 - T / 2, 16, KITCHEN_HEIGHT, 3 + T / 2, 'Pantry north wall east'),

  // Kitchen furniture
  box('counter', 9, 0, -6, 15.5, 0.95, -5, 'Kitchen counter'),
  box('table', 10.5, 0, -1, 13, 0.8, 1, 'Kitchen table'),

  // Hall furniture
  box('chair', -5.6, 0, 2.4, -4.4, 1.0, 3.6, "Grandma's chair"),
  box('table', -3.5, 0, 1.6, -2.3, 0.6, 2.8, 'Side table'),

  // Heirloom pedestals (each holds one heirloom spot below)
  box('pedestal', -7.4, 0, -4.4, -6.6, 1.0, -3.6, 'Pedestal hall NW'),
  box('pedestal', 6.6, 0, -4.4, 7.4, 1.0, -3.6, 'Pedestal hall NE'),
  box('pedestal', -7.4, 0, 4.0, -6.6, 1.0, 4.8, 'Pedestal hall SW'),
  box('pedestal', 6.6, 0, 4.0, 7.4, 1.0, 4.8, 'Pedestal hall SE'),
  box('pedestal', -2.6, 0, -2.4, -1.8, 1.0, -1.6, 'Pedestal stair foot W'),
  box('pedestal', 1.8, 0, -2.4, 2.6, 1.0, -1.6, 'Pedestal stair foot E'),
  box('pedestal', -6.4, GALLERY_Y, -11.4, -5.6, GALLERY_Y + 1, -10.6, 'Gallery pedestal 1'),
  box('pedestal', -3.4, GALLERY_Y, -11.4, -2.6, GALLERY_Y + 1, -10.6, 'Gallery pedestal 2'),
  box('pedestal', 2.6, GALLERY_Y, -11.4, 3.4, GALLERY_Y + 1, -10.6, 'Gallery pedestal 3'),
  box('pedestal', 5.6, GALLERY_Y, -11.4, 6.4, GALLERY_Y + 1, -10.6, 'Gallery pedestal 4'),
  box('pedestal', -4.4, GALLERY_Y, -8.9, -3.6, GALLERY_Y + 1, -8.5, 'Gallery pedestal by the rail W'),
  box('pedestal', 3.6, GALLERY_Y, -8.9, 4.4, GALLERY_Y + 1, -8.5, 'Gallery pedestal by the rail E'),
];

/** The grand staircase: from the hall floor at z = -2 up to the gallery at z = -8. */
export const RAMPS: Ramp[] = [
  { minX: -1.5, maxX: 1.5, zStart: -2, zEnd: -8, yStart: 0, yEnd: GALLERY_Y, steps: 15, label: 'Grand staircase' },
];

export const ROOMS: Room[] = [
  { name: 'Front hall', min: { x: -8, y: 0, z: -12 }, max: { x: 8, y: GALLERY_Y, z: 6 } },
  { name: 'Gallery', min: { x: -8, y: GALLERY_Y, z: -12 }, max: { x: 8, y: HALL_HEIGHT, z: -8 } },
  { name: 'Kitchen', min: { x: 8, y: 0, z: -6 }, max: { x: 16, y: KITCHEN_HEIGHT, z: 6 } },
  { name: 'Pantry', min: { x: 13, y: 0, z: 3 }, max: { x: 16, y: KITCHEN_HEIGHT, z: 6 } },
];

/** Where heirlooms can stand (top of each pedestal). HEIRLOOM.perMatch are chosen per match. */
export const HEIRLOOM_SPOTS: Vec3[] = BOXES.filter((b) => b.kind === 'pedestal').map((b) => ({
  x: (b.min.x + b.max.x) / 2,
  y: b.max.y,
  z: (b.min.z + b.max.z) / 2,
}));

export const HEIRLOOM_VARIANTS = ['vase', 'bust', 'clock', 'urn', 'portrait', 'teapot'] as const;

export const SPAWNS = {
  grandma: { x: -5, y: 0, z: 1.6 } as Vec3,
  grandmaYaw: -Math.PI / 2, // facing east, toward the stairs and the kitchen door
  /**
   * Cousins spawn in the open hall in front of Grandma (two staggered rows,
   * more than 2 m apart, clear of the side table and her chair), so a camera
   * behind each of them looking at her has the room it needs; the first four
   * (a 5-player match) are the most central.
   */
  cousins: [
    { x: -0.4, y: 0, z: 3.75 }, { x: 0.7, y: 0, z: 2.0 }, { x: 1.8, y: 0, z: 3.75 }, { x: -1.5, y: 0, z: 2.0 },
    { x: 2.9, y: 0, z: 2.0 }, { x: -2.6, y: 0, z: 3.75 }, { x: 4.0, y: 0, z: 3.75 },
  ] as Vec3[],
  /** Family Dinner: Nana at the head of the kitchen table, looking down it; cousins round it. */
  dinnerGrandma: { x: 9.7, y: 0, z: 0 } as Vec3,
  dinnerGrandmaYaw: -Math.PI / 2,
  dinnerCousins: [
    { x: 11.0, y: 0, z: -1.65 }, { x: 11.0, y: 0, z: 1.65 }, { x: 12.5, y: 0, z: -1.65 }, { x: 12.5, y: 0, z: 1.65 },
    { x: 13.8, y: 0, z: -0.7 }, { x: 13.8, y: 0, z: 0.7 }, { x: 11.75, y: 0, z: 2.7 },
  ] as Vec3[],
  cat: { x: 4, y: 0, z: 2 } as Vec3,
  /** The teacup sits on the kitchen counter. */
  teacup: { x: 12, y: 0.95, z: -5.5 } as Vec3,
  /** Grandma's pills turn up in one of these places. */
  pills: [
    { x: 14.5, y: 0, z: 4.5 }, // pantry
    { x: -6, y: GALLERY_Y, z: -9.5 }, // gallery
    { x: 11.5, y: 0.8, z: 0 }, // kitchen table
    { x: -6, y: 0, z: -10 }, // under the gallery
  ] as Vec3[],
};

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
  return best === -Infinity ? 0 : best;
}

export function roomAt(p: Vec3): string {
  // Most specific first.
  for (const name of ['Pantry', 'Gallery', 'Kitchen', 'Front hall']) {
    const r = ROOMS.find((x) => x.name === name)!;
    if (p.x >= r.min.x && p.x <= r.max.x && p.z >= r.min.z && p.z <= r.max.z && p.y >= r.min.y - 0.5 && p.y <= r.max.y) return name;
  }
  return 'Outside';
}
