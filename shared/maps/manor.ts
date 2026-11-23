// Harrowgate Manor (the first map): the family seat. The front hall (Nana's
// court) with its grand staircase up to the Portrait Gallery and the kitchen
// are where they always were; around them now run the Drawing Room and its
// glass Conservatory to the west, the Library (stacks of tall bookcases) and
// the Dining Room (laid for a wake that has not happened yet) to the north,
// and Grandpa's Study, the Billiard Room and the Scullery to the east, so
// every room can be reached two ways: two loops round the hall, and a long
// enfilade (hall, drawing room, conservatory) on the z = 0 line.
//
// Plan (x east, z south; ═ doorways, ▣ heirloom pedestals, ▮ tall furniture).
// Heights: hall 6 (gallery at y = 3 over z -12..-8), drawing room and dining
// room 4.2, library 5.2, conservatory 5 (glass), study and billiard room 3.4,
// kitchen and scullery 3.
//
//  x=-30      -22.3                -8.3                 8.3       16.3      20.3
// z=-21 ┌──────┬─────────────────────┬────────────────────┬─────────┐
//       │      │▣ ▮▮ bays ▮▮ ▮▮ ▣    │▣ silver ▓fire▓  armour│▣ STUDY   │
//       │      │ ▓  ───main aisle─── ═  [====table====]  ═  desk ▮  │
//       │      │ fire ▮▮  ▮▮  ▮▮ tbl │ DINING ROOM sideboard│  safe   │
// z=-15 ├──────┤ LIBRARY  stacks     ├══┬═══════════════┬══┼═════════┴────┐z=-13.8
//       │CONSER│      globe   desk   │  │ (under gallery)│  ═ BILLIARD ROOM │
//       │VATORY═ reading area        │ ▮col  stairs   col▮ │ [=table=]  bar │
//  z=-6 │ ▣    ├════════┬────────────┤                     ├────┬─────┬══──┤z=-6.3
//       │ fountain  DRAWING ROOM ▓fire▮clock HALL          │ KITCHEN  ═SCUL-│
//       │      ═ piano  settees      ═   Nana's chair     ═  [table]  │LERY │
//       │palms │ harp ▣   screen▮ ▣  │      front door     │   pantry │ sink│
//  z=6  └──────┴─────────────────────┴─────────────────────┴──────────┴─────┘
import type { Vec3 } from '../types.js';
import { WALL, box, pedestalTops, type Box, type BoxKind, type MapDef } from './types.js';

export const GALLERY_Y = 3;
export const HALL_HEIGHT = 6;
export const KITCHEN_HEIGHT = 3;

/** Ceiling heights of the new rooms. */
export const MANOR_HEIGHTS = {
  drawing: 4.2, conservatory: 5, library: 5.2, dining: 4.2, study: 3.4, billiard: 3.4, scullery: 3,
} as const;
const HT = MANOR_HEIGHTS;
const W = WALL;

/** A doorway in a wall: from, to (along the wall), and the lintel's height. */
type Gap = [number, number, number];

/** A wall running along x (thickness z0..z1) from x0 to x1, with doorway gaps. */
function wallX(x0: number, x1: number, z0: number, z1: number, h: number, label: string, gaps: Gap[] = [], kind: BoxKind = 'wall'): Box[] {
  const out: Box[] = [];
  let at = x0;
  gaps.forEach(([a, b, top], i) => {
    if (a > at) out.push(box(kind, at, 0, z0, a, h, z1, `${label} ${i + 1}`));
    if (top < h) out.push(box(kind, a, top, z0, b, h, z1, `${label} lintel ${i + 1}`));
    at = b;
  });
  if (x1 > at) out.push(box(kind, at, 0, z0, x1, h, z1, gaps.length ? `${label} ${gaps.length + 1}` : label));
  return out;
}

/** A wall running along z (thickness x0..x1) from z0 to z1, with doorway gaps. */
function wallZ(z0: number, z1: number, x0: number, x1: number, h: number, label: string, gaps: Gap[] = [], kind: BoxKind = 'wall'): Box[] {
  const out: Box[] = [];
  let at = z0;
  gaps.forEach(([a, b, top], i) => {
    if (a > at) out.push(box(kind, x0, 0, at, x1, h, a, `${label} ${i + 1}`));
    if (top < h) out.push(box(kind, x0, top, a, x1, h, b, `${label} lintel ${i + 1}`));
    at = b;
  });
  if (z1 > at) out.push(box(kind, x0, 0, at, x1, h, z1, gaps.length ? `${label} ${gaps.length + 1}` : label));
  return out;
}

