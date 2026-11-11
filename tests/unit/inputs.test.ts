// How the server applies a player's inputs (Match.handleInput): one per tick,
// in order, so the server moves a character exactly as the client's own
// prediction did, however the network bunches or delays the inputs.
import { describe, expect, it } from 'vitest';
import { INPUT, TICK_HZ } from '../../shared/constants.js';
import { createBody, stepMovement, type MoveBody } from '../../shared/movement.js';
import type { InputMsg } from '../../shared/protocol.js';
import type { Match } from '../../server/match.js';
import type { Inbox } from './helpers.js';
import { humanMatch, place, tick, walkInput, type Snap } from './scenario.js';

const STEP = 1 / TICK_HZ;

const walk = walkInput;

/** Cousin 'a' alone in the open west end of the hall, facing north; everyone else well away. */
function setup(x = -4.2, z = -8): { m: Match; start: MoveBody; box: Inbox } {
  const { m, box } = humanMatch(5);
  place(m, 'b', 5, 3, 0);
  place(m, 'c', 6, 3, 0);
  place(m, 'd', 5.5, 4, 0);
  place(m, 'a', x, z, 0);
  const a = m.chars.get('a')!;
  const start = createBody(a.body.pos);
  start.vel = { ...a.body.vel };
  start.onGround = a.body.onGround;
  return { m, start, box };
}

/** Where `n` inputs of the walk take a character, stepped exactly as the client predicts. */
function reference(start: MoveBody, n: number, of: (i: number) => Omit<InputMsg, 'seq'> = walk): MoveBody {
  const b = createBody(start.pos);
  b.vel = { ...start.vel };
  b.onGround = start.onGround;
  for (let i = 1; i <= n; i++) {
    const inp = of(i);
    stepMovement(b, { move: inp.move, yaw: inp.yaw, run: inp.run, sneak: inp.sneak, jump: inp.jump }, STEP, { role: 'cousin', ragdoll: false, parchmentOpen: false });
  }
  return b;
}

