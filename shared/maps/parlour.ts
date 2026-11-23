// Pettigrew & Sons Funeral Parlour: Nana is pre-planning her own funeral and
// has brought the family along to "help choose". The Chapel of Rest is her
// court (box pews to duck behind, her reserved coffin on the dais, a long view
// down the aisle); the Coffin Showroom is a maze of display coffins; the Wake
// Room's buffet is the Family Dinner table; and a staff-only loop runs behind
// it all: the Preparation Room (hearse backed up to the loading bay), the back
// corridor and the Arrangements Office.
//
// Local plan (x = world x - 200, z as world). Side rooms are 3 m high; the
// chapel rises to 5.5 m, with stained-glass clerestory windows above them.
//
//  z=-9.5 ┌────────────────┬──────── back corridor ────────┬────────────────┐
//         │ Preparation    ═ (staff only)                  ═  Arrangements  │
//  z=-7.1 │ Room  ▤fridges ├vestry═┐──────────────────────┤  Office        │
//         │                │       │▓dais [coffin]▓  organ│   [desk]  ▥wills│
//         ║hearse [slab]   │        Nana ▼          chair │                │
//         │                │                               │ brochures      │
//  z=-2.5 ├──═staff only═──┤   ▭▭▭  front of the pews  ▭▭▭ ├──═wake door═───┤ z=-2
//         │ Viking  Deluxe │   ▭▭▭        aisle      ▭▭▭ │                │
//         │   ▮▮      ▮▮   │   ▭▭▭         ║         ▭▭▭ │   [ buffet ]   │
//         │ Pauper ▯ ▯     ═   ▭▭▭  (box pews, 1.25 m) ▭▭▭ ═ Nana's end     │
//         │      ▮▮  ▯     │   ▭▭▭         ║         ▭▭▭ │   tea urn      │
//         │ urns & plinths │ guestbook   narthex           │  settee        │
//  z=9    └────────────────┴──────── front doors ─────────┴────────────────┘
//       x=-13            x=-5                            x=5              x=13
import type { Vec3 } from '../types.js';
import { WALL, box, pedestalTops, type Box, type BoxKind, type MapDef } from './types.js';

const X = 200;
/** The side rooms' ceiling height. */
export const PARLOUR_SIDE_H = 3;
/** The chapel's ceiling height (its clerestory rises above the side rooms). */
export const PARLOUR_CHAPEL_H = 5.5;
const SH = PARLOUR_SIDE_H;
const CH = PARLOUR_CHAPEL_H;
const T = WALL / 2;
/** Doorway lintels start here. */
const LINTEL = 2.4;

/** A box in local coordinates (x relative to the parlour's centre line). */
function B(kind: BoxKind, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, label: string, solid = true): Box {
  return box(kind, X + x0, y0, z0, X + x1, y1, z1, label, solid);
}

/** The pews: two blocks of four tall box pews, rows 1.6 m apart (north face of each row). */
export const PEW_ROWS = [0, 1.6, 3.2, 4.8];
export const PEW_DEPTH = 0.5;
export const PEW_HEIGHT = 1.25;
/** Pew blocks' x extents (local): west and east of the 2.1 m aisle. */
export const PEW_BLOCKS: [number, number][] = [[-3.25, -1.05], [1.05, 3.25]];

