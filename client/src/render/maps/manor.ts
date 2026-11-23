// Harrowgate Manor: the front hall with its grand staircase and gallery, the
// kitchen (Family Dinner's table) and the pantry. Walls get a colour per room,
// chosen per face by which room the face looks into.
import * as THREE from 'three';
import { GALLERY_Y, HALL_HEIGHT, KITCHEN_HEIGHT, type MapDef } from '../../../../shared/map.js';
import type { Vec3 } from '../../../../shared/types.js';
import { mat, rug, tiles, wood } from '../materials.js';
import {
  ViewBuilder, addRailing, boxMesh, ceiling, pedestal, place, portrait, roomWall, splitBox, stairs, table, wallMaterials, wingChair, type MapView,
} from './kit.js';

const COLORS: Record<string, string> = {
  'Front hall': '#8a4a3f', // oxblood damask
  Gallery: '#3c6b6c', // dark teal
  Kitchen: '#d9bf73', // butter yellow
  Pantry: '#93a9b0', // pale duck-egg
  Outside: '#2b2522',
};

/** Which room a point looks into (for colouring wall faces). */
function faceRoom(p: Vec3): string {
  if (p.x > 8 && p.x < 16 && p.z > -6 && p.z < 6 && p.y < KITCHEN_HEIGHT) return p.x > 13 && p.z > 3 ? 'Pantry' : 'Kitchen';
  if (p.x > -8 && p.x < 8 && p.z > -12 && p.z < 6 && p.y < HALL_HEIGHT) return p.y > GALLERY_Y && p.z < -8 ? 'Gallery' : 'Front hall';
  return 'Outside';
}

