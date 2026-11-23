// Man overboard (the cruise ship's drop zone): whoever knocked a cousin over
// the side is named in a moment, replayed at the reading; nobody's fault, and
// they went over all on their own.
import { describe, expect, it } from 'vitest';
import { MAPS } from '../../shared/map.js';
import { EventLog } from '../../server/log.js';
import { makeMatch, toVisit } from './helpers.js';
import { tick } from './scenario.js';

const drop = MAPS.cruise.drops![0];
const under = { x: (drop.min.x + drop.max.x) / 2, y: drop.min.y - 0.5, z: (drop.min.z + drop.max.z) / 2 };

describe('man overboard', () => {
  it('a cousin shoved over the side: brought back, and the shover named in a moment', () => {
    const { m, box } = makeMatch({ humans: ['g', 'a', 'b', 'c'], grandmaId: 'g', options: { map: 'cruise' } });
    toVisit(m);
    const a = m.chars.get('a')!;
    a.knockedBy = 'b';
    a.knockedAt = m.time;
    a.body.pos = { ...under };
    tick(m, 2);
    expect(a.body.pos.y).toBeGreaterThan(-1); // back on deck
    expect(m.log.events.find((e) => e.kind === 'overboard')).toMatchObject({ by: 'b', victim: 'a' });
    expect(m.log.moments.find((x) => x.kind === 'overboard')?.text).toBe('B sent A overboard.');
    expect((box.events('c', 'toast') as unknown as { text: string }[]).some((e) => /overboard/i.test(e.text))).toBe(true);
  });

  it('nobody to blame: overboard all on their own', () => {
    const l = new EventLog((id) => id.toUpperCase());
    l.add({ t: 3, kind: 'overboard', by: null, victim: 'a' });
    expect(l.moments[0]).toMatchObject({ kind: 'overboard', actor: 'a', text: 'A went overboard all on their own.' });
  });
});