const BOXES: Box[] = [
  // ── Floors (one per room, top at y = 0; they meet under the walls) ──
  B('floor', -5, -0.2, -7.1, 5, 0, 9, 'Chapel floor'),
  B('floor', -13, -0.2, -2.5, -5, 0, 9, 'Showroom floor'),
  B('floor', -13, -0.2, -9.5, -5, 0, -2.5, 'Preparation room floor'),
  B('floor', -5, -0.2, -9.5, 5, 0, -7.1, 'Back corridor floor'),
  B('floor', 5, -0.2, -9.5, 13, 0, -2, 'Office floor'),
  B('floor', 5, -0.2, -2, 13, 0, 9, 'Wake room floor'),

  // ── Ceilings: nothing thrown leaves the building ──
  B('ceiling', -5 - T, CH, -7.1 - T, 5 + T, CH + 0.3, 9 + WALL, 'Chapel ceiling'),
  B('ceiling', -13 - WALL, SH, -9.5 - WALL, -5, SH + 0.3, 9 + WALL, 'West wing ceiling'),
  B('ceiling', 5, SH, -9.5 - WALL, 13 + WALL, SH + 0.3, 9 + WALL, 'East wing ceiling'),
  B('ceiling', -5, SH, -9.5 - WALL, 5, SH + 0.3, -7.1, 'Back corridor ceiling'),

  // ── Outer walls ──
  B('wall', -13 - WALL, 0, -9.5 - WALL, 13 + WALL, SH, -9.5, 'North wall'),
  B('wall', -13 - WALL, 0, 9, -5 - T, SH, 9 + WALL, 'Showroom south wall'),
  B('wall', -5 - T, 0, 9, 5 + T, CH, 9 + WALL, 'Chapel south wall (front doors)'),
  B('wall', 5 + T, 0, 9, 13 + WALL, SH, 9 + WALL, 'Wake room south wall'),
  B('wall', 13, 0, -9.5, 13 + WALL, SH, 9, 'East wall'),
  // West wall, with the loading bay's roller door (z -6.8..-4.8) half up over the hearse.
  B('wall', -13 - WALL, 0, -9.5, -13, SH, -6.8, 'West wall north'),
  B('wall', -13 - WALL, 0, -4.8, -13, SH, 9, 'West wall south'),
  B('wall', -13 - WALL, 1.9, -6.8, -13, SH, -4.8, 'Roller door (half up)'),
  // The hearse has backed up to the bay: its back end fills the opening.
  B('counter', -13 - WALL, 0, -6.8, -12.5, 1.9, -4.8, 'The hearse (back end)'),

  // ── The chapel's walls (x = ±5, z = -7.1), up to the clerestory ──
  // West: the back-corridor end (door z -9.2..-7.4), then the chapel (door to the showroom z 3..4.8).
  B('wall', -5 - T, 0, -9.5, -5 + T, SH, -9.2, 'Corridor west jamb'),
  B('wall', -5 - T, LINTEL, -9.2, -5 + T, SH, -7.4, 'Corridor west door lintel'),
  B('wall', -5 - T, 0, -7.4, -5 + T, CH, 3.0, 'Chapel west wall north'),
  B('wall', -5 - T, LINTEL, 3.0, -5 + T, CH, 4.8, 'Showroom door lintel'),
  B('wall', -5 - T, 0, 4.8, -5 + T, CH, 9, 'Chapel west wall south'),
  // East: the corridor end (door to the office), then the chapel (door to the wake room).
  B('wall', 5 - T, 0, -9.5, 5 + T, SH, -9.2, 'Corridor east jamb'),
  B('wall', 5 - T, LINTEL, -9.2, 5 + T, SH, -7.4, 'Corridor east door lintel'),
  B('wall', 5 - T, 0, -7.4, 5 + T, CH, 3.0, 'Chapel east wall north'),
  B('wall', 5 - T, LINTEL, 3.0, 5 + T, CH, 4.8, 'Wake room door lintel'),
  B('wall', 5 - T, 0, 4.8, 5 + T, CH, 9, 'Chapel east wall south'),
  // North, behind the dais, with the vestry door (x -4.85..-3.1) into the back corridor.
  B('wall', -3.1, 0, -7.1 - T, 5 - T, CH, -7.1 + T, 'Chapel north wall'),
  B('wall', -5 + T, LINTEL, -7.1 - T, -3.1, CH, -7.1 + T, 'Vestry door lintel'),

  // ── Side-room partitions ──
  // Preparation room | showroom (the STAFF ONLY door, x -8.4..-6.6).
  B('wall', -13, 0, -2.5 - T, -8.4, SH, -2.5 + T, 'Staff-only wall west'),
  B('wall', -6.6, 0, -2.5 - T, -5 - T, SH, -2.5 + T, 'Staff-only wall east'),
  B('wall', -8.4, LINTEL, -2.5 - T, -6.6, SH, -2.5 + T, 'Staff-only door lintel'),
  // Office | wake room (the wake-room door, x 8.2..10).
  B('wall', 5 + T, 0, -2 - T, 8.2, SH, -2 + T, 'Office wall west'),
  B('wall', 10, 0, -2 - T, 13, SH, -2 + T, 'Office wall east'),
  B('wall', 8.2, LINTEL, -2 - T, 10, SH, -2 + T, 'Wake-room door lintel'),

  // ── Chapel of Rest ──
  B('slab', -2.8, 0, -6.95, 2.8, 0.3, -5.0, 'Dais'),
  B('counter', -1.1, 0.3, -6.3, 1.1, 1.15, -5.6, 'The reserved coffin'),
  B('counter', 3.2, 0, -6.95, 5 - T, 2.8, -6.2, 'Organ case'),
  B('counter', 3.4, 0, -6.2, 4.7, 1.0, -5.5, 'Organ console'),
  B('chair', 3.3, 0, -4.7, 4.3, 1.0, -3.7, "Nana's chair (Chief Mourner)"),
  ...PEW_ROWS.flatMap((z, i) => PEW_BLOCKS.map(([x0, x1], s) => B('counter', x0, 0, z, x1, PEW_HEIGHT, z + PEW_DEPTH, `Pew ${s ? 'E' : 'W'}${i + 1}`))),
  B('counter', -4.45, 0, 8.1, -3.85, 1.1, 8.7, 'Guestbook stand'),

  // ── Coffin Showroom: islands of display coffins (low on biers, tall stood upright) in a grid of lanes ──
  B('counter', -11.3, 0, -0.7, -10.3, 1.0, 2.0, 'The Viking'),
  B('counter', -11.2, 0, 2.45, -10.4, 2.1, 3.0, 'The Upright Citizen'),
  B('counter', -8.0, 0, -0.6, -7.0, 1.0, 1.6, 'The Eternal Rest Deluxe'),
  B('counter', -8.2, 0, 2.3, -6.7, 2.2, 3.0, 'Upright display (back to back)'),
  B('counter', -11.3, 0, 4.75, -10.6, 0.9, 6.85, 'The Pauper'),
  B('counter', -10.4, 0, 4.75, -9.7, 0.9, 6.85, 'The Flat-Pack'),
  B('counter', -8.2, 0, 4.75, -7.5, 0.95, 6.85, 'The Eco Wicker'),
  B('counter', -7.25, 0, 4.9, -6.6, 2.2, 6.7, 'Upright display south'),
  B('counter', -12.75, 0, 8.25, -12.15, 1.0, 8.85, 'Urn plinth SW'),
  B('counter', -9.3, 0, 8.25, -8.7, 1.0, 8.85, 'Urn plinth S'),
  B('counter', -6.0, 0, 8.25, -5.4, 1.0, 8.85, 'Urn plinth SE'),

  // ── Preparation Room (staff only) ──
  B('counter', -10.2, 0, -6.4, -8.0, 0.9, -5.6, 'Mortuary table'),
  B('counter', -12.6, 0, -9.5, -9.6, 2.3, -8.75, 'Refrigerated drawers'),
  B('counter', -12.85, 0, -3.25, -10.2, 0.95, -2.65, 'Sink and cosmetics bench'),
  B('counter', -12.4, 0, -8.0, -10.9, 0.9, -7.4, 'Trolley'),

  // ── Arrangements Office ──
  B('counter', 8.4, 0, -6.6, 10.8, 0.78, -5.7, "Mr Pettigrew's desk"),
  B('counter', 9.3, 0, -7.5, 9.9, 1.15, -6.9, "Mr Pettigrew's chair"),
  B('counter', 12.25, 0, -8.6, 13, 1.45, -5.6, 'Filing cabinets (wills)'),
  B('counter', 5 + T, 0, -6.6, 5.6, 1.7, -4.6, 'Brochure rack'),
  B('counter', 10.6, 0, -9.5, 12.0, 1.9, -9.0, 'Bookcase'),

  // ── Wake Room ──
  B('table', 7.6, 0, 4.0, 10.8, 0.8, 5.2, 'The buffet'),
  B('counter', 12.25, 0, 0.2, 13, 0.95, 2.6, 'Sideboard (tea urn)'),
  B('counter', 9.0, 0, 8.15, 11.4, 0.85, 9, 'Settee'),
  B('counter', 5 + T, 0, 6.6, 5.7, 1.8, 8.4, 'Coat stand and umbrella rack'),

  // ── Heirloom pedestals (urns, busts and the family silver among the merchandise) ──
  B('pedestal', -2.4, 0.3, -6.2, -1.8, 1.3, -5.6, 'Pedestal beside the coffin'),
  B('pedestal', 3.85, 0, 7.95, 4.45, 1.0, 8.55, 'Pedestal in the narthex'),
  B('pedestal', -11.0, 0, 8.25, -10.4, 1.0, 8.85, 'Pedestal among the urns W'),
  B('pedestal', -7.6, 0, 8.25, -7.0, 1.0, 8.85, 'Pedestal among the urns E'),
  B('pedestal', -6.05, 0, -5.4, -5.45, 1.0, -4.8, 'Pedestal awaiting collection'),
  B('pedestal', 11.95, 0, -3.25, 12.55, 1.0, -2.65, 'Pedestal in the office'),
  B('pedestal', 5.5, 0, -1.5, 6.1, 1.0, -0.9, 'Pedestal by the wake-room door'),
  B('pedestal', 12.2, 0, 7.75, 12.8, 1.0, 8.35, 'Pedestal by the settee'),
];

