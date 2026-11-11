// Rooms: a lobby code, its players (humans + bots during a match), the host,
// match options, rejoin tokens, WebRTC signalling relay and peers lists.
// Transport-agnostic: a connection is anything with send()/close().
// Abuse limits (new rooms per address, the hello timeout, server-wide caps,
// abandoned matches, the rtc relay) come from ./limits.ts.
import { randomBytes } from 'node:crypto';
import { DISCONNECT, MAX_PLAYERS, MIN_PLAYERS, PROTOCOL_VERSION } from '../shared/constants.js';
import { CLOSE_CODES, type ClientMsg, type MatchInProgress, type ServerMsg } from '../shared/protocol.js';
import type { MatchOptions, PlayerInfo } from '../shared/types.js';
import { limitsWith, type Limits } from './limits.js';
import { Match, type MatchPlayer } from './match.js';
import { MAX_FRAME_BYTES, RateLimiter, ROOM_ALPHABET, cleanName, normRoomCode, parseClientMsg, rtcSize } from './validate.js';

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
  /** WebRTC signalling this player may still relay: messages, and characters. */
  rtc: RateLimiter;
  rtcChars: RateLimiter;
  /** Lobby changes (each one is broadcast to the whole room). */
  lobby: RateLimiter;
}

/** One client connection's routing state. */
export interface Session {
  conn: Conn;
  room: Room | null;
  playerId: string | null;
  /** Frames and bytes this connection may still send; frames over budget cost a strike. */
  flood: RateLimiter;
  bytes: RateLimiter;
  strikes: RateLimiter;
  /** Closed for flooding: everything it still sends is ignored. */
  dead: boolean;
  /** Client address the per-address limits count against ('' = exempt or unknown). */
  ip: string;
  /** When the connection opened (manager clock); it must join a room within `limits.helloTimeout`. */
  openedAt: number;
}

export interface RoomManagerOptions {
  /** Short phase durations (INHERITANCE_FAST=1). */
  fast?: boolean;
  /** With `fast`: visit length in seconds (INHERITANCE_VISIT_SECONDS). */
  visitSeconds?: number;
  /** Test-only: bots sit still (scripted end-to-end scenarios). */
  botsIdle?: boolean;
  /** Clock in seconds (tests inject one). */
  now?: () => number;
  /** Seed for match randomness (tests). */
  seed?: number;
  log?: (msg: string) => void;
  /** Override some abuse limits (tests); the rest come from LIMITS. */
  limits?: Partial<Limits>;
}

const BOT_NAMES = ['Agatha', 'Barnaby', 'Clementine', 'Dudley', 'Euphemia', 'Ferdinand', 'Gertrude', 'Horace'];
/** How often the manager looks for connections that never said hello (seconds). */
const SWEEP_EVERY = 0.5;
/** How often full room-creation buckets are forgotten (seconds). */
const PRUNE_EVERY = 30;

