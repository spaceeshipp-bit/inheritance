// Baked lighting. Each map's static geometry (walls, floors, ceilings, big
// furniture: the merged camera blockers) gets a second UV set packing every
// face into one lightmap atlas. The layout is computed here, deterministically,
// so the game and the offline bake (tools/render/bake_lightmap.py, which bakes
// Blender's path-traced light into exactly these UVs) always agree; a
// signature of the layout travels with the baked image, and a lightmap that no
// longer matches the geometry is simply not used.
//
// At run time a baked map draws its static surfaces as albedo × baked light
// (MeshBasicMaterial with a lightMap): soft bounce light, contact shadows and
// lamp pools for the cost of a texture lookup. Small decoration and the
// characters keep real-time lighting.
import * as THREE from 'three';

export interface LightmapLayout {
  /** Atlas size in texels (square). */
  size: number;
  /** Texels per metre. */
  density: number;
  charts: number;
  /** A short fingerprint of the layout: the bake and the game must agree on it. */
  signature: string;
}

interface Chart { mesh: number; first: number; tris: number; u: THREE.Vector3; v: THREE.Vector3; o: THREE.Vector3; w: number; h: number }

const EPS = 1e-4;

/** Two triangles that share an edge and lie in one plane make one chart (a box face, a ceiling). */
function pairable(p: ArrayLike<number>, a: number, b: number, na: THREE.Vector3, nb: THREE.Vector3): boolean {
  if (na.dot(nb) < 0.999) return false;
  let shared = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const ia = (a * 3 + i) * 3, ib = (b * 3 + j) * 3;
      if (Math.abs(p[ia] - p[ib]) < EPS && Math.abs(p[ia + 1] - p[ib + 1]) < EPS && Math.abs(p[ia + 2] - p[ib + 2]) < EPS) shared++;
    }
  }
  return shared >= 2;
}

