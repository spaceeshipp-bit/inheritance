// The lightmap atlas (client/src/render/lightmap.ts): every face of the static
// geometry gets its own patch of one texture, no two overlap, the layout is the
// same every time, and the signature changes when the geometry does.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { layoutLightmap } from '../../client/src/render/lightmap.js';

function boxes(n: number, shift = 0): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.BoxGeometry(1 + (i % 3), 0.3 + (i % 5) * 0.4, 2).toNonIndexed();
    g.translate(i * 3 + shift, 0, (i % 4) * 2);
    out.push(new THREE.Mesh(g));
  }
  const floor = new THREE.PlaneGeometry(40, 30).toNonIndexed();
  floor.rotateX(-Math.PI / 2);
  out.push(new THREE.Mesh(floor));
  return out;
}

/** Each chart's texel rectangle (from its uv1 bounds). */
function rects(meshes: THREE.Mesh[], size: number): { x0: number; y0: number; x1: number; y1: number }[] {
  const out: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const m of meshes) {
    const uv = m.geometry.attributes.uv1.array as Float32Array;
    // Box faces and planes are two triangles: six vertices per chart.
    for (let v = 0; v < uv.length / 2; v += 6) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let k = v; k < v + 6; k++) {
        x0 = Math.min(x0, uv[k * 2] * size); x1 = Math.max(x1, uv[k * 2] * size);
        y0 = Math.min(y0, uv[k * 2 + 1] * size); y1 = Math.max(y1, uv[k * 2 + 1] * size);
      }
      out.push({ x0, y0, x1, y1 });
    }
  }
  return out;
}

describe('the lightmap atlas', () => {
  it('pairs box faces into charts and keeps every UV inside the texture', () => {
    const ms = boxes(20);
    const l = layoutLightmap(ms, 512);
    expect(l.charts).toBe(20 * 6 + 1);
    for (const m of ms) for (const x of m.geometry.attributes.uv1.array as Float32Array) { expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(1); }
    expect(l.density).toBeGreaterThan(4);
  });

  it('no two charts overlap', () => {
    const ms = boxes(30);
    layoutLightmap(ms, 512);
    const rs = rects(ms, 512);
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], b = rs[j];
        const overlap = a.x0 < b.x1 - 0.01 && b.x0 < a.x1 - 0.01 && a.y0 < b.y1 - 0.01 && b.y0 < a.y1 - 0.01;
        expect(overlap, `charts ${i} and ${j}`).toBe(false);
      }
    }
  });

  it('is the same every time, and its signature changes when a box moves', () => {
    const a = layoutLightmap(boxes(10), 512), b = layoutLightmap(boxes(10), 512);
    expect(a.signature).toBe(b.signature);
    expect(layoutLightmap(boxes(10, 0.5), 512).signature).not.toBe(a.signature);
  });
});