const G = (x: number, z: number): Vec3 => ({ x: X + x, y: 0, z });

const GROUND: Vec3[] = [
  // Chapel of Rest: the front, the aisle, the side aisles, the narthex.
  G(0, -4.2), G(-3.85, -3.0), G(2.4, -3.0), G(4.05, -1.2), G(-2.2, -1.0), G(2.2, -1.0),
  G(0, 2.4), G(0, 6.8), G(-3.6, 6.9), G(3.6, 6.9),
  // Chapel doorways (both sides): showroom (west), wake room (east), vestry (north).
  G(-4.05, 3.9), G(-5.95, 3.9), G(4.05, 3.9), G(5.95, 3.9), G(-3.95, -6.0), G(-4.0, -8.35),
  // Coffin Showroom.
  G(-12.15, -1.6), G(-9.0, 0.6), G(-12.15, 3.9), G(-9.0, 3.9), G(-12.15, 7.6), G(-9.0, 7.6), G(-5.95, 7.6),
  // Staff-only doorway (both sides) and the Preparation Room.
  G(-7.5, -1.6), G(-7.5, -3.4), G(-11.0, -4.0), G(-9.0, -7.6), G(-5.95, -8.3),
  // Back corridor.
  G(0, -8.35), G(4.0, -8.35),
  // Arrangements Office (its corridor door, and the wake-room door both sides).
  G(5.95, -8.3), G(7.0, -4.0), G(11.3, -4.4), G(10.8, -8.0), G(9.1, -2.9), G(9.1, -1.1),
  // Wake Room.
  G(11.2, 0.8), G(9.2, 2.6), G(6.6, 7.2), G(11.4, 6.6),
];

