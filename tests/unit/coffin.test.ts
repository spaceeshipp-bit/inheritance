// Early Burial (the funeral parlour's open coffins): a cousin knocked flying
// against or onto one is shut in it for COFFIN.buried seconds, hidden under
// the lid, able only to knock; then they climb out beside it.
import { describe, expect, it } from 'vitest';
import { COFFIN } from '../../shared/constants.js';
import { MAPS } from '../../shared/map.js';
import { makeMatch, toVisit } from './helpers.js';
import { lastSnap, place, press, tick } from './scenario.js';

const deluxe = MAPS.parlour.boxes.find((b) => b.label === 'The Eternal Rest Deluxe')!;
const beside = { x: deluxe.max.x + 0.3, z: (deluxe.min.z + deluxe.max.z) / 2 };

function parlour() {
  const r = makeMatch({ humans: ['g', 'a', 'b', 'c'], grandmaId: 'g', options: { map: 'parlour' } });
  toVisit(r.m);
  return r;
}

describe('Early Burial', () => {
  it('knocked flying against an open coffin: shut in, hidden, and the shover named', () => {
    const { m, box } = parlour();
    const a = place(m, 'a', beside.x, beside.z, 0);
    a.state = 'ragdoll'; a.ragdollT = 1; a.knockedBy = 'b'; a.knockedAt = m.time;
    tick(m);
    expect(a.buriedIn).toBe('The Eternal Rest Deluxe');
    expect(a.state).toBe('normal');
    expect(box.events('c', 'buried')).toHaveLength(1);
    tick(m);
    expect(lastSnap(box, 'c').chars.find((c) => c.id === 'a')?.buried).toBe('The Eternal Rest Deluxe');
    expect(m.log.events.find((e) => e.kind === 'buried')).toMatchObject({ by: 'b', victim: 'a' });
    expect(m.log.moments.find((x) => x.kind === 'buried')?.text).toBe('B buried A alive in the Eternal Rest Deluxe (10% off).');
  });

  it('walking up to one is safe', () => {
    const { m } = parlour();
    const a = place(m, 'a', beside.x, beside.z, 0);
    tick(m, 3);
    expect(a.buriedIn).toBeNull();
  });

  it('inside, all you can do is knock (and nobody can shove you); then out you climb', () => {
    const { m, box } = parlour();
    const a = place(m, 'a', beside.x, beside.z, 0);
    a.state = 'ragdoll'; a.ragdollT = 1; a.knockedBy = 'b'; a.knockedAt = m.time;
    tick(m);
    const at = { ...a.body.pos };
    tick(m, 32);
    press(m, 'a', { interact: true, move: { x: 0, z: 1 } });
    tick(m, 3);
    expect(box.events('b', 'knock').length).toBeGreaterThanOrEqual(1);
    expect(Math.hypot(a.body.pos.x - at.x, a.body.pos.z - at.z)).toBeLessThan(0.05);
    // A shove at the coffin finds nobody.
    place(m, 'c', deluxe.max.x + 0.9, at.z, Math.PI / 2);
    tick(m);
    press(m, 'c', { shove: true });
    tick(m, 2);
    expect(m.log.events.some((e) => e.kind === 'shove' && e.victim === 'a')).toBe(false);
    // Time up: out, on the floor beside it.
    tick(m, Math.ceil(COFFIN.buried * 30));
    expect(a.buriedIn).toBeNull();
    expect(a.body.pos.y).toBeLessThan(0.3);
    const outside = a.body.pos.x < deluxe.min.x - 0.2 || a.body.pos.x > deluxe.max.x + 0.2 || a.body.pos.z < deluxe.min.z - 0.2 || a.body.pos.z > deluxe.max.z + 0.2;
    expect(outside).toBe(true);
  });

  it('only maps with open coffins have them', () => {
    expect(MAPS.parlour.coffins?.length).toBe(2);
    for (const c of MAPS.parlour.coffins ?? []) expect(MAPS.parlour.boxes.some((b) => b.label === c.label)).toBe(true);
    expect(MAPS.manor.coffins).toBeUndefined();
  });
});
