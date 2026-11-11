// Typed WebSocket client: hello/welcome, reconnect with the rejoin token,
// ping/pong clock sync (server match time), JSON framing.
// The transport is injectable so the dev mock (src/dev/mock.ts) can stand in
// for a real server while exercising exactly the same code path.
import { PROTOCOL_VERSION } from '../../shared/constants.js';
import { encode, type ClientMsg, type ServerMsg } from '../../shared/protocol.js';
import { localSec } from './util.js';

export type NetStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

/** A bidirectional string pipe (a WebSocket or the mock). */
export interface Link {
  send(data: string): void;
  close(): void;
}
export interface LinkHandlers {
  open(): void;
  message(data: string): void;
  close(): void;
}
export type LinkFactory = (h: LinkHandlers) => Link;

/** The default link: a WebSocket to /ws on the page's own host. */
export function webSocketLink(url = defaultWsUrl()): LinkFactory {
  return (h) => {
    const ws = new WebSocket(url);
    ws.onopen = () => h.open();
    ws.onmessage = (e) => h.message(typeof e.data === 'string' ? e.data : String(e.data));
    ws.onclose = () => h.close();
    ws.onerror = () => { /* onclose follows */ };
    return {
      send: (s) => { if (ws.readyState === WebSocket.OPEN) ws.send(s); },
      close: () => ws.close(),
    };
  };
}

export function defaultWsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

const TOKEN_KEY = 'inheritance.rejoin';

interface SavedToken { room: string; token: string; name: string; at: number }

function loadToken(room: string): SavedToken | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as SavedToken;
    return t.room === room ? t : null;
  } catch { return null; }
}
function saveToken(t: SavedToken | null): void {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t));
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable */ }
}

export class Net {
  status: NetStatus = 'idle';
  /** Round trip time in seconds (best recent sample). */
  rtt = 0.06;
  selfId = '';
  room = '';
  onMessage: (m: ServerMsg) => void = () => {};
  onStatus: (s: NetStatus) => void = () => {};

  private link: Link | null = null;
  private isOpen = false;
  private wantOpen = false;
  private welcomed = false;
  private name = '';
  private token = '';
  private sentToken = false;
  private retries = 0;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private pings = 0;
  /** serverTime - localTime from ping/pong (min-RTT filtered). */
  private pongOffset: number | null = null;
  private pongSamples: { rtt: number; off: number }[] = [];
  /** serverTime - arrivalTime from snapshots (max over a window = least delayed). */
  private snapSamples: number[] = [];
  private snapOffset: number | null = null;
  private lastSnapAt = -1;

  constructor(private factory: LinkFactory) {}

  /** Connect to `room` ('' creates a new room). */
  connect(name: string, room: string): void {
    this.name = name;
    this.room = room.trim().toUpperCase();
    this.wantOpen = true;
    this.welcomed = false;
    const saved = this.room ? loadToken(this.room) : null;
    this.token = saved && saved.name === name ? saved.token : '';
    this.retries = 0;
    this.dial();
  }

  leave(): void {
    this.wantOpen = false;
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    this.link?.close();
    this.link = null;
    this.isOpen = false;
    this.setStatus('closed');
  }

  send(msg: ClientMsg): void {
    if (this.isOpen && this.link) this.link.send(encode(msg));
  }

  /** Best estimate of the server's match clock right now (seconds). */
  serverNow(): number {
    const now = localSec();
    const off = this.offset();
    return off === null ? 0 : now + off;
  }

  private offset(): number | null {
    const snapFresh = this.snapOffset !== null && localSec() - this.lastSnapAt < 1.5;
    if (this.pongOffset !== null) {
      // Trust ping/pong unless snapshots disagree (e.g. the server's pong clock differs).
      if (snapFresh && Math.abs(this.pongOffset - (this.snapOffset as number)) > 0.5) return this.snapOffset;
      return this.pongOffset;
    }
    return this.snapOffset;
  }

  private setStatus(s: NetStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.onStatus(s);
  }

  private dial(): void {
    this.setStatus(this.retries > 0 ? 'reconnecting' : 'connecting');
    this.link = this.factory({
      open: () => this.handleOpen(),
      message: (d) => this.handleMessage(d),
      close: () => this.handleClose(),
    });
  }

  private handleOpen(): void {
    this.isOpen = true;
    this.sendHello();
    this.pings = 0;
    clearInterval(this.pingTimer);
    // A burst of quick pings to settle the clock, then every 2 s.
    this.pingTimer = setInterval(() => {
      this.pings++;
      if (this.pings < 6 || this.pings % 8 === 0) this.send({ t: 'ping', ts: performance.now() });
    }, 250);
  }

  private sendHello(): void {
    this.sentToken = !!this.token;
    this.send({
      t: 'hello', name: this.name, room: this.room, protocol: PROTOCOL_VERSION,
      ...(this.token ? { token: this.token } : {}),
    });
  }

  private handleMessage(data: string): void {
    let m: ServerMsg;
    try { m = JSON.parse(data) as ServerMsg; } catch { return; }
    switch (m.t) {
      case 'welcome':
        this.welcomed = true;
        this.retries = 0;
        this.selfId = m.you;
        this.room = m.room;
        this.token = m.token;
        saveToken({ room: m.room, token: m.token, name: this.name, at: Date.now() });
        this.setStatus('open');
        break;
      case 'error':
        // A stale rejoin token: try once more as a fresh player.
        if (!this.welcomed && this.sentToken) {
          this.token = '';
          saveToken(null);
          this.sendHello();
          return;
        }
        break;
      case 'pong':
        this.notePong(m.ts, m.time);
        return;
      case 'snap':
        this.noteSnap(m.time);
        break;
      default:
        break;
    }
    this.onMessage(m);
  }

  private notePong(ts: number, time: number): void {
    const now = localSec();
    const rtt = Math.max(0, (performance.now() - ts) / 1000);
    this.pongSamples.push({ rtt, off: time + rtt / 2 - now });
    if (this.pongSamples.length > 8) this.pongSamples.shift();
    const best = this.pongSamples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    this.rtt = best.rtt;
    if (this.pongOffset === null || Math.abs(best.off - this.pongOffset) > 0.25) this.pongOffset = best.off;
    else this.pongOffset += (best.off - this.pongOffset) * 0.3;
  }

  private noteSnap(time: number): void {
    const now = localSec();
    this.lastSnapAt = now;
    const s = time - now;
    if (this.snapOffset === null || Math.abs(s + this.rtt / 2 - this.snapOffset) > 0.75) {
      // Big jump (first snapshot or the match clock restarted): resync now.
      this.snapSamples = [s];
      this.snapOffset = s + this.rtt / 2;
      return;
    }
    this.snapSamples.push(s);
    if (this.snapSamples.length > 40) this.snapSamples.shift();
    const est = Math.max(...this.snapSamples) + this.rtt / 2;
    this.snapOffset += (est - this.snapOffset) * 0.1;
  }

  private handleClose(): void {
    this.isOpen = false;
    clearInterval(this.pingTimer);
    this.link = null;
    if (!this.wantOpen) { this.setStatus('closed'); return; }
    this.retries++;
    this.setStatus('reconnecting');
    const delay = Math.min(5000, 400 * Math.pow(1.7, this.retries - 1));
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => { if (this.wantOpen) this.dial(); }, delay);
  }
}
