// Grandma's senses as pure functions. The server uses them for game logic
// (moments, "found" evidence, scrambling text she reads); the client uses them
// for her audio filter, her blurred view and the cousins' "Nana Senses" HUD.
import { HEARING_AID, SENSES, SPECTACLES, STORM } from './constants.js';
import type { Vec3 } from './types.js';

export type HearingBand = 'clear' | 'muffled' | 'mumble' | 'silent';
export type VisionBand = 'sharp' | 'soft' | 'heavy' | 'shapes' | 'none';

export interface GrandmaSenseState {
  pos: Vec3;
  /** Facing angle in radians around +Y; 0 looks down -Z (three.js convention). */
  yaw: number;
  aidActive: boolean;
  specsActive: boolean;
  /** Spectacles knocked off: everything past `clear` is heavy blur at best. */
  specsOff: boolean;
  /** The Storm: power out and no lightning flash right now. */
  dark?: boolean;
  /** The Storm: a lightning flash is lighting the house. */
  flash?: boolean;
}

export function dist(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function flatDist(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Unit forward vector for a yaw (0 = -Z). */
export function forward(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** Angle in degrees between Grandma's facing and the direction to `p` (flat). */
export function angleFromFacing(g: { pos: Vec3; yaw: number }, p: Vec3): number {
  const f = forward(g.yaw);
  const dx = p.x - g.pos.x, dz = p.z - g.pos.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return 0;
  const dot = (f.x * dx + f.z * dz) / len;
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

/**
 * What Grandma hears of a voice at distance `d`.
 * `speakerRange` lets whisper shrink a voice (a whisper never reaches her beyond 1.5 m).
 */
export function hearingBand(d: number, aidActive: boolean, speakerRange = Infinity): HearingBand {
  if (d > speakerRange) return 'silent';
  const clear = aidActive ? HEARING_AID.clearRange : SENSES.clear;
  if (d <= clear) return 'clear';
  if (d <= SENSES.muffled) return 'muffled';
  if (d <= SENSES.mumble) return 'mumble';
  return 'silent';
}

/**
 * Audio parameters for Grandma's filter on a voice at distance `d`:
 * gain (0..1) and low-pass cutoff in Hz. Clear = full band; muffled sweeps the
 * cutoff from 8 kHz down to 800 Hz with -12 dB; mumble = 300 Hz, quiet; silent = 0.
 */
export function grandmaVoiceFilter(d: number, aidActive: boolean, speakerRange = Infinity): { gain: number; lowpassHz: number; band: HearingBand } {
  const band = hearingBand(d, aidActive, speakerRange);
  const clear = aidActive ? HEARING_AID.clearRange : SENSES.clear;
  switch (band) {
    case 'clear':
      return { gain: 1, lowpassHz: 20000, band };
    case 'muffled': {
      const t = (d - clear) / Math.max(0.001, SENSES.muffled - clear);
      const hz = 8000 * Math.pow(SENSES.muffledLowpassHz / 8000, t);
      const db = SENSES.muffledGainDb * t;
      return { gain: Math.pow(10, db / 20), lowpassHz: hz, band };
    }
    case 'mumble':
      return { gain: 0.18, lowpassHz: 300, band };
    default:
      return { gain: 0, lowpassHz: 300, band };
  }
}

/**
 * How clearly Grandma sees a point (geometry only: line of sight through walls
 * is checked separately with shared/sight.ts).
 * - Outside her view cone: nothing.
 * - The Storm, power out: her candle shows faces within STORM.candleClear and
 *   shapes to STORM.candleDim; beyond that, nothing.
 * - Daylight, or a lightning flash (which lights the house like daylight, no
 *   better): sharp to 2 m (8 m with spectacles on), soft blur to 6 m, heavy
 *   blur to 10 m, shapes beyond. Knocked-off spectacles: soft at best.
 */
export function visionBand(g: GrandmaSenseState, p: Vec3): VisionBand {
  const d = dist(g.pos, p);
  const specsOn = g.specsActive && !g.specsOff;
  const halfAngle = specsOn ? SPECTACLES.coneHalfAngleDeg : SENSES.coneHalfAngleDeg;
  if (angleFromFacing(g, p) > halfAngle) return 'none';
  if (g.dark && !g.flash) return d <= STORM.candleClear ? 'soft' : d <= STORM.candleDim ? 'heavy' : 'none';
  if (g.specsOff) return d <= SENSES.clear ? 'soft' : d <= SENSES.mumble ? 'heavy' : 'shapes';
  if (specsOn && d <= SPECTACLES.sharpRange) return 'sharp';
  if (d <= SENSES.clear) return 'sharp';
  if (d <= SENSES.muffled) return 'soft';
  if (d <= SENSES.mumble) return 'heavy';
  return 'shapes';
}

/** "She saw you do it": sharp or soft vision. Used for Caught Red-Handed and Love You, Nana. */
export function canSee(g: GrandmaSenseState, p: Vec3): boolean {
  const b = visionBand(g, p);
  return b === 'sharp' || b === 'soft';
}

/** Can Grandma identify who someone is (colour band readable)? */
export function canIdentify(g: GrandmaSenseState, p: Vec3): boolean {
  const b = visionBand(g, p);
  return b === 'sharp' || b === 'soft';
}

/**
 * Text as Grandma reads a speech bubble from distance `d`.
 * Clear: as typed. Muffled: about a third of letters replaced. Mumble: "…".
 * Deterministic for a given (text, seed) so every render is the same.
 */
export function scrambleText(text: string, band: HearingBand, seed = 1): string {
  if (band === 'clear') return text;
  if (band === 'mumble' || band === 'silent') return '…';
  const junk = '#*@%&?~';
  let s = seed >>> 0 || 1;
  const rand = () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 0xffffffff;
  };
  let out = '';
  for (const ch of text) {
    if (/[a-z0-9]/i.test(ch) && rand() < 0.35) out += junk[Math.floor(rand() * junk.length)];
    else out += ch;
  }
  return out;
}
