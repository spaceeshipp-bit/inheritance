// Gestures and dances (shared/emotes.ts): who may do what, what ends them, who
// is told, what Nana perceives of them, and what they leave behind: Behind Her
// Back and The Cheek of It moments, flattery, her reasons and the replays.
import { describe, expect, it } from 'vitest';
import { EMOTE, EMOTES, emotesFor } from '../../shared/emotes.js';
import { EventLog } from '../../server/log.js';
import { parseClientMsg } from '../../server/validate.js';
import { HUMANS, humanMatch, lastSnap, place, press, tick, yawTo } from './scenario.js';
import { makeMatch, stepUntil } from './helpers.js';

const events = (box: ReturnType<typeof humanMatch>['box'], id: string, e: string) => box.events(id, e) as unknown as Record<string, unknown>[];

describe('the emote wheels', () => {
  it('give cousins eight gestures and six dances, Nana six and three, all with words for every use', () => {
    expect(emotesFor('cousin', 'gesture')).toHaveLength(8);
    expect(emotesFor('cousin', 'dance')).toHaveLength(6);
    expect(emotesFor('grandma', 'gesture')).toHaveLength(6);
    expect(emotesFor('grandma', 'dance')).toHaveLength(3);
    for (const d of Object.values(EMOTES)) {
      for (const s of [d.name, d.pop, d.does, d.did, d.saw]) expect(s.length).toBeGreaterThan(0);
      expect(d.secs).toBeGreaterThan(1);
    }
  });

  it('the server accepts only known emotes', () => {
    expect(parseClientMsg({ t: 'emote', id: 'raspberry' })).toEqual({ t: 'emote', id: 'raspberry' });
    expect(parseClientMsg({ t: 'emote', id: 'toString' })).toBeNull();
    expect(parseClientMsg({ t: 'emote', id: 42 })).toBeNull();
  });
});

describe('playing an emote', () => {
  it('shows in everyone\'s snapshot with its clock, and ends on its own', () => {
    const { m, box } = humanMatch();
    m.handleEmote('a', 'will-jig');
    tick(m, 15);
    const s = lastSnap(box, 'b').chars.find((c) => c.id === 'a')!;
    expect(s.emote).toBe('will-jig');
    expect(s.emoteT).toBeGreaterThan(0.2);
    tick(m, Math.round(EMOTES['will-jig'].secs * 30));
    expect(m.chars.get('a')!.emote).toBeNull();
  });

  it('moving, shoving or picking something up ends it at once', () => {
    const { m } = humanMatch();
    m.handleEmote('a', 'grave-stomp');
    tick(m, 5);
    press(m, 'a', { move: { x: 0, z: 1 } });
    tick(m);
    expect(m.chars.get('a')!.emote).toBeNull();
    m.chars.get('a')!.emoteCd = 0;
    m.handleEmote('a', 'gold-digger');
    tick(m);
    press(m, 'a', { shove: true });
    tick(m);
    expect(m.chars.get('a')!.emote).toBeNull();
  });

  it('only your own role\'s emotes, not with your hands full, not between visits\' end and the reading, not too fast', () => {
    const { m, box } = humanMatch();
    m.handleEmote('a', 'charleston'); // Nana's
    expect(m.chars.get('a')!.emote).toBeNull();
    m.handleEmote('g', 'raspberry'); // a cousin's
    expect(m.chars.get('g')!.emote).toBeNull();
    m.chars.get('b')!.holding = 'teacup';
    m.handleEmote('b', 'heart-hands');
    expect(m.chars.get('b')!.emote).toBeNull();
    expect(events(box, 'b', 'toast').some((t) => t.text === 'Your hands are full.')).toBe(true);
    m.handleEmote('c', 'heart-hands');
    expect(m.chars.get('c')!.emote?.id).toBe('heart-hands');
    m.handleEmote('c', 'raspberry'); // within the cooldown
    expect(m.chars.get('c')!.emote?.id).toBe('heart-hands');
    tick(m, Math.ceil(EMOTE.cooldown * 30) + 1);
    m.handleEmote('c', 'raspberry');
    expect(m.chars.get('c')!.emote?.id).toBe('raspberry');
    m.phase = 'reading';
    m.handleEmote('d', 'will-jig');
    expect(m.chars.get('d')!.emote).toBeNull();
  });
});

