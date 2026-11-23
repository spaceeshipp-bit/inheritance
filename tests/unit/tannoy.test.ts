// The care home's reception tannoy: E at the desk takes the microphone, and
// your next line goes out to the whole building. Nana hears every word, but
// knows who said it only if she can see them. A compliment counts from anywhere.
import { describe, expect, it } from 'vitest';
import { TANNOY } from '../../shared/constants.js';
import { MAPS } from '../../shared/map.js';
import { makeMatch, toVisit } from './helpers.js';
import { place, press, tick } from './scenario.js';

const at = MAPS.carehome.tannoy!.at;
type Bubble = { from: string; text: string; tannoy?: boolean };

function carehome() {
  const r = makeMatch({ humans: ['g', 'a', 'b', 'c'], grandmaId: 'g', options: { map: 'carehome' } });
  toVisit(r.m);
  return r;
}

describe('the tannoy', () => {
  it('E at the desk, then a line: everyone gets it, Nana clearly but not who', () => {
    const { m, box } = carehome();
    place(m, 'a', at.x, at.z - 0.6, 0);
    tick(m);
    press(m, 'a', { interact: true });
    tick(m, 2);
    expect(box.events('g', 'dingdong')).toHaveLength(1);
    m.handleChat('a', 'Would Barnaby please return Nana\'s pills to reception.');
    const toNana = (box.events('g', 'bubble') as unknown as Bubble[]).pop();
    expect(toNana).toMatchObject({ tannoy: true, text: 'Would Barnaby please return Nana\'s pills to reception.' });
    expect(toNana?.from).toBe(''); // she is in the Day Room, nowhere near
    expect((box.events('c', 'bubble') as unknown as Bubble[]).pop()).toMatchObject({ from: 'a', tannoy: true });
    expect(m.log.moments.find((x) => x.kind === 'tannoy')?.text).toBe('A, over the tannoy: "Would Barnaby please return Nana\'s pills to reception."');
    // One announcement per go: the next line is an ordinary one.
    m.handleChat('a', 'Testing, testing.');
    expect((box.events('c', 'bubble') as unknown as Bubble[]).pop()?.tannoy).toBeUndefined();
  });

  it('a compliment over the tannoy counts, however far away she is', () => {
    const { m } = carehome();
    place(m, 'a', at.x, at.z - 0.6, 0);
    tick(m);
    press(m, 'a', { interact: true });
    tick(m, 2);
    m.handleQuick('a', 0);
    expect(m.log.events.filter((e) => e.kind === 'compliment' && e.by === 'a')).toHaveLength(1);
  });

  it('away from the desk, or too soon again, no microphone', () => {
    const { m, box } = carehome();
    place(m, 'a', at.x + TANNOY.range + 2, at.z, 0);
    tick(m);
    press(m, 'a', { interact: true });
    tick(m, 2);
    expect(box.events('g', 'dingdong')).toHaveLength(0);
    press(m, 'a', { interact: false });
    place(m, 'a', at.x, at.z - 0.6, 0);
    tick(m);
    press(m, 'a', { interact: true });
    tick(m, 2);
    expect(box.events('g', 'dingdong')).toHaveLength(1);
    m.handleChat('a', 'One.');
    press(m, 'a', { interact: false });
    tick(m);
    press(m, 'a', { interact: true });
    tick(m, 2);
    expect(box.events('g', 'dingdong')).toHaveLength(1);
  });

  it('only the care home has one', () => {
    expect(MAPS.manor.tannoy).toBeUndefined();
    expect(MAPS.carehome.tannoy).toBeDefined();
  });
});
