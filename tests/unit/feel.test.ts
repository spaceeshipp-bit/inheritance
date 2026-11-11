// Small things that make the game feel right (review P10, P12).
import { describe, expect, it } from 'vitest';
import { COUSIN } from '../../shared/constants.js';
import { SPAWNS } from '../../shared/map.js';
import { forwardOf } from '../../shared/movement.js';
import { makeMatch, toVisit } from './helpers.js';
import { humanMatch, place, press, tick } from './scenario.js';

describe('first impressions', () => {
  it('every cousin starts the visit facing Nana', () => {
    const { m } = makeMatch({ humans: ['g', 'a', 'b', 'c'], bots: ['x'], grandmaId: 'g', options: { fillBots: true } });
    toVisit(m);
    for (const id of m.cousinIds) {
      const c = m.chars.get(id)!;
      const f = forwardOf(c.yaw);
      const dx = SPAWNS.grandma.x - c.body.pos.x, dz = SPAWNS.grandma.z - c.body.pos.z;
      expect((f.x * dx + f.z * dz) / Math.hypot(dx, dz)).toBeGreaterThan(0.95);
    }
  });
});

describe('shoves', () => {
  it('a shove pressed just before the cooldown ends still lands when it does', () => {
    const { m } = humanMatch();
    const east = -Math.PI / 2;
    place(m, 'g', -5, 1.6, Math.PI / 2); // looking away
    place(m, 'a', 2, 1.6, east);
    place(m, 'b', 2.8, 1.6, 0);
    press(m, 'a', { yaw: east, shove: true });
    tick(m);
    expect(m.log.events.filter((e) => e.kind === 'shove').length).toBe(1);
    press(m, 'a', { yaw: east, shove: false });
    // Walk the victim back in range while the cooldown runs.
    tick(m, Math.round((COUSIN.shoveCooldown - 0.15) * 30));
    place(m, 'b', 2.8, 1.6, 0);
    m.chars.get('b')!.state = 'normal';
    press(m, 'a', { yaw: east, shove: true }); // 0.15 s early
    tick(m);
    press(m, 'a', { yaw: east, shove: false });
    expect(m.log.events.filter((e) => e.kind === 'shove').length).toBe(1);
    tick(m, 8);
    expect(m.log.events.filter((e) => e.kind === 'shove').length).toBe(2);
  });
});
