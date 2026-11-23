// The Storm's thunder: a moment after each lightning flash the thunder rolls,
// and for STORM.thunderDuration Grandma hears nothing at all: no crash, no
// voice, no footsteps. A vase timed to the thunder (where she cannot see it) is
// a vase she never heard, and earns Under Cover of Thunder.
import { describe, expect, it } from 'vitest';
import { STORM } from '../../shared/constants.js';
import type { VisitId } from '../../shared/types.js';
import { sendTarget } from '../../client/src/voice/rules.js';
import type { Match } from '../../server/match.js';
import { makeMatch, stepUntil, toVisit } from './helpers.js';
import { HUMANS, place, tick, yawTo } from './scenario.js';

/** A match that starts straight into the Storm, everyone placed as in humanMatch (Grandma facing west). */
function stormMatch() {
  const r = makeMatch({ humans: HUMANS, grandmaId: 'g', seed: 5 });
  (r.m.visits as VisitId[]).splice(0, r.m.visits.length, 'storm');
  toVisit(r.m);
  place(r.m, 'g', -5, 1.6, Math.PI / 2);
  place(r.m, 'a', -1, 4.5, 0);
  place(r.m, 'b', 1, 4.5, 0);
  place(r.m, 'c', 3, 4.5, 0);
  place(r.m, 'd', 5, 4.5, 0);
  tick(r.m);
  return r;
}

/** Drop an heirloom so it breaks at (x, z), blamed on `by`; returns its id once broken. */
function smash(m: Match, by: string, at: { x: number; z: number }): string {
  const p = [...m.props.values()].find((x) => x.kind === 'heirloom' && !x.broken)!;
  p.spot = null; p.resting = false; p.lastBy = by;
  p.pos = { x: at.x, y: 1.2, z: at.z }; p.vel = { x: 0, y: -6, z: 0 };
  expect(stepUntil(m, () => !!p.broken, 1.2)).toBe(true);
  return p.id;
}

const crashes = (box: ReturnType<typeof makeMatch>['box'], id: string) => box.events(id, 'crash');

describe('thunder', () => {
  it('follows each lightning flash, is sent to everyone, and lasts STORM.thunderDuration', () => {
    const { m, box } = stormMatch();
    expect(m.dark).toBe(true);
    expect(stepUntil(m, () => m.thunder, 30)).toBe(true);
    expect(box.events('a', 'lightning').length).toBeGreaterThan(0);
    const ev = box.events('g', 'thunder').pop() as unknown as { duration: number };
    expect(ev.duration).toBeGreaterThan(STORM.thunderDuration - 0.1);
    expect(box.events('a', 'thunder')).toHaveLength(1);
    const from = m.time;
    expect(stepUntil(m, () => !m.thunder, 5)).toBe(true);
    expect(m.time - from).toBeLessThanOrEqual(STORM.thunderDuration + 0.05);
  });

  it('while it rolls she hears nobody, not even right beside her', () => {
    const { m } = stormMatch();
    const g = m.chars.get('g')!.body.pos;
    place(m, 'a', g.x + 1, g.z, yawTo(g.x + 1, g.z, g.x, g.z));
    expect(m.grandmaHears(m.chars.get('a')!.body.pos, false)).toBe('clear');
    stepUntil(m, () => m.thunder, 30);
    expect(m.grandmaHears(m.chars.get('a')!.body.pos, false)).toBe('silent');
    // A compliment into the thunder is lost.
    m.handleQuick('a', 0);
    expect(m.log.events.some((e) => e.kind === 'compliment')).toBe(false);
    stepUntil(m, () => !m.thunder, 5);
    m.handleQuick('a', 0);
    expect(m.log.events.some((e) => e.kind === 'compliment' && e.by === 'a')).toBe(true);
  });

  it('a crash behind her back on the thunderclap: cousins hear it, she does not, and it is a moment', () => {
    const { m, box } = stormMatch();
    stepUntil(m, () => m.thunder, 30);
    const id = smash(m, 'a', { x: -2, z: -1 });
    expect(m.thunder).toBe(true);
    expect(crashes(box, 'g')).toHaveLength(0);
    expect(crashes(box, 'b').pop()).toMatchObject({ heirloom: id });
    expect(m.log.events.find((e) => e.kind === 'break')).toMatchObject({ by: 'a', thunder: true, seen: false });
    const mo = m.log.moments.find((x) => x.kind === 'thunder');
    expect(mo).toMatchObject({ actor: 'a' });
    expect(mo?.text).toMatch(/thunderclap\. Nana never heard a thing\./);
  });

  it('the same crash without thunder: she hears it and gets a rough direction', () => {
    const { m, box } = stormMatch();
    expect(m.thunder).toBe(false);
    smash(m, 'a', { x: -2, z: -1 });
    expect(m.thunder).toBe(false); // the first flash is seconds away yet
    expect(crashes(box, 'g').pop()).toMatchObject({ heirloom: '' });
    expect(m.log.events.find((e) => e.kind === 'break')).not.toHaveProperty('thunder');
  });

  it('what she can see she still sees: a crash in front of her by candlelight is not hidden by the thunder', () => {
    const { m, box } = stormMatch();
    stepUntil(m, () => m.thunder, 30);
    const g = m.chars.get('g')!;
    // Right in front of her, inside the candle's clear range.
    const at = { x: g.body.pos.x - 1.2, z: g.body.pos.z };
    const id = smash(m, 'a', at);
    expect(crashes(box, 'g').pop()).toMatchObject({ heirloom: id });
    expect(m.log.moments.some((x) => x.kind === 'thunder')).toBe(false);
  });

  it('someone she could only hear is gone from her snapshot (and her replay) while it rolls', () => {
    const { m, box } = stormMatch();
    const g = m.chars.get('g')!.body.pos;
    // Behind her, in the dark, close enough to hear.
    place(m, 'a', g.x + 4, g.z, 0);
    tick(m);
    const hasA = () => {
      const snaps = box.of('g').filter((x) => x.t === 'snap');
      const s = snaps[snaps.length - 1] as Extract<(typeof snaps)[number], { t: 'snap' }>;
      return s.chars.some((c) => c.id === 'a');
    };
    expect(hasA()).toBe(true);
    stepUntil(m, () => m.thunder, 30);
    place(m, 'a', g.x + 4, g.z, 0);
    tick(m);
    expect(m.thunder).toBe(true);
    expect(hasA()).toBe(false);
    const snaps = box.of('g').filter((x) => x.t === 'snap');
    expect((snaps[snaps.length - 1] as { thunder?: boolean }).thunder).toBe(true);
  });

  it('pausing the match carries the thunder with it', () => {
    const { m } = stormMatch();
    stepUntil(m, () => m.thunder, 30);
    const left = (m as unknown as { thunderUntil: number }).thunderUntil - m.time;
    m.pause = { since: m.time, until: m.time + 100 };
    tick(m, 60);
    m.pause = null;
    expect((m as unknown as { thunderUntil: number }).thunderUntil - m.time).toBeCloseTo(left, 5);
    expect(m.thunder).toBe(true);
  });
});

describe('voice under the thunder', () => {
  it('cousins send Grandma nothing while it rolls, and everything else as usual', () => {
    expect(sendTarget('cousin', { role: 'grandma', d: 1, aidActive: false, thunder: true }, false)).toMatchObject({ gain: 0, band: 'silent' });
    expect(sendTarget('cousin', { role: 'grandma', d: 1, aidActive: false }, false).band).toBe('clear');
    expect(sendTarget('cousin', { role: 'cousin', d: 1, aidActive: false, thunder: true }, false).gain).toBe(1);
  });
});
