// Every map (shared/maps/*) has to hold a whole match: spawns in the open,
// heirlooms on pedestals, a dinner table with its door, bot paths that reach
// the whole floor, no overlap with the other maps, and a bots-only full match
// that runs to the reading with plenty of mischief and nobody lost through a
// wall. A new map is checked by this file as soon as it is registered.
import { describe, expect, it } from 'vitest';
import { COUSIN, DINNER, HEIRLOOM } from '../../shared/constants.js';
import { MAPS, MAP_IDS, groundHeight, inDrop, insideMap, mapAt, roomAt, type Box, type MapDef } from '../../shared/map.js';
import { CHAR_SHAPE, blockersAt, circleRectPush } from '../../shared/movement.js';
import { flatDist } from '../../shared/senses.js';
import type { Vec3 } from '../../shared/types.js';
import { Match } from '../../server/match.js';
import { findPath, freePoint, hasLOS, levelOf, waypoints } from '../../server/nav.js';

const within = (p: Vec3, b: { min: Vec3; max: Vec3 }, pad = 0) =>
  p.x >= b.min.x - pad && p.x <= b.max.x + pad && p.z >= b.min.z - pad && p.z <= b.max.z + pad;

/** Clear of every wall and piece of furniture at floor level, with `spare` metres to spare. */
function clearAt(p: Vec3, spare = 0.05): boolean {
  for (const b of blockersAt(p.y, CHAR_SHAPE, false)) if (circleRectPush(p.x, p.z, CHAR_SHAPE.radius + spare, b)) return false;
  return true;
}

/** Distance from a point to a table rectangle's edge (0 inside). */
function toTable(p: Vec3, t: MapDef['dinner']['table']): number {
  const dx = Math.max(t.minX - p.x, 0, p.x - t.maxX), dz = Math.max(t.minZ - p.z, 0, p.z - t.maxZ);
  return Math.hypot(dx, dz);
}

describe('the maps share one world without overlapping', () => {
  it('have distinct ids, names and bounds that never overlap', () => {
    expect(new Set(MAP_IDS.map((id) => MAPS[id].name)).size).toBe(MAP_IDS.length);
    for (let i = 0; i < MAP_IDS.length; i++) {
      for (let j = i + 1; j < MAP_IDS.length; j++) {
        const a = MAPS[MAP_IDS[i]].bounds, b = MAPS[MAP_IDS[j]].bounds;
        const apart = a.max.x + 10 < b.min.x || b.max.x + 10 < a.min.x || a.max.z + 10 < b.min.z || b.max.z + 10 < a.min.z;
        expect(apart, `${MAP_IDS[i]} and ${MAP_IDS[j]} are at least 10 m apart`).toBe(true);
      }
    }
  });
});

