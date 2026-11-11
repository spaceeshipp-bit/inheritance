// Strict validation of everything a client sends. Anything malformed becomes
// null (and is dropped); numbers are clamped into range; strings are trimmed
// and stripped of control characters. The server never trusts a client shape.
import { QUICKCHAT } from '../shared/constants.js';
import type { ClientMsg, GrandmaAction, InputMsg, RtcSignal } from '../shared/protocol.js';
import type { MatchOptions } from '../shared/types.js';
import { LIMITS } from './limits.js';

/** Largest raw WebSocket frame we accept (SDP offers are a few KB; see LIMITS.maxSdp). */
export const MAX_FRAME_BYTES = 64 * 1024;
export const MAX_NAME = 16;
export const MAX_CHAT = 140;
const MAX_ID = 64;

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, lo: number, hi: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(hi, Math.max(lo, v));
}

function bool(v: unknown): boolean {
  return v === true;
}

function id(v: unknown): string | null {
  if (typeof v !== 'string' || v.length === 0 || v.length > MAX_ID) return null;
  return v;
}

// C0/C1 control characters and line/paragraph separators become spaces.
const CONTROL_CHARS = /[\u{0}-\u{1f}\u{7f}-\u{9f}\u{2028}\u{2029}]/gu;
// Invisible characters are removed outright: every Unicode format character
// (Cf: soft hyphen U+00AD, zero-widths U+200B-U+200F, bidi controls
// U+202A-U+202E and U+2066-U+2069, word joiner U+2060, BOM U+FEFF, tag
// characters...), private-use and lone surrogate code points, and the
// blank-looking characters that are not Cf: Hangul fillers (U+115F, U+1160,
// U+3164, U+FFA0), Braille blank U+2800, combining grapheme joiner U+034F,
// Khmer inherent vowels U+17B4-U+17B5, Mongolian variation selectors and the
// variation selectors U+FE00-U+FE0F / U+E0100-U+E01EF.
const INVISIBLE = /[\p{Cf}\p{Co}\p{Cs}\u{34f}\u{115f}\u{1160}\u{17b4}\u{17b5}\u{180b}-\u{180d}\u{180f}\u{2800}\u{3164}\u{fe00}-\u{fe0f}\u{ffa0}\u{e0100}-\u{e01ef}]/gu;
/** More than three combining marks in a row is "Zalgo" text that spills over its neighbours. */
const MARK_RUN = /(\p{M}{3})\p{M}+/gu;
/** A high surrogate with nothing after it (a length cap can cut an emoji in half). */
const HALF_PAIR_AT_END = /\p{Cs}$/u;
/** "(bot)" marks the server's bots in names; a human may not wear it (nor "(bot" cut short by the length cap). */
const BOT_TAG = /[([{]\s*bot\s*[)\]}]?$/i;

/** Remove control and invisible characters, tame stacked accents, collapse whitespace, cap the length. */
export function cleanText(s: string, max: number): string {
  return s.replace(CONTROL_CHARS, ' ').replace(INVISIBLE, '').replace(MARK_RUN, '$1')
    .replace(/\s+/g, ' ').trim().slice(0, max)
    .replace(HALF_PAIR_AT_END, '') // never end on half a surrogate pair
    .trim();
}

export function cleanName(v: unknown): string {
  let s = typeof v === 'string' ? cleanText(v.slice(0, 200).normalize('NFKC'), MAX_NAME) : '';
  for (let prev = ''; prev !== s;) {
    prev = s;
    s = s.replace(BOT_TAG, '').trim();
  }
  return s.length > 0 ? s : 'Cousin';
}

const ROOM_CODE = /^[A-HJ-NP-Z2-9]{5}$/;
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Normalise a room code; '' means "create a new room"; null means invalid. */
export function normRoomCode(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toUpperCase();
  if (s === '') return '';
  return ROOM_CODE.test(s) ? s : null;
}

function parseOptions(v: unknown): Partial<MatchOptions> | undefined {
  if (!isObj(v)) return undefined;
  const out: Partial<MatchOptions> = {};
  if (typeof v.fullMatch === 'boolean') out.fullMatch = v.fullMatch;
  if (typeof v.fillBots === 'boolean') out.fillBots = v.fillBots;
  if (typeof v.pushGrandma === 'boolean') out.pushGrandma = v.pushGrandma;
  return out;
}

function parseInput(m: Obj): InputMsg | null {
  const seq = num(m.seq, 0, Number.MAX_SAFE_INTEGER);
  if (seq === null || !isObj(m.move)) return null;
  let mx = num(m.move.x, -1, 1), mz = num(m.move.z, -1, 1);
  if (mx === null || mz === null) return null;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const yaw = num(m.yaw, -1e6, 1e6);
  const pitch = num(m.pitch, -1.55, 1.55);
  if (yaw === null || pitch === null) return null;
  return {
    t: 'input', seq: Math.floor(seq), move: { x: mx, z: mz },
    yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)), pitch,
    run: bool(m.run), sneak: bool(m.sneak), jump: bool(m.jump), whisper: bool(m.whisper),
    primary: bool(m.primary), secondary: bool(m.secondary), shove: bool(m.shove),
    interact: bool(m.interact), plant: bool(m.plant),
  };
}

