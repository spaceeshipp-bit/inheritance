// Server review (2026-11-23): secrecy of the Favourite, the Framed moment, Family
// Dinner bots, disconnects and reconnects, Grandma's lie-down, Mittens on the
// stairs, props lost off a map, and What Nana Saw's footsteps. Each test failed
// before its fix (finding numbers as in the review).
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../../shared/constants.js';
import { MAPS, MAP_IDS, groundHeight } from '../../shared/map.js';
import type { ServerMsg } from '../../shared/protocol.js';
import type { Moment, ReplayFrame, Vec3, WishInfo } from '../../shared/types.js';
import { EventLog } from '../../server/log.js';
import type { Match } from '../../server/match.js';
import { levelOf } from '../../server/nav.js';
import { propOutside, stepProp, type PhysProp } from '../../server/physics.js';
import { RoomManager, type Conn } from '../../server/room.js';
import { createBody } from '../../shared/movement.js';
import { makeMatch, stepUntil } from './helpers.js';
import { humanMatch, lastSnap, place, press, tick } from './scenario.js';

const momentsTo = (box: { events(id: string, e?: string): unknown[] }, id: string): Moment[] =>
  box.events(id, 'moment').map((e) => (e as { moment: Moment }).moment);
const toasts = (box: { events(id: string, e?: string): unknown[] }, id: string): string[] =>
  box.events(id, 'toast').map((e) => (e as { text: string }).text);

/** Nana at (0, 1) facing north, cousin c 1.5 m in front of her (her sharp sight), and her Favourite smashed at c's feet, blamed on c. */
function breakFavouriteInFrontOfNana(m: Match): void {
  place(m, 'g', 0, 1, 0);
  place(m, 'c', 0, -0.5, Math.PI);
  place(m, 'a', -6, 4.5, 0);
  place(m, 'b', -5, 4.5, 0);
  place(m, 'd', 5, 4.5, 0);
  const fav = [...m.props.values()].find((p) => p.favourite)!;
  fav.pos = { x: 0.3, y: 1.2, z: -0.8 };
  fav.resting = false;
  fav.spot = null;
  fav.lastBy = 'c';
  fav.vel = { x: 0, y: -8, z: 0 };
  tick(m, 3);
  expect(fav.broken).toBe(true);
}

/** Into Family Dinner of a full match of humans g (Grandma) and a..d. */
function dinnerMatch() {
  const r = makeMatch({ humans: ['g', 'a', 'b', 'c', 'd'], grandmaId: 'g', options: { fullMatch: true } });
  r.m.start();
  stepUntil(r.m, () => r.m.phase === 'visit' && r.m.visits[r.m.visitIndex] === 'dinner', 200);
  expect(r.m.visits[r.m.visitIndex]).toBe('dinner');
  return r;
}

describe('1, 3: the Favourite stays secret until the reading', () => {
  it('1: Caught Red-Handed breaking her Favourite never names it to a cousin mid-match', () => {
    const { m, box } = humanMatch();
    breakFavouriteInFrontOfNana(m);
    const toC = momentsTo(box, 'c');
    expect(toC.some((x) => x.kind === 'caught-red-handed')).toBe(true);
    for (const id of ['a', 'b', 'c', 'd']) expect(momentsTo(box, id).some((x) => /favourite/i.test(x.text))).toBe(false);
    // The reading still tells everyone.
    expect(m.log.moments.some((x) => x.kind === 'favourite-broken' && x.actor === 'c')).toBe(true);
  });

  it('3: a free Tut costs the bar cousins see like any Tut; Grandma sees her real budget', () => {
    const { m, box } = humanMatch();
    breakFavouriteInFrontOfNana(m);
    tick(m, 3);
    const before = lastSnap(box, 'a').willAvail;
    expect(lastSnap(box, 'g').willAvail).toEqual(before);
    m.handleGrandma('g', { a: 'tut', target: 'b' });
    expect(m.freeTuts).toBe(0);
    tick(m, 3);
    expect(lastSnap(box, 'a').willAvail).toEqual({ budget: before.budget - 5, rolling: before.rolling - 5 });
    expect(lastSnap(box, 'g').willAvail).toEqual(before); // it cost her nothing
  });
});

