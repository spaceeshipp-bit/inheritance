// The map-building kit: the pieces every map renderer (client/src/render/maps/*)
// shares: placing boxes, room-coloured walls, skirting, railings, stairs,
// ceilings, lights, and baking the static geometry into a few draw calls.
// A map builder turns its MapDef (shared/maps/*) into a MapView; the server
// collides against the same boxes, so what you see is what you bump into.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Box, MapDef, MapId, Ramp } from '../../../../shared/map.js';
import type { Vec3 } from '../../../../shared/types.js';
import { boxGeo, mat, wallpaper } from '../materials.js';
import { layoutLightmap, type LightmapLayout } from '../lightmap.js';

export interface MapView {
  id: MapId;
  group: THREE.Group;
  /** Meshes the third-person camera (and Grandma's crosshair) should not pass through. */
  blockers: THREE.Object3D[];
  /** Window panes (their glow follows daylight / lightning). */
  windows: THREE.MeshStandardMaterial;
  /** The map's own lights; minor ones are switched off on the low preset. */
  lights: { light: THREE.Light; minor: boolean }[];
  /** The lobby backdrop: the camera drifts round `center` (an ellipse rx by rz), looking at `look`. */
  idle: { center: Vec3; rx: number; rz: number; look: Vec3 };
  /** Colour beyond the walls (or the sky). */
  background: string;
  /** Where the Storm's lightning comes from (outside the windows). */
  lightningFrom: Vec3;
  /** The lightmap atlas of the static geometry (render/lightmap.ts); a baked lightmap must match it. */
  lightmap?: LightmapLayout;
  /** Set once a baked lightmap is applied: scale its light (the Storm's power cut, lightning). */
  lightLevel?: (k: number) => void;
  /**
   * Optional animation (waves, flickering bulbs, a swinging lamp), every frame,
   * with the Storm's state: `dark` while the power is out, `flash` during lightning.
   */
  tick?: (t: number, dt: number, sky: { dark: boolean; flash: boolean }) => void;
}

/** Turns a map's definition into its look. One per map, registered in render/map.ts. */
export type MapBuilder = (def: MapDef) => MapView;

/** A view under construction: add meshes (blockers or decoration) and lights to it, then finish(). */
export class ViewBuilder {
  readonly group = new THREE.Group();
  readonly blockers: THREE.Object3D[] = [];
  readonly lights: { light: THREE.Light; minor: boolean }[] = [];
  constructor(readonly def: MapDef) { this.group.name = def.id; }

  /** Add a mesh/group; `block`: the camera should not pass through it. */
  add<T extends THREE.Object3D>(m: T, block = false): T {
    this.group.add(m);
    if (block) this.blockers.push(m);
    return m;
  }

  /** A point light (decay 1.4, like the manor's). Minor lights go off on the low preset. */
  point(x: number, y: number, z: number, color: string, intensity: number, distance: number, minor = false): THREE.PointLight {
    const l = new THREE.PointLight(color, intensity, distance, 1.4);
    l.position.set(x, y, z);
    this.lights.push({ light: l, minor });
    return l;
  }

  /** Bake the static geometry and hand over the view. */
  finish(rest: Omit<MapView, 'id' | 'group' | 'blockers' | 'lights' | 'lightmap'>): MapView {
    mergeStatic(this.group, this.blockers);
    // Lay out the walls, floors and furniture for baked light (cheap; used only if a bake exists).
    const meshes = this.blockers.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
    let lightmap: LightmapLayout | undefined;
    try { lightmap = layoutLightmap(meshes); } catch { lightmap = undefined; }
    return { id: this.def.id, group: this.group, blockers: this.blockers, lights: this.lights, lightmap, ...rest };
  }
}

export function place(mesh: THREE.Mesh, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): THREE.Mesh {
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return mesh;
}

export function boxMesh(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: THREE.Material | THREE.Material[], tile = 1): THREE.Mesh {
  const g = boxGeo(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), tile);
  return place(new THREE.Mesh(g, m), x0, y0, z0, x1, y1, z1);
}

export function splitBox(b: Box, axis: 'y' | 'z', at: number): Box[] {
  if (!(b.min[axis] < at - 0.05 && b.max[axis] > at + 0.05)) return [b];
  const lo: Box = { ...b, min: { ...b.min }, max: { ...b.max, [axis]: at } };
  const hi: Box = { ...b, min: { ...b.min, [axis]: at }, max: { ...b.max } };
  return [lo, hi];
}

