// The bot Grandma (review findings R12, S19, and the GDD's Gate 1 for framing):
// she decides only from what a human Grandma could know (the events her client
// is sent, what she can see right now) and never from the secret log; framing
// reads, and she rewards the flattery and errands she witnesses.
import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS, COUSIN, QUICKCHAT, WILL } from '../../shared/constants.js';
import { angleFromFacing } from '../../shared/senses.js';
import { available } from '../../shared/will.js';
import { Match } from '../../server/match.js';
import { makeMatch, stepUntil, toVisit } from './helpers.js';
import { place, press, tick } from './scenario.js';

const EAST = -Math.PI / 2;
const WEST = Math.PI / 2;
const I_SAW_THAT = QUICKCHAT.grandma[3];

/** Tuts that landed on `id` at or after `since`. */
const tutsOn = (m: Match, id: string, since: number): number =>
  m.log.events.filter((e) => e.kind === 'will' && e.via === 'tut' && e.target === id && e.t >= since).length;

/** Four human cousins and a bot Grandma at her spot facing east; the cousins wait in the kitchen, out of her sight. */
function nanaMatch(seed: number) {
  const r = makeMatch({ humans: ['a', 'b', 'c', 'd'], bots: ['nana'], grandmaId: 'nana', seed });
  toVisit(r.m);
  place(r.m, 'a', 9.5, 4.5, 0);
  place(r.m, 'b', 11.5, 4.5, 0);
  place(r.m, 'c', 9.5, -3, 0);
  place(r.m, 'd', 11.5, -3, 0);
  place(r.m, 'nana', -5, 1.6, EAST);
  r.m.step(1 / 30);
  return r;
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

describe('the bot Grandma acts only on what she perceives (R12, S19)', () => {
  it('a shove behind her back: she turns toward the noise, but blames nobody she did not see', () => {
    let turned = 0;
    for (const seed of SEEDS) {
      const { m } = nanaMatch(seed);
      place(m, 'a', -7.5, 3, 0);
      place(m, 'b', -7.5, 2.2, 0);
      press(m, 'a', { shove: true });
      tick(m);
      const shove = m.log.events.find((e) => e.kind === 'shove' && e.by === 'a');
      expect(shove).toMatchObject({ seen: false });
      if (shove?.kind !== 'shove') continue;
      // The shover slips off to the kitchen.
      place(m, 'a', 12, 4, 0);
      const t0 = m.time;
      let faced = false;
      for (let i = 0; i < 90; i++) {
        tick(m);
        const g = m.grandma!;
        if (angleFromFacing({ pos: g.body.pos, yaw: g.yaw }, shove.pos) < 55) faced = true;
      }
      if (faced) turned++;
      expect(tutsOn(m, 'a', t0)).toBe(0);
    }
    expect(turned).toBeGreaterThanOrEqual(SEEDS.length - 1);
  }, 30_000);

  it('spectacles knocked off from behind: she does not Tut the thrower she never saw', () => {
    let knocked = 0;
    for (const seed of SEEDS) {
      const { m } = nanaMatch(seed);
      // a takes the teacup from the kitchen counter and winds up a throw there...
      const a = place(m, 'a', 12, -4.55, 0);
      press(m, 'a', { yaw: 0, pitch: -0.3, primary: true });
      tick(m);
      expect(a.holding).toBe('teacup');
      for (let i = 0; i < 32; i++) { press(m, 'a', { yaw: 0, pitch: -0.2, primary: true, secondary: true }); tick(m); }
      // ...then lets fly at the back of her head.
      place(m, 'nana', -5, 1.6, EAST);
      place(m, 'a', -6.6, 1.6, EAST);
      press(m, 'a', { yaw: EAST, pitch: -0.2, primary: true, secondary: false });
      tick(m);
      const t0 = m.time;
      stepUntil(m, () => m.log.events.some((e) => e.kind === 'knock-specs'), 1);
      const knock = m.log.events.find((e) => e.kind === 'knock-specs');
      if (!knock) continue;
      knocked++;
      expect(knock).toMatchObject({ by: 'a', seen: false });
      tick(m, 4 * 30);
      expect(tutsOn(m, 'a', t0)).toBe(0);
    }
    expect(knocked).toBeGreaterThanOrEqual(SEEDS.length / 2);
  }, 30_000);

  it('the secret log means nothing to her: feeding her log entries directly changes nothing', () => {
    const { m, box } = nanaMatch(3);
    place(m, 'd', -4, 1.6, 0); // within earshot of anything she might say
    const bot = m.bots.get('nana')!;
    const t0 = m.time;
    const at = { x: -3, y: 0, z: 1.6 };
    bot.onLog({ t: m.time, kind: 'shove', by: 'a', victim: 'b', pos: at, seen: true, sharp: true }, 0);
    bot.onLog({ t: m.time, kind: 'knock-specs', by: 'a', seen: true, sharp: true }, 1);
    bot.onLog({ t: m.time, kind: 'break', by: 'a', heirloom: 'heirloom-vase', favourite: true, pos: at, seen: true, sharp: true }, 2);
    bot.onLog({ t: m.time, kind: 'steal', by: 'a', item: 'item-phone', owner: 'b', pos: at, seen: true, sharp: true }, 3);
    tick(m, 4 * 30);
    expect(tutsOn(m, 'a', t0)).toBe(0);
    expect(box.events('d', 'bubble').filter((e) => 'from' in e && e.from === 'nana' && 'text' in e && e.text === I_SAW_THAT)).toEqual([]);
  }, 30_000);

  it('a shove right in front of her: "I saw that!", and a Tut for the shover', () => {
    let tutted = 0;
    for (const seed of SEEDS) {
      const { m, box } = nanaMatch(seed);
      place(m, 'nana', -5, 1.6, EAST);
      place(m, 'c', -3.4, 1.6, WEST);
      place(m, 'd', -4.0, 1.6, 0);
      press(m, 'c', { yaw: WEST, shove: true });
      tick(m);
      expect(m.log.events.find((e) => e.kind === 'shove' && e.by === 'c')).toMatchObject({ seen: true });
      const t0 = m.time - 1;
      place(m, 'c', -2.4, 1.6, WEST); // out of cane reach
      tick(m, 3 * 30);
      expect(box.events('d', 'bubble').some((e) => 'from' in e && e.from === 'nana' && 'text' in e && e.text === I_SAW_THAT)).toBe(true);
      if (tutsOn(m, 'c', t0) > 0) tutted++;
    }
    expect(tutted).toBeGreaterThanOrEqual(SEEDS.length - 2);
  }, 30_000);

  /**
   * a steals b's item in the kitchen and plants it behind Nana's back; she turns
   * round. With `flaunt`, a first strolls past right under her nose with it, twice.
   */
  function frameUp(seed: number, flaunt: boolean) {
    const { m } = nanaMatch(seed);
    place(m, 'b', 12, 2.2, 0);
    place(m, 'a', 12, 3, 0);
    press(m, 'a', { interact: true });
    tick(m);
    const item = m.chars.get('b')!.itemId!;
    expect(m.chars.get('a')!.holding).toBe(item);
    place(m, 'b', 14, 4.5, 0);
    for (let pass = 0; flaunt && pass < 2; pass++) {
      place(m, 'nana', -5, 1.6, EAST);
      place(m, 'a', -3.6, 1.6, WEST); // 1.4 m in front of her, item in hand
      tick(m, 6);
      place(m, 'a', 12, 3, 0); // back to the kitchen for a while (a separate glance next time)
      tick(m, 6 * 30);
    }
    place(m, 'a', -7.3, 1.6, EAST);
    for (let i = 0; i < Math.ceil(COUSIN.plantHold * 30) + 2; i++) {
      place(m, 'nana', -5, 1.6, EAST); // she keeps looking the other way
      press(m, 'a', { yaw: EAST, plant: true });
      tick(m);
    }
    expect(m.props.get(item)!.planted).toBe(true);
    place(m, 'a', 14, -3, 0);
    const t0 = m.time;
    place(m, 'nana', -5, 1.6, WEST); // and turns round
    tick(m, 3 * 30);
    return { m, item, t0 };
  }

  it('evidence planted behind her back: she finds it and, more often than not, accuses its owner', () => {
    let framed = 0;
    for (const seed of SEEDS) {
      const { m, item, t0 } = frameUp(seed, false);
      expect(m.props.get(item)!.found).toBe(true);
      expect(tutsOn(m, 'a', t0)).toBe(0);
      if (m.log.framedPlants().size > 0) {
        framed++;
        expect(m.log.events.some((e) => e.kind === 'accuse' && e.target === 'b')).toBe(true);
      }
    }
    expect(framed).toBeGreaterThanOrEqual(SEEDS.length / 2);
  }, 30_000);

  it('...but when she has seen the thief carrying it, she blames the thief instead', () => {
    // Up close she notices whose item it is most of the time (BOTS.grandma.noticeItemSharp a glance).
    let thief = 0, owner = 0;
    for (const seed of SEEDS) {
      const { m, t0 } = frameUp(seed, true);
      if (tutsOn(m, 'a', t0 - 15) > 0) thief++;
      if (tutsOn(m, 'b', t0) > 0) owner++;
    }
    expect(thief).toBeGreaterThanOrEqual(SEEDS.length / 2);
    expect(owner).toBeLessThanOrEqual(SEEDS.length / 4);
  }, 30_000);
});

describe('framing reads, and she rewards what she witnesses (GDD Gate 1)', () => {
  // 50 seeded fast matches, each an Afternoon Tea at its real length (180 s): a
  // 40 s test visit ends before most frame-ups (steal, wait, plant, be found)
  // can play out. A bot Grandma and four bot cousins.
  const SEEDS_50 = Array.from({ length: 50 }, (_, i) => i + 1);
  let plants = 0, found = 0, framed = 0;
  let wishes = 0, wishBlessed = 0, blesses = 0, earned = 0, roomy = 0, roomyBlessed = 0;
  const perMatch: string[] = [];
  beforeAll(() => {
    for (const seed of SEEDS_50) {
      const m = new Match({
        players: [{ id: 'nana', name: 'Nana', isBot: true }, ...['c0', 'c1', 'c2', 'c3'].map((id) => ({ id, name: id, isBot: true }))],
        grandmaId: 'nana', options: { fullMatch: false, fillBots: true, pushGrandma: false },
        fast: true, visitSeconds: 180, seed, send: () => {},
      });
      // For each compliment: could she see who paid it, and did she have room to spare in her will budget?
      const witnessed = new Map<number, boolean>();
      const spare = new Map<number, boolean>();
      m.log.onLog((ev, i) => {
        if (ev.kind !== 'compliment') return;
        const c = m.chars.get(ev.by);
        witnessed.set(i, !!c && m.canSeeNow(c.body.pos));
        const av = available(m.will, m.time);
        spare.set(i, av.budget - WILL.quickStep >= BOTS.grandma.budgetReserve.weak && av.now >= WILL.quickStep * (1 + BOTS.grandma.keepInHand.weak));
      });
      m.start();
      while (m.phase !== 'reading' && m.time < 1000) m.step(1 / 30);
      const evs = m.log.events;
      // Framing straight from the log: a plant counts when its owner is later accused, the
      // accusation linked to that plant (it is the accusation's crime, or Nana found that
      // very plant before the Tut). One visit per match, so it is always the same visit.
      let mp = 0, mf = 0;
      evs.forEach((p, i) => {
        if (p.kind !== 'plant') return;
        plants++; mp++;
        const find = evs.findIndex((e, j) => j > i && e.kind === 'found' && e.plant === i);
        if (find >= 0) found++;
        const accused = evs.some((a, ai) => a.kind === 'accuse' && ai > i && a.target === p.owner && p.by !== p.owner && (a.crime === i || (find >= 0 && find < ai)));
        if (accused) { framed++; mf++; }
      });
      perMatch.push(`${mf}/${mp}`);
      const blessedSoon = (id: string, t: number): boolean => evs.some((w) => w.kind === 'will' && w.via === 'bless' && w.target === id && w.t >= t && w.t - t <= 3);
      evs.forEach((e, i) => {
        if (e.kind === 'wish') { wishes++; if (blessedSoon(e.by, e.t)) wishBlessed++; }
        if (e.kind === 'compliment' && witnessed.get(i) && spare.get(i)) {
          const thankedLately = evs.some((w) => w.kind === 'will' && w.via === 'bless' && w.target === e.by && w.t < e.t && e.t - w.t < BOTS.grandma.complimentMemory);
          if (!thankedLately) { roomy++; if (blessedSoon(e.by, e.t)) roomyBlessed++; }
        }
        if (e.kind === 'will' && e.via === 'bless') {
          blesses++;
          if (evs.some((x) => (x.kind === 'wish' || x.kind === 'compliment') && x.by === e.target && x.t <= e.t && e.t - x.t <= 3)) earned++;
        }
      });
    }
  }, 180_000);

  it('she accuses the owner of planted evidence in 30-50% of plants across 50 seeded matches', () => {
    expect(plants).toBeGreaterThan(60);
    // She comes across most of it...
    expect(found / plants).toBeGreaterThan(0.5);
    // ...and falls for it often enough to make framing worth it, not so often that it always works.
    const rate = framed / plants;
    expect(rate, `framed ${framed}/${plants} plants; per match ${perMatch.join(' ')}`).toBeGreaterThanOrEqual(0.3);
    expect(rate, `framed ${framed}/${plants} plants; per match ${perMatch.join(' ')}`).toBeLessThanOrEqual(0.5);
  });

  it('she Blesses only what she witnessed: errands brought to her and compliments she heard', () => {
    expect(blesses).toBeGreaterThan(100);
    // Every quick Bless follows an errand or a compliment from that cousin.
    expect(earned / blesses).toBeGreaterThan(0.95);
    // Most errands are thanked (she keeps some of her budget back for culprits)...
    expect(wishes).toBeGreaterThan(100);
    expect(wishBlessed / wishes).toBeGreaterThan(0.45);
    // ...and so are most compliments she saw paid, while she has budget to spare and has not just thanked them.
    expect(roomy).toBeGreaterThan(50);
    expect(roomyBlessed / roomy).toBeGreaterThan(0.5);
  });
});
