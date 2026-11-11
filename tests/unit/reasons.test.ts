// Nana's reasons in the margin (server/log.ts reasons): at the reading, her
// biggest decisions with what she had perceived, beside what really happened.
import { describe, expect, it } from 'vitest';
import { EventLog } from '../../server/log.js';
import { reasonText } from '../../client/src/hud/reading.js';

const NAMES: Record<string, string> = { a: 'Agatha', b: 'Barnaby', c: 'Clementine', d: 'Dudley', 'item-phone': 'Phone' };
const pos = { x: 0, y: 0, z: 0 };
const log = () => new EventLog((id) => NAMES[id] ?? id);

describe("Nana's reasons", () => {
  it('a framing: she found his item, but someone else planted it', () => {
    const l = log();
    l.add({ t: 10, kind: 'steal', by: 'a', item: 'item-phone', owner: 'b', pos, seen: false });
    const plant = l.add({ t: 20, kind: 'plant', by: 'a', item: 'item-phone', owner: 'b', pos, seen: false });
    l.add({ t: 25, kind: 'found', item: 'item-phone', owner: 'b', plant, visit: 0 });
    l.add({ t: 27, kind: 'will', target: 'b', moved: -10, via: 'tut' });
    expect(l.reasons()).toEqual([{ target: 'b', via: 'tut', moved: -10, why: "found Barnaby's phone where it shouldn't be", truth: 'Agatha planted it there.' }]);
  });

  it('a tattle that was a lie, and one that was true', () => {
    const l = log();
    l.add({ t: 5, kind: 'tattle', by: 'c', accused: 'd' });
    l.add({ t: 6, kind: 'will', target: 'd', moved: -5, via: 'tut' });
    l.add({ t: 30, kind: 'shove', by: 'b', victim: 'a', pos, seen: false });
    l.add({ t: 31, kind: 'tattle', by: 'a', accused: 'b' });
    l.add({ t: 32, kind: 'will', target: 'b', moved: -5, via: 'tut' });
    const r = l.reasons();
    expect(r[0]).toMatchObject({ target: 'd', why: 'Clementine told her it was Dudley', truth: 'Dudley had done nothing.' });
    expect(r[1]).toMatchObject({ target: 'b', why: 'Agatha told her it was Barnaby', truth: null });
  });

  it('she saw it herself: a right call', () => {
    const l = log();
    l.add({ t: 3, kind: 'shove', by: 'a', victim: 'b', pos, seen: true });
    l.add({ t: 4, kind: 'will', target: 'a', moved: -5, via: 'tut' });
    expect(l.reasons()).toEqual([{ target: 'a', via: 'tut', moved: -5, why: 'saw Agatha at a shove', truth: null }]);
  });

  it('a Bless for sweet talk from someone up to no good', () => {
    const l = log();
    l.add({ t: 10, kind: 'compliment', by: 'a', line: 'Love you, Nana!' });
    l.add({ t: 11, kind: 'will', target: 'a', moved: 5, via: 'bless' });
    l.add({ t: 14, kind: 'shove', by: 'a', victim: 'b', pos, seen: false });
    expect(l.reasons()).toEqual([{ target: 'a', via: 'bless', moved: 5, why: 'Agatha said such lovely things', truth: 'Agatha was behind a shove.' }]);
  });

  it('wrong calls first, then the biggest; a parchment drag counts once; tiny edits are left out', () => {
    const l = log();
    l.add({ t: 1, kind: 'shove', by: 'c', victim: 'b', pos, seen: true });
    for (let i = 0; i < 12; i++) l.add({ t: 2 + i * 0.2, kind: 'will', target: 'c', moved: -1, via: 'parchment' }); // one drag: -12
    l.add({ t: 20, kind: 'tattle', by: 'b', accused: 'a' });
    l.add({ t: 21, kind: 'will', target: 'a', moved: -5, via: 'tut' }); // a lie: a did nothing
    l.add({ t: 40, kind: 'will', target: 'd', moved: 2, via: 'parchment' }); // too small to mention
    const r = l.reasons();
    expect(r.map((x) => [x.target, x.moved])).toEqual([['a', -5], ['c', -12]]);
    expect(r[1].truth).toBeNull();
  });

  it('reads as a note in the margin', () => {
    expect(reasonText({ target: 'b', via: 'tut', moved: -10, why: "found Barnaby's phone where it shouldn't be", truth: 'Agatha planted it there.' }))
      .toEqual({ did: "She tutted: found Barnaby's phone where it shouldn't be.", really: 'Really: Agatha planted it there.' });
    expect(reasonText({ target: 'a', via: 'tut', moved: -5, why: 'saw Agatha at a shove', truth: null }).really).toBe('And she was right.');
    expect(reasonText({ target: 'a', via: 'bless', moved: 5, why: 'Agatha ran her errand', truth: null }).really).toBe('');
    expect(reasonText({ target: 'a', via: 'parchment', moved: -12, why: 'a feeling in her bones', truth: 'Agatha had done nothing.' }).did).toBe('She cut them: a feeling in her bones.');
  });
});
