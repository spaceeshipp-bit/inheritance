// Review findings S9 (two tabs kick each other forever) and S18 (client net
// leaks) against the real client Net class over a fake link, with fake timers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION } from '../../shared/constants.js';
import { CLOSE_CODES, type MatchInProgress, type ServerMsg } from '../../shared/protocol.js';
import { BoundedQueue, Net, type Link, type LinkHandlers, type NetStatus } from '../../client/src/net.js';
import { describeInProgress, inProgressWill } from '../../client/src/hud/screens.js';

class FakeLink implements Link {
  sent: string[] = [];
  closed = false;
  constructor(readonly h: LinkHandlers) {}
  send(data: string): void { this.sent.push(data); }
  close(): void { this.closed = true; }
  hellos(): number { return this.sent.filter((s) => s.startsWith('{"t":"hello"')).length; }
  serverSays(m: ServerMsg): void { this.h.message(JSON.stringify(m)); }
  welcome(you = 'p1', token = 'tok-1'): void { this.serverSays({ t: 'welcome', you, token, room: 'ABCDE', protocol: PROTOCOL_VERSION }); }
}

function harness() {
  const links: FakeLink[] = [];
  const net = new Net((h) => {
    const l = new FakeLink(h);
    links.push(l);
    return l;
  });
  const statuses: NetStatus[] = [];
  const msgs: ServerMsg[] = [];
  net.onStatus = (s) => statuses.push(s);
  net.onMessage = (m) => msgs.push(m);
  return { net, links, statuses, msgs };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('S9: another tab took our seat', () => {
  it('closed with 4000 → status "replaced", and it never redials', () => {
    const { net, links, statuses } = harness();
    net.connect('Dot', 'ABCDE');
    links[0].h.open();
    links[0].welcome();
    expect(net.status).toBe('open');
    links[0].h.close(CLOSE_CODES.replaced);
    expect(net.status).toBe('replaced');
    expect(statuses.at(-1)).toBe('replaced');
    vi.advanceTimersByTime(120_000);
    expect(links).toHaveLength(1);
    expect(net.status).toBe('replaced');
    // Taking the seat back is an explicit connect, with the saved token.
    net.connect('Dot', 'ABCDE');
    expect(links).toHaveLength(2);
    expect(net.status).toBe('connecting');
  });

  it('an ordinary drop still redials (with back-off)', () => {
    const { net, links } = harness();
    net.connect('Dot', 'ABCDE');
    links[0].h.open();
    links[0].welcome();
    links[0].h.close(1006);
    expect(net.status).toBe('reconnecting');
    vi.advanceTimersByTime(399);
    expect(links).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(links).toHaveLength(2);
    links[1].h.open();
    expect(JSON.parse(links[1].sent[0])).toMatchObject({ t: 'hello', room: 'ABCDE' });
  });
});

describe('S18: one link at a time', () => {
  it('connect() closes the previous link and ignores everything it does afterwards', () => {
    const { net, links, msgs } = harness();
    net.connect('Dot', ''); // double click
    net.connect('Dot', '');
    expect(links).toHaveLength(2);
    expect(links[0].closed).toBe(true);
    // The orphan opens late: nothing goes out, on either link.
    links[0].h.open();
    expect(links[0].sent).toHaveLength(0);
    expect(links[1].sent).toHaveLength(0);
    links[1].h.open();
    expect(links[1].hellos()).toBe(1);
    links[1].welcome('p1');
    // Late messages and the close of the orphan change nothing and trigger no redial.
    links[0].welcome('p9', 'tok-9');
    links[0].h.close(1006);
    vi.advanceTimersByTime(30_000);
    expect(net.selfId).toBe('p1');
    expect(net.status).toBe('open');
    expect(links).toHaveLength(2);
    expect(msgs.filter((m) => m.t === 'welcome')).toHaveLength(1);
    // Leaving closes the live link and stops for good.
    net.leave();
    expect(links[1].closed).toBe(true);
    vi.advanceTimersByTime(30_000);
    expect(links).toHaveLength(2);
    expect(net.status).toBe('closed');
  });

  it('a refused hello stops reconnecting and hands the reason to the screens', () => {
    const { net, links, msgs } = harness();
    net.connect('Dot', 'ABCDE');
    links[0].h.open();
    links[0].serverSays({ t: 'error', message: 'Room ABCDE is full (8 players).', refused: true });
    expect(net.status).toBe('closed');
    expect(links[0].closed).toBe(true);
    expect(msgs.at(-1)).toMatchObject({ t: 'error', refused: true });
    links[0].h.close(CLOSE_CODES.refused);
    vi.advanceTimersByTime(60_000);
    expect(links).toHaveLength(1);
  });

  it('a server that closes with the "refused" code is not redialled either', () => {
    const { net, links } = harness();
    net.connect('Dot', 'ABCDE');
    links[0].h.open();
    links[0].h.close(CLOSE_CODES.refused);
    vi.advanceTimersByTime(60_000);
    expect(links).toHaveLength(1);
    expect(net.status).toBe('closed');
  });

  it('the queue for signals that arrive before voice is ready is bounded and keeps the oldest', () => {
    const q = new BoundedQueue<number>(200);
    for (let i = 0; i < 5000; i++) q.push(i);
    expect(q.size).toBe(200);
    const out = q.drain();
    expect(out[0]).toBe(0);
    expect(out[199]).toBe(199);
    expect(q.size).toBe(0);
    q.push(1);
    q.clear();
    expect(q.drain()).toEqual([]);
  });
});

describe('the "match in progress" lobby text', () => {
  const ip: MatchInProgress = {
    phase: 'visit', visit: 'tea', endsAt: 200, time: 67,
    shares: { a: 20, b: 45, c: 35 }, names: { a: 'Agatha', b: 'Bertie', c: 'Cal', g: 'Nana Dot (bot)' }, grandmaId: 'g',
  };

  it('says which visit, how long is left and when you play', () => {
    expect(describeInProgress(ip, 133)).toBe("A match is under way — Afternoon Tea, 2:13 left. You'll join the next one.");
    expect(describeInProgress({ ...ip, phase: 'intermission', visit: 'dinner' }, 9.2)).toBe("A match is under way — a short break before Family Dinner, 0:10 left. You'll join the next one.");
    expect(describeInProgress({ ...ip, phase: 'reading', visit: null }, 12)).toMatch(/will is being read.*join the next one/);
  });

  it('lists the will highest share first', () => {
    expect(inProgressWill(ip).map((r) => `${r.name} ${r.share}`)).toEqual(['Bertie 45', 'Cal 35', 'Agatha 20']);
  });
});