function triNormal(p: ArrayLike<number>, t: number, out: THREE.Vector3): THREE.Vector3 {
  const i = t * 9;
  const ax = p[i + 3] - p[i], ay = p[i + 4] - p[i + 1], az = p[i + 5] - p[i + 2];
  const bx = p[i + 6] - p[i], by = p[i + 7] - p[i + 1], bz = p[i + 8] - p[i + 2];
  out.set(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  const l = out.length();
  return l > 1e-12 ? out.multiplyScalar(1 / l) : out.set(0, 1, 0);
}

/** Find the charts of every mesh (non-indexed geometry, in world space), in order. */
function findCharts(meshes: THREE.Mesh[]): Chart[] {
  const charts: Chart[] = [];
  const na = new THREE.Vector3(), nb = new THREE.Vector3(), e = new THREE.Vector3(), q = new THREE.Vector3();
  meshes.forEach((m, mi) => {
    const pos = m.geometry.attributes.position;
    const p = pos.array as ArrayLike<number>;
    const n = Math.floor(pos.count / 3);
    for (let t = 0; t < n;) {
      triNormal(p, t, na);
      const two = t + 1 < n && pairable(p, t, t + 1, na, triNormal(p, t + 1, nb));
      const tris = two ? 2 : 1;
      // Basis: u along the first triangle's most axis-parallel edge (a box face's side, never its diagonal,
      // so rectangles pack as rectangles), the longer one on a tie; v in-plane.
      let best = -1;
      const o = new THREE.Vector3(p[t * 9], p[t * 9 + 1], p[t * 9 + 2]);
      const u = new THREE.Vector3();
      for (let k = 0; k < 3; k++) {
        const i0 = t * 9 + k * 3, i1 = t * 9 + ((k + 1) % 3) * 3;
        e.set(p[i1] - p[i0], p[i1 + 1] - p[i0 + 1], p[i1 + 2] - p[i0 + 2]);
        const l = e.length();
        if (l < 1e-9) continue;
        const straight = Math.max(Math.abs(e.x), Math.abs(e.y), Math.abs(e.z)) / l;
        const score = Math.round(straight * 100) * 1e4 + l;
        if (score > best) { best = score; u.copy(e).multiplyScalar(1 / l); }
      }
      const v = new THREE.Vector3().crossVectors(na, u).normalize();
      let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
      for (let k = 0; k < tris * 3; k++) {
        const i = (t * 3 + k) * 3;
        q.set(p[i] - o.x, p[i + 1] - o.y, p[i + 2] - o.z);
        const a = q.dot(u), b = q.dot(v);
        minU = Math.min(minU, a); maxU = Math.max(maxU, a); minV = Math.min(minV, b); maxV = Math.max(maxV, b);
      }
      o.addScaledVector(u, minU).addScaledVector(v, minV);
      charts.push({ mesh: mi, first: t, tris, u, v, o, w: maxU - minU, h: maxV - minV });
      t += tris;
    }
  });
  return charts;
}

interface Rect { x: number; y: number; w: number; h: number }

/** Shelf-pack chart rectangles (tallest first; ties keep chart order). Null if they do not fit. */
function pack(charts: Chart[], density: number, size: number, pad: number): Rect[] | null {
  const dims = charts.map((c) => ({ w: Math.max(2, Math.ceil(c.w * density)) + pad, h: Math.max(2, Math.ceil(c.h * density)) + pad }));
  const order = charts.map((_, i) => i).sort((a, b) => dims[b].h - dims[a].h || a - b);
  const out: Rect[] = new Array(charts.length);
  let x = pad, y = pad, shelf = 0;
  for (const i of order) {
    const d = dims[i];
    if (d.w > size - pad) return null;
    if (x + d.w > size) { x = pad; y += shelf; shelf = 0; }
    if (y + d.h > size) return null;
    out[i] = { x, y, w: d.w - pad, h: d.h - pad };
    x += d.w;
    shelf = Math.max(shelf, d.h);
  }
  return out;
}

/**
 * Give each mesh a 'uv1' attribute (three.js's second UV channel) laying all
 * of their faces out in one `size`² atlas, as densely as fits. Deterministic:
 * the same meshes in the same order always get the same layout.
 */
export function layoutLightmap(meshes: THREE.Mesh[], size = 2048, pad = 3): LightmapLayout {
  const charts = findCharts(meshes);
  const area = charts.reduce((a, c) => a + Math.max(c.w, 0.01) * Math.max(c.h, 0.01), 0);
  let density = Math.min(64, Math.sqrt((size * size * 0.55) / Math.max(area, 1e-3)));
  let rects: Rect[] | null = null;
  for (let i = 0; i < 40 && !(rects = pack(charts, density, size, pad)); i++) density *= 0.9;
  if (!rects) throw new Error('lightmap: the faces do not fit the atlas');
  const uv1 = meshes.map((m) => new Float32Array(m.geometry.attributes.position.count * 2));
  const q = new THREE.Vector3();
  charts.forEach((c, ci) => {
    const r = rects![ci];
    const p = meshes[c.mesh].geometry.attributes.position.array as ArrayLike<number>;
    const out = uv1[c.mesh];
    // Half a texel in from the rectangle's edges, so bilinear lookups stay inside the chart.
    const su = c.w > 1e-6 ? (r.w - 1) / c.w : 0, sv = c.h > 1e-6 ? (r.h - 1) / c.h : 0;
    for (let k = 0; k < c.tris * 3; k++) {
      const vi = c.first * 3 + k;
      q.set(p[vi * 3] - c.o.x, p[vi * 3 + 1] - c.o.y, p[vi * 3 + 2] - c.o.z);
      out[vi * 2] = (r.x + 0.5 + q.dot(c.u) * su) / size;
      out[vi * 2 + 1] = (r.y + 0.5 + q.dot(c.v) * sv) / size;
    }
  });
  meshes.forEach((m, i) => m.geometry.setAttribute('uv1', new THREE.BufferAttribute(uv1[i], 2)));
  const tris = meshes.reduce((a, m) => a + m.geometry.attributes.position.count / 3, 0);
  // The fingerprint: the atlas, how many faces and triangles, the density, and a hash of every vertex (to the millimetre).
  let h = 2166136261;
  for (const m of meshes) {
    const p = m.geometry.attributes.position.array as ArrayLike<number>;
    for (let i = 0; i < p.length; i++) { h ^= Math.round(p[i] * 1000) | 0; h = Math.imul(h, 16777619); }
  }
  const signature = `${size}:${charts.length}:${tris}:${density.toFixed(4)}:${(h >>> 0).toString(36)}`;
  return { size, density, charts: charts.length, signature };
}
