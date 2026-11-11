// The simulated network in the real game: the client's `?netsim=` link and the
// server's INHERITANCE_NETSIM option delay traffic in order, both ways.
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { PROTOCOL_VERSION } from '../../shared/constants.js';
import type { ServerMsg } from '../../shared/protocol.js';
import { simulatedLink, type LinkHandlers } from '../../client/src/net.js';
import { startServer } from '../../server/index.js';

describe('client ?netsim= link', () => {
  afterEach(() => { vi.useRealTimers(); });

  function rig(cfg = { rtt: 0.2, jitter: 0.03, loss: 0 }) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] });
    const sent: string[] = [], got: string[] = [];
    let server!: LinkHandlers;
    let innerClosed = false;
    const link = simulatedLink((h) => {
      server = h;
      return { send: (d) => { sent.push(d); }, close: () => { innerClosed = true; } };
    }, cfg)({ open: () => got.push('open'), message: (d) => got.push(d), close: () => got.push('close') });
    return { link, sent, got, server: () => server, innerClosed: () => innerClosed };
  }

  it('delays both ways by about half the round trip, in order', () => {
    const r = rig();
    r.link.send('first');
    vi.advanceTimersByTime(60);
    expect(r.sent).toEqual([]);
    vi.advanceTimersByTime(80);
    expect(r.sent).toEqual(['first']);
    for (let i = 0; i < 40; i++) {
      r.link.send(`u${i}`);
      r.server().message(`d${i}`);
      vi.advanceTimersByTime(7);
    }
    vi.advanceTimersByTime(500);
    expect(r.sent).toEqual(['first', ...Array.from({ length: 40 }, (_, i) => `u${i}`)]);
    expect(r.got).toEqual(Array.from({ length: 40 }, (_, i) => `d${i}`));
  });

  it('a close from the server comes after the messages before it; closing our end drops what is in flight', () => {
    const r = rig();
    r.server().message('last words');
    r.server().close(1000);
    vi.advanceTimersByTime(1000);
    expect(r.got).toEqual(['last words', 'close']);
    r.link.send('never');
    r.server().message('never either');
    r.link.close();
    vi.advanceTimersByTime(1000);
    expect(r.sent).toEqual([]);
    expect(r.got).toEqual(['last words', 'close']);
    expect(r.innerClosed()).toBe(true);
  });
});

describe('server INHERITANCE_NETSIM', () => {
  it('a hello is answered a round trip later', async () => {
    const server = await startServer({ port: 0, host: '127.0.0.1', fast: true, quiet: true, staticDir: '/nonexistent', netsim: { rtt: 0.3, jitter: 0, loss: 0 } });
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
      await new Promise((ok, fail) => { ws.once('open', ok); ws.once('error', fail); });
      const sentAt = performance.now();
      const welcome = new Promise<number>((ok) => ws.on('message', (d) => {
        const m = JSON.parse(String(d)) as ServerMsg;
        if (m.t === 'welcome') ok(performance.now() - sentAt);
      }));
      ws.send(JSON.stringify({ t: 'hello', name: 'Ada', room: '', protocol: PROTOCOL_VERSION }));
      const ms = await welcome;
      expect(ms).toBeGreaterThanOrEqual(290);
      expect(ms).toBeLessThan(1500);
      ws.close();
    } finally {
      await server.close();
    }
  });
});