export const PARLOUR: MapDef = {
  id: 'parlour',
  name: 'Pettigrew & Sons Funeral Parlour',
  blurb: 'Nana is choosing her coffin. The family is choosing her successor.',
  bounds: { min: { x: X - 18.5, y: -4, z: -11 }, max: { x: X + 14.5, y: 7, z: 10.5 } },
  inside: [
    { min: { x: X - 13.4, y: -1, z: -9.9 }, max: { x: X + 13.4, y: SH + 0.3, z: 9.4 } },
    { min: { x: X - 5.2, y: -1, z: -7.3 }, max: { x: X + 5.2, y: CH + 0.3, z: 9.4 } },
  ],
  boxes: BOXES,
  ramps: [],
  rooms: [
    { name: 'Back Corridor', min: { x: X - 5, y: 0, z: -9.5 }, max: { x: X + 5, y: SH, z: -7.1 } },
    { name: 'Preparation Room', min: { x: X - 13, y: 0, z: -9.5 }, max: { x: X - 5, y: SH, z: -2.5 } },
    { name: 'Coffin Showroom', min: { x: X - 13, y: 0, z: -2.5 }, max: { x: X - 5, y: SH, z: 9 } },
    { name: 'Arrangements Office', min: { x: X + 5, y: 0, z: -9.5 }, max: { x: X + 13, y: SH, z: -2 } },
    { name: 'Wake Room', min: { x: X + 5, y: 0, z: -2 }, max: { x: X + 13, y: SH, z: 9 } },
    { name: 'Chapel of Rest', min: { x: X - 5, y: 0, z: -7.1 }, max: { x: X + 5, y: CH, z: 9 } },
  ],
  spawns: {
    // Nana holds court in front of her own coffin, looking down the aisle.
    grandma: G(0, -3.6),
    grandmaYaw: Math.PI,
    // The family in the front of the chapel, the aisle and the front pews, facing her.
    cousins: [G(0, -0.5), G(-2.0, -0.9), G(2.0, -0.9), G(0, 1.4), G(-2.15, 1.05), G(2.15, 1.05), G(0, 3.3)],
    // Family Dinner: Nana at the head of the buffet (her back to the chapel door).
    dinnerGrandma: G(6.75, 4.6),
    dinnerGrandmaYaw: -Math.PI / 2,
    dinnerCousins: [G(8.0, 3.2), G(8.0, 6.0), G(9.2, 3.2), G(9.2, 6.0), G(10.4, 3.2), G(10.4, 6.0), G(11.65, 4.6)],
    // Mittens has claimed the reserved coffin.
    cat: { x: X - 0.45, y: 1.15, z: -5.95 },
    // The teacup waits by the tea urn on the wake-room sideboard.
    teacup: { x: X + 12.55, y: 0.95, z: 1.0 },
    pills: [
      { x: X + 0.45, y: 1.15, z: -5.95 }, // in the reserved coffin
      { x: X + 9.9, y: 0.78, z: -6.15 }, // on Mr Pettigrew's desk
      { x: X - 8.6, y: 0.9, z: -6.0 }, // on the mortuary table
      { x: X - 10.95, y: 0.9, z: 5.8 }, // in The Pauper
      { x: X - 1.5, y: 0, z: -8.6 }, // on the back-corridor floor
    ],
  },
  heirloomSpots: pedestalTops(BOXES),
  dinner: { table: { minX: X + 7.6, maxX: X + 10.8, minZ: 4.0, maxZ: 5.2 }, door: { x: X + 9.1, z: -2 }, doorName: 'the wake-room door' },
  nav: {
    ground: GROUND,
    // Nana's beat: up and down her chapel.
    beat: [G(0, -4.2), G(-3.85, -3.0), G(2.4, -3.0), G(-2.2, -1.0), G(2.2, -1.0), G(0, 2.4), G(-4.05, 3.9), G(4.05, 3.9), G(0, 6.8), G(-3.6, 6.9), G(3.6, 6.9)],
  },
  lostToast: '{name} wandered off into the Garden of Remembrance and was escorted back in.',
};