export function buildManor(def: MapDef): MapView {
  const v = new ViewBuilder(def);
  const wallMat = wallMaterials(COLORS);
  const woodFloor = mat('#c9925e', { map: wood(), rough: 0.7 });
  const tileFloor = mat('#ffffff', { map: tiles(), rough: 0.5 });
  const darkWood = mat('#4a2c1a', { rough: 0.6 });
  const midWood = mat('#7a4a2a', { rough: 0.6 });
  const marble = mat('#e9e4da', { rough: 0.35 });
  const plaster = mat('#e8dcc8', { rough: 1 });
  const velvet = mat('#7a1f2b', { rough: 0.9 });
  const brass = mat('#c9a24a', { rough: 0.35, metal: 0.8 });
  const carpet = mat('#8e2430', { rough: 0.95 });

  for (const b of def.boxes) {
    const { min: a, max: c } = b;
    switch (b.kind) {
      case 'floor': {
        const kitchen = a.x >= 8;
        const top = kitchen ? tileFloor : woodFloor;
        v.add(boxMesh(a.x, a.y, a.z, c.x, c.y, c.z, [darkWood, darkWood, top, darkWood, darkWood, darkWood], kitchen ? 1 : 2), true);
        break;
      }
      case 'wall': {
        let parts = splitBox(b, 'y', GALLERY_Y);
        if (b.max.x <= 8.31) parts = parts.flatMap((p) => splitBox(p, 'z', -8));
        for (const p of parts) roomWall(v, p, faceRoom, wallMat, darkWood);
        break;
      }
      case 'slab':
        v.add(boxMesh(a.x, a.y, a.z, c.x, c.y, c.z, [darkWood, darkWood, woodFloor, plaster, midWood, midWood], 2), true);
        break;
      case 'railing':
        if (b.solid) addRailing(v.group, b, darkWood);
        break;
      case 'counter': {
        v.add(boxMesh(a.x, a.y, a.z + 0.04, c.x, c.y - 0.06, c.z, mat('#6d8a6a', { rough: 0.7 })), true);
        v.add(boxMesh(a.x - 0.02, c.y - 0.06, a.z, c.x + 0.02, c.y, c.z + 0.03, mat('#d8d2c4', { rough: 0.3 })));
        // Cupboard doors + a stove.
        for (let x = a.x + 0.6; x < c.x - 0.3; x += 1.1) v.add(boxMesh(x - 0.45, 0.12, c.z, x + 0.45, c.y - 0.16, c.z + 0.02, mat('#5d7a5a', { rough: 0.6 })));
        v.add(boxMesh(13.2, c.y, a.z + 0.15, 14.2, c.y + 0.05, c.z - 0.15, mat('#222222', { rough: 0.4, metal: 0.5 })));
        break;
      }
      case 'table':
        table(v, b, midWood, darkWood);
        break;
      case 'pedestal':
        pedestal(v, b, marble);
        break;
      case 'chair':
        // Grandma's wing chair, facing north (-Z), back on the south side.
        wingChair(v, b, velvet, mat('#a33a46'));
        break;
      default:
        break;
    }
  }

  // The grand staircase.
  for (const r of def.ramps) stairs(v, r, { step: midWood, side: darkWood, carpet, rod: brass, banister: darkWood, knob: brass });

  ceiling(v, -8, -12, 8, 6, HALL_HEIGHT, plaster);
  ceiling(v, 8, -6, 16, 6, KITCHEN_HEIGHT, plaster);

  // Hall rug.
  const rugMesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 4.5), new THREE.MeshStandardMaterial({ map: rug(), roughness: 1 }));
  rugMesh.rotation.x = -Math.PI / 2;
  rugMesh.position.set(0, 0.006, 2.2);
  v.add(rugMesh);

  // Front door on the south wall.
  v.add(boxMesh(-0.8, 0, 5.92, 0.8, 2.6, 6, mat('#3b2214', { rough: 0.5 })));
  v.add(boxMesh(-0.95, 2.6, 5.9, 0.95, 2.75, 6, darkWood));
  v.add(boxMesh(0.5, 1.1, 5.86, 0.6, 1.2, 5.92, brass));

  // Tall windows on the west wall (daylight; lightning in the Storm).
  const windows = new THREE.MeshStandardMaterial({ color: '#cfe0ff', emissive: '#bcd3ff', emissiveIntensity: 0.9, roughness: 0.2 });
  for (const z of [-5, 0.5]) {
    v.add(boxMesh(-7.99, 1.0, z - 0.8, -7.95, 3.6, z + 0.8, windows));
    v.add(boxMesh(-7.97, 1.0, z - 0.04, -7.9, 3.6, z + 0.04, darkWood));
    v.add(boxMesh(-7.97, 2.25, z - 0.8, -7.9, 2.33, z + 0.8, darkWood));
    v.add(boxMesh(-7.98, 0.92, z - 0.9, -7.85, 1.0, z + 0.9, darkWood));
  }

  // Family portraits along the gallery and the hall.
  const frames: [number, number, number, 0 | 1 | 2, string][] = [
    [-4.5, 4.6, -11.97, 0, '#3a4f7a'], [0, 4.6, -11.97, 0, '#6a3a5a'], [4.5, 4.6, -11.97, 0, '#4a6a3a'],
    [7.97, 1.9, 3.8, 1, '#7a5a2a'], [7.97, 1.9, -5.5, 1, '#2a4a5a'], [-7.97, 4.4, -2.5, 2, '#5a2a2a'],
  ];
  for (const [x, y, z, f, col] of frames) portrait(v, x, y, z, f, col, brass);

  // Chandelier over the stair foot.
  const chand = new THREE.Group();
  chand.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2), brass), 0, 0.6, 0, 0, 0.6, 0));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 8, 24), brass);
  ring.rotation.x = Math.PI / 2;
  chand.add(ring);
  const bulb = mat('#fff4d6', { emissive: '#ffd89a', emissiveIntensity: 2 });
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), bulb);
    s.position.set(Math.cos((i / 8) * Math.PI * 2) * 0.6, 0.1, Math.sin((i / 8) * Math.PI * 2) * 0.6);
    chand.add(s);
  }
  chand.position.set(0, 4.8, 0.5);
  v.add(chand);

  // Pantry shelves with jars.
  const shelf = mat('#8a6a48');
  for (const y of [0.6, 1.2, 1.8]) {
    v.add(boxMesh(15.55, y - 0.03, 3.3, 15.98, y, 5.95, shelf));
    for (let i = 0; i < 5; i++) {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 10), mat(['#c86a3a', '#e0c060', '#7a9a4a', '#a04a6a', '#d8d0c0'][(i + y * 10) % 5], { rough: 0.4 }));
      jar.position.set(15.75, y + 0.11, 3.6 + i * 0.5);
      v.add(jar);
    }
  }

  // Kitchen hanging lamp shade + pantry bulb.
  v.add(place(new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.3, 16, 1, true), mat('#2f4a3a', { rough: 0.6 })), 12, 2.55, 0, 12, 2.55, 0));
  v.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), bulb), 12, 2.42, 0, 12, 2.42, 0));

  // Lights.
  v.point(0, 4.6, 0.5, '#ffc98a', 60, 22); // chandelier
  v.point(0, 4.2, 4.5, '#ffd29a', 25, 14, true); // by the front door
  v.point(-5, 2.6, 2.5, '#ffbf7a', 14, 8, true); // Grandma's lamp
  v.point(-4, 5, -10.5, '#ffcf96', 22, 11); // gallery sconces
  v.point(4, 5, -10.5, '#ffcf96', 22, 11, true);
  v.point(0, 2.4, -9.5, '#ffbf7a', 10, 8, true); // under the gallery
  v.point(12, 2.45, 0, '#fff0c8', 26, 12); // kitchen lamp
  v.point(14.5, 2.6, 4.5, '#fff0d8', 8, 5, true); // pantry bulb

  return v.finish({
    windows,
    idle: { center: { x: 0, y: 2.6, z: 2.5 }, rx: 5.5, rz: 2.5, look: { x: 0, y: 2.2, z: -5 } },
    background: '#120d0a',
    lightningFrom: { x: -20, y: 10, z: 0 },
  });
}
