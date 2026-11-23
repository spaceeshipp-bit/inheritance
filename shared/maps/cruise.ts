// The Golden Years: Nana is spending the inheritance on a world cruise, and the
// family has come aboard. One deck (all at y = 0), the ship running east-west:
// the stern (and Nana's deckchair) to the west, the bow to the east, port is
// north (-z) and starboard south (+z).
//
//   x=284 (stern)                          x=300                     x=309.5  x=312.8
//   z=-8.3 ══════════[ LIFEBOAT 4 gap ]══════╗────────────────────────┬────────┐ port
//          ║ loungers   shuffleboard     hut  ║ CASINO LOUNGE  slots   ║ CABIN  │
//          ║                       cowl  ─door─ roulette      piano   door  │
//          ║   cousins                        ║                        │CORRIDOR│
//   z=0   chair  Nana        ┌──POOL──┐     ║════════════════════════│ Purser │
//          ║                 └────────┘     ║ CAPTAIN'S SALOON       │  desk  │
//          ║                       cowl  ─door─   [ dinner table ]    door  │
//          ║ loungers         plinth  BAR    ║      buffet  defib     │        │
//   z=8.3 ═══════════════════════════════════╝────────────────────────┴────────┘ starboard
//
// The Lido Deck is Nana's court (outdoors, long sunny views); the indoor rooms
// are for skulduggery, joined to the lido by the port and starboard doors and
// to each other by the cabin corridor. The star is the gap in the port
// bulwark ("LIFEBOAT 4 — GATE OUT OF ORDER"): a rope across it stops anyone
// walking, but a shoved (ragdolled) body tumbles over it and falls to the sea
// through the drop volume beyond, and is fished out (brought back) below it.
// Everywhere else the bulwark is a 'wall', which stops ragdolls too.
import type { Vec3 } from '../types.js';
import { WALL, box, pedestalTops, type Box, type MapDef } from './types.js';

/** Superstructure wall height and the bulwark (deck railing) height. */
export const CRUISE_ROOM_H = 3;
export const BULWARK_H = 1.1;
/** The lido runs from the stern (x = 284) to the superstructure's aft wall (x = 300). */
export const LIDO = { x0: 284, x1: 300 };
/** The gap in the port bulwark (x range) where the rope is. */
export const GAP = { x0: 291.6, x1: 293.4 };
/** Where the sea is (the client draws it here; the drop zone reaches below it). */
export const SEA_Y = -4.2;

const H = CRUISE_ROOM_H;
const B = BULWARK_H;
const HW = 8; // half width of the deck inside the bulwarks / side walls