function token(): string {
  return randomBytes(18).toString('base64url');
}

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  readonly tokens = new Map<string, { room: string; id: string }>();
  readonly limits: Limits;
  private clock: () => number;
  /** Connections that have not joined a room yet (the hello timeout). */
  private waiting = new Set<Session>();
  /** New-room budget per client address. */
  private roomBudget = new Map<string, RateLimiter>();
  private nextSweep = 0;
  private nextPrune = 0;

  constructor(readonly opts: RoomManagerOptions = {}) {
    this.clock = opts.now ?? (() => performance.now() / 1000);
    this.limits = limitsWith(opts.limits);
  }

  now(): number {
    return this.clock();
  }

  log(msg: string): void {
    this.opts.log?.(msg);
  }

  /** A new connection; `ip` is the address it counts against for per-address limits ('' = exempt). */
  connect(conn: Conn, ip = ''): Session {
    const now = this.now();
    const L = this.limits;
    const s: Session = {
      conn, room: null, playerId: null, ip, openedAt: now, dead: false,
      flood: new RateLimiter(L.frameBurst, L.framesPerSec, now),
      bytes: new RateLimiter(L.frameBytesBurst, L.frameBytesPerSec, now),
      strikes: new RateLimiter(L.floodStrikes, L.floodStrikesPerSec, now),
    };
    this.waiting.add(s);
    return s;
  }

  /**
   * A frame straight off the socket, admitted on its size and the connection's
   * budgets before it is even decoded (a flood costs us as little as possible).
   */
  onFrame(s: Session, bytes: number, decode: () => string): void {
    if (this.admit(s, bytes)) this.handleRaw(s, decode());
  }

  /** Raw frame from a connection. Never throws. */
  onRaw(s: Session, raw: string): void {
    if (this.admit(s, raw.length)) this.handleRaw(s, raw);
  }

  /** Within this connection's frame and byte budgets? A connection that keeps going over is closed. */
  private admit(s: Session, bytes: number): boolean {
    if (s.dead) return false;
    const now = this.now();
    if (bytes <= MAX_FRAME_BYTES && s.flood.take(now) && s.bytes.take(now, bytes)) return true;
    if (!s.strikes.take(now)) {
      s.dead = true;
      this.refuse(s, 'Too many messages. Please reload the page.');
      try { s.conn.close(CLOSE_CODES.refused, 'Flood'); } catch { /* gone */ }
    }
    return false;
  }

  private handleRaw(s: Session, raw: string): void {
    try {
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
    this.waiting.delete(s);
    if (!s.room || !s.playerId) return;
    const p = s.room.players.get(s.playerId);
    if (p && p.conn === s.conn) s.room.disconnect(p);
    s.room = null;
    s.playerId = null;
  }

  sendConn(conn: Conn, msg: ServerMsg): void {
    try { conn.send(JSON.stringify(msg)); } catch { /* socket gone */ }
  }

  /** Refuse a connection or its hello: say why, flagged so the client stops redialling on its own. */
  refuse(s: Session, message: string): void {
    this.sendConn(s.conn, { t: 'error', message, refused: true });
  }

  /** Matches running right now on this server. */
  runningMatches(): number {
    let n = 0;
    for (const r of this.rooms.values()) if (r.match) n++;
    return n;
  }

  private hello(s: Session, msg: Extract<ClientMsg, { t: 'hello' }>): void {
    if (s.playerId) { this.sendConn(s.conn, { t: 'error', message: 'Already joined a room.' }); return; }
    if (msg.protocol !== PROTOCOL_VERSION) {
      this.refuse(s, `Version mismatch (server ${PROTOCOL_VERSION}, client ${msg.protocol}). Please reload the page.`);
      return;
    }
    const code = normRoomCode(msg.room);
    // Rejoin with a token.
    if (msg.token) {
      const t = this.tokens.get(msg.token);
      const room = t ? this.rooms.get(t.room) : undefined;
      const p = t && room ? room.players.get(t.id) : undefined;
      if (t && room && p && (code === '' || code === null || code === room.code)) {
        this.joined(s, room, p.id);
        room.rejoin(p, s.conn);
        return;
      }
    }
    if (code === null) {
      this.refuse(s, 'Room codes are 5 characters: letters and digits 2-9 (no I or O).');
      return;
    }
    let room = code === '' ? undefined : this.rooms.get(code);
    if (!room) {
      if (this.rooms.size >= this.limits.maxRooms) {
        this.refuse(s, 'The server is full right now (too many rooms open). Please try again in a few minutes.');
        return;
      }
      if (!this.takeRoomBudget(s.ip)) {
        this.refuse(s, 'Too many new rooms from your network. Wait a minute, or join a friend\'s room with its code.');
        return;
      }
      room = this.createRoom(code || undefined);
    }
    if (room.humanCount() >= MAX_PLAYERS) {
      this.refuse(s, `Room ${room.code} is full (${MAX_PLAYERS} players).`);
      return;
    }
    const p = room.addPlayer(cleanName(msg.name), s.conn);
    this.tokens.set(p.token, { room: room.code, id: p.id });
    this.joined(s, room, p.id);
  }

  private joined(s: Session, room: Room, playerId: string): void {
    s.room = room;
    s.playerId = playerId;
    this.waiting.delete(s);
  }

  private takeRoomBudget(ip: string): boolean {
    if (!ip) return true;
    const now = this.now();
    let b = this.roomBudget.get(ip);
    if (!b) {
      const n = this.limits.roomsPerIpPerMinute;
      b = new RateLimiter(n, n / 60, now);
      this.roomBudget.set(ip, b);
    }
    return b.take(now);
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
      if (room.emptySince !== null && now - room.emptySince > this.limits.emptyRoomTtl) {
        room.close();
        this.rooms.delete(room.code);
        this.log(`room ${room.code} closed (empty)`);
      }
    }
    if (now >= this.nextSweep) {
      this.nextSweep = now + SWEEP_EVERY;
      this.closeSilent(now);
    }
    if (now >= this.nextPrune) {
      this.nextPrune = now + PRUNE_EVERY;
      for (const [ip, b] of this.roomBudget) if (b.idle(now)) this.roomBudget.delete(ip);
    }
  }

  /** Close connections that have not joined a room within the hello timeout. */
  private closeSilent(now: number): void {
    for (const s of this.waiting) {
      if (now - s.openedAt < this.limits.helloTimeout) continue;
      this.waiting.delete(s);
      this.refuse(s, 'Timed out waiting to join a room. Please try again.');
      try { s.conn.close(CLOSE_CODES.refused, 'No hello'); } catch { /* gone */ }
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
  /** Since when the running match has had no participant connected (null: someone is). */
  idleSince: number | null = null;
  private nextId = 1;
  private lastMsg: ServerMsg | null = null;
  private lastStr = '';
  /** Who was connected, in which voice group, when `peers` went out last. */
  private peerKey = '';
  private nextSpectatorRefresh = 0;

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

  /** Takes part in the running match. Between matches, everybody in the room does. */
  participates(id: string): boolean {
    return !this.match || this.match.isHuman(id);
  }

  // ───── membership ─────

  private newPlayer(id: string, name: string, isBot: boolean, conn: Conn | null): RoomPlayer {
    const now = this.mgr.now();
    const L = this.mgr.limits;
    return {
      id, name, token: isBot ? '' : token(), isBot, willingGrandma: false, conn, disconnectedAt: 0,
      chat: new RateLimiter(5, isBot ? 1 : 1 / 1.5, now), slowToastAt: 0,
      rtc: new RateLimiter(L.rtcBurst, L.rtcPerSec, now), rtcChars: new RateLimiter(L.rtcCharsBurst, L.rtcCharsPerSec, now),
      lobby: new RateLimiter(L.lobbyBurst, L.lobbyPerSec, now),
    };
  }

  addPlayer(name: string, conn: Conn): RoomPlayer {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    let n = name, k = 2;
    while (taken.has(n.toLowerCase())) n = `${name.slice(0, 13)} ${k++}`;
    const p = this.newPlayer(`p${this.nextId++}${randomBytes(2).toString('hex')}`, n, false, conn);
    this.players.set(p.id, p);
    if (!this.hostId || !this.players.get(this.hostId)?.conn) this.hostId = p.id;
    this.emptySince = null;
    this.sendTo(p.id, { t: 'welcome', you: p.id, token: p.token, room: this.code, protocol: PROTOCOL_VERSION });
    // Mid-match: the lobby message carries `inProgress` for them (see broadcastLobby).
    this.broadcastLobby();
    this.sendPeers();
    this.mgr.log(`${this.code}: ${p.name} joined`);
    return p;
  }

  rejoin(p: RoomPlayer, conn: Conn): void {
    if (p.conn && p.conn !== conn) { try { p.conn.close(CLOSE_CODES.replaced, 'Replaced by a new connection'); } catch { /* ignore */ } }
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
        // Every change is broadcast to the whole room, so keep them at a human rate
        // and send nothing for a message that changes nothing.
        if (!p.lobby.take(now)) break;
        let changed = false;
        if (typeof msg.willingGrandma === 'boolean') {
          changed = p.willingGrandma !== msg.willingGrandma;
          p.willingGrandma = msg.willingGrandma;
          if (msg.willingGrandma && this.match?.pause && this.match.takeOverGrandma(p.id)) {
            this.lastGrandmaId = p.id;
            changed = true;
          }
        }
        if (msg.options) {
          if (p.id !== this.hostId) this.error(p, 'Only the host can change the options.');
          else if (this.match) this.error(p, 'Options can be changed between matches.');
          else {
            const next: MatchOptions = { ...this.options, ...msg.options };
            changed ||= (Object.keys(next) as (keyof MatchOptions)[]).some((k) => next[k] !== this.options[k]);
            this.options = next;
          }
        }
        if (changed) this.broadcastLobby();
        if (this.match && this.peerGroupsKey() !== this.peerKey) this.sendPeers();
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
        // Signalling is a handful of messages per peer; a flood of big SDPs would
        // queue on the recipient's socket and freeze them.
        if (!p.rtc.take(now) || !p.rtcChars.take(now, rtcSize(msg.data))) break;
        const to = this.players.get(msg.to);
        if (!to || to.isBot || !to.conn || to.id === p.id) break;
        // Voice stays inside its pairing group: nobody outside the match can open a connection into it.
        if (this.participates(p.id) !== this.participates(to.id)) break;
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
    if (this.mgr.runningMatches() >= this.mgr.limits.maxMatches) {
      this.error(p, 'The server is running as many matches as it can right now. Please try again in a minute or two.');
      return;
    }
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
      const b = this.newPlayer(`b${this.nextId++}`, name, true, null);
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
      players, grandmaId: grandmaId!, options: { ...this.options }, fast: this.mgr.opts.fast, visitSeconds: this.mgr.opts.visitSeconds, botsIdle: this.mgr.opts.botsIdle,
      seed: this.mgr.opts.seed,
      send: (to, msg) => this.sendTo(to, msg),
      onEnd: () => this.endMatch(),
    });
    this.idleSince = null;
    this.nextSpectatorRefresh = 0;
    this.mgr.log(`${this.code}: match started (${players.length} players, grandma ${grandmaId})`);
    this.match.start();
    this.broadcastLobby();
    this.sendPeers();
  }

  private endMatch(): void {
    this.match = null;
    this.idleSince = null;
    for (const p of [...this.players.values()]) if (p.isBot) this.players.delete(p.id);
    for (const p of this.connectedHumans()) this.sendTo(p.id, { t: 'phase', phase: 'lobby', visit: null, endsAt: 0, time: 0 });
    this.broadcastLobby();
    // Everybody in the room pairs up again (participants and those who waited outside).
    this.sendPeers();
    this.mgr.log(`${this.code}: match over, back to the lobby`);
  }

  tick(dt: number, now: number): void {
    const m = this.match;
    if (m) {
      // A match nobody is playing any more (they all left, or only bots remain) is
      // stopped after a grace long enough for a lone player to reload the page.
      if (m.humanIds().some((id) => !!this.players.get(id)?.conn)) this.idleSince = null;
      else this.idleSince ??= now;
      if (this.idleSince !== null && now - this.idleSince >= this.mgr.limits.idleMatchGrace) {
        this.mgr.log(`${this.code}: nobody has been in the match for ${this.mgr.limits.idleMatchGrace} s; stopping it`);
        m.abort();
        this.endMatch();
      } else {
        m.step(dt);
      }
    }
    if (this.match) {
      // Who takes part can change inside the match (a Grandma take-over): re-pair voice at once.
      if (this.peerGroupsKey() !== this.peerKey) this.sendPeers();
      if (now >= this.nextSpectatorRefresh) {
        this.nextSpectatorRefresh = now + this.mgr.limits.spectatorRefresh;
        const outside = this.connectedHumans().filter((p) => !this.participates(p.id));
        if (outside.length) this.sendInProgress(outside);
      }
    }
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

  lobbyMsg(inProgress?: MatchInProgress): ServerMsg {
    const players: PlayerInfo[] = [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, isBot: p.isBot, isHost: p.id === this.hostId, willingGrandma: p.willingGrandma, connected: p.isBot || !!p.conn,
    }));
    return {
      t: 'lobby', room: this.code, players, hostId: this.hostId, options: { ...this.options }, phase: this.match?.phase ?? 'lobby',
      ...(inProgress ? { inProgress } : {}),
    };
  }

  /**
   * The running match as players outside it see it from the lobby: phase, clock
   * and the will. Public facts only (cousins and Grandma all see the will).
   */
  inProgress(): MatchInProgress | null {
    const m = this.match;
    if (!m) return null;
    const pm = m.phaseMsg();
    if (pm.t !== 'phase') return null;
    const shares = { ...m.will.shares };
    const names: Record<string, string> = {};
    for (const id of [m.grandmaId, ...Object.keys(shares)]) names[id] = m.nameOf(id);
    return { phase: pm.phase, visit: pm.visit, endsAt: pm.endsAt, time: pm.time, shares, names, grandmaId: m.grandmaId };
  }

  broadcastLobby(): void {
    const humans = this.connectedHumans();
    const msg = this.lobbyMsg();
    const outside: RoomPlayer[] = [];
    for (const p of humans) {
      if (this.participates(p.id)) this.sendTo(p.id, msg);
      else outside.push(p);
    }
    if (outside.length) this.sendInProgress(outside);
  }

  private sendInProgress(to: RoomPlayer[]): void {
    const msg = this.lobbyMsg(this.inProgress() ?? undefined);
    for (const p of to) this.sendTo(p.id, msg);
  }

  private peerGroupsKey(): string {
    return this.connectedHumans().map((p) => `${p.id}${this.participates(p.id) ? '+' : '-'}`).join(',');
  }

  /**
   * Each connected human gets the others they should hold a voice connection
   * with. While a match runs, its participants pair only with each other and
   * everybody else (joined mid-match, replaced, back too late) only with each
   * other: someone outside the match must never hear it unfiltered.
   */
  sendPeers(): void {
    const humans = this.connectedHumans();
    this.peerKey = this.peerGroupsKey();
    for (const p of humans) {
      const mine = this.participates(p.id);
      this.sendTo(p.id, { t: 'peers', ids: humans.filter((q) => q.id !== p.id && this.participates(q.id) === mine).map((q) => q.id) });
    }
  }
}
