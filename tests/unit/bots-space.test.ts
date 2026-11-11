// Bots give Nana room (review finding P13): no crowding her, compliments paid
// from 1.3-1.6 m (close enough for her to hear clearly), wishes handed over from
// within the 1.6 m delivery range and then a step back. Whole Afternoon Tea
// visits at normal speed: a bot Grandma and four bot cousins, several seeds.
import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS, WISH } from '../../shared/constants.js';
import { flatDist } from '../../shared/senses.js';
import { Match } from '../../server/match.js';

const COUSINS = ['c0', 'c1', 'c2', 'c3'];

interface Run {
  /** Upright bot-cousin ticks on Nana's floor, and how many of them inside a radius. */
  ticks: number;
  inside1: number;
  /** Longest unbroken stretch any one bot spent inside her personal space (s). */
  longestInside: number;
  compliments: number[];
  deliveries: { d: number; by: string; t: number }[];
  /** How far each deliverer was from her 2.5 s after handing over. */
  afterDelivery: number[];
}

function run(seed: number): Run {
  const m = new Match({
    players: [{ id: 'nana', name: 'Nana', isBot: true }, ...COUSINS.map((id) => ({ id, name: id, isBot: true }))],
    grandmaId: 'nana', options: { fullMatch: false, fillBots: true, pushGrandma: false }, fast: false, seed, send: () => {},
  });
  const out: Run = { ticks: 0, inside1: 0, longestInside: 0, compliments: [], deliveries: [], afterDelivery: [] };
  const insideSince = new Map<string, number>();
  const gap = (id: string): number => {
    const g = m.grandma!, c = m.chars.get(id)!;
    return flatDist(c.body.pos, g.body.pos);
  };
  m.log.onLog((ev) => {
    if (ev.kind === 'compliment') out.compliments.push(gap(ev.by));
    if (ev.kind === 'wish') out.deliveries.push({ d: gap(ev.by), by: ev.by, t: ev.t });
  });
  m.start();
  while (m.phase !== 'reading') {
    m.step(1 / 30);
    if (m.phase !== 'visit') continue;
    const g = m.grandma!;
    for (const id of COUSINS) {
      const c = m.chars.get(id)!;
      const d = flatDist(c.body.pos, g.body.pos);
      const upright = c.state === 'normal' && Math.abs(c.body.pos.y - g.body.pos.y) < 1;
      if (upright) {
        out.ticks++;
        if (d < 1.0) out.inside1++;
      }
      if (upright && d < BOTS.personalSpace) {
        if (!insideSince.has(id)) insideSince.set(id, m.time);
        out.longestInside = Math.max(out.longestInside, m.time - insideSince.get(id)!);
      } else insideSince.delete(id);
    }
    for (const dl of out.deliveries) if (dl.t + 2.5 <= m.time && dl.t + 2.5 > m.time - 1 / 30) out.afterDelivery.push(gap(dl.by));
  }
  return out;
}

describe("bots give Nana room (P13)", () => {
  let runs: Run[] = [];
  beforeAll(() => { runs = [21, 22, 23, 24, 25, 26].map(run); }, 120_000);

  it(`bot cousins keep out of her personal space (${BOTS.personalSpace} m)`, () => {
    const ticks = runs.reduce((a, r) => a + r.ticks, 0);
    const inside = runs.reduce((a, r) => a + r.inside1, 0);
    expect(ticks).toBeGreaterThan(50000);
    // Within a metre of her: almost never (only when she walks into someone mid-act).
    expect(inside / ticks).toBeLessThan(0.002);
    // Nobody lingers at her elbow.
    for (const r of runs) expect(r.longestInside).toBeLessThan(1.5);
  });

  it(`compliments are paid from ${BOTS.complimentMin}-${BOTS.complimentMax} m, where she hears them clearly`, () => {
    const ds = runs.flatMap((r) => r.compliments);
    expect(ds.length).toBeGreaterThan(30);
    for (const d of ds) {
      expect(d).toBeGreaterThanOrEqual(BOTS.complimentMin - 0.01);
      expect(d).toBeLessThanOrEqual(BOTS.complimentMax + 0.01);
    }
  });

  it(`wishes are handed over from within ${WISH.deliverRange} m, outside her personal space, and then the bot steps back`, () => {
    const ds = runs.flatMap((r) => r.deliveries.map((x) => x.d));
    expect(ds.length).toBeGreaterThan(10);
    for (const d of ds) {
      expect(d).toBeLessThanOrEqual(WISH.deliverRange);
      // She may shuffle a few centimetres towards them as it is handed over.
      expect(d).toBeGreaterThan(BOTS.personalSpace - 0.1);
    }
    const after = runs.flatMap((r) => r.afterDelivery);
    expect(after.length).toBeGreaterThan(10);
    expect(after.filter((d) => d >= 2).length / after.length).toBeGreaterThan(0.7);
  });
});
