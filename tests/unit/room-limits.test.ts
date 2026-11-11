// Review findings S7 (limits), S3 (rtc relay budget), S2 (voice pairing during a
// match) and the "match in progress" lobby, against the real RoomManager/Room
// with an injected clock and fake connections.
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../../shared/constants.js';
import { CLOSE_CODES, type ServerMsg } from '../../shared/protocol.js';
import { lobbyEndsOurMatch } from '../../client/src/net.js';
import { LIMITS, type Limits } from '../../server/limits.js';
import { RoomManager, type Conn, type Session } from '../../server/room.js';

type Of<T extends ServerMsg['t']> = Extract<ServerMsg, { t: T }>;

class FakeConn implements Conn {
  msgs: ServerMsg[] = [];
  closed: { code?: number; reason?: string } | null = null;
  send(data: string): void { this.msgs.push(JSON.parse(data) as ServerMsg); }
  close(code?: number, reason?: string): void { this.closed = { code, reason }; }
  of<T extends ServerMsg['t']>(t: T): Of<T>[] { return this.msgs.filter((m) => m.t === t) as Of<T>[]; }
  last<T extends ServerMsg['t']>(t: T): Of<T> | undefined { return this.of(t).at(-1); }
}

interface Joined { conn: FakeConn; s: Session; welcome: Of<'welcome'> | undefined; id: string }

function world(limits?: Partial<Limits>, fast = true, visitSeconds?: number) {
  let now = 1000;
  const mgr = new RoomManager({ now: () => now, fast, visitSeconds, seed: 7, limits });
  const join = (name: string, room: string, opts: { ip?: string; token?: string } = {}): Joined => {
    const conn = new FakeConn();
    const s = mgr.connect(conn, opts.ip ?? '');
    mgr.onRaw(s, JSON.stringify({ t: 'hello', name, room, protocol: PROTOCOL_VERSION, ...(opts.token ? { token: opts.token } : {}) }));
    const welcome = conn.last('welcome');
    return { conn, s, welcome, id: welcome?.you ?? '' };
  };
  const send = (j: Joined, msg: object): void => mgr.onRaw(j.s, JSON.stringify(msg));
  const run = (secs: number): void => {
    const n = Math.round(secs * 30);
    for (let i = 0; i < n; i++) { now += 1 / 30; mgr.tick(1 / 30); }
  };
  const runUntil = (pred: () => boolean, maxSecs: number): boolean => {
    for (let i = 0; i < maxSecs * 30 && !pred(); i++) { now += 1 / 30; mgr.tick(1 / 30); }
    return pred();
  };
  return { mgr, join, send, run, runUntil };
}

const peersOf = (j: Joined): string[] => [...(j.conn.last('peers')?.ids ?? [])].sort();
const ids = (...js: Joined[]): string[] => js.map((j) => j.id).sort();

