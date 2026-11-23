// Sunny Pines Care Home: Nana has been moved in "for her own good", and the
// family visits. Mint walls, pastel lino, fluorescent cheer, and every corner
// quietly counting down. One storey, 3 m ceilings, x 86..113 (local -14..13).
//
// Local coordinates (x relative to X = 100; z as is). North (-z) is up.
// ═ doorway, ▒ glass panel (see-through for Nana, solid for everyone), P plinth.
//
//     x: -14       -8                             6   8.4          13
// z=-10  ┌─────────┬──────────────────────────────┬────┬────────────┐
//        │ SUN     │ DINING HALL  menu  hatch(tea)│fire│ NURSES'    │
//        │ LOUNGE  │ P5  ┌──────────────┐      P6 │exit│ STATION    │
//        │ P7 palm ═     │ FAMILY TABLE │ table 2 ═ C  ▒ desk  meds │
//        │ jigsaw  │     └──────────────┘ trolley │ O  ═ drugs  P11 │
//        │         ├──────────────────────═───────┤ R  ├────═───────┤ z=-3.5 / -3
//        │ white-  ═ P1  fish tank   bingo║  ⌒  ⌒ │ R  │ SLUICE     │
//        │ board   │ Nana's chair  cousins  ⌒ TV  │ I  ═ shelves  wm│
//        │         │ P2 rug         coffee ⌒  ⌒   │ D  ├────────────┤ z=2.4
//        │ yoga P8 │    piano     P3  ▒▒glass▒▒   │ O  │ RECEPTION  │
// z=6    ├──═──────┴───────═────────────────────┘ R     desk  tree ▯│
//        │ RESIDENTS' CORRIDOR: rooms 1-6, Lost Property  scooters  │
// z=8.4  └──────────────────────────────────────────────────────────┘
//
// Loops: Day Room → Dining Hall → corridor (east) → corridor (south) → Day Room,
// and Day Room → Sun Lounge → corridor (south) → Day Room; the Nurses' Station
// and the Sluice Room connect to each other and both open onto the corridor.
// Glass panels (railings: solid, but Nana sees through them) let her peer from
// the Day Room into the corridor and from the corridor into the meds room.
import type { Vec3 } from '../types.js';
import { WALL, box, pedestalTops, type Box, type MapDef, type Room } from './types.js';

export const CAREHOME_X = 100;
const X = CAREHOME_X;
/** Ceiling height everywhere. */
export const CAREHOME_H = 3;
const H = CAREHOME_H;
/** Doorway lintels start here; glass panels run from SILL to HEAD. */
const LINTEL = 2.3;
const SILL = 1.0;
const HEAD = 2.1;

const W2 = WALL / 2;

/** A box in local coordinates (x relative to X). */
const B = (kind: Box['kind'], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, label: string, solid = true): Box =>
  box(kind, X + x0, y0, z0, X + x1, y1, z1, label, solid);

type Gap = [from: number, to: number, kind?: 'door' | 'glass'];

/**
 * A wall along a line, with doorways (lintel above) and glass panels (wall
 * below and above, a see-through railing between). `axis` 'x': the wall runs
 * along x at z = `at`; 'z': along z at x = `at`. `t0..t1` across the line.
 */
function wallLine(axis: 'x' | 'z', at: number, from: number, to: number, gaps: Gap[], label: string, t0 = at - W2, t1 = at + W2): Box[] {
  const out: Box[] = [];
  const seg = (a: number, b: number, y0: number, y1: number, kind: Box['kind'], what: string) => {
    if (b - a < 1e-3) return;
    out.push(axis === 'x' ? B(kind, a, y0, t0, b, y1, t1, `${label} ${what}`) : B(kind, t0, y0, a, t1, y1, b, `${label} ${what}`));
  };
  const sorted = [...gaps].sort((p, q) => p[0] - q[0]);
  let cur = from;
  for (const [a, b, kind] of sorted) {
    seg(cur, a, 0, H, 'wall', 'wall');
    if (kind === 'glass') {
      seg(a, b, 0, SILL, 'wall', 'under the glass');
      seg(a, b, SILL, HEAD, 'railing', 'glass');
      seg(a, b, HEAD, H, 'wall', 'over the glass');
    } else {
      seg(a, b, LINTEL, H, 'wall', 'lintel');
    }
    cur = b;
  }
  seg(cur, to, 0, H, 'wall', 'wall');
  return out;
}

