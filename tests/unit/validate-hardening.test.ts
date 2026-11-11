// Review findings S20 (hello hardening, invisible characters, "(bot)" names) and
// S3 (rtc signalling size and budget) at the validation layer.
import { describe, expect, it } from 'vitest';
import { LIMITS } from '../../server/limits.js';
import { MAX_CHAT, MAX_NAME, RateLimiter, cleanName, cleanText, parseClientMsg, rtcSize } from '../../server/validate.js';

const cp = (...c: number[]): string => String.fromCodePoint(...c);

/** Every invisible / format character the review named, plus the blank-looking letters people use for empty names. */
const INVISIBLES = [
  0x3164, 0xfeff, 0x00ad, 0x2060, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f,
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
  0x115f, 0x1160, 0xffa0, 0x2800, 0x034f, 0x180e, 0xe0041, 0xfe0f,
];

describe('S20: hello hardening', () => {
  it('a hello whose room is not a string is rejected, never read as "create a new room"', () => {
    for (const room of [12345, null, true, {}, ['ABCDE']]) {
      expect(parseClientMsg({ t: 'hello', name: 'H', room, protocol: 1 })).toBeNull();
    }
    expect(parseClientMsg({ t: 'hello', name: 'H', protocol: 1 })).toBeNull();
    expect(parseClientMsg({ t: 'hello', name: 'H', room: '', protocol: 1 })).toEqual({ t: 'hello', name: 'H', room: '', protocol: 1 });
  });

  it('names may not end in "(bot)", in any case, bracket or width, however often it is repeated', () => {
    expect(cleanName('Agatha (bot)')).toBe('Agatha');
    expect(cleanName('Agatha(BOT)')).toBe('Agatha');
    expect(cleanName('Dudley [bot]')).toBe('Dudley');
    expect(cleanName('Nana Dot （ｂｏｔ）')).toBe('Nana Dot');
    expect(cleanName('Bea (bot) (bot)')).toBe('Bea');
    // The 16-character cap must not leave a "(bot" behind either.
    expect(cleanName('Clementine (bot)xxxxx')).toBe('Clementine');
    expect(cleanName('Agatha(BOT) (bot)')).toBe('Agatha');
    expect(cleanName('(bot)')).toBe('Cousin');
    expect(cleanName('Robot')).toBe('Robot');
    expect(cleanName('Bot Bertie')).toBe('Bot Bertie');
  });

  it('invisible and format characters are removed from names and chat', () => {
    for (const c of INVISIBLES) {
      const name = cleanName(`Ber${cp(c)}tie`);
      expect(name, `U+${c.toString(16)}`).toBe('Bertie');
      const chat = parseClientMsg({ t: 'chat', text: `hi${cp(c)} there` });
      expect(chat, `U+${c.toString(16)}`).toEqual({ t: 'chat', text: 'hi there' });
    }
    // A name made only of fillers is no name at all.
    expect(cleanName(cp(0x3164, 0x3164, 0x200b, 0xfeff))).toBe('Cousin');
    // Chat made only of them is dropped.
    expect(parseClientMsg({ t: 'chat', text: cp(0x3164, 0x2800, 0x200b) })).toBeNull();
    // Controls and line separators still become spaces, ordinary letters and emoji survive.
    expect(cleanText(`a\nb${cp(0x2028)}c\td`, MAX_CHAT)).toBe('a b c d');
    expect(cleanName(`Zoë ${cp(0x1f600)}`)).toBe(`Zoë ${cp(0x1f600)}`);
  });

  it('stacked combining marks are capped and a length cap never splits an emoji', () => {
    expect(cleanText('a' + cp(0x301).repeat(400) + 'b', MAX_CHAT)).toBe('a' + cp(0x301).repeat(3) + 'b');
    const name = cleanName('abcdefghijklmno' + cp(0x1f600));
    expect(name).toBe('abcdefghijklmno');
    expect(name.length).toBeLessThanOrEqual(MAX_NAME);
  });
});

describe('S3: rtc signalling validation and budget', () => {
  it('SDPs over LIMITS.maxSdp (16 KB) are rejected; an audio-sized SDP passes', () => {
    expect(LIMITS.maxSdp).toBe(16 * 1024);
    const ok = parseClientMsg({ t: 'rtc', to: 'p2', data: { type: 'offer', sdp: 'v=0\r\n' + 'a'.repeat(4000) } });
    expect(ok?.t).toBe('rtc');
    expect(parseClientMsg({ t: 'rtc', to: 'p2', data: { type: 'answer', sdp: 'x'.repeat(LIMITS.maxSdp) } })?.t).toBe('rtc');
    expect(parseClientMsg({ t: 'rtc', to: 'p2', data: { type: 'answer', sdp: 'x'.repeat(LIMITS.maxSdp + 1) } })).toBeNull();
    expect(parseClientMsg({ t: 'rtc', to: 'p2', data: { type: 'offer', sdp: 'x'.repeat(59000) } })).toBeNull();
  });

  it('rtcSize counts what the relay forwards', () => {
    expect(rtcSize({ type: 'offer', sdp: 'x'.repeat(5000) })).toBe(5000);
    expect(rtcSize({ type: 'ice', candidate: null })).toBe(32);
    expect(rtcSize({ type: 'ice', candidate: { candidate: 'c'.repeat(100), sdpMid: '0', usernameFragment: 'abcd' } })).toBe(32 + 100 + 1 + 4);
  });

  it('a token bucket can charge more than one token, and says when it is full again', () => {
    const b = new RateLimiter(100, 10, 0);
    expect(b.take(0, 60)).toBe(true);
    expect(b.take(0, 60)).toBe(false); // 40 left
    expect(b.take(0, 40)).toBe(true);
    expect(b.idle(5)).toBe(false); // 50 back
    expect(b.idle(10)).toBe(true); // full
    expect(b.take(10)).toBe(true); // default cost 1
  });
});