describe('what Nana makes of it', () => {
  it('a raspberry behind her back: logged unseen, a Behind Her Back moment the culprit hears of and she does not', () => {
    const { m, box } = humanMatch();
    place(m, 'g', -5, 1.6, -Math.PI / 2); // facing east
    place(m, 'a', -7, 1.6, yawTo(-7, 1.6, -5, 1.6)); // behind her, facing her
    m.handleEmote('a', 'raspberry');
    tick(m, 20);
    const ev = m.log.events.find((e) => e.kind === 'rude');
    expect(ev).toMatchObject({ kind: 'rude', by: 'a', emote: 'raspberry', at: 'g', atNana: true, seen: false });
    const mo = m.log.moments.find((x) => x.kind === 'behind-her-back');
    expect(mo?.text).toBe("A blew a raspberry behind Nana's back.");
    expect(events(box, 'a', 'moment').length).toBe(1);
    expect(events(box, 'g', 'moment').length).toBe(0);
    expect(events(box, 'g', 'gesture').length).toBe(0);
  });

  it('the bird to her face, up close: she is told who, and it is The Cheek of It', () => {
    const { m, box } = humanMatch();
    place(m, 'g', -5, 1.6, -Math.PI / 2);
    place(m, 'a', -3.5, 1.6, yawTo(-3.5, 1.6, -5, 1.6)); // in front of her, 1.5 m (sharp without her specs), facing her
    m.handleEmote('a', 'the-bird');
    tick(m, 20);
    expect(m.log.events.find((e) => e.kind === 'rude')).toMatchObject({ seen: true, sharp: true, atNana: true });
    expect(events(box, 'g', 'gesture')[0]).toMatchObject({ by: 'a', emote: 'the-bird', at: 'g' });
    expect(m.log.moments.find((x) => x.kind === 'cheek')?.text).toBe('A gave her the bird right in front of Nana.');
    expect(events(box, 'g', 'moment').length).toBe(1);
    // ...and if she tuts him for it, that is her reason.
    m.handleGrandma('g', { a: 'tut', target: 'a' });
    expect(m.log.reasons().find((r) => r.target === 'a')).toMatchObject({ why: 'saw A make a very rude gesture', truth: null });
  });

  it('heart hands she clearly sees, close and aimed at her, count as flattery; out of her sight they do not', () => {
    const { m } = humanMatch();
    place(m, 'g', -5, 1.6, -Math.PI / 2);
    place(m, 'a', -2, 1.6, yawTo(-2, 1.6, -5, 1.6));
    place(m, 'b', -7, 1.6, yawTo(-7, 1.6, -5, 1.6)); // behind her
    m.handleEmote('a', 'heart-hands');
    m.handleEmote('b', 'heart-hands');
    tick(m, 20);
    const sweet = m.log.events.filter((e) => e.kind === 'compliment');
    expect(sweet.map((e) => e.kind === 'compliment' && e.by)).toEqual(['a']);
    expect(m.log.events.some((e) => e.kind === 'rude')).toBe(false);
  });

  it('aimed at a cousin, that cousin is told; Nana\'s own gestures tell whoever she aims them at', () => {
    const { m, box } = humanMatch();
    place(m, 'a', 0, 4.5, yawTo(0, 4.5, 2, 4.5));
    place(m, 'b', 2, 4.5, 0);
    m.handleEmote('a', 'nose-thumb');
    tick(m, 20);
    expect(events(box, 'b', 'gesture')[0]).toMatchObject({ by: 'a', emote: 'nose-thumb', at: 'b' });
    expect(m.log.events.find((e) => e.kind === 'rude')).toMatchObject({ at: 'b', atNana: false });
    place(m, 'g', -2, 4.5, yawTo(-2, 4.5, 0, 4.5));
    m.handleEmote('g', 'watching-you');
    tick(m, 20);
    expect(events(box, 'a', 'gesture').find((e) => e.by === 'g')).toMatchObject({ emote: 'watching-you', at: 'a' });
  });

  it('a moon is aimed with your back', () => {
    const { m } = humanMatch();
    place(m, 'g', -5, 1.6, -Math.PI / 2);
    place(m, 'a', -7, 1.6, yawTo(-7, 1.6, -5, 1.6)); // facing her: the moon points away
    m.handleEmote('a', 'moon');
    tick(m, 20);
    expect(m.log.events.find((e) => e.kind === 'rude')).toMatchObject({ atNana: false });
    m.chars.get('a')!.emoteCd = 0;
    place(m, 'a', -7, 1.6, yawTo(-7, 1.6, -9, 1.6)); // bottom towards her
    m.handleEmote('a', 'moon');
    tick(m, 20);
    expect(m.log.events.filter((e) => e.kind === 'rude').pop()).toMatchObject({ atNana: true, at: 'g' });
  });

  it('someone she only hears comes without their emote in her snapshot; a shape she can make out keeps it', () => {
    const { m, box } = humanMatch();
    place(m, 'g', -5, 1.6, -Math.PI / 2);
    place(m, 'a', -7.2, 1.6, 0); // behind her, close: heard, not seen
    place(m, 'b', 5.5, 1.0, 0); // ahead, far: a shape
    m.handleEmote('a', 'will-jig');
    m.handleEmote('b', 'will-jig');
    tick(m, 10);
    const chars = lastSnap(box, 'g').chars;
    expect(chars.find((c) => c.id === 'a')?.emote).toBeUndefined();
    expect(chars.find((c) => c.id === 'b')?.emote).toBe('will-jig');
  });
});

