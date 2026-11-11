// Abuse limits for the game server, in one place: per-address caps, the hello
// timeout, whole-server caps, abandoned matches, the WebRTC signalling relay and
// slow readers. Tests override some of them (ServerOptions.limits,
// RoomManagerOptions.limits); everything else reads LIMITS.
//
// "Address" means the client's IP as the server sees it. Behind a reverse proxy
// or a tunnel every client arrives from the proxy, so set TRUST_PROXY=1 (or the
// number of proxy hops in front of the server) and the address is taken from
// X-Forwarded-For instead. Loopback is exempt from the per-address caps, so a
// local proxy without TRUST_PROXY, local tests and tunnels keep working; the
// whole-server caps still apply to them.
import { isIP, isIPv6 } from 'node:net';
import type { IncomingMessage } from 'node:http';

export interface Limits {
  /** Open WebSockets per client address (IPv6: per /64). */
  socketsPerIp: number;
  /** New rooms one address may create per minute (a bucket of this many that refills over a minute). */
  roomsPerIpPerMinute: number;
  /** Seconds a socket may stay open without joining a room with a valid hello. */
  helloTimeout: number;
  /** Rooms open at once on the whole server. */
  maxRooms: number;
  /** Matches running at once on the whole server. */
  maxMatches: number;
  /**
   * Seconds a match keeps running with no participant connected before it is
   * stopped and the room goes back to the lobby (a lone player reloading the
   * page is back well inside this).
   */
  idleMatchGrace: number;
  /** Seconds a room with nobody connected stays open. */
  emptyRoomTtl: number;
  /** Every frame a socket sends: bucket size and refill per second... */
  frameBurst: number;
  framesPerSec: number;
  /** ...and bytes (a player sends ~10 KB/s of inputs and pings, plus a few KB of signalling per peer). */
  frameBytesBurst: number;
  frameBytesPerSec: number;
  /** Frames over those budgets a socket may send (bucket, refill per second) before it is closed as a flood. */
  floodStrikes: number;
  floodStrikesPerSec: number;
  /** WebRTC signalling relayed per sender: messages (bucket, refill per second)... */
  rtcBurst: number;
  rtcPerSec: number;
  /** ...and characters of signalling (bucket, refill per second), so nobody can pump big SDPs at a peer. */
  rtcCharsBurst: number;
  rtcCharsPerSec: number;
  /** Longest SDP (offer or answer) the relay accepts, in characters. An audio offer is 2-5 KB. */
  maxSdp: number;
  /** Lobby changes per player (each is broadcast to the room): bucket and refill per second. */
  lobbyBurst: number;
  lobbyPerSec: number;
  /** Outbound queue per socket in bytes: above `snapBacklog` snapshots are skipped... */
  snapBacklog: number;
  /** ...and above `maxBacklog` (any message) the socket is dropped; the player can rejoin with their token. */
  maxBacklog: number;
  /** Seconds between "match in progress" lobby refreshes to players who are not in the running match. */
  spectatorRefresh: number;
}

export const LIMITS: Readonly<Limits> = {
  socketsPerIp: 8,
  roomsPerIpPerMinute: 6,
  helloTimeout: 10,
  maxRooms: 200,
  maxMatches: 100,
  idleMatchGrace: 30,
  emptyRoomTtl: 120,
  frameBurst: 200,
  framesPerSec: 120,
  frameBytesBurst: 512 * 1024,
  frameBytesPerSec: 128 * 1024,
  floodStrikes: 400,
  floodStrikesPerSec: 40,
  rtcBurst: 40,
  rtcPerSec: 20,
  rtcCharsBurst: 128 * 1024,
  rtcCharsPerSec: 32 * 1024,
  maxSdp: 16 * 1024,
  lobbyBurst: 10,
  lobbyPerSec: 4,
  snapBacklog: 512 * 1024,
  maxBacklog: 1024 * 1024,
  spectatorRefresh: 2,
};

export function limitsWith(over?: Partial<Limits>): Limits {
  return { ...LIMITS, ...over };
}

/** TRUST_PROXY: unset/0 = ignore X-Forwarded-For; 1 (or "true") = one proxy in front; n = n proxy hops. */
export function trustProxyHops(v: string | undefined): number {
  if (!v) return 0;
  if (v.trim().toLowerCase() === 'true') return 1;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 10) : 0;
}

/**
 * The address a connection counts against. With `trustHops` proxies in front,
 * it is the entry those proxies appended to X-Forwarded-For (entries further
 * left were written by the client and can be forged). '' = exempt (loopback).
 */
export function clientAddress(req: IncomingMessage, trustHops: number): string {
  let addr = req.socket.remoteAddress ?? '';
  if (trustHops > 0) {
    const raw = req.headers['x-forwarded-for'];
    const list = (Array.isArray(raw) ? raw.join(',') : raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const fwd = list.length ? list[Math.max(0, list.length - trustHops)] : '';
    if (isIP(stripZone(fwd))) addr = fwd;
  }
  return addressKey(addr);
}

function stripZone(a: string): string {
  const i = a.indexOf('%');
  return i >= 0 ? a.slice(0, i) : a;
}

/** Normalise an IP into a rate-limit key: IPv4-mapped IPv6 → IPv4, IPv6 → its /64, loopback → ''. */
export function addressKey(raw: string): string {
  let a = stripZone(raw.trim().toLowerCase());
  if (a.startsWith('::ffff:') && isIP(a.slice(7)) === 4) a = a.slice(7);
  if (isIP(a) === 4) return a.startsWith('127.') ? '' : a;
  if (!isIPv6(a)) return a.slice(0, 64);
  const g = expandV6(a);
  if (!g) return a.slice(0, 64);
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return ''; // ::1
  return `${g.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64`;
}

/** The eight 16-bit groups of a valid IPv6 address (an IPv4 tail counts as two). */
function expandV6(a: string): number[] | null {
  const parse = (part: string): number[] => {
    if (!part) return [];
    const out: number[] = [];
    for (const s of part.split(':')) {
      if (s.includes('.')) {
        const q = s.split('.').map(Number);
        out.push((q[0] << 8) | q[1], (q[2] << 8) | q[3]);
      } else out.push(parseInt(s, 16));
    }
    return out;
  };
  const dbl = a.indexOf('::');
  const head = parse(dbl >= 0 ? a.slice(0, dbl) : a);
  const tail = dbl >= 0 ? parse(a.slice(dbl + 2)) : [];
  const zeros = 8 - head.length - tail.length;
  if (zeros < 0 || (dbl < 0 && zeros !== 0)) return null;
  const g = [...head, ...new Array<number>(zeros).fill(0), ...tail];
  return g.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? g : null;
}
