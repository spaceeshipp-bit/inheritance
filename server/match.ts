// One match of Inheritance: phases, the fixed-step simulation, every cousin and
// Grandma action, wishes, crime scenes, accusations, the live will, the Storm,
// the Reading of the Will, the vote and the results.
//
// The match owns no timers: the room (or a test) calls `step(dt)` and the
// match advances its own clock in fixed ticks of 1/TICK_HZ. Everything it
// says goes through `cfg.send(playerId, msg)`, once per human recipient, so
// secrets (favourite flag, preference cards, unscrambled bubbles) never leave
// for the wrong player.
import {
  COUSIN, COUSINS, CRIME_SCENE, DISCONNECT, FULL_VISITS, GRANDMA, HEARING_AID, HEIRLOOM, INTERMISSION_TIME, MISHEARD,
  PREFERENCE_CARDS, QUICKCHAT, READING_TIME, RESULTS_TIME, ROLE_REVEAL_TIME, SENSES, SLICE_VISITS, SNAPSHOT_HZ,
  SPECTACLES, STORM, TICK_HZ, VISITS, VOICE, VOTE_TIME, WILL, WISH,
} from '../shared/constants.js';
import { HEIRLOOM_SPOTS, HEIRLOOM_VARIANTS, SPAWNS, groundHeight } from '../shared/map.js';
import { createBody, forwardOf, integrateBody, type BodyShape, type MoveBody } from '../shared/movement.js';
import type { GameEvent, GrandmaAction, InputMsg, ServerMsg, ClientMsg } from '../shared/protocol.js';
import { grandmaScore } from '../shared/scoring.js';
import { dist, flatDist, hearingBand, scrambleText, visionBand, type GrandmaSenseState, type HearingBand, type VisionBand } from '../shared/senses.js';
import { CHEST_HEIGHT, PROP_MID, eyeOf, lineOfSight } from '../shared/sight.js';
import type {
  CharSnap, CousinInfo, FinalResult, MatchOptions, Phase, PropKind, PropSnap, ReadingResult, Role, Vec3, VisitId, WishInfo,
} from '../shared/types.js';
import { applyChange, available, createWill, leader, readingOrder, resetVisitBudget, setShare, type WillResult, type WillState } from '../shared/will.js';
import { CousinBot, GrandmaBot, type Bot } from './bots.js';
import { EventLog } from './log.js';
import { hasLOS, levelOf, waypoints } from './nav.js';
import {
  bodyItemPos, bumpsPedestal, handPos, inFrontClear, knockback, propHitsChar, propOutside, rescueIfLost, separateCharacters,
  setDownPos, stepCharacter, stepProp, type PhysChar, type PhysProp,
} from './physics.js';

// ───────────────────────── Types ─────────────────────────

export interface MatchPlayer { id: string; name: string; isBot: boolean }

export interface MatchConfig {
  /** Everyone in the match, Grandma included. Order decides cousin colours/items. */
  players: MatchPlayer[];
  grandmaId: string;
  options: MatchOptions;
  /** Scale phase durations down for end-to-end tests (visits 40 s, other phases 3–5 s). */
  fast?: boolean;
  /** With `fast`: override the visit length in seconds (end-to-end tests that script a lot). */
  visitSeconds?: number;
  /** Test-only: bots take their seats but do nothing (scripted end-to-end scenarios). */
  botsIdle?: boolean;
  /** Seed for the match's random numbers (tests use it for determinism). */
  seed?: number;
  /** Deliver one message to one human player. */
  send: (to: string, msg: ServerMsg) => void;
  /** Called once when the results phase ends. */
  onEnd?: (m: Match) => void;
}

type Btn = 'primary' | 'secondary' | 'shove' | 'interact' | 'plant' | 'jump';
const BTNS: Btn[] = ['primary', 'secondary', 'shove', 'interact', 'plant', 'jump'];
type Btns = Record<Btn, boolean>;
const noBtns = (): Btns => ({ primary: false, secondary: false, shove: false, interact: false, plant: false, jump: false });

export interface Char extends PhysChar {
  name: string;
  isBot: boolean;
  connected: boolean;
  pitch: number;
  holding: string | null;
  /** Held without the grab button (stolen/picked-up items): stays until planted, thrown or dropped. */
  sticky: boolean;
  running: boolean;
  sneaking: boolean;
  whispering: boolean;
  charge: number;
  plantT: number;
  input: InputMsg;
  last: Btns;
  pressed: Btns;
  released: Btns;
  ack: number;
  shoveCd: number;
  cousinIndex: number;
  itemId: string | null;
  // Grandma only
  parchmentOpen: boolean;
  aidT: number;
  aidCd: number;
  specsT: number;
  specsCd: number;
  specsOff: boolean;
  caneCd: number;
  summonCd: number;
  quillT: number;
  whistleT: number;
}

export interface Prop extends PhysProp {
  yaw: number;
  heldBy: string | null;
  /** Signature item carried on its owner's body (not in hands). */
  onBody: boolean;
  hidden: boolean;
  broken: boolean;
  variant?: string;
  owner?: string;
  planted: boolean;
  found: boolean;
  favourite: boolean;
  /** Heirlooms: the pedestal spot it is standing on, if any. */
  spot: Vec3 | null;
  /** Who is to blame if it breaks now. */
  lastBy: string | null;
  thrownBy: string | null;
  thrownAt: number;
  plantLog: number | null;
  cat?: { body: MoveBody; goal: Vec3 | null; waitUntil: number; giveUpAt: number };
}

/** What Grandma perceives of a point (see Match.perceive). */
export interface Perception {
  band: VisionBand;
  /** In her view cone and not behind a wall. */
  visible: boolean;
  /** She could tell who (or what) it is: soft or sharp vision. */
  identifiable: boolean;
  /** Inside her sharp vision (Caught Red-Handed). */
  sharp: boolean;
  dist: number;
}

export interface Crime {
  t: number;
  pos: Vec3;
  kind: 'shove' | 'break' | 'steal' | 'plant' | 'knock-specs';
  by: string | null;
  logIndex: number;
  /** Cousins within CRIME_SCENE.radius when it happened. */
  near: string[];
}

export interface PhaseDurations { roles: number; intermission: number; reading: number; vote: number; results: number; visit: (v: VisitId) => number }

export const NORMAL_DURATIONS: PhaseDurations = {
  roles: ROLE_REVEAL_TIME, intermission: INTERMISSION_TIME, reading: READING_TIME, vote: VOTE_TIME, results: RESULTS_TIME,
  visit: (v) => VISITS[v].duration,
};
export const FAST_DURATIONS: PhaseDurations = {
  roles: 3, intermission: 4, reading: 5, vote: 5, results: 4, visit: () => 40,
};

const WISH_TEXT: Record<WishInfo['kind'], string> = {
  'fetch-cat': 'Fetch Mittens for me, dear.',
  tea: "I'd love a nice cup of tea.",
  pills: 'Where are my pills? Find them!',
};
const WISH_PROP: Record<WishInfo['kind'], string> = { 'fetch-cat': 'cat', tea: 'teacup', pills: 'pills' };
const CAT_SHAPE: BodyShape = { radius: 0.2, height: 0.35, stepUp: 0.2 };
const COMPLIMENT_LINES = [0, 4];
const COMPLIMENT_RE = /\b(love|lovely|beautiful|wonderful|best|gorgeous|adore)\b/i;
const NANA_RE = /\b(nana|gran|granny|grandma|grandmother)\b/i;

/** Small deterministic PRNG (mulberry32). */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;
/** Seconds into Grandma's lie-down before a cousin may take over (time for her to reconnect). */
export const GRANDMA_TAKEOVER_GRACE = 2;
/** A position rounded to the metre: "somewhere over there" for things Grandma only heard. */
const coarse = (p: Vec3): Vec3 => ({ x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) });

/**
 * What Grandma makes of a cousin's quick-chat line: the line itself when she
 * hears clearly, a plausible mishearing when muffled, a mumble beyond that.
 */
export function mishear(line: number, band: HearingBand, secret: number, tick: number): string {
  const text = QUICKCHAT.cousin[line] ?? '';
  if (band === 'clear') return text;
  if (band !== 'muffled') return '…';
  const options = MISHEARD[line] ?? ['…'];
  return options[(hashStr(`${secret}:${line}:${tick}`) >>> 0) % options.length];
}
const r2 = (v: number): number => Math.round(v * 100) / 100;
const v3 = (p: Vec3): Vec3 => ({ x: r3(p.x), y: r3(p.y), z: r3(p.z) });
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ───────────────────────── Match ─────────────────────────

export class Match {
  readonly options: MatchOptions;
  readonly visits: VisitId[];
  readonly fast: boolean;
  readonly durations: PhaseDurations;
  readonly rng: () => number;
  readonly log: EventLog;
  readonly chars = new Map<string, Char>();
  readonly props = new Map<string, Prop>();
  readonly crimes: Crime[] = [];
  readonly bots = new Map<string, Bot>();
  readonly prefCards: string[];
  /** Seeds what Grandma mishears; never sent to anyone (so lines cannot be decoded). */
  readonly secret: number;
  /** Points moved against the budget in each visit (free Tuts excluded). */
  readonly visitUsed: number[] = [];
  will: WillState;
  grandmaId: string;
  cousinIds: string[] = [];
  time = 0;
  tick = 0;
  phase: Phase = 'roles';
  phaseEndsAt = 0;
  visitIndex = 0;
  started = false;
  over = false;
  wish: { info: WishInfo; propId: string } | null = null;
  summon: { pos: Vec3; endsAt: number } | null = null;
  dark = false;
  flash = false;
  freeTuts = 0;
  willFrozen = false;
  /** "Nana's Pet": the leader as of the last intermission (none during the first visit). */
  petId: string | null = null;
  /** Grandma's lie-down: she dropped; `since` when, `until` when the will is read if nobody takes over. */
  pause: { since: number; until: number } | null = null;
  reading: ReadingResult | null = null;
  results: FinalResult | null = null;
  readonly votes = new Map<string, string>();
  readonly pinned = new Set<string>();

  private cfg: MatchConfig;
  private humans: string[];
  private acc = 0;
  private snapAcc = 0;
  private nextWishAt = Infinity;
  private wishCount = 0;
  private lastWishKind: WishInfo['kind'] | null = null;
  private flashUntil = 0;
  private nextLightning = Infinity;
  private sharesAtOpen: Record<string, number> | null = null;
  private allNames: Record<string, string> = {};

