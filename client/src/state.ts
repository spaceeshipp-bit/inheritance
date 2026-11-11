// Client-side game state: lobby/match info, the snapshot buffer, and
// interpolation. Remote entities render INTERP_DELAY behind the server clock;
// your own character renders from the latest snapshot extrapolated by its
// velocity (smoothed), so it feels responsive without a full predictor.
import type { GameEvent, ServerMsg, SnapMsg } from '../../shared/protocol.js';
import type {
  CharSnap, CousinInfo, FinalResult, Phase, PropSnap, ReadingResult, Role, Vec3, VisitId, WishInfo,
} from '../../shared/types.js';
import type { GrandmaSenseState } from '../../shared/senses.js';
import { Predictor } from './predict.js';
import { damp, lerp, lerpAngle, localSec } from './util.js';

export type LobbyMsg = Extract<ServerMsg, { t: 'lobby' }>;
export type MatchMsg = Extract<ServerMsg, { t: 'match' }>;
export type PhaseMsg = Extract<ServerMsg, { t: 'phase' }>;

export const INTERP_DELAY = 0.1;
const BUFFER_SECONDS = 1.5;
const SELF_EXTRAP_MAX = 0.2;

interface BufSnap { msg: SnapMsg; chars: Map<string, CharSnap>; props: Map<string, PropSnap> }

export interface View {
  /** Server time the remote entities are shown at. */
  time: number;
  chars: Map<string, CharSnap>;
  props: Map<string, PropSnap>;
  self: CharSnap | null;
  grandma: CharSnap | null;
}

export interface FoundItem { item: string; owner: string; pos: Vec3; t: number; pinned: boolean }

export interface StateEvents {
  welcome: { you: string; room: string };
  lobby: LobbyMsg;
  match: MatchMsg;
  phase: PhaseMsg;
  ev: GameEvent;
  reading: ReadingResult;
  results: FinalResult;
  error: string;
}

type Listeners = { [K in keyof StateEvents]: ((v: StateEvents[K]) => void)[] };

export class GameState {
  selfId = '';
  room = '';
  lobby: LobbyMsg | null = null;
  match: MatchMsg | null = null;
  phase: Phase = 'lobby';
  visit: VisitId | null = null;
  phaseEndsAt = 0;
  buf: BufSnap[] = [];
  shares: Record<string, number> = {};
  willAvail = { budget: 0, rolling: 0 };
  dark = false;
  flash = false;
  wish: WishInfo | null = null;
  reading: ReadingResult | null = null;
  results: FinalResult | null = null;
  found: FoundItem[] = [];
  summon: { pos: Vec3; endsAt: number } | null = null;
  /** Last share change per cousin (local seconds), for the arrows on the will. */
  shareChange: Record<string, { delta: number; at: number }> = {};
  /** My vote this match, if any. */
  myVote: string | null = null;
  /** Own-player prediction (shared/movement.ts), reconciled on `ack`. */
  readonly predictor = new Predictor();

  private selfDisplay: Vec3 | null = null;
  private listeners: Listeners = { welcome: [], lobby: [], match: [], phase: [], ev: [], reading: [], results: [], error: [] };

  on<K extends keyof StateEvents>(k: K, fn: (v: StateEvents[K]) => void): void {
    (this.listeners[k] as ((v: StateEvents[K]) => void)[]).push(fn);
  }
  private emit<K extends keyof StateEvents>(k: K, v: StateEvents[K]): void {
    for (const fn of this.listeners[k] as ((v: StateEvents[K]) => void)[]) fn(v);
  }

  get role(): Role | null { return this.match?.role ?? null; }
  get inMatch(): boolean { return this.match !== null && this.phase !== 'lobby'; }
  get grandmaId(): string { return this.match?.grandmaId ?? ''; }

  name(id: string): string {
    return this.match?.names[id] ?? this.lobby?.players.find((p) => p.id === id)?.name ?? '???';
  }
  cousin(id: string): CousinInfo | undefined {
    return this.match?.cousins.find((c) => c.id === id);
  }
  cousinIds(): string[] {
    return this.match?.cousins.map((c) => c.id) ?? [];
  }
  latest(): SnapMsg | null {
    return this.buf.length ? this.buf[this.buf.length - 1].msg : null;
  }

