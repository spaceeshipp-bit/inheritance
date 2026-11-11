// What Nana Saw on the client (client/src/hud/replay.ts): replays play back to
// back behind title cards, frames are interpolated, props carry forward.
import { describe, expect, it } from 'vitest';
import { REPLAY } from '../../shared/constants.js';
import { replaySeconds, replaysSeconds } from '../../shared/replay.js';
import type { Replay, ReplayFrame } from '../../shared/types.js';
import { ReplayClip, replayAt } from '../../client/src/hud/replay.js';

const names = { grandmaId: 'g', name: (id: string) => ({ g: 'Agatha', a: 'Barnaby', b: 'Clementine' } as Record<string, string>)[id] ?? id };

function frame(t: number, ax: number, ayaw: number, props: ReplayFrame['props'] = []): ReplayFrame {
  return {
    t,
    chars: [
      { id: 'g', x: 0, y: 0, z: 0, yaw: -Math.PI / 2, state: 'normal', holding: null, seen: 'self' },
      { id: 'a', x: ax, y: 0, z: 2, yaw: ayaw, state: 'normal', holding: null, seen: t < 10.5 ? 'sharp' : 'heard' },
    ],
    props,
    nana: { x: 0, y: 0, z: 0, yaw: -Math.PI / 2, pitch: 0, specs: false, aid: false, dark: false, flash: false },
  };
}

function clip(from: number, n: number): Replay {
  const vase = { id: 'h1', kind: 'heirloom' as const, x: 3, y: 1, z: 3, yaw: 0, broken: false, heldBy: null, hidden: false, variant: 'vase' };
  const frames: ReplayFrame[] = [];
  for (let i = 0; i < n; i++) frames.push(frame(from + i / 10, i * 0.1, i === 0 ? 3.0 : -3.0, i === 0 ? [vase] : i === 5 ? [{ ...vase, broken: true }] : []));
  return {
    moment: { kind: 'love-you-nana', t: from + 0.5, actor: 'a', victim: 'b', text: 'Barnaby told Nana they loved her, then shoved Clementine.' },
    from, to: from + (n - 1) / 10, frames,
    speech: [{ t: from + 0.2, from: 'a', said: 'Love you, Nana!', heard: 'Shove you, Nana?' }, { t: from + 0.6, from: 'b', said: 'Help!', heard: null }],
  };
}

describe('What Nana Saw playback', () => {
  it('plays each replay after its title card, back to back, then stops', () => {
    const r1 = clip(10, 31), r2 = clip(50, 11); // 3 s and 1 s of clip
    expect(replaySeconds(r1)).toBeCloseTo(REPLAY.title + 3 + REPLAY.gap, 6);
    const all = [r1, r2];
    expect(replayAt(all, 0)).toEqual({ index: 0, title: true, clip: 0 });
    expect(replayAt(all, REPLAY.title + 1)).toEqual({ index: 0, title: false, clip: 1 });
    expect(replayAt(all, REPLAY.title + 3 + REPLAY.gap / 2)).toEqual({ index: 0, title: false, clip: 3 }); // the pause holds the last frame
    expect(replayAt(all, replaySeconds(r1) + 0.1)).toEqual({ index: 1, title: true, clip: 0 });
    expect(replayAt(all, replaysSeconds(all) + 0.01)).toBeNull();
  });

  it('interpolates between the recorded frames, turning the short way round', () => {
    const c = new ReplayClip(clip(10, 31), names);
    const v = c.view(0.05); // halfway between frames 0 and 1
    const a = v.chars.find((x) => x.id === 'a')!;
    expect(a.pos.x).toBeCloseTo(0.05, 6);
    expect(a.vel.x).toBeCloseTo(1, 6); // 0.1 m in 0.1 s
    // 3.0 -> -3.0 rad is a small turn through PI, not most of a circle back through 0.
    expect(Math.abs(Math.abs(a.yaw) - Math.PI)).toBeLessThan(0.3);
    expect(v.chars.find((x) => x.id === 'g')!.role).toBe('grandma');
    expect(v.seen.get('a')).toBe('sharp');
    expect(c.view(1).seen.get('a')).toBe('heard');
    expect(v.focus).toEqual(a.pos); // the camera follows whoever the moment is about
  });

  it('props recorded once stay, and change when the recording says so', () => {
    const c = new ReplayClip(clip(10, 31), names);
    expect(c.view(0.2).props.get('h1')).toMatchObject({ broken: false, variant: 'vase', pos: { x: 3, y: 1, z: 3 } });
    expect(c.view(0.55).props.get('h1')?.broken).toBe(true);
    expect(c.view(2.9).props.get('h1')?.broken).toBe(true);
  });

  it('shows what was said beside what Nana heard', () => {
    const c = new ReplayClip(clip(10, 31), names);
    expect(c.speechAt(0.1)).toBeNull();
    expect(c.speechAt(0.3)).toEqual({ said: 'Barnaby: "Love you, Nana!"', heard: 'Nana hears: "Shove you, Nana?"' });
    expect(c.speechAt(0.7)).toEqual({ said: 'Clementine: "Help!"', heard: '(Nana hears nothing)' });
    expect(c.speechAt(3.5)).toBeNull();
  });
});