describe('4: Framed only when Nana fell for that plant', () => {
  const pos = { x: 0, y: 0, z: 0 };
  const framed = (log: EventLog) => log.moments.filter((x) => x.kind === 'framed');

  it('a find from an earlier visit does not frame its owner for a later Tut', () => {
    const log = new EventLog();
    log.add({ t: 30, kind: 'plant', by: 'a', item: 'item-phone', owner: 'b', pos, seen: false }); // 0
    log.add({ t: 40, kind: 'found', item: 'item-phone', owner: 'b', plant: 0, visit: 0 });
    log.add({ t: 300, kind: 'accuse', target: 'b', crime: null, visit: 1 });
    expect(framed(log)).toEqual([]);
    expect(log.metrics()).toMatchObject({ plants: 1, plantsAccusedOwner: 0 });
  });

  it('nor once the owner has the item back', () => {
    const log = new EventLog();
    log.add({ t: 30, kind: 'plant', by: 'a', item: 'item-phone', owner: 'b', pos, seen: false }); // 0
    log.add({ t: 40, kind: 'found', item: 'item-phone', owner: 'b', plant: 0, visit: 0 });
    log.add({ t: 41, kind: 'recovered', by: 'b', item: 'item-phone' });
    log.add({ t: 60, kind: 'accuse', target: 'b', crime: null, visit: 0 });
    expect(framed(log)).toEqual([]);
  });

  it('in a match: b takes his planted phone back at once, and a later Tut for his own shove is no frame-up', () => {
    const { m } = humanMatch();
    const EAST = -Math.PI / 2;
    place(m, 'g', -5, 1.6, EAST);
    const item = m.props.get(m.chars.get('b')!.itemId!)!;
    const a = place(m, 'a', -3.6, 0.6, EAST);
    item.heldBy = 'a'; item.onBody = false; a.holding = item.id; a.sticky = true;
    for (let i = 0; i < 60 && !item.planted; i++) { press(m, 'a', { yaw: EAST, plant: true }); tick(m); }
    expect(item.planted).toBe(true);
    tick(m, 3);
    expect(m.log.events.some((e) => e.kind === 'found' && e.owner === 'b')).toBe(true);
    place(m, 'a', 3, 4.5, 0);
    place(m, 'b', item.pos.x + 0.6, item.pos.z, Math.PI / 2);
    press(m, 'b', { yaw: Math.PI / 2, interact: true }); tick(m);
    press(m, 'b', { yaw: Math.PI / 2, interact: false }); tick(m);
    expect(item.heldBy).toBe('b');
    expect(m.log.events.some((e) => e.kind === 'recovered' && e.by === 'b')).toBe(true);
    tick(m, 30 * 15);
    place(m, 'b', -3.5, 0.2, 0);
    place(m, 'c', -3.5, -0.9, 0);
    press(m, 'b', { yaw: 0, shove: true }); tick(m);
    expect(m.log.events.some((e) => e.kind === 'shove' && e.by === 'b')).toBe(true);
    m.handleGrandma('g', { a: 'tut', target: 'b' });
    expect(m.log.events.some((e) => e.kind === 'accuse' && e.target === 'b')).toBe(true);
    expect(m.log.moments.filter((x) => x.kind === 'framed')).toEqual([]);
    expect(m.log.metrics().plantsAccusedOwner).toBe(0);
  });
});

describe('5: bots keep to Family Dinner', () => {
  it('bot cousins stay round the table, excuse themselves before a trip, and wander off unexcused at most once', () => {
    const bots = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
    const { m, box } = makeMatch({ humans: ['g'], bots, grandmaId: 'g', options: { fullMatch: true }, fast: false, seed: 3 });
    m.start();
    stepUntil(m, () => m.phase === 'visit' && m.visits[m.visitIndex] === 'dinner', 400);
    box.clear();
    const n0 = m.log.events.length;
    let seq = 0;
    const end = m.phaseEndsAt;
    while (m.time < end - 0.1 && m.phase === 'visit') {
      m.handleInput('g', { ...m.blankInput(++seq, m.chars.get('g')!.yaw) }); // a human Nana sitting at the head
      m.step(1 / 30);
    }
    const left = toasts(box, 'g').filter((t) => /has left the table/.test(t));
    const excused = toasts(box, 'g').filter((t) => /excuses themself/.test(t));
    // Before: 15 notices from 4 bots in one Dinner, and no excuse ever used.
    expect(left.length).toBeLessThanOrEqual(bots.length);
    expect(excused.length).toBeGreaterThan(0);
    const perBot = new Map<string, number>();
    for (const e of m.log.events.slice(n0)) if (e.kind === 'left-table') perBot.set(e.by, (perBot.get(e.by) ?? 0) + 1);
    for (const n of perBot.values()) expect(n).toBeLessThanOrEqual(2);
  });

  it('the bot Grandma keeps her place at the head of the table on every map', () => {
    for (const map of MAP_IDS) {
      const { m } = makeMatch({ bots: ['nana', 'c1', 'c2', 'c3', 'c4'], grandmaId: 'nana', options: { fullMatch: true, map }, seed: 4 });
      m.start();
      stepUntil(m, () => m.phase === 'visit' && m.visits[m.visitIndex] === 'dinner', 200);
      const seat = m.mapDef.spawns.dinnerGrandma;
      stepUntil(m, () => m.time > m.phaseEndsAt - m.durations.visit('dinner') + 3, 10);
      let away = 0, n = 0;
      while (m.phase === 'visit') {
        m.step(1 / 30);
        const p = m.grandma!.body.pos;
        n++;
        if (Math.hypot(p.x - seat.x, p.z - seat.z) > 1.5) away++;
      }
      // Before: 96% of the Dinner more than 4 m from the table, pottering round the hall.
      expect(away / n, map).toBeLessThan(0.05);
    }
  });
});

