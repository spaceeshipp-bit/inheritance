import { describe, expect, it } from 'vitest';
import { HEARING_AID, SENSES, SPECTACLES, VOICE } from '../../shared/constants.js';
import {
  angleFromFacing, canIdentify, canSee, forward, grandmaVoiceFilter, hearingBand, scrambleText, visionBand,
  type GrandmaSenseState,
} from '../../shared/senses.js';

const nana = (over: Partial<GrandmaSenseState> = {}): GrandmaSenseState => ({
  pos: { x: 0, y: 0, z: 0 }, yaw: 0, aidActive: false, specsActive: false, specsOff: false, ...over,
});
/** A point `d` metres in front of a Grandma facing -Z (yaw 0). */
const ahead = (d: number) => ({ x: 0, y: 0, z: -d });

describe("Grandma's hearing", () => {
  it('follows the senses table by distance', () => {
    expect(hearingBand(1, false)).toBe('clear');
    expect(hearingBand(SENSES.clear, false)).toBe('clear');
    expect(hearingBand(3, false)).toBe('muffled');
    expect(hearingBand(8, false)).toBe('mumble');
    expect(hearingBand(11, false)).toBe('silent');
  });

  it('the hearing aid makes voices clear out to 6 m', () => {
    expect(hearingBand(5, true)).toBe('clear');
    expect(hearingBand(HEARING_AID.clearRange + 0.5, true)).toBe('mumble');
  });

  it('a whisper never reaches her beyond 1.5 m', () => {
    expect(hearingBand(1.2, false, VOICE.whisperRange)).toBe('clear');
    expect(hearingBand(2, false, VOICE.whisperRange)).toBe('silent');
    expect(hearingBand(2, true, VOICE.whisperRange)).toBe('silent');
  });

  it('the voice filter gets darker and quieter with distance', () => {
    const near = grandmaVoiceFilter(1, false);
    const mid = grandmaVoiceFilter(4, false);
    const far = grandmaVoiceFilter(5.9, false);
    const mumble = grandmaVoiceFilter(8, false);
    expect(near.gain).toBe(1);
    expect(mid.lowpassHz).toBeLessThan(8000);
    expect(far.lowpassHz).toBeLessThan(mid.lowpassHz);
    expect(far.gain).toBeLessThan(mid.gain);
    expect(mumble.band).toBe('mumble');
    expect(grandmaVoiceFilter(20, false).gain).toBe(0);
  });
});

describe("Grandma's sight", () => {
  it('forward() and the cone match three.js yaw (0 looks down -Z)', () => {
    expect(forward(0).z).toBeCloseTo(-1);
    expect(forward(-Math.PI / 2).x).toBeCloseTo(1);
    expect(angleFromFacing(nana(), ahead(3))).toBeCloseTo(0);
    expect(angleFromFacing(nana(), { x: 0, y: 0, z: 3 })).toBeCloseTo(180);
  });

  it('blurs with distance in front and sees nothing behind', () => {
    expect(visionBand(nana(), ahead(1))).toBe('sharp');
    expect(visionBand(nana(), ahead(4))).toBe('soft');
    expect(visionBand(nana(), ahead(8))).toBe('heavy');
    expect(visionBand(nana(), ahead(12))).toBe('shapes');
    expect(visionBand(nana(), { x: 0, y: 0, z: 2 })).toBe('none');
    // Just outside the 55° half-angle.
    const a = ((SENSES.coneHalfAngleDeg + 5) * Math.PI) / 180;
    expect(visionBand(nana(), { x: Math.sin(a) * 2, y: 0, z: -Math.cos(a) * 2 })).toBe('none');
  });

  it('spectacles sharpen at distance but narrow the cone', () => {
    const g = nana({ specsActive: true });
    expect(visionBand(g, ahead(7))).toBe('sharp');
    const a = ((SPECTACLES.coneHalfAngleDeg + 10) * Math.PI) / 180;
    expect(visionBand(g, { x: Math.sin(a) * 2, y: 0, z: -Math.cos(a) * 2 })).toBe('none');
  });

  it('knocked-off spectacles blur everything', () => {
    const g = nana({ specsOff: true });
    expect(visionBand(g, ahead(1))).toBe('soft');
    expect(visionBand(g, ahead(4))).toBe('heavy');
    expect(canSee(g, ahead(4))).toBe(false);
  });

  it('the Storm: almost blind in the dark, sharp in a lightning flash', () => {
    expect(visionBand(nana({ dark: true }), ahead(3))).toBe('none');
    expect(visionBand(nana({ dark: true }), ahead(1))).toBe('heavy');
    expect(visionBand(nana({ dark: true, flash: true }), ahead(5))).toBe('sharp');
  });

  it('canSee / canIdentify = sharp or soft', () => {
    expect(canSee(nana(), ahead(5))).toBe(true);
    expect(canIdentify(nana(), ahead(5))).toBe(true);
    expect(canSee(nana(), ahead(7))).toBe(false);
    expect(canSee(nana(), { x: 0, y: 0, z: 1 })).toBe(false);
  });
});

describe('scrambled text', () => {
  it('clear text is untouched; mumble and silence are an ellipsis', () => {
    expect(scrambleText('Love you, Nana!', 'clear')).toBe('Love you, Nana!');
    expect(scrambleText('Love you, Nana!', 'mumble')).toBe('…');
    expect(scrambleText('Love you, Nana!', 'silent')).toBe('…');
  });

  it('muffled text loses some letters, keeps its shape, and is deterministic', () => {
    const text = 'It was HIM, he broke the vase in the gallery!';
    const a = scrambleText(text, 'muffled', 7);
    expect(a).not.toBe(text);
    expect([...a].length).toBe([...text].length);
    expect(scrambleText(text, 'muffled', 7)).toBe(a);
    // Spaces and punctuation survive.
    expect(a.split(' ').length).toBe(text.split(' ').length);
  });
});
