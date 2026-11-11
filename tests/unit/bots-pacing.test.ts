// Bot cousins' pacing (review finding P2): a visit should hold a few memorable
// crimes, not constant noise. Whole Afternoon Tea visits at normal speed with a
// bot Grandma, three bot cousins and one human cousin who just stands there
// (a new player reading the screen), over many seeds.
import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../../shared/constants.js';
import type { LogEvent } from '../../shared/types.js';
import { Match } from '../../server/match.js';

type Sabotage = Extract<LogEvent, { kind: 'shove' | 'break' | 'steal' | 'plant' | 'knock-specs' }>;
const isSabotage = (e: LogEvent): e is Sabotage =>
  e.kind === 'shove' || e.kind === 'break' || e.kind === 'steal' || e.kind === 'plant' || e.kind === 'knock-specs';
/** The cousin an act of sabotage was aimed at, if any. */
const targetOf = (e: Sabotage): string | null => (e.kind === 'shove' ? e.victim : e.kind === 'steal' || e.kind === 'plant' ? e.owner : null);

interface Visit { index: number; start: number; end: number }
interface Played { m: Match; visits: Visit[] }

/** Play a match (bots, plus humans who just stand there) up to the reading, noting when each visit ran. */
function play(opts: { seed: number; humans: string[]; bots: string[]; grandmaId: string; fast: boolean; full?: boolean; visitSeconds?: number; onTick?: (m: Match) => void }): Played {
  const m = new Match({
    players: [...opts.humans.map((id) => ({ id, name: id, isBot: false })), ...opts.bots.map((id) => ({ id, name: id, isBot: true }))],
    grandmaId: opts.grandmaId,
    options: { fullMatch: !!opts.full, fillBots: true, pushGrandma: false },
    fast: opts.fast, visitSeconds: opts.visitSeconds, seed: opts.seed, send: () => {},
  });
  const visits: Visit[] = [];
  m.start();
  let last = m.phase;
  while (m.phase !== 'reading' && m.time < 3000) {
    m.step(1 / 30);
    if (m.phase === 'visit' && last !== 'visit') visits.push({ index: m.visitIndex, start: m.phaseEndsAt - m.durations.visit(m.visits[m.visitIndex]), end: Infinity });
    if (m.phase !== 'visit' && last === 'visit') visits[visits.length - 1].end = m.time;
    if (m.phase === 'visit') opts.onTick?.(m);
    last = m.phase;
  }
  return { m, visits };
}

/** A bot's acts of sabotage as incidents: knock-on effects within 3 s (a shove that topples a vase) are one act. */
function incidents(acts: Sabotage[]): number[] {
  const out: number[] = [];
  for (const a of acts) if (!out.length || a.t - out[out.length - 1] > 3) out.push(a.t);
  return out;
}

const gaps = (ts: number[]): number[] => ts.slice(1).map((t, i) => t - ts[i]);
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

const BOT_COUSINS = ['b1', 'b2', 'b3'];
const HUMAN = 'h';

