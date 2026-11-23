// Every map's look, by id. Each map has a builder in render/maps/<id>.ts that
// turns its MapDef (shared/maps/<id>.ts) into a MapView; a map without one yet
// is drawn as plain grey boxes, so a new map is playable before it is pretty.
import * as THREE from 'three';
import { mapById, type MapId } from '../../../shared/map.js';
import { mat } from './materials.js';
import { ViewBuilder, boxMesh, stairs, type MapBuilder, type MapView } from './maps/kit.js';
import { buildManor } from './maps/manor.js';

export type { MapView } from './maps/kit.js';

/** Map builders by id (each map adds its own line). */
const BUILDERS: Partial<Record<MapId, MapBuilder>> = {
  manor: buildManor,
};

/** Build a map's look (grey boxes if it has no builder yet). */
export function buildMap(id: MapId): MapView {
  const def = mapById(id);
  return (BUILDERS[def.id] ?? greyBox)(def);
}

/** The fallback: every box in a flat grey by kind, ramps as steps, one light per room. */
const greyBox: MapBuilder = (def) => {
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
