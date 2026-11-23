// Baked light at run time (see render/lightmap.ts): if the map has a baked
// lightmap (client/public/lightmaps/<map>.jpg and its .json) whose signature
// matches the geometry the game just built, its walls, floors and furniture
// are redrawn as albedo × baked light. No bake, or a stale one: nothing
// changes and the map keeps its real-time lighting.
import * as THREE from 'three';
import type { MapView } from './maps/kit.js';

interface BakeInfo { signature: string; /** Multiply the stored light by this (it is stored scaled down to fit 8 bits). */ scale: number }

const tried = new WeakSet<MapView>();

/**
 * Which maps have a bake (lightmaps/index.json, kept up to date by
 * tools/render/bake_lightmap.py), fetched once: asking for a map's bake that
 * does not exist would put a 404 in the console.
 */
let bakedList: Promise<Set<string>> | null = null;
function bakedMaps(base: string): Promise<Set<string>> {
  bakedList ??= fetch(`${base}lightmaps/index.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : { maps: [] }))
    .then((j: { maps?: unknown }) => new Set(Array.isArray(j.maps) ? j.maps.filter((x): x is string => typeof x === 'string') : []))
    .catch(() => new Set<string>());
  return bakedList;
}

/** Load and apply a map's baked lightmap, once. Resolves to whether it was applied. */
export async function applyBakedLight(view: MapView, base = ''): Promise<boolean> {
  if (tried.has(view) || !view.lightmap) return false;
  tried.add(view);
  if (!(await bakedMaps(base)).has(view.id)) return false;
  let info: BakeInfo;
  try {
    const res = await fetch(`${base}lightmaps/${view.id}.json`, { cache: 'no-cache' });
    if (!res.ok) return false;
    info = (await res.json()) as BakeInfo;
  } catch { return false; }
  if (info.signature !== view.lightmap.signature) {
    console.info(`[lightmap] ${view.id}: the bake is for different geometry (${info.signature} ≠ ${view.lightmap.signature}); using real-time light`);
    return false;
  }
  const tex = await new THREE.TextureLoader().loadAsync(`${base}lightmaps/${view.id}.jpg`).catch(() => null);
  if (!tex) return false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.channel = 1;
  tex.anisotropy = 4;
  // Albedo × baked light. MeshBasicMaterial divides the light map by π.
  const k = info.scale * Math.PI;
  const baked: THREE.MeshBasicMaterial[] = [];
  const swapped = new Map<THREE.Material, THREE.MeshBasicMaterial>();
  for (const o of view.blockers) {
    if (!(o instanceof THREE.Mesh) || !o.geometry.attributes.uv1) continue;
    const m = o.material as THREE.MeshStandardMaterial;
    if (Array.isArray(m) || !(m instanceof THREE.MeshStandardMaterial)) continue;
    // Things that glow (windows, lamp shades) keep glowing as they are.
    if (m.emissiveIntensity > 0 && m.emissive.getHex() !== 0) continue;
    let b = swapped.get(m);
    if (!b) {
      b = new THREE.MeshBasicMaterial({
        color: m.color, map: m.map, lightMap: tex, lightMapIntensity: k,
        side: m.side, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest,
      });
      swapped.set(m, b);
      baked.push(b);
    }
    o.material = b;
  }
  view.lightLevel = (level: number) => { for (const b of baked) b.lightMapIntensity = k * level; };
  return baked.length > 0;
}
