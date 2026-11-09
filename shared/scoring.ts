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

/** Cousin outcome labels for the results screen. */
export function cousinOutcome(shares: Record<string, number>, id: string): 'winner' | 'partial' | 'disgraced' {
  const max = Math.max(...Object.values(shares));
  if (shares[id] === 0) return 'disgraced';
  return shares[id] === max ? 'winner' : 'partial';
}
