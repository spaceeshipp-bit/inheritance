// Family Dinner (review P15; GDD: "everyone has to stay near the table;
// sabotage happens under it and on bathroom trips"): the table, Nana noticing
// empty chairs, and excusing yourself at the kitchen door.
import { describe, expect, it } from 'vitest';
import { DINNER } from '../../shared/constants.js';
import { SPAWNS } from '../../shared/map.js';
import { forwardOf } from '../../shared/movement.js';
import { EventLog } from '../../server/log.js';
import { makeMatch, stepUntil } from './helpers.js';
import { HUMANS, place, press, tick } from './scenario.js';

/** A full match of humans, run on to the start of Family Dinner. */
function atDinner() {
  const r = makeMatch({ humans: HUMANS, grandmaId: 'g', seed: 12, options: { fullMatch: true } });
  r.m.start();
  stepUntil(r.m, () => r.m.phase === 'visit', 30);
  r.m.phaseEndsAt = r.m.time; // end Tea now
  stepUntil(r.m, () => r.m.phase === 'visit' && r.m.visitIndex === 1, 60);
  return r;
}
const toasts = (box: ReturnType<typeof atDinner>['box'], id: string) => box.events(id, 'toast').map((e) => (e as unknown as { text: string }).text);

describe('Family Dinner', () => {
  it('everyone sits round the kitchen table, facing Nana at its head', () => {
    const { m } = atDinner();
    expect(m.visits[m.visitIndex]).toBe('dinner');
    const g = m.chars.get('g')!;
    expect(g.body.pos).toMatchObject({ x: SPAWNS.dinnerGrandma.x, z: SPAWNS.dinnerGrandma.z });
    for (const id of m.cousinIds) {
      const c = m.chars.get(id)!;
      const T = DINNER.table;
      const dx = Math.max(T.minX - c.body.pos.x, 0, c.body.pos.x - T.maxX), dz = Math.max(T.minZ - c.body.pos.z, 0, c.body.pos.z - T.maxZ);
      expect(Math.hypot(dx, dz)).toBeLessThan(DINNER.away);
      const f = forwardOf(c.yaw);
      const tx = g.body.pos.x - c.body.pos.x, tz = g.body.pos.z - c.body.pos.z;
      expect((f.x * tx + f.z * tz) / Math.hypot(tx, tz)).toBeGreaterThan(0.95);
    }
  });

  it('a respawn faces you the new way even while your client still sends the old facing', () => {
    const { m } = atDinner();
    const a = m.chars.get('a')!;
    const spawnYaw = a.yaw;
    const old = a.yawHoldFrom;
    expect(Math.abs(old - spawnYaw)).toBeGreaterThan(0.1); // Tea's facing was not Dinner's
    press(m, 'a', { yaw: old }); // the client has not seen the respawn yet
    tick(m, 5);
    expect(a.yaw).toBeCloseTo(spawnYaw, 6);
    press(m, 'a', { yaw: spawnYaw + 0.3 }); // it turned (adopted the new facing, then the mouse moved)
    tick(m);
    expect(a.yaw).toBeCloseTo(spawnYaw + 0.3, 6); // no waiting: from now on its facing counts
  });

  it("Nana notices an empty chair after a while, and when it is filled again", () => {
    const { m, box } = atDinner();
    box.clear();
    place(m, 'a', 4, 0, 0); // off into the hall
    tick(m, Math.round((DINNER.notice - 1) * 30));
    expect(toasts(box, 'g').some((t) => t.includes('has left the table'))).toBe(false);
    tick(m, 45);
    expect(toasts(box, 'g')).toContain('A has left the table.');
    expect(toasts(box, 'a')).toContain('Nana has noticed your empty chair.');
    expect(m.log.events.some((e) => e.kind === 'left-table' && e.by === 'a')).toBe(true);
    expect(toasts(box, 'b').some((t) => t.includes('left the table'))).toBe(false); // nobody else is told
    place(m, 'a', 11, -1.65, 0);
    tick(m);
    expect(toasts(box, 'g')).toContain('A is back at the table.');
    // The will never moves on its own.
    expect(m.log.events.some((e) => e.kind === 'will')).toBe(false);
  });

  it('excusing yourself at the kitchen door buys one unnoticed trip a visit', () => {
    const { m, box } = atDinner();
    box.clear();
    place(m, 'b', DINNER.door.x + 0.8, 0.3, Math.PI / 2);
    press(m, 'b', { interact: true });
    tick(m);
    press(m, 'b', { interact: false });
    expect(toasts(box, 'g')).toContain('B excuses themself from the table.');
    place(m, 'b', 4, 0, 0);
    tick(m, Math.round((DINNER.excuse - 1) * 30));
    expect(m.log.events.some((e) => e.kind === 'left-table')).toBe(false);
    tick(m, Math.round((DINNER.notice + 2) * 30));
    expect(m.log.events.some((e) => e.kind === 'left-table' && e.by === 'b')).toBe(true);
    // Only once a visit.
    place(m, 'b', DINNER.door.x + 0.8, 0.3, Math.PI / 2);
    box.clear();
    press(m, 'b', { interact: true });
    tick(m);
    expect(toasts(box, 'g').some((t) => t.includes('excuses'))).toBe(false);
  });

  it('her reason can be the empty chair, and the truth whether they were up to anything', () => {
    const l = new EventLog((id) => ({ a: 'Agatha', b: 'Barnaby' } as Record<string, string>)[id] ?? id);
    l.add({ t: 10, kind: 'left-table', by: 'a' });
    l.add({ t: 12, kind: 'will', target: 'a', moved: -5, via: 'tut' });
    expect(l.reasons()[0]).toMatchObject({ why: 'Agatha left the dinner table', truth: 'Agatha only went for a wander.' });
    l.add({ t: 30, kind: 'break', by: 'b', heirloom: 'h1', favourite: false, pos: { x: 0, y: 0, z: 0 }, seen: false });
    l.add({ t: 34, kind: 'left-table', by: 'b' });
    l.add({ t: 35, kind: 'will', target: 'b', moved: -5, via: 'tut' });
    expect(l.reasons().find((r) => r.target === 'b')).toMatchObject({ why: 'Barnaby left the dinner table', truth: null });
  });
});
