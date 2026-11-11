// Strict validation of everything a client sends. Anything malformed becomes
// null (and is dropped); numbers are clamped into range; strings are trimmed
// and stripped of control characters. The server never trusts a client shape.
import { QUICKCHAT } from '../shared/constants.js';
import type { ClientMsg, GrandmaAction, InputMsg, RtcSignal } from '../shared/protocol.js';
import type { MatchOptions } from '../shared/types.js';

/** Largest raw WebSocket frame we accept (SDP offers can be a few KB). */
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

// Control characters, zero-width and bidi-override characters.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069]', 'g');

/** Remove control characters and collapse whitespace. */
export function cleanText(s: string, max: number): string {
  return s.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function cleanName(v: unknown): string {
  const s = typeof v === 'string' ? cleanText(v.slice(0, 200), MAX_NAME) : '';
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
    if (typeof v.sdp !== 'string' || v.sdp.length > 60000) return null;
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
        if (protocol === null) return null;
        const room = typeof m.room === 'string' ? m.room.slice(0, 32) : '';
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

/** Token bucket for chat-like messages (quick lines, typed chat, tattles). */
export class RateLimiter {
  private tokens: number;
  private last: number;
  constructor(private capacity: number, private refillPerSec: number, now: number) {
    this.tokens = capacity;
    this.last = now;
  }
  take(now: number): boolean {
    this.tokens = Math.min(this.capacity, this.tokens + Math.max(0, now - this.last) * this.refillPerSec);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
