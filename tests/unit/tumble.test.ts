// Mind the Stairs: a cousin knocked flying who ends up 2.2 m or more below
// where it started is a moment for whoever did it: down the stairs when they
// rolled down a flight, over the banister when they simply dropped.
import { describe, expect, it } from 'vitest';
import { MAPS } from '../../shared/map.js';
import { knockback } from '../../server/physics.js';
import { stepUntil } from './helpers.js';
import { humanMatch, place, tick } from './scenario.js';

const nav = MAPS.manor.nav;

describe('Mind the Stairs', () => {
  it('shoved from the top of the grand staircase: all the way down the stairs', () => {
    const { m } = humanMatch();
    const top = nav.stairTop!, foot = nav.stairFoot!;
    const a = place(m, 'a', top.x, top.z, 0, top.y);
    tick(m);
    knockback(a, { x: foot.x - top.x, z: foot.z - top.z }, 7, 2, 'b', m.time);
    expect(stepUntil(m, () => m.log.events.some((e) => e.kind === 'tumble'), 6)).toBe(true);
    expect(m.log.events.find((e) => e.kind === 'tumble')).toMatchObject({ by: 'b', victim: 'a', stairs: true });
    expect(m.log.moments.find((x) => x.kind === 'tumble')?.text).toBe('B sent A all the way down the stairs.');
  });

  it('knocked off something high with no stairs on the way: over the banister', () => {
    const { m } = humanMatch();
    const a = place(m, 'a', -2, -1, 0);
    a.body.pos = { x: -2, y: 3.4, z: -1 };
    a.body.onGround = false;
    a.body.peakY = 3.4;
    knockback(a, { x: 1, z: 0 }, 1, 0, 'c', m.time);
    expect(stepUntil(m, () => m.log.events.some((e) => e.kind === 'tumble'), 4)).toBe(true);
    expect(m.log.moments.find((x) => x.kind === 'tumble')?.text).toBe('C sent A over the banister.');
  });

  it('a shove on the flat is no tumble', () => {
    const { m } = humanMatch();
    const a = place(m, 'a', -2, -1, 0);
    knockback(a, { x: 1, z: 0 }, 6, 2, 'b', m.time);
    tick(m, 90);
    expect(m.log.events.some((e) => e.kind === 'tumble')).toBe(false);
  });
});