describe('2, 6, 7: disconnects and reconnects', () => {
  it('6: a cousin whose connection drops while carrying an heirloom sets it down: nothing breaks in their name', () => {
    const { m } = humanMatch();
    place(m, 'a', 0, 3, 0);
    const h = [...m.props.values()].find((p) => p.kind === 'heirloom' && !p.favourite)!;
    const a = m.chars.get('a')!;
    h.heldBy = 'a'; h.onBody = false; h.resting = false; h.spot = null;
    a.holding = h.id; a.sticky = false;
    for (let i = 0; i < 5; i++) { press(m, 'a', { primary: true }); tick(m); }
    expect(a.holding).toBe(h.id);
    m.setConnected('a', false);
    tick(m, 30);
    expect(h.broken).toBe(false);
    expect(h.heldBy).toBeNull();
    expect(m.log.events.some((e) => e.kind === 'break')).toBe(false);
    expect(m.log.sabotageTally(m.cousinIds).a).toBe(0);
  });

  it('7: a second tab that replaces a live one early in a match moves at once', () => {
    let now = 1000;
    const mgr = new RoomManager({ now: () => now, fast: true, seed: 7 });
    const conns: ServerMsg[][] = [];
    const open = (hello: object) => {
      const msgs: ServerMsg[] = [];
      conns.push(msgs);
      const conn: Conn = { send: (d) => { msgs.push(JSON.parse(d) as ServerMsg); }, close: () => {} };
      const s = mgr.connect(conn, '');
      mgr.onRaw(s, JSON.stringify({ t: 'hello', name: 'Solo', protocol: PROTOCOL_VERSION, ...hello }));
      const welcome = msgs.find((x) => x.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>;
      return { s, welcome };
    };
    const run = (secs: number) => { for (let i = 0; i < Math.round(secs * 30); i++) { now += 1 / 30; mgr.tick(1 / 30); } };
    const first = open({ room: '' });
    mgr.onRaw(first.s, JSON.stringify({ t: 'start' }));
    const room = mgr.rooms.get(first.welcome.room)!;
    for (let i = 0; i < 300 && room.match?.phase !== 'visit'; i++) run(1 / 30);
    const m = room.match!;
    expect(m.phase).toBe('visit');
    const input = (seq: number, z: number) => ({ t: 'input', seq, move: { x: 0, z }, yaw: 0, pitch: 0, run: false, sneak: false, jump: false, whisper: false, primary: false, secondary: false, shove: false, interact: false, plant: false });
    for (let i = 1; i <= 200; i++) { mgr.onRaw(first.s, JSON.stringify(input(i, 0))); run(1 / 30); }
    // The same player opens a second tab (same token): it replaces the first, and counts from 1.
    const second = open({ room: first.welcome.room, token: first.welcome.token });
    expect(second.welcome.you).toBe(first.welcome.you);
    const c = m.chars.get(first.welcome.you)!;
    const start = { ...c.body.pos };
    for (let i = 1; i <= 45; i++) { mgr.onRaw(second.s, JSON.stringify(input(i, 1))); run(1 / 30); }
    expect(Math.hypot(c.body.pos.x - start.x, c.body.pos.z - start.z)).toBeGreaterThan(1);
  });
});

describe("8, 10: Family Dinner's excuse", () => {
  it('8: E at the dinner door beside another cousin excuses you; it does not steal their item', () => {
    const { m, box } = dinnerMatch();
    const door = m.mapDef.dinner.door;
    place(m, 'a', door.x + 0.6, door.z + 0.2, Math.PI / 2);
    place(m, 'b', door.x - 0.2, door.z + 0.4, Math.PI / 2);
    press(m, 'a', { yaw: Math.PI / 2, interact: true }); tick(m);
    expect(toasts(box, 'a').some((t) => /Excuse me/.test(t))).toBe(true);
    expect(m.log.events.some((e) => e.kind === 'steal')).toBe(false);
    expect(m.dinnerExcuse('a').used).toBe(true);
  });

  it('8: a bathroom trip can carry something: E at the door with full hands still excuses you', () => {
    const { m, box } = dinnerMatch();
    const door = m.mapDef.dinner.door;
    const a = place(m, 'a', door.x + 0.6, door.z, Math.PI / 2);
    const item = m.props.get(m.chars.get('b')!.itemId!)!;
    item.heldBy = 'a'; item.onBody = false; a.holding = item.id; a.sticky = true;
    press(m, 'a', { yaw: Math.PI / 2, interact: true }); tick(m);
    expect(toasts(box, 'a').some((t) => /Excuse me/.test(t))).toBe(true);
    expect(a.holding).toBe(item.id);
  });

  it("10: Grandma's lie-down does not eat into an excuse", () => {
    const { m } = dinnerMatch();
    const door = m.mapDef.dinner.door;
    place(m, 'a', door.x + 0.6, door.z, Math.PI / 2);
    press(m, 'a', { yaw: Math.PI / 2, interact: true }); tick(m);
    const until = m.dinnerExcuse('a').until;
    m.setConnected('g', false);
    tick(m, 10 * 30);
    m.setConnected('g', true);
    tick(m);
    expect(m.dinnerExcuse('a').until).toBeCloseTo(until + 10, 0);
  });
});

describe('10: after the lie-down', () => {
  it('everyone is re-sent the wish with its moved deadline', () => {
    const { m, box } = humanMatch();
    stepUntil(m, () => m.wish !== null, 15);
    const endsAt = m.wish!.info.endsAt;
    m.setConnected('g', false);
    tick(m, 5 * 30);
    box.clear();
    m.setConnected('g', true);
    tick(m, 2);
    const resent = box.events('a', 'wish').pop() as unknown as { wish: WishInfo } | undefined;
    expect(resent?.wish?.endsAt).toBeCloseTo(endsAt + 5, 0);
  });
});

describe('9: Mittens on the stairs', () => {
  it('set down on the grand staircase, she walks off it', () => {
    const { m } = humanMatch();
    const cat = m.props.get('cat')!;
    const z = -5, y = groundHeight(0, z, 3);
    cat.pos = { x: 0, y, z };
    cat.vel = { x: 0, y: 0, z: 0 };
    cat.resting = true;
    cat.cat!.body = createBody(cat.pos);
    cat.cat!.goal = null;
    cat.cat!.waitUntil = 0;
    expect(levelOf(cat.pos)).toBe('ramp');
    expect(stepUntil(m, () => levelOf(cat.pos) !== 'ramp', 20)).toBe(true);
  });
});

describe('11: props lost off a map', () => {
  it('one that falls out of the bottom of a map other than the manor stays there for its own map to rescue', () => {
    const id = MAP_IDS.find((x) => x !== 'manor')!;
    const b = MAPS[id].bounds;
    const at: Vec3 = { x: (b.min.x + b.max.x) / 2, y: Math.min(b.min.y, -5) + 0.05, z: (b.min.z + b.max.z) / 2 };
    const p: PhysProp = { id: 'teacup', kind: 'teacup', pos: { ...at }, vel: { x: 0, y: -10, z: 0 }, resting: false };
    stepProp(p, 1 / 30);
    // Before: moved to (0, 0, 0), inside the manor, where nothing ever brought it back.
    expect(Math.hypot(p.pos.x - at.x, p.pos.z - at.z)).toBeLessThan(0.5);
    expect(propOutside(p.pos)).toBe(true);
  });
});

describe("12: What Nana Saw hears the Pet's footsteps as she did", () => {
  it("a running Nana's Pet 12 m behind her is heard in the replay, as in her snapshot", () => {
    const { m } = humanMatch();
    place(m, 'g', 6, 1.6, -Math.PI / 2); // facing east
    place(m, 'a', -6, 1.6, 0); // 12 m behind her
    m.petId = 'a';
    tick(m, 3);
    m.chars.get('a')!.running = true;
    const frame = (m as unknown as { replayFrame(): ReplayFrame }).replayFrame();
    expect(frame.chars.find((c) => c.id === 'a')!.seen).toBe('heard');
    tick(m, 3);
    m.chars.get('a')!.running = true;
    const snap = m.snapshotFor('g') as Extract<ServerMsg, { t: 'snap' }>;
    expect(snap.chars.some((c) => c.id === 'a')).toBe(true);
  });
});

