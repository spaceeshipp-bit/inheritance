// Practice rounds (shared/practice.ts): the host plays the role they asked
// for against bots, and the server ticks the checklist off from what they
// really did (it alone can see), then wraps the visit up.
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../../shared/constants.js';
import { PRACTICE } from '../../shared/practice.js';
import type { ServerMsg } from '../../shared/protocol.js';
import { parseClientMsg } from '../../server/validate.js';
import { RoomManager, type Conn } from '../../server/room.js';
import { makeMatch, toVisit } from './helpers.js';
import { place, tick, yawTo } from './scenario.js';

const pos = { x: 0, y: 0, z: 0 };
const practiceEvents = (box: ReturnType<typeof makeMatch>['box'], id: string) =>
  box.events(id, 'practice') as unknown as { done: string[]; all: boolean }[];

describe('practice as a cousin', () => {
  it('ticks off each step from what the player really did, and nobody else', () => {
    const { m, box } = makeMatch({ humans: ['a'], bots: ['g', 'b', 'c'], grandmaId: 'g', options: { practice: 'cousin' } });
    toVisit(m);
    expect(m.practice).toMatchObject({ role: 'cousin', who: 'a' });
    // Someone else's crime counts for nothing.
    m.log.add({ t: m.time, kind: 'steal', by: 'b', item: 'item-x', owner: 'c', pos, seen: false });
    expect(practiceEvents(box, 'a')).toHaveLength(0);
    // A compliment she hears clearly.
    const g = m.chars.get('g')!.body.pos;
    place(m, 'a', g.x + 1.2, g.z, yawTo(g.x + 1.2, g.z, g.x, g.z));
    m.handleQuick('a', 0);
    expect(practiceEvents(box, 'a').pop()).toMatchObject({ done: ['compliment'], all: false });
    m.log.add({ t: m.time, kind: 'steal', by: 'a', item: 'item-b', owner: 'b', pos, seen: false });
    m.log.add({ t: m.time, kind: 'plant', by: 'a', item: 'item-b', owner: 'b', pos, seen: false });
    m.log.add({ t: m.time, kind: 'break', by: 'a', heirloom: 'heirloom-vase', favourite: false, pos, seen: false });
    expect(practiceEvents(box, 'a').pop()?.all).toBe(false);
    const ends = m.phaseEndsAt;
    m.log.add({ t: m.time, kind: 'rude', by: 'a', emote: 'raspberry', at: 'g', atNana: true, seen: false });
    expect(practiceEvents(box, 'a').pop()).toMatchObject({ all: true });
    expect((box.events('a', 'toast') as unknown as { text: string }[]).some((e) => /Practice complete/.test(e.text))).toBe(true);
    expect(m.phaseEndsAt).toBeLessThan(ends);
    expect(m.phaseEndsAt - m.time).toBeLessThanOrEqual(8);
  });
});

describe('practice as Grandma', () => {
  it('spectacles, hearing aid, Bless, Tut and the parchment', () => {
    const { m, box } = makeMatch({ humans: ['g'], bots: ['a', 'b', 'c'], grandmaId: 'g', options: { practice: 'grandma' } });
    toVisit(m);
    const nana = m.chars.get('g')!;
    nana.specsT = 2;
    tick(m);
    nana.aidT = 2;
    tick(m);
    m.handleGrandma('g', { a: 'bless', target: 'a' });
    m.handleGrandma('g', { a: 'tut', target: 'b' });
    m.handleGrandma('g', { a: 'parchment', open: true });
    m.handleGrandma('g', { a: 'set', target: 'c', value: (m.will.shares.c ?? 0) + 2 });
    const last = practiceEvents(box, 'g').pop();
    expect(new Set(last?.done)).toEqual(new Set(PRACTICE.grandma.steps.map((s) => s.id)));
    expect(last?.all).toBe(true);
  });
});

describe('the practice option', () => {
  it('is validated', () => {
    expect(parseClientMsg({ t: 'lobby', options: { practice: 'cousin' } })).toEqual({ t: 'lobby', options: { practice: 'cousin' } });
    expect(parseClientMsg({ t: 'lobby', options: { practice: 'nana' } })).toEqual({ t: 'lobby', options: {} });
  });

  it('the room makes the host the role they practise, whoever is willing, and fills the rest with bots', () => {
    const start = (practice: 'cousin' | 'grandma', willing: boolean) => {
      let now = 1000;
      const mgr = new RoomManager({ now: () => now, fast: true, seed: 3 });
      const sent: ServerMsg[] = [];
      const conn: Conn = { send: (d) => { sent.push(JSON.parse(d) as ServerMsg); }, close: () => {} };
      const s = mgr.connect(conn, '');
      const send = (msg: object) => mgr.onRaw(s, JSON.stringify(msg));
      send({ t: 'hello', name: 'Pat', room: '', protocol: PROTOCOL_VERSION });
      const me = (sent.find((x) => x.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>).you;
      send({ t: 'lobby', willingGrandma: willing, options: { practice, fillBots: false } });
      now += 1;
      send({ t: 'start' });
      return { me, match: [...mgr.rooms.values()][0].match };
    };
    const asCousin = start('cousin', true);
    expect(asCousin.match?.grandmaId).not.toBe(asCousin.me);
    expect(asCousin.match?.practice).toMatchObject({ role: 'cousin', who: asCousin.me });
    expect(asCousin.match?.chars.size).toBeGreaterThanOrEqual(4);
    const asNana = start('grandma', false);
    expect(asNana.match?.grandmaId).toBe(asNana.me);
    expect(asNana.match?.practice).toMatchObject({ role: 'grandma', who: asNana.me });
  });
});
