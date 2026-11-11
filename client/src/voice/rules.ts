// Proximity voice rules as pure functions (no DOM, no WebAudio), so they can be
// reasoned about and tested on their own. index.ts applies them to the audio
// graph every frame.
import { VOICE } from '../../../shared/constants.js';
import { grandmaVoiceFilter, type HearingBand } from '../../../shared/senses.js';
import type { Vec3 } from '../../../shared/types.js';

export type ListenerRole = 'grandma' | 'cousin' | 'lobby';

/** "No filter" low-pass cutoff (below Nyquist at 44.1 and 48 kHz). */
export const FULL_BAND_HZ = 20000;
/** Cousins: full volume inside this distance, then inverse-distance falloff. */
export const COUSIN_REF_DISTANCE = 2;
/** The last metres before VOICE.cousinRange fade linearly to silence (no hard step). */
export const COUSIN_EDGE_FADE = 3;
/** Same for a whisper's VOICE.whisperRange. */
export const WHISPER_EDGE_FADE = 0.4;
/** Smoothing time constant (s) for gain / cutoff / position changes (setTargetAtTime). */
export const SMOOTHING = 0.04;

export interface VoiceTarget {
  /** Linear gain 0..1 applied after the low-pass. */
  gain: number;
  /** Low-pass cutoff in Hz. */
  lowpassHz: number;
  band: HearingBand;
}

const LOBBY: VoiceTarget = { gain: 1, lowpassHz: FULL_BAND_HZ, band: 'clear' };

/**
 * What a listener hears of one speaker at distance `d` (metres).
 * - lobby: everyone at full volume (mic check).
 * - grandma: shared/senses.ts grandmaVoiceFilter() drives gain and cutoff; a
 *   whispering speaker is silent beyond VOICE.whisperRange.
 * - cousin: inverse-distance falloff past COUSIN_REF_DISTANCE, fading to zero at
 *   VOICE.cousinRange (VOICE.whisperRange when the speaker whispers), zero beyond.
 */
export function voiceTarget(role: ListenerRole, d: number, whispering: boolean, aidActive: boolean): VoiceTarget {
  if (role === 'lobby') return LOBBY;
  if (!Number.isFinite(d)) return { gain: 0, lowpassHz: FULL_BAND_HZ, band: 'silent' };
  if (role === 'grandma') {
    const f = grandmaVoiceFilter(d, aidActive, whispering ? VOICE.whisperRange : Infinity);
    return { gain: f.gain, lowpassHz: Math.min(FULL_BAND_HZ, f.lowpassHz), band: f.band };
  }
  const range = whispering ? VOICE.whisperRange : VOICE.cousinRange;
  if (d > range) return { gain: 0, lowpassHz: FULL_BAND_HZ, band: 'silent' };
  const fade = whispering ? WHISPER_EDGE_FADE : COUSIN_EDGE_FADE;
  const edge = Math.min(1, Math.max(0, (range - d) / fade));
  const falloff = COUSIN_REF_DISTANCE / Math.max(d, COUSIN_REF_DISTANCE);
  const gain = falloff * edge;
  return { gain, lowpassHz: FULL_BAND_HZ, band: gain > 0 ? 'clear' : 'silent' };
}

/**
 * Direction of `p` as seen by a listener at `listener` facing `yaw` (0 = -Z,
 * three.js convention), in listener space: +X right, +Y up, -Z ahead.
 * Unit length; straight ahead when the points coincide. The voice graph keeps the
 * WebAudio listener fixed at the origin and moves each speaker's panner instead.
 */
export function relativeDirection(listener: Vec3, yaw: number, p: Vec3): Vec3 {
  const dx = p.x - listener.x, dy = p.y - listener.y, dz = p.z - listener.z;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const right = dx * c - dz * s;
  const ahead = -dx * s - dz * c;
  const len = Math.hypot(right, dy, ahead);
  if (len < 1e-3) return { x: 0, y: 0, z: -1 };
  return { x: right / len, y: dy / len, z: -ahead / len };
}

/** RMS amplitude (0..1 full scale) to a 0..1 activity level: -58 dBFS → 0, -14 dBFS → 1. */
export function levelFromRms(rms: number): number {
  if (!(rms > 0)) return 0;
  const db = 20 * Math.log10(rms);
  return Math.min(1, Math.max(0, (db + 58) / 44));
}

/** RMS of a time-domain buffer. */
export function rmsOf(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / Math.max(1, buf.length));
}

/** Noise gate thresholds (dBFS RMS, after the browser's noise suppression / AGC). */
export const GATE = {
  openDb: -50,
  closeDb: -56,
  /** Keep the gate open this long after the level drops (ms). */
  holdMs: 280,
  /** Gain ramp time constants (s). */
  attack: 0.005,
  release: 0.06,
  /** Look-ahead delay on the sent signal so the gate does not clip word onsets (s). */
  lookahead: 0.02,
} as const;