describe('S7: limits on connections, rooms and matches', () => {
  it('the defaults are the ones the review asked for', () => {
    expect(LIMITS).toMatchObject({
      socketsPerIp: 8, roomsPerIpPerMinute: 6, helloTimeout: 10, maxRooms: 200, maxMatches: 100, idleMatchGrace: 30,
      rtcBurst: 40, rtcPerSec: 20, maxSdp: 16 * 1024, snapBacklog: 512 * 1024, maxBacklog: 1024 * 1024, spectatorRefresh: 2,
    });
  });

  it('a connection that has not joined a room within 10 s is closed', () => {
    const w = world();
    const silent = new FakeConn();
    w.mgr.connect(silent, '203.0.113.5');
    const badHello = w.join('Bea', 'IIIII', { ip: '203.0.113.5' }); // refused hello: still not in a room
    const ok = w.join('Ann', '');
    expect(badHello.conn.last('error')).toMatchObject({ refused: true });
    w.run(9.5);
    expect(silent.closed).toBeNull();
    expect(badHello.conn.closed).toBeNull();
    w.run(1.1);
    expect(silent.closed?.code).toBe(CLOSE_CODES.refused);
    expect(silent.last('error')).toMatchObject({ refused: true });
    expect(badHello.conn.closed?.code).toBe(CLOSE_CODES.refused);
    expect(ok.conn.closed).toBeNull();
  });

  it('one address may create 6 rooms a minute; joining by code is not limited; loopback is exempt', () => {
    const w = world();
    const ip = '203.0.113.9';
    const made = Array.from({ length: 6 }, (_, i) => w.join(`S${i}`, '', { ip }));
    expect(made.every((m) => m.welcome)).toBe(true);
    const seventh = w.join('S7', '', { ip });
    expect(seventh.welcome).toBeUndefined();
    expect(seventh.conn.last('error')).toMatchObject({ refused: true, message: expect.stringMatching(/too many new rooms/i) });
    // An unknown code also makes a room, so it counts too.
    expect(w.join('S8', 'ZZZZZ', { ip }).welcome).toBeUndefined();
    expect(w.mgr.rooms.size).toBe(6);
    // A friend's room by its code is fine from the same address.
    expect(w.join('Friend', made[0].welcome!.room, { ip }).welcome?.room).toBe(made[0].welcome!.room);
    // Other addresses are not affected; exempt ('' = loopback) ones are not limited.
    expect(w.join('Other', '', { ip: '198.51.100.7' }).welcome).toBeDefined();
    for (let i = 0; i < 10; i++) expect(w.join(`L${i}`, '').welcome).toBeDefined();
    // The bucket refills over the minute: one more room after 10 s, not two.
    w.run(10.5);
    expect(w.join('Later', '', { ip }).welcome).toBeDefined();
    expect(w.join('Later2', '', { ip }).welcome).toBeUndefined();
  });

  it('whole-server caps on rooms and running matches answer with a friendly error', () => {
    const w = world({ maxRooms: 3, maxMatches: 1 });
    const a = w.join('A', ''), b = w.join('B', '');
    w.join('C', '');
    const d = w.join('D', '');
    expect(d.welcome).toBeUndefined();
    expect(d.conn.last('error')).toMatchObject({ refused: true, message: expect.stringMatching(/server is full/i) });
    expect(w.mgr.rooms.size).toBe(3);
    // Existing rooms can still be joined at the cap.
    expect(w.join('A2', a.welcome!.room).welcome).toBeDefined();
    w.send(a, { t: 'start' });
    expect(w.mgr.rooms.get(a.welcome!.room)!.match).not.toBeNull();
    w.send(b, { t: 'start' });
    expect(w.mgr.rooms.get(b.welcome!.room)!.match).toBeNull();
    expect(b.conn.last('error')?.message).toMatch(/as many matches as it can/i);
    expect(w.mgr.runningMatches()).toBe(1);
  });

  it('a socket that keeps flooding past its frame budget is closed; a normal player never is', () => {
    const w = world();
    const flooder = w.join('Flo', '');
    const ping = JSON.stringify({ t: 'ping', ts: 1 });
    for (let i = 0; i < 1000; i++) w.mgr.onRaw(flooder.s, ping);
    expect(flooder.conn.closed?.code).toBe(CLOSE_CODES.refused);
    expect(flooder.conn.last('error')).toMatchObject({ refused: true, message: expect.stringMatching(/too many messages/i) });
    expect(flooder.conn.of('pong').length).toBeLessThanOrEqual(LIMITS.frameBurst);
    const after = flooder.conn.msgs.length;
    w.run(5);
    w.mgr.onRaw(flooder.s, ping);
    expect(flooder.conn.msgs.length).toBe(after); // ignored for good
    // A player: 30 inputs a second and a ping every half second, for a minute.
    const ann = w.join('Ann', '');
    let seq = 0;
    for (let t = 0; t < 60 * 30; t++) {
      w.send(ann, { t: 'input', seq: ++seq, move: { x: 0, z: 1 }, yaw: 0, pitch: 0, run: false, sneak: false, jump: false, whisper: false, primary: false, secondary: false, shove: false, interact: false, plant: false });
      if (t % 15 === 0) w.send(ann, { t: 'ping', ts: t });
      w.run(1 / 30);
    }
    expect(ann.conn.closed).toBeNull();
    expect(ann.conn.of('pong')).toHaveLength(120);
  });

  it('frames are also budgeted in bytes: big frames run out first', () => {
    const w = world();
    const big = w.join('Big', '');
    const fat = JSON.stringify({ t: 'ping', ts: 1, pad: 'x'.repeat(60000) });
    for (let i = 0; i < 20; i++) w.mgr.onRaw(big.s, fat);
    expect(big.conn.of('pong')).toHaveLength(Math.floor(LIMITS.frameBytesBurst / fat.length));
    expect(big.conn.closed).toBeNull(); // a few strikes, not a flood
  });

  it('a match nobody plays any more stops 30 s after the last player left; a lone player reloading survives', () => {
    const w = world({}, false); // real phase lengths: Tea lasts 180 s
    const solo = w.join('Solo', '');
    w.send(solo, { t: 'start' });
    const room = w.mgr.rooms.get(solo.welcome!.room)!;
    expect(w.runUntil(() => room.match?.phase === 'visit', 30)).toBe(true);
    w.run(2);
    // Reload: the socket drops and the page is back 3 s later with its token.
    w.mgr.onClose(solo.s);
    w.run(3);
    const back = w.join('Solo', room.code, { token: solo.welcome!.token });
    expect(back.id).toBe(solo.id);
    w.run(40);
    expect(room.match?.phase).toBe('visit');
    // Now the only player leaves for good: the bots must not play on for minutes.
    w.mgr.onClose(back.s);
    const t0 = room.match!.time;
    w.run(29);
    expect(room.match).not.toBeNull();
    expect(room.match!.time).toBeGreaterThan(t0 + 28);
    w.run(1.5);
    expect(room.match).toBeNull();
    expect([...room.players.values()].some((p) => p.isBot)).toBe(false);
    expect(w.mgr.rooms.has(room.code)).toBe(true); // the empty room itself goes after its own TTL
    expect(w.mgr.runningMatches()).toBe(0);
  });
});