// The doorways (local), shared with the renderer for door frames.
export const CAREHOME_DOORS = {
  dayToDining: { axis: 'x' as const, at: -3.5, a: 2.6, b: 4.6 },
  dayToLounge: { axis: 'z' as const, at: -8, a: -2.9, b: -1.1 },
  dayToCorridor: { axis: 'x' as const, at: 6, a: -2.6, b: -0.6 },
  diningToLounge: { axis: 'z' as const, at: -8, a: -8.4, b: -6.6 },
  diningToCorridor: { axis: 'z' as const, at: 6, a: -8.4, b: -6.6 },
  loungeToCorridor: { axis: 'x' as const, at: 6, a: -12.6, b: -10.8 },
  corridorToNurses: { axis: 'z' as const, at: 8.4, a: -5.8, b: -4.0 },
  corridorToSluice: { axis: 'z' as const, at: 8.4, a: -0.9, b: 0.9 },
  nursesToSluice: { axis: 'x' as const, at: -3, a: 10.6, b: 12.4 },
};
const D = CAREHOME_DOORS;

const BOXES: Box[] = [
  // ── Floors (top at y = 0), one per room for its own lino ──
  B('floor', -8, -0.2, -3.5, 6, 0, 6, 'Day Room floor'),
  B('floor', -8, -0.2, -10, 6, 0, -3.5, 'Dining Hall floor'),
  B('floor', -14, -0.2, -10, -8, 0, 6, 'Sun Lounge floor'),
  B('floor', -14, -0.2, 6, 8.4, 0, 8.4, 'Corridor floor (south)'),
  B('floor', 6, -0.2, -10, 8.4, 0, 6, 'Corridor floor (east)'),
  B('floor', 8.4, -0.2, -10, 13, 0, -3, "Nurses' Station floor"),
  B('floor', 8.4, -0.2, -3, 13, 0, 2.4, 'Sluice Room floor'),
  B('floor', 8.4, -0.2, 2.4, 13, 0, 8.4, 'Reception floor'),

  // ── One ceiling over everything: nothing thrown leaves Sunny Pines ──
  B('ceiling', -14 - WALL, H, -10 - WALL, 13 + WALL, H + 0.3, 8.4 + WALL, 'Ceiling'),

  // ── Outer walls ──
  B('wall', -14 - WALL, 0, -10 - WALL, 13 + WALL, H, -10, 'North wall'),
  B('wall', -14 - WALL, 0, 8.4, 13 + WALL, H, 8.4 + WALL, 'South wall'),
  B('wall', -14 - WALL, 0, -10, -14, H, 8.4, 'West wall'),
  B('wall', 13, 0, -10, 13 + WALL, H, 8.4, 'East wall'),

  // ── Inner walls ──
  // Sun Lounge | Dining Hall + Day Room
  ...wallLine('z', -8, -10, 6, [[D.diningToLounge.a, D.diningToLounge.b], [D.dayToLounge.a, D.dayToLounge.b]], 'Sun Lounge east'),
  // Dining Hall | Day Room
  ...wallLine('x', -3.5, -8 + W2, 6 - W2, [[D.dayToDining.a, D.dayToDining.b]], 'Day Room north'),
  // Dining Hall + Day Room | the corridor's east arm (the telly wall: no door)
  ...wallLine('z', 6, -10, 6 + W2, [[D.diningToCorridor.a, D.diningToCorridor.b]], 'Corridor west'),
  // Sun Lounge + Day Room | the corridor's south arm (a glass panel onto the corridor)
  ...wallLine('x', 6, -14, 6 - W2, [[D.loungeToCorridor.a, D.loungeToCorridor.b], [D.dayToCorridor.a, D.dayToCorridor.b], [1.6, 4.6, 'glass']], 'Corridor north'),
  // The corridor's east arm | Nurses' Station + Sluice Room (glass onto the meds room); reception is open
  ...wallLine('z', 8.4, -10, 3.4, [[-9.2, -6.8, 'glass'], [D.corridorToNurses.a, D.corridorToNurses.b], [D.corridorToSluice.a, D.corridorToSluice.b]], 'Corridor east'),
  // Nurses' Station | Sluice Room
  ...wallLine('x', -3, 8.4 + W2, 13, [[D.nursesToSluice.a, D.nursesToSluice.b]], 'Sluice north'),
  // Sluice Room | Reception
  ...wallLine('x', 2.4, 8.4 + W2, 13, [], 'Sluice south'),

  // ── The Day Room: Nana's court ──
  B('chair', -7.6, 0, 0.6, -6.4, 1.0, 1.8, "Nana's wing chair"),
  B('table', -7.6, 0, 2.2, -7.0, 0.6, 2.8, "Nana's side table"),
  B('counter', -4.4, 0, -3.35, -2.6, 0.85, -2.85, 'Fish tank cabinet'),
  B('counter', 1.0, 0, -3.35, 1.25, 2.1, -1.6, 'Bingo board'),
  B('counter', -5.0, 0, 3.9, -3.5, 1.3, 4.5, 'Piano nobody plays'),
  B('counter', 5.25, 0, -0.3, 5.85, 0.7, 2.3, 'Telly cabinet'),
  B('table', 3.9, 0, 0.6, 4.7, 0.5, 1.4, 'Coffee table'),
  // Residents' armchairs in a semicircle round the telly.
  B('counter', 2.0, 0, 0.6, 2.8, 1.0, 1.4, 'Armchair (centre)'),
  B('counter', 2.75, 0, -1.46, 3.55, 1.0, -0.66, 'Armchair (north)'),
  B('counter', 2.75, 0, 2.66, 3.55, 1.0, 3.46, 'Armchair (south)'),
  B('counter', 4.64, 0, -2.55, 5.44, 1.0, -1.75, 'Armchair (far north)'),
  B('counter', 4.64, 0, 3.75, 5.44, 1.0, 4.55, "Armchair (reserved for Mr Pearce)"),
  B('pedestal', -7.65, 0, -0.6, -6.85, 1.0, 0.2, "Nana's Things, north of her chair"),
  B('pedestal', -7.65, 0, 3.4, -6.85, 1.0, 4.2, "Nana's Things, south of her chair"),
  B('pedestal', 0.0, 0, 5.05, 0.8, 1.0, 5.85, 'Day Room plinth by the glass'),

  // ── The Dining Hall ──
  B('table', -4.0, 0, -7.6, 1.0, 0.78, -6.0, 'Family Dinner table'),
  B('counter', 2.2, 0, -9.85, 4.6, 1.0, -9.4, 'Serving hatch ledge'),
  B('table', 2.9, 0, -6.6, 4.5, 0.75, -5.4, 'Table 2 (residents)'),
  B('counter', 4.6, 0, -5.0, 5.6, 1.0, -4.4, 'Tray trolley'),
  B('counter', -7.85, 0, -6.0, -7.35, 2.0, -4.4, 'Welsh dresser'),
  B('pedestal', -7.6, 0, -9.6, -6.8, 1.0, -8.8, "Nana's silver, Dining Hall"),
  B('pedestal', 5.0, 0, -9.6, 5.8, 1.0, -8.8, 'Dining Hall plinth by the hatch'),

  // ── The Sun Lounge (activities) ──
  B('table', -12.6, 0, -6.0, -11.4, 0.75, -4.8, 'Jigsaw table (north)'),
  B('table', -10.4, 0, 1.6, -9.2, 0.75, 2.8, 'Jigsaw table (south)'),
  B('counter', -12.0, 0, -0.1, -10.2, 1.9, 0.15, "Whiteboard: today's activities"),
  B('counter', -13.75, 0, -9.75, -13.15, 1.9, -9.15, 'Potted palm (north-west)'),
  B('counter', -8.85, 0, 5.15, -8.25, 1.9, 5.75, 'Potted palm (south-east)'),
  B('pedestal', -11.4, 0, -9.7, -10.6, 1.0, -8.9, 'Sun Lounge plinth (north)'),
  B('pedestal', -13.7, 0, 3.0, -12.9, 1.0, 3.8, 'Sun Lounge plinth by the yoga mats'),

  // ── The Residents' Corridor ──
  B('counter', -5.2, 0, 7.7, -4.2, 1.0, 8.25, 'Tea trolley (parked)'),
  B('counter', -9.2, 0, 7.85, -8.0, 0.85, 8.25, 'Lost Property table'),
  B('counter', 6.25, 0, -9.85, 7.4, 1.6, -9.35, 'Vending machine (out of order)'),
  B('counter', 6.15, 0, 2.1, 6.75, 0.95, 2.7, 'Wheelchair (parked)'),

  // ── The Nurses' Station ──
  B('counter', 8.55, 0, -9.4, 9.15, 1.0, -6.6, "Nurses' desk"),
  B('counter', 10.0, 0, -9.85, 12.6, 2.0, -9.35, 'Medication cabinet'),
  B('counter', 11.0, 0, -7.0, 11.9, 1.0, -6.4, 'Drugs trolley'),
  B('pedestal', 12.05, 0, -5.6, 12.85, 1.0, -4.8, "Nurses' Station: confiscated"),

  // ── The Sluice Room (staff only) ──
  B('counter', 12.25, 0, -1.0, 12.85, 0.9, 1.6, 'Washing machines'),
  B('counter', 9.2, 0, 1.65, 10.4, 0.9, 2.25, 'Sluice sink'),
  B('counter', 10.2, 0, -1.6, 10.6, 1.9, 0.6, 'Shelving: Absorbent Products'),
  B('counter', 9.0, 0, -2.6, 9.8, 0.9, -2.0, 'Laundry cart'),

  // ── Reception ──
  B('counter', 9.8, 0, 2.55, 11.8, 1.1, 3.25, 'Reception desk'),
  B('counter', 12.2, 0, 3.0, 12.8, 1.8, 3.6, 'Oxygen-tank Christmas tree'),
  B('counter', 9.2, 0, 7.0, 9.85, 1.1, 8.2, 'Mobility scooter 1'),
  B('counter', 10.25, 0, 7.0, 10.9, 1.1, 8.2, 'Mobility scooter 2'),
  B('counter', 11.3, 0, 7.0, 11.95, 1.1, 8.2, 'Mobility scooter 3'),
  B('pedestal', 12.05, 0, 7.4, 12.85, 1.0, 8.2, 'Reception plinth: awaiting collection'),
];