/** Doorways (centres): the enfilade on z = 0, the library/dining/study axis on z = -16.65. */
const AXIS_N = -16.65;

const BOXES: Box[] = [
  // ───────── Floors (top surface at y = 0; they meet under the walls) ─────────
  box('floor', -8, -0.2, -12, 8, 0, 6, 'Front hall floor'),
  box('floor', 8, -0.2, -6, 16, 0, 6, 'Kitchen floor'),
  box('floor', -22.3, -0.2, -6.3, -8, 0, 6.3, 'Drawing room floor'),
  box('floor', -30.3, -0.2, -15.3, -22.3, 0, 6.3, 'Conservatory floor'),
  box('floor', -22.3, -0.2, -21.3, -8, 0, -6.3, 'Library floor'),
  box('floor', -8.3, -0.2, -21.3, 8.3, 0, -12, 'Dining room floor'),
  box('floor', 8, -0.2, -21.3, 16.6, 0, -13.5, 'Study floor'),
  box('floor', 8, -0.2, -13.8, 20.6, 0, -6, 'Billiard room floor'),
  box('floor', 16, -0.2, -6.3, 20.6, 0, 3.3, 'Scullery floor'),

  // Gallery slab (top surface at y = 3), with the stair opening between x -1.5..1.5 at z -8..-7.6 handled by the ramp
  box('slab', -8, GALLERY_Y - 0.2, -12, 8, GALLERY_Y, -8, 'Heirloom gallery'),

  // ───────── Ceilings: nothing thrown can leave the house ─────────
  box('ceiling', -8.3, HALL_HEIGHT, -12.3, 8.3, HALL_HEIGHT + 0.3, 6.3, 'Hall ceiling'),
  box('ceiling', 8, KITCHEN_HEIGHT, -6.3, 16.3, KITCHEN_HEIGHT + 0.3, 6.3, 'Kitchen ceiling'),
  box('ceiling', -22.3, HT.drawing, -6.3, -8, HT.drawing + 0.3, 6.3, 'Drawing room ceiling'),
  box('ceiling', -30.3, HT.conservatory, -15.3, -22, HT.conservatory + 0.3, 6.3, 'Conservatory roof'),
  box('ceiling', -22.3, HT.library, -21.3, -8, HT.library + 0.3, -6, 'Library ceiling'),
  box('ceiling', -8.3, HT.dining, -21.3, 8.3, HT.dining + 0.3, -12, 'Dining room ceiling'),
  box('ceiling', 8, HT.study, -21.3, 16.6, HT.study + 0.3, -13.5, 'Study ceiling'),
  box('ceiling', 8, HT.billiard, -13.8, 20.6, HT.billiard + 0.3, -6, 'Billiard room ceiling'),
  box('ceiling', 16, HT.scullery, -6.3, 20.6, HT.scullery + 0.3, 3.3, 'Scullery ceiling'),

  // Gallery railing along z = -8, leaving a gap for the stairs (x -1.5..1.5)
  box('railing', -8, GALLERY_Y, -8.1, -1.5, GALLERY_Y + 1, -7.9, 'Gallery railing west'),
  box('railing', 1.5, GALLERY_Y, -8.1, 8, GALLERY_Y + 1, -7.9, 'Gallery railing east'),
  // Stair side rails (so you fall off the sides only when shoved hard: low rails)
  box('railing', -1.6, 0, -8, -1.5, 0.5, -2, 'Stair rail west', false),
  box('railing', 1.5, 0, -8, 1.6, 0.5, -2, 'Stair rail east', false),

  // ───────── The front hall's walls ─────────
  // North wall: two doorways under the gallery into the dining room.
  ...wallX(-8 - W, 8 + W, -12 - W, -12, HALL_HEIGHT, 'Hall north wall', [[-5.4, -3.4, 2.4], [3.4, 5.4, 2.4]]),
  box('wall', -8 - W, 0, 6, 8 + W, HALL_HEIGHT, 6 + W, 'South wall'),
  // West wall: the double doors into the drawing room (the enfilade).
  ...wallZ(-12, 6, -8 - W, -8, HALL_HEIGHT, 'Hall west wall', [[-1.2, 1.2, 3.0]]),
  // East wall: under the gallery into the billiard room, and the kitchen doorway at z -1.5..1.5.
  ...wallZ(-12, -1.5, 8, 8 + W, HALL_HEIGHT, 'East wall north', [[-10.9, -8.9, 2.4]]),
  box('wall', 8, 0, 1.5, 8 + W, HALL_HEIGHT, 6, 'East wall south'),
  box('wall', 8, 2.4, -1.5, 8 + W, HALL_HEIGHT, 1.5, 'Kitchen doorway lintel'),
  // The gallery's two columns (they hold it up; good to lurk behind).
  box('wall', -6.42, 0, -8.22, -5.98, GALLERY_Y - 0.2, -7.78, 'Hall column west'),
  box('wall', 5.98, 0, -8.22, 6.42, GALLERY_Y - 0.2, -7.78, 'Hall column east'),
  box('wall', -8, 0, -2.75, -7.45, 2.3, -2.05, 'Grandfather clock'),

  // ───────── Kitchen walls ─────────
  box('wall', 8, 0, -6 - W, 16 + W, HT.billiard, -6, 'Kitchen north wall'),
  box('wall', 8, 0, 6, 16 + W, KITCHEN_HEIGHT, 6 + W, 'Kitchen south wall'),
  ...wallZ(-6, 6, 16, 16 + W, KITCHEN_HEIGHT, 'Kitchen east wall', [[-4.6, -2.6, 2.3]]),
  // Pantry walls (x 13..16, z 3..6) with a door gap at x 13.8..14.8 on its north side (z = 3)
  box('wall', 13 - W / 2, 0, 3, 13 + W / 2, KITCHEN_HEIGHT, 6, 'Pantry west wall'),
  box('wall', 13, 0, 3 - W / 2, 13.8, KITCHEN_HEIGHT, 3 + W / 2, 'Pantry north wall west'),
  box('wall', 14.8, 0, 3 - W / 2, 16, KITCHEN_HEIGHT, 3 + W / 2, 'Pantry north wall east'),

  // ───────── Drawing room (x -22..-8.3, z -6..6) ─────────
  ...wallX(-22 - W, -8 - W, -6 - W, -6, HT.library, 'Drawing room north wall', [[-18.4, -16.4, 2.7]]),
  box('wall', -22 - W, 0, 6, -8 - W, HT.drawing, 6 + W, 'Drawing room south wall'),
  ...wallZ(-6, 6, -22 - W, -22, HT.conservatory, 'Conservatory doors wall', [[-1.2, 1.2, 3.0]]),

  // ───────── Conservatory (x -30..-22.3, z -15..6): glass on three sides ─────────
  box('wall', -30 - W, 0, -15 - W, -22 - W, HT.conservatory, -15, 'Conservatory north glass'),
  box('wall', -30 - W, 0, 6, -22 - W, HT.conservatory, 6 + W, 'Conservatory south glass'),
  box('wall', -30 - W, 0, -15, -30, HT.conservatory, 6, 'Conservatory west glass'),

  // ───────── Library (x -22..-8.3, z -21..-6.3) ─────────
  box('wall', -22 - W, 0, -21 - W, -8, HT.library, -21, 'Library north wall'),
  ...wallZ(-21, -6, -22 - W, -22, HT.library, 'Library west wall', [[-9.4, -7.4, 2.7]]),
  ...wallZ(-21 - W, -12, -8 - W, -8, HT.library, 'Library east wall', [[AXIS_N - 1, AXIS_N + 1, 2.7]]),

  // ───────── Dining room (x -8..8, z -21..-12.3) ─────────
  box('wall', -8, 0, -21 - W, 8 + W, HT.dining, -21, 'Dining room north wall'),
  ...wallZ(-21, -12, 8, 8 + W, HT.dining, 'Dining room east wall', [[AXIS_N - 1, AXIS_N + 1, 2.6]]),

  // ───────── Grandpa's study (x 8.3..16.3, z -21..-13.8) ─────────
  box('wall', 8 + W, 0, -21 - W, 16.3 + W, HT.study, -21, 'Study north wall'),
  box('wall', 16.3, 0, -21, 16.3 + W, HT.study, -13.8, 'Study east wall'),
  ...wallX(8 + W, 16.3 + W, -13.8, -13.5, HT.study, 'Study south wall', [[11.3, 13.3, 2.3]]),

  // ───────── Billiard room (x 8.3..20.3, z -13.5..-6.3) ─────────
  box('wall', 16.3 + W, 0, -13.8, 20.3 + W, HT.billiard, -13.5, 'Billiard room north wall'),
  box('wall', 20.3, 0, -13.5, 20.3 + W, HT.billiard, -6, 'Billiard room east wall'),
  ...wallX(16 + W, 20.3 + W, -6 - W, -6, HT.billiard, 'Billiard room south wall', [[17.3, 19.3, 2.3]]),

  // ───────── Scullery (x 16.3..20.3, z -6..3) ─────────
  box('wall', 20.3, 0, -6, 20.3 + W, HT.scullery, 3 + W, 'Scullery east wall'),
  box('wall', 16 + W, 0, 3, 20.3, HT.scullery, 3 + W, 'Scullery south wall'),

  // ───────── Kitchen furniture ─────────
  box('counter', 9, 0, -6, 15.5, 0.95, -5, 'Kitchen counter'),
  box('table', 10.5, 0, -1, 13, 0.8, 1, 'Kitchen table'),
  box('wall', 8.6, 0, 5.5, 11.4, 2.1, 6, 'Kitchen dresser'),

  // ───────── Hall furniture ─────────
  box('chair', -5.6, 0, 2.4, -4.4, 1.0, 3.6, "Grandma's chair"),
  box('table', -3.5, 0, 1.6, -2.3, 0.6, 2.8, 'Side table'),

  // ───────── Drawing room furniture ─────────
  box('wall', -13.9, 0, -6, -11.1, HT.drawing, -5.55, 'Drawing room chimney breast'),
  box('counter', -15.6, 0, -4.7, -14.75, 0.85, -2.5, 'Settee west'),
  box('counter', -10.25, 0, -4.7, -9.4, 0.85, -2.5, 'Settee east'),
  box('table', -13.3, 0, -4.2, -11.7, 0.48, -3.0, 'Tea table'),
  box('counter', -16.5, 0, -2.4, -15.8, 0.85, -1.7, 'Tea trolley'),
  box('counter', -21.6, 0, 2.2, -19.5, 1.0, 3.8, 'Grand piano'),
  box('wall', -21.7, 0, 4.5, -21.1, 1.8, 5.3, 'Harp'),
  box('wall', -10.6, 0, 3.3, -8.7, 1.9, 3.6, 'Folding screen'),
  box('wall', -22, 0, -5.6, -21.5, 2.4, -3.6, 'Curio cabinet'),
  box('counter', -21.9, 0, -2.3, -21.3, 0.6, -1.7, 'Drawing room palm'),

  // ───────── Conservatory furniture ─────────
  box('counter', -27.2, 0, -5, -25.2, 0.55, -3, 'Fountain'),
  box('counter', -29.8, 0, 5.1, -29.1, 0.7, 5.8, 'Palm pot south-west'),
  box('counter', -29.8, 0, -14.8, -29.1, 0.7, -14.1, 'Palm pot north-west'),
  box('counter', -23.2, 0, -14.8, -22.5, 0.7, -14.1, 'Palm pot north-east'),
  box('counter', -23.2, 0, 5.1, -22.5, 0.7, 5.8, 'Palm pot south-east'),
  box('counter', -30, 0, -12.5, -29.3, 0.9, -7.5, 'Potting bench'),
  box('table', -28.6, 0, 2.0, -27.8, 0.7, 2.8, 'Wicker table'),
  box('counter', -24, 0, 3.6, -23.4, 1.0, 4.2, 'Gramophone'),

  // ───────── Library: bookcases all round (two storeys of books), stacks, reading room ─────────
  box('wall', -22, 0, -21, -8.3, HT.library, -20.6, 'Bookcase north'),
  box('wall', -22, 0, -20.6, -21.6, HT.library, -17.9, 'Bookcase west 1'),
  box('wall', -22, 0, -17.9, -21.45, HT.library, -15.4, 'Library chimney breast'),
  box('wall', -22, 0, -15.4, -21.6, HT.library, -9.4, 'Bookcase west 2'),
  box('wall', -22, 0, -7.4, -21.6, HT.library, -6.3, 'Bookcase west 3'),
  box('wall', -8.7, 0, -20.6, -8.3, HT.library, AXIS_N - 1, 'Bookcase east 1'),
  box('wall', -8.7, 0, AXIS_N + 1, -8.3, HT.library, -6.3, 'Bookcase east 2'),
  box('wall', -21.6, 0, -6.7, -18.4, HT.library, -6.3, 'Bookcase south 1'),
  box('wall', -16.4, 0, -6.7, -8.7, HT.library, -6.3, 'Bookcase south 2'),
  box('wall', -19.3, 0, -20.6, -18.6, 2.7, -18.1, 'Stack north 1'),
  box('wall', -16.2, 0, -20.6, -15.5, 2.7, -18.1, 'Stack north 2'),
  box('wall', -13.1, 0, -20.6, -12.4, 2.7, -18.1, 'Stack north 3'),
  box('wall', -19.3, 0, -15.2, -18.6, 2.7, -10.8, 'Stack south 1'),
  box('wall', -16.2, 0, -15.2, -15.5, 2.7, -10.8, 'Stack south 2'),
  box('wall', -13.1, 0, -15.2, -12.4, 2.7, -10.8, 'Stack south 3'),
  box('table', -11.1, 0, -14.4, -10.0, 0.78, -11.8, 'Library table'),
  box('table', -11.6, 0, -9.4, -9.8, 0.78, -8.6, 'Writing desk'),
  box('counter', -20.5, 0, -10.6, -19.7, 1.1, -9.8, 'Globe'),
  box('counter', -15.0, 0, -8.6, -14.2, 0.95, -7.8, 'Reading chair west'),
  box('counter', -13.0, 0, -8.6, -12.2, 0.95, -7.8, 'Reading chair east'),

  // ───────── Dining room: laid for the wake ─────────
  box('table', -4.6, 0, AXIS_N - 0.6, 4.6, 0.78, AXIS_N + 0.6, 'Dining table'),
  box('counter', -4.3, 0, AXIS_N - 1.2, 4.3, 1.05, AXIS_N - 0.6, 'Dining chairs north'),
  box('counter', -4.3, 0, AXIS_N + 0.6, 4.3, 1.05, AXIS_N + 1.2, 'Dining chairs south'),
  box('counter', -5.3, 0, AXIS_N - 0.3, -4.7, 1.1, AXIS_N + 0.3, 'Carver west'),
  box('counter', 4.7, 0, AXIS_N - 0.3, 5.3, 1.1, AXIS_N + 0.3, 'Carver east'),
  box('wall', -1.4, 0, -21, 1.4, HT.dining, -20.5, 'Dining room chimney breast'),
  box('wall', -6.9, 0, -21, -5.1, 2.3, -20.45, 'Silver cabinet'),
  box('wall', 6.9, 0, -20.7, 7.6, 2.0, -20.0, 'Suit of armour'),
  box('counter', -2.0, 0, -12.85, 2.0, 0.95, -12.3, 'Sideboard'),

  // ───────── Grandpa's study ─────────
  box('table', 11.6, 0, -19.0, 13.8, 0.78, -18.0, 'Study desk'),
  box('counter', 15.5, 0, -21, 16.3, 1.1, -20.2, 'Safe'),
  box('wall', 15.9, 0, -19.8, 16.3, 2.4, -16.0, 'Study bookcase'),
  box('counter', 14.0, 0, -14.7, 16.0, 0.8, -13.8, 'Chesterfield'),

  // ───────── Billiard room ─────────
  box('table', 13.2, 0, -10.65, 16.0, 0.85, -9.15, 'Billiard table'),
  box('counter', 18.4, 0, -13.5, 20.3, 1.1, -12.9, 'Bar cabinet'),
  box('table', 10.2, 0, -12.6, 11.2, 0.75, -11.6, 'Card table'),

  // ───────── Scullery ─────────
  box('counter', 19.6, 0, -2.0, 20.3, 0.9, 0.2, 'Belfast sink'),
  box('counter', 19.5, 0, 1.2, 20.3, 1.2, 2.2, 'Mangle'),
  box('counter', 16.4, 0, 1.9, 17.3, 1.0, 2.9, 'Copper'),
  box('counter', 17.9, 0, 2.5, 18.9, 0.9, 3.0, 'Dumbwaiter'),

  // ───────── Heirloom pedestals (each holds one heirloom spot) ─────────
  // The hall and the gallery: in plain sight of Nana's court.
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
  // The new rooms: some out in the open, some tucked away.
  box('pedestal', -15.9, 0, 4.7, -15.1, 1.0, 5.5, 'Pedestal drawing room window'),
  box('pedestal', -9.6, 0, 4.8, -8.9, 1.0, 5.5, 'Pedestal behind the screen'),
  box('pedestal', -28.9, 0, -11.4, -28.1, 1.0, -10.6, 'Pedestal conservatory'),
  box('pedestal', -20.85, 0, -20.55, -20.05, 1.0, -19.75, 'Pedestal library bay'),
  box('pedestal', -9.6, 0, -20.4, -8.9, 1.0, -19.7, 'Pedestal library corner'),
  box('pedestal', -7.7, 0, -20.7, -7.0, 1.0, -20.0, 'Pedestal dining room'),
  box('pedestal', 8.7, 0, -20.7, 9.4, 1.0, -20.0, 'Pedestal study'),
  box('pedestal', 19.5, 0, -7.2, 20.2, 1.0, -6.5, 'Pedestal billiard room'),
];

