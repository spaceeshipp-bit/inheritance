// What Nana Saw (server/replay.ts): the reading carries a replay of the best
// moments, the truth frame by frame beside how Grandma perceived it.
import { describe, expect, it } from 'vitest';
import { QUICKCHAT } from '../../shared/constants.js';
import type { Moment, MomentKind, Replay } from '../../shared/types.js';
import { ReplayRecorder, REPLAY_HZ } from '../../server/replay.js';
import { humanMatch, place, press, tick } from './scenario.js';

const EAST = -Math.PI / 2, WEST = Math.PI / 2;

/** Ann ('a') tells Nana she loves her, slips behind her and shoves Bob ('b'); the will is then read. */
function loveYouThenShove() {
  const { m, box } = humanMatch();
  place(m, 'g', -5, 1.0, EAST);
  place(m, 'a', -3.4, 1.0, WEST); // 1.6 m in front of her: she hears it clearly and sees who
  tick(m, 15);
  m.handleQuick('a', 0); // "Love you, Nana!"
  tick(m, 30);
  // Behind her back (she faces east), Bob stands west of her; Ann shoves him.
  place(m, 'b', -7.6, 1.0, 0);
  place(m, 'a', -6.9, 1.0, WEST);
  tick(m, 3);
  press(m, 'a', { yaw: WEST, shove: true });
  tick(m);
  press(m, 'a', { yaw: WEST, shove: false });
  tick(m, 2 * 30 + 5); // the clip runs 2 s past the shove
  m.phaseEndsAt = m.time; // end the visit: the will is read
  tick(m, 2);
  return { m, box };
}

describe('What Nana Saw', () => {
  it('the reading replays "Love you, Nana" then the shove she never saw', () => {
    const { m } = loveYouThenShove();
    expect(m.phase).toBe('reading');
    const shove = m.log.events.find((e) => e.kind === 'shove' && e.by === 'a');
    expect(shove).toMatchObject({ victim: 'b', seen: false });
    const replays = m.reading?.replays ?? [];
    const r = replays.find((x) => x.moment.kind === 'love-you-nana') as Replay;
    expect(r).toBeDefined();
    const t = (shove as { t: number }).t;
    // From the sweet talk to two seconds after the shove, ten frames a second.
    const compliment = m.log.events.find((e) => e.kind === 'compliment')!;
    expect(r.from).toBeLessThanOrEqual(compliment.t);
    expect(r.to).toBeCloseTo(t + 2, 5);
    expect(r.frames[0].t).toBeLessThanOrEqual(compliment.t); // (the visit had only just begun: the clip starts with it)
    expect(r.frames[r.frames.length - 1].t).toBeGreaterThanOrEqual(t + 1.9);
    for (let i = 1; i < r.frames.length; i++) expect(r.frames[i].t - r.frames[i - 1].t).toBeCloseTo(1 / REPLAY_HZ, 1);
    // The sweet talk: said, and heard as said (she was close).
    expect(r.speech).toEqual([expect.objectContaining({ from: 'a', said: QUICKCHAT.cousin[0], heard: QUICKCHAT.cousin[0] })]);
    // While she listened Ann was right in front of her; at the shove, behind her back.
    const at = (time: number) => r.frames.reduce((best, f) => (Math.abs(f.t - time) < Math.abs(best.t - time) ? f : best));
    const seenAt = (time: number, id: string) => at(time).chars.find((c) => c.id === id)?.seen;
    expect(['sharp', 'soft']).toContain(seenAt(compliment.t, 'a'));
    expect(['heard', 'none']).toContain(seenAt(t + 0.3, 'a'));
    expect(at(t + 0.3).chars.find((c) => c.id === 'g')?.seen).toBe('self');
    // The truth: Bob goes flying.
    expect(r.frames.some((f) => f.t > t && f.chars.find((c) => c.id === 'b')?.state === 'ragdoll')).toBe(true);
    expect(at(t).nana).toMatchObject({ yaw: expect.closeTo(EAST, 1) });
  });

  it('props come complete in the first frame and only as they change after', () => {
    const { m } = loveYouThenShove();
    const r = (m.reading?.replays ?? [])[0];
    expect(r.frames[0].props.length).toBe(m.props.size);
    // Only what moves comes again (the cat, items on someone who walks): far less than every prop every frame.
    const later = r.frames.slice(1).reduce((n, f) => n + f.props.length, 0);
    expect(later).toBeLessThan((m.props.size * (r.frames.length - 1)) / 4);
  });

  it('nobody sees a replay before the reading', () => {
    const { box } = loveYouThenShove();
    for (const id of ['g', 'a', 'b']) {
      const before = box.of(id).filter((x) => x.t !== 'reading');
      expect(JSON.stringify(before)).not.toContain('"frames"');
    }
    expect(box.of('g').some((x) => x.t === 'reading' && (x.result.replays?.length ?? 0) > 0)).toBe(true);
  });

  it('the recorder keeps a few clips per kind of act and picks the best moments first', () => {
    const rec = new ReplayRecorder();
    const frame = (t: number) => ({ t, chars: [], props: [], nana: null });
    const pos = { x: 0, y: 0, z: 0 };
    let time = 0;
    const run = (secs: number) => { for (let i = 0; i < secs * 30; i++) { time += 1 / 30; rec.tick(time, () => frame(time)); } };
    run(6);
    for (let i = 0; i < 10; i++) rec.event({ t: time, kind: 'shove', by: 'a', victim: 'b', pos, seen: false }, i, null);
    rec.event({ t: time, kind: 'plant', by: 'a', item: 'item-x', owner: 'b', pos, seen: false }, 20, null);
    run(3);
    expect(rec.clipCount).toBe(6 + 1);
    const mk = (kind: MomentKind, key: number, t: number): { m: Moment; key: number } => ({ m: { kind, t, actor: 'a', text: kind }, key });
    const list = [mk('caught-red-handed', 0, 1), mk('big-cut', 1, 2), mk('framed', 20, 3)];
    const keyOf = new Map(list.map((x) => [x.m, x.key]));
    const picked = rec.replays(list.map((x) => x.m), (m) => keyOf.get(m));
    expect(picked.map((p) => p.moment.kind)).toEqual(['framed', 'caught-red-handed']); // Big Cut has nothing hidden to show
  });
});