const BOXES: Box[] = [
  // ── Decks (top at y = 0) ──
  box('floor', 283.7, -0.2, -HW - WALL, 300, 0, HW + WALL, 'Lido deck'),
  box('floor', 300, -0.2, -HW - WALL, 312.8, 0, HW + WALL, 'Superstructure deck'),

  // ── Lido bulwarks (waist-high walls: they stop ragdolls too) ──
  box('wall', 283.7, 0, -HW - WALL, 284, B, HW + WALL, 'Stern bulwark'),
  box('wall', 284, 0, -HW - WALL, GAP.x0, B, -HW, 'Port bulwark aft'),
  box('wall', GAP.x1, 0, -HW - WALL, 300, B, -HW, 'Port bulwark forward'),
  box('wall', 284, 0, HW, 300, B, HW + WALL, 'Starboard bulwark'),
  // The rope across the Lifeboat 4 gate: solid to anyone walking, but a railing, so a shoved body tumbles over it.
  box('railing', GAP.x0, 0, -HW - 0.25, GAP.x1, 1.0, -HW - 0.05, 'Lifeboat 4 rope'),

  // ── Superstructure walls ──
  // Aft wall (onto the lido) with the port and starboard doors (z -6.4..-4.6 and 4.6..6.4).
  box('wall', 300, 0, -HW - WALL, 300 + WALL, H, -6.4, 'Aft wall port end'),
  box('wall', 300, 0, -4.6, 300 + WALL, H, 4.6, 'Aft wall'),
  box('wall', 300, 0, 6.4, 300 + WALL, H, HW + WALL, 'Aft wall starboard end'),
  box('wall', 300, 2.3, -6.4, 300 + WALL, H, -4.6, 'Port door lintel'),
  box('wall', 300, 2.3, 4.6, 300 + WALL, H, 6.4, 'Starboard door lintel'),
  // Ship's sides and the forward bulkhead.
  // (Each side wall in two, so each part faces one room.)
  box('wall', 300 + WALL, 0, -HW - WALL, 309.65, H, -HW, 'Port side wall lounge'),
  box('wall', 309.65, 0, -HW - WALL, 312.8, H, -HW, 'Port side wall corridor'),
  box('wall', 300 + WALL, 0, HW, 309.65, H, HW + WALL, 'Starboard side wall saloon'),
  box('wall', 309.65, 0, HW, 312.8, H, HW + WALL, 'Starboard side wall corridor'),
  box('wall', 312.5, 0, -HW, 312.8, H, HW, 'Forward bulkhead'),
  // Between the lounge and the saloon.
  box('wall', 300 + WALL, 0, -0.15, 309.5, H, 0.15, 'Lounge-saloon wall'),
  // The corridor's west wall, with a door at each end (z -7.3..-5.5 into the lounge, 5.5..7.3 into the saloon).
  box('wall', 309.5, 0, -HW, 309.8, H, -7.3, 'Corridor wall north'),
  box('wall', 309.5, 0, -5.5, 309.8, H, 5.5, 'Corridor wall'),
  box('wall', 309.5, 0, 7.3, 309.8, H, HW, 'Corridor wall south'),
  box('wall', 309.5, 2.3, -7.3, 309.8, H, -5.5, 'Lounge corridor door lintel'),
  box('wall', 309.5, 2.3, 5.5, 309.8, H, 7.3, 'Saloon corridor door lintel'),
  box('ceiling', 300, H, -HW - WALL, 312.8, H + 0.3, HW + WALL, 'Superstructure ceiling'),

  // ── The Lido Deck ──
  box('chair', 284.3, 0, -0.7, 285.5, 1.0, 0.7, "Nana's deckchair"),
  // The raised pool: a rim too high to step over (a railing: a shoved body tumbles in), and a
  // bottom just high enough that anyone in it can step back out over the rim.
  box('railing', 292.6, 0, -1.8, 298.2, 0.5, -1.55, 'Pool rim north'),
  box('railing', 292.6, 0, 1.55, 298.2, 0.5, 1.8, 'Pool rim south'),
  box('railing', 292.6, 0, -1.55, 292.85, 0.5, 1.55, 'Pool rim west'),
  box('railing', 297.95, 0, -1.55, 298.2, 0.5, 1.55, 'Pool rim east'),
  box('slab', 292.85, 0, -1.55, 297.95, 0.1, 1.55, 'Pool bottom'),
  // Sun loungers (low, solid).
  box('counter', 285.6, 0, -7.8, 286.3, 0.5, -6.1, 'Lounger port 1'),
  box('counter', 287.1, 0, -7.8, 287.8, 0.5, -6.1, 'Lounger port 2'),
  box('counter', 285.6, 0, 6.1, 286.3, 0.5, 7.8, 'Lounger starboard 1'),
  box('counter', 287.1, 0, 6.1, 287.8, 0.5, 7.8, 'Lounger starboard 2'),
  box('counter', 288.6, 0, 6.1, 289.3, 0.5, 7.8, 'Lounger starboard 3'),
  box('counter', 294, 0, 7.1, 298.6, 1.1, HW, 'Lido bar'),
  box('wall', 298.4, 0, -HW, 300, 2.4, -6.6, 'Towel hut'),
  box('wall', 295.6, 0, -5.2, 296.3, 2.3, -4.5, 'Ventilator port'),
  box('wall', 295.6, 0, 4.5, 296.3, 2.3, 5.2, 'Ventilator starboard'),

  // ── Casino Lounge ──
  box('counter', 304.4, 0, -6.4, 305.2, 1.8, -4.0, 'Slot machines'),
  box('counter', 306.4, 0, -3.6, 308.2, 1.0, -1.9, 'Grand piano'),
  box('counter', 301.8, 0, -3.0, 303.8, 0.9, -1.9, 'Roulette table'),

  // ── Captain's Saloon ──
  box('table', 303.2, 0, 3.3, 307.0, 0.78, 4.7, "Captain's table"),
  box('counter', 302.6, 0, 7.3, 306.6, 0.95, HW, 'Buffet'),

  // ── Cabin Corridor ──
  box('counter', 311.6, 0, -1.2, 312.5, 1.1, 1.2, "Purser's desk"),
  box('counter', 311.9, 0, -4.4, 312.5, 1.0, -3.3, 'Cleaning trolley'),

  // ── Heirloom plinths (she insisted on bringing them aboard) ──
  box('pedestal', 290.7, 0, -7.9, 291.4, 1.0, -7.2, 'Plinth by Lifeboat 4'),
  box('pedestal', 284.3, 0, 2.0, 285.0, 1.0, 2.7, "Plinth by Nana's deckchair"),
  box('pedestal', 293.2, 0, -3.6, 293.9, 1.0, -2.9, 'Plinth by the pool'),
  box('pedestal', 292.6, 0, 7.2, 293.3, 1.0, 7.9, 'Plinth by the bar'),
  box('pedestal', 300.6, 0, -7.7, 301.3, 1.0, -7.0, 'Plinth lounge door'),
  box('pedestal', 308.5, 0, -0.95, 309.2, 1.0, -0.25, 'Plinth by the piano'),
  box('pedestal', 300.6, 0, 0.5, 301.3, 1.0, 1.2, 'Plinth saloon corner'),
  box('pedestal', 308.5, 0, 0.5, 309.2, 1.0, 1.2, 'Plinth saloon east'),
  box('pedestal', 311.7, 0, -7.9, 312.4, 1.0, -7.2, 'Plinth corridor north'),
  box('pedestal', 311.7, 0, 7.2, 312.4, 1.0, 7.9, 'Plinth corridor south'),
];

