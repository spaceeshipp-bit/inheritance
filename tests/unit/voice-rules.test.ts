// Voice secrecy (review S2): a speaker sends each listener only what that
// listener may hear, so no client ever holds more than its player may hear.
// client/src/voice/rules.ts, pure functions (the WebAudio side is covered by
// tests/e2e/voice/run.mjs in real browsers).
import { describe, expect, it } from 'vitest';
import { HEARING_AID, SENSES, VOICE } from '../../shared/constants.js';
import { grandmaVoiceFilter } from '../../shared/senses.js';
import { FULL_BAND_HZ, SEND_MARGIN, sendTarget, voiceTarget, type Listener } from '../../client/src/voice/rules.js';

const grandma = (d: number, aidActive = false): Listener => ({ role: 'grandma', d, aidActive });
const cousin = (d: number): Listener => ({ role: 'cousin', d, aidActive: false });

describe('what a speaker sends each listener', () => {
  it('Grandma is sent exactly what her hearing lets through, at every distance', () => {
    for (let d = 0; d <= 14; d += 0.25) {
      for (const aid of [false, true]) {
        const sent = sendTarget('cousin', grandma(d, aid), false);
        const f = grandmaVoiceFilter(d, aid);
        expect(sent.band).toBe(f.band);
        expect(sent.gain).toBeCloseTo(f.gain, 9);
        if (f.gain > 0) expect(sent.lowpassHz).toBeCloseTo(Math.min(FULL_BAND_HZ, f.lowpassHz), 6);
      }
    }
  });

  it('nothing is sent to Grandma from beyond her hearing, nor a whisper past whisper range', () => {
    expect(sendTarget('cousin', grandma(SENSES.mumble + 0.1), false).gain).toBe(0);
    expect(sendTarget('cousin', grandma(VOICE.whisperRange + 0.1), true).gain).toBe(0);
    expect(sendTarget('cousin', grandma(VOICE.whisperRange - 0.1), true).gain).toBe(1);
    // Her hearing aid makes her hear clearly further, not through whispers.
    expect(sendTarget('cousin', grandma(HEARING_AID.clearRange - 0.1, true), false)).toMatchObject({ band: 'clear', gain: 1 });
    expect(sendTarget('cousin', grandma(VOICE.whisperRange + 0.1, true), true).gain).toBe(0);
  });

  it('a muffled voice is sent muffled: the low-pass is applied before it leaves', () => {
    const t = sendTarget('cousin', grandma((SENSES.clear + SENSES.muffled) / 2), false);
    expect(t.band).toBe('muffled');
    expect(t.lowpassHz).toBeLessThan(8000);
    expect(t.gain).toBeLessThan(1);
  });

  it('cousins are sent the voice within earshot (their client fades it) and nothing past it', () => {
    expect(sendTarget('cousin', cousin(3), false)).toMatchObject({ gain: 1, lowpassHz: FULL_BAND_HZ });
    expect(sendTarget('cousin', cousin(VOICE.cousinRange + SEND_MARGIN), false).gain).toBe(1);
    expect(sendTarget('cousin', cousin(VOICE.cousinRange + SEND_MARGIN + 0.01), false).gain).toBe(0);
    expect(sendTarget('cousin', cousin(VOICE.whisperRange + SEND_MARGIN + 0.01), true).gain).toBe(0);
    // Where the sender still sends, the listener's own fade has already reached zero.
    expect(voiceTarget('cousin', VOICE.cousinRange, false, false).gain).toBe(0);
    expect(voiceTarget('cousin', VOICE.whisperRange, true, false).gain).toBe(0);
  });

  it('nobody is sent anything they cannot be placed for, except by Grandma (who cannot see everyone)', () => {
    expect(sendTarget('cousin', null, false).gain).toBe(0);
    expect(sendTarget('cousin', grandma(Number.NaN), false).gain).toBe(0);
    expect(sendTarget('grandma', null, false).gain).toBe(1);
  });

  it('in the lobby everyone is sent everything', () => {
    expect(sendTarget('lobby', null, false)).toMatchObject({ gain: 1, lowpassHz: FULL_BAND_HZ });
    expect(sendTarget('lobby', grandma(50), true)).toMatchObject({ gain: 1, lowpassHz: FULL_BAND_HZ });
  });
});
