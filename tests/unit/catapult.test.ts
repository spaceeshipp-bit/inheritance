// Mittens as a weapon: thrown, she yowls; flying through an heirloom on its
// pedestal, she knocks it off (the thrower's fault, and The Cat-apult when it
// breaks); landing, she yowls again and bolts.
import { describe, expect, it } from 'vitest';
import { humanMatch, place, tick, yawTo } from './scenario.js';
import { stepUntil } from './helpers.js';

describe('the Cat-apult', () => {
  it('a thrown cat yowls, topples the heirloom she flies into, and the thrower gets the blame', () => {
    const { m, box } = humanMatch();
    const cat = [...m.props.values()].find((p) => p.kind === 'cat')!;
    const h = [...m.props.values()].find((p) => p.kind === 'heirloom' && p.spot && p.spot.y < 2)!;
    // A cousin with the cat in hand, 3 m from the heirloom.
    const a = place(m, 'a', h.pos.x + 3, h.pos.z, yawTo(h.pos.x + 3, h.pos.z, h.pos.x, h.pos.z));
    a.holding = cat.id; a.sticky = true; cat.heldBy = 'a'; cat.resting = false;
    tick(m);
    // Throw her straight at it, at its height.
    cat.heldBy = null; a.holding = null; a.sticky = false;
    cat.pos = { x: h.pos.x + 1.2, y: h.pos.y + 0.2, z: h.pos.z };
    cat.vel = { x: -7, y: 0.5, z: 0 };
    cat.resting = false; cat.thrownBy = 'a'; cat.thrownAt = m.time; cat.lastBy = 'a';
    expect(stepUntil(m, () => !h.spot, 1)).toBe(true);
    expect(h.lastBy).toBe('a');
    expect(stepUntil(m, () => !!h.broken, 3)).toBe(true);
    expect(m.log.events.find((e) => e.kind === 'catapult')).toMatchObject({ by: 'a', heirloom: h.id });
    expect(m.log.moments.find((x) => x.kind === 'catapult')?.text).toBe('A threw Mittens. Mittens took an heirloom with her.');
    // She yowled on landing, and runs off.
    expect(stepUntil(m, () => cat.resting, 3)).toBe(true);
    tick(m, 2);
    expect(box.events('b', 'yowl').length).toBeGreaterThan(0);
    // ...and is off at a run (even if, landing on the empty pedestal, she first takes its place).
    expect(cat.cat?.fleeUntil).toBeGreaterThan(m.time);
  });

  it('a real throw yowls at once', () => {
    const { m, box } = humanMatch();
    const cat = [...m.props.values()].find((p) => p.kind === 'cat')!;
    const a = place(m, 'a', cat.pos.x + 0.6, cat.pos.z, yawTo(cat.pos.x + 0.6, cat.pos.z, cat.pos.x, cat.pos.z));
    a.holding = cat.id; a.sticky = true; cat.heldBy = 'a'; cat.resting = false; a.charge = 0.5;
    (m as unknown as { doThrow(c: typeof a): void }).doThrow(a);
    expect(box.events('c', 'yowl')).toHaveLength(1);
  });
});