const G = (x: number, z: number): Vec3 => ({ x, y: 0, z });

const LIDO_NAV: Vec3[] = [
  G(287, -3), G(287, 3), G(286, -5.2), G(286, 5.2), G(290.5, -4.6), G(290.5, 4.6),
  G(295.5, -6), G(295.5, -3.2), G(295.5, 3.2), G(299.1, 0), G(289, 0), G(292, 4.2),
  G(299.1, -3.4), G(299.1, 3.4), G(292.5, -5.0),
  // Port and starboard doors (lido side).
  G(299.2, -5.5), G(299.2, 5.5),
];

const GROUND: Vec3[] = [
  ...LIDO_NAV,
  // Port and starboard doors (inside).
  G(301.1, -5.5), G(301.1, 5.5),
  // Casino Lounge.
  G(302.8, -7.0), G(303.0, -4.2), G(306.3, -5.0), G(301.0, -1.0), G(305.1, -1.0),
  // Lounge and saloon doors into the corridor (both sides).
  G(308.7, -6.4), G(310.9, -6.4), G(308.7, 6.4), G(310.9, 6.4),
  // Captain's Saloon.
  G(302.0, 2.2), G(305.1, 1.6), G(308.3, 2.5), G(305.1, 6.3), G(301.6, 7.0),
  // Cabin Corridor.
  G(310.8, -3.85), G(310.8, 0), G(311.6, -2.4), G(311.2, 3.5),
];

export const CRUISE: MapDef = {
  id: 'cruise',
  name: 'The Golden Years',
  blurb: "Nana is spending your inheritance on a world cruise. Mind the gap in the railings.",
  bounds: { min: { x: 282.5, y: -10, z: -17 }, max: { x: 314, y: 10, z: 9.5 } },
  inside: [
    // The Lido Deck (open to the sky: things thrown high come down again).
    { min: { x: 283.4, y: -1, z: -HW - 0.6 }, max: { x: 300.3, y: 8, z: HW + 0.6 } },
    // The superstructure: lounge, saloon and cabin corridor.
    { min: { x: 299.8, y: -1, z: -HW - 0.6 }, max: { x: 313.1, y: H + 0.3, z: HW + 0.6 } },
  ],
  // Over the side by the Lifeboat 4 gate, down to below the sea: the fall is seen, then the splash.
  drops: [{ min: { x: 287, y: -6, z: -16 }, max: { x: 298, y: 8, z: -HW } }],
  voidFloor: -8,
  lostToast: 'Man overboard! {name} is fished out of the sea, damp and disinherited-looking.',
  boxes: BOXES,
  ramps: [],
  rooms: [
    { name: 'Cabin Corridor', min: { x: 309.5, y: 0, z: -HW }, max: { x: 312.8, y: H, z: HW } },
    { name: 'Casino Lounge', min: { x: 300, y: 0, z: -HW }, max: { x: 309.5, y: H, z: 0 } },
    { name: "Captain's Saloon", min: { x: 300, y: 0, z: 0 }, max: { x: 309.5, y: H, z: HW } },
    { name: 'Lido Deck', min: { x: 283.7, y: 0, z: -HW }, max: { x: 300, y: 6, z: HW } },
  ],
  spawns: {
    // Nana in front of her deckchair at the stern, looking forward down the lido.
    grandma: G(286.6, 0),
    grandmaYaw: -Math.PI / 2,
    cousins: [
      G(289.9, -0.9), G(289.9, 0.9), G(291.6, -1.85), G(291.6, 1.85),
      G(291.6, 0), G(289.9, -2.7), G(289.9, 2.7),
    ],
    // Family Dinner at the Captain's table: Nana at its head (west end), looking down it.
    dinnerGrandma: G(302.5, 4.0),
    dinnerGrandmaYaw: -Math.PI / 2,
    dinnerCousins: [
      G(303.9, 2.7), G(303.9, 5.3), G(305.1, 2.7), G(305.1, 5.3),
      G(306.3, 2.7), G(306.3, 5.3), G(307.65, 4.0),
    ],
    cat: G(291, 5),
    // The teacup sits on the lido bar.
    teacup: { x: 295.2, y: 1.1, z: 7.55 },
    pills: [
      { x: 312.2, y: 1.0, z: -3.85 }, // on the cleaning trolley
      { x: 285.95, y: 0.5, z: 6.95 }, // on a sun lounger
      { x: 308.9, y: 0, z: -2.75 }, // behind the piano
      { x: 304.6, y: 0.95, z: 7.65 }, // on the buffet
    ],
  },
  heirloomSpots: pedestalTops(BOXES),
  dinner: { table: { minX: 303.2, maxX: 307.0, minZ: 3.3, maxZ: 4.7 }, door: { x: 300.7, z: 5.5 }, doorName: 'the saloon door' },
  nav: {
    ground: GROUND,
    beat: LIDO_NAV.filter((p) => p.x < 299),
  },
};
