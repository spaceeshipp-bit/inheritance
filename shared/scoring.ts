// Grandma's score: how well her final will punishes the cousins who actually
// sabotaged. The server logs every act of sabotage secretly (SABOTAGE_POINTS);
// cousins never see the tally during a match.
//
// Score 0..100. 100 = shares perfectly opposite to sabotage (the worst
// saboteur got the least). 50 = no relationship. 0 = she rewarded the saboteurs.
// When nobody sabotaged (or everyone equally), the score is 50.

/** Pearson correlation; returns 0 when either side has no variance. */
export function correlation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

export function grandmaScore(shares: Record<string, number>, sabotage: Record<string, number>): number {
  const ids = Object.keys(shares);
  const s = ids.map((id) => shares[id]);
  const b = ids.map((id) => sabotage[id] ?? 0);
  const r = correlation(s, b);
  return Math.round(50 * (1 - r));
}

export type CousinOutcome = 'winner' | 'tied' | 'partial' | 'disgraced';

/**
 * Cousin outcome labels for the reading and the results screen. The biggest
 * share wins ("inherits the lot"); when several cousins share the biggest
 * share, none of them takes the lot alone: they are 'tied' ("split the lot").
 * Anyone else above 0% gets a share; 0% is disgraced.
 */
export function cousinOutcome(shares: Record<string, number>, id: string): CousinOutcome {
  const values = Object.values(shares);
  const max = Math.max(...values);
  if (shares[id] === 0) return 'disgraced';
  if (shares[id] !== max) return 'partial';
  return values.filter((v) => v === max).length > 1 ? 'tied' : 'winner';
}
