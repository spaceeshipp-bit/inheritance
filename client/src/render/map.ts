// Every map's look, by id. Each map has a builder in render/maps/<id>.ts that
// turns its MapDef (shared/maps/<id>.ts) into a MapView; a map without one yet
// is drawn as plain grey boxes, so a new map is playable before it is pretty.
import { mapById, type MapId } from '../../../shared/map.js';
import { greyBox, type MapBuilder, type MapView } from './maps/kit.js';
import { buildCarehome } from './maps/carehome.js';
import { buildCruise } from './maps/cruise.js';
import { buildParlour } from './maps/parlour.js';
import { buildManor } from './maps/manor.js';

export type { MapView } from './maps/kit.js';

/** Map builders by id (each map adds its own line). */
const BUILDERS: Partial<Record<MapId, MapBuilder>> = {
  manor: buildManor,
  carehome: buildCarehome,
  parlour: buildParlour,
  cruise: buildCruise,
};

/** Build a map's look (grey boxes if it has no builder yet). */
export function buildMap(id: MapId): MapView {
  const def = mapById(id);
  return (BUILDERS[def.id] ?? greyBox)(def);
}
