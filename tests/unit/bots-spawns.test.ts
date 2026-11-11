// Where cousins spawn (review finding P10): in the open hall in front of
// Grandma, not against the front-door wall where the first camera frame was the
// back of your own head and the back row could steal from the front row.
import { describe, expect, it } from 'vitest';
import { COUSIN } from '../../shared/constants.js';
import { BOXES, RAMPS, SPAWNS } from '../../shared/map.js';
import { CHAR_SHAPE, blockersAt, circleRectPush, forwardOf, rightOf, yawToward } from '../../shared/movement.js';
import { flatDist } from '../../shared/senses.js';
import { lineOfSight } from '../../shared/sight.js';
import { findPath, hasLOS, levelOf } from '../../server/nav.js';
import { makeMatch, toVisit } from './helpers.js';

const spawns = SPAWNS.cousins;
const nana = SPAWNS.grandma;
/** The cousin camera orbits 4.2 m behind the head; ask for most of that to be clear. */
const BOOM = 3.5;

describe('cousin spawn points (P10)', () => {
  it('seat up to seven cousins in the open hall, about z 2.5-3.5, clear of the front-door wall', () => {
    expect(spawns.length).toBe(7);
    for (const p of spawns) {
      expect(p.y).toBe(0);
      expect(p.z).toBeGreaterThanOrEqual(1.9);
      expect(p.z).toBeLessThanOrEqual(3.9);
      expect(Math.abs(p.x)).toBeLessThan(7);
    }
  });

  it('are at least 2 m apart: nobody starts within shove or steal reach of another', () => {
    for (let i = 0; i < spawns.length; i++) {
      for (let j = i + 1; j < spawns.length; j++) {
        const d = flatDist(spawns[i], spawns[j]);
        expect(d).toBeGreaterThanOrEqual(2);
        expect(d).toBeGreaterThan(COUSIN.reach);
        expect(d).toBeGreaterThan(COUSIN.shoveRange + 0.15);
      }
    }
  });

  it('are clear of furniture, walls and the staircase, and out of Grandma\'s way', () => {
    const blockers = blockersAt(0, CHAR_SHAPE, false);
    for (const p of spawns) {
      for (const b of blockers) expect(circleRectPush(p.x, p.z, CHAR_SHAPE.radius + 0.1, b)).toBeNull();
      // Not on (or under) the grand staircase.
      const r = RAMPS[0];
      expect(p.x < r.minX - CHAR_SHAPE.radius || p.x > r.maxX + CHAR_SHAPE.radius || p.z > r.zStart + CHAR_SHAPE.radius).toBe(true);
      // Named furniture near the spawns, with a body's width to spare.
      for (const label of ['Side table', "Grandma's chair", 'Pedestal stair foot W', 'Pedestal stair foot E']) {
        const box = BOXES.find((b) => b.label === label)!;
        const cx = Math.max(box.min.x, Math.min(p.x, box.max.x)), cz = Math.max(box.min.z, Math.min(p.z, box.max.z));
        expect(Math.hypot(p.x - cx, p.z - cz)).toBeGreaterThan(CHAR_SHAPE.radius + 0.05);
      }
      expect(flatDist(p, nana)).toBeGreaterThan(3);
    }
  });

  it('can reach the rest of the house by the bots\' paths', () => {
    const places = [{ x: 0, y: 3, z: -10 }, { x: 12, y: 0, z: 2.4 }, { x: 14.3, y: 0, z: 3.9 }, { x: -6.5, y: 0, z: -6.5 }];
    for (const p of spawns) {
      for (const to of places) {
        const path = findPath(p, to);
        expect(path.length).toBeGreaterThan(0);
        // Every leg on one floor is walkable in a straight line.
        let from = p;
        for (const q of path) {
          const lf = levelOf(from), lq = levelOf(q);
          if (lf === lq && lf !== 'ramp') expect(hasLOS(from, q, lf)).toBe(true);
          from = q;
        }
        expect(flatDist(path[path.length - 1], to)).toBeLessThan(0.6);
      }
    }
  });

  it('leave room for the camera behind each cousin when they face Grandma', () => {
    for (const p of spawns) {
      const yaw = yawToward(nana.x - p.x, nana.z - p.z);
      const f = forwardOf(yaw), r = rightOf(yaw);
      const pivot = { x: p.x, y: p.y + 1.55, z: p.z };
      const cam = { x: pivot.x - f.x * BOOM + r.x * 0.45, y: pivot.y, z: pivot.z - f.z * BOOM + r.z * 0.45 };
      expect(lineOfSight(pivot, cam)).toBe(true);
      // And Grandma is in view over their shoulder.
      expect(lineOfSight(pivot, { x: nana.x, y: 1.55, z: nana.z })).toBe(true);
    }
  });

  it('a match puts its cousins there, and nobody is pushed out of place', () => {
    const humans = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const { m } = makeMatch({ humans: [...humans, 'nana'], grandmaId: 'nana', seed: 3 });
    toVisit(m);
    for (let i = 0; i < 30; i++) m.step(1 / 30);
    m.cousinIds.forEach((id, i) => {
      const c = m.chars.get(id)!;
      expect(flatDist(c.body.pos, spawns[i])).toBeLessThan(0.01);
      expect(c.body.pos.y).toBeCloseTo(0, 3);
    });
  });
});