  constructor(cfg: MatchConfig) {
    this.cfg = cfg;
    this.options = { ...cfg.options };
    this.visits = this.options.fullMatch ? [...FULL_VISITS] : [...SLICE_VISITS];
    this.fast = !!cfg.fast;
    const vs = cfg.visitSeconds;
    this.durations = !this.fast ? NORMAL_DURATIONS
      : vs !== undefined && Number.isFinite(vs) && vs > 0 ? { ...FAST_DURATIONS, visit: () => vs } : FAST_DURATIONS;
    const seed = cfg.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.rng = makeRng(seed);
    this.secret = Math.floor(makeRng(seed ^ 0x5bd1e995)() * 2 ** 31);
    this.grandmaId = cfg.grandmaId;
    this.humans = cfg.players.filter((p) => !p.isBot).map((p) => p.id);
    this.log = new EventLog((id) => this.nameOf(id));

    let cousinIndex = 0;
    for (const p of cfg.players) {
      this.allNames[p.id] = p.name;
      const role: Role = p.id === cfg.grandmaId ? 'grandma' : 'cousin';
      const c = this.makeChar(p, role, role === 'cousin' ? cousinIndex++ : -1);
      this.chars.set(p.id, c);
      if (role === 'cousin') this.cousinIds.push(p.id);
    }
    if (!this.chars.has(this.grandmaId)) throw new Error('grandmaId is not a player');
    this.will = createWill(this.cousinIds);
    this.prefCards = this.shuffle([...PREFERENCE_CARDS]).slice(0, 2);
    this.makeProps();
    this.spawnAll();

    for (const p of cfg.players) {
      if (!p.isBot) continue;
      this.bots.set(p.id, p.id === this.grandmaId ? new GrandmaBot(this, p.id) : new CousinBot(this, p.id));
    }
    // Moments are secret while the match runs: telling Grandma (or the room) that
    // "X complimented Nana, then shoved Y" would hand her the answer. In-match, a
    // moment goes only to the cousin who earned it; Grandma also sees the ones she
    // caused or witnessed (Big Cut, Caught Red-Handed), and Big Cut is public
    // because the will is. Everything is revealed at the Reading of the Will.
    // Favourite-broken would name her secret Favourite, and Framed would tell the
    // framer that Nana fell for it: both wait for the reading.
    this.log.onMoment((moment) => this.emitAll((to) => {
      if (moment.kind === 'big-cut') return { e: 'moment', moment };
      if (moment.kind === 'favourite-broken' || moment.kind === 'framed') return null;
      if (to === moment.actor) return { e: 'moment', moment };
      if (to === this.grandmaId && moment.kind === 'caught-red-handed') return { e: 'moment', moment };
      return null;
    }));
    this.log.onLog((ev, i) => { for (const b of this.bots.values()) b.onLog(ev, i); });
  }

  // ───────────── setup ─────────────

  private makeChar(p: MatchPlayer, role: Role, cousinIndex: number): Char {
    return {
      id: p.id, name: p.name, isBot: p.isBot, connected: true, role,
      body: createBody({ x: 0, y: 0, z: 0 }), yaw: 0, pitch: 0, state: 'normal', ragdollT: 0, knockedBy: null, knockedAt: -Infinity,
      holding: null, sticky: false, running: false, sneaking: false, whispering: false, charge: 0, plantT: 0,
      input: this.blankInput(), last: noBtns(), pressed: noBtns(), released: noBtns(), ack: 0, shoveCd: 0,
      cousinIndex, itemId: role === 'cousin' ? `item-${COUSINS[cousinIndex % COUSINS.length].key}` : null,
      parchmentOpen: false, aidT: 0, aidCd: 0, specsT: 0, specsCd: 0, specsOff: false, caneCd: 0, summonCd: 0, quillT: 0, whistleT: 0,
    };
  }

  blankInput(seq = 0, yaw = 0): InputMsg {
    return { t: 'input', seq, move: { x: 0, z: 0 }, yaw, pitch: 0, run: false, sneak: false, jump: false, whisper: false, primary: false, secondary: false, shove: false, interact: false, plant: false };
  }

  private shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private newProp(id: string, kind: PropKind, pos: Vec3): Prop {
    return {
      id, kind, pos: { ...pos }, vel: { x: 0, y: 0, z: 0 }, resting: true, yaw: 0, heldBy: null, onBody: false, hidden: false,
      broken: false, planted: false, found: false, favourite: false, spot: null, lastBy: null, thrownBy: null, thrownAt: -Infinity, plantLog: null,
    };
  }

  private makeProps(): void {
    const spots = this.shuffle(HEIRLOOM_SPOTS.map((s) => ({ ...s }))).slice(0, HEIRLOOM.perMatch);
    const fav = Math.floor(this.rng() * spots.length);
    spots.forEach((spot, i) => {
      const variant = HEIRLOOM_VARIANTS[i % HEIRLOOM_VARIANTS.length];
      const p = this.newProp(`heirloom-${variant}`, 'heirloom', spot);
      p.variant = variant;
      p.spot = { ...spot };
      p.favourite = i === fav;
      this.props.set(p.id, p);
    });
    for (const id of this.cousinIds) {
      const c = this.chars.get(id)!;
      const p = this.newProp(c.itemId!, 'item', bodyItemPos(c));
      p.owner = id;
      p.heldBy = id;
      p.onBody = true;
      this.props.set(p.id, p);
    }
    const cat = this.newProp('cat', 'cat', SPAWNS.cat);
    cat.cat = { body: createBody(SPAWNS.cat), goal: null, waitUntil: 0, giveUpAt: 0 };
    this.props.set(cat.id, cat);
    this.props.set('teacup', this.newProp('teacup', 'teacup', SPAWNS.teacup));
    const pills = this.newProp('pills', 'pills', SPAWNS.pills[0]);
    pills.hidden = true;
    this.props.set('pills', pills);
  }

  /** Put everyone at their spawn point (match start and each visit). */
  private spawnAll(): void {
    for (const c of this.chars.values()) {
      this.dropHeld(c, false);
      if (c.role === 'grandma') {
        c.body = createBody(SPAWNS.grandma);
        c.yaw = SPAWNS.grandmaYaw;
      } else {
        const i = this.cousinIds.indexOf(c.id);
        c.body = createBody(SPAWNS.cousins[i % SPAWNS.cousins.length]);
        c.yaw = 0;
      }
      if (c.state === 'ragdoll') c.state = 'normal';
      c.ragdollT = 0;
      c.input = this.blankInput(c.input.seq, c.yaw);
    }
    for (const p of this.props.values()) if (p.heldBy && p.onBody) this.followHolder(p);
  }

  // ───────────── public API ─────────────

  nameOf(id: string): string {
    if (this.allNames[id]) return this.allNames[id];
    const p = this.props.get(id);
    if (p?.kind === 'item' && p.owner) {
      const c = this.chars.get(p.owner);
      return c ? COUSINS[c.cousinIndex % COUSINS.length].item : 'item';
    }
    if (p?.kind === 'heirloom') return p.variant ?? 'heirloom';
    return id;
  }

  get grandma(): Char | undefined {
    return this.chars.get(this.grandmaId);
  }

  isHuman(id: string): boolean {
    return this.humans.includes(id);
  }

  /** Human players taking part (they get snapshots). */
  humanIds(): string[] {
    return [...this.humans];
  }

  cousinInfo(): CousinInfo[] {
    return this.cousinIds.map((id) => {
      const c = this.chars.get(id)!;
      const k = COUSINS[c.cousinIndex % COUSINS.length];
      return { id, name: c.name, color: k.color, item: k.key, itemName: k.item };
    });
  }

  matchMsgFor(id: string): ServerMsg {
    const role: Role = id === this.grandmaId ? 'grandma' : 'cousin';
    const names: Record<string, string> = {};
    for (const c of this.chars.values()) names[c.id] = c.name;
    return {
      t: 'match', role, grandmaId: this.grandmaId, cousins: this.cousinInfo(), names, visits: [...this.visits],
      ...(role === 'grandma' ? { prefCards: [...this.prefCards] } : {}), options: { ...this.options },
    };
  }

  phaseMsg(): ServerMsg {
    return { t: 'phase', phase: this.phase, visit: this.currentVisitForPhase(), endsAt: r3(this.phaseEndsAt), time: r3(this.time) };
  }

  private currentVisitForPhase(): VisitId | null {
    if (this.phase === 'roles') return this.visits[0];
    if (this.phase === 'visit') return this.visits[this.visitIndex];
    if (this.phase === 'intermission') return this.visits[this.visitIndex + 1] ?? null;
    return null;
  }

  /** Send the match intro and the first phase. */
  start(): void {
    if (this.started) return;
    this.started = true;
    for (const id of this.humans) this.cfg.send(id, this.matchMsgFor(id));
    this.setPhase('roles', this.durations.roles);
  }

  /** Everything a (re)joining participant needs to catch up. */
  sendStateTo(id: string): void {
    if (!this.chars.has(id) || !this.isHuman(id)) return;
    this.cfg.send(id, this.matchMsgFor(id));
    this.cfg.send(id, this.phaseMsg());
    if (this.wish) this.emit(id, { e: 'wish', wish: this.wish.info });
    if (this.reading && (this.phase === 'reading' || this.phase === 'vote')) this.cfg.send(id, { t: 'reading', result: this.reading });
    if (this.results && this.phase === 'results') this.cfg.send(id, { t: 'results', result: this.results });
  }

  /** Advance the match by `dt` seconds in fixed ticks. */
  step(dt: number): void {
    if (this.over || !this.started || !(dt > 0)) return;
    this.acc += dt;
    const h = 1 / TICK_HZ;
    let guard = 0;
    while (this.acc >= h - 1e-9 && !this.over && guard++ < 100000) {
      this.acc -= h;
      this.tickOnce(h);
    }
  }

  /** Route one validated client message from a participant. Never throws. */
  handle(id: string, msg: ClientMsg): void {
    try {
      switch (msg.t) {
        case 'input': this.handleInput(id, msg); break;
        case 'grandma': this.handleGrandma(id, msg); break;
        case 'quick': this.handleQuick(id, msg.line); break;
        case 'chat': this.handleChat(id, msg.text); break;
        case 'tattle': this.handleTattle(id, msg.accused); break;
        case 'vote': this.handleVote(id, msg.target); break;
        default: break;
      }
    } catch (err) {
      console.error('[match] error handling', msg.t, 'from', id, err);
    }
  }