function parseGrandma(m: Obj): ({ t: 'grandma' } & GrandmaAction) | null {
  switch (m.a) {
    case 'bless':
    case 'tut': {
      const target = id(m.target);
      return target ? { t: 'grandma', a: m.a, target } : null;
    }
    case 'set': {
      const target = id(m.target);
      const value = num(m.value, 0, 100);
      return target && value !== null ? { t: 'grandma', a: 'set', target, value: Math.round(value) } : null;
    }
    case 'parchment':
      return typeof m.open === 'boolean' ? { t: 'grandma', a: 'parchment', open: m.open } : null;
    case 'summon':
      return { t: 'grandma', a: 'summon' };
    case 'pin': {
      const item = id(m.item);
      return item ? { t: 'grandma', a: 'pin', item } : null;
    }
    default:
      return null;
  }
}

function parseRtc(v: unknown): RtcSignal | null {
  if (!isObj(v)) return null;
  if (v.type === 'offer' || v.type === 'answer') {
    if (typeof v.sdp !== 'string' || v.sdp.length > LIMITS.maxSdp) return null;
    return { type: v.type, sdp: v.sdp };
  }
  if (v.type === 'ice') {
    if (v.candidate === null) return { type: 'ice', candidate: null };
    const c = v.candidate;
    if (!isObj(c)) return null;
    const cand: RTCIceCandidateInit = {};
    if (typeof c.candidate === 'string' && c.candidate.length <= 2000) cand.candidate = c.candidate;
    else if (c.candidate !== undefined) return null;
    if (typeof c.sdpMid === 'string' && c.sdpMid.length <= 64) cand.sdpMid = c.sdpMid;
    else if (c.sdpMid === null) cand.sdpMid = null;
    if (typeof c.sdpMLineIndex === 'number' && Number.isInteger(c.sdpMLineIndex) && c.sdpMLineIndex >= 0 && c.sdpMLineIndex < 64) cand.sdpMLineIndex = c.sdpMLineIndex;
    else if (c.sdpMLineIndex === null) cand.sdpMLineIndex = null;
    if (typeof c.usernameFragment === 'string' && c.usernameFragment.length <= 256) cand.usernameFragment = c.usernameFragment;
    return { type: 'ice', candidate: cand };
  }
  return null;
}

/** Parse one raw frame into a validated ClientMsg, or null. Never throws. */
export function parseClientMsg(raw: unknown): ClientMsg | null {
  try {
    let data: unknown = raw;
    if (typeof raw === 'string') {
      if (raw.length > MAX_FRAME_BYTES) return null;
      data = JSON.parse(raw);
    }
    if (!isObj(data) || typeof data.t !== 'string') return null;
    const m = data;
    switch (m.t) {
      case 'hello': {
        const protocol = num(m.protocol, -1e9, 1e9);
        // The room must be a string ('' asks for a new room): anything else is a
        // broken client, never a request for a fresh room.
        if (protocol === null || typeof m.room !== 'string') return null;
        const room = m.room.slice(0, 32);
        const token = typeof m.token === 'string' && m.token.length <= 128 ? m.token : undefined;
        return { t: 'hello', name: cleanName(m.name), room, protocol, ...(token ? { token } : {}) };
      }
      case 'lobby': {
        const out: ClientMsg = { t: 'lobby' };
        if (typeof m.willingGrandma === 'boolean') out.willingGrandma = m.willingGrandma;
        const options = parseOptions(m.options);
        if (options) out.options = options;
        return out;
      }
      case 'start':
        return { t: 'start' };
      case 'input':
        return parseInput(m);
      case 'grandma':
        return parseGrandma(m);
      case 'quick': {
        const line = num(m.line, -1, 99);
        if (line === null || !Number.isInteger(line) || line < 0 || line >= QUICKCHAT.cousin.length) return null;
        return { t: 'quick', line };
      }
      case 'chat': {
        if (typeof m.text !== 'string') return null;
        const text = cleanText(m.text.slice(0, 1000), MAX_CHAT);
        return text.length > 0 ? { t: 'chat', text } : null;
      }
      case 'tattle': {
        const accused = id(m.accused);
        return accused ? { t: 'tattle', accused } : null;
      }
      case 'vote': {
        const target = id(m.target);
        return target ? { t: 'vote', target } : null;
      }
      case 'rtc': {
        const to = id(m.to);
        const sig = parseRtc(m.data);
        return to && sig ? { t: 'rtc', to, data: sig } : null;
      }
      case 'ping': {
        const ts = num(m.ts, -1e15, 1e15);
        return ts === null ? null : { t: 'ping', ts };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Characters of signalling in one relayed `rtc` message (what the relay's character budget counts). */
export function rtcSize(sig: RtcSignal): number {
  if (sig.type !== 'ice') return sig.sdp.length;
  const c = sig.candidate;
  return 32 + (c ? (c.candidate?.length ?? 0) + (c.sdpMid?.length ?? 0) + (c.usernameFragment?.length ?? 0) : 0);
}

/** Token bucket: chat-like messages, frames per socket, the rtc relay, room creation per address. */
export class RateLimiter {
  private tokens: number;
  private last: number;
  constructor(private capacity: number, private refillPerSec: number, now: number) {
    this.tokens = capacity;
    this.last = now;
  }
  private refill(now: number): void {
    this.tokens = Math.min(this.capacity, this.tokens + Math.max(0, now - this.last) * this.refillPerSec);
    this.last = Math.max(this.last, now);
  }
  /** Spend `cost` tokens if there are that many. */
  take(now: number, cost = 1): boolean {
    this.refill(now);
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
  /** The bucket is full again: forgetting it would lose nothing. */
  idle(now: number): boolean {
    this.refill(now);
    return this.tokens >= this.capacity;
  }
}