/**
 * Wall materials by room name: one wallpapered material per room colour
 * (`plain` rooms get no wallpaper pattern; 'Outside' never does).
 */
export function wallMaterials(colors: Record<string, string>, opts: { plain?: string[]; rough?: number; texture?: () => THREE.Texture } = {}): (room: string) => THREE.MeshStandardMaterial {
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  return (room) => {
    let m = cache.get(room);
    if (!m) {
      const plain = room === 'Outside' || (opts.plain ?? []).includes(room);
      m = new THREE.MeshStandardMaterial({ color: colors[room] ?? colors.Outside ?? '#555', map: plain ? null : (opts.texture ?? wallpaper)(), roughness: opts.rough ?? 0.92 });
      cache.set(room, m);
    }
    return m;
  };
}

/**
 * Draw a wall box with each face coloured for the room it looks into
 * (`roomOf` samples just outside each face), plus skirting on ground-floor
 * interior faces. Faces order: +x, -x, +y, -y, +z, -z.
 */
export function roomWall(v: ViewBuilder, p: Box, roomOf: (q: Vec3) => string, wallMat: (room: string) => THREE.Material, skirting: THREE.Material | null): void {
  const cx = (p.min.x + p.max.x) / 2, cy = (p.min.y + p.max.y) / 2, cz = (p.min.z + p.max.z) / 2;
  const e = 0.15;
  const faces = [
    roomOf({ x: p.max.x + e, y: cy, z: cz }), roomOf({ x: p.min.x - e, y: cy, z: cz }),
    'Outside', 'Outside',
    roomOf({ x: cx, y: cy, z: p.max.z + e }), roomOf({ x: cx, y: cy, z: p.min.z - e }),
  ];
  v.add(boxMesh(p.min.x, p.min.y, p.min.z, p.max.x, p.max.y, p.max.z, faces.map(wallMat)), true);
  if (skirting && p.min.y < 0.1) addSkirting(v.group, p, faces, skirting);
}

/** The room a point is in by the map's own rooms (first match), or 'Outside'. */
export function roomIn(def: MapDef, p: Vec3): string {
  for (const r of def.rooms) {
    if (p.x > r.min.x && p.x < r.max.x && p.z > r.min.z && p.z < r.max.z && p.y > r.min.y - 0.01 && p.y < r.max.y) return r.name;
  }
  return 'Outside';
}

/** A ceiling plane, seen from below. */
export function ceiling(v: ViewBuilder, x0: number, z0: number, x1: number, z1: number, y: number, m: THREE.Material): void {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  const mesh = new THREE.Mesh(g, m);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  v.add(mesh, true);
}

/** A flight of stairs drawn as steps over a ramp (optionally carpeted, with banisters). */
export function stairs(v: ViewBuilder, r: Ramp, m: { step: THREE.Material; side: THREE.Material; carpet?: THREE.Material; rod?: THREE.Material; banister?: THREE.Material; knob?: THREE.Material }): void {
  const dz = (r.zEnd - r.zStart) / r.steps;
  const rise = (r.yEnd - r.yStart) / r.steps;
  for (let i = 0; i < r.steps; i++) {
    const z0 = r.zStart + i * dz, z1 = z0 + dz;
    const top = r.yStart + (i + 1) * rise;
    v.add(boxMesh(r.minX, r.yStart, z0, r.maxX, top, z1, [m.step, m.step, m.step, m.step, m.side, m.side]), true);
    if (m.carpet) {
      v.add(boxMesh(r.minX + 0.4, top, z0, r.maxX - 0.4, top + 0.015, z1, m.carpet));
      v.add(boxMesh(r.minX + 0.4, top - rise, z0 + 0.005, r.maxX - 0.4, top, z0 + 0.02, m.carpet));
    }
    if (m.rod) v.add(boxMesh(r.minX + 0.36, top + 0.01, z0 - 0.02, r.maxX - 0.36, top + 0.035, z0 + 0.01, m.rod));
  }
  if (m.banister) for (const x of [r.minX - 0.05, r.maxX + 0.05]) addBanister(v.group, x, r.zStart, r.zEnd, r.yStart, r.yEnd, m.banister, m.knob ?? m.banister);
}