const G = (x: number, z: number): Vec3 => ({ x, y: 0, z });
const U = (x: number, z: number): Vec3 => ({ x, y: GALLERY_Y, z });

/** The front hall's waypoints (Nana's court, and her beat). */
const HALL: Vec3[] = [
  G(-6.5, -6.5), G(-6.5, -1), G(-6.5, 1.2), G(-4, -0.6), G(-3.6, 4.6), G(-0.5, 0.8), G(0, 3.4), G(3, -0.6),
  G(3.6, 4.6), G(6.2, -6.5), G(6.2, -1), G(6.2, 2), G(-3, -6), G(3, -6), G(-2.5, -5), G(2.5, -5),
  G(-4.5, -10), G(4.5, -10), G(0, -10.2), G(-6.5, 4.0), G(-1.4, 2.6),
];

/** The drawing room's waypoints (the west end of Nana's beat). */
const DRAWING: Vec3[] = [
  G(-9.4, 0), G(-12.5, -0.4), G(-15.5, 0.2), G(-18.6, 0), G(-21, 0),
  G(-12.5, -1.9), G(-17.4, -4.9), G(-12.4, 4.6), G(-17.8, 4.4), G(-17.5, -3.4),
];

const GROUND: Vec3[] = [
  // Front hall
  ...HALL,
  // Kitchen doorway (both sides)
  G(7.3, 0), G(9.0, 0),
  // Kitchen
  G(9.6, -3.8), G(12, -4.2), G(14.6, -3.8), G(9.6, 2.6), G(12, 2.4), G(14.3, 2.1), G(14.8, -1.2),
  // Pantry
  G(14.3, 3.9), G(14.8, 5.0),
  // Hall to drawing room (the hall side), and the drawing room
  G(-7.1, 0), ...DRAWING,
  // Conservatory (its two doors, round the fountain)
  G(-23.3, 0), G(-26.2, 0.2), G(-26.2, -7.6), G(-23.3, -8.4), G(-28.4, -4), G(-24, -4), G(-26.2, -13), G(-26.4, 4.0),
  // Library: the doors, the main aisle, the stacks' aisles, the bays and the reading room
  G(-17.4, -7.5), G(-21, -8.4), G(-9.5, AXIS_N), G(-20.4, AXIS_N), G(-17.4, AXIS_N), G(-14.3, AXIS_N), G(-11, AXIS_N),
  G(-20.45, -13), G(-17.4, -13), G(-14.3, -13), G(-11.75, -15.6), G(-9.3, -13),
  G(-20.45, -18.9), G(-17.4, -19.3), G(-14.3, -19.3), G(-11, -19.3),
  G(-19.2, -8.5), G(-14.2, -9.8), G(-11, -10.3),
  // Dining room: both hall doors (both sides), the library and study doors, round the table
  G(-4.4, -11.2), G(-4.4, -13.4), G(4.4, -11.2), G(4.4, -13.4), G(-7.1, AXIS_N), G(7.1, AXIS_N),
  G(-6.4, -19.2), G(0, -19.4), G(5.8, -19.2), G(0, -14.2), G(-6.4, -14.2), G(6.4, -14.2),
  // Study
  G(9.3, AXIS_N), G(12.3, -14.9), G(12.6, -16.5), G(15, -16.2), G(10.2, -19.2), G(10.4, -15.4),
  // Billiard room (from the hall under the gallery, round the table)
  G(7.1, -9.9), G(9.3, -9.9), G(12.3, -12.6), G(11.8, -9.6), G(14.6, -12.3), G(14.6, -7.6), G(17.6, -9.9), G(18.3, -7.4), G(19.4, -11.4), G(11.4, -7.4),
  // Scullery (kitchen door both sides, billiard door)
  G(15.2, -3.6), G(17.3, -3.6), G(18.3, -5.0), G(18.2, -1.0), G(18.2, 1.3),
];