  handleInput(id: string, msg: InputMsg): void {
    const c = this.chars.get(id);
    if (!c) return;
    // Ignore stale/out-of-order inputs (but accept a client that restarted its counter).
    if (msg.seq <= c.input.seq && c.input.seq - msg.seq < 300 && msg.seq !== 0) return;
    for (const k of BTNS) {
      if (msg[k] && !c.last[k]) c.pressed[k] = true;
      if (!msg[k] && c.last[k]) c.released[k] = true;
      c.last[k] = msg[k];
    }
    c.input = msg;
  }

  /** Bots drive their characters through exactly the same path as humans. */
  botInput(id: string, msg: InputMsg): void {
    this.handleInput(id, msg);
  }

  handleGrandma(id: string, a: GrandmaAction): void {
    if (id !== this.grandmaId) return;
    const g = this.chars.get(id);
    if (!g) return;
    const willAction = a.a === 'bless' || a.a === 'tut' || a.a === 'set';
    if (this.phase !== 'visit' || this.pause) {
      if (willAction) this.emit(id, { e: 'will-rejected', target: a.target, reason: 'not-now' });
      return;
    }
    switch (a.a) {
      case 'bless': this.quickEdit(a.target, WILL.quickStep); break;
      case 'tut': this.quickEdit(a.target, -WILL.quickStep); break;
      case 'set': {
        if (!this.cousinIds.includes(a.target)) { this.emit(id, { e: 'will-rejected', target: a.target, reason: 'unknown-target' }); break; }
        if (!g.parchmentOpen) { this.emit(id, { e: 'will-rejected', target: a.target, reason: 'needs-parchment' }); break; }
        if (this.willFrozen) { this.emit(id, { e: 'will-rejected', target: a.target, reason: 'frozen' }); break; }
        const r = this.applyWill(a.target, 0, 'parchment', false, a.value);
        if (!r.ok) this.emit(id, { e: 'will-rejected', target: a.target, reason: r.reason ?? 'rejected' });
        else this.quillNow(g);
        break;
      }
      case 'parchment':
        if (a.open) this.openParchment(g);
        else this.closeParchment(g);
        break;
      case 'summon': {
        if (g.summonCd > 0) { this.emit(id, { e: 'toast', text: `Summon is ready in ${Math.ceil(g.summonCd)} s.` }); break; }
        g.summonCd = GRANDMA.summonCooldown;
        this.summon = { pos: { ...g.body.pos }, endsAt: this.time + GRANDMA.summonGrace };
        this.emitAll({ e: 'summon', pos: v3(g.body.pos), endsAt: r3(this.summon.endsAt) });
        break;
      }
      case 'pin': {
        const p = this.props.get(a.item);
        if (!p || p.kind !== 'item' || !p.found) { this.emit(id, { e: 'toast', text: 'Nothing found to pin.' }); break; }
        this.pinned.add(p.id);
        this.emit(id, { e: 'toast', text: `Pinned: ${this.nameOf(p.owner ?? '')}'s ${this.nameOf(p.id)}.` });
        break;
      }
    }
  }

  handleQuick(id: string, line: number): void {
    const c = this.chars.get(id);
    if (!c) return;
    const lines: readonly string[] = c.role === 'grandma' ? QUICKCHAT.grandma : QUICKCHAT.cousin;
    const text = lines[line];
    if (typeof text !== 'string') return;
    this.bubble(c, text, true, line);
    if (c.role === 'cousin' && COMPLIMENT_LINES.includes(line)) this.maybeCompliment(c, text);
  }

  handleChat(id: string, text: string): void {
    const c = this.chars.get(id);
    if (!c || typeof text !== 'string' || text.length === 0) return;
    this.bubble(c, text.slice(0, 140), false);
    if (c.role === 'cousin' && COMPLIMENT_RE.test(text) && NANA_RE.test(text)) this.maybeCompliment(c, text);
  }

  handleTattle(id: string, accused: string): void {
    const c = this.chars.get(id);
    const g = this.grandma;
    if (!c || !g || c.role !== 'cousin' || this.phase !== 'visit' || this.pause) return;
    if (accused === id || !this.cousinIds.includes(accused)) return;
    if (flatDist(c.body.pos, g.body.pos) > COUSIN.tattleRange || Math.abs(c.body.pos.y - g.body.pos.y) > 1.5) {
      this.emit(id, { e: 'toast', text: `Get within ${COUSIN.tattleRange} m of Nana to tattle.` });
      return;
    }
    if (this.grandmaHears(c.body.pos, c.whispering) === 'silent') {
      this.emit(id, { e: 'toast', text: 'Nana cannot hear a whisper from there.' });
      return;
    }
    this.log.add({ t: this.time, kind: 'tattle', by: id, accused });
    const range = c.whispering ? VOICE.whisperRange : VOICE.cousinRange;
    this.emitAll((to) => {
      if (to === id || to === this.grandmaId) return { e: 'tattle', from: id, accused };
      const o = this.chars.get(to);
      return o && dist(o.body.pos, c.body.pos) <= range ? { e: 'tattle', from: id, accused } : null;
    });
  }

  handleVote(id: string, target: string): void {
    if (this.phase !== 'vote' || !this.chars.has(id)) return;
    if (target === id || !this.cousinIds.includes(target)) return;
    this.votes.set(id, target);
  }

  /** A participant's connection dropped or came back. */
  setConnected(id: string, connected: boolean): void {
    const c = this.chars.get(id);
    if (!c || c.isBot || this.over) return;
    if (c.connected === connected) return;
    c.connected = connected;
    const live = this.phase === 'roles' || this.phase === 'visit' || this.phase === 'intermission';
    if (!connected) {
      if (c.role === 'cousin') {
        this.dropHeld(c, true);
        c.state = 'sleeping';
        c.ragdollT = 0;
        this.emitAll({ e: 'toast', text: `${c.name} dozed off.` });
        this.checkFewCousins();
      } else if (live && !this.pause) {
        // Grandma's lie-down: she shows as asleep (so cousins get the take-over
        // prompt), the match clock stops, and after GRANDMA_TAKEOVER_GRACE s a
        // willing human cousin may take over; nobody does → the will is read.
        this.closeParchment(c);
        this.dropHeld(c, false);
        c.state = 'sleeping';
        c.ragdollT = 0;
        this.pause = { since: this.time, until: this.time + DISCONNECT.grandmaLieDown };
        this.emitAll({ e: 'toast', text: `Nana is having a lie-down. A willing cousin can take over (press J) in a moment.` });
      } else if (!live) {
        c.state = 'sleeping';
      }
    } else {
      if (c.state === 'sleeping') { c.state = 'normal'; c.ragdollT = 0; }
      if (c.role === 'grandma' && this.pause) {
        this.pause = null;
        this.emitAll({ e: 'toast', text: 'Nana is back on her feet!' });
        this.broadcastPhase();
      }
    }
  }

  /**
   * During Grandma's lie-down, a willing human cousin takes over as Grandma.
   * Only while the match is live, and not in the first GRANDMA_TAKEOVER_GRACE
   * seconds (the real Grandma gets a moment to reconnect).
   */
  takeOverGrandma(id: string): boolean {
    if (!this.pause) return false;
    if (!(this.phase === 'roles' || this.phase === 'visit' || this.phase === 'intermission')) return false;
    const c = this.chars.get(id);
    if (!c || c.role !== 'cousin' || c.isBot || !c.connected) return false;
    if (this.time - this.pause.since < GRANDMA_TAKEOVER_GRACE) {
      this.emit(id, { e: 'toast', text: 'Give Nana a moment to come back...' });
      return false;
    }
    const old = this.grandma;
    if (old) {
      this.chars.delete(old.id);
      this.humans = this.humans.filter((h) => h !== old.id);
    }
    // The new Grandma leaves the will. Her share is split equally between all
    // the other cousins (awake or not), any odd points to the lowest shares
    // first, and everybody is told: the game never moves shares in secret.
    const mine = this.will.shares[id] ?? 0;
    const rest = this.cousinIds.filter((x) => x !== id);
    const shares: Record<string, number> = {};
    for (const cid of rest) shares[cid] = this.will.shares[cid] ?? 0;
    const each = rest.length ? Math.floor(mine / rest.length) : 0;
    let odd = mine - each * rest.length;
    const lowestFirst = [...rest].sort((a, b) => shares[a] - shares[b] || rest.indexOf(a) - rest.indexOf(b));
    const gain: Record<string, number> = {};
    for (const cid of lowestFirst) {
      gain[cid] = each + (odd > 0 ? 1 : 0);
      if (odd > 0) odd--;
      shares[cid] += gain[cid];
    }
    this.will.shares = shares;
    for (const cid of rest) if (gain[cid] > 0) this.log.add({ t: this.time, kind: 'will', target: cid, moved: gain[cid], via: 'takeover' });
    this.cousinIds = rest;
    this.dropHeld(c, false);
    if (c.itemId) {
      const item = this.props.get(c.itemId);
      if (item) {
        const holder = item.heldBy ? this.chars.get(item.heldBy) : undefined;
        if (holder && holder.holding === item.id) { holder.holding = null; holder.sticky = false; }
        this.props.delete(item.id);
      }
      c.itemId = null;
    }
    c.role = 'grandma';
    c.cousinIndex = -1;
    this.grandmaId = id;
    this.pause = null;
    for (const h of this.humans) this.cfg.send(h, this.matchMsgFor(h));
    this.broadcastPhase();
    this.emitAll({ e: 'toast', text: `${c.name} is Grandma now! Their ${mine}% of the will is shared out equally between the others.` });
    this.checkFewCousins();
    return true;
  }

  grandmaSense(): GrandmaSenseState | null {
    const g = this.grandma;
    if (!g) return null;
    return {
      pos: g.body.pos, yaw: g.yaw, aidActive: g.aidT > 0, specsActive: g.specsT > 0 && !g.specsOff, specsOff: g.specsOff,
      dark: this.dark, flash: this.flash,
    };
  }

  /**
   * What Grandma perceives of a point right now: her vision band, whether she
   * has line of sight to it (`height` above `p`: a chest, an item), whether she
   * could identify who/what is there (soft or sharp), and whether it is inside
   * her sharp vision. Asleep (disconnected) or on her lie-down: nothing.
   */
  perceive(p: Vec3, height = CHEST_HEIGHT): Perception {
    const g = this.grandma;
    if (!g || !g.connected || this.pause || g.state === 'sleeping') return { band: 'none', visible: false, identifiable: false, sharp: false, dist: Infinity };
    const d = dist(g.body.pos, p);
    const s = this.grandmaSense();
    const band = s ? visionBand(s, p) : 'none';
    if (band === 'none' || !lineOfSight(eyeOf(g.body.pos), { x: p.x, y: p.y + height, z: p.z })) {
      return { band: 'none', visible: false, identifiable: false, sharp: false, dist: d };
    }
    return { band, visible: true, identifiable: band === 'sharp' || band === 'soft', sharp: band === 'sharp', dist: d };
  }

