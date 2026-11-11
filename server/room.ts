// Rooms: a lobby code, its players (humans + bots during a match), the host,
// match options, rejoin tokens, WebRTC signalling relay and peers lists.
// Transport-agnostic: a connection is anything with send()/close().
import { randomBytes } from 'node:crypto';
import { DISCONNECT, MAX_PLAYERS, MIN_PLAYERS, PROTOCOL_VERSION } from '../shared/constants.js';
import type { ClientMsg, ServerMsg } from '../shared/protocol.js';
import type { MatchOptions, PlayerInfo } from '../shared/types.js';
import { Match, type MatchPlayer } from './match.js';
import { MAX_FRAME_BYTES, RateLimiter, ROOM_ALPHABET, cleanName, normRoomCode, parseClientMsg } from './validate.js';

export interface Conn {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface RoomPlayer {
  id: string;
  name: string;
  token: string;
  isBot: boolean;
  willingGrandma: boolean;
  conn: Conn | null;
  disconnectedAt: number;
  chat: RateLimiter;
  slowToastAt: number;
}

/** One client connection's routing state. */
export interface Session {
  conn: Conn;
  room: Room | null;
  playerId: string | null;
  flood: RateLimiter;
}

export interface RoomManagerOptions {
  /** Short phase durations (INHERITANCE_FAST=1). */
  fast?: boolean;
  /** Clock in seconds (tests inject one). */
  now?: () => number;
  /** Seed for match randomness (tests). */
  seed?: number;
  log?: (msg: string) => void;
}

const BOT_NAMES = ['Agatha', 'Barnaby', 'Clementine', 'Dudley', 'Euphemia', 'Ferdinand', 'Gertrude', 'Horace'];
/** Rooms with no connected human are closed after this long. */
const EMPTY_ROOM_TTL = 120;

function token(): string {
  return randomBytes(18).toString('base64url');
}

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  readonly tokens = new Map<string, { room: string; id: string }>();
  private clock: () => number;

  constructor(readonly opts: RoomManagerOptions = {}) {
    this.clock = opts.now ?? (() => performance.now() / 1000);
  }

  now(): number {
    return this.clock();
  }

  log(msg: string): void {
    this.opts.log?.(msg);
  }

  connect(conn: Conn): Session {
    return { conn, room: null, playerId: null, flood: new RateLimiter(200, 120, this.now()) };
  }

  /** Raw frame from a connection. Never throws. */
  onRaw(s: Session, raw: string): void {
    try {
      if (raw.length > MAX_FRAME_BYTES) return;
      if (!s.flood.take(this.now())) return;
      const msg = parseClientMsg(raw);
      if (!msg) {
        if (!s.playerId) this.sendConn(s.conn, { t: 'error', message: 'Bad message.' });
        return;
      }
      this.onMessage(s, msg);
    } catch (err) {
      console.error('[room] error', err);
    }
  }

  onMessage(s: Session, msg: ClientMsg): void {
    if (msg.t === 'ping') {
      const m = s.room?.match;
      this.sendConn(s.conn, { t: 'pong', ts: msg.ts, time: m ? Math.round(m.time * 1000) / 1000 : 0 });
      return;
    }
    if (msg.t === 'hello') { this.hello(s, msg); return; }
    if (!s.room || !s.playerId) {
      this.sendConn(s.conn, { t: 'error', message: 'Say hello first.' });
      return;
    }
    const p = s.room.players.get(s.playerId);
    if (!p || p.conn !== s.conn) return;
    s.room.handle(p, msg);
  }

  onClose(s: Session): void {
    if (!s.room || !s.playerId) return;
    const p = s.room.players.get(s.playerId);
    if (p && p.conn === s.conn) s.room.disconnect(p);
    s.room = null;
    s.playerId = null;
  }

  sendConn(conn: Conn, msg: ServerMsg): void {
    try { conn.send(JSON.stringify(msg)); } catch { /* socket gone */ }
  }