  ingest(m: ServerMsg): void {
    switch (m.t) {
      case 'welcome':
        this.selfId = m.you;
        this.room = m.room;
        this.emit('welcome', { you: m.you, room: m.room });
        break;
      case 'error':
        this.emit('error', m.message);
        break;
      case 'lobby':
        this.lobby = m;
        this.room = m.room;
        if (m.phase === 'lobby') this.phase = 'lobby';
        this.emit('lobby', m);
        break;
      case 'match':
        this.match = m;
        this.buf = [];
        this.shares = {};
        this.shareChange = {};
        this.wish = null;
        this.reading = null;
        this.results = null;
        this.found = [];
        this.summon = null;
        this.myVote = null;
        this.selfDisplay = null;
        this.predictor.reset();
        this.dark = false;
        this.flash = false;
        this.emit('match', m);
        break;
      case 'phase':
        this.phase = m.phase;
        this.visit = m.visit;
        this.phaseEndsAt = m.endsAt;
        if (m.phase === 'lobby') {
          this.match = null;
          this.buf = [];
        }
        this.emit('phase', m);
        break;
      case 'snap':
        this.addSnap(m);
        break;
      case 'ev':
        this.applyEvent(m);
        this.emit('ev', m);
        break;
      case 'reading':
        this.reading = m.result;
        this.emit('reading', m.result);
        break;
      case 'results':
        this.results = m.result;
        this.emit('results', m.result);
        break;
      default:
        break;
    }
  }

  private addSnap(m: SnapMsg): void {
    const last = this.latest();
    if (last && m.time < last.time - 1) this.buf = []; // clock restarted (new match)
    else if (last && m.time <= last.time) return; // out of order / duplicate
    const now = localSec();
    for (const id of Object.keys(m.shares)) {
      const prev = this.shares[id];
      if (prev !== undefined && prev !== m.shares[id]) this.shareChange[id] = { delta: m.shares[id] - prev, at: now };
    }
    this.shares = m.shares;
    this.willAvail = m.willAvail;
    this.dark = m.dark;
    this.flash = m.flash;
    const chars = new Map<string, CharSnap>();
    for (const c of m.chars) chars.set(c.id, c);
    const props = new Map<string, PropSnap>();
    for (const p of m.props) props.set(p.id, p);
    this.buf.push({ msg: m, chars, props });
    const mine = chars.get(this.selfId);
    if (mine) this.predictor.reconcile(mine);
    while (this.buf.length > 2 && this.buf[0].msg.time < m.time - BUFFER_SECONDS) this.buf.shift();
  }

  private applyEvent(ev: GameEvent): void {
    switch (ev.e) {
      case 'wish': this.wish = ev.wish; break;
      case 'wish-done': if (this.wish && this.wish.id === ev.wish.id) this.wish = null; break;
      case 'found':
        if (!this.found.some((f) => f.item === ev.item)) {
          this.found.push({ item: ev.item, owner: ev.owner, pos: ev.pos, t: localSec(), pinned: false });
        }
        break;
      case 'summon': this.summon = { pos: ev.pos, endsAt: ev.endsAt }; break;
      default: break;
    }
  }

  /** Grandma's senses as of a snapshot of her (plus Storm state). */
  senseOf(g: CharSnap | null): GrandmaSenseState | null {
    if (!g) return null;
    return {
      pos: g.pos, yaw: g.yaw, aidActive: !!g.aidActive, specsActive: !!g.specsActive, specsOff: !!g.specsOff,
      dark: this.dark && !this.flash, flash: this.flash,
    };
  }