/** A plain table: a top and four legs (the box's top is the tabletop). */
export function table(v: ViewBuilder, b: Box, top: THREE.Material, legs: THREE.Material): void {
  const { min: a, max: c } = b;
  v.add(boxMesh(a.x, c.y - 0.06, a.z, c.x, c.y, c.z, top), true);
  const inset = 0.08;
  for (const [x, z] of [[a.x + inset, a.z + inset], [c.x - inset, a.z + inset], [a.x + inset, c.z - inset], [c.x - inset, c.z - inset]]) {
    v.add(boxMesh(x - 0.04, a.y, z - 0.04, x + 0.04, c.y - 0.06, z + 0.04, legs));
  }
}

/** A marble pedestal (heirlooms stand on these). */
export function pedestal(v: ViewBuilder, b: Box, m: THREE.Material): void {
  const { min: a, max: c } = b;
  v.add(boxMesh(a.x, a.y, a.z, c.x, a.y + 0.12, c.z, m), true);
  v.add(boxMesh(a.x + 0.12, a.y + 0.12, a.z + 0.12, c.x - 0.12, c.y - 0.08, c.z - 0.12, m), true);
  v.add(boxMesh(a.x - 0.03, c.y - 0.08, a.z - 0.03, c.x + 0.03, c.y, c.z + 0.03, m));
}

/** Grandma's wing chair (seat box `b`), facing -Z unless `facing` says otherwise (radians about Y). */
export function wingChair(v: ViewBuilder, b: Box, fabric: THREE.Material, cushion: THREE.Material, facing = 0): void {
  const { min: a, max: c } = b;
  const w = c.x - a.x, d = c.z - a.z;
  const g = new THREE.Group();
  const local = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: THREE.Material) =>
    g.add(boxMesh(x0 - w / 2, y0, z0 - d / 2, x1 - w / 2, y1, z1 - d / 2, m));
  local(0.1, 0, 0.1, w - 0.1, 0.45, d - 0.1, fabric);
  local(0, 0.45, d - 0.25, w, 1.45, d, fabric);
  local(0, 0.45, 0.1, 0.18, 0.8, d - 0.2, fabric);
  local(w - 0.18, 0.45, 0.1, w, 0.8, d - 0.2, fabric);
  local(0.2, 0.45, 0.15, w - 0.2, 0.55, d - 0.3, cushion);
  g.position.set((a.x + c.x) / 2, a.y, (a.z + c.z) / 2);
  g.rotation.y = facing;
  v.add(g, true);
}

/** A framed portrait on a wall: facing 0 = +z, 1 = -x, 2 = +x, 3 = -z. */
export function portrait(v: ViewBuilder, x: number, y: number, z: number, facing: 0 | 1 | 2 | 3, color: string, frame: THREE.Material, size = 1): void {
  const fr = new THREE.Group();
  fr.add(boxMesh(-0.55 * size, -0.7 * size, 0, 0.55 * size, 0.7 * size, 0.05, frame));
  fr.add(boxMesh(-0.45 * size, -0.6 * size, 0.02, 0.45 * size, 0.6 * size, 0.07, mat(color, { rough: 0.9 })));
  fr.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.16 * size, 12, 10), mat('#e8c8a8')), 0, 0.15 * size, 0.08, 0, 0.15 * size, 0.08));
  fr.position.set(x, y, z);
  fr.rotation.y = facing === 0 ? 0 : facing === 1 ? -Math.PI / 2 : facing === 2 ? Math.PI / 2 : Math.PI;
  v.add(fr);
}

/**
 * Bake the static house into one mesh per material: per-face materials (walls,
 * floors, steps) are split by geometry group first, so a wall box costs one
 * draw call per room colour across the whole house instead of six per box.
 * Hundreds of draw calls become a few dozen; materials are shared objects, so
 * live changes (window glow in the Storm) still apply. Blockers and decoration
 * are merged in separate pools, and `blockers` is refilled with the merged
 * blocker meshes, so the camera and Grandma's crosshair still raycast only
 * real obstacles.
 */