  /** Can Grandma see this point clearly enough to recognise who (or what) is there? */
  canSeeNow(p: Vec3, height = CHEST_HEIGHT): boolean {
    return this.perceive(p, height).identifiable;
  }

  /** How Grandma hears a voice from a speaker at `p` (whispering shrinks it to 1.5 m). */
  grandmaHears(p: Vec3, whisper: boolean): HearingBand {
    const g = this.grandma;
    if (!g || !g.connected || this.pause) return 'silent';
    return hearingBand(dist(g.body.pos, p), g.aidT > 0, whisper ? VOICE.whisperRange : Infinity);
  }

  // ───────────── the tick ─────────────

  private tickOnce(h: number): void {
    this.tick++;
    this.time += h;
    if (this.pause) {
      // The match stands still: every deadline moves with the clock, and
      // buttons pressed meanwhile do not all fire at once on resume.
      this.shiftDeadlines(h);
      for (const c of this.chars.values()) { c.pressed = noBtns(); c.released = noBtns(); }
      if (this.time >= this.pause.until) {
        this.pause = null;
        this.startReading('Nana has gone to bed. The will is read as it stands.');
      }
      this.snapshots(h);
      return;
    }
    if (!this.cfg.botsIdle) {
      for (const b of this.bots.values()) {
        try { b.update(h); } catch (err) { console.error('[bot] error', b.id, err); }
      }
    }
    for (const c of this.chars.values()) this.updateChar(c, h);
    const all = [...this.chars.values()];
    const g = this.grandma;
    separateCharacters(all, g && !this.options.pushGrandma ? new Set<PhysChar>([g]) : new Set<PhysChar>());
    for (const c of all) {
      const spawn = c.role === 'grandma' ? SPAWNS.grandma : SPAWNS.cousins[Math.max(0, this.cousinIds.indexOf(c.id)) % SPAWNS.cousins.length];
      if (rescueIfLost(c, spawn)) this.dropHeld(c, false);
    }
    this.updateProps(h);
    if (this.phase === 'visit') {
      this.updateGrandmaSystems(h);
      this.updateWish();
      this.updateStorm();
      this.updateFound();
      this.updateSummon();
    }
    this.checkPhase();
    this.snapshots(h);
  }

  /** Push every running deadline back by `h` seconds (the match is paused). */
  private shiftDeadlines(h: number): void {
    this.phaseEndsAt += h;
    if (this.wish) this.wish.info = { ...this.wish.info, endsAt: r3(this.wish.info.endsAt + h) };
    this.nextWishAt += h;
    if (this.summon) this.summon.endsAt += h;
    this.nextLightning += h;
    this.flashUntil += h;
    for (const r of this.will.recent) r.t += h;
    for (const cr of this.crimes) cr.t += h;
    for (const c of this.chars.values()) c.knockedAt += h;
    for (const p of this.props.values()) p.thrownAt += h;
  }

  private updateChar(c: Char, h: number): void {
    const inp = c.input;
    const live = this.phase === 'visit' || this.phase === 'intermission';
    const upright = c.state === 'normal';
    const canMove = live && upright && c.connected;
    const canAct = this.phase === 'visit' && upright && c.connected;
    if (upright && c.connected) {
      c.yaw = inp.yaw;
      c.pitch = inp.pitch;
    }
    c.shoveCd = Math.max(0, c.shoveCd - h);
    if (c.role === 'grandma') {
      c.aidT = Math.max(0, c.aidT - h);
      c.aidCd = Math.max(0, c.aidCd - h);
      c.specsT = Math.max(0, c.specsT - h);
      c.specsCd = Math.max(0, c.specsCd - h);
      c.caneCd = Math.max(0, c.caneCd - h);
      c.summonCd = Math.max(0, c.summonCd - h);
    }
    if (canAct) {
      if (c.role === 'cousin') this.cousinActions(c, h);
      else this.grandmaActions(c);
    } else {
      c.charge = 0;
      c.plantT = 0;
    }
    c.pressed = noBtns();
    c.released = noBtns();

    const cmd = canMove ? { move: inp.move, yaw: c.yaw, run: inp.run, sneak: inp.sneak, jump: inp.jump } : null;
    const r = stepCharacter(c, cmd, h, c.parchmentOpen);
    const moving = Math.hypot(c.body.vel.x, c.body.vel.z) > 0.3;
    c.running = !!cmd && c.role === 'cousin' && inp.run && !inp.sneak && moving;
    c.sneaking = !!cmd && c.role === 'cousin' && inp.sneak && moving;
    c.whispering = c.role === 'cousin' && inp.whisper && c.connected;
    c.ack = inp.seq;
    if (r.fellOver) {
      this.dropHeld(c, true);
      if (c.role === 'grandma') this.grandmaFell();
    }
    if (c.state === 'ragdoll') {
      if (c.holding) this.dropHeld(c, true);
      this.toppleCheck(c);
    }
  }

  // ───────────── cousin actions ─────────────

  private cousinActions(c: Char, h: number): void {
    const inp = c.input, pr = c.pressed, rel = c.released;
    if (pr.shove && c.shoveCd <= 0) this.doShove(c);
    if (pr.primary) {
      if (c.holding && c.sticky) this.setDown(c);
      else if (!c.holding) this.tryGrab(c);
    } else if (c.holding && !c.sticky && !inp.primary) {
      this.setDown(c);
    }
    if (c.holding) {
      if (inp.secondary) c.charge = Math.min(1, c.charge + h / COUSIN.throwChargeTime);
      else if (c.charge > 0 || rel.secondary) this.doThrow(c);
    } else {
      c.charge = 0;
    }
    if (pr.interact) this.doInteract(c);
    const held = c.holding ? this.props.get(c.holding) : undefined;
    if (inp.plant && held && held.kind === 'item' && held.owner !== c.id) {
      c.plantT += h;
      if (c.plantT >= COUSIN.plantHold) this.doPlant(c, held);
    } else {
      c.plantT = 0;
    }
  }

  private inReach(c: Char, p: Vec3, reach: number = COUSIN.reach): boolean {
    const dy = p.y - c.body.pos.y;
    return flatDist(c.body.pos, p) <= reach && dy >= -0.7 && dy <= 2.1;
  }

