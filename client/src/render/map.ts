// Grey-box Harrowgate Manor built from shared/map.ts, so what you see is what
// the server collides against. Walls get a distinct colour per room (chosen per
// face by sampling which room the face looks into); the staircase is drawn as
// steps with a carpet runner and banisters.
import * as THREE from 'three';
import { BOXES, GALLERY_Y, HALL_HEIGHT, KITCHEN_HEIGHT, RAMPS, type Box } from '../../../shared/map.js';
import type { Vec3 } from '../../../shared/types.js';
import { boxGeo, mat, ROOM_COLORS, rug, tiles, wallpaper, wood } from './materials.js';

export interface MapView {
  group: THREE.Group;
  /** Meshes the third-person camera should not pass through. */
  blockers: THREE.Object3D[];
  /** Window panes (their glow follows daylight / lightning). */
  windows: THREE.MeshStandardMaterial;
}

/** Which room a point looks into (for colouring wall faces). */
export function faceRoom(p: Vec3): string {
  if (p.x > 8 && p.x < 16 && p.z > -6 && p.z < 6 && p.y < KITCHEN_HEIGHT) return p.x > 13 && p.z > 3 ? 'Pantry' : 'Kitchen';
  if (p.x > -8 && p.x < 8 && p.z > -12 && p.z < 6 && p.y < HALL_HEIGHT) return p.y > GALLERY_Y && p.z < -8 ? 'Gallery' : 'Front hall';
  return 'Outside';
}

function splitBox(b: Box, axis: 'y' | 'z', at: number): Box[] {
  if (!(b.min[axis] < at - 0.05 && b.max[axis] > at + 0.05)) return [b];
  const lo: Box = { ...b, min: { ...b.min }, max: { ...b.max, [axis]: at } };
  const hi: Box = { ...b, min: { ...b.min, [axis]: at }, max: { ...b.max } };
  return [lo, hi];
}

const wallMats = new Map<string, THREE.MeshStandardMaterial>();
function wallMat(room: string): THREE.MeshStandardMaterial {
  let m = wallMats.get(room);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: ROOM_COLORS[room] ?? '#555', map: room === 'Outside' ? null : wallpaper(), roughness: 0.92 });
    wallMats.set(room, m);
  }
  return m;
}

function place(mesh: THREE.Mesh, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): THREE.Mesh {
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return mesh;
}

function boxMesh(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: THREE.Material | THREE.Material[], tile = 1): THREE.Mesh {
  const g = boxGeo(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), tile);
  return place(new THREE.Mesh(g, m), x0, y0, z0, x1, y1, z1);
}

