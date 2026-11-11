// Grandma's lie-down (she disconnected mid-match): she shows as asleep, the
// match clock stops, a willing cousin may take over after a short grace, and
// the take-over moves shares in the open. Review findings R2, R9, R10, S3, S15.
import { describe, expect, it } from 'vitest';
import { DISCONNECT, HEARING_AID } from '../../shared/constants.js';
import { GRANDMA_TAKEOVER_GRACE } from '../../server/match.js';
import { humanMatch, lastSnap, place, press, tick } from './scenario.js';

const sum = (s: Record<string, number>): number => Object.values(s).reduce((a, b) => a + b, 0);

describe("Grandma's lie-down", () => {
  it('she shows as asleep to everyone, so cousins get the take-over prompt', () => {
    const { m, box } = humanMatch();
    m.setConnected('g', false);
    tick(m, 3);
    expect(m.pause).not.toBeNull();
    expect(lastSnap(box, 'a').chars.find((c) => c.id === 'g')!.state).toBe('sleeping');
    m.setConnected('g', true);
    tick(m, 3);
    expect(m.pause).toBeNull();
    expect(lastSnap(box, 'a').chars.find((c) => c.id === 'g')!.state).toBe('normal');
  });

  it('a take-over is refused in the first seconds (time for her to come back), then allowed', () => {
    const { m, box } = humanMatch();
    m.setConnected('g', false);
    expect(m.takeOverGrandma('a')).toBe(false);
    expect(box.events('a', 'toast').some((e) => /moment/.test(String((e as { text: string }).text)))).toBe(true);
    tick(m, Math.ceil(GRANDMA_TAKEOVER_GRACE * 30) + 2);
    expect(m.takeOverGrandma('a')).toBe(true);
    expect(m.grandmaId).toBe('a');
    expect(m.pause).toBeNull();
  });

  it("the volunteer's share is split equally between the others, in the open", () => {
    const { m, box } = humanMatch();
    // a has 40%, the others 20%: a's 40 split four... three ways after a leaves.
    m.will.shares = { a: 40, b: 20, c: 20, d: 20 };
    m.setConnected('d', false); // asleep cousins still get their part
    m.setConnected('g', false);
    tick(m, Math.ceil(GRANDMA_TAKEOVER_GRACE * 30) + 2);
    expect(m.takeOverGrandma('a')).toBe(true);
    expect(m.will.shares).toEqual({ b: 34, c: 33, d: 33 });
    expect(sum(m.will.shares)).toBe(100);
    const logged = m.log.events.filter((e) => e.kind === 'will' && e.via === 'takeover');
    expect(logged.map((e) => (e.kind === 'will' ? e.moved : 0)).reduce((x, y) => x + y, 0)).toBe(40);
    expect(box.events('b', 'toast').some((e) => /shared out equally/.test(String((e as { text: string }).text)))).toBe(true);
  });

  it('the match clock stops: the visit, the wish and the rolling cap all wait', () => {
    const { m } = humanMatch();
    tick(m, 30 * 8); // a wish has started by now (fast mode)
    expect(m.wish).not.toBeNull();
    const ends = m.phaseEndsAt, wishEnds = m.wish!.info.endsAt;
    m.setConnected('g', false);
    tick(m, 30 * 5);
    expect(m.phaseEndsAt).toBeCloseTo(ends + 5, 1);
    expect(m.wish!.info.endsAt).toBeCloseTo(wishEnds + 5, 1);
  });

  it('buttons pressed during the pause do not all fire when she comes back', () => {
    const { m } = humanMatch();
    place(m, 'a', 2, 1.6, -Math.PI / 2);
    place(m, 'b', 2.7, 1.6, 0);
    m.setConnected('g', false);
    press(m, 'a', { yaw: -Math.PI / 2, shove: true });
    tick(m, 3);
    press(m, 'a', { yaw: -Math.PI / 2, shove: false });
    m.setConnected('g', true);
    tick(m, 3);
    expect(m.log.events.some((e) => e.kind === 'shove')).toBe(false);
  });

  it('nobody takes over: the will is read as it stands; no take-over after the reading has begun', () => {
    const { m } = humanMatch();
    m.setConnected('g', false);
    tick(m, Math.ceil(DISCONNECT.grandmaLieDown * 30) + 5);
    expect(m.phase).toBe('reading');
    expect(m.pause).toBeNull();
    const before = { ...m.will.shares };
    expect(m.takeOverGrandma('a')).toBe(false);
    expect(m.will.shares).toEqual(before);
  });
});

describe('hearing aid', () => {
  it('6 s of clear hearing, then a 25 s recharge (usable again after 31 s)', () => {
    const { m } = humanMatch();
    press(m, 'g', { yaw: -Math.PI / 2, secondary: true });
    tick(m);
    press(m, 'g', { yaw: -Math.PI / 2, secondary: false });
    const g = m.chars.get('g')!;
    expect(g.aidT).toBeGreaterThan(0);
    tick(m, Math.ceil((HEARING_AID.duration + HEARING_AID.cooldown - 1) * 30));
    expect(g.aidCd).toBeGreaterThan(0);
    tick(m, 2 * 30);
    expect(g.aidCd).toBe(0);
  });
});