  /**
   * Interpolated view at server time `now`. `selfYaw`/`selfPitch` override the
   * snapshot facing for your own character (the camera turns instantly).
   */
  view(now: number, dt: number, selfYaw?: number, selfPitch?: number): View {
    const chars = new Map<string, CharSnap>();
    const props = new Map<string, PropSnap>();
    const out: View = { time: now - INTERP_DELAY, chars, props, self: null, grandma: null };
    const n = this.buf.length;
    if (n === 0) return out;
    const rt = now - INTERP_DELAY;
    let a = this.buf[0];
    let b = this.buf[n - 1];
    let k = 0;
    let extra = 0;
    if (rt >= b.msg.time) {
      a = b;
      extra = Math.min(rt - b.msg.time, 0.1);
    } else if (rt <= this.buf[0].msg.time) {
      b = a;
    } else {
      for (let i = 0; i < n - 1; i++) {
        if (this.buf[i].msg.time <= rt && rt < this.buf[i + 1].msg.time) {
          a = this.buf[i];
          b = this.buf[i + 1];
          break;
        }
      }
      const span = b.msg.time - a.msg.time;
      k = span > 0 ? (rt - a.msg.time) / span : 0;
    }
    for (const cb of b.chars.values()) {
      const ca = a.chars.get(cb.id) ?? cb;
      chars.set(cb.id, interpChar(ca, cb, k, extra));
    }
    for (const pb of b.props.values()) {
      const pa = a.props.get(pb.id) ?? pb;
      props.set(pb.id, interpProp(pa, pb, k, extra));
    }
    // Own character: newest snapshot, extrapolated by velocity, smoothed.
    const latest = this.buf[n - 1];
    const mine = latest.chars.get(this.selfId);
    const predicted = mine ? this.predictor.sample(dt) : null;
    if (mine && predicted) {
      this.selfDisplay = { ...predicted.pos };
      const self: CharSnap = { ...mine, pos: predicted.pos, vel: predicted.vel };
      if (selfYaw !== undefined) self.yaw = selfYaw;
      if (selfPitch !== undefined) self.pitch = selfPitch;
      chars.set(self.id, self);
      out.self = self;
    } else if (mine) {
      // Ragdolled, asleep, or no ack from the server: newest snapshot extrapolated by velocity.
      const age = Math.max(0, Math.min(SELF_EXTRAP_MAX, now - latest.msg.time));
      const target = {
        x: mine.pos.x + mine.vel.x * age,
        y: mine.pos.y + Math.max(-2, mine.vel.y) * age,
        z: mine.pos.z + mine.vel.z * age,
      };
      const sd = this.selfDisplay;
      if (!sd || Math.hypot(target.x - sd.x, target.y - sd.y, target.z - sd.z) > 2.5) {
        this.selfDisplay = { ...target };
      } else {
        const f = damp(18, dt);
        sd.x += (target.x - sd.x) * f;
        sd.y += (target.y - sd.y) * f;
        sd.z += (target.z - sd.z) * f;
      }
      const self: CharSnap = { ...mine, pos: { ...(this.selfDisplay as Vec3) } };
      if (selfYaw !== undefined && mine.state === 'normal') self.yaw = selfYaw;
      if (selfPitch !== undefined) self.pitch = selfPitch;
      chars.set(self.id, self);
      out.self = self;
    }
    out.grandma = chars.get(this.grandmaId) ?? null;
    return out;
  }
}

function interpChar(a: CharSnap, b: CharSnap, k: number, extra: number): CharSnap {
  const jump = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) > 3;
  const t = jump ? 1 : k;
  return {
    ...b,
    pos: {
      x: lerp(a.pos.x, b.pos.x, t) + b.vel.x * extra,
      y: lerp(a.pos.y, b.pos.y, t) + Math.max(0, b.vel.y) * extra,
      z: lerp(a.pos.z, b.pos.z, t) + b.vel.z * extra,
    },
    vel: { x: lerp(a.vel.x, b.vel.x, t), y: lerp(a.vel.y, b.vel.y, t), z: lerp(a.vel.z, b.vel.z, t) },
    yaw: lerpAngle(a.yaw, b.yaw, t),
    pitch: lerp(a.pitch, b.pitch, t),
  };
}

function interpProp(a: PropSnap, b: PropSnap, k: number, extra: number): PropSnap {
  const jump = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y, b.pos.z - a.pos.z) > 3 || a.heldBy !== b.heldBy;
  const t = jump ? 1 : k;
  void extra;
  return {
    ...b,
    pos: { x: lerp(a.pos.x, b.pos.x, t), y: lerp(a.pos.y, b.pos.y, t), z: lerp(a.pos.z, b.pos.z, t) },
    yaw: lerpAngle(a.yaw, b.yaw, t),
  };
}
