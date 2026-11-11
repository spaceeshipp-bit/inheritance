import { describe, expect, it } from 'vitest';
import { RateLimiter, cleanName, normRoomCode, parseClientMsg } from '../../server/validate.js';

describe('client message validation', () => {
  it('accepts well-formed messages', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'hello', name: 'Dot', room: 'abcde', protocol: 1 }))).toMatchObject({ t: 'hello', name: 'Dot' });
    expect(parseClientMsg({ t: 'start' })).toEqual({ t: 'start' });
    expect(parseClientMsg({ t: 'grandma', a: 'tut', target: 'p1' })).toEqual({ t: 'grandma', a: 'tut', target: 'p1' });
    expect(parseClientMsg({ t: 'quick', line: 3 })).toEqual({ t: 'quick', line: 3 });
    expect(parseClientMsg({ t: 'rtc', to: 'p2', data: { type: 'ice', candidate: null } })).toEqual({ t: 'rtc', to: 'p2', data: { type: 'ice', candidate: null } });
  });

  it('clamps input ranges and coerces buttons', () => {
    const m = parseClientMsg({ t: 'input', seq: 4.7, move: { x: 5, z: -5 }, yaw: 10, pitch: 9, run: 'yes', primary: true });
    expect(m).not.toBeNull();
    if (m?.t !== 'input') throw new Error('not input');
    expect(m.seq).toBe(4);
    expect(Math.hypot(m.move.x, m.move.z)).toBeCloseTo(1);
    expect(m.yaw).toBeGreaterThanOrEqual(-Math.PI);
    expect(m.yaw).toBeLessThanOrEqual(Math.PI);
    expect(m.pitch).toBeLessThanOrEqual(1.55);
    expect(m.run).toBe(false);
    expect(m.primary).toBe(true);
  });

  it('rejects malformed, out-of-range or unknown messages', () => {
    const bad: unknown[] = [
      'nope', '{"t":', 42, null, [], {}, { t: 'teleport' },
      { t: 'input', seq: 1, move: { x: NaN, z: 0 }, yaw: 0, pitch: 0 },
      { t: 'input', seq: 1, move: 'up', yaw: 0, pitch: 0 },
      { t: 'grandma', a: 'set', target: 'x', value: 'lots' },
      { t: 'grandma', a: 'launch' },
      { t: 'quick', line: 8 }, { t: 'quick', line: 1.5 },
      { t: 'chat', text: '   ' }, { t: 'chat', text: 7 },
      { t: 'rtc', to: 'p', data: { type: 'offer', sdp: 'x'.repeat(70000) } },
      { t: 'rtc', to: 'p', data: { type: 'bye' } },
      { t: 'vote', target: '' }, { t: 'ping', ts: 'now' },
      'x'.repeat(100000),
    ];
    for (const b of bad) expect(parseClientMsg(b)).toBeNull();
  });

  it('cleans chat text and names', () => {
    const m = parseClientMsg({ t: 'chat', text: '  hi\u0000 there‮ ' + 'x'.repeat(300) });
    if (m?.t !== 'chat') throw new Error('not chat');
    expect(m.text.startsWith('hi there')).toBe(true);
    expect(m.text.length).toBeLessThanOrEqual(140);
    expect(cleanName('')).toBe('Cousin');
    expect(cleanName(12)).toBe('Cousin');
    expect(cleanName('A very very long name indeed')).toHaveLength(16);
  });

  it('room codes: 5 of A–Z and 2–9 without I or O', () => {
    expect(normRoomCode('')).toBe('');
    expect(normRoomCode(' k7mzq ')).toBe('K7MZQ');
    expect(normRoomCode('ABCDI')).toBeNull();
    expect(normRoomCode('ABC0E')).toBeNull();
    expect(normRoomCode('ABCD')).toBeNull();
  });

  it('rate-limits chat with a token bucket', () => {
    const r = new RateLimiter(3, 1, 0);
    expect([r.take(0), r.take(0), r.take(0), r.take(0)]).toEqual([true, true, true, false]);
    expect(r.take(1.1)).toBe(true);
    expect(r.take(1.1)).toBe(false);
  });
});
