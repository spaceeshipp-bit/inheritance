import { describe, expect, it } from 'vitest';
import { WILL } from '../../shared/constants.js';
import { applyChange, available, createWill, leader, readingOrder, resetVisitBudget, setShare, total } from '../../shared/will.js';
import { makeRng } from '../../server/match.js';

const sum = (s: Record<string, number>): number => Object.values(s).reduce((a, b) => a + b, 0);

describe('the live will', () => {
  it('starts equal and sums to 100 for 4 to 7 cousins', () => {
    for (let n = 4; n <= 7; n++) {
      const ids = Array.from({ length: n }, (_, i) => `c${i}`);
      const w = createWill(ids);
      expect(total(w)).toBe(100);
      const vals = Object.values(w.shares);
      expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(1);
    }
  });

  it('Bless moves 5 points onto the target, taken from the others in proportion', () => {
    const w = createWill(['a', 'b', 'c', 'd']);
    w.shares = { a: 40, b: 30, c: 20, d: 10 };
    const r = applyChange(w, 'd', WILL.quickStep, 0, false);
    expect(r).toEqual({ ok: true, moved: 5 });
    expect(w.shares.d).toBe(15);
    // 5 points taken 40:30:20 → 2.22 / 1.67 / 1.11 → largest remainder gives 2 / 2 / 1.
    expect(w.shares).toEqual({ a: 38, b: 28, c: 19, d: 15 });
    expect(sum(w.shares)).toBe(100);
  });

  it('Tut moves 5 points off the target and gives them out in proportion', () => {
    const w = createWill(['a', 'b', 'c', 'd']);
    const r = applyChange(w, 'a', -WILL.quickStep, 0, false);
    expect(r.ok).toBe(true);
    expect(w.shares.a).toBe(20);
    expect(sum(w.shares)).toBe(100);
    for (const id of ['b', 'c', 'd']) expect(w.shares[id]).toBeGreaterThan(25);
  });

  it('shares always sum to 100 under thousands of random edits', () => {
    const rng = makeRng(42);
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const w = createWill(ids);
    let t = 0;
    for (let i = 0; i < 5000; i++) {
      t += 31; // step past the rolling window so edits keep landing
      if (i % 12 === 0) resetVisitBudget(w);
      const target = ids[Math.floor(rng() * ids.length)];
      const kind = rng();
      if (kind < 0.4) applyChange(w, target, WILL.quickStep, t, false);
      else if (kind < 0.8) applyChange(w, target, -WILL.quickStep, t, false);
      else setShare(w, target, Math.floor(rng() * 101), t);
      expect(sum(w.shares)).toBe(100);
      for (const v of Object.values(w.shares)) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('caps the points moved per visit at the budget', () => {
    const w = createWill(['a', 'b', 'c', 'd', 'e']);
    let moved = 0;
    let t = 0;
    let rejected: string | undefined;
    for (let i = 0; i < 40; i++) {
      t += WILL.rollingWindow + 1; // never hit the rolling cap
      const r = applyChange(w, i % 2 ? 'a' : 'b', i % 3 ? WILL.quickStep : -WILL.quickStep, t, false);
      if (r.ok) moved += Math.abs(r.moved);
      else { rejected = r.reason; break; }
    }
    expect(moved).toBe(WILL.budgetPerVisit);
    expect(rejected).toBe('budget');
    expect(available(w, t).budget).toBe(0);
    resetVisitBudget(w);
    expect(available(w, t).budget).toBe(WILL.budgetPerVisit);
    expect(applyChange(w, 'a', WILL.quickStep, t, false).ok).toBe(true);
  });

  it('caps the points moved in any rolling window', () => {
    const w = createWill(['a', 'b', 'c', 'd', 'e']);
    for (let i = 0; i < WILL.rollingCap / WILL.quickStep; i++) expect(applyChange(w, 'a', WILL.quickStep, i, false).ok).toBe(true);
    const r = applyChange(w, 'b', WILL.quickStep, 4, false);
    expect(r).toMatchObject({ ok: false, reason: 'rolling' });
    expect(available(w, 4).rolling).toBe(0);
    // Once the window has rolled past the first change, there is room again.
    expect(applyChange(w, 'b', WILL.quickStep, WILL.rollingWindow + 0.5, false).ok).toBe(true);
  });

  it('a partial move is clamped to what the rolling cap allows', () => {
    const w = createWill(['a', 'b', 'c', 'd', 'e']);
    applyChange(w, 'a', WILL.quickStep, 0, false);
    applyChange(w, 'a', WILL.quickStep, 0, false);
    applyChange(w, 'a', WILL.quickStep, 0, false);
    // 15 used of 20: a parchment set of +10 only moves 5.
    const r = setShare(w, 'b', w.shares.b + 10, 1);
    expect(r).toMatchObject({ ok: true, moved: 5 });
    expect(sum(w.shares)).toBe(100);
  });

  it('a quick Tut can never take a cousin to 0%', () => {
    const w = createWill(['a', 'b', 'c', 'd']);
    w.shares = { a: 3, b: 32, c: 32, d: 33 };
    const r1 = applyChange(w, 'a', -WILL.quickStep, 0, false);
    expect(r1).toMatchObject({ ok: true, moved: -2 });
    expect(w.shares.a).toBe(1);
    const r2 = applyChange(w, 'a', -WILL.quickStep, 0, false);
    expect(r2).toMatchObject({ ok: false, reason: 'zero-needs-parchment' });
    expect(w.shares.a).toBe(1);
    expect(sum(w.shares)).toBe(100);
  });

  it('the full parchment can disgrace a cousin (0%)', () => {
    const w = createWill(['a', 'b', 'c', 'd']);
    w.shares = { a: 4, b: 32, c: 32, d: 32 };
    const r = setShare(w, 'a', 0, 0);
    expect(r).toMatchObject({ ok: true, moved: -4 });
    expect(w.shares.a).toBe(0);
    expect(sum(w.shares)).toBe(100);
    expect(readingOrder(w)[0]).toBe('a');
  });

  it('rejects unknown targets and no-ops, and reports the leader', () => {
    const w = createWill(['a', 'b', 'c', 'd']);
    expect(applyChange(w, 'zz', 5, 0, false)).toMatchObject({ ok: false, reason: 'unknown-target' });
    expect(applyChange(w, 'a', 0, 0, false)).toMatchObject({ ok: false, reason: 'no-op' });
    expect(leader(w)).toBeNull();
    applyChange(w, 'c', 5, 0, false);
    expect(leader(w)).toBe('c');
  });
});

describe('will floors and the rolling window (review R6, R14, R15)', () => {
  const mk = (shares: Record<string, number>) => ({ shares: { ...shares }, usedThisVisit: 0, recent: [] as { t: number; points: number }[] });

  it('a quick Bless never takes another cousin to 0 (only the parchment can disgrace)', () => {
    const w = mk({ a: 1, b: 1, c: 5, d: 93 });
    const r = applyChange(w, 'd', 5, 0, false);
    expect(r).toMatchObject({ ok: true, moved: 4 });
    expect(Object.values(w.shares).every((v) => v >= 1)).toBe(true);
    expect(Object.values(w.shares).reduce((a, b) => a + b, 0)).toBe(100);
    expect(applyChange(w, 'd', 5, 1, false)).toMatchObject({ ok: false, reason: 'no-room' });
    // The parchment may take others to 0.
    expect(setShare(w, 'd', 100, 2)).toMatchObject({ ok: true, moved: 3 });
    expect(w.shares).toEqual({ a: 0, b: 0, c: 0, d: 100 });
  });

  it('a Tut on someone else does not lift a disgraced cousin off 0', () => {
    const w = mk({ a: 0, b: 5, c: 5, d: 90 });
    expect(applyChange(w, 'd', -5, 0, false)).toMatchObject({ ok: true, moved: -5 });
    expect(w.shares.a).toBe(0);
    expect(w.shares.b + w.shares.c).toBe(15);
    // When everyone else is at 0 the points are split equally.
    const z = mk({ a: 0, b: 0, c: 0, d: 100 });
    applyChange(z, 'd', -6, 0, false);
    expect(z.shares).toEqual({ a: 2, b: 2, c: 2, d: 94 });
  });

  it('the rolling cap looks back 30 s across a visit boundary', () => {
    const w = mk({ a: 25, b: 25, c: 25, d: 25 });
    for (let i = 0; i < 4; i++) applyChange(w, 'a', 5, 0.1 * i, false);
    expect(w.usedThisVisit).toBe(20);
    resetVisitBudget(w);
    expect(w.usedThisVisit).toBe(0);
    expect(applyChange(w, 'b', 5, 10, false)).toMatchObject({ ok: false, reason: 'rolling' });
    expect(applyChange(w, 'b', 5, 31, false)).toMatchObject({ ok: true, moved: 5 });
  });
});