describe('S3: the rtc relay has its own budget', () => {
  const ice = (to: string): object => ({ t: 'rtc', to, data: { type: 'ice', candidate: { candidate: 'candidate:1 1 udp 2122260223 10.0.0.1 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 } } });

  it('20 messages a second in bursts of 40', () => {
    const w = world();
    const a = w.join('A', ''), b = w.join('B', a.welcome!.room);
    for (let i = 0; i < 100; i++) w.send(a, ice(b.id));
    expect(b.conn.of('rtc')).toHaveLength(40);
    w.run(1);
    for (let i = 0; i < 100; i++) w.send(a, ice(b.id));
    const n = b.conn.of('rtc').length;
    expect(n).toBeGreaterThanOrEqual(59);
    expect(n).toBeLessThanOrEqual(60);
  });

  it('lobby messages cannot be used the same way: no change, no broadcast, and changes at a human rate', () => {
    const w = world();
    const a = w.join('A', ''), b = w.join('B', a.welcome!.room);
    const n0 = b.conn.of('lobby').length;
    for (let i = 0; i < 100; i++) w.send(a, { t: 'lobby', willingGrandma: false });
    expect(b.conn.of('lobby').length).toBe(n0);
    for (let i = 0; i < 100; i++) w.send(a, { t: 'lobby', willingGrandma: i % 2 === 0 });
    expect(b.conn.of('lobby').length - n0).toBeLessThanOrEqual(LIMITS.lobbyBurst);
    // A real change still goes out at once.
    w.run(1);
    w.send(a, { t: 'lobby', options: { fullMatch: true } });
    expect(b.conn.last('lobby')?.options.fullMatch).toBe(true);
  });

  it('big SDPs run out of the 128 KB character budget first, then get 32 KB a second', () => {
    const w = world();
    const c = w.join('C', ''), d = w.join('D', c.welcome!.room);
    const offer = { t: 'rtc', to: d.id, data: { type: 'offer', sdp: 'x'.repeat(16 * 1024) } };
    for (let i = 0; i < 30; i++) w.send(c, offer);
    expect(d.conn.of('rtc')).toHaveLength(8);
    w.run(1.02);
    for (let i = 0; i < 30; i++) w.send(c, offer);
    expect(d.conn.of('rtc')).toHaveLength(10);
  });
});

describe('S2: voice pairing while a match runs', () => {
  it('participants pair only with participants, everyone else only with each other, and the relay agrees', () => {
    const w = world();
    const host = w.join('Host', '');
    const code = host.welcome!.room;
    const ann = w.join('Ann', code);
    w.send(host, { t: 'start' });
    const room = w.mgr.rooms.get(code)!;
    expect(room.match).not.toBeNull();
    const late1 = w.join('Late', code);
    const late2 = w.join('Later', code);
    expect(peersOf(host)).toEqual(ids(ann));
    expect(peersOf(ann)).toEqual(ids(host));
    expect(peersOf(late1)).toEqual(ids(late2));
    expect(peersOf(late2)).toEqual(ids(late1));
    // Signalling cannot cross between the groups, in either direction.
    const offer = (to: Joined): object => ({ t: 'rtc', to: to.id, data: { type: 'offer', sdp: 'v=0 fake' } });
    w.send(late1, offer(host));
    w.send(host, offer(late1));
    expect(host.conn.of('rtc')).toHaveLength(0);
    expect(late1.conn.of('rtc')).toHaveLength(0);
    w.send(late1, offer(late2));
    w.send(host, offer(ann));
    expect(late2.conn.of('rtc')).toHaveLength(1);
    expect(ann.conn.of('rtc')).toHaveLength(1);
    // When the match is over everybody pairs up again.
    expect(w.runUntil(() => room.match === null, 120)).toBe(true);
    expect(peersOf(host)).toEqual(ids(ann, late1, late2));
    expect(peersOf(late1)).toEqual(ids(host, ann, late2));
    w.send(late1, offer(host));
    expect(host.conn.of('rtc')).toHaveLength(1);
  });

  it('a Grandma replaced by a take-over is outside the match when she comes back', () => {
    const w = world();
    const nana = w.join('Nana', '');
    const code = nana.welcome!.room;
    const ann = w.join('Ann', code);
    const bob = w.join('Bob', code);
    w.send(nana, { t: 'lobby', willingGrandma: true });
    w.send(nana, { t: 'start' });
    const room = w.mgr.rooms.get(code)!;
    expect(room.match?.grandmaId).toBe(nana.id);
    expect(w.runUntil(() => room.match?.phase === 'visit', 10)).toBe(true);
    w.mgr.onClose(nana.s); // her socket drops: the lie-down
    // Ann keeps volunteering until the match lets her take over (the match decides when).
    for (let i = 0; i < 30 && room.match?.grandmaId === nana.id; i++) {
      w.send(ann, { t: 'lobby', willingGrandma: true });
      w.run(0.5);
    }
    expect(room.match?.grandmaId).toBe(ann.id);
    const back = w.join('Nana', code, { token: nana.welcome!.token });
    expect(back.id).toBe(nana.id);
    expect(peersOf(back)).toEqual([]);
    expect(peersOf(ann)).toEqual(ids(bob));
    expect(peersOf(bob)).toEqual(ids(ann));
    // She sees the match from the lobby, not a frozen match screen.
    expect(back.conn.of('match')).toHaveLength(0);
    expect(back.conn.last('lobby')?.inProgress?.grandmaId).toBe(ann.id);
  });
});

describe('players outside the running match see it from the lobby', () => {
  it('phase, time left and the live will, refreshed every 2 s, nothing secret, and an ordinary lobby afterwards', () => {
    const w = world();
    const host = w.join('Host', '');
    const code = host.welcome!.room;
    w.send(host, { t: 'start' });
    const room = w.mgr.rooms.get(code)!;
    expect(w.runUntil(() => room.match?.phase === 'visit', 10)).toBe(true);
    const late = w.join('Late', code);
    const ip = late.conn.last('lobby')?.inProgress;
    expect(ip).toBeDefined();
    if (!ip) return;
    expect(Object.keys(ip).sort()).toEqual(['endsAt', 'grandmaId', 'names', 'phase', 'shares', 'time', 'visit']);
    expect(ip.phase).toBe('visit');
    expect(ip.visit).toBe('tea');
    expect(ip.endsAt).toBeGreaterThan(ip.time);
    expect(Object.values(ip.shares).reduce((a, b) => a + b, 0)).toBe(100);
    expect(Object.keys(ip.shares)).toContain(host.id);
    expect(Object.keys(ip.shares)).not.toContain(ip.grandmaId);
    for (const id of [...Object.keys(ip.shares), ip.grandmaId]) expect(ip.names[id]).toBeTruthy();
    expect(ip.names[host.id]).toBe('Host');
    // Participants never get it.
    expect(host.conn.of('lobby').every((m) => !m.inProgress)).toBe(true);
    // Refreshed while waiting, following the match clock.
    const n0 = late.conn.of('lobby').length;
    w.run(6.1);
    const fresh = late.conn.of('lobby').slice(n0);
    expect(fresh.length).toBeGreaterThanOrEqual(3);
    expect(fresh.at(-1)!.inProgress!.time).toBeGreaterThan(ip.time + 5);
    expect(host.conn.of('lobby').every((m) => !m.inProgress)).toBe(true);
    // Afterwards: an ordinary lobby, and the waiting player could start the next match.
    expect(w.runUntil(() => room.match === null, 120)).toBe(true);
    const after = late.conn.last('lobby')!;
    expect(after.phase).toBe('lobby');
    expect(after.inProgress).toBeUndefined();
  });

  it('S18: a client that rejoins after its match ended, or too late, is told to drop the match it still shows', () => {
    const w = world(undefined, true, 150); // visits long enough to outlast DISCONNECT.cousinRejoin
    const host = w.join('Host', '');
    const code = host.welcome!.room;
    const ann = w.join('Ann', code);
    const bob = w.join('Bob', code);
    w.send(host, { t: 'start' });
    const room = w.mgr.rooms.get(code)!;
    expect(w.runUntil(() => room.match?.phase === 'visit', 10)).toBe(true);
    // Bob blips and comes straight back: still in the match, nothing to drop.
    w.mgr.onClose(bob.s);
    const bob2 = w.join('Bob', code, { token: bob.welcome!.token });
    expect(bob2.conn.of('match')).toHaveLength(1);
    expect(lobbyEndsOurMatch(bob2.conn.last('lobby')!)).toBe(false);
    // Ann drops near the end of the visit; the match finishes while she is away; she comes back.
    expect(w.runUntil(() => !!room.match && room.match.phaseEndsAt - room.match.time < 15, 200)).toBe(true);
    w.mgr.onClose(ann.s);
    expect(w.runUntil(() => room.match === null, 60)).toBe(true);
    const ann2 = w.join('Ann', code, { token: ann.welcome!.token });
    expect(ann2.id).toBe(ann.id);
    expect(ann2.conn.of('phase')).toHaveLength(0); // no phase message tells her it is over...
    expect(lobbyEndsOurMatch(ann2.conn.last('lobby')!)).toBe(true); // ...the lobby does
    // Back too late in the next match (over DISCONNECT.cousinRejoin): a new player, outside it,
    // while the match it still shows goes on. Only `inProgress` can tell its client.
    w.send(host, { t: 'start' });
    expect(w.runUntil(() => room.match?.phase === 'visit', 10)).toBe(true);
    w.mgr.onClose(bob2.s);
    w.run(95);
    expect(room.match?.phase).toBe('visit');
    const bob3 = w.join('Bob', code, { token: bob.welcome!.token });
    expect(bob3.id).not.toBe(bob.id);
    expect(bob3.conn.last('lobby')?.phase).toBe('visit');
    expect(lobbyEndsOurMatch(bob3.conn.last('lobby')!)).toBe(true);
  });
});
