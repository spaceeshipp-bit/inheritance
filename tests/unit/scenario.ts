// Scenario helpers for rule tests with human players: a match with Grandma
// 'g' and cousins 'a'..'d', characters placed by hand, inputs pressed by hand.
import { groundHeight } from '../../shared/map.js';
import type { InputMsg, ServerMsg } from '../../shared/protocol.js';
import type { Char, Match } from '../../server/match.js';
import { makeMatch, toVisit } from './helpers.js';

export const HUMANS = ['g', 'a', 'b', 'c', 'd'];
const seqs = new Map<string, number>();

export function press(m: Match, id: string, over: Partial<InputMsg> = {}): void {
  const c = m.chars.get(id)!;
  const seq = (seqs.get(id) ?? 0) + 1;
  seqs.set(id, seq);
  m.handleInput(id, { ...m.blankInput(seq, c.yaw), pitch: 0, ...over });
}

/** Put a character at (x, z) facing `yaw` (0 = north/-Z, PI/2 = west, -PI/2 = east). */
export function place(m: Match, id: string, x: number, z: number, yaw: number, y?: number): Char {
  const c = m.chars.get(id)!;
  const gy = y ?? groundHeight(x, z, 0.5);
  c.body.pos = { x, y: gy, z };
  c.body.vel = { x: 0, y: 0, z: 0 };
  c.body.onGround = true;
  c.body.peakY = gy;
  c.yaw = yaw;
  // Face that way now (not through the input queue, which applies one input a tick),
  // and forget any guessed ticks (a replay would put the character back).
  c.inputQueue = [];
  c.guess = null;
  c.input = { ...c.input, yaw, move: { x: 0, z: 0 } };
  return c;
}

/** Yaw that faces from (x0, z0) toward (x1, z1). */
export function yawTo(x0: number, z0: number, x1: number, z1: number): number {
  return Math.atan2(-(x1 - x0), -(z1 - z0));
}

export function humanMatch(seed = 5, options = {}) {
  seqs.clear();
  const r = makeMatch({ humans: HUMANS, grandmaId: 'g', seed, options });
  toVisit(r.m);
  // Grandma at her spawn facing east; cousins parked in a row by the front door, facing north.
  place(r.m, 'g', -5, 1.6, -Math.PI / 2);
  place(r.m, 'a', -1, 4.5, 0);
  place(r.m, 'b', 1, 4.5, 0);
  place(r.m, 'c', 3, 4.5, 0);
  place(r.m, 'd', 5, 4.5, 0);
  r.m.step(1 / 30);
  return r;
}

export const tick = (m: Match, n = 1): void => { for (let i = 0; i < n; i++) m.step(1 / 30); };

/**
 * A player's walk, input number `i` (from 1): forward, a running strafe, a
 * stop, backward, a running strafe back, a creep with a jump, looking slowly
 * left and right throughout. It stays near where it started.
 */
export function walkInput(i: number): Omit<InputMsg, 'seq'> {
  const k = i % 120;
  const move = k < 30 ? { x: 0, z: 1 } : k < 45 ? { x: 1, z: 0 } : k < 60 ? { x: 0, z: 0 } : k < 90 ? { x: 0, z: -1 } : k < 105 ? { x: -1, z: 0 } : { x: 0, z: 0.5 };
  return {
    t: 'input', move, yaw: 0.6 * Math.sin((2 * Math.PI * i) / 300), pitch: 0,
    run: (k >= 30 && k < 45) || (k >= 90 && k < 105), sneak: k >= 105, jump: k === 20,
    whisper: false, primary: false, secondary: false, shove: false, interact: false, plant: false,
  };
}

export type Snap = Extract<ServerMsg, { t: 'snap' }>;
export function lastSnap(box: { of(id: string): ServerMsg[] }, id: string): Snap {
  return box.of(id).filter((x) => x.t === 'snap').pop() as Snap;
}