  private hello(s: Session, msg: Extract<ClientMsg, { t: 'hello' }>): void {
    if (s.playerId) { this.sendConn(s.conn, { t: 'error', message: 'Already joined a room.' }); return; }
    if (msg.protocol !== PROTOCOL_VERSION) {
      this.sendConn(s.conn, { t: 'error', message: `Version mismatch (server ${PROTOCOL_VERSION}, client ${msg.protocol}). Please reload the page.` });
      return;
    }
    const code = normRoomCode(msg.room);
    // Rejoin with a token.
    if (msg.token) {
      const t = this.tokens.get(msg.token);
      const room = t ? this.rooms.get(t.room) : undefined;
      const p = t && room ? room.players.get(t.id) : undefined;
      if (t && room && p && (code === '' || code === null || code === room.code)) {
        s.room = room;
        s.playerId = p.id;
        room.rejoin(p, s.conn);
        return;
      }
    }
    if (code === null) {
      this.sendConn(s.conn, { t: 'error', message: 'Room codes are 5 characters: letters and digits 2-9 (no I or O).' });
      return;
    }
    const room = code === '' ? this.createRoom() : (this.rooms.get(code) ?? this.createRoom(code));
    if (room.humanCount() >= MAX_PLAYERS) {
      this.sendConn(s.conn, { t: 'error', message: `Room ${room.code} is full (${MAX_PLAYERS} players).` });
      return;
    }
    const p = room.addPlayer(cleanName(msg.name), s.conn);
    this.tokens.set(p.token, { room: room.code, id: p.id });
    s.room = room;
    s.playerId = p.id;
  }

  createRoom(code?: string): Room {
    let c = code;
    while (!c || this.rooms.has(c)) {
      c = '';
      for (let i = 0; i < 5; i++) c += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
    }
    const room = new Room(this, c);
    this.rooms.set(c, room);
    this.log(`room ${c} created`);
    return room;
  }

  forgetToken(tok: string): void {
    this.tokens.delete(tok);
  }

  /** Advance every room by `dt` seconds of real time. */
  tick(dt: number): void {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      try { room.tick(dt, now); } catch (err) { console.error('[room] tick error', room.code, err); }
      if (room.emptySince !== null && now - room.emptySince > EMPTY_ROOM_TTL) {
        room.close();
        this.rooms.delete(room.code);
        this.log(`room ${room.code} closed (empty)`);
      }
    }
  }
}

export class Room {
  readonly players = new Map<string, RoomPlayer>();
  hostId = '';
  options: MatchOptions = { fullMatch: false, fillBots: true, pushGrandma: false };
  match: Match | null = null;
  lastGrandmaId: string | null = null;
  emptySince: number | null = null;
  private nextId = 1;
  private lastMsg: ServerMsg | null = null;
  private lastStr = '';

  constructor(private mgr: RoomManager, readonly code: string) {
    this.emptySince = mgr.now();
  }

  humanCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (!p.isBot) n++;
    return n;
  }

  connectedHumans(): RoomPlayer[] {
    return [...this.players.values()].filter((p) => !p.isBot && p.conn);
  }

  // ───── membership ─────

  addPlayer(name: string, conn: Conn): RoomPlayer {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    let n = name, k = 2;
    while (taken.has(n.toLowerCase())) n = `${name.slice(0, 13)} ${k++}`;
    const p: RoomPlayer = {
      id: `p${this.nextId++}${randomBytes(2).toString('hex')}`, name: n, token: token(), isBot: false, willingGrandma: false,
      conn, disconnectedAt: 0, chat: new RateLimiter(5, 1 / 1.5, this.mgr.now()), slowToastAt: 0,
    };
    this.players.set(p.id, p);
    if (!this.hostId || !this.players.get(this.hostId)?.conn) this.hostId = p.id;
    this.emptySince = null;
    this.sendTo(p.id, { t: 'welcome', you: p.id, token: p.token, room: this.code, protocol: PROTOCOL_VERSION });
    this.broadcastLobby();
    this.sendPeers();
    if (this.match) this.sendTo(p.id, { t: 'ev', e: 'toast', text: 'A match is under way. You will join the next one.' });
    this.mgr.log(`${this.code}: ${p.name} joined`);
    return p;
  }

  rejoin(p: RoomPlayer, conn: Conn): void {
    if (p.conn && p.conn !== conn) { try { p.conn.close(4000, 'Replaced by a new connection'); } catch { /* ignore */ } }
    p.conn = conn;
    p.disconnectedAt = 0;
    this.emptySince = null;
    this.sendTo(p.id, { t: 'welcome', you: p.id, token: p.token, room: this.code, protocol: PROTOCOL_VERSION });
    if (!this.players.get(this.hostId)?.conn) this.hostId = p.id;
    if (this.match) {
      this.match.setConnected(p.id, true);
      this.match.sendStateTo(p.id);
    }
    this.broadcastLobby();
    this.sendPeers();
    this.mgr.log(`${this.code}: ${p.name} rejoined`);
  }

  disconnect(p: RoomPlayer): void {
    p.conn = null;
    p.disconnectedAt = this.mgr.now();
    this.match?.setConnected(p.id, false);
    if (this.hostId === p.id) {
      const next = this.connectedHumans()[0];
      if (next) this.hostId = next.id;
    }
    if (this.connectedHumans().length === 0) this.emptySince = this.mgr.now();
    this.broadcastLobby();
    this.sendPeers();
    this.mgr.log(`${this.code}: ${p.name} left`);
  }

  private remove(p: RoomPlayer): void {
    this.players.delete(p.id);
    this.mgr.forgetToken(p.token);
    if (this.hostId === p.id) this.hostId = this.connectedHumans()[0]?.id ?? '';
  }

  close(): void {
    this.match?.abort();
    this.match = null;
    for (const p of this.players.values()) {
      this.mgr.forgetToken(p.token);
      if (p.conn) { try { p.conn.close(1001, 'Room closed'); } catch { /* ignore */ } }
    }
    this.players.clear();
  }

  // ───── messages ─────

  handle(p: RoomPlayer, msg: ClientMsg): void {
    const now = this.mgr.now();
    switch (msg.t) {
      case 'lobby': {
        if (typeof msg.willingGrandma === 'boolean') {
          p.willingGrandma = msg.willingGrandma;
          if (msg.willingGrandma && this.match?.pause && this.match.takeOverGrandma(p.id)) this.lastGrandmaId = p.id;
        }
        if (msg.options) {
          if (p.id !== this.hostId) this.error(p, 'Only the host can change the options.');
          else if (this.match) this.error(p, 'Options can be changed between matches.');
          else this.options = { ...this.options, ...msg.options };
        }
        this.broadcastLobby();
        break;
      }
      case 'start':
        this.start(p);
        break;
      case 'input':
      case 'grandma':
      case 'vote':
        this.match?.handle(p.id, msg);
        break;
      case 'quick':
      case 'chat':
      case 'tattle':
        if (!this.match) break;
        if (!p.chat.take(now)) {
          if (now >= p.slowToastAt) {
            p.slowToastAt = now + 3;
            this.sendTo(p.id, { t: 'ev', e: 'toast', text: 'Slow down, dear!' });
          }
          break;
        }
        this.match.handle(p.id, msg);
        break;
      case 'rtc': {
        const to = this.players.get(msg.to);
        if (!to || to.isBot || !to.conn || to.id === p.id) break;
        this.sendTo(to.id, { t: 'rtc', from: p.id, data: msg.data });
        break;
      }
      default:
        break;
    }
  }

  private error(p: RoomPlayer, message: string): void {
    this.sendTo(p.id, { t: 'error', message });
  }

  // ───── match lifecycle ─────

  start(p: RoomPlayer): void {
    if (p.id !== this.hostId) { this.error(p, 'Only the host can start the match.'); return; }
    if (this.match) { this.error(p, 'A match is already running.'); return; }
    const humans = this.connectedHumans();
    const willing = humans.filter((h) => h.willingGrandma);
    let grandmaId: string | null = null;
    if (willing.length > 0) {
      const weights = willing.map((h) => (h.id === this.lastGrandmaId && willing.length > 1 ? 0.35 : 1));
      let r = Math.random() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < willing.length; i++) {
        r -= weights[i];
        if (r <= 0 || i === willing.length - 1) { grandmaId = willing[i].id; break; }
      }
    } else if (humans.length >= MAX_PLAYERS) {
      this.error(p, `With ${MAX_PLAYERS} players, one of you has to tick "Willing to be Grandma".`);
      return;
    } else if (!this.options.fillBots) {
      this.error(p, 'Nobody is willing to be Grandma. Someone must tick "Willing to be Grandma", or turn on "Fill with bots" for a bot Grandma.');
      return;
    }
    const botGrandma = grandmaId === null;
    const total = humans.length + (botGrandma ? 1 : 0);
    let botCousins = 0;
    if (total < MIN_PLAYERS) {
      if (!this.options.fillBots) {
        this.error(p, `Need at least ${MIN_PLAYERS} players to start (you have ${total}). Invite more, or turn on "Fill with bots".`);
        return;
      }
      botCousins = MIN_PLAYERS - total;
    }
    // Bots join the room for the length of the match.
    const used = new Set([...this.players.values()].map((x) => x.name));
    const makeBot = (label: string): RoomPlayer => {
      let name = BOT_NAMES.find((n) => !used.has(`${n} (bot)`)) ?? `Bot ${this.nextId}`;
      name = label || `${name} (bot)`;
      used.add(name);
      const b: RoomPlayer = {
        id: `b${this.nextId++}`, name, token: '', isBot: true, willingGrandma: false, conn: null, disconnectedAt: 0,
        chat: new RateLimiter(5, 1, this.mgr.now()), slowToastAt: 0,
      };
      this.players.set(b.id, b);
      return b;
    };
    const players: MatchPlayer[] = humans.map((h) => ({ id: h.id, name: h.name, isBot: false }));
    for (let i = 0; i < botCousins; i++) {
      const b = makeBot('');
      players.push({ id: b.id, name: b.name, isBot: true });
    }
    if (botGrandma) {
      const b = makeBot('Nana Dot (bot)');
      players.push({ id: b.id, name: b.name, isBot: true });
      grandmaId = b.id;
    }
    this.lastGrandmaId = botGrandma ? null : grandmaId;
    this.match = new Match({
      players, grandmaId: grandmaId!, options: { ...this.options }, fast: this.mgr.opts.fast,
      seed: this.mgr.opts.seed,
      send: (to, msg) => this.sendTo(to, msg),
      onEnd: () => this.endMatch(),
    });
    this.mgr.log(`${this.code}: match started (${players.length} players, grandma ${grandmaId})`);
    this.match.start();
    this.broadcastLobby();
  }

  private endMatch(): void {
    this.match = null;
    for (const p of [...this.players.values()]) if (p.isBot) this.players.delete(p.id);
    for (const p of this.connectedHumans()) this.sendTo(p.id, { t: 'phase', phase: 'lobby', visit: null, endsAt: 0, time: 0 });
    this.broadcastLobby();
    this.mgr.log(`${this.code}: match over, back to the lobby`);
  }

  tick(dt: number, now: number): void {
    if (this.match) this.match.step(dt);
    for (const p of [...this.players.values()]) {
      if (p.isBot || p.conn) continue;
      if (now - p.disconnectedAt > DISCONNECT.cousinRejoin) {
        this.remove(p);
        this.broadcastLobby();
      }
    }
  }

  // ───── sending ─────

  sendTo(id: string, msg: ServerMsg): void {
    const p = this.players.get(id);
    if (!p || !p.conn) return;
    if (msg !== this.lastMsg) {
      this.lastMsg = msg;
      this.lastStr = JSON.stringify(msg);
    }
    try { p.conn.send(this.lastStr); } catch { /* socket gone */ }
  }

  lobbyMsg(): ServerMsg {
    const players: PlayerInfo[] = [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, isBot: p.isBot, isHost: p.id === this.hostId, willingGrandma: p.willingGrandma, connected: p.isBot || !!p.conn,
    }));
    return { t: 'lobby', room: this.code, players, hostId: this.hostId, options: { ...this.options }, phase: this.match?.phase ?? 'lobby' };
  }

  broadcastLobby(): void {
    const msg = this.lobbyMsg();
    for (const p of this.connectedHumans()) this.sendTo(p.id, msg);
  }

  /** Each connected human gets everyone else connected (voice mesh). */
  sendPeers(): void {
    const humans = this.connectedHumans();
    for (const p of humans) this.sendTo(p.id, { t: 'peers', ids: humans.filter((q) => q.id !== p.id).map((q) => q.id) });
  }
}