const send = (m: Match, i: number, of: (i: number) => Omit<InputMsg, 'seq'> = walk): void => m.handleInput('a', { ...of(i), seq: i });
const gap = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Tiny deterministic generator for delivery schedules. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe('inputs: one per tick, in order', () => {
  it('every input moves the character exactly once, however the network bunches them', () => {
    const { m, start } = setup();
    const a = m.chars.get('a')!;
    const rnd = lcg(7);
    const n = 240;
    // Input i is simulated at tick i-1. Each arrives up to 3 ticks early, in
    // order as over TCP (so they bunch up), and every fifth only just in time.
    const arrives: number[] = [-Infinity];
    for (let i = 1; i <= n; i++) {
      const early = i % 5 === 0 ? 0 : Math.floor(rnd() * 4);
      arrives[i] = Math.max(arrives[i - 1], i - 1 - early);
    }
    let sent = 0, most = 0;
    for (let t = 0; a.ack < n; t++) {
      while (sent < n && arrives[sent + 1] <= t) send(m, ++sent);
      most = Math.max(most, a.inputQueue.length);
      tick(m);
      expect(a.repeats).toBe(0); // never had to stand in for a missing input
    }
    expect(most).toBeGreaterThanOrEqual(3); // they really did bunch up
    expect(gap(a.body.pos, reference(start, n).pos)).toBeLessThan(1e-9);
    expect(a.inputQueue.length).toBe(0);
  });

  it('a late input is stood in for by repeating the last one: holding a key, nothing to correct', () => {
    const { m, start } = setup();
    const a = m.chars.get('a')!;
    // Hold W and look the same way throughout; inputs 31-35 are held up and arrive with 36.
    const hold = (): Omit<InputMsg, 'seq'> => ({ ...walk(1), move: { x: 0, z: 1 }, yaw: 0.3, run: true, jump: false });
    for (let i = 1; i <= 30; i++) { send(m, i, hold); tick(m); }
    tick(m, 5);
    expect(a.ack).toBe(35); // the five missing ticks were simulated with input 30 repeated
    for (let i = 31; i <= 36; i++) send(m, i, hold);
    expect(a.inputQueue.map((x) => x.seq)).toEqual([36]); // 31-35 were late: their ticks are done
    tick(m);
    expect(a.ack).toBe(36);
    expect(gap(a.body.pos, reference(start, 36, hold).pos)).toBeLessThan(1e-9);
  });

  it('a late input still presses its buttons', () => {
    const { m } = humanMatch();
    const east = -Math.PI / 2;
    place(m, 'g', -5, 1.6, Math.PI / 2); // looking away
    place(m, 'a', 2, 1.6, east);
    place(m, 'b', 2.8, 1.6, 0);
    const a = m.chars.get('a')!;
    const base = { ...walk(1), move: { x: 0, z: 0 }, yaw: east, run: false, sneak: false, jump: false };
    m.handleInput('a', { ...base, seq: 1 });
    tick(m, 4); // inputs 2-4 are late: repeats stood in
    expect(a.ack).toBe(4);
    m.handleInput('a', { ...base, seq: 2, shove: true });
    m.handleInput('a', { ...base, seq: 3, shove: false });
    tick(m);
    expect(m.log.events.some((e) => e.kind === 'shove' && e.by === 'a' && e.victim === 'b')).toBe(true);
  });

  it('F shoves the way you faced when you pressed it, even when your inputs arrive bunched up', () => {
    const { m } = humanMatch();
    const east = -Math.PI / 2;
    place(m, 'g', -5, 1.6, Math.PI / 2); // looking away
    place(m, 'a', 2, 1.6, 0); // facing north...
    place(m, 'b', 2.8, 1.6, 0); // ...with b just east of a
    const a = m.chars.get('a')!;
    const still = { ...walk(1), move: { x: 0, z: 0 }, run: false, sneak: false, jump: false };
    m.handleInput('a', { ...still, yaw: 0, seq: 1 });
    tick(m);
    // A slow frame sends a burst: still facing north for five inputs, then turn east and press F.
    for (let i = 2; i <= 6; i++) m.handleInput('a', { ...still, yaw: 0, seq: i });
    m.handleInput('a', { ...still, yaw: east, shove: true, seq: 7 });
    m.handleInput('a', { ...still, yaw: east, shove: false, seq: 8 });
    tick(m);
    expect(m.log.events.some((e) => e.kind === 'shove')).toBe(false); // not yet: still working through the burst
    tick(m, 8);
    expect(a.inputQueue.length).toBe(0);
    expect(m.log.events.some((e) => e.kind === 'shove' && e.by === 'a' && e.victim === 'b')).toBe(true);
  });

  it('after a long gap the character waits, then works off the backlog a step ahead each tick', () => {
    const { m, start } = setup(-4.2, -4.5);
    const a = m.chars.get('a')!;
    const creep = (): Omit<InputMsg, 'seq'> => ({ ...walk(1), move: { x: 0, z: 1 }, yaw: 0, run: false, sneak: true, jump: false });
    for (let i = 1; i <= 30; i++) { send(m, i, creep); tick(m); }
    tick(m, 30); // a one-second stall...
    expect(a.ack).toBe(30 + INPUT.repeatMax);
    expect(a.credit).toBe(30 - INPUT.repeatMax);
    for (let i = 31; i <= 60; i++) send(m, i, creep); // ...then its 30 inputs arrive together
    expect(a.inputQueue.length).toBe(30 - INPUT.repeatMax);
    let seq = 60, ticks = 0;
    while (a.inputQueue.length > 1 && ticks < 60) { send(m, ++seq, creep); tick(m); ticks++; }
    // New inputs keep coming meanwhile, so the backlog shrinks by one a tick.
    expect(ticks).toBeLessThanOrEqual(30 - INPUT.repeatMax);
    expect(a.ack).toBe(seq - 1);
    // Every input moved it once; standing still while it waited cost (next to) nothing.
    expect(gap(a.body.pos, reference(start, a.ack, creep).pos)).toBeLessThan(0.05);
  });

  it('sending inputs faster than the tick rate does not make anyone faster', () => {
    const run = (perTick: number): number => {
      const { m } = setup();
      const a = m.chars.get('a')!;
      a.body.pos = { x: -4.2, y: a.body.pos.y, z: -5 };
      const from = { ...a.body.pos };
      const fast = (): Omit<InputMsg, 'seq'> => ({ ...walk(1), move: { x: 0, z: 1 }, yaw: 0, run: true, jump: false });
      let seq = 0;
      for (let t = 0; t < 30; t++) {
        for (let j = 0; j < perTick; j++) send(m, ++seq, fast);
        tick(m);
      }
      return gap(a.body.pos, from);
    };
    const honest = run(1), greedy = run(2);
    expect(honest).toBeGreaterThan(2.5);
    expect(greedy).toBeLessThanOrEqual(honest * 1.05);
  });

  it('a frozen client stops moving after a moment', () => {
    const { m } = setup();
    const a = m.chars.get('a')!;
    send(m, 1, () => ({ ...walk(1), move: { x: 0, z: 1 }, yaw: 0, run: false, jump: false }));
    tick(m, 1 + INPUT.repeatMax);
    const stopped = { ...a.body.pos };
    expect(stopped.z).toBeLessThan(-8 - 0.3); // it walked on for a few guessed ticks...
    tick(m, 40);
    expect(a.body.pos).toEqual(stopped); // ...then waited exactly where it was
    expect(a.running).toBe(false);
  });

  it("a player's own snapshots show only what their real inputs did", () => {
    const { m, box } = setup();
    const a = m.chars.get('a')!;
    const north = (): Omit<InputMsg, 'seq'> => ({ ...walk(1), move: { x: 0, z: 1 }, yaw: 0, run: false, jump: false });
    for (let i = 1; i <= 10; i++) { send(m, i, north); tick(m); }
    const real = { ...a.body.pos };
    tick(m, 3); // three ticks guessed: everyone else sees it walk on
    expect(a.body.pos.z).toBeLessThan(real.z - 0.2);
    box.clear();
    tick(m, 2);
    const own = (box.of('a').filter((x) => x.t === 'snap').pop() as Snap).chars.find((c) => c.id === 'a')!;
    expect(own.ack).toBe(10);
    expect(Math.abs(own.pos.z - real.z)).toBeLessThan(0.001);
    const others = (box.of('b').filter((x) => x.t === 'snap').pop() as Snap).chars.find((c) => c.id === 'a');
    expect(others?.ack).toBeUndefined(); // nobody else is told how far anyone's inputs got
  });

  it('every cousin gets their own ack, and only their own', () => {
    const { m, box } = humanMatch();
    const seqOf: Record<string, number> = { a: 7, b: 19, c: 31, d: 43 };
    for (const [id, seq] of Object.entries(seqOf)) m.handleInput(id, { ...walk(1), move: { x: 0, z: 0 }, seq });
    box.clear();
    tick(m, 2);
    for (const [id, seq] of Object.entries(seqOf)) {
      const snap = box.of(id).filter((x) => x.t === 'snap').pop() as Snap;
      for (const cs of snap.chars) expect(cs.ack).toBe(cs.id === id ? seq : undefined);
    }
  });

  it('when the real inputs turn up, the guessed ticks are replayed with them', () => {
    const { m, start } = setup();
    const a = m.chars.get('a')!;
    for (let i = 1; i <= 40; i++) { send(m, i); tick(m); }
    tick(m, 4); // inputs 41-44 are held up: guessed by repeating 40...
    for (let i = 41; i <= 45; i++) send(m, i); // ...and turn up with 45 (the walk turns meanwhile)
    tick(m);
    expect(a.ack).toBe(45);
    expect(a.guess).toBeNull();
    expect(gap(a.body.pos, reference(start, 45).pos)).toBeLessThan(1e-9);
  });

  it("a reloaded page's inputs count at once (its counter starts again at 1)", () => {
    const { m } = setup();
    const a = m.chars.get('a')!;
    for (let i = 1; i <= 50; i++) { send(m, i); tick(m); }
    m.setConnected('a', false);
    tick(m, 10);
    m.setConnected('a', true);
    place(m, 'a', -4.2, -6, 0);
    const z0 = a.body.pos.z;
    const north = (): Omit<InputMsg, 'seq'> => ({ ...walk(1), move: { x: 0, z: 1 }, yaw: 0, run: false, jump: false });
    for (let i = 1; i <= 10; i++) { send(m, i, north); tick(m); }
    expect(a.ack).toBe(10);
    expect(a.body.pos.z).toBeLessThan(z0 - 0.5);
  });

  it("inputs sent during Nana's lie-down do not pile up for afterwards", () => {
    const { m } = setup();
    const a = m.chars.get('a')!;
    let seq = 0;
    for (let i = 0; i < 10; i++) { send(m, ++seq); tick(m); }
    m.setConnected('g', false);
    expect(m.pause).not.toBeNull();
    for (let i = 0; i < 60; i++) { send(m, ++seq); tick(m); }
    m.setConnected('g', true);
    expect(m.pause).toBeNull();
    send(m, ++seq);
    tick(m);
    expect(a.ack).toBe(seq);
    expect(a.inputQueue.length).toBe(0);
  });
});
