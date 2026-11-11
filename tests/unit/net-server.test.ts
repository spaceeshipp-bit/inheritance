// Review findings S7, S3, S9, S18 and S20 against the real HTTP + WebSocket
// server (startServer on a random port 40000-49999), with `ws` clients and the
// real client Net class over real sockets.
import type { IncomingMessage } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { PROTOCOL_VERSION } from '../../shared/constants.js';
import { CLOSE_CODES, type ServerMsg } from '../../shared/protocol.js';
import { Net, type LinkFactory } from '../../client/src/net.js';
import { startServer, type ServerHandle, type ServerOptions } from '../../server/index.js';
import { addressKey, clientAddress, trustProxyHops } from '../../server/limits.js';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function start(opts: ServerOptions = {}): Promise<ServerHandle> {
  for (let i = 0; i < 20; i++) {
    const port = 40000 + Math.floor(Math.random() * 10000);
    try {
      return await startServer({ port, host: '127.0.0.1', quiet: true, fast: true, staticDir: '/nonexistent', ...opts });
    } catch { /* port taken: try another */ }
  }
  throw new Error('no free port in 40000-49999');
}

async function until(pred: () => boolean, ms = 5000, what = 'condition'): Promise<void> {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(20);
  }
}

/** A recording test client; `from` sends that address in X-Forwarded-For after a forged one. */
class Client {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  open: Promise<void>;
  closeCode = 0;
  closed = false;
  constructor(url: string, from?: string) {
    this.ws = new WebSocket(url, from ? { headers: { 'x-forwarded-for': `10.66.66.66, ${from}` } } : undefined);
    this.open = new Promise((res, rej) => { this.ws.once('open', () => res()); this.ws.once('error', rej); });
    this.ws.on('message', (d) => { this.msgs.push(JSON.parse(d.toString()) as ServerMsg); });
    this.ws.on('close', (code) => { this.closed = true; this.closeCode = code; });
    this.ws.on('error', () => { /* close follows */ });
  }
  send(m: object): void { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  hello(name: string, room: unknown = ''): void { this.send({ t: 'hello', name, room, protocol: PROTOCOL_VERSION }); }
  of<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[] { return this.msgs.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[]; }
  async welcome(): Promise<Extract<ServerMsg, { t: 'welcome' }>> {
    await until(() => this.of('welcome').length > 0 || this.closed, 5000, 'welcome');
    const w = this.of('welcome')[0];
    if (!w) throw new Error(`no welcome: ${JSON.stringify(this.msgs.slice(-3))}`);
    return w;
  }
}

const shut = (cs: Client[]): void => { for (const c of cs) c.ws.terminate(); };

describe('S7 on the wire: per-address sockets and the hello timeout', () => {
  it('8 sockets per address (X-Forwarded-For only from a trusted proxy hop); others and loopback are unaffected', async () => {
    const srv = await start({ trustProxy: 1 });
    const url = `ws://127.0.0.1:${srv.port}/ws`;
    const all: Client[] = [];
    try {
      const mine: Client[] = [];
      for (let i = 0; i < 8; i++) {
        const c = new Client(url, '203.0.113.7');
        all.push(c);
        await c.open;
        mine.push(c);
      }
      const ninth = new Client(url, '203.0.113.7');
      all.push(ninth);
      await ninth.open;
      await until(() => ninth.closed, 3000, 'the ninth socket to be refused');
      expect(ninth.closeCode).toBe(CLOSE_CODES.refused);
      expect(ninth.of('error')[0]).toMatchObject({ refused: true, message: expect.stringMatching(/too many connections/i) });
      // The first eight work normally.
      mine[0].hello('Ann');
      expect((await mine[0].welcome()).you).toBeTruthy();
      // The forged left-hand X-Forwarded-For entry was ignored: another real address is fine...
      const other = new Client(url, '198.51.100.4');
      all.push(other);
      await other.open;
      other.hello('Bob');
      await other.welcome();
      // ...a closed socket frees its slot...
      mine[7].ws.close();
      await until(() => mine[7].closed, 3000, 'close');
      await sleep(50);
      const again = new Client(url, '203.0.113.7');
      all.push(again);
      await again.open;
      again.hello('Cal');
      await again.welcome();
      // ...and loopback without a proxy header is exempt.
      const local: Client[] = [];
      for (let i = 0; i < 10; i++) { const c = new Client(url); all.push(c); local.push(c); await c.open; }
      local[9].hello('Dot');
      await local[9].welcome();
      expect(local.every((c) => !c.closed)).toBe(true);
    } finally {
      shut(all);
      await srv.close();
    }
  }, 20000);

  it('without TRUST_PROXY the X-Forwarded-For header is not believed', async () => {
    const srv = await start();
    const url = `ws://127.0.0.1:${srv.port}/ws`;
    const all: Client[] = [];
    try {
      for (let i = 0; i < 10; i++) { const c = new Client(url, '203.0.113.7'); all.push(c); await c.open; }
      await sleep(200);
      expect(all.every((c) => !c.closed)).toBe(true);
    } finally {
      shut(all);
      await srv.close();
    }
  });

  it('a socket that never says hello is closed (the first ping does not count)', async () => {
    const srv = await start({ limits: { helloTimeout: 1 } });
    const url = `ws://127.0.0.1:${srv.port}/ws`;
    const silent = new Client(url), pinger = new Client(url), player = new Client(url);
    try {
      await Promise.all([silent.open, pinger.open, player.open]);
      pinger.send({ t: 'ping', ts: 1 });
      player.hello('Ann');
      await player.welcome();
      await until(() => silent.closed && pinger.closed, 4000, 'idle sockets to close');
      expect(silent.closeCode).toBe(CLOSE_CODES.refused);
      expect(pinger.closeCode).toBe(CLOSE_CODES.refused);
      expect(silent.of('error')[0]).toMatchObject({ refused: true });
      expect(player.closed).toBe(false);
    } finally {
      shut([silent, pinger, player]);
      await srv.close();
    }
  });

  it('address keys: IPv4-mapped IPv6, IPv6 per /64, loopback exempt; TRUST_PROXY parsing', () => {
    expect(addressKey('203.0.113.7')).toBe('203.0.113.7');
    expect(addressKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(addressKey('127.0.0.1')).toBe('');
    expect(addressKey('::1')).toBe('');
    expect(addressKey('::ffff:127.0.0.1')).toBe('');
    expect(addressKey('2001:db8:1:2::5')).toBe('2001:db8:1:2::/64');
    expect(addressKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
    expect(addressKey('2001:0db8:0001:0002:0:0:0:1')).toBe('2001:db8:1:2::/64');
    expect(addressKey('2001::3:4:5:6:7:8')).toBe('2001:0:3:4::/64');
    expect(addressKey('2001:db8:1:3::5')).not.toBe(addressKey('2001:db8:1:2::5'));
    const req = (remote: string, xff?: string): IncomingMessage =>
      ({ socket: { remoteAddress: remote }, headers: xff ? { 'x-forwarded-for': xff } : {} }) as unknown as IncomingMessage;
    expect(clientAddress(req('198.51.100.1', '1.2.3.4'), 0)).toBe('198.51.100.1');
    expect(clientAddress(req('127.0.0.1', '1.2.3.4, 203.0.113.9'), 1)).toBe('203.0.113.9');
    expect(clientAddress(req('127.0.0.1', '1.2.3.4, 203.0.113.9, 10.0.0.2'), 2)).toBe('203.0.113.9');
    expect(clientAddress(req('198.51.100.1', 'not-an-ip'), 1)).toBe('198.51.100.1');
    expect(clientAddress(req('127.0.0.1'), 1)).toBe('');
    expect([trustProxyHops(undefined), trustProxyHops('0'), trustProxyHops('1'), trustProxyHops('true'), trustProxyHops('3'), trustProxyHops('x')]).toEqual([0, 0, 1, 1, 3, 0]);
  });
});

describe('S3 on the wire: a reader that falls behind', () => {
  it('is dropped once a megabyte is queued for it, whatever the messages are (not 15-30 s later by the heartbeat)', async () => {
    // Relay limits opened up so one sender can build the backlog quickly; the cut-off is the default 1 MB.
    const srv = await start({
      limits: {
        rtcBurst: 1e9, rtcPerSec: 1e9, rtcCharsBurst: 1e12, rtcCharsPerSec: 1e12,
        frameBurst: 1e9, framesPerSec: 1e9, frameBytesBurst: 1e12, frameBytesPerSec: 1e12,
      },
    });
    const url = `ws://127.0.0.1:${srv.port}/ws`;
    const a = new Client(url), b = new Client(url);
    try {
      await Promise.all([a.open, b.open]);
      a.hello('Ann');
      const wa = await a.welcome();
      b.hello('Bob', wa.room);
      const wb = await b.welcome();
      (b.ws as unknown as { _socket: { pause(): void } })._socket.pause(); // Bob stops reading
      const room = srv.rooms.rooms.get(wa.room)!;
      const offer = JSON.stringify({ t: 'rtc', to: wb.you, data: { type: 'offer', sdp: 'v=0\r\n' + 'a'.repeat(16000) } });
      const t0 = Date.now();
      let sent = 0;
      while (room.players.get(wb.you)?.conn && Date.now() - t0 < 8000) {
        for (let i = 0; i < 40; i++) { a.ws.send(offer); sent++; }
        await sleep(5);
      }
      expect(room.players.get(wb.you)?.conn ?? null).toBeNull();
      expect(Date.now() - t0).toBeLessThan(8000);
      expect(sent).toBeGreaterThan(64); // it took more than a megabyte to get there
      // The sender is fine, and Bob's seat waits for him to rejoin with his token.
      expect(a.closed).toBe(false);
      expect(room.players.has(wb.you)).toBe(true);
    } finally {
      shut([a, b]);
      await srv.close();
    }
  }, 15000);
});

describe('the client Net class over a real server', () => {
  let srv: ServerHandle;
  let url = '';
  const store = new Map<string, string>();
  const g = globalThis as unknown as { sessionStorage?: Storage };

  beforeAll(async () => {
    srv = await start();
    url = `ws://127.0.0.1:${srv.port}/ws`;
    // Both "tabs" share one sessionStorage, as Chrome's Duplicate Tab does.
    g.sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    } as unknown as Storage;
  });
  afterAll(async () => {
    delete g.sessionStorage;
    await srv?.close();
  });

  const link = (sockets: WebSocket[], closes: number[]): LinkFactory => (h) => {
    const ws = new WebSocket(url);
    sockets.push(ws);
    ws.on('open', () => h.open());
    ws.on('message', (d) => h.message(d.toString()));
    ws.on('close', (code) => { closes.push(code); h.close(code); });
    ws.on('error', () => { /* close follows */ });
    return { send: (s) => { if (ws.readyState === WebSocket.OPEN) ws.send(s); }, close: () => ws.close() };
  };

  it('S9: two tabs with the same token do not kick each other forever', async () => {
    const friend = new Client(url);
    await friend.open;
    friend.hello('Friend');
    const wf = await friend.welcome();
    const s1: WebSocket[] = [], s2: WebSocket[] = [], c1: number[] = [], c2: number[] = [];
    const tab1 = new Net(link(s1, c1)), tab2 = new Net(link(s2, c2));
    try {
      tab1.connect('Dot', wf.room);
      await until(() => tab1.status === 'open', 5000, 'tab 1');
      tab2.connect('Dot', wf.room); // the duplicated tab: same sessionStorage, same token
      await until(() => tab2.status === 'open' && tab1.status === 'replaced', 5000, 'tab 2 to take the seat');
      expect(tab2.selfId).toBe(tab1.selfId);
      await sleep(2500);
      expect(c1).toEqual([CLOSE_CODES.replaced]);
      expect(s1).toHaveLength(1);
      expect(s2).toHaveLength(1);
      expect(tab1.status).toBe('replaced');
      expect(tab2.status).toBe('open');
      // "Play here instead" in tab 1: now tab 2 is the one told, once.
      tab1.connect('Dot', wf.room);
      await until(() => tab1.status === 'open' && tab2.status === 'replaced', 5000, 'tab 1 to take it back');
      await sleep(1500);
      expect(c2).toEqual([CLOSE_CODES.replaced]);
      expect(s1).toHaveLength(2);
      expect(s2).toHaveLength(1);
    } finally {
      tab1.leave();
      tab2.leave();
      friend.ws.terminate();
    }
  }, 20000);

  it('S18: a double connect leaves exactly one socket and one player', async () => {
    const sockets: WebSocket[] = [], closes: number[] = [];
    const net = new Net(link(sockets, closes));
    const roomsBefore = new Set(srv.rooms.rooms.keys());
    try {
      net.connect('Dot', '');
      net.connect('Dot', '');
      await until(() => net.status === 'open', 5000, 'welcome');
      await sleep(300);
      expect(sockets).toHaveLength(2);
      expect(sockets.filter((ws) => ws.readyState === WebSocket.OPEN)).toHaveLength(1);
      const mine = [...srv.rooms.rooms.values()].filter((r) => !roomsBefore.has(r.code));
      expect(mine).toHaveLength(1);
      expect(mine[0].connectedHumans()).toHaveLength(1);
      net.leave();
      await until(() => sockets.every((ws) => ws.readyState === WebSocket.CLOSED), 3000, 'sockets to close');
      expect(mine[0].connectedHumans()).toHaveLength(0);
    } finally {
      net.leave();
    }
  });

  it('S20: a hello with a numeric room is an error and makes no room; "(bot)" is stripped from names', async () => {
    const c = new Client(url);
    try {
      await c.open;
      const before = srv.rooms.rooms.size;
      c.hello('H', 12345);
      await until(() => c.of('error').length > 0, 3000, 'error');
      expect(c.of('welcome')).toHaveLength(0);
      expect(srv.rooms.rooms.size).toBe(before);
      c.hello('Agatha (bot)');
      const w = await c.welcome();
      await until(() => c.of('lobby').length > 0, 3000, 'lobby');
      expect(c.of('lobby').at(-1)!.players.find((p) => p.id === w.you)?.name).toBe('Agatha');
    } finally {
      c.ws.terminate();
    }
  });
});
