// Accusations: a Tut that lands on a cousin linked to a recent crime is
// Grandma blaming them (review R13).
import { describe, expect, it } from 'vitest';
import { WILL } from '../../shared/constants.js';
import type { Match } from '../../server/match.js';
import { humanMatch, place, tick } from './scenario.js';

/** Drop an heirloom from height so it breaks, blamed on `by`. */
function smash(m: Match, by: string, at: { x: number; z: number }): string {
  const p = [...m.props.values()].find((x) => x.kind === 'heirloom' && !x.broken)!;
  p.spot = null; p.resting = false; p.lastBy = by;
  p.pos = { x: at.x, y: 2.4, z: at.z }; p.vel = { x: 0, y: -3, z: 0 };
  tick(m, 30);
  expect(p.broken).toBe(true);
  return p.id;
}

describe('accusations', () => {
  it('the culprit counts as being at the crime even when they threw it from across the room', () => {
    const { m } = humanMatch();
    place(m, 'a', 4, 4.5, 0); // 7 m from where it lands
    smash(m, 'a', { x: -2, z: -1 });
    const brk = m.log.events.findIndex((e) => e.kind === 'break' && e.by === 'a');
    expect(brk).toBeGreaterThanOrEqual(0);
    m.handleGrandma('g', { a: 'tut', target: 'a' });
    expect(m.log.events.some((e) => e.kind === 'accuse' && e.target === 'a' && e.crime === brk)).toBe(true);
  });

  it('a Tut that does not land (out of budget) is not an accusation', () => {
    const { m, box } = humanMatch();
    place(m, 'a', -2, -0.5, 0);
    smash(m, 'a', { x: -2, z: -1 });
    m.will.usedThisVisit = WILL.budgetPerVisit;
    m.handleGrandma('g', { a: 'tut', target: 'a' });
    expect(box.events('g', 'will-rejected').pop()).toMatchObject({ target: 'a', reason: 'budget' });
    expect(m.log.events.some((e) => e.kind === 'accuse')).toBe(false);
  });
});
