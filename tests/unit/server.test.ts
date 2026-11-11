// Starts the real HTTP + WebSocket server on an ephemeral port and talks to it with `ws`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { PROTOCOL_VERSION } from '../../shared/constants.js';
import type { ClientMsg, ServerMsg } from '../../shared/protocol.js';
import { startServer, type ServerHandle } from '../../server/index.js';

let server: ServerHandle;
let url = '';

beforeAll(async () => {
  server = await startServer({ port: 0, host: '127.0.0.1', fast: true, quiet: true, staticDir: '/nonexistent' });
  url = `ws://127.0.0.1:${server.port}/ws`;
});

afterAll(async () => {
  await server?.close();
});

/** A tiny test client that records everything it receives. */
class Client {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  private waiters: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];
  open: Promise<void>;
  closed = false;

  constructor(u = url) {
    this.ws = new WebSocket(u);
    this.open = new Promise((res, rej) => { this.ws.once('open', () => res()); this.ws.once('error', rej); });
    this.ws.on('message', (data) => {
      const m = JSON.parse(data.toString()) as ServerMsg;
      this.msgs.push(m);
      this.waiters = this.waiters.filter((w) => { if (w.pred(m)) { w.resolve(m); return false; } return true; });
    });
    this.ws.on('close', () => { this.closed = true; });
  }

  send(m: ClientMsg | Record<string, unknown> | string): void {
    this.ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  }

  wait<T extends ServerMsg['t']>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, ms = 5000): Promise<Extract<ServerMsg, { t: T }>> {
    const hit = this.msgs.find((m) => m.t === t && pred(m as Extract<ServerMsg, { t: T }>));
    if (hit) return Promise.resolve(hit as Extract<ServerMsg, { t: T }>);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${t}`)), ms);
      this.waiters.push({
        pred: (m) => m.t === t && pred(m as Extract<ServerMsg, { t: T }>),
        resolve: (m) => { clearTimeout(timer); resolve(m as Extract<ServerMsg, { t: T }>); },
      });
    });
  }

  next<T extends ServerMsg['t']>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, ms = 5000): Promise<Extract<ServerMsg, { t: T }>> {
    this.msgs = [];
    return this.wait(t, pred, ms);
  }

  close(): Promise<void> {
    return new Promise((res) => {
      if (this.closed) { res(); return; }
      this.ws.once('close', () => res());
      this.ws.close();
    });
  }
}

describe('game server', () => {
  it('answers /health', async () => {
    const r = await fetch(`http://127.0.0.1:${server.port}/health`);
    expect(r.status).toBe(200);
    const body = await r.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('one player: create a room, fill with bots, be Grandma, and get match, phase and snapshots', async () => {
    const c = new Client();
    await c.open;
    c.send({ t: 'hello', name: 'Dot', room: '', protocol: PROTOCOL_VERSION });
    const welcome = await c.wait('welcome');
    expect(welcome.room).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(welcome.token.length).toBeGreaterThan(10);
    const lobby = await c.wait('lobby');
    expect(lobby.hostId).toBe(welcome.you);
    expect(lobby.phase).toBe('lobby');
    c.send({ t: 'lobby', willingGrandma: true, options: { fillBots: true } });
    await c.wait('lobby', (m) => m.players.some((p) => p.id === welcome.you && p.willingGrandma));
    c.send({ t: 'start' });
    const match = await c.wait('match');
    expect(match.role).toBe('grandma');
    expect(match.grandmaId).toBe(welcome.you);
    expect(match.cousins.length).toBe(4);
    expect(match.prefCards?.length).toBe(2);
    const phase = await c.wait('phase');
    expect(phase.phase).toBe('roles');
    const snap = await c.wait('snap');
    expect(snap.chars.length).toBe(5);
    expect(snap.props.filter((p) => p.favourite).length).toBe(1);
    expect(Object.values(snap.shares).reduce((a, b) => a + b, 0)).toBe(100);
    // Bots appear in the lobby list while the match runs.
    const l2 = await c.wait('lobby', (m) => m.players.length === 5);
    expect(l2.players.filter((p) => p.isBot).length).toBe(4);
    // Clock sync.
    c.send({ t: 'ping', ts: 123 });
    const pong = await c.wait('pong');
    expect(pong.ts).toBe(123);
    // The first visit begins after the (fast) role reveal.
    const visit = await c.wait('phase', (m) => m.phase === 'visit', 6000);
    expect(visit.visit).toBe('tea');
    expect(visit.endsAt).toBeGreaterThan(visit.time);
    // Grandma can Bless a cousin.
    c.send({ t: 'grandma', a: 'bless', target: match.cousins[0].id });
    const will = await c.wait('ev', (m) => m.e === 'will');
    expect(will).toMatchObject({ target: match.cousins[0].id, moved: 5, via: 'bless' });
    await c.close();
  }, 15000);

  it('a cousin with a bot Grandma; second player joins by code; RTC relay and peers', async () => {
    const a = new Client();
    await a.open;
    a.send({ t: 'hello', name: 'Ann', room: '', protocol: PROTOCOL_VERSION });
    const wa = await a.wait('welcome');
    const b = new Client();
    await b.open;
    b.send({ t: 'hello', name: 'Ann', room: wa.room.toLowerCase(), protocol: PROTOCOL_VERSION });
    const wb = await b.wait('welcome');
    expect(wb.room).toBe(wa.room);
    const lobby = await b.wait('lobby', (m) => m.players.length === 2);
    expect(new Set(lobby.players.map((p) => p.name)).size).toBe(2); // names made unique
    const peersA = await a.wait('peers', (m) => m.ids.includes(wb.you));
    expect(peersA.ids).toEqual([wb.you]);
    // RTC signalling relayed to the named peer only.
    a.send({ t: 'rtc', to: wb.you, data: { type: 'offer', sdp: 'v=0 fake' } });
    const rtc = await b.wait('rtc');
    expect(rtc).toMatchObject({ from: wa.you, data: { type: 'offer', sdp: 'v=0 fake' } });
    // Only the host can start; nobody willing → bot Grandma.
    b.send({ t: 'start' });
    expect((await b.wait('error')).message).toMatch(/host/i);
    a.send({ t: 'start' });
    const ma = await a.wait('match');
    expect(ma.role).toBe('cousin');
    expect(ma.prefCards).toBeUndefined();
    expect(ma.cousins.length).toBe(4);
    expect(ma.names[ma.grandmaId]).toMatch(/bot/i);
    const snap = await a.wait('snap');
    expect(snap.props.some((p) => 'favourite' in p)).toBe(false);
    // Rejoin with the token after a drop: same player, back in the match.
    await b.close();
    const lobbyAfter = await a.wait('lobby', (m) => m.players.some((p) => p.id === wb.you && !p.connected));
    expect(lobbyAfter).toBeDefined();
    const b2 = new Client();
    await b2.open;
    b2.send({ t: 'hello', name: 'whatever', room: wa.room, protocol: PROTOCOL_VERSION, token: wb.token });
    const wb2 = await b2.wait('welcome');
    expect(wb2.you).toBe(wb.you);
    const mb2 = await b2.wait('match');
    expect(mb2.role).toBe('cousin');
    await b2.wait('snap');
    await a.close();
    await b2.close();
  }, 15000);

  it('refuses to start without a Grandma volunteer or enough players when bots are off', async () => {
    const c = new Client();
    await c.open;
    c.send({ t: 'hello', name: 'Solo', room: '', protocol: PROTOCOL_VERSION });
    await c.wait('welcome');
    c.send({ t: 'lobby', options: { fillBots: false } });
    await c.wait('lobby', (m) => !m.options.fillBots);
    c.send({ t: 'start' });
    expect((await c.wait('error')).message).toMatch(/willing/i);
    c.send({ t: 'lobby', willingGrandma: true });
    await c.wait('lobby', (m) => m.players[0].willingGrandma);
    c.msgs = [];
    c.send({ t: 'start' });
    expect((await c.wait('error')).message).toMatch(/at least 5/i);
    await c.close();
  });

  it('survives garbage and rejects bad hellos', async () => {
    const c = new Client();
    await c.open;
    c.send('not json');
    c.send(JSON.stringify({ t: 'input', seq: 'x' }));
    c.send(JSON.stringify({ t: 'grandma', a: 'set', target: 5, value: 'all' }));
    c.send({ t: 'start' });
    expect((await c.wait('error', (m) => /hello/i.test(m.message))).message).toMatch(/hello/i);
    c.send({ t: 'hello', name: 'X', room: 'IIIII', protocol: PROTOCOL_VERSION });
    expect((await c.wait('error', (m) => /room code/i.test(m.message))).message).toMatch(/room code/i);
    c.send({ t: 'hello', name: 'X', room: '', protocol: 999 });
    expect((await c.wait('error', (m) => /version/i.test(m.message))).message).toMatch(/version/i);
    c.send({ t: 'hello', name: '\u0000‮  Evil\nName  that is far too long for a name', room: '', protocol: PROTOCOL_VERSION });
    const w = await c.wait('welcome');
    const lobby = await c.wait('lobby');
    const me = lobby.players.find((p) => p.id === w.you)!;
    expect(me.name.length).toBeLessThanOrEqual(16);
    expect(me.name).not.toMatch(/[\u0000-\u001f‮]/);
    // Still alive.
    const r = await fetch(`http://127.0.0.1:${server.port}/health`);
    expect(r.status).toBe(200);
    await c.close();
  });
});
