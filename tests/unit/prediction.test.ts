// The GDD's Gate 3: "Shoves feel good at 150 ms latency and 2% packet loss."
//
// You see your own character where your client predicts it
// (client/src/predict.ts); the server's word arrives a round trip later and
// corrects it. Here the real Predictor plays against the real Match through a
// simulated WebSocket link (shared/netsim.ts): latency, jitter, and loss
// as TCP stalls followed by bursts. The corrections must stay too small to see.
import { describe, expect, it } from 'vitest';
import { Predictor } from '../../client/src/predict.js';
import { TICK_HZ } from '../../shared/constants.js';
import { NetLink, parseNetSim, type NetSimConfig } from '../../shared/netsim.js';
import type { InputMsg } from '../../shared/protocol.js';
import { makeRng } from '../../server/match.js';
import { humanMatch, place, type Snap } from './scenario.js';

const STEP = 1 / TICK_HZ;

/** A round of the open west end of the hall. */
const PATROL = [{ x: -6.5, z: -10.5 }, { x: -2.6, z: -10.8 }, { x: -2.8, z: -6.2 }, { x: -6.3, z: -6.0 }, { x: -4.4, z: -8.6 }];

/**
 * The player: walks the patrol, steering by where they see themselves (the
 * prediction), the way a person would; runs, sneaks, strafes a little, stops
 * now and then and jumps once in a while.
 */
function patrol(i: number, at: { x: number; z: number } | null, s: { wp: number }): Omit<InputMsg, 'seq'> {
  let target = PATROL[s.wp];
  if (at && Math.hypot(target.x - at.x, target.z - at.z) < 0.6) {
    s.wp = (s.wp + 1) % PATROL.length;
    target = PATROL[s.wp];
  }
  const yaw = at ? Math.atan2(-(target.x - at.x), -(target.z - at.z)) + 0.15 * Math.sin(i / 7) : 0;
  const k = i % 150;
  const stop = k >= 120 && k < 135;
  return {
    t: 'input', move: stop ? { x: 0, z: 0 } : { x: k % 50 < 8 ? 0.6 : 0, z: 1 }, yaw, pitch: 0,
    run: k < 40, sneak: k >= 90 && k < 120, jump: k === 60,
    whisper: false, primary: false, secondary: false, shove: false, interact: false, plant: false,
  };
}

interface Played {
  /** Size of each correction (m), one per snapshot after the first. */
  corrections: number[];
  /** Ticks the server stood in for a late input by repeating the one before. */
  repeats: number;
  /** Inputs that arrived after their tick had been simulated. */
  lateInputs: number;
  /** The character's bounding box over the run (to check the walk stayed in the open). */
  box: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** The character was never knocked over or put to sleep. */
  upright: boolean;
}

/** Play `seconds` of the walk through a link with `net`, client ticks offset from the server's by `phase` of a tick. */
function play(net: NetSimConfig, seconds: number, seed: number, phase = 0.37): Played {
  const { m, box } = humanMatch(seed);
  place(m, 'b', 5, 3, 0);
  place(m, 'c', 6, 3, 0);
  place(m, 'd', 5.5, 4, 0);
  place(m, 'a', -4.0, -8.5, 0);
  box.clear();
  const a = m.chars.get('a')!;
  const rng = makeRng(seed * 7919 + 1);
  const upLink = new NetLink(net, rng), downLink = new NetLink(net, rng);
  const up: { at: number; msg: InputMsg }[] = [];
  const down: { at: number; snap: Snap }[] = [];
  const pred = new Predictor();
  const out: Played = { corrections: [], repeats: 0, lateInputs: 0, box: { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }, upright: true };
  let nextServer = STEP, nextClient = phase * STEP, seq = 0, reconciled = 0;
  const route = { wp: 0 };
  for (let t = 0; t < seconds;) {
    const tUp = up.length ? up[0].at : Infinity;
    const tDown = down.length ? down[0].at : Infinity;
    t = Math.min(nextServer, nextClient, tUp, tDown);
    if (t === tUp) {
      const { msg } = up.shift()!;
      if (msg.seq <= a.ack) out.lateInputs++;
      m.handleInput('a', msg);
    } else if (t === tDown) {
      const me = down.shift()!.snap.chars.find((c) => c.id === 'a');
      if (!me) continue;
      pred.reconcile(me);
      if (reconciled++ > 0) out.corrections.push(pred.lastError);
    } else if (t === nextServer) {
      const before = a.repeats;
      m.step(STEP);
      nextServer += STEP;
      if (a.repeats > before) out.repeats++;
      if (a.state !== 'normal') out.upright = false;
      const p = a.body.pos;
      out.box = { minX: Math.min(out.box.minX, p.x), maxX: Math.max(out.box.maxX, p.x), minZ: Math.min(out.box.minZ, p.z), maxZ: Math.max(out.box.maxZ, p.z) };
      for (const x of box.all) if (x.to === 'a' && x.msg.t === 'snap') down.push({ at: downLink.deliverAt(t), snap: x.msg });
      box.clear();
    } else {
      const seen = pred.sample(STEP)?.pos ?? null;
      const msg: InputMsg = { ...patrol(++seq, seen, route), seq };
      pred.input(msg, 'cousin', false);
      up.push({ at: upLink.deliverAt(t), msg });
      nextClient += STEP;
    }
  }
  return out;
}