export const MANOR: MapDef = {
  id: 'manor',
  name: 'Harrowgate Manor',
  blurb: 'The family seat: a grand staircase, a portrait gallery, a library of tall stacks, a wake laid in advance, and a kitchen that has seen things.',
  bounds: { min: { x: -31.5, y: -4, z: -22.5 }, max: { x: 21.5, y: 7, z: 7.5 } },
  inside: [
    { min: { x: -8.4, y: -1, z: -12.4 }, max: { x: 8.4, y: 6.5, z: 6.4 } },
    { min: { x: 8, y: -1, z: -6.3 }, max: { x: 16.4, y: 3.3, z: 6.3 } },
    { min: { x: -22.4, y: -1, z: -6.4 }, max: { x: -7.9, y: HT.drawing + 0.3, z: 6.4 } },
    { min: { x: -30.4, y: -1, z: -15.4 }, max: { x: -21.9, y: HT.conservatory + 0.3, z: 6.4 } },
    { min: { x: -22.4, y: -1, z: -21.4 }, max: { x: -7.9, y: HT.library + 0.3, z: -5.9 } },
    { min: { x: -8.4, y: -1, z: -21.4 }, max: { x: 8.4, y: HT.dining + 0.3, z: -11.9 } },
    { min: { x: 7.9, y: -1, z: -21.4 }, max: { x: 16.7, y: HT.study + 0.3, z: -13.4 } },
    { min: { x: 7.9, y: -1, z: -13.9 }, max: { x: 20.7, y: HT.billiard + 0.3, z: -5.9 } },
    { min: { x: 15.9, y: -1, z: -6.4 }, max: { x: 20.7, y: HT.scullery + 0.3, z: 3.4 } },
  ],
  boxes: BOXES,
  ramps: [
    // The grand staircase: from the hall floor at z = -2 up to the gallery at z = -8.
    { minX: -1.5, maxX: 1.5, zStart: -2, zEnd: -8, yStart: 0, yEnd: GALLERY_Y, steps: 15, label: 'Grand staircase' },
  ],
  rooms: [
    { name: 'Pantry', min: { x: 13, y: 0, z: 3 }, max: { x: 16, y: KITCHEN_HEIGHT, z: 6 } },
    { name: 'Gallery', min: { x: -8, y: GALLERY_Y, z: -12 }, max: { x: 8, y: HALL_HEIGHT, z: -8 } },
    { name: 'Kitchen', min: { x: 8, y: 0, z: -6 }, max: { x: 16, y: KITCHEN_HEIGHT, z: 6 } },
    { name: 'Front hall', min: { x: -8, y: 0, z: -12 }, max: { x: 8, y: GALLERY_Y, z: 6 } },
    { name: 'Drawing Room', min: { x: -22, y: 0, z: -6 }, max: { x: -8.3, y: HT.drawing, z: 6 } },
    { name: 'Conservatory', min: { x: -30, y: 0, z: -15 }, max: { x: -22.3, y: HT.conservatory, z: 6 } },
    { name: 'Library', min: { x: -22, y: 0, z: -21 }, max: { x: -8.3, y: HT.library, z: -6.3 } },
    { name: 'Dining Room', min: { x: -8, y: 0, z: -21 }, max: { x: 8, y: HT.dining, z: -12.3 } },
    { name: 'Study', min: { x: 8.3, y: 0, z: -21 }, max: { x: 16.3, y: HT.study, z: -13.8 } },
    { name: 'Billiard Room', min: { x: 8.3, y: 0, z: -13.5 }, max: { x: 20.3, y: HT.billiard, z: -6.3 } },
    { name: 'Scullery', min: { x: 16.3, y: 0, z: -6 }, max: { x: 20.3, y: HT.scullery, z: 3 } },
  ],
  spawns: {
    grandma: { x: -5, y: 0, z: 1.6 },
    grandmaYaw: -Math.PI / 2, // facing east, toward the stairs and the kitchen door
    // In the open hall in front of Grandma (two staggered rows, more than 2 m apart, clear of
    // the side table and her chair), so a camera behind each of them looking at her has room.
    cousins: [
      { x: -0.4, y: 0, z: 3.75 }, { x: 0.7, y: 0, z: 2.0 }, { x: 1.8, y: 0, z: 3.75 }, { x: -1.5, y: 0, z: 2.0 },
      { x: 2.9, y: 0, z: 2.0 }, { x: -2.6, y: 0, z: 3.75 }, { x: 4.0, y: 0, z: 3.75 },
    ],
    // Family Dinner: Nana at the head of the kitchen table, looking down it; cousins round it.
    dinnerGrandma: { x: 9.7, y: 0, z: 0 },
    dinnerGrandmaYaw: -Math.PI / 2,
    dinnerCousins: [
      { x: 11.0, y: 0, z: -1.65 }, { x: 11.0, y: 0, z: 1.65 }, { x: 12.5, y: 0, z: -1.65 }, { x: 12.5, y: 0, z: 1.65 },
      { x: 13.8, y: 0, z: -0.7 }, { x: 13.8, y: 0, z: 0.7 }, { x: 11.75, y: 0, z: 2.7 },
    ],
    cat: { x: 4, y: 0, z: 2 },
    // The teacup sits on the kitchen counter.
    teacup: { x: 12, y: 0.95, z: -5.5 },
    pills: [
      { x: 14.5, y: 0, z: 4.5 }, // pantry
      { x: -6, y: GALLERY_Y, z: -9.5 }, // gallery
      { x: 11.5, y: 0.8, z: 0 }, // kitchen table
      { x: -6, y: 0, z: -10 }, // under the gallery
      { x: -16.15, y: 0.85, z: -2.05 }, // drawing room, on the tea trolley
      { x: -10.7, y: 0.78, z: -9.0 }, // library, among the papers on the writing desk
      { x: 18.4, y: 0.9, z: 2.75 }, // scullery, in the dumbwaiter
    ],
  },
  heirloomSpots: pedestalTops(BOXES),
  dinner: { table: { minX: 10.5, maxX: 13.0, minZ: -1.0, maxZ: 1.0 }, door: { x: 8, z: 0 }, doorName: 'the kitchen door' },
  nav: {
    ground: GROUND,
    upper: [U(-3, -9.7), U(3, -9.7), U(-6.5, -9.6), U(6.5, -9.6), U(-1.2, -10.8), U(1.2, -10.8), U(-5, -11.3), U(5, -11.3)],
    stairFoot: G(0, -1.3),
    stairTop: U(0, -8.7),
    // Nana's beat: the open front hall, and the drawing room through the double doors.
    beat: [...HALL.filter((p) => p.x < 7.5 && p.z > -7), G(-7.1, 0), G(-9.4, 0), G(-12.5, -0.4), G(-15.5, 0.2), G(-12.4, 4.6)],
  },
};
