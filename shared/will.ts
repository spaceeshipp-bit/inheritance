// The live will: pure rules, used by the server (authority) and by the client
// (to preview what a Bless/Tut would do and to show the remaining budget).
//
// Shares are integer percentage points that always sum to 100.
// Only Grandma changes the will. The game never adds or subtracts on its own.
import { WILL } from './constants.js';

export interface WillState {
  shares: Record<string, number>;
  /** Points moved so far this visit. */
  usedThisVisit: number;
  /** Recent changes for the rolling cap: time (s) and points moved. */
  recent: { t: number; points: number }[];
}

export type WillRejectReason = 'budget' | 'rolling' | 'zero-needs-parchment' | 'no-room' | 'unknown-target' | 'no-op';

export interface WillResult {
  ok: boolean;
  /** Points actually moved onto (positive) or off (negative) the target. */
  moved: number;
  reason?: WillRejectReason;
}

export function createWill(ids: string[]): WillState {
  const shares: Record<string, number> = {};
  const base = Math.floor(100 / Math.max(1, ids.length));
  let rest = 100 - base * ids.length;
  for (const id of ids) {
    shares[id] = base + (rest > 0 ? 1 : 0);
    if (rest > 0) rest--;
  }
  return { shares, usedThisVisit: 0, recent: [] };
}

export function total(w: WillState): number {
  return Object.values(w.shares).reduce((a, b) => a + b, 0);
}

/** Points Grandma can still move right now (min of visit budget and rolling cap). */
export function available(w: WillState, now: number): { budget: number; rolling: number; now: number } {
  const recent = w.recent.filter((r) => r.t > now - WILL.rollingWindow).reduce((a, r) => a + r.points, 0);
  const budget = Math.max(0, WILL.budgetPerVisit - w.usedThisVisit);
  const rolling = Math.max(0, WILL.rollingCap - recent);
  return { budget, rolling, now: Math.min(budget, rolling) };
}

/**
 * A new visit: the visit budget starts afresh. The rolling cap does not: it
 * looks back 30 s whatever the phase, so 20 points at the end of one visit
 * and 20 more at the start of the next cannot land within 30 s.
 */
export function resetVisitBudget(w: WillState): void {
  w.usedThisVisit = 0;
}

/**
 * Distribute `amount` points (positive = give, negative = take) across `ids`
 * in proportion to their shares, as integers (largest-remainder method).
 * Taking never leaves anyone below `floor`. Giving goes in proportion to
 * shares, so a disgraced cousin (0) stays at 0 unless everyone is at 0, in
 * which case it is split equally.
 */
function distribute(shares: Record<string, number>, ids: string[], amount: number, floor: number): void {
  if (amount === 0 || ids.length === 0) return;
  const sign = Math.sign(amount);
  let left = Math.abs(amount);
  // Loop because capping (when taking) can leave points to place.
  for (let guard = 0; left > 0 && guard < 10; guard++) {
    let eligible: string[];
    let weights: number[];
    if (sign < 0) {
      eligible = ids.filter((id) => shares[id] > floor);
      weights = eligible.map((id) => shares[id]);
    } else {
      const withShare = ids.filter((id) => shares[id] > 0);
      eligible = withShare.length > 0 ? withShare : ids;
      weights = withShare.length > 0 ? eligible.map((id) => shares[id]) : eligible.map(() => 1);
    }
    if (eligible.length === 0) break;
    const wsum = weights.reduce((a, b) => a + b, 0);
    const raw = eligible.map((_, i) => (left * weights[i]) / wsum);
    const base = raw.map((r) => Math.floor(r));
    let placed = base.reduce((a, b) => a + b, 0);
    const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (const o of order) {
      if (placed >= left) break;
      base[o.i]++;
      placed++;
    }
    for (let i = 0; i < eligible.length; i++) {
      const id = eligible[i];
      let n = base[i];
      if (sign < 0) n = Math.min(n, shares[id] - floor);
      shares[id] += sign * n;
      left -= n;
    }
  }
}

/**
 * Move `delta` points onto (`delta > 0`) or off (`delta < 0`) `target`, taking
 * from / giving to everyone else in proportion. Clamped to what the budget and
 * rolling cap allow. A quick edit (fromParchment = false) can never take any
 * cousin to 0%, the target or the others it draws from: disgracing someone
 * needs the full parchment.
 */
export function applyChange(w: WillState, target: string, delta: number, now: number, fromParchment: boolean): WillResult {
  if (!(target in w.shares)) return { ok: false, moved: 0, reason: 'unknown-target' };
  if (delta === 0) return { ok: false, moved: 0, reason: 'no-op' };
  const others = Object.keys(w.shares).filter((id) => id !== target);
  const cur = w.shares[target];
  const floor = fromParchment ? 0 : 1;
  let want = delta;
  if (want < 0) {
    if (cur <= floor) return { ok: false, moved: 0, reason: fromParchment ? 'no-room' : 'zero-needs-parchment' };
    want = Math.max(want, floor - cur);
  } else {
    const room = others.reduce((a, id) => a + Math.max(0, w.shares[id] - floor), 0);
    if (room <= 0) return { ok: false, moved: 0, reason: 'no-room' };
    want = Math.min(want, room);
  }
  const av = available(w, now);
  if (av.budget <= 0) return { ok: false, moved: 0, reason: 'budget' };
  if (av.rolling <= 0) return { ok: false, moved: 0, reason: 'rolling' };
  const mag = Math.min(Math.abs(want), av.now);
  if (mag === 0) return { ok: false, moved: 0, reason: 'no-op' };
  const moved = Math.sign(want) * mag;
  w.shares[target] = cur + moved;
  distribute(w.shares, others, -moved, floor);
  w.usedThisVisit += mag;
  w.recent.push({ t: now, points: mag });
  return { ok: true, moved };
}

/** Set a share directly from the full parchment (1-point drags arrive as repeated calls). */
export function setShare(w: WillState, target: string, value: number, now: number): WillResult {
  if (!(target in w.shares)) return { ok: false, moved: 0, reason: 'unknown-target' };
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return applyChange(w, target, v - w.shares[target], now, true);
}

/** Cousin ids ordered from lowest to highest share (for the Reading of the Will). */
export function readingOrder(w: WillState): string[] {
  return Object.keys(w.shares).sort((a, b) => w.shares[a] - w.shares[b] || a.localeCompare(b));
}

/** The leader (biggest share), or null on a tie for first. */
export function leader(w: WillState): string | null {
  const ids = Object.keys(w.shares);
  if (ids.length === 0) return null;
  const max = Math.max(...ids.map((id) => w.shares[id]));
  const top = ids.filter((id) => w.shares[id] === max);
  return top.length === 1 ? top[0] : null;
}
