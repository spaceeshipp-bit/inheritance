import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COUSIN, DISCONNECT, HEIRLOOM, QUICKCHAT, WILL } from '../../shared/constants.js';
import { groundHeight } from '../../shared/map.js';
import type { InputMsg, ServerMsg } from '../../shared/protocol.js';
import type { Phase } from '../../shared/types.js';
import type { Char, Match } from '../../server/match.js';
import { makeMatch, stepUntil, toVisit } from './helpers.js';

const sum = (s: Record<string, number>): number => Object.values(s).reduce((a, b) => a + b, 0);

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { errorSpy = vi.spyOn(console, 'error'); });
afterEach(() => { errorSpy.mockRestore(); });

/** Runs a whole bot-only match, checking invariants every tick. */
function runBotMatch(opts: { cousins: number; fullMatch: boolean; fast: boolean; seed: number }) {
  let ended = false;
  const bots = ['nana', ...Array.from({ length: opts.cousins }, (_, i) => `c${i}`)];
  const { m } = makeMatch({ bots, grandmaId: 'nana', options: { fullMatch: opts.fullMatch }, fast: opts.fast, seed: opts.seed, onEnd: () => { ended = true; } });
  const phases: Phase[] = [];
  const kinds: Record<string, number> = {};
  m.log.onLog((ev) => { kinds[ev.kind] = (kinds[ev.kind] ?? 0) + 1; });
  let violations = 0;
  let sawDark = false, sawFlash = false, darkOutsideStorm = false;
  m.start();
  while (!ended && m.time < 2000) {
    m.step(1 / 30);
    const storm = m.phase === 'visit' && m.visits[m.visitIndex] === 'storm';
    if (storm && m.dark) sawDark = true;
    if (storm && m.flash) sawFlash = true;
    if (!storm && (m.dark || m.flash)) darkOutsideStorm = true;
    if (phases[phases.length - 1] !== m.phase) phases.push(m.phase);
    if (sum(m.will.shares) !== 100) violations++;
    if (m.will.usedThisVisit > WILL.budgetPerVisit) violations++;
    for (const used of m.visitUsed) if (used > WILL.budgetPerVisit) violations++;
    for (const c of m.chars.values()) if (!Number.isFinite(c.body.pos.x + c.body.pos.y + c.body.pos.z)) violations++;
  }
  return { m, ended, phases, kinds, violations, sawDark, sawFlash, darkOutsideStorm };
}