export function buildMap(): MapView {
  const group = new THREE.Group();
  group.name = 'manor';
  const blockers: THREE.Object3D[] = [];
  const add = (m: THREE.Object3D, block = false) => { group.add(m); if (block) blockers.push(m); return m; };

  const woodFloor = mat('#c9925e', { map: wood(), rough: 0.7 });
  const tileFloor = mat('#ffffff', { map: tiles(), rough: 0.5 });
  const darkWood = mat('#4a2c1a', { rough: 0.6 });
  const midWood = mat('#7a4a2a', { rough: 0.6 });
  const marble = mat('#e9e4da', { rough: 0.35 });
  const plaster = mat('#e8dcc8', { rough: 1 });
  const velvet = mat('#7a1f2b', { rough: 0.9 });
  const brass = mat('#c9a24a', { rough: 0.35, metal: 0.8 });
  const carpet = mat('#8e2430', { rough: 0.95 });

  for (const b of BOXES) {
    const { min: a, max: c } = b;
    switch (b.kind) {
      case 'floor': {
        const kitchen = a.x >= 8;
        const tile = kitchen ? 1 : 2;
        const top = kitchen ? tileFloor : woodFloor;
        const m = boxMesh(a.x, a.y, a.z, c.x, c.y, c.z, [darkWood, darkWood, top, darkWood, darkWood, darkWood], tile);
        add(m, true);
        break;
      }
      case 'wall': {
        let parts = splitBox(b, 'y', GALLERY_Y);
        if (b.max.x <= 8.31) parts = parts.flatMap((p) => splitBox(p, 'z', -8));
        for (const p of parts) {
          const cx = (p.min.x + p.max.x) / 2, cy = (p.min.y + p.max.y) / 2, cz = (p.min.z + p.max.z) / 2;
          const e = 0.15;
          const faces = [
            faceRoom({ x: p.max.x + e, y: cy, z: cz }), faceRoom({ x: p.min.x - e, y: cy, z: cz }),
            'Outside', 'Outside',
            faceRoom({ x: cx, y: cy, z: p.max.z + e }), faceRoom({ x: cx, y: cy, z: p.min.z - e }),
          ];
          add(boxMesh(p.min.x, p.min.y, p.min.z, p.max.x, p.max.y, p.max.z, faces.map(wallMat)), true);
          // Dado rail / skirting on interior faces of ground-floor walls.
          if (p.min.y < 0.1) addSkirting(group, p, faces, darkWood);
        }
        break;
      }
      case 'slab': {
        add(boxMesh(a.x, a.y, a.z, c.x, c.y, c.z, [darkWood, darkWood, woodFloor, plaster, midWood, midWood], 2), true);
        break;
      }
      case 'railing':
        if (b.solid) addRailing(group, b, darkWood);
        break;
      case 'counter': {
        add(boxMesh(a.x, a.y, a.z + 0.04, c.x, c.y - 0.06, c.z, mat('#6d8a6a', { rough: 0.7 })), true);
        add(boxMesh(a.x - 0.02, c.y - 0.06, a.z, c.x + 0.02, c.y, c.z + 0.03, mat('#d8d2c4', { rough: 0.3 })));
        // Cupboard doors + a stove.
        for (let x = a.x + 0.6; x < c.x - 0.3; x += 1.1) add(boxMesh(x - 0.45, 0.12, c.z, x + 0.45, c.y - 0.16, c.z + 0.02, mat('#5d7a5a', { rough: 0.6 })));
        add(boxMesh(13.2, c.y, a.z + 0.15, 14.2, c.y + 0.05, c.z - 0.15, mat('#222222', { rough: 0.4, metal: 0.5 })));
        break;
      }
      case 'table': {
        const top = c.y;
        add(boxMesh(a.x, top - 0.06, a.z, c.x, top, c.z, midWood), true);
        const inset = 0.08;
        for (const [x, z] of [[a.x + inset, a.z + inset], [c.x - inset, a.z + inset], [a.x + inset, c.z - inset], [c.x - inset, c.z - inset]]) {
          add(boxMesh(x - 0.04, 0, z - 0.04, x + 0.04, top - 0.06, z + 0.04, darkWood));
        }
        break;
      }
      case 'pedestal': {
        add(boxMesh(a.x, a.y, a.z, c.x, a.y + 0.12, c.z, marble), true);
        add(boxMesh(a.x + 0.12, a.y + 0.12, a.z + 0.12, c.x - 0.12, c.y - 0.08, c.z - 0.12, marble), true);
        add(boxMesh(a.x - 0.03, c.y - 0.08, a.z - 0.03, c.x + 0.03, c.y, c.z + 0.03, marble));
        break;
      }
      case 'chair': {
        // Grandma's wing chair, facing north (-Z), back on the south side.
        add(boxMesh(a.x + 0.1, 0, a.z + 0.1, c.x - 0.1, 0.45, c.z - 0.1, velvet), true);
        add(boxMesh(a.x, 0.45, c.z - 0.25, c.x, 1.45, c.z, velvet));
        add(boxMesh(a.x, 0.45, a.z + 0.1, a.x + 0.18, 0.8, c.z - 0.2, velvet));
        add(boxMesh(c.x - 0.18, 0.45, a.z + 0.1, c.x, 0.8, c.z - 0.2, velvet));
        add(boxMesh(a.x + 0.2, 0.45, a.z + 0.15, c.x - 0.2, 0.55, c.z - 0.3, mat('#a33a46')));
        break;
      }
      default:
        break;
    }
  }

  // The grand staircase, drawn as steps.
  for (const r of RAMPS) {
    const dz = (r.zEnd - r.zStart) / r.steps;
    const rise = (r.yEnd - r.yStart) / r.steps;
    for (let i = 0; i < r.steps; i++) {
      const z0 = r.zStart + i * dz, z1 = z0 + dz;
      const top = r.yStart + (i + 1) * rise;
      add(boxMesh(r.minX, r.yStart, z0, r.maxX, top, z1, [midWood, midWood, midWood, midWood, darkWood, darkWood]), true);
      // Carpet runner: tread + riser.
      add(boxMesh(r.minX + 0.4, top, z0, r.maxX - 0.4, top + 0.015, z1, carpet));
      add(boxMesh(r.minX + 0.4, top - rise, z0 + 0.005, r.maxX - 0.4, top, z0 + 0.02, carpet));
      // Brass stair rods.
      if (i % 1 === 0) add(boxMesh(r.minX + 0.36, top + 0.01, z0 - 0.02, r.maxX - 0.36, top + 0.035, z0 + 0.01, brass));
    }
    for (const x of [r.minX - 0.05, r.maxX + 0.05]) addBanister(group, x, r.zStart, r.zEnd, r.yStart, r.yEnd, darkWood, brass);
  }

  // Ceilings (seen from below only).
  const ceil = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(g, plaster);
    m.rotation.x = Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    add(m, true);
  };
  ceil(-8, -12, 8, 6, HALL_HEIGHT);
  ceil(8, -6, 16, 6, KITCHEN_HEIGHT);

  // Hall rug.
  const rugMesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 4.5), new THREE.MeshStandardMaterial({ map: rug(), roughness: 1 }));
  rugMesh.rotation.x = -Math.PI / 2;
  rugMesh.position.set(0, 0.006, 2.2);
  add(rugMesh);

  // Front door on the south wall.
  add(boxMesh(-0.8, 0, 5.92, 0.8, 2.6, 6, mat('#3b2214', { rough: 0.5 })));
  add(boxMesh(-0.95, 2.6, 5.9, 0.95, 2.75, 6, darkWood));
  add(boxMesh(0.5, 1.1, 5.86, 0.6, 1.2, 5.92, brass));

  // Tall windows on the west wall (daylight; lightning in the Storm).
  const windows = new THREE.MeshStandardMaterial({ color: '#cfe0ff', emissive: '#bcd3ff', emissiveIntensity: 0.9, roughness: 0.2 });
  for (const z of [-5, 0.5]) {
    add(boxMesh(-7.99, 1.0, z - 0.8, -7.95, 3.6, z + 0.8, windows));
    add(boxMesh(-7.97, 1.0, z - 0.04, -7.9, 3.6, z + 0.04, darkWood));
    add(boxMesh(-7.97, 2.25, z - 0.8, -7.9, 2.33, z + 0.8, darkWood));
    add(boxMesh(-7.98, 0.92, z - 0.9, -7.85, 1.0, z + 0.9, darkWood));
  }

  // Paintings: family portraits along the gallery and the hall.
  const frames: [number, number, number, number, string][] = [
    // x, y, z, facing (0 = +z, 1 = -x, 2 = +x), colour
    [-4.5, 4.6, -11.97, 0, '#3a4f7a'], [0, 4.6, -11.97, 0, '#6a3a5a'], [4.5, 4.6, -11.97, 0, '#4a6a3a'],
    [7.97, 1.9, 3.8, 1, '#7a5a2a'], [7.97, 1.9, -5.5, 1, '#2a4a5a'], [-7.97, 4.4, -2.5, 2, '#5a2a2a'],
  ];
  for (const [x, y, z, f, col] of frames) {
    const fr = new THREE.Group();
    fr.add(boxMesh(-0.55, -0.7, 0, 0.55, 0.7, 0.05, brass));
    fr.add(boxMesh(-0.45, -0.6, 0.02, 0.45, 0.6, 0.07, mat(col, { rough: 0.9 })));
    fr.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), mat('#e8c8a8')), 0, 0.15, 0.08, 0, 0.15, 0.08));
    fr.position.set(x, y, z);
    fr.rotation.y = f === 0 ? 0 : f === 1 ? -Math.PI / 2 : Math.PI / 2;
    add(fr);
  }

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
  add(chand);

  // Pantry shelves with jars.
  const shelf = mat('#8a6a48');
  for (const y of [0.6, 1.2, 1.8]) {
    add(boxMesh(15.55, y - 0.03, 3.3, 15.98, y, 5.95, shelf));
    for (let i = 0; i < 5; i++) {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 10), mat(['#c86a3a', '#e0c060', '#7a9a4a', '#a04a6a', '#d8d0c0'][(i + y * 10) % 5], { rough: 0.4 }));
      jar.position.set(15.75, y + 0.11, 3.6 + i * 0.5);
      add(jar);
    }
  }

  // Kitchen hanging lamp shade + pantry bulb.
  add(place(new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.3, 16, 1, true), mat('#2f4a3a', { rough: 0.6 })), 12, 2.55, 0, 12, 2.55, 0));
  add(place(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), bulb), 12, 2.42, 0, 12, 2.42, 0));

  return { group, blockers, windows };
}

