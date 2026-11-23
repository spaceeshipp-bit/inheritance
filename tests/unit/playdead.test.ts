// Nana plays dead (G, once a visit): she drops, peeks (sharp all round to
// PLAY_DEAD.peek, nothing beyond), cannot move or rewrite the will, and gets
// up when she likes (after PLAY_DEAD.minDown) or at PLAY_DEAD.max. Whoever
// dances on her grave is Dancing on Her Grave; whoever weeps is Gone Too Soon.
import { describe, expect, it } from 'vitest';
import { PLAY_DEAD } from '../../shared/constants.js';
import { visionBand } from '../../shared/senses.js';
import { parseClientMsg } from '../../server/validate.js';
import { EventLog } from '../../server/log.js';
import { makeMatch, toVisit } from './helpers.js';
import { humanMatch, lastSnap, place, tick, yawTo } from './scenario.js';

const toasts = (box: ReturnType<typeof humanMatch>['box'], id: string) =>
  (box.events(id, 'toast') as unknown as { text: string }[]).map((e) => e.text);

describe('playing dead', () => {
  it('she drops, everyone sees it, and she cannot walk or Bless until she gets up', () => {
    const { m, box } = humanMatch();
    m.handleGrandma('g', { a: 'play-dead', on: true });
    expect(m.playingDead).toBe(true);
    expect(box.events('a', 'collapse')).toHaveLength(1);
    expect(toasts(box, 'a').some((t) => /Nana has collapsed/.test(t))).toBe(true);
    tick(m);
    expect(lastSnap(box, 'a').chars.find((c) => c.id === 'g')?.dead).toBe(true);
    // No walking.
    const g = m.chars.get('g')!;
    const at = { ...g.body.pos };
    for (let i = 0; i < 20; i++) { m.handleInput('g', { ...m.blankInput(1000 + i, g.yaw), move: { x: 0, z: 1 } }); tick(m); }
    expect(Math.hypot(g.body.pos.x - at.x, g.body.pos.z - at.z)).toBeLessThan(0.05);
    // No Blessing from beyond the grave.
    const before = m.will.shares.a;
    m.handleGrandma('g', { a: 'bless', target: 'a' });
    expect(m.will.shares.a).toBe(before);
    expect(box.events('g', 'will-rejected').pop()).toMatchObject({ reason: 'not-now' });
  });

  it('she can get up after PLAY_DEAD.minDown, and on her own at PLAY_DEAD.max; once a visit', () => {
    const { m, box } = humanMatch();
    m.handleGrandma('g', { a: 'play-dead', on: true });
    m.handleGrandma('g', { a: 'play-dead', on: false });
    expect(m.playingDead).toBe(true); // too soon
    tick(m, Math.ceil(PLAY_DEAD.minDown * 30) + 1);
    m.handleGrandma('g', { a: 'play-dead', on: false });
    expect(m.playingDead).toBe(false);
    expect(box.events('a', 'risen')).toHaveLength(1);
    expect(toasts(box, 'b').some((t) => /not dead yet/.test(t))).toBe(true);
    // Not twice in one visit.
    m.handleGrandma('g', { a: 'play-dead', on: true });
    expect(m.playingDead).toBe(false);
    expect(toasts(box, 'g').some((t) => /already died once/.test(t))).toBe(true);
  });

  it('gets up by itself at PLAY_DEAD.max', () => {
    const { m } = humanMatch();
    m.handleGrandma('g', { a: 'play-dead', on: true });
    tick(m, Math.ceil(PLAY_DEAD.max * 30) + 2);
    expect(m.playingDead).toBe(false);
    expect(m.log.events.filter((e) => e.kind === 'dead').map((e) => (e as { up: boolean }).up)).toEqual([false, true]);
  });

  it('peeking: sharp all round her, close up, and nothing further off', () => {
    const s = { pos: { x: 0, y: 0, z: 0 }, yaw: 0, aidActive: false, specsActive: false, specsOff: false, peek: true };
    expect(visionBand(s, { x: 0, y: 0, z: 3 })).toBe('sharp'); // behind her
    expect(visionBand(s, { x: 0, y: 0, z: -(PLAY_DEAD.peek + 1) })).toBe('none'); // in front, too far
    expect(visionBand({ ...s, dark: true }, { x: 0, y: 0, z: 3 })).toBe('none'); // the Storm: only by candlelight
  });

  it('a rude dance over her "body" is Dancing on Her Grave, told to her and the dancer', () => {
    const { m, box } = humanMatch();
    m.handleGrandma('g', { a: 'play-dead', on: true });
    const g = m.chars.get('g')!.body.pos;
    // Behind her head, where she could never see standing up.
    place(m, 'a', g.x - 1.5, g.z, yawTo(g.x - 1.5, g.z, g.x, g.z));
    tick(m);
    m.handleEmote('a', 'grave-stomp');
    tick(m, 40);
    const mo = m.log.moments.find((x) => x.kind === 'graveside');
    expect(mo).toMatchObject({ actor: 'a' });
    expect(mo?.text).toMatch(/over Nana's body\. She was only resting\.$/);
    expect(m.log.moments.some((x) => x.kind === 'cheek' || x.kind === 'behind-her-back')).toBe(false);
    expect((box.events('g', 'moment') as unknown as { moment: { kind: string } }[]).some((e) => e.moment.kind === 'graveside')).toBe(true);
  });

  it('a compliment at her side is Gone Too Soon (once per collapse)', () => {
    const l = new EventLog((id) => id.toUpperCase());
    l.nanaDead = true;
    l.add({ t: 1, kind: 'compliment', by: 'a', line: 'Love you, Nana!' });
    l.add({ t: 2, kind: 'compliment', by: 'a', line: 'Love you, Nana!' });
    expect(l.moments.filter((x) => x.kind === 'mourner')).toHaveLength(1);
    expect(l.moments[0].text).toBe(`A wept over Nana's body: "Love you, Nana!". She heard every word.`);
    l.nanaDead = false;
    l.add({ t: 3, kind: 'rude', by: 'b', emote: 'raspberry', at: null, atNana: false, seen: true });
    expect(l.moments.some((x) => x.kind === 'graveside')).toBe(false);
  });

  it('the visit ending gets her up (quietly), and the action is validated', () => {
    const { m } = makeMatch({ humans: ['g', 'a', 'b', 'c'], grandmaId: 'g' });
    toVisit(m);
    m.handleGrandma('g', { a: 'play-dead', on: true });
    m.phaseEndsAt = m.time;
    tick(m, 2);
    expect(m.phase).not.toBe('visit');
    expect(m.playingDead).toBe(false);
    expect(parseClientMsg({ t: 'grandma', a: 'play-dead', on: true })).toEqual({ t: 'grandma', a: 'play-dead', on: true });
    expect(parseClientMsg({ t: 'grandma', a: 'play-dead', on: 'yes' })).toBeNull();
  });
});

describe('bots and a dead Nana', () => {
  it('cousin bots nearby go to her side to weep or dance on her grave', () => {
    const { m } = makeMatch({ humans: ['g'], bots: ['a', 'b', 'c', 'd'], grandmaId: 'g', seed: 11 });
    toVisit(m);
    const g = m.chars.get('g')!.body.pos;
    ['a', 'b', 'c', 'd'].forEach((id, i) => place(m, id, g.x + 2 + i * 0.6, g.z + 1.5, 0));
    tick(m);
    m.handleGrandma('g', { a: 'play-dead', on: true });
    tick(m, 30 * 9);
    const close = m.log.events.filter((e) => (e.kind === 'rude' || e.kind === 'compliment') && e.t >= 0);
    expect(close.length).toBeGreaterThan(0);
    expect(m.log.moments.some((x) => x.kind === 'graveside' || x.kind === 'mourner')).toBe(true);
  });
});
