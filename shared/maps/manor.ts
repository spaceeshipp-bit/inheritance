// Harrowgate Manor (the first map): the front hall, the grand staircase up to
// the heirloom gallery, and the kitchen with its pantry.
//
//   z=-12 ┌───────────── gallery (y=3, z -12..-8) ─────────────┐
//         │  (ground floor continues underneath the gallery)   │
//   z=-8  │──railing──┐ stairs ┌──railing──                     │┌──────── kitchen ────────┐
//         │           │ x±1.5  │                               ││ z -6..6, x 8..16, h=3     │
//   z=-2  │           └(foot)──┘                               ├┘ doorway z -1.5..1.5       │
//         │                 front hall (x -8..8)              ═══                 ┌pantry┐  │
//         │  Grandma's chair (-5, 3)                          ├┐                  │13..16│  │
//   z=6   └──────────────────── front door (south) ───────────┘└──────────────────┴──3..6┘──┘
import type { Vec3 } from '../types.js';
import { WALL, box, pedestalTops, type Box, type MapDef } from './types.js';

export const GALLERY_Y = 3;
export const HALL_HEIGHT = 6;
export const KITCHEN_HEIGHT = 3;

const BOXES: Box[] = [
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
  box('wall', -8 - WALL, 0, -12 - WALL, 8 + WALL, HALL_HEIGHT, -12, 'North wall'),
  box('wall', -8 - WALL, 0, 6, 8 + WALL, HALL_HEIGHT, 6 + WALL, 'South wall'),
  box('wall', -8 - WALL, 0, -12, -8, HALL_HEIGHT, 6, 'West wall'),
  // East hall wall with a doorway to the kitchen at z -1.5..1.5
  box('wall', 8, 0, -12, 8 + WALL, HALL_HEIGHT, -1.5, 'East wall north'),
  box('wall', 8, 0, 1.5, 8 + WALL, HALL_HEIGHT, 6, 'East wall south'),
  box('wall', 8, 2.4, -1.5, 8 + WALL, HALL_HEIGHT, 1.5, 'Kitchen doorway lintel'),

  // Kitchen walls
  box('wall', 8, 0, -6 - WALL, 16 + WALL, KITCHEN_HEIGHT, -6, 'Kitchen north wall'),
  box('wall', 8, 0, 6, 16 + WALL, KITCHEN_HEIGHT, 6 + WALL, 'Kitchen south wall'),
  box('wall', 16, 0, -6, 16 + WALL, KITCHEN_HEIGHT, 6, 'Kitchen east wall'),
  // Pantry walls (x 13..16, z 3..6) with a door gap at x 13.8..14.8 on its north side (z = 3)
  box('wall', 13 - WALL / 2, 0, 3, 13 + WALL / 2, KITCHEN_HEIGHT, 6, 'Pantry west wall'),
  box('wall', 13, 0, 3 - WALL / 2, 13.8, KITCHEN_HEIGHT, 3 + WALL / 2, 'Pantry north wall west'),
  box('wall', 14.8, 0, 3 - WALL / 2, 16, KITCHEN_HEIGHT, 3 + WALL / 2, 'Pantry north wall east'),

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

const G = (x: number, z: number): Vec3 => ({ x, y: 0, z });
const U = (x: number, z: number): Vec3 => ({ x, y: GALLERY_Y, z });

const GROUND: Vec3[] = [
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

export const MANOR: MapDef = {
  id: 'manor',
  name: 'Harrowgate Manor',
  blurb: 'The family seat: a grand staircase, a gallery of heirlooms, and a kitchen that has seen things.',
  bounds: { min: { x: -9, y: -4, z: -13 }, max: { x: 17, y: 7, z: 7 } },
  inside: [
    { min: { x: -8.4, y: -1, z: -12.4 }, max: { x: 8.4, y: 6.5, z: 6.4 } },
    { min: { x: 8, y: -1, z: -6.3 }, max: { x: 16.4, y: 3.3, z: 6.3 } },
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
    ],
  },
  heirloomSpots: pedestalTops(BOXES),
  dinner: { table: { minX: 10.5, maxX: 13.0, minZ: -1.0, maxZ: 1.0 }, door: { x: 8, z: 0 }, doorName: 'the kitchen door' },
  nav: {
    ground: GROUND,
    upper: [U(-3, -9.7), U(3, -9.7), U(-6.5, -9.6), U(6.5, -9.6), U(-1.2, -10.8), U(1.2, -10.8), U(-5, -11.3), U(5, -11.3)],
    stairFoot: G(0, -1.3),
    stairTop: U(0, -8.7),
    beat: GROUND.filter((p) => p.x < 7.5 && p.z > -7),
  },
};