const L = (x: number, z: number, y = 0): Vec3 => ({ x: X + x, y, z });
const R = (name: string, x0: number, z0: number, x1: number, z1: number): Room => ({ name, min: { x: X + x0, y: 0, z: z0 }, max: { x: X + x1, y: H, z: z1 } });

const GROUND: Vec3[] = [
  // Day Room
  L(-4.6, -1.6), L(-4.4, 2.6), L(-1.2, 1.2), L(1.7, 3.4), L(1.6, -0.6), L(3.4, 5.0), L(-5.8, 5.1),
  // Day Room ↔ Dining Hall doorway (both sides)
  L(3.6, -2.6), L(3.6, -4.4), L(2.1, -2.6),
  // Day Room ↔ Sun Lounge doorway (both sides)
  L(-7.1, -2.0), L(-8.9, -2.0),
  // Day Room ↔ corridor doorway (both sides)
  L(-1.6, 5.1), L(-1.6, 7.2),
  // Dining Hall
  L(-5.6, -4.5), L(-1.5, -9.0), L(2.4, -8.2),
  // Dining Hall ↔ Sun Lounge, Dining Hall ↔ corridor (both sides)
  L(-7.1, -7.5), L(-8.9, -7.5), L(5.1, -7.5), L(7.2, -7.5),
  // Sun Lounge
  L(-11.0, -8.2), L(-11.0, -3.2), L(-11.0, 3.6),
  // Sun Lounge ↔ corridor (both sides)
  L(-11.7, 5.1), L(-11.7, 7.2),
  // Residents' corridor
  L(-4.0, 7.15), L(2.8, 7.2), L(7.2, 7.2), L(7.2, 3.0), L(7.2, -8.9),
  // Corridor ↔ Nurses' Station, corridor ↔ Sluice Room (both sides)
  L(7.2, -4.9), L(9.5, -4.9), L(7.2, 0), L(9.5, 0),
  // Nurses' Station ↔ Sluice Room (both sides), and inside each
  L(11.5, -3.9), L(11.5, -2.1), L(10.2, -8.0), L(11.4, 1.1),
  // Reception
  L(10.6, 5.1),
];