describe('a whole bot-only match', () => {
  it('runs Tea, Dinner and the Storm through every phase with the rules intact', () => {
    const { m, ended, phases, kinds, violations, sawDark, sawFlash, darkOutsideStorm } = runBotMatch({ cousins: 6, fullMatch: true, fast: true, seed: 7 });
    expect(errorSpy).not.toHaveBeenCalled();
    // The Storm: dark, with lightning flashes, and only in the Storm.
    expect(sawDark).toBe(true);
    expect(sawFlash).toBe(true);
    expect(darkOutsideStorm).toBe(false);
    expect(ended).toBe(true);
    expect(violations).toBe(0);
    expect(phases).toEqual(['roles', 'visit', 'intermission', 'visit', 'intermission', 'visit', 'reading', 'vote', 'results']);
    // Points moved per visit never exceed the budget, and Grandma used some of it.
    expect(m.visitUsed.length).toBe(3);
    for (const used of m.visitUsed) expect(used).toBeLessThanOrEqual(WILL.budgetPerVisit);
    expect(m.visitUsed.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    // Results with a numeric score.
    const r = m.results!;
    expect(r).not.toBeNull();
    expect(typeof r.grandmaScore).toBe('number');
    expect(Number.isFinite(r.grandmaScore)).toBe(true);
    expect(r.grandmaScore).toBeGreaterThanOrEqual(0);
    expect(r.grandmaScore).toBeLessThanOrEqual(100);
    expect(sum(r.shares)).toBe(100);
    expect(Object.keys(r.sabotage).sort()).toEqual([...m.cousinIds].sort());
    expect(r.order.length).toBe(6);
    expect(sum(r.votes)).toBeGreaterThan(0);
    // The bots actually played.
    expect(kinds.shove ?? 0).toBeGreaterThan(0);
    expect(kinds.break ?? 0).toBeGreaterThan(0);
    expect(kinds.wish ?? 0).toBeGreaterThan(0);
    expect(kinds.steal ?? 0).toBeGreaterThan(0);
    expect(kinds.compliment ?? 0).toBeGreaterThan(0);
    expect(kinds.will ?? 0).toBeGreaterThan(0);
    expect(r.metrics.shoves).toBe(kinds.shove);
    expect(r.metrics.breaks).toBe(kinds.break);
    expect(m.log.moments.length).toBeGreaterThan(0);
  });

  it('is lively with the minimum 5 players at normal speed (Afternoon Tea only)', () => {
    const { m, ended, phases, kinds, violations } = runBotMatch({ cousins: 4, fullMatch: false, fast: false, seed: 3 });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(ended).toBe(true);
    expect(violations).toBe(0);
    expect(phases).toEqual(['roles', 'visit', 'reading', 'vote', 'results']);
    expect(m.visitUsed[0]).toBeLessThanOrEqual(WILL.budgetPerVisit);
    expect(kinds.shove ?? 0).toBeGreaterThan(3);
    expect(kinds.break ?? 0).toBeGreaterThan(0);
    expect(kinds.wish ?? 0).toBeGreaterThan(1);
    expect(typeof m.results!.grandmaScore).toBe('number');
  });

  it('holds its invariants across several seeds', () => {
    for (const seed of [11, 12, 13]) {
      const { ended, violations, m } = runBotMatch({ cousins: 4 + (seed % 3), fullMatch: seed % 2 === 0, fast: true, seed });
      expect(ended).toBe(true);
      expect(violations).toBe(0);
      expect(m.results).not.toBeNull();
    }
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

// ───────────────────────── Scenarios with human players ─────────────────────────

const HUMANS = ['g', 'a', 'b', 'c', 'd'];
const seqs = new Map<string, number>();

function press(m: Match, id: string, over: Partial<InputMsg> = {}): void {
  const c = m.chars.get(id)!;
  const seq = (seqs.get(id) ?? 0) + 1;
  seqs.set(id, seq);
  m.handleInput(id, { ...m.blankInput(seq, c.yaw), pitch: 0, ...over });
}

function place(m: Match, id: string, x: number, z: number, yaw: number, atY?: number): Char {
  const c = m.chars.get(id)!;
  const y = atY ?? groundHeight(x, z, 0.5);
  c.body.pos = { x, y, z };
  c.body.vel = { x: 0, y: 0, z: 0 };
  c.body.onGround = true;
  c.body.peakY = y;
  c.yaw = yaw;
  // Face that way now (not through the input queue, which applies one input a tick),
  // and forget any guessed ticks (a replay would put the character back).
  c.inputQueue = [];
  c.guess = null;
  c.input = { ...c.input, yaw, move: { x: 0, z: 0 } };
  return c;
}

function humanMatch(seed = 5, options = {}) {
  seqs.clear();
  const r = makeMatch({ humans: HUMANS, grandmaId: 'g', seed, options });
  toVisit(r.m);
  // Park everyone, facing north, out of each other's way.
  place(r.m, 'a', -1, 4.5, 0);
  place(r.m, 'b', 1, 4.5, 0);
  place(r.m, 'c', 3, 4.5, 0);
  place(r.m, 'd', 5, 4.5, 0);
  r.m.step(1 / 30);
  return r;
}

const tick = (m: Match, n = 1): void => { for (let i = 0; i < n; i++) m.step(1 / 30); };

describe('match rules', () => {
  it('only Grandma gets her preference cards; cousins never see the favourite', () => {
    const { m, box } = humanMatch();
    const gMatch = box.of('g').find((x) => x.t === 'match') as Extract<ServerMsg, { t: 'match' }>;
    const aMatch = box.of('a').find((x) => x.t === 'match') as Extract<ServerMsg, { t: 'match' }>;
    expect(gMatch.role).toBe('grandma');
    expect(gMatch.prefCards?.length).toBe(2);
    expect(aMatch.role).toBe('cousin');
    expect(aMatch.prefCards).toBeUndefined();
    expect(aMatch.cousins.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
    // Grandma looks straight at her Favourite: only she is told which one it is.
    const fav = [...m.props.values()].find((p) => p.favourite)!;
    const gx = fav.pos.x + (fav.pos.x > 0 ? -1.6 : 1.6);
    place(m, 'g', gx, fav.pos.z, Math.atan2(-(fav.pos.x - gx), 0), fav.pos.y > 2 ? fav.pos.y - 1 : undefined);
    tick(m, 10);
    const gSnap = box.of('g').filter((x) => x.t === 'snap').pop() as Extract<ServerMsg, { t: 'snap' }>;
    const aSnap = box.of('a').filter((x) => x.t === 'snap').pop() as Extract<ServerMsg, { t: 'snap' }>;
    expect(gSnap.props.filter((p) => p.favourite).length).toBe(1);
    expect(aSnap.props.some((p) => 'favourite' in p)).toBe(false);
    expect(aSnap.props.filter((p) => p.kind === 'heirloom').length).toBe(HEIRLOOM.perMatch);
    // Signature items are carried on their owners.
    for (const id of ['a', 'b', 'c', 'd']) expect(aSnap.props.some((p) => p.kind === 'item' && p.owner === id && p.heldBy === id)).toBe(true);
    // No sabotage tally anywhere before the results.
    expect(box.all.some((x) => JSON.stringify(x.msg).includes('sabotage'))).toBe(false);
  });

  it('sends snapshots at about SNAPSHOT_HZ with acks', () => {
    const { m, box } = humanMatch();
    box.clear();
    press(m, 'a', { move: { x: 0, z: 1 } });
    tick(m, 30);
    const snaps = box.of('a').filter((x) => x.t === 'snap') as Extract<ServerMsg, { t: 'snap' }>[];
    expect(snaps.length).toBeGreaterThanOrEqual(19);
    expect(snaps.length).toBeLessThanOrEqual(21);
    const me = snaps[snaps.length - 1].chars.find((c) => c.id === 'a')!;
    // One input arrived; the server guessed the ticks after it (no more came),
    // but a player's own snapshots only ever count real inputs.
    expect(me.ack).toBe(seqs.get('a'));
    expect(me.pos.z).toBeLessThan(4.5);
  });

  it('a shove knocks the victim over and is logged', () => {
    const { m, box } = humanMatch();
    place(m, 'a', 2, 3, 0);
    place(m, 'b', 2, 2.1, 0);
    press(m, 'a', { shove: true });
    tick(m);
    const b = m.chars.get('b')!;
    expect(b.state).toBe('ragdoll');
    expect(Math.hypot(b.body.vel.x, b.body.vel.z)).toBeGreaterThan(5);
    expect(m.log.events.some((e) => e.kind === 'shove' && e.by === 'a' && e.victim === 'b')).toBe(true);
    expect(box.events('d', 'shove').length).toBe(1);
    // Cooldown: a second shove right away does nothing.
    press(m, 'a', { shove: false });
    tick(m);
    place(m, 'c', 2, 2.1, 0);
    press(m, 'a', { shove: true });
    tick(m);
    expect(m.chars.get('c')!.state).toBe('normal');
    tick(m, Math.ceil(COUSIN.shoveCooldown * 30) + 2);
    press(m, 'a', { shove: false });
    tick(m);
    press(m, 'a', { shove: true });
    tick(m);
    expect(m.chars.get('c')!.state).toBe('ragdoll');
  });

  it('Grandma cannot be shoved unless pushGrandma is on, and then the will freezes', () => {
    const off = humanMatch();
    place(off.m, 'a', -4, 1.6, Math.PI / 2); // facing west, at Grandma
    press(off.m, 'a', { yaw: Math.PI / 2, shove: true });
    tick(off.m);
    expect(off.m.chars.get('g')!.state).toBe('normal');

    const on = humanMatch(5, { pushGrandma: true });
    place(on.m, 'a', -4, 1.6, Math.PI / 2);
    press(on.m, 'a', { yaw: Math.PI / 2, shove: true });
    tick(on.m);
    expect(on.m.chars.get('g')!.state).toBe('ragdoll');
    expect(on.m.willFrozen).toBe(true);
    on.m.handleGrandma('g', { a: 'bless', target: 'a' });
    expect(on.box.events('g', 'will-rejected').pop()).toMatchObject({ reason: 'frozen' });
  });

  it('a shove behind Grandma: her client is not told who did it; a shove in front of her is', () => {
    const { m, box } = humanMatch();
    place(m, 'a', -7.5, 3, 0); // behind her (she faces east from (-5, 1.6))
    place(m, 'b', -7.5, 2.2, 0);
    press(m, 'a', { shove: true });
    tick(m);
    const unseen = box.events('g', 'shove').pop() as { by: string; victim: string; pos: { x: number; z: number } };
    // She hears it behind her but sees neither of them: no names, and only a rough position.
    expect(unseen).toMatchObject({ by: '', victim: '' });
    expect(Number.isInteger(unseen.pos.x) && Number.isInteger(unseen.pos.z)).toBe(true);
    expect(box.events('b', 'shove').pop()).toMatchObject({ by: 'a', victim: 'b' });
    box.clear();
    tick(m, 60);
    place(m, 'c', -3.4, 1.6, Math.PI / 2); // right in front of her, facing west
    place(m, 'd', -4.0, 1.6, 0);
    press(m, 'c', { yaw: Math.PI / 2, shove: true });
    tick(m);
    expect(box.events('g', 'shove').pop()).toMatchObject({ by: 'c', victim: 'd' });
  });

  it('steal, plant, Grandma finds it, Tuts the owner: an accusation and a Framed moment', () => {
    const { m, box } = humanMatch();
    // a steals b's item.
    place(m, 'a', 2, 3, 0);
    place(m, 'b', 2, 2.2, 0);
    press(m, 'a', { interact: true });
    tick(m);
    const a = m.chars.get('a')!;
    const bItem = m.chars.get('b')!.itemId!;
    expect(a.holding).toBe(bItem);
    expect(m.log.events.some((e) => e.kind === 'steal' && e.by === 'a' && e.owner === 'b')).toBe(true);
    // a walks over in front of Grandma (she faces east from (-5, 1.6)) and plants it.
    place(m, 'a', -3, 1.0, Math.PI / 2);
    for (let i = 0; i < Math.ceil(COUSIN.plantHold * 30) + 2; i++) { press(m, 'a', { yaw: Math.PI / 2, plant: true }); tick(m); }
    const item = m.props.get(bItem)!;
    expect(item.planted).toBe(true);
    expect(a.holding).toBeNull();
    expect(m.log.events.some((e) => e.kind === 'plant' && e.by === 'a' && e.owner === 'b')).toBe(true);
    tick(m, 2);
    expect(item.found).toBe(true);
    const found = box.events('g', 'found');
    expect(found.length).toBe(1);
    expect(found[0]).toMatchObject({ item: bItem, owner: 'b' });
    expect(box.events('a', 'found').length).toBe(0);
    // Grandma blames the owner.
    m.handleGrandma('g', { a: 'tut', target: 'b' });
    expect(m.log.events.some((e) => e.kind === 'accuse' && e.target === 'b')).toBe(true);
    expect(m.log.moments.some((x) => x.kind === 'framed' && x.actor === 'a' && x.victim === 'b')).toBe(true);
    expect(m.log.metrics()).toMatchObject({ plants: 1, plantsAccusedOwner: 1, framingAccuracy: 1 });
    // Secret until the reading: nobody is told mid-match (not even the framer: it
    // would tell them Nana fell for it); the reading reveals it to everyone.
    for (const id of ['g', 'a', 'b']) expect(box.events(id, 'moment').some((e) => (e as { moment: { kind: string } }).moment.kind === 'framed')).toBe(false);
    // The owner takes it back.
    place(m, 'b', -3.2, 2.0, 0);
    press(m, 'b', { interact: true });
    tick(m);
    expect(item.heldBy).toBe('b');
    expect(item.onBody).toBe(true);
    expect(item.planted).toBe(false);
  });

  it('grab and throw an heirloom: it breaks and the thrower is blamed', () => {
    const { m, box } = humanMatch();
    const h = [...m.props.values()].find((p) => p.kind === 'heirloom' && p.spot && p.spot.y < 2)!;
    expect(h).toBeDefined();
    const side = h.spot!.x < 0 ? 1 : -1;
    const yaw = side > 0 ? Math.PI / 2 : -Math.PI / 2; // face the pedestal
    place(m, 'a', h.spot!.x + side * 0.85, h.spot!.z, yaw);
    press(m, 'a', { yaw, primary: true });
    tick(m);
    expect(m.chars.get('a')!.holding).toBe(h.id);
    // Turn round and throw it hard at the floor.
    for (let i = 0; i < 32; i++) { press(m, 'a', { yaw: yaw + Math.PI, pitch: -0.5, primary: true, secondary: true }); tick(m); }
    expect(m.chars.get('a')!.charge).toBeCloseTo(1, 1);
    press(m, 'a', { yaw: yaw + Math.PI, pitch: -0.5, primary: true, secondary: false });
    tick(m);
    expect(m.chars.get('a')!.holding).toBeNull();
    stepUntil(m, () => h.broken, 3);
    expect(h.broken).toBe(true);
    const ev = m.log.events.find((e) => e.kind === 'break');
    expect(ev).toMatchObject({ by: 'a', heirloom: h.id });
    expect(box.events('c', 'crash').length).toBe(1);
  });

  it('shoving someone into a pedestal topples its heirloom; the shover is blamed', () => {
    const { m } = humanMatch();
    const h = [...m.props.values()].find((p) => p.kind === 'heirloom' && p.spot && p.spot.y < 2)!;
    const side = h.spot!.x < 0 ? 1 : -1;
    const yaw = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    place(m, 'b', h.spot!.x + side * 1.0, h.spot!.z, yaw);
    place(m, 'a', h.spot!.x + side * 2.0, h.spot!.z, yaw);
    press(m, 'a', { yaw, shove: true });
    tick(m);
    expect(m.chars.get('b')!.state).toBe('ragdoll');
    stepUntil(m, () => h.broken, 3);
    expect(h.broken).toBe(true);
    expect(m.log.events.find((e) => e.kind === 'break')).toMatchObject({ by: 'a' });
  });

  it('breaking the favourite gives Grandma a free Tut outside the budget', () => {
    const { m, box } = humanMatch();
    const fav = [...m.props.values()].find((p) => p.favourite)!;
    fav.resting = false;
    fav.spot = null;
    fav.lastBy = 'c';
    fav.vel = { x: 0, y: -8, z: 0 };
    tick(m, 3);
    expect(fav.broken).toBe(true);
    expect(box.events('g', 'crash')[0]).toMatchObject({ favourite: true });
    expect('favourite' in box.events('a', 'crash')[0]).toBe(false);
    expect(m.freeTuts).toBe(1);
    expect(m.log.moments.some((x) => x.kind === 'favourite-broken' && x.actor === 'c')).toBe(true);
    const before = m.will.usedThisVisit;
    m.handleGrandma('g', { a: 'tut', target: 'c' });
    expect(m.will.shares.c).toBe(20);
    expect(m.will.usedThisVisit).toBe(before);
    expect(m.freeTuts).toBe(0);
    // Only Grandma is told it was her free (Favourite) Tut; cousins just see a Tut.
    expect(box.events('g', 'will').pop()).toMatchObject({ target: 'c', moved: -5, via: 'tut', reason: 'favourite' });
    const forCousin = box.events('d', 'will').pop() as Record<string, unknown>;
    expect(forCousin).toMatchObject({ target: 'c', moved: -5, via: 'tut' });
    expect('reason' in forCousin).toBe(false);
    expect(box.all.some((x) => x.msg.t === 'ev' && x.msg.e === 'moment' && x.msg.moment.kind === 'favourite-broken')).toBe(false);
    // The next Tut is a normal one.
    m.handleGrandma('g', { a: 'tut', target: 'c' });
    expect(m.will.usedThisVisit).toBe(before + WILL.quickStep);
  });

  it('Bless/Tut respect the rolling cap; the parchment is needed for set and for 0%', () => {
    const { m, box } = humanMatch();
    for (let i = 0; i < 4; i++) m.handleGrandma('g', { a: 'bless', target: 'a' });
    expect(m.will.shares.a).toBe(45);
    m.handleGrandma('g', { a: 'bless', target: 'a' });
    expect(box.events('g', 'will-rejected').pop()).toMatchObject({ target: 'a', reason: 'rolling' });
    m.handleGrandma('g', { a: 'set', target: 'b', value: 0 });
    expect(box.events('g', 'will-rejected').pop()).toMatchObject({ reason: 'needs-parchment' });
    tick(m, 31 * 30);
    m.handleGrandma('g', { a: 'parchment', open: true });
    box.clear();
    m.handleGrandma('g', { a: 'set', target: 'b', value: m.will.shares.b - 3 });
    expect(m.will.shares.b).toBeLessThan(25);
    expect(sum(m.will.shares)).toBe(100);
    // Quill heard by cousins nearby.
    expect(box.all.some((x) => x.msg.t === 'ev' && (x.msg as { e: string }).e === 'quill')).toBe(true);
    tick(m, 15);
    const g = m.chars.get('g')!;
    expect(g.parchmentOpen).toBe(true);
    m.handleGrandma('g', { a: 'parchment', open: false });
    expect(g.parchmentOpen).toBe(false);
  });

  it('wishes: deliver the item to Grandma; the will does not change on its own', () => {
    const { m, box } = humanMatch();
    stepUntil(m, () => m.wish !== null, 20);
    expect(m.wish).not.toBeNull();
    const p = m.props.get(m.wish!.propId)!;
    const shares = { ...m.will.shares };
    const a = m.chars.get('a')!;
    // Put a right next to the item and grab (or pick up) it.
    a.body.pos = { x: p.pos.x, y: Math.max(0, p.pos.y - 0.9), z: p.pos.z + 0.5 };
    a.body.onGround = true;
    a.yaw = 0;
    press(m, 'a', { primary: true, yaw: 0 });
    tick(m);
    expect(a.holding).toBe(p.id);
    place(m, 'a', -4, 1.6, Math.PI / 2);
    press(m, 'a', { primary: true, yaw: Math.PI / 2 });
    tick(m);
    press(m, 'a', { primary: true, interact: true, yaw: Math.PI / 2 });
    tick(m);
    expect(box.events('b', 'wish-done').length).toBe(1);
    expect(box.events('b', 'wish-done')[0]).toMatchObject({ by: 'a' });
    expect(m.wish).toBeNull();
    expect(a.holding).toBeNull();
    expect(m.log.events.some((e) => e.kind === 'wish' && e.by === 'a')).toBe(true);
    expect(m.will.shares).toEqual(shares);
  });

  it("bubbles reach Grandma scrambled by distance; compliments count only up close", () => {
    const { m, box } = humanMatch();
    place(m, 'a', 3, 1.6, 0); // 8 m in front of Grandma: a mumble from a blur she cannot identify
    m.handleQuick('a', 0);
    expect(box.events('g', 'bubble').pop()).toMatchObject({ from: '', text: '…' });
    expect(box.events('b', 'bubble').pop()).toMatchObject({ from: 'a', text: QUICKCHAT.cousin[0] });
    expect(m.log.events.some((e) => e.kind === 'compliment')).toBe(false);
    place(m, 'a', -3.6, 1.6, Math.PI / 2); // 1.4 m: clear
    m.handleQuick('a', 4);
    expect(box.events('g', 'bubble').pop()).toMatchObject({ text: QUICKCHAT.cousin[4] });
    expect(m.log.events.some((e) => e.kind === 'compliment' && e.by === 'a')).toBe(true);
    m.handleChat('a', 'nana you are LOVELY');
    expect(m.log.events.filter((e) => e.kind === 'compliment').length).toBe(2);
  });

  it('tattling needs to be near Grandma', () => {
    const { m, box } = humanMatch();
    m.handleTattle('a', 'b');
    expect(box.events('a', 'toast').length).toBeGreaterThan(0);
    place(m, 'a', -3.5, 1.6, Math.PI / 2);
    m.handleTattle('a', 'b');
    expect(box.events('g', 'tattle').pop()).toMatchObject({ from: 'a', accused: 'b' });
    m.handleTattle('a', 'a');
    m.handleTattle('a', 'g');
    expect(box.events('g', 'tattle').length).toBe(1);
  });

  it('summon: tells Grandma who ignored her', () => {
    const { m, box } = humanMatch();
    place(m, 'a', -3.5, 1.6, 0);
    m.handleGrandma('g', { a: 'summon' });
    expect(box.events('b', 'summon').length).toBe(1);
    tick(m, 9 * 30);
    const ignored = box.events('g', 'summon-ignored').pop() as unknown as { ids: string[] };
    expect(ignored.ids.sort()).toEqual(['b', 'c', 'd']);
    m.handleGrandma('g', { a: 'summon' });
    expect(box.events('g', 'toast').pop()).toBeDefined();
  });

  it('cane, hearing aid (whistle) and spectacles', () => {
    const { m, box } = humanMatch();
    place(m, 'a', -3.8, 1.6, 0);
    press(m, 'g', { yaw: -Math.PI / 2, primary: true });
    tick(m);
    expect(m.chars.get('a')!.state).toBe('ragdoll');
    expect(box.events('c', 'cane').length).toBe(1);
    press(m, 'g', { yaw: -Math.PI / 2, secondary: true });
    tick(m);
    const g = m.chars.get('g')!;
    expect(g.aidT).toBeGreaterThan(0);
    expect(box.events('a', 'whistle').length).toBe(1);
    press(m, 'g', { yaw: -Math.PI / 2, shove: true });
    tick(m);
    expect(g.specsT).toBeGreaterThan(0);
    const snap = box.of('a').filter((x) => x.t === 'snap').pop() as Extract<ServerMsg, { t: 'snap' }>;
    tick(m, 2);
    const gs = (box.of('a').filter((x) => x.t === 'snap').pop() as Extract<ServerMsg, { t: 'snap' }>).chars.find((c) => c.id === 'g')!;
    expect(snap).toBeDefined();
    expect(gs.aidActive).toBe(true);
    expect(gs.specsActive).toBe(true);
  });

  it('a cousin who drops sleeps with a frozen share; too few cousins reads the will', () => {
    const { m } = humanMatch();
    m.setConnected('b', false);
    expect(m.chars.get('b')!.state).toBe('sleeping');
    const bShare = m.will.shares.b;
    m.handleGrandma('g', { a: 'bless', target: 'a' });
    expect(m.will.shares.a).toBe(30);
    expect(m.will.shares.b).toBe(bShare);
    expect(sum(m.will.shares)).toBe(100);
    // Grandma may still edit a sleeper directly.
    m.handleGrandma('g', { a: 'tut', target: 'b' });
    expect(m.will.shares.b).toBe(bShare - 5);
    m.setConnected('b', true);
    expect(m.chars.get('b')!.state).toBe('normal');
    m.setConnected('c', false);
    expect(m.phase).toBe('visit');
    m.setConnected('d', false);
    expect(m.phase).toBe('reading');
  });

  it('Grandma drops: a lie-down pause, then the will is read as it stands', () => {
    const { m, box } = humanMatch();
    const ends = m.phaseEndsAt;
    m.setConnected('g', false);
    expect(m.pause).not.toBeNull();
    tick(m, 5 * 30);
    expect(m.phaseEndsAt).toBeGreaterThan(ends + 4);
    tick(m, (DISCONNECT.grandmaLieDown - 4) * 30);
    expect(m.phase).toBe('reading');
    expect(box.of('a').some((x) => x.t === 'reading')).toBe(true);
  });

  it('Grandma drops: a willing cousin takes over', () => {
    const { m, box } = humanMatch();
    m.setConnected('g', false);
    tick(m, 2 * 30 + 3); // past the grace that lets the real Grandma reconnect
    box.clear();
    expect(m.takeOverGrandma('a')).toBe(true);
    expect(m.grandmaId).toBe('a');
    expect(m.cousinIds).toEqual(['b', 'c', 'd']);
    expect(Object.keys(m.will.shares).sort()).toEqual(['b', 'c', 'd']);
    expect(sum(m.will.shares)).toBe(100);
    expect(m.pause).toBeNull();
    const msg = box.of('a').find((x) => x.t === 'match') as Extract<ServerMsg, { t: 'match' }>;
    expect(msg.role).toBe('grandma');
    expect(msg.prefCards?.length).toBe(2);
    m.handleGrandma('a', { a: 'bless', target: 'b' });
    expect(m.will.shares.b).toBeGreaterThan(33);
  });

  it('votes, reading and results arrive in order with the tally only at the end', () => {
    const { m, box } = humanMatch();
    m.setConnected('c', false);
    m.setConnected('d', false);
    expect(m.phase).toBe('reading');
    const reading = box.of('a').find((x) => x.t === 'reading') as Extract<ServerMsg, { t: 'reading' }>;
    expect(sum(reading.result.shares)).toBe(100);
    expect('sabotage' in reading.result).toBe(false);
    stepUntil(m, () => m.phase === 'vote', 30);
    m.handleVote('a', 'b');
    m.handleVote('b', 'b'); // not yourself
    m.handleVote('g', 'zzz'); // not a cousin
    stepUntil(m, () => m.phase === 'results', 30);
    const res = box.of('a').find((x) => x.t === 'results') as Extract<ServerMsg, { t: 'results' }>;
    expect(res.result.votes.b).toBe(1);
    expect(res.result.votedWorst).toBe('b');
    expect(res.result.sabotage).toBeDefined();
    expect(typeof res.result.grandmaScore).toBe('number');
  });

  it('never crashes on hostile input', () => {
    const { m } = humanMatch();
    const junk: unknown[] = [
      { t: 'grandma', a: 'bless', target: 'nobody' },
      { t: 'grandma', a: 'set', target: 'a', value: 1e9 },
      { t: 'vote', target: '' },
      { t: 'quick', line: 99 },
      { t: 'tattle', accused: 'g' },
    ];
    for (const j of junk) m.handle('a', j as never);
    m.handle('zz', { t: 'input', seq: 1, move: { x: 1, z: 1 }, yaw: 0, pitch: 0, run: true, sneak: false, jump: true, whisper: false, primary: true, secondary: true, shove: true, interact: true, plant: true });
    m.handleGrandma('a', { a: 'bless', target: 'b' }); // not Grandma
    m.handleInput('a', { ...m.blankInput(100000), yaw: 1e6, move: { x: 1, z: 1 }, run: true });
    tick(m, 30);
    const a = m.chars.get('a')!;
    expect(Number.isFinite(a.body.pos.x)).toBe(true);
    expect(sum(m.will.shares)).toBe(100);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