function addSkirting(group: THREE.Group, p: Box, faces: string[], m: THREE.Material): void {
  const h = 0.16, t = 0.03;
  const { min: a, max: c } = p;
  if (faces[0] !== 'Outside') group.add(boxMesh(c.x, 0, a.z, c.x + t, h, c.z, m));
  if (faces[1] !== 'Outside') group.add(boxMesh(a.x - t, 0, a.z, a.x, h, c.z, m));
  if (faces[4] !== 'Outside') group.add(boxMesh(a.x, 0, c.z, c.x, h, c.z + t, m));
  if (faces[5] !== 'Outside') group.add(boxMesh(a.x, 0, a.z - t, c.x, h, a.z, m));
}

function addRailing(group: THREE.Group, b: Box, m: THREE.Material): void {
  const { min: a, max: c } = b;
  const alongX = c.x - a.x > c.z - a.z;
  group.add(boxMesh(a.x, c.y - 0.08, a.z - 0.03, c.x, c.y, c.z + 0.03, m));
  group.add(boxMesh(a.x, a.y, a.z, c.x, a.y + 0.08, c.z, m));
  const len = alongX ? c.x - a.x : c.z - a.z;
  const n = Math.max(2, Math.round(len / 0.28));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = alongX ? a.x + t * (c.x - a.x) : (a.x + c.x) / 2;
    const z = alongX ? (a.z + c.z) / 2 : a.z + t * (c.z - a.z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, c.y - a.y - 0.1, 6), m);
    post.position.set(x, (a.y + c.y) / 2, z);
    group.add(post);
  }
}

function addBanister(group: THREE.Group, x: number, z0: number, z1: number, y0: number, y1: number, m: THREE.Material, knob: THREE.Material): void {
  const len = Math.hypot(z1 - z0, y1 - y0);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, len), m);
  rail.position.set(x, (y0 + y1) / 2 + 0.95, (z0 + z1) / 2);
  rail.rotation.x = Math.atan2(y1 - y0, -(z1 - z0));
  group.add(rail);
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const z = z0 + t * (z1 - z0), y = y0 + t * (y1 - y0);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.95, 6), m);
    post.position.set(x, y + 0.475 + 0.1, z);
    group.add(post);
  }
  const newel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.15, 0.16), m);
  newel.position.set(x, 0.575, z0);
  group.add(newel);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), knob);
  ball.position.set(x, 1.22, z0);
  group.add(ball);
}