const pct = (xs: number[], p: number): number => {
  const s = [...xs].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};

describe('prediction (GDD gate 3)', () => {
  it('reads the netsim flag: round trip, jitter and loss', () => {
    expect(parseNetSim('150,20,2')).toEqual({ rtt: 0.15, jitter: 0.02, loss: 0.02 });
    expect(parseNetSim('80')).toEqual({ rtt: 0.08, jitter: 0, loss: 0 });
    expect(parseNetSim('')).toBeNull();
    expect(parseNetSim('fast')).toBeNull();
    expect(parseNetSim('150,20,2,9')).toBeNull();
    expect(parseNetSim('150,20,90')).toBeNull();
  });

  it('a TCP-like link never reorders: a lost packet holds up the ones behind it', () => {
    const link = new NetLink({ rtt: 0.1, jitter: 0.03, loss: 0.1 }, makeRng(3));
    let last = 0, stalls = 0;
    for (let i = 0; i < 2000; i++) {
      const sent = i * STEP;
      const at = link.deliverAt(sent);
      expect(at).toBeGreaterThanOrEqual(last);
      expect(at).toBeGreaterThanOrEqual(sent);
      if (at - sent > 0.2) stalls++;
      last = at;
    }
    expect(stalls).toBeGreaterThan(100); // each loss stalls several messages behind it
  });

  it('on a perfect link, the server agrees with the prediction exactly', () => {
    const r = play({ rtt: 0, jitter: 0, loss: 0 }, 20, 11);
    expect(r.upright).toBe(true);
    expect(Math.max(...r.corrections)).toBeLessThan(0.005); // snapshots are rounded to the millimetre
    expect(r.repeats).toBe(0);
  });

  // 150 ms is the gate; 300 ms shows the margin.
  for (const rtt of [150, 300]) {
    it(`at ${rtt} ms, ±15 ms jitter and 2% loss, your own character barely ever moves when the server answers`, () => {
      const all: number[] = [];
      let repeats = 0, late = 0;
      for (const seed of [1, 2, 3]) {
        const r = play({ rtt: rtt / 1000, jitter: 0.015, loss: 0.02 }, 30, seed);
        expect(r.upright).toBe(true);
        // The walk stayed in the open west end of the hall (walls are predicted too, but nothing else is in the way).
        expect(r.box.minX).toBeGreaterThan(-7.7);
        expect(r.box.maxX).toBeLessThan(-1.7);
        expect(r.box.maxZ).toBeLessThan(-4.6);
        all.push(...r.corrections);
        repeats += r.repeats;
        late += r.lateInputs;
      }
      // Losses did happen, and the server stood in for the late inputs.
      expect(late).toBeGreaterThan(20);
      expect(repeats).toBeGreaterThan(20);
      // Nearly every answer agrees with what you already saw (under 1 cm)...
      expect(pct(all, 95)).toBeLessThan(0.01);
      // ...and the worst is a short slide, never a jump (the client blends it out over a few frames).
      expect(Math.max(...all)).toBeLessThan(0.5);
      console.log(`[prediction ${rtt} ms] snapshots ${all.length}, p95 ${(pct(all, 95) * 100).toFixed(1)} cm, p99 ${(pct(all, 99) * 100).toFixed(1)} cm, max ${(Math.max(...all) * 100).toFixed(1)} cm, repeats ${repeats}, late inputs ${late}`);
    });
  }
});
