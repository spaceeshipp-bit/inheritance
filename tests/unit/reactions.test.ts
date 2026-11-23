// The reading as theatre (client/src/hud/reactions.ts): who reacts how once the will is read.
import { describe, expect, it } from 'vitest';
import { EMOTES } from '../../shared/emotes.js';
import type { CharSnap } from '../../shared/types.js';
import { reactions, withReactions } from '../../client/src/hud/reactions.js';

const snap = (id: string, state: CharSnap['state'] = 'normal'): CharSnap => ({
  id, role: id === 'g' ? 'grandma' : 'cousin', pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, vel: { x: 1, y: 0, z: 0 }, state, ragdollT: 0,
  holding: null, running: false, sneaking: false, whispering: false, charge: 0, plant: 0, leader: false,
});

describe('the family reacts to the will', () => {
  it('the heir shimmies, the disinherited weep, the rest grin and bear it, Nana is still alive', () => {
    const r = reactions({ a: 55, b: 0, c: 30, d: 15 }, 'g');
    expect(r.get('a')?.emote).toBe('gold-digger');
    expect(r.get('b')?.emote).toBe('crocodile-tears');
    expect(r.get('c')?.emote).toBe('heart-hands');
    expect(r.get('g')?.emote).toBe('still-alive');
  });

  it('a tie at the top: both dance a jig, nobody gets the shimmy', () => {
    const r = reactions({ a: 40, b: 40, c: 20 }, 'g');
    expect([r.get('a')?.emote, r.get('b')?.emote]).toEqual(['will-jig', 'will-jig']);
  });

  it('nothing before the will is read', () => {
    expect(reactions(null, 'g').size).toBe(0);
  });

  it('puts the gesture on each character after its stagger, looping, standing still; never on someone lying down', () => {
    const rs = reactions({ a: 60, b: 40 }, 'g');
    const secs = (e: keyof typeof EMOTES) => EMOTES[e].secs;
    const early = withReactions([snap('a'), snap('b'), snap('g')], rs, 0.1, secs);
    expect(early.every((c) => c.emote === undefined)).toBe(true);
    const later = withReactions([snap('a'), snap('b', 'ragdoll'), snap('g')], rs, 20, secs);
    const a = later.find((c) => c.id === 'a')!;
    expect(a.emote).toBe('gold-digger');
    expect(a.emoteT).toBeLessThan(EMOTES['gold-digger'].secs);
    expect(a.vel).toEqual({ x: 0, y: 0, z: 0 });
    expect(later.find((c) => c.id === 'b')!.emote).toBeUndefined();
    expect(later.find((c) => c.id === 'g')!.emote).toBe('still-alive');
  });
});