describe('bot cousins pace their sabotage (P2: a few memorable crimes, not constant noise)', () => {
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  let runs: Played[] = [];
  /** How far each bot strayed from where it started, per run. */
  const roamed: Record<string, number>[] = [];
  beforeAll(() => {
    runs = SEEDS.map((seed) => {
      const far: Record<string, number> = {};
      const from = new Map<string, { x: number; z: number }>();
      const r = play({
        seed, humans: [HUMAN], bots: ['nana', ...BOT_COUSINS], grandmaId: 'nana', fast: false,
        onTick: (m) => {
          for (const id of BOT_COUSINS) {
            const p = m.chars.get(id)!.body.pos;
            if (!from.has(id)) from.set(id, { x: p.x, z: p.z });
            const o = from.get(id)!;
            far[id] = Math.max(far[id] ?? 0, Math.hypot(p.x - o.x, p.z - o.z));
          }
        },
      });
      roamed.push(far);
      return r;
    });
  }, 120_000);
  const actsOf = (r: Played, id: string): Sabotage[] => r.m.log.events.filter((e): e is Sabotage => isSabotage(e) && e.by === id);

  it('every visit was played in full', () => {
    for (const r of runs) {
      expect(r.visits).toHaveLength(1);
      expect(r.visits[0].end - r.visits[0].start).toBeGreaterThan(179);
    }
  });

  it(`each bot waits at least ${BOTS.sabotageGapMin} s between acts of sabotage`, () => {
    const all: number[] = [];
    for (const r of runs) for (const id of BOT_COUSINS) all.push(...gaps(incidents(actsOf(r, id))));
    expect(all.length).toBeGreaterThan(20);
    expect(Math.min(...all)).toBeGreaterThanOrEqual(BOTS.sabotageGapMin);
  });

  it(`nobody misbehaves in the first ${BOTS.openingMax} s of a visit`, () => {
    for (const r of runs) {
      const early = r.m.log.events.filter((e) => isSabotage(e) && e.t - r.visits[0].start < BOTS.openingMax);
      expect(early).toEqual([]);
    }
  });

  it(`a human is never picked on again within ${BOTS.humanCooldown} s (and never in the opening)`, () => {
    let targeted = 0;
    for (const r of runs) {
      const hits = r.m.log.events.filter((e): e is Sabotage => isSabotage(e) && e.by !== null && BOT_COUSINS.includes(e.by) && targetOf(e) === HUMAN).map((e) => e.t);
      targeted += hits.length;
      for (const g of gaps(hits)) expect(g).toBeGreaterThanOrEqual(BOTS.humanCooldown);
      if (hits.length) expect(hits[0] - r.visits[0].start).toBeGreaterThanOrEqual(BOTS.openingMax);
    }
    // The human is still part of the game, just not hounded.
    expect(targeted).toBeGreaterThan(0);
  });

  it('while a human is in their first visit, bots mostly pick on each other', () => {
    let atHuman = 0, atCousins = 0;
    for (const r of runs) {
      for (const id of BOT_COUSINS) {
        for (const e of actsOf(r, id)) {
          const t = targetOf(e);
          if (!t) continue;
          atCousins++;
          if (t === HUMAN) atHuman++;
        }
      }
    }
    // Picked evenly, the human would be a third of each bot's targets.
    expect(atCousins).toBeGreaterThan(50);
    expect(atHuman / atCousins).toBeLessThan(0.2);
  });

  it(`a bot tattles at most once every ${BOTS.tattleGap} s`, () => {
    let tattles = 0;
    for (const r of runs) {
      for (const id of BOT_COUSINS) {
        const ts = r.m.log.events.filter((e) => e.kind === 'tattle' && e.by === id).map((e) => e.t);
        tattles += ts.length;
        for (const g of gaps(ts)) expect(g).toBeGreaterThanOrEqual(BOTS.tattleGap);
      }
    }
    expect(tattles).toBeGreaterThan(0);
  });

  it('a visit holds a few crimes per bot, and the house keeps most of its heirlooms', () => {
    const per = (kind: LogEvent['kind']): number[] => runs.flatMap((r) => BOT_COUSINS.map((id) => r.m.log.events.filter((e) => e.kind === kind && 'by' in e && e.by === id).length));
    const acts = runs.flatMap((r) => BOT_COUSINS.map((id) => incidents(actsOf(r, id)).length));
    // Before this pacing a bot managed ~14 incidents a visit (~9 shoves, ~3 plants, ~3 tattles).
    expect(mean(acts)).toBeGreaterThanOrEqual(1.5);
    expect(mean(acts)).toBeLessThanOrEqual(6);
    expect(Math.max(...acts)).toBeLessThanOrEqual(8);
    expect(mean(per('shove'))).toBeLessThanOrEqual(3);
    expect(mean(per('plant'))).toBeLessThanOrEqual(1.5);
    expect(mean(per('tattle'))).toBeLessThanOrEqual(2);
    // Heirlooms: all six used to go in one visit. Bots set out to break two at most;
    // a shove into a pedestal can add one more.
    const broken = runs.map((r) => r.m.log.events.filter((e) => e.kind === 'break').length);
    expect(Math.max(...broken)).toBeLessThanOrEqual(4);
    expect(mean(broken)).toBeLessThanOrEqual(2.5);
  });

  it("bots mostly misbehave out of Nana's sight, but she catches the odd careless one", () => {
    const acts = runs.flatMap((r) => BOT_COUSINS.flatMap((id) => actsOf(r, id)));
    const seen = acts.filter((e) => 'seen' in e && e.seen).length;
    expect(seen).toBeGreaterThan(0);
    expect(seen / acts.length).toBeLessThan(0.2);
  });

  it('bots still flatter Nana, run her errands and get about the house', () => {
    const compliments = runs.map((r) => r.m.log.events.filter((e) => e.kind === 'compliment').length);
    const errands = runs.map((r) => r.m.log.events.filter((e) => e.kind === 'wish').length);
    expect(mean(compliments)).toBeGreaterThan(3);
    expect(mean(errands)).toBeGreaterThan(2);
    // Every bot gets about the house rather than standing in one spot.
    for (const far of roamed) for (const id of BOT_COUSINS) expect(far[id]).toBeGreaterThan(6);
  });
});

describe('the opening window scales with a short visit', () => {
  it('40 s test visits: no sabotage in the first 15% of each visit (6 s), but plenty after', () => {
    let after = 0;
    for (const seed of [1, 2, 3, 4]) {
      const r = play({ seed, humans: [], bots: ['nana', 'c0', 'c1', 'c2', 'c3'], grandmaId: 'nana', fast: true, full: true });
      expect(r.visits).toHaveLength(3);
      for (const v of r.visits) {
        const opening = BOTS.openingFrac * (v.end - v.start);
        expect(opening).toBeCloseTo(6, 0);
        const acts = r.m.log.events.filter((e) => isSabotage(e) && e.t >= v.start && e.t <= v.end);
        expect(acts.filter((e) => e.t - v.start < opening)).toEqual([]);
        after += acts.length;
      }
    }
    expect(after).toBeGreaterThan(10);
  }, 60_000);
});
