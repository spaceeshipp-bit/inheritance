import { describe, expect, it } from 'vitest';
import { correlation, cousinOutcome, grandmaScore } from '../../shared/scoring.js';
import { EventLog } from '../../server/log.js';
import { SABOTAGE_POINTS } from '../../shared/constants.js';

describe("Grandma's score", () => {
  it('is 100 when shares are exactly opposite to sabotage', () => {
    expect(grandmaScore({ a: 40, b: 30, c: 20, d: 10 }, { a: 0, b: 1, c: 2, d: 3 })).toBe(100);
  });

  it('is 0 when she rewarded the saboteurs', () => {
    expect(grandmaScore({ a: 40, b: 30, c: 20, d: 10 }, { a: 3, b: 2, c: 1, d: 0 })).toBe(0);
  });

  it('is 50 when nobody sabotaged or shares are flat', () => {
    expect(grandmaScore({ a: 40, b: 30, c: 20, d: 10 }, {})).toBe(50);
    expect(grandmaScore({ a: 25, b: 25, c: 25, d: 25 }, { a: 5, b: 0, c: 0, d: 0 })).toBe(50);
  });

  it('is always a whole number in 0..100', () => {
    for (let i = 0; i < 200; i++) {
      const shares: Record<string, number> = {}, sab: Record<string, number> = {};
      for (const id of ['a', 'b', 'c', 'd', 'e']) { shares[id] = Math.floor(Math.random() * 50); sab[id] = Math.floor(Math.random() * 10); }
      const s = grandmaScore(shares, sab);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it('correlation is 0 without variance', () => {
    expect(correlation([1, 1, 1], [1, 2, 3])).toBe(0);
    expect(correlation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
  });

  it('labels winners, partial winners and the disgraced', () => {
    const shares = { a: 50, b: 50, c: 0 };
    expect(cousinOutcome(shares, 'a')).toBe('winner');
    expect(cousinOutcome({ a: 60, b: 40 }, 'b')).toBe('partial');
    expect(cousinOutcome(shares, 'c')).toBe('disgraced');
  });
});

describe('the sabotage tally and moments (log.ts)', () => {
  const pos = { x: 0, y: 0, z: 0 };

  it('counts SABOTAGE_POINTS per act, only for cousins', () => {
    const log = new EventLog();
    log.add({ t: 1, kind: 'shove', by: 'a', victim: 'b', pos, seen: false });
    log.add({ t: 2, kind: 'break', by: 'a', heirloom: 'h1', favourite: true, pos, seen: false });
    log.add({ t: 3, kind: 'steal', by: 'b', item: 'item-phone', owner: 'c', pos, seen: false });
    log.add({ t: 4, kind: 'plant', by: 'b', item: 'item-phone', owner: 'c', pos, seen: false });
    log.add({ t: 5, kind: 'knock-specs', by: 'c' });
    log.add({ t: 6, kind: 'break', by: null, heirloom: 'h2', favourite: false, pos, seen: false });
    log.add({ t: 7, kind: 'compliment', by: 'a', line: 'Love you, Nana!' });
    const tally = log.sabotageTally(['a', 'b', 'c', 'd']);
    expect(tally).toEqual({
      a: SABOTAGE_POINTS.shove + SABOTAGE_POINTS.breakFavourite,
      b: SABOTAGE_POINTS.steal + SABOTAGE_POINTS.plant,
      c: SABOTAGE_POINTS.knockSpectacles,
      d: 0,
    });
  });

  it('tags Love You Nana, Caught Red-Handed, Framed, Favourite broken and Big Cut', () => {
    const log = new EventLog();
    log.add({ t: 10, kind: 'compliment', by: 'a', line: 'Love you, Nana!' });
    log.add({ t: 13, kind: 'shove', by: 'a', victim: 'b', pos, seen: false });
    log.add({ t: 20, kind: 'shove', by: 'c', victim: 'b', pos, seen: true });
    log.add({ t: 30, kind: 'plant', by: 'a', item: 'item-phone', owner: 'b', pos, seen: false });
    log.add({ t: 35, kind: 'accuse', target: 'b', crime: 3 });
    log.add({ t: 40, kind: 'break', by: 'c', heirloom: 'h', favourite: true, pos, seen: false });
    log.bigCuts(50, 'g', { a: 30, b: 2 });
    const kinds = log.moments.map((m) => m.kind);
    expect(kinds).toEqual(['love-you-nana', 'caught-red-handed', 'framed', 'favourite-broken', 'big-cut']);
    expect(log.moments[2]).toMatchObject({ actor: 'a', victim: 'b' });
    expect(log.metrics()).toEqual({ plants: 1, plantsAccusedOwner: 1, framingAccuracy: 1, shoves: 2, breaks: 1 });
  });

  it('no Love You Nana when the shove is seen or comes too late', () => {
    const log = new EventLog();
    log.add({ t: 0, kind: 'compliment', by: 'a', line: 'Love you, Nana!' });
    log.add({ t: 1, kind: 'shove', by: 'a', victim: 'b', pos, seen: true });
    log.add({ t: 9, kind: 'shove', by: 'a', victim: 'b', pos, seen: false });
    expect(log.moments.map((m) => m.kind)).toEqual(['caught-red-handed']);
    expect(log.metrics().framingAccuracy).toBeNull();
  });
});