export function mergeStatic(group: THREE.Group, blockers: THREE.Object3D[]): void {
  group.updateMatrixWorld(true);
  const isBlocker = new Set(blockers);
  const pools = new Map<string, { material: THREE.Material; blocker: boolean; geos: THREE.BufferGeometry[] }>();
  const baked: THREE.Mesh[] = [];
  const put = (material: THREE.Material, blocker: boolean, g: THREE.BufferGeometry) => {
    const key = `${blocker ? 'b' : 'd'}:${material.uuid}`;
    let pool = pools.get(key);
    if (!pool) { pool = { material, blocker, geos: [] }; pools.set(key, pool); }
    pool.geos.push(g);
  };
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    let g = o.geometry.clone();
    if (!g.attributes.uv || !g.attributes.normal) return;
    g.applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (g.index) g = g.toNonIndexed();
    let blocker = false;
    for (let q: THREE.Object3D | null = o; q && q !== group; q = q.parent) if (isBlocker.has(q)) { blocker = true; break; }
    if (Array.isArray(o.material)) {
      for (const [m, part] of splitByGroups(g, o.material)) put(m, blocker, part);
    } else {
      g.clearGroups();
      put(o.material, blocker, g);
    }
    baked.push(o);
  });
  for (const o of baked) o.removeFromParent();
  for (const child of [...group.children]) if (child instanceof THREE.Group && child.children.length === 0) child.removeFromParent();
  blockers.length = 0;
  for (const pool of pools.values()) {
    const g = mergeGeometries(pool.geos, false);
    if (!g) continue;
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, pool.material);
    mesh.name = pool.blocker ? 'static-blocker' : 'static-decor';
    group.add(mesh);
    if (pool.blocker) blockers.push(mesh);
  }
}

/** Split a non-indexed geometry with groups into one geometry per material. */
function splitByGroups(g: THREE.BufferGeometry, materials: THREE.Material[]): [THREE.Material, THREE.BufferGeometry][] {
  const out: [THREE.Material, THREE.BufferGeometry][] = [];
  const groups = g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 0 }];
  for (const grp of groups) {
    const m = materials[grp.materialIndex ?? 0];
    if (!m) continue;
    const part = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv'] as const) {
      const a = g.attributes[name] as THREE.BufferAttribute;
      const arr = (a.array as Float32Array).slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize);
      part.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
    }
    out.push([m, part]);
  }
  return out;
}

export function addSkirting(group: THREE.Group, p: Box, faces: string[], m: THREE.Material): void {
  const h = 0.16, t = 0.03;
  const { min: a, max: c } = p;
  if (faces[0] !== 'Outside') group.add(boxMesh(c.x, 0, a.z, c.x + t, h, c.z, m));
  if (faces[1] !== 'Outside') group.add(boxMesh(a.x - t, 0, a.z, a.x, h, c.z, m));
  if (faces[4] !== 'Outside') group.add(boxMesh(a.x, 0, c.z, c.x, h, c.z + t, m));
  if (faces[5] !== 'Outside') group.add(boxMesh(a.x, 0, a.z - t, c.x, h, a.z, m));
}

export function addRailing(group: THREE.Group, b: Box, m: THREE.Material): void {
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

export function addBanister(group: THREE.Group, x: number, z0: number, z1: number, y0: number, y1: number, m: THREE.Material, knob: THREE.Material): void {
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

/** The fallback: every box in a flat grey by kind, ramps as steps, one light per room. */
export const greyBox: MapBuilder = (def) => {
  const v = new ViewBuilder(def);
  const shade: Record<string, string> = { floor: '#6b6158', wall: '#8b847a', slab: '#6b6158', counter: '#7d8a7a', table: '#7a5a3a', pedestal: '#d8d2c4', chair: '#7a1f2b', railing: '#4a2c1a' };
  for (const b of def.boxes) {
    if (!b.solid && b.kind !== 'railing') continue;
    v.add(boxMesh(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, mat(shade[b.kind] ?? '#777', { rough: 0.9 })), true);
  }
  const step = mat('#6b6158', { rough: 0.9 });
  for (const r of def.ramps) stairs(v, r, { step, side: step });
  for (const r of def.rooms) {
    v.point((r.min.x + r.max.x) / 2, Math.min(r.max.y, r.min.y + 3) - 0.3, (r.min.z + r.max.z) / 2, '#ffe0b0', 20, 14);
  }
  const c = def.spawns.grandma;
  return v.finish({
    windows: new THREE.MeshStandardMaterial({ color: '#cfe0ff' }),
    idle: { center: { x: c.x, y: 2.6, z: c.z }, rx: 4, rz: 2.5, look: { x: c.x, y: 1.6, z: c.z - 5 } },
    background: '#120d0a',
    lightningFrom: { x: def.bounds.min.x - 12, y: 10, z: c.z },
  });
};