  private doShove(c: Char): void {
    c.shoveCd = COUSIN.shoveCooldown;
    const f = forwardOf(c.yaw);
    let best: Char | null = null;
    let bestD = Infinity;
    for (const o of this.chars.values()) {
      if (o === c || o.state === 'sleeping') continue;
      if (o.role === 'grandma' && !this.options.pushGrandma) continue;
      const dx = o.body.pos.x - c.body.pos.x, dz = o.body.pos.z - c.body.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > COUSIN.shoveRange + 0.15 || Math.abs(o.body.pos.y - c.body.pos.y) > 1.2) continue;
      if (d > 0.05 && (dx * f.x + dz * f.z) / d < 0.34) continue;
      if (d < bestD) { best = o; bestD = d; }
    }
    if (!best) return;
    const dir = bestD > 0.05 ? { x: best.body.pos.x - c.body.pos.x, z: best.body.pos.z - c.body.pos.z } : f;
    // Knock back first, so whatever the victim drops is blamed on the shover.
    knockback(best, dir, COUSIN.shoveImpulse, 2.5, c.id, this.time);
    this.dropHeld(best, true);
    best.charge = 0;
    best.plantT = 0;
    const pos = { ...best.body.pos };
    const who = this.perceive(c.body.pos);
    const vic = this.perceive(pos);
    const seen = who.identifiable;
    // Grandma hears a shove (the "oof") within earshot. Her client only learns
    // who shoved, or who was shoved, if she could see them.
    this.emitAll((to) => {
      if (to !== this.grandmaId) return { e: 'shove', by: c.id, victim: best.id, pos: v3(pos) };
      if (vic.dist > SENSES.mumble) return null;
      return { e: 'shove', by: seen ? c.id : '', victim: vic.identifiable ? best.id : '', pos: vic.visible ? v3(pos) : coarse(pos) };
    });
    const idx = this.log.add({ t: this.time, kind: 'shove', by: c.id, victim: best.id, pos, seen, sharp: who.sharp });
    this.addCrime('shove', c.id, pos, idx);
    if (best.role === 'grandma') {
      this.knockSpecsOff(best, c.id, seen, who.sharp);
      this.grandmaFell();
    }
  }

  private tryGrab(c: Char): void {
    let best: Prop | null = null;
    let bestD = Infinity;
    for (const p of this.props.values()) {
      if (p.hidden || p.heldBy) continue;
      if (p.kind === 'heirloom' && p.broken) continue;
      if (!this.inReach(c, p.pos)) continue;
      const d = dist(handPos(c), p.pos);
      if (d < bestD) { best = p; bestD = d; }
    }
    if (!best) return;
    if (best.kind === 'item' && best.owner === c.id) {
      // Your own item goes straight back on you.
      best.heldBy = c.id;
      best.onBody = true;
      best.planted = false;
      best.found = false;
      best.resting = false;
      this.followHolder(best);
      this.emit(c.id, { e: 'toast', text: `You got your ${this.nameOf(best.id)} back.` });
      return;
    }
    if (best.kind === 'item') best.planted = false;
    best.heldBy = c.id;
    best.onBody = false;
    best.resting = false;
    best.spot = null;
    best.lastBy = c.id;
    best.thrownBy = null;
    c.holding = best.id;
    c.sticky = false;
    this.followHolder(best);
  }

  /** Release what is held: gently set down if possible. */
  private setDown(c: Char): void {
    const p = c.holding ? this.props.get(c.holding) : undefined;
    if (!p) { c.holding = null; c.sticky = false; return; }
    const at = setDownPos(c);
    if (!at) { this.dropHeld(c, true); return; }
    this.release(c, p);
    p.pos = at;
    p.vel = { x: 0, y: 0, z: 0 };
    p.resting = true;
    if (p.kind === 'heirloom') {
      const spot = HEIRLOOM_SPOTS.find((s) => flatDist(s, at) < 0.45 && Math.abs(s.y - at.y) < 0.05);
      p.spot = spot ? { ...spot } : null;
    }
    if (p.kind === 'cat' && p.cat) p.cat.body = createBody(at);
  }

  private release(c: Char, p: Prop): void {
    p.heldBy = null;
    p.onBody = false;
    if (c.holding === p.id) { c.holding = null; c.sticky = false; }
    c.charge = 0;
    c.plantT = 0;
  }

  /** Drop what is held. `physics`: it falls with the holder's velocity (and may break). */
  dropHeld(c: Char, physics: boolean): void {
    if (!c.holding) return;
    const p = this.props.get(c.holding);
    c.holding = null;
    c.sticky = false;
    c.charge = 0;
    c.plantT = 0;
    if (!p || p.heldBy !== c.id) return;
    p.heldBy = null;
    p.onBody = false;
    p.pos = handPos(c);
    if (physics) {
      p.vel = { ...c.body.vel };
      p.resting = false;
      const blame = c.state !== 'normal' && c.knockedBy && this.time - c.knockedAt < 3 ? c.knockedBy : c.id;
      // Grandma's own cane never makes her the culprit of what it knocks over.
      p.lastBy = blame === this.grandmaId ? null : blame;
      p.thrownBy = null;
    } else {
      const g = groundHeight(p.pos.x, p.pos.z, p.pos.y, 0.05);
      p.pos.y = g;
      p.vel = { x: 0, y: 0, z: 0 };
      p.resting = true;
    }
    if (p.kind === 'cat' && p.cat) p.cat.body = createBody(p.pos);
  }

  private doThrow(c: Char): void {
    const p = c.holding ? this.props.get(c.holding) : undefined;
    if (!p) { c.charge = 0; return; }
    const speed = COUSIN.throwSpeedMin + (COUSIN.throwSpeedMax - COUSIN.throwSpeedMin) * c.charge;
    const pitch = Math.max(-0.6, Math.min(1.0, c.pitch + 0.25));
    const f = forwardOf(c.yaw);
    const hp = handPos(c);
    this.release(c, p);
    p.pos = hp;
    p.vel = {
      x: f.x * Math.cos(pitch) * speed + c.body.vel.x * 0.5,
      y: Math.sin(pitch) * speed,
      z: f.z * Math.cos(pitch) * speed + c.body.vel.z * 0.5,
    };
    p.resting = false;
    p.spot = null;
    p.thrownBy = c.id;
    p.thrownAt = this.time;
    p.lastBy = c.id;
    p.planted = false;
  }

  private doInteract(c: Char): void {
    const g = this.grandma;
    const held = c.holding ? this.props.get(c.holding) : undefined;
    // 1. Deliver the wish.
    if (held) {
      if (this.wish && held.id === this.wish.propId && g && flatDist(c.body.pos, g.body.pos) <= WISH.deliverRange && Math.abs(c.body.pos.y - g.body.pos.y) < 1.5) {
        this.deliverWish(c, held);
      }
      return;
    }
    // 2. A signature item lying around: your own goes back on you; anyone else's into your hands.
    let item: Prop | null = null;
    let bestD = Infinity;
    for (const p of this.props.values()) {
      if (p.kind !== 'item' || p.heldBy || p.hidden || !this.inReach(c, p.pos)) continue;
      const d = flatDist(c.body.pos, p.pos);
      if (d < bestD) { item = p; bestD = d; }
    }
    if (item) {
      item.heldBy = c.id;
      item.resting = false;
      item.planted = false;
      if (item.owner === c.id) {
        item.onBody = true;
        item.found = false;
        this.emit(c.id, { e: 'toast', text: `You got your ${this.nameOf(item.id)} back.` });
      } else {
        item.onBody = false;
        c.holding = item.id;
        c.sticky = true;
      }
      this.followHolder(item);
      return;
    }
    // 3. Snatch your own item back from whoever holds it.
    const mine = c.itemId ? this.props.get(c.itemId) : undefined;
    if (mine && mine.heldBy && mine.heldBy !== c.id) {
      const holder = this.chars.get(mine.heldBy);
      if (holder && this.inReach(c, holder.body.pos, COUSIN.reach) && Math.abs(holder.body.pos.y - c.body.pos.y) < 1.2) {
        holder.holding = null;
        holder.sticky = false;
        holder.plantT = 0;
        mine.heldBy = c.id;
        mine.onBody = true;
        mine.planted = false;
        this.emit(c.id, { e: 'toast', text: `You snatched your ${this.nameOf(mine.id)} back from ${holder.name}.` });
        return;
      }
    }
    // 4. Steal another cousin's signature item off their body.
    let victim: Char | null = null;
    let vd = Infinity;
    for (const o of this.chars.values()) {
      if (o === c || o.role !== 'cousin' || !o.itemId) continue;
      const it = this.props.get(o.itemId);
      if (!it || it.heldBy !== o.id || !it.onBody) continue;
      if (!this.inReach(c, o.body.pos) || Math.abs(o.body.pos.y - c.body.pos.y) > 1.2) continue;
      const d = flatDist(c.body.pos, o.body.pos);
      if (d < vd) { victim = o; vd = d; }
    }
    if (victim && victim.itemId) {
      const it = this.props.get(victim.itemId)!;
      it.heldBy = c.id;
      it.onBody = false;
      c.holding = it.id;
      c.sticky = true;
      this.followHolder(it);
      const pos = { ...c.body.pos };
      const who = this.perceive(c.body.pos);
      const idx = this.log.add({ t: this.time, kind: 'steal', by: c.id, item: it.id, owner: victim.id, pos, seen: who.identifiable, sharp: who.sharp });
      this.addCrime('steal', c.id, pos, idx);
      this.emit(c.id, { e: 'toast', text: `You pinched ${victim.name}'s ${this.nameOf(it.id).toLowerCase()}! Hold G to plant it somewhere damning.` });
      return;
    }
    this.hint(c, this.interactHint(c));
  }

  /** Why an Interact press did nothing (shown to that player only, at most once a second). */
  private interactHint(c: Char): string {
    const g = this.grandma;
    const near = (o: Char) => o !== c && o.role === 'cousin' && this.inReach(c, o.body.pos) && Math.abs(o.body.pos.y - c.body.pos.y) <= 1.2;
    const robbed = [...this.chars.values()].find((o) => near(o));
    if (robbed) return `${robbed.name}'s item is already gone.`;
    if (g && flatDist(c.body.pos, g.body.pos) <= WISH.deliverRange + 0.5) return 'Bring Nana what she wished for, then press E next to her.';
    return 'Nothing to take here. Stand right next to a cousin to pinch their item.';
  }

  private hintAt = new Map<string, number>();
  /** A small private hint toast, rate-limited per player. */
  private hint(c: Char, text: string): void {
    if (c.isBot) return;
    const last = this.hintAt.get(c.id) ?? -Infinity;
    if (this.time - last < 1.5) return;
    this.hintAt.set(c.id, this.time);
    this.emit(c.id, { e: 'toast', text });
  }

  private doPlant(c: Char, item: Prop): void {
    const { x, z } = inFrontClear(c, 0.35, 0.4);
    const y = groundHeight(x, z, c.body.pos.y + 0.4, 0.5);
    this.release(c, item);
    item.pos = { x, y, z };
    item.vel = { x: 0, y: 0, z: 0 };
    item.resting = true;
    item.planted = true;
    item.found = false;
    item.lastBy = c.id;
    const crimeScene = this.crimes.some((cr) => cr.kind === 'break' && this.time - cr.t <= CRIME_SCENE.duration && dist(cr.pos, item.pos) <= CRIME_SCENE.radius);
    const owner = item.owner ?? '';
    const pos = { ...item.pos };
    const who = this.perceive(c.body.pos);
    const idx = this.log.add({ t: this.time, kind: 'plant', by: c.id, item: item.id, owner, pos, seen: who.identifiable, sharp: who.sharp });
    item.plantLog = idx;
    this.addCrime('plant', c.id, pos, idx);
    this.emit(c.id, { e: 'toast', text: crimeScene ? `Planted ${this.nameOf(owner)}'s ${this.nameOf(item.id)} at the scene of the crime.` : `Planted ${this.nameOf(owner)}'s ${this.nameOf(item.id)}.` });
  }

  // ───────────── Grandma actions ─────────────

  private grandmaActions(g: Char): void {
    const pr = g.pressed;
    if (pr.primary && g.caneCd <= 0) this.doCane(g);
    if (pr.secondary && g.aidCd <= 0 && g.aidT <= 0) {
      g.aidT = HEARING_AID.duration;
      // 6 s of clear hearing, then a 25 s recharge.
      g.aidCd = HEARING_AID.duration + HEARING_AID.cooldown;
      g.whistleT = 0;
    }
    if (pr.shove) {
      if (g.specsOff) {
        g.specsOff = false;
        g.specsCd = Math.max(g.specsCd, 2);
        this.emit(g.id, { e: 'toast', text: 'You put your spectacles back on.' });
      } else if (g.specsCd <= 0 && g.specsT <= 0) {
        g.specsT = SPECTACLES.duration;
        g.specsCd = SPECTACLES.cooldown;
      }
    }
  }

  private doCane(g: Char): void {
    g.caneCd = GRANDMA.caneCooldown;
    const f = forwardOf(g.yaw);
    let best: Char | null = null;
    let bestD = Infinity;
    for (const o of this.chars.values()) {
      if (o.role !== 'cousin' || o.state === 'sleeping') continue;
      const dx = o.body.pos.x - g.body.pos.x, dz = o.body.pos.z - g.body.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > GRANDMA.caneRange || Math.abs(o.body.pos.y - g.body.pos.y) > 1.5) continue;
      if (d > 0.05 && (dx * f.x + dz * f.z) / d < 0.64) continue;
      if (d < bestD) { best = o; bestD = d; }
    }
    if (!best) return;
    knockback(best, { x: best.body.pos.x - g.body.pos.x, z: best.body.pos.z - g.body.pos.z }, GRANDMA.caneImpulse, 2, g.id, this.time);
    this.dropHeld(best, true);
    this.log.add({ t: this.time, kind: 'cane', victim: best.id });
    this.emitAll({ e: 'cane', victim: best.id, pos: v3(best.body.pos) });
  }

  private openParchment(g: Char): void {
    if (g.parchmentOpen) return;
    g.parchmentOpen = true;
    g.quillT = 0;
    this.sharesAtOpen = { ...this.will.shares };
  }

  private closeParchment(g: Char): void {
    if (!g.parchmentOpen) return;
    g.parchmentOpen = false;
    const before = this.sharesAtOpen;
    this.sharesAtOpen = null;
    if (!before) return;
    const loss: Record<string, number> = {};
    for (const id of this.cousinIds) loss[id] = (before[id] ?? 0) - (this.will.shares[id] ?? 0);
    this.log.bigCuts(this.time, g.id, loss);
  }

  private quillNow(g: Char): void {
    g.quillT = 0.8;
    for (const c of this.chars.values()) {
      if (c.role === 'cousin' && dist(c.body.pos, g.body.pos) <= WILL.quillRange) this.emit(c.id, { e: 'quill', pos: v3(g.body.pos) });
    }
  }

  private grandmaFell(): void {
    if (!this.options.pushGrandma || this.willFrozen) return;
    this.willFrozen = true;
    this.emitAll({ e: 'toast', text: 'Nana fell over! The will is frozen as it stands.' });
  }

  private quickEdit(target: string, delta: number): void {
    const gid = this.grandmaId;
    if (!this.cousinIds.includes(target)) { this.emit(gid, { e: 'will-rejected', target, reason: 'unknown-target' }); return; }
    if (this.willFrozen) { this.emit(gid, { e: 'will-rejected', target, reason: 'frozen' }); return; }
    const free = delta < 0 && this.freeTuts > 0;
    const r = this.applyWill(target, delta, delta > 0 ? 'bless' : 'tut', free);
    if (!r.ok) { this.emit(gid, { e: 'will-rejected', target, reason: r.reason ?? 'rejected' }); return; }
    if (free) this.freeTuts--;
    // An accusation is a Tut that actually landed.
    if (delta < 0) this.checkAccusation(target);
  }

  /**
   * Change the will through shared/will.ts. Sleeping cousins' shares are frozen
   * (left out of the proportional share-out). `free` bypasses the budget and
   * rolling cap (the favourite-heirloom free Tut).
   */
  private applyWill(target: string, delta: number, via: 'bless' | 'tut' | 'parchment', free: boolean, setValue?: number, silent = false): WillResult {
    const w = this.will;
    const removed: Record<string, number> = {};
    for (const id of this.cousinIds) {
      if (id === target) continue;
      if (this.chars.get(id)?.state === 'sleeping' && id in w.shares) { removed[id] = w.shares[id]; delete w.shares[id]; }
    }
    const savedUsed = w.usedThisVisit, savedRecent = w.recent;
    if (free) { w.usedThisVisit = 0; w.recent = []; }
    let r: WillResult;
    try {
      r = setValue !== undefined ? setShare(w, target, setValue, this.time) : applyChange(w, target, delta, this.time, via === 'parchment');
    } finally {
      if (free) { w.usedThisVisit = savedUsed; w.recent = savedRecent; }
      const shares: Record<string, number> = {};
      for (const id of Object.keys(w.shares).concat(Object.keys(removed))) shares[id] = id in removed ? removed[id] : w.shares[id];
      const ordered: Record<string, number> = {};
      for (const id of this.cousinIds) if (id in shares) ordered[id] = shares[id];
      for (const id of Object.keys(shares)) if (!(id in ordered)) ordered[id] = shares[id];
      w.shares = ordered;
    }
    if (r.ok && !silent) {
      if (!free) this.visitUsed[this.visitIndex] = (this.visitUsed[this.visitIndex] ?? 0) + Math.abs(r.moved);
      this.log.add({ t: this.time, kind: 'will', target, moved: r.moved, via });
      // Only Grandma is told a Tut was her free one: it would name the Favourite to cousins.
      this.emitAll((to) => ({ e: 'will', target, moved: r.moved, via, ...(free && to === this.grandmaId ? { reason: 'favourite' } : {}) }));
    }
    return r;
  }

  private checkAccusation(target: string): void {
    const recent = this.crimes.filter((cr) => this.time - cr.t <= WILL.accuseWindow && cr.near.includes(target));
    let crime: number | null = null;
    let accused = false;
    if (recent.length > 0) {
      crime = recent[recent.length - 1].logIndex;
      accused = true;
    } else {
      for (const p of this.props.values()) {
        if (p.kind === 'item' && p.owner === target && p.planted && p.found) { crime = p.plantLog; accused = true; break; }
      }
    }
    if (accused) this.log.add({ t: this.time, kind: 'accuse', target, crime });
  }

  private addCrime(kind: Crime['kind'], by: string | null, pos: Vec3, logIndex: number): void {
    // Everyone near the scene, and always the culprit (a thrower can be far from the shards).
    const near = this.cousinIds.filter((id) => {
      const c = this.chars.get(id);
      return !!c && (id === by || dist(c.body.pos, pos) <= CRIME_SCENE.radius);
    });
    this.crimes.push({ t: this.time, pos: { ...pos }, kind, by, logIndex, near });
  }

  // ───────────── text ─────────────

  /** A compliment counts only if Grandma hears it clearly (within 2 m, 6 m with the hearing aid; whispers 1.5 m). */
  private maybeCompliment(c: Char, line: string): void {
    const g = this.grandma;
    if (!g || this.phase !== 'visit' || this.pause) return;
    if (this.grandmaHears(c.body.pos, c.whispering) !== 'clear') return;
    this.log.add({ t: this.time, kind: 'compliment', by: c.id, line });
  }

  /**
   * A speech bubble. Cousins read it within earshot of the speaker (15 m, or
   * 1.5 m for a whisper). Grandma gets what she would hear: nothing when it is
   * out of her hearing, quick-chat lines misheard and typed lines scrambled
   * when muffled, and the speaker's identity only if she can see them.
   */
  private bubble(c: Char, text: string, quick: boolean, line = -1): void {
    const whisper = c.whispering;
    const g = this.grandma;
    const range = whisper ? VOICE.whisperRange : VOICE.cousinRange;
    const plain: GameEvent = { e: 'bubble', from: c.id, text, quick, whisper };
    this.emitAll((to) => {
      if (to === c.id) return plain;
      if (to === this.grandmaId) {
        if (!g) return null;
        const band = this.grandmaHears(c.body.pos, whisper);
        if (band === 'silent') return null;
        const heard = quick && line >= 0 && c.role === 'cousin' ? mishear(line, band, this.secret, this.tick) : scrambleText(text, band, hashStr(`${this.secret}:${c.id}:${this.tick}`));
        const seen = this.canSeeNow(c.body.pos);
        return { e: 'bubble', from: seen ? c.id : '', text: heard, quick, whisper: false, ...(seen ? {} : { pos: coarse(c.body.pos) }) };
      }
      const o = this.chars.get(to);
      if (!o || dist(o.body.pos, c.body.pos) > range) return null;
      return plain;
    });
  }

  // ───────────── props ─────────────

  private followHolder(p: Prop): void {
    const h = p.heldBy ? this.chars.get(p.heldBy) : undefined;
    if (!h) return;
    p.pos = p.onBody ? bodyItemPos(h) : handPos(h);
    p.vel = { ...h.body.vel };
    p.yaw = h.yaw;
  }

  private updateProps(h: number): void {
    for (const p of this.props.values()) {
      if (p.hidden) continue;
      if (p.heldBy) {
        const holder = this.chars.get(p.heldBy);
        if (!holder) { p.heldBy = null; p.onBody = false; p.resting = false; } else { this.followHolder(p); continue; }
      }
      if (p.kind === 'cat' && p.resting) { this.updateCat(p, h); continue; }
      if (p.resting) continue;
      const speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
      const impact = stepProp(p, h);
      if (propOutside(p.pos)) { this.rescueProp(p); continue; }
      if (speed > 3 && !p.resting) {
        const ignore = this.time - p.thrownAt < 0.3 ? p.thrownBy : null;
        const victim = propHitsChar(p, this.chars.values(), ignore);
        if (victim) this.propHitChar(p, victim, speed);
      }
      if (p.kind === 'heirloom' && !p.broken && impact > HEIRLOOM.breakSpeed) this.breakHeirloom(p);
      if (p.resting) {
        p.thrownBy = null;
        if (p.kind === 'cat' && p.cat) p.cat.body = createBody(p.pos);
      }
    }
  }

  /** A prop that somehow left the house comes back somewhere sensible. */
  private rescueProp(p: Prop): void {
    p.vel = { x: 0, y: 0, z: 0 };
    p.resting = true;
    p.thrownBy = null;
    const owner = p.kind === 'item' && p.owner ? this.chars.get(p.owner) : undefined;
    if (owner) {
      p.heldBy = owner.id;
      p.onBody = true;
      p.planted = false;
      p.found = false;
      p.resting = false;
      this.followHolder(p);
      return;
    }
    const home = p.kind === 'cat' ? SPAWNS.cat : p.kind === 'teacup' ? SPAWNS.teacup : { x: 0, y: 0, z: 2 };
    p.pos = { ...home };
    if (p.kind === 'cat' && p.cat) p.cat.body = createBody(p.pos);
  }

  private propHitChar(p: Prop, victim: Char, speed: number): void {
    if (victim.role === 'grandma' && speed > SPECTACLES.knockOffSpeed && !victim.specsOff && p.thrownBy) {
      const thrower = this.chars.get(p.thrownBy);
      const who = thrower ? this.perceive(thrower.body.pos) : null;
      this.knockSpecsOff(victim, p.thrownBy, !!who?.identifiable, !!who?.sharp);
    }
    if (victim.state === 'normal' && (victim.role === 'cousin' || this.options.pushGrandma)) {
      victim.body.vel.x += p.vel.x * 0.15;
      victim.body.vel.z += p.vel.z * 0.15;
    }
    const wasFast = speed;
    p.vel.x *= -0.2;
    p.vel.z *= -0.2;
    p.vel.y = Math.min(p.vel.y, 0);
    p.thrownBy = null;
    if (p.kind === 'heirloom' && !p.broken && wasFast > HEIRLOOM.breakSpeed) this.breakHeirloom(p);
  }

  /** Knock Grandma's spectacles off (a thrown object, or a shove when pushing her is allowed). */
  private knockSpecsOff(g: Char, by: string, seen: boolean, sharp: boolean): void {
    if (g.specsOff) return;
    g.specsOff = true;
    g.specsT = 0;
    this.emitAll({ e: 'specs-off', pos: v3(g.body.pos) });
    const pos = { ...g.body.pos };
    const idx = this.log.add({ t: this.time, kind: 'knock-specs', by, seen, sharp });
    this.addCrime('knock-specs', by, pos, idx);
  }

  private toppleCheck(c: Char): void {
    for (const p of this.props.values()) {
      if (p.kind !== 'heirloom' || p.broken || !p.spot || !p.resting || p.heldBy) continue;
      if (!bumpsPedestal(c, p.spot)) continue;
      const dx = p.spot.x - c.body.pos.x, dz = p.spot.z - c.body.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      p.vel = { x: (dx / d) * 2.5 + c.body.vel.x * 0.3, y: 1.5, z: (dz / d) * 2.5 + c.body.vel.z * 0.3 };
      p.resting = false;
      p.spot = null;
      p.thrownBy = null;
      const blame = c.knockedBy && this.time - c.knockedAt < 4 ? c.knockedBy : c.id;
      p.lastBy = blame === this.grandmaId ? null : blame;
    }
  }

  private breakHeirloom(p: Prop): void {
    p.broken = true;
    p.spot = null;
    p.vel = { x: 0, y: 0, z: 0 };
    p.pos.y = groundHeight(p.pos.x, p.pos.z, p.pos.y + 0.1, 0.2);
    p.resting = true;
    const by = p.lastBy && p.lastBy !== this.grandmaId && this.chars.has(p.lastBy) ? p.lastBy : null;
    const culprit = by ? this.chars.get(by) : undefined;
    const who = culprit ? this.perceive(culprit.body.pos) : this.perceive(p.pos, PROP_MID);
    const pos = { ...p.pos };
    const idx = this.log.add({ t: this.time, kind: 'break', by, heirloom: p.id, favourite: p.favourite, pos, seen: who.identifiable, sharp: who.sharp });
    this.addCrime('break', by, pos, idx);
    // Everyone hears a crash. Grandma gets the exact spot and which heirloom only
    // if she saw it; otherwise a rough direction to turn towards.
    const sawIt = this.perceive(pos, PROP_MID).visible;
    this.emitAll((to) => (to === this.grandmaId
      ? (sawIt ? { e: 'crash', pos: v3(pos), heirloom: p.id, favourite: p.favourite } : { e: 'crash', pos: coarse(pos), heirloom: '', favourite: p.favourite })
      : { e: 'crash', pos: v3(pos), heirloom: p.id }));
    if (p.favourite) {
      this.freeTuts++;
      this.emit(this.grandmaId, { e: 'toast', text: 'Your favourite! You get one free Tut, outside the budget.' });
    }
  }

  private updateCat(p: Prop, h: number): void {
    const cat = p.cat;
    if (!cat) return;
    if (this.phase !== 'visit' && this.phase !== 'intermission') return;
    const lv = levelOf(p.pos);
    if (lv === 'ramp') { cat.goal = null; }
    if (!cat.goal) {
      if (this.time < cat.waitUntil || lv === 'ramp') return;
      const level = lv === 'gallery' ? 'gallery' : 'ground';
      const options = waypoints(level).filter((w) => flatDist(w, p.pos) < 9 && flatDist(w, p.pos) > 1.5 && hasLOS(p.pos, w, level));
      if (options.length === 0) { cat.waitUntil = this.time + 3; return; }
      cat.goal = options[Math.floor(this.rng() * options.length)];
      cat.giveUpAt = this.time + 12;
    }
    const dx = cat.goal.x - cat.body.pos.x, dz = cat.goal.z - cat.body.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3 || this.time > cat.giveUpAt) {
      cat.goal = null;
      cat.waitUntil = this.time + 2 + this.rng() * 5;
      cat.body.vel.x = 0; cat.body.vel.z = 0;
    }
    const speed = cat.goal ? 0.9 : 0;
    const wish = d > 1e-6 ? { x: (dx / d) * speed, z: (dz / d) * speed } : { x: 0, z: 0 };
    integrateBody(cat.body, wish, 0, h, CAT_SHAPE, false);
    p.pos = { ...cat.body.pos };
    if (speed > 0) p.yaw = Math.atan2(-dx, -dz);
  }

  // ───────────── Grandma systems ─────────────

  private updateGrandmaSystems(h: number): void {
    const g = this.grandma;
    if (!g) return;
    if (g.parchmentOpen) {
      g.quillT -= h;
      if (g.quillT <= 0) this.quillNow(g);
    }
    if (g.aidT > 0) {
      g.whistleT -= h;
      if (g.whistleT <= 0) {
        g.whistleT = 2;
        for (const c of this.chars.values()) {
          if (c.role === 'cousin' && dist(c.body.pos, g.body.pos) <= HEARING_AID.whistleRange) this.emit(c.id, { e: 'whistle', pos: v3(g.body.pos) });
        }
      }
    }
    if (g.specsOff && g.specsCd <= 0) g.specsCd = 0;
  }

  private updateFound(): void {
    const g = this.grandma;
    if (!g) return;
    for (const p of this.props.values()) {
      if (p.kind !== 'item' || !p.planted || p.found || p.heldBy || p.hidden) continue;
      if (dist(g.body.pos, p.pos) > GRANDMA.findRange || !this.canSeeNow(p.pos, PROP_MID)) continue;
      p.found = true;
      this.log.add({ t: this.time, kind: 'found', item: p.id, owner: p.owner ?? '', plant: p.plantLog, visit: this.visitIndex });
      this.emit(g.id, { e: 'found', item: p.id, owner: p.owner ?? '', pos: v3(p.pos) });
    }
  }

  private updateSummon(): void {
    const s = this.summon;
    const g = this.grandma;
    if (!s || this.time < s.endsAt) return;
    this.summon = null;
    if (!g) return;
    const ids = this.cousinIds.filter((id) => {
      const c = this.chars.get(id);
      if (!c || c.state === 'sleeping') return false;
      return flatDist(c.body.pos, g.body.pos) > GRANDMA.summonRadius || Math.abs(c.body.pos.y - g.body.pos.y) > 1.5;
    });
    this.emit(g.id, { e: 'summon-ignored', ids });
  }

  private updateStorm(): void {
    if (!this.dark) return;
    if (this.flash && this.time >= this.flashUntil) this.flash = false;
    if (this.time >= this.nextLightning) {
      this.flash = true;
      this.flashUntil = this.time + STORM.flashDuration;
      this.nextLightning = this.time + this.lightningGap();
      this.emitAll({ e: 'lightning' });
    }
  }

  private lightningGap(): number {
    return STORM.lightningEvery + (this.rng() * 2 - 1) * STORM.lightningJitter;
  }

  // ───────────── wishes ─────────────

  private wishGap(): number {
    return WISH.gapMin + this.rng() * (WISH.gapMax - WISH.gapMin);
  }

  private updateWish(): void {
    if (this.wish) {
      if (this.time >= this.wish.info.endsAt) this.endWish(true);
    } else if (this.time >= this.nextWishAt) {
      this.startWish();
    }
  }

  private startWish(): void {
    const kinds: WishInfo['kind'][] = ['fetch-cat', 'tea', 'pills'];
    const choices = kinds.filter((k) => k !== this.lastWishKind);
    const kind = choices[Math.floor(this.rng() * choices.length)];
    this.lastWishKind = kind;
    const propId = WISH_PROP[kind];
    const p = this.props.get(propId);
    if (!p) return;
    if (kind === 'pills') {
      const at = SPAWNS.pills[Math.floor(this.rng() * SPAWNS.pills.length)];
      p.hidden = false;
      p.heldBy = null;
      p.pos = { ...at };
      p.vel = { x: 0, y: 0, z: 0 };
      p.resting = true;
    }
    const info: WishInfo = { id: `wish-${++this.wishCount}`, kind, text: WISH_TEXT[kind], endsAt: r3(this.time + WISH.duration) };
    this.wish = { info, propId };
    this.emitAll({ e: 'wish', wish: info });
  }

  /** End the current wish (expired or cleared at the end of a visit). */
  private endWish(announce: boolean): void {
    const w = this.wish;
    if (!w) return;
    this.wish = null;
    this.nextWishAt = this.time + this.wishGap();
    if (w.propId === 'pills') this.hideProp('pills');
    if (announce) this.emitAll({ e: 'wish', wish: null });
  }

  private hideProp(id: string): void {
    const p = this.props.get(id);
    if (!p) return;
    const holder = p.heldBy ? this.chars.get(p.heldBy) : undefined;
    if (holder && holder.holding === p.id) { holder.holding = null; holder.sticky = false; holder.charge = 0; }
    p.heldBy = null;
    p.hidden = true;
    p.resting = true;
  }

  private deliverWish(c: Char, p: Prop): void {
    const w = this.wish;
    const g = this.grandma;
    if (!w || !g) return;
    this.release(c, p);
    if (w.info.kind === 'tea') {
      p.pos = { ...SPAWNS.teacup };
      p.vel = { x: 0, y: 0, z: 0 };
      p.resting = true;
    } else if (w.info.kind === 'pills') {
      this.hideProp('pills');
    } else {
      const at = inFrontClear(g, 0.7, 0.5);
      p.pos = { x: at.x, y: groundHeight(at.x, at.z, g.body.pos.y + 0.5, 0.6), z: at.z };
      p.vel = { x: 0, y: 0, z: 0 };
      p.resting = true;
      if (p.cat) { p.cat.body = createBody(p.pos); p.cat.waitUntil = this.time + 3; p.cat.goal = null; }
    }
    this.wish = null;
    this.nextWishAt = this.time + this.wishGap();
    this.log.add({ t: this.time, kind: 'wish', by: c.id, wish: w.info.kind });
    this.emitAll({ e: 'wish-done', by: c.id, wish: w.info });
    this.emitAll({ e: 'wish', wish: null });
  }

  // ───────────── phases ─────────────

  private setPhase(phase: Phase, duration: number): void {
    this.phase = phase;
    this.phaseEndsAt = this.time + duration;
    this.broadcastPhase();
  }

  private broadcastPhase(): void {
    const msg = this.phaseMsg();
    for (const id of this.humans) this.cfg.send(id, msg);
  }

  private checkPhase(): void {
    if (this.time + 1e-9 < this.phaseEndsAt) return;
    switch (this.phase) {
      case 'roles': this.startVisit(0); break;
      case 'visit':
        this.endVisit();
        if (this.visitIndex + 1 < this.visits.length) {
          this.petId = leader(this.will);
          this.setPhase('intermission', this.durations.intermission);
        }
        else this.startReading();
        break;
      case 'intermission': this.startVisit(this.visitIndex + 1); break;
      case 'reading': this.setPhase('vote', this.durations.vote); break;
      case 'vote': this.startResults(); break;
      case 'results': this.finish(); break;
      default: break;
    }
  }

  private startVisit(i: number): void {
    this.visitIndex = i;
    this.visitUsed[i] = this.visitUsed[i] ?? 0;
    resetVisitBudget(this.will);
    this.spawnAll();
    if (i > 0) this.resetVisitProps();
    const v = this.visits[i];
    this.dark = v === 'storm';
    this.flash = false;
    this.nextLightning = this.dark ? this.time + this.lightningGap() * (this.fast ? 0.4 : 1) : Infinity;
    this.nextWishAt = this.time + (this.fast ? 2 : 3) + this.rng() * 3;
    this.summon = null;
    this.setPhase('visit', this.durations.visit(v));
    this.emitAll({ e: 'toast', text: `${VISITS[v].name} begins.` });
  }

  /**
   * A new visit is a new day: signature items are back on their owners, the
   * teacup is on the counter and Mittens is by the stairs. Broken heirlooms
   * stay broken (the house remembers); Grandma keeps her pinned evidence list.
   */
  private resetVisitProps(): void {
    for (const p of this.props.values()) {
      if (p.kind === 'item' && p.owner && this.chars.has(p.owner)) {
        const holder = p.heldBy ? this.chars.get(p.heldBy) : undefined;
        if (holder && holder.holding === p.id) { holder.holding = null; holder.sticky = false; }
        p.heldBy = p.owner;
        p.onBody = true;
        p.planted = false;
        p.found = false;
        p.resting = false;
        this.followHolder(p);
      } else if (p.kind === 'teacup' || p.kind === 'cat') {
        const holder = p.heldBy ? this.chars.get(p.heldBy) : undefined;
        if (holder && holder.holding === p.id) { holder.holding = null; holder.sticky = false; }
        p.heldBy = null;
        p.pos = { ...(p.kind === 'cat' ? SPAWNS.cat : SPAWNS.teacup) };
        p.vel = { x: 0, y: 0, z: 0 };
        p.resting = true;
        if (p.cat) p.cat = { body: createBody(p.pos), goal: null, waitUntil: this.time + 2, giveUpAt: 0 };
      }
    }
  }

  private endVisit(): void {
    const g = this.grandma;
    if (g) {
      this.closeParchment(g);
      g.aidT = 0;
      g.specsT = 0;
    }
    if (this.wish) this.endWish(true);
    this.nextWishAt = Infinity;
    this.dark = false;
    this.flash = false;
    this.summon = null;
  }

  private startReading(toast?: string): void {
    if (this.phase === 'reading' || this.phase === 'vote' || this.phase === 'results') return;
    this.pause = null;
    if (this.phase === 'visit') this.endVisit();
    if (toast) this.emitAll({ e: 'toast', text: toast });
    this.reading = { shares: { ...this.will.shares }, order: readingOrder(this.will), moments: [...this.log.moments] };
    this.setPhase('reading', this.durations.reading);
    for (const id of this.humans) this.cfg.send(id, { t: 'reading', result: this.reading });
  }

  private startResults(): void {
    for (const b of this.bots.values()) {
      if (this.votes.has(b.id)) continue;
      const v = b.vote();
      if (v) this.handleVoteInternal(b.id, v);
    }
    const votes: Record<string, number> = {};
    for (const id of this.cousinIds) votes[id] = 0;
    for (const t of this.votes.values()) if (t in votes) votes[t]++;
    let votedWorst: string | null = null;
    let top = 0;
    for (const [id, n] of Object.entries(votes)) {
      if (n > top) { top = n; votedWorst = id; } else if (n === top && n > 0) votedWorst = null;
    }
    const sabotage = this.log.sabotageTally(this.cousinIds);
    const shares = { ...this.will.shares };
    this.results = {
      shares, order: readingOrder(this.will), moments: [...this.log.moments], sabotage,
      grandmaScore: grandmaScore(shares, sabotage), votes, votedWorst, metrics: this.log.metrics(),
    };
    this.setPhase('results', this.durations.results);
    for (const id of this.humans) this.cfg.send(id, { t: 'results', result: this.results });
  }

  private handleVoteInternal(id: string, target: string): void {
    if (target === id || !this.cousinIds.includes(target)) return;
    this.votes.set(id, target);
  }

  private finish(): void {
    if (this.over) return;
    this.over = true;
    this.cfg.onEnd?.(this);
  }

  /** Fewer than 3 cousins awake → the will is read as it stands. */
  private checkFewCousins(): void {
    if (!(this.phase === 'roles' || this.phase === 'visit' || this.phase === 'intermission')) return;
    const awake = this.cousinIds.filter((id) => {
      const c = this.chars.get(id);
      return !!c && c.connected && c.state !== 'sleeping';
    }).length;
    if (awake < 3) this.startReading('Too few cousins are left awake. The will is read as it stands.');
  }

  /** End now (e.g. the room is closing). */
  abort(): void {
    this.over = true;
  }

  // ───────────── messaging ─────────────

  /** Send one event to one player (bots get it as a callback). */
  emit(to: string, ev: GameEvent): void {
    const bot = this.bots.get(to);
    if (bot) { try { bot.onEvent(ev); } catch (err) { console.error('[bot] event error', err); } return; }
    if (this.isHuman(to)) this.cfg.send(to, { t: 'ev', ...ev });
  }

  /** Send an event to everyone in the match; a function can tailor it per recipient. */
  emitAll(ev: GameEvent | ((to: string) => GameEvent | null)): void {
    const ids = new Set<string>([...this.humans, ...this.bots.keys()]);
    for (const id of ids) {
      const e = typeof ev === 'function' ? ev(id) : ev;
      if (e) this.emit(id, e);
    }
  }

  /** One character as `forId` may see it (Grandma-only fields only for her own record). */
  private charSnap(c: Char, petId: string | null, forId: string): CharSnap {
    const s: CharSnap = {
      id: c.id, role: c.role, pos: v3(c.body.pos), yaw: r3(c.yaw), pitch: r3(c.pitch), vel: v3(c.body.vel), state: c.state,
      ragdollT: r2(c.ragdollT), holding: c.holding, running: c.running, sneaking: c.sneaking, whispering: c.whispering,
      charge: r2(c.charge), plant: r2(Math.min(1, c.plantT / COUSIN.plantHold)), leader: c.id === petId, ack: c.ack,
    };
    if (c.role === 'grandma') {
      // Everyone can see her writing, her hearing aid whistling and her spectacles.
      s.parchmentOpen = c.parchmentOpen;
      s.aidActive = c.aidT > 0;
      s.specsActive = c.specsT > 0 && !c.specsOff;
      s.specsOff = c.specsOff;
      // A swing is visible (cousins animate it from the cooldown jumping up).
      s.caneCooldown = r2(c.caneCd);
      if (forId === c.id) {
        s.aidCooldown = r2(c.aidCd);
        s.specsCooldown = r2(c.specsCd);
        s.summonCooldown = r2(c.summonCd);
      }
    }
    return s;
  }

  private propSnap(p: Prop, forGrandma: boolean): PropSnap {
    const s: PropSnap = { id: p.id, kind: p.kind, pos: v3(p.pos), yaw: r3(p.yaw), heldBy: p.heldBy };
    if (p.kind === 'heirloom') {
      s.broken = p.broken;
      s.variant = p.variant;
      if (forGrandma && p.favourite) s.favourite = true;
    }
    if (p.kind === 'item') {
      s.owner = p.owner;
      // Grandma learns an item was planted only by finding it; cousins never learn what she found.
      s.planted = forGrandma ? p.planted && p.found : p.planted;
      if (forGrandma) s.found = p.found;
    }
    return s;
  }

  /**
   * Grandma's snapshot holds only what she perceives. People she can identify
   * (soft or sharp, line of sight) come with everything; people she can only
   * make out, or only hear (within 10 m, or a running cousin's footsteps), come
   * as a position with nothing about what they carry, charge, plant or
   * whisper; anyone else is left out. Props: only what she can see, items only
   * when identifiable, things in hands only when she can identify the holder,
   * and planted evidence is not flagged as planted until she finds it.
   */
  private grandmaSnapshot(g: Char): { chars: CharSnap[]; props: PropSnap[] } {
    const chars: CharSnap[] = [];
    const known = new Map<string, Perception>();
    for (const c of this.chars.values()) {
      if (c === g) { chars.push(this.charSnap(c, this.petId, g.id)); continue; }
      const per = this.perceive(c.body.pos);
      known.set(c.id, per);
      const steps = (c.running ? COUSIN.footstepRangeRun : c.sneaking ? COUSIN.footstepRangeSneak : COUSIN.footstepRangeWalk) * (c.id === this.petId ? COUSIN.leaderFootstepFactor : 1);
      if (!per.visible && per.dist > Math.max(SENSES.mumble, steps)) continue;
      const s = this.charSnap(c, this.petId, g.id);
      delete s.ack;
      if (!per.identifiable) { s.holding = null; s.charge = 0; s.plant = 0; s.whispering = false; }
      chars.push(s);
    }
    const props: PropSnap[] = [];
    for (const p of this.props.values()) {
      if (p.hidden) continue;
      if (p.heldBy) {
        if (p.heldBy !== g.id && !known.get(p.heldBy)?.identifiable) continue;
      } else {
        const per = this.perceive(p.pos, PROP_MID);
        if (!per.visible || (p.kind === 'item' && !per.identifiable)) continue;
      }
      props.push(this.propSnap(p, true));
    }
    return { chars, props };
  }

  /** Build this tick's snapshot for each recipient (exposed for tests). */
  snapshotFor(id: string): ServerMsg {
    const av = available(this.will, this.time);
    const g = this.grandma;
    const view = g && id === g.id
      ? this.grandmaSnapshot(g)
      : {
        chars: [...this.chars.values()].map((c) => this.charSnap(c, this.petId, id)),
        props: [...this.props.values()].filter((p) => !p.hidden).map((p) => this.propSnap(p, false)),
      };
    return {
      t: 'snap', time: r3(this.time), tick: this.tick, chars: view.chars, props: view.props,
      shares: { ...this.will.shares }, willAvail: { budget: av.budget, rolling: av.rolling }, dark: this.dark, flash: this.flash,
    };
  }

  private snapshots(h: number): void {
    this.snapAcc += h;
    const every = 1 / SNAPSHOT_HZ;
    if (this.snapAcc + 1e-9 < every) return;
    this.snapAcc = Math.min(this.snapAcc - every, every);
    if (this.humans.length === 0) return;
    let cousinSnap: ServerMsg | null = null;
    for (const id of this.humans) {
      if (id === this.grandmaId) this.cfg.send(id, this.snapshotFor(id));
      else this.cfg.send(id, cousinSnap ??= this.snapshotFor(id));
    }
  }
}