describe('the reading', () => {
  it('Behind Her Back is replayed, with the gesture in the frames', () => {
    const r = makeMatch({ humans: HUMANS, grandmaId: 'g', seed: 3 });
    const m = r.m;
    m.start();
    stepUntil(m, () => m.phase === 'visit', 30);
    tick(m, 60);
    place(m, 'g', -5, 1.6, -Math.PI / 2);
    place(m, 'a', -7, 1.6, yawTo(-7, 1.6, -9, 1.6)); // a moon is aimed with your back: facing away from her
    m.handleEmote('a', 'moon');
    tick(m, 120);
    m.phaseEndsAt = m.time;
    stepUntil(m, () => m.phase === 'reading', 60);
    const reading = r.box.of('a').find((x) => x.t === 'reading');
    const replays = reading && reading.t === 'reading' ? reading.result.replays ?? [] : [];
    const clip = replays.find((x) => x.moment.kind === 'behind-her-back');
    expect(clip).toBeDefined();
    expect(clip!.frames.some((f) => f.chars.some((c) => c.id === 'a' && c.emote === 'moon'))).toBe(true);
  });

  it('a log alone: one rude moment per cousin per half minute', () => {
    const l = new EventLog((id) => id.toUpperCase());
    for (let i = 0; i < 4; i++) l.add({ t: i * 5, kind: 'rude', by: 'a', emote: 'raspberry', at: 'g', atNana: true, seen: false });
    expect(l.moments.filter((x) => x.kind === 'behind-her-back')).toHaveLength(1);
    l.add({ t: 40, kind: 'rude', by: 'a', emote: 'moon', at: 'g', atNana: true, seen: false });
    expect(l.moments.filter((x) => x.kind === 'behind-her-back')).toHaveLength(2);
    // Seen from afar (not sharp) is neither.
    l.add({ t: 80, kind: 'rude', by: 'b', emote: 'moon', at: 'g', atNana: true, seen: true });
    expect(l.moments.filter((x) => x.actor === 'b')).toHaveLength(0);
  });
});