const BEAT: Vec3[] = [
  L(-4.6, -1.6), L(-4.4, 2.6), L(-1.2, 1.2), L(-1.6, -2.3), L(1.7, 3.4), L(1.6, -0.6), L(3.4, 5.0), L(-5.8, 5.1),
  L(3.6, -2.6), L(-1.5, -4.5), L(2.4, -8.2),
];

export const CAREHOME: MapDef = {
  id: 'carehome',
  name: 'Sunny Pines Care Home',
  blurb: 'Nana\'s new home, for her own good. Bingo at two, chair yoga at three, the will at four.',
  bounds: { min: { x: X - 15.5, y: -4, z: -11.5 }, max: { x: X + 14.5, y: 5, z: 10 } },
  inside: [{ min: { x: X - 14.4, y: -1, z: -10.4 }, max: { x: X + 13.4, y: H + 0.4, z: 8.8 } }],
  boxes: BOXES,
  ramps: [],
  rooms: [
    R("Nurses' Station", 8.4, -10, 13, -3),
    R('Sluice Room', 8.4, -3, 13, 2.4),
    R('Reception', 8.4, 2.4, 13, 8.4),
    R('Sun Lounge', -14, -10, -8, 6),
    R('Dining Hall', -8, -10, 6, -3.5),
    R('Day Room', -8, -3.5, 6, 6),
    R("Residents' Corridor", -14, 6, 8.4, 8.4),
    R("Residents' Corridor", 6, -10, 8.4, 6),
  ],
  spawns: {
    // Nana in front of her wing chair, holding court, facing down the Day Room to the telly.
    grandma: L(-5.5, 1.2), grandmaYaw: -Math.PI / 2,
    cousins: [L(-2.2, 0.3), L(-2.2, 2.1), L(-0.4, 1.2), L(-0.4, -0.6), L(-0.4, 3.0), L(-2.2, -1.5), L(-2.2, 3.9)],
    // Family Dinner: Nana at the head of the long table, looking down it to the hatch end.
    dinnerGrandma: L(-4.75, -6.8), dinnerGrandmaYaw: -Math.PI / 2,
    dinnerCousins: [L(-3.0, -8.3), L(-3.0, -5.3), L(-1.5, -8.3), L(-1.5, -5.3), L(0.0, -8.3), L(0.0, -5.3), L(1.75, -6.8)],
    cat: L(0.6, 4.2),
    // The teacup waits on the serving-hatch ledge.
    teacup: L(3.4, -9.62, 1.0),
    pills: [
      L(11.45, -6.7, 1.0), // on the drugs trolley, naturally
      L(-12.0, -5.4), // under the north jigsaw table
      L(5.1, -4.7, 1.0), // on the tray trolley
      L(9.4, -2.3, 0.9), // in the laundry cart
    ],
  },
  heirloomSpots: pedestalTops(BOXES),
  dinner: { table: { minX: X - 4, maxX: X + 1, minZ: -7.6, maxZ: -6.0 }, door: { x: X + 6, z: -7.5 }, doorName: 'the dining-hall door' },
  nav: { ground: GROUND, beat: BEAT },
  lostToast: '{name} wandered off and was returned by a nice man in a tabard.',
};