for (const id of MAP_IDS) {
  const def = MAPS[id];
  const S = def.spawns;
  describe(`map: ${def.name} (${id})`, () => {
    it('keeps all its boxes, ramps and volumes inside its bounds', () => {
      expect(def.blurb.length).toBeGreaterThan(10);
      for (const b of def.boxes) {
        expect(within(b.min, def.bounds), `${b.label ?? b.kind} min`).toBe(true);
        expect(within(b.max, def.bounds), `${b.label ?? b.kind} max`).toBe(true);
      }
      for (const v of def.inside) expect(within(v.min, def.bounds) && within(v.max, def.bounds)).toBe(true);
      for (const p of [S.grandma, S.dinnerGrandma, S.cat, S.teacup, ...S.cousins, ...S.dinnerCousins, ...S.pills]) {
        expect(mapAt(p)?.id, `${JSON.stringify(p)} is on the map`).toBe(id);
        expect(insideMap(p, def), `${JSON.stringify(p)} is inside its walls`).toBe(true);
      }
    });

    it('seats seven cousins in the open, apart, facing room in front of Grandma', () => {
      // Visit spawns: out of each other's shove reach. Dinner: elbow to elbow round the table, but not touching.
      for (const [seats, apart] of [[S.cousins, COUSIN.shoveRange + 0.15], [S.dinnerCousins, 2 * CHAR_SHAPE.radius + 0.3]] as const) {
        expect(seats.length).toBe(7);
        for (let i = 0; i < seats.length; i++) {
          expect(clearAt(seats[i]), `seat ${i} at ${JSON.stringify(seats[i])} is clear`).toBe(true);
          expect(groundHeight(seats[i].x, seats[i].z, seats[i].y + 0.1)).toBeCloseTo(seats[i].y, 1);
          for (let j = i + 1; j < seats.length; j++) expect(flatDist(seats[i], seats[j])).toBeGreaterThan(apart);
        }
      }
      expect(clearAt(S.grandma)).toBe(true);
      expect(clearAt(S.dinnerGrandma)).toBe(true);
      for (const p of S.cousins) expect(flatDist(p, S.grandma)).toBeGreaterThan(3);
      expect(roomAt(S.grandma)).not.toBe('Outside');
    });

    it('has heirloom spots on pedestals, enough for a match', () => {
      expect(def.heirloomSpots.length).toBeGreaterThanOrEqual(HEIRLOOM.perMatch);
      const pedestals = def.boxes.filter((b: Box) => b.kind === 'pedestal');
      for (const s of def.heirloomSpots) {
        expect(pedestals.some((b) => within(s, b) && Math.abs(b.max.y - s.y) < 0.01), `${JSON.stringify(s)} on a pedestal`).toBe(true);
      }
    });

    it('has a dinner table everyone sits round, and a door to excuse yourself at', () => {
      const t = def.dinner.table;
      expect(def.boxes.some((b) => b.kind === 'table' && Math.abs(b.min.x - t.minX) < 0.3 && Math.abs(b.max.x - t.maxX) < 0.3
        && Math.abs(b.min.z - t.minZ) < 0.3 && Math.abs(b.max.z - t.maxZ) < 0.3), 'a table box matches dinner.table').toBe(true);
      for (const p of S.dinnerCousins) expect(toTable(p, t)).toBeLessThan(DINNER.away - 0.4);
      expect(toTable(S.dinnerGrandma, t)).toBeLessThan(DINNER.away - 0.4);
      const door = { x: def.dinner.door.x, y: 0, z: def.dinner.door.z };
      expect(insideMap(door, def)).toBe(true);
      expect(toTable(door, t)).toBeGreaterThan(DINNER.away); // going to the door is leaving the table
      expect(S.dinnerCousins.every((p) => flatDist(p, door) > DINNER.doorRange)).toBe(true);
    });

    it("has waypoints in the open, and the bots' paths reach all of them from Grandma's chair", () => {
      const pts = waypoints(id);
      expect(pts.length).toBeGreaterThanOrEqual(12);
      expect(def.nav.beat.length).toBeGreaterThanOrEqual(4);
      for (const p of pts) {
        const lv = levelOf(p) === 'gallery' ? 'gallery' : 'ground';
        const q = freePoint(p, lv);
        expect(flatDist(p, q), `waypoint ${JSON.stringify(p)} is (nearly) clear of furniture`).toBeLessThan(0.4);
        const path = findPath(S.grandma, p);
        expect(path.length, `a path to ${JSON.stringify(p)}`).toBeGreaterThan(0);
        let from = S.grandma;
        for (const step of path) {
          const lf = levelOf(from), ls = levelOf(step);
          if (lf === ls && lf !== 'ramp') expect(hasLOS(from, step, lf)).toBe(true);
          from = step;
        }
        expect(flatDist(path[path.length - 1], p)).toBeLessThan(0.6);
      }
    });

    it('a bots-only full match runs to the reading: mischief everywhere, nobody lost through a wall', () => {
      let acts = 0, lost = 0;
      for (const seed of [3, 4]) {
        const m = new Match({
          players: ['nana', 'c0', 'c1', 'c2', 'c3', 'c4'].map((p) => ({ id: p, name: p, isBot: true })),
          grandmaId: 'nana', options: { fullMatch: true, fillBots: true, pushGrandma: false, map: id }, fast: true, seed, send: () => {},
        });
        expect(m.mapDef.id).toBe(id);
        m.start();
        const last = new Map<string, Vec3>();
        let phase = m.phase, visit = m.visitIndex;
        while (m.phase !== 'reading' && m.time < 600) {
          m.step(1 / 30);
          const same = m.phase === phase && m.visitIndex === visit;
          for (const c of m.chars.values()) {
            const was = last.get(c.id);
            // Brought back without having fallen through a drop zone (overboard is allowed: it is the point).
            if (same && was && flatDist(was, c.body.pos) > 1.5 && !inDrop(was, def)) lost++;
            if (!insideMap(c.body.pos, def, 0.6, 2) && !inDrop(c.body.pos, def)) lost++;
            last.set(c.id, { ...c.body.pos });
          }
          phase = m.phase; visit = m.visitIndex;
        }
        expect(m.phase).toBe('reading');
        acts += m.log.events.filter((e) => e.kind === 'shove' || e.kind === 'break' || e.kind === 'steal' || e.kind === 'plant').length;
      }
      expect(acts).toBeGreaterThan(6);
      expect(lost).toBe(0);
    }, 120_000);
  });
}

describe('choosing a map', () => {
  it("'random' picks one of the maps when the match starts, the same one for the same seed", () => {
    const pick = (seed: number) => new Match({
      players: ['nana', 'c0', 'c1', 'c2'].map((p) => ({ id: p, name: p, isBot: true })),
      grandmaId: 'nana', options: { fullMatch: false, fillBots: true, pushGrandma: false, map: 'random' }, fast: true, seed, send: () => {},
    });
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const m = pick(seed);
      expect(MAP_IDS).toContain(m.mapDef.id);
      expect(m.options.map).toBe(m.mapDef.id);
      expect(pick(seed).mapDef.id).toBe(m.mapDef.id);
      seen.add(m.mapDef.id);
    }
    expect(seen.size).toBe(MAP_IDS.length);
  });

  it('the match message and the playtest record name the map', () => {
    const m = new Match({
      players: ['nana', 'c0', 'c1', 'c2'].map((p) => ({ id: p, name: p, isBot: true })),
      grandmaId: 'nana', options: { fullMatch: false, fillBots: true, pushGrandma: false, map: 'manor' }, fast: true, seed: 1, send: () => {},
    });
    const msg = m.matchMsgFor('c0');
    expect(msg.t === 'match' && msg.options.map).toBe('manor');
    expect(m.summary().options.map).toBe('manor');
  });
});
