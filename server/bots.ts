// Bot cousins and a bot Grandma, so one human can play either role and still
// see a lively match. Bots act only through the same entry points as humans
// (input messages, Grandma actions, quick chat, tattles, votes), so every rule
// and validation applies to them too.
//
// Cousin bots make a visit a few memorable crimes, not constant noise: each
// waits BOTS.sabotageGap after every act of sabotage, nobody misbehaves in a
// visit's opening, no human is picked on again within BOTS.humanCooldown (and
// humans are mostly spared while still in their first visit), and they
// misbehave where Nana cannot see them, apart from the odd careless plan. They
// keep out of her personal space. They see the house as any cousin can, and
// read the server log only for their own acts (to pace themselves).
//
// The bot Grandma decides only from what a human Grandma could know: the
// events her client is sent (crashes, voices, shoves within earshot, tattles,
// found evidence, wishes...) and what she can see right now (canSeeNow). She
// never reads the secret log.
import { BOTS, COUSIN, CRIME_SCENE, GRANDMA, HEARING_AID, QUICKCHAT, SENSES, VOICE, WILL, WISH } from '../shared/constants.js';
import type { GameEvent, InputMsg } from '../shared/protocol.js';
import { angleFromFacing, dist, flatDist, hearingBand, visionBand } from '../shared/senses.js';
import type { LogEvent, PropKind, Vec3 } from '../shared/types.js';
import { PROP_MID, eyeOf, lineOfSight } from '../shared/sight.js';
import { available } from '../shared/will.js';
import { forwardOf, yawToward, wrapAngle } from '../shared/movement.js';
import type { Char, Match, Prop } from './match.js';
import { findPath, freePoint, hallPoints, levelOf, waypoints } from './nav.js';

export interface Bot {
  readonly id: string;
  update(dt: number): void;
  onLog(ev: LogEvent, index: number): void;
  onEvent(ev: GameEvent): void;
  /** Who this bot votes "actually worst" (or null). */
  vote(): string | null;
}

/** Path following with re-planning and a little unsticking. */
class Walker {
  private path: Vec3[] = [];
  private goal: Vec3 | null = null;
  private replanAt = 0;
  private plannedAt = -Infinity;
  private checkAt = 0;
  private checkPos: Vec3 = { x: 0, y: 0, z: 0 };
  private unstickUntil = 0;
  private unstickYaw = 0;

  constructor(private rng: () => number) {}

  reset(): void { this.goal = null; this.path = []; }

  /**
   * Steer toward `goal`. Returns the yaw to face, the point being steered at
   * and the distance left. Uses the real goal for the final approach so bodies
   * press up against furniture.
   */
  steer(c: Char, goal: Vec3, now: number): { yaw: number; d: number; target: Vec3; unsticking: boolean } {
    const pos = c.body.pos;
    // Replan when the goal has moved (a goal that drifts every tick, like a running cousin, at most a few times a second).
    const moved = this.goal ? flatDist(this.goal, goal) : Infinity;
    const stale = !this.goal || Math.abs(this.goal.y - goal.y) > 1 || now >= this.replanAt || moved > 3 || (moved > 0.6 && now - this.plannedAt >= 0.3);
    if (stale) {
      this.path = findPath(pos, goal);
      this.goal = { ...goal };
      this.replanAt = now + 2 + this.rng();
      this.plannedAt = now;
    }
    const d = flatDist(pos, goal) + (levelOf(pos) === levelOf(goal) || levelOf(pos) === 'ramp' ? 0 : 5);
    while (this.path.length > 1 && flatDist(pos, this.path[0]) < 0.4) this.path.shift();
    let target = this.path[0] ?? goal;
    if (this.path.length <= 1 && levelOf(pos) === levelOf(goal) && flatDist(pos, goal) < 2) target = goal;
    // Stuck? Strafe a little and replan.
    if (now >= this.checkAt) {
      if (flatDist(pos, this.checkPos) < 0.25 && d > 0.8 && now >= this.unstickUntil) {
        this.unstickUntil = now + 0.5 + this.rng() * 0.4;
        this.unstickYaw = yawToward(target.x - pos.x, target.z - pos.z) + (this.rng() < 0.5 ? 1.6 : -1.6);
        this.replanAt = now;
      }
      this.checkPos = { ...pos };
      this.checkAt = now + 1.2;
    }
    if (now < this.unstickUntil) return { yaw: this.unstickYaw, d, target, unsticking: true };
    return { yaw: yawToward(target.x - pos.x, target.z - pos.z), d, target, unsticking: false };
  }
}

function pick<T>(rng: () => number, xs: readonly T[]): T | undefined {
  return xs.length ? xs[Math.floor(rng() * xs.length)] : undefined;
}

function pickWeighted<T>(rng: () => number, xs: { v: T; w: number }[]): T | undefined {
  const total = xs.reduce((a, x) => a + x.w, 0);
  if (!(total > 0)) return undefined;
  let r = rng() * total;
  for (const x of xs) {
    r -= x.w;
    if (r <= 0) return x.v;
  }
  return xs[xs.length - 1].v;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const sameFloor = (a: Vec3, b: Vec3): boolean => Math.abs(a.y - b.y) < 1.2;

/** Who did an act of sabotage in a log event (null when it is not sabotage). */
function saboteur(ev: LogEvent): string | null {
  switch (ev.kind) {
    case 'shove': case 'steal': case 'plant': case 'knock-specs': case 'break': return ev.by;
    default: return null;
  }
}

/**
 * The current visit's clock: when it started, how long it is, its opening
 * (no sabotage) and `pace`, how much the bots' timers are compressed. Real
 * visits (Afternoon Tea and longer) use BOTS' numbers as they are; shorter
 * test visits scale them down in proportion.
 */
function visitClock(m: Match): { start: number; len: number; opening: number; pace: number } {
  const v = m.visits[m.visitIndex];
  const len = v ? m.durations.visit(v) : BOTS.paceVisit;
  return {
    start: m.phaseEndsAt - len,
    len,
    opening: Math.min(BOTS.openingMax, BOTS.openingFrac * len),
    pace: clamp(len / BOTS.paceVisit, BOTS.paceFloor, 1),
  };
}

/** What every bot in a match shares: when each human was last picked on by a bot. */
interface House { humanHitAt: Map<string, number> }
const HOUSES = new WeakMap<Match, House>();
function houseOf(m: Match): House {
  let h = HOUSES.get(m);
  if (!h) { h = { humanHitAt: new Map() }; HOUSES.set(m, h); }
  return h;
}

/**
 * A spot `r` metres from Grandma, `side` radians off her facing (0 = right in
 * front of her), moved clear of furniture.
 */
function besideNana(g: Char, r: number, side: number): Vec3 {
  const f = forwardOf(g.yaw + side);
  const lv = levelOf(g.body.pos) === 'gallery' ? 'gallery' : 'ground';
  return freePoint({ x: g.body.pos.x + f.x * r, y: g.body.pos.y, z: g.body.pos.z + f.z * r }, lv);
}

/**
 * Steering that respects Grandma's personal space: from `p` heading for
 * `target`, a yaw that slides round her when the straight line would cut
 * into it, or straight out when already inside. Null: no change needed.
 */
function giveWay(p: Vec3, g: Vec3, target: Vec3): number | null {
  const R = BOTS.personalSpace;
  const rx = p.x - g.x, rz = p.z - g.z;
  const d = Math.hypot(rx, rz);
  if (d > R + 3) return null;
  if (d < R) return d > 1e-6 ? yawToward(rx, rz) : null;
  const sx = target.x - p.x, sz = target.z - p.z;
  const L = Math.hypot(sx, sz);
  if (L < 1e-6) return null;
  const ux = sx / L, uz = sz / L;
  // Closest approach of the segment p→target to her.
  const s = clamp(-(rx * ux + rz * uz), 0, L);
  if (Math.hypot(rx + ux * s, rz + uz * s) >= R) return null;
  // Slide round her on the side the target lies.
  const t1x = -rz / d, t1z = rx / d;
  const t = t1x * ux + t1z * uz >= 0 ? { x: t1x, z: t1z } : { x: -t1x, z: -t1z };
  return yawToward(t.x, t.z);
}

// ───────────────────────── Cousin bot ─────────────────────────

type Task =
  | { k: 'wander'; goal: Vec3; until: number }
  | { k: 'fetch'; prop: string; until: number }
  | { k: 'deliver'; until: number; side: number; handing: boolean }
  | { k: 'compliment'; until: number; since: number; standoff: number; side: number; saidAt: number | null; thenShove: boolean }
  | { k: 'shove'; target: string; until: number; careless: boolean }
  | { k: 'break'; prop: string; until: number; careless: boolean; chargeStart: number | null; aim: number | null; holdSince: number | null }
  | { k: 'steal'; victim: string; until: number; careless: boolean }
  | { k: 'plant'; until: number; careless: boolean; spot: { at: Vec3; nana: boolean } | null; lurk: Vec3 | null; lurkAt: number; readySince: number | null; watchedSince: number | null; heldBackSince: number | null; planting: boolean }
  | { k: 'retrieve'; until: number; spotted: string | null; search: Vec3 | null }
  | { k: 'summoned'; until: number }
  | { k: 'tattle'; accused: string; until: number; side: number }
  | { k: 'idle'; until: number };

export class CousinBot implements Bot {
  private seq = 0;
  private task: Task | null = null;
  private walker: Walker;
  private flip = false;
  /** Cousins who wronged this bot (shoved it, were seen holding its item): tattle fodder. */
  private grudges: string[] = [];
  /** Crashes heard (everyone hears them): crime scenes to plant at, and the house's break pacing. */
  private crashes: { t: number; pos: Vec3 }[] = [];
  private chatAt = 0;
  private voted = false;
  private missingSince: number | null = null;
  private noticeDelay: number;
  /** The visit the pacing below belongs to. */
  private visit = -1;
  /** No sabotage before this: the visit's opening, then a gap after each act. */
  private nextSabotageAt = Infinity;
  private lastTattleAt = -Infinity;
  private nextComplimentAt = 0;
  /** Personality: how readily it misbehaves when it may, and how readily it runs errands. */
  readonly mischief: number;
  readonly helpful: number;

  constructor(private m: Match, readonly id: string) {
    this.walker = new Walker(m.rng);
    this.mischief = 0.45 + m.rng() * 0.4;
    this.helpful = 0.35 + m.rng() * 0.4;
    this.noticeDelay = 8 + m.rng() * 12;
  }

  get fetching(): string | null {
    return this.task?.k === 'fetch' ? this.task.prop : null;
  }

  vote(): string | null {
    const others = this.m.cousinIds.filter((id) => id !== this.id);
    const g = this.grudges.filter((id) => others.includes(id));
    return pick(this.m.rng, g.length ? g : others) ?? null;
  }

  /** Only this bot's own acts (it knows what it did): pace the next one, and note a human it picked on. */
  onLog(ev: LogEvent): void {
    if (saboteur(ev) !== this.id) return;
    this.nextSabotageAt = Math.max(this.nextSabotageAt, ev.t + this.gap());
    const target = ev.kind === 'shove' ? ev.victim : ev.kind === 'steal' || ev.kind === 'plant' ? ev.owner : null;
    if (target && this.m.isHuman(target)) houseOf(this.m).humanHitAt.set(target, ev.t);
  }

  onEvent(ev: GameEvent): void {
    const m = this.m;
    const c = m.chars.get(this.id);
    if (!c) return;
    if (ev.e === 'crash') {
      this.crashes.push({ t: m.time, pos: { ...ev.pos } });
      if (this.crashes.length > 12) this.crashes.shift();
      if (dist(ev.pos, c.body.pos) < 8 && m.rng() < 0.25) this.say(3); // "Wasn't me!"
    } else if (ev.e === 'shove' && ev.victim === this.id && ev.by && ev.by !== this.id) {
      this.grudge(ev.by);
      if (m.rng() < 0.35) this.say(m.rng() < 0.5 ? 7 : 1); // "Help!" / "It was HIM!"
    }
  }

  private grudge(id: string): void {
    this.grudges = this.grudges.filter((x) => x !== id);
    this.grudges.push(id);
    if (this.grudges.length > 6) this.grudges.shift();
  }

  private say(line: number): void {
    if (this.m.time < this.chatAt) return;
    this.chatAt = this.m.time + 4;
    this.m.handleQuick(this.id, line);
  }

  update(): void {
    const m = this.m;
    const c = m.chars.get(this.id);
    if (!c) return;
    if (m.phase === 'vote' && !this.voted && m.rng() < 0.05) {
      const v = this.vote();
      if (v) m.handleVote(this.id, v);
      this.voted = true;
    }
    const inp = m.blankInput(++this.seq, c.yaw);
    inp.pitch = c.pitch;
    if (c.state !== 'normal' || (m.phase !== 'visit' && m.phase !== 'intermission')) {
      // Keep holding a grabbed thing through intermission; otherwise idle.
      inp.primary = !!c.holding && !c.sticky;
      m.botInput(this.id, inp);
      if (c.state !== 'normal') this.walker.reset();
      return;
    }
    if (m.phase === 'visit' && this.visit !== m.visitIndex) this.startVisit();
    if (m.phase === 'intermission') {
      if (!this.task || this.task.k !== 'wander' || m.time > this.task.until) this.task = this.wanderTask(c, 6);
    } else if (!this.task || m.time > this.task.until) {
      this.task = this.choose(c);
      this.walker.reset();
    }
    this.flip = !this.flip;
    this.run(c, inp);
    this.keepSpace(c, inp);
    m.botInput(this.id, inp);
  }

  // ───── pacing ─────

  private startVisit(): void {
    const m = this.m;
    const clk = visitClock(m);
    this.visit = m.visitIndex;
    this.nextSabotageAt = clk.start + clk.opening + m.rng() * BOTS.openingStagger * clk.pace;
    this.lastTattleAt = -Infinity;
    this.nextComplimentAt = clk.start + m.rng() * 6 * clk.pace;
    this.task = null;
    this.missingSince = null;
    this.walker.reset();
  }

  private pace(): number {
    return this.m.phase === 'visit' ? visitClock(this.m).pace : 1;
  }

  private gap(): number {
    return (BOTS.sabotageGapMin + this.m.rng() * (BOTS.sabotageGapMax - BOTS.sabotageGapMin)) * this.pace();
  }

  /** Past the opening and the gap since this bot's last act. */
  private sabotageReady(): boolean {
    return this.m.phase === 'visit' && this.m.time >= this.nextSabotageAt;
  }

  /** No bot picks on this human again so soon (bots are never protected). */
  private fairGame(id: string): boolean {
    if (!this.m.isHuman(id)) return true;
    const at = houseOf(this.m).humanHitAt.get(id);
    return at === undefined || this.m.time - at >= BOTS.humanCooldown * this.pace();
  }

  /**
   * A human new to the game here (their first match in this room, as the room
   * tells the match) is still in their first visit, so bots mostly pick on each other.
   */
  private newcomers(): boolean {
    const m = this.m;
    return m.visitIndex === 0 && m.cousinIds.some((id) => m.isNewcomer(id));
  }

  /** House rules for heirlooms: only a few broken per visit, well apart. */
  private breakAllowed(): boolean {
    const clk = visitClock(this.m);
    const thisVisit = this.crashes.filter((cr) => cr.t >= clk.start);
    if (thisVisit.length >= BOTS.breaksPerVisit) return false;
    const last = this.crashes.length ? this.crashes[this.crashes.length - 1].t : -Infinity;
    return this.m.time - last >= BOTS.breakGap * clk.pace;
  }

  /** Two cousins already at Nana's elbow: do not crowd her. */
  private crowded(): boolean {
    const m = this.m, g = m.grandma;
    if (!g) return false;
    let n = 0;
    for (const id of m.cousinIds) {
      const o = m.chars.get(id);
      if (o && id !== this.id && sameFloor(o.body.pos, g.body.pos) && flatDist(o.body.pos, g.body.pos) < 2.4) n++;
    }
    return n >= 2;
  }

  // ───── choosing ─────

  private wanderTask(c: Char, secs = 12): Task {
    const lv = levelOf(c.body.pos);
    const pool = waypoints().filter((p) => flatDist(p, c.body.pos) > 2 && (lv === 'gallery' || p.y < 1 || this.m.rng() < 0.5));
    return { k: 'wander', goal: pick(this.m.rng, pool) ?? { x: 0, y: 0, z: 0 }, until: this.m.time + secs };
  }

  private careless(): boolean {
    return this.m.rng() < BOTS.carelessChance;
  }

  private choose(c: Char): Task {
    const m = this.m, now = m.time, rnd = m.rng;
    const held = c.holding ? m.props.get(c.holding) : undefined;
    if (held) {
      if (m.wish && held.id === m.wish.propId) return { k: 'deliver', until: now + 20, side: (rnd() - 0.5) * 1.4, handing: false };
      if (held.kind === 'item' && held.owner !== this.id) return this.plantTask();
      if (held.kind === 'heirloom' && this.sabotageReady() && this.breakAllowed()) {
        return { k: 'break', prop: held.id, until: now + 10, careless: this.careless(), chargeStart: null, aim: null, holdSince: null };
      }
      return { k: 'idle', until: now + 0.4 }; // lets go of it
    }
    const mine = c.itemId ? m.props.get(c.itemId) : undefined;
    const missing = !!mine && !(mine.heldBy === this.id && mine.onBody) && !mine.hidden;
    if (!missing) this.missingSince = null;
    else if (this.missingSince === null) this.missingSince = now;
    // You notice your item is gone after a while (bots must not be omniscient detectives).
    if (missing && this.missingSince !== null && now - this.missingSince > this.noticeDelay && rnd() < BOTS.retrieveChance) return { k: 'retrieve', until: now + 15, spotted: null, search: null };
    const g = m.grandma;
    if (m.summon && g && flatDist(c.body.pos, g.body.pos) > GRANDMA.summonRadius - 1 && rnd() < 0.85) return { k: 'summoned', until: m.summon.endsAt + 2 };
    if (m.wish && rnd() < this.helpful) {
      const p = m.props.get(m.wish.propId);
      const taken = [...m.bots.values()].some((b) => b !== this && b instanceof CousinBot && b.fetching === p?.id);
      if (p && !p.heldBy && !p.hidden && !taken) return { k: 'fetch', prop: p.id, until: now + 25 };
    }
    const accused = [...this.grudges].reverse().find((id) => m.cousinIds.includes(id));
    if (accused && g && now - this.lastTattleAt >= BOTS.tattleGap * this.pace() && !this.crowded() && rnd() < 0.3) {
      return { k: 'tattle', accused, until: now + 12, side: (rnd() - 0.5) * 1.6 };
    }
    if (this.sabotageReady() && rnd() < this.mischief) {
      const t = this.sabotageTask(c);
      if (t) return t;
    }
    if (g && now >= this.nextComplimentAt && !this.crowded() && rnd() < 0.6) {
      const standoff = BOTS.complimentMin + 0.05 + rnd() * (BOTS.complimentMax - BOTS.complimentMin - 0.1);
      // "Love you, Nana!" ...and a shove behind her back while she is still smiling.
      const thenShove = this.sabotageReady() && rnd() < this.mischief * BOTS.loveYouNana;
      return { k: 'compliment', until: now + 14, since: now, standoff, side: (rnd() - 0.5) * 1.6, saidAt: null, thenShove };
    }
    return this.wanderTask(c);
  }

  private shuffle<T>(xs: T[]): T[] {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(this.m.rng() * (i + 1));
      [xs[i], xs[j]] = [xs[j], xs[i]];
    }
    return xs;
  }

  private sabotageTask(c: Char): Task | null {
    const makers = this.shuffle([() => this.shoveTask(c), () => this.breakTask(c), () => this.stealTask(c)]);
    // A frame-up takes time (steal, wait, plant, be found): plan one early in a visit.
    const m = this.m, clk = visitClock(m);
    if (m.phaseEndsAt - m.time > clk.len * 0.5 && m.rng() < 0.5) makers.unshift(() => this.stealTask(c));
    for (const mk of makers) {
      const t = mk();
      if (t) return t;
    }
    return null;
  }

  /**
   * A cousin to pick on within `range`: never one standing at Nana's elbow, a
   * human only when fair game (and seldom while humans are new), the leader and
   * anyone on the stairs or gallery preferred.
   */
  private pickVictim(c: Char, range: number, ok: (o: Char) => boolean = () => true): string | null {
    const m = this.m, g = m.grandma;
    const newcomers = this.newcomers();
    const top = Math.max(...m.cousinIds.map((id) => m.will.shares[id] ?? 0));
    const opts: { v: string; w: number }[] = [];
    for (const id of m.cousinIds) {
      if (id === this.id) continue;
      const o = m.chars.get(id);
      if (!o || o.state !== 'normal' || !ok(o)) continue;
      if (flatDist(o.body.pos, c.body.pos) > range) continue;
      if (g && sameFloor(o.body.pos, g.body.pos) && flatDist(o.body.pos, g.body.pos) < BOTS.victimClearOfNana) continue;
      if (!this.fairGame(id)) continue;
      // A new human only now and then comes into it at all (not merely as a last resort).
      if (newcomers && m.isNewcomer(id) && m.rng() >= BOTS.newHumanChance) continue;
      let w = 1;
      if ((m.will.shares[id] ?? 0) === top) w *= 1.5;
      if (o.body.pos.y > 1) w *= 1.5;
      opts.push({ v: id, w });
    }
    return pickWeighted(m.rng, opts) ?? null;
  }

  private shoveTask(c: Char): Task | null {
    const target = this.pickVictim(c, 14);
    return target ? { k: 'shove', target, until: this.m.time + 12, careless: this.careless() } : null;
  }

  private breakTask(c: Char): Task | null {
    const m = this.m, g = m.grandma;
    if (!this.breakAllowed()) return null;
    const hs = [...m.props.values()].filter((p) => p.kind === 'heirloom' && !p.broken && !p.heldBy && !p.hidden);
    if (!hs.length) return null;
    // Out of Nana's sight and away from her first, then the nearest.
    const cost = (p: Prop): number => flatDist(p.pos, c.body.pos)
      + (levelOf(p.pos) === levelOf(c.body.pos) ? 0 : 6)
      + (m.canSeeNow(p.pos) ? 8 : 0)
      + (g && flatDist(p.pos, g.body.pos) < 4 ? 6 : 0);
    hs.sort((a, b) => cost(a) - cost(b));
    const p = m.rng() < 0.7 ? hs[0] : pick(m.rng, hs)!;
    return { k: 'break', prop: p.id, until: m.time + 22, careless: this.careless(), chargeStart: null, aim: null, holdSince: null };
  }

  private plantTask(): Task {
    return { k: 'plant', until: this.m.time + 40, careless: this.careless(), spot: null, lurk: null, lurkAt: 0, readySince: null, watchedSince: null, heldBackSince: null, planting: false };
  }

  /** Time left in this visit for Nana to come across planted evidence. */
  private timeToFrame(): number {
    return this.m.phaseEndsAt - this.m.time - BOTS.plantMinLeft;
  }

  private stealTask(c: Char): Task | null {
    const m = this.m;
    // Too late in the visit to see a frame-up through (the theft, the wait, the plant).
    if (this.timeToFrame() < this.gap()) return null;
    const victim = this.pickVictim(c, 16, (o) => {
      const it = o.itemId ? m.props.get(o.itemId) : undefined;
      return !!it && it.heldBy === o.id && it.onBody;
    });
    return victim ? { k: 'steal', victim, until: m.time + 15, careless: this.careless() } : null;
  }

  /**
   * Where to leave stolen goods so Nana comes across them: at a fresh crime
   * scene if this bot can get there before she does, else just beside or
   * behind her, out of her sight (she will see it when she looks round), or
   * failing that on her beat where she is not looking.
   */
  private plantSpot(c: Char, besideHer = true): { at: Vec3; nana: boolean } {
    const m = this.m, g = m.grandma;
    const crash = [...this.crashes].reverse().find((cr) => m.time - cr.t < CRIME_SCENE.duration / 2);
    if (crash && (!g || flatDist(c.body.pos, crash.pos) < flatDist(g.body.pos, crash.pos) - 2)) {
      const a = m.rng() * Math.PI * 2;
      return { at: freePoint({ x: crash.pos.x + Math.cos(a) * 0.8, y: crash.pos.y, z: crash.pos.z + Math.sin(a) * 0.8 }), nana: false };
    }
    if (g && besideHer && levelOf(g.body.pos) === 'ground') {
      const side = (m.rng() < 0.5 ? -1 : 1) * (BOTS.plantBesideMin + m.rng() * (Math.PI - BOTS.plantBesideMin));
      // Just outside her sharp sight (she would know who it was): the item lands a step nearer her.
      return { at: besideNana(g, BOTS.plantBesideDist + m.rng() * 0.3, side), nana: true };
    }
    const pool = hallPoints().filter((p) => (!g || (flatDist(p, g.body.pos) > 4 && flatDist(p, g.body.pos) < 12)) && !m.canSeeNow(p));
    return { at: pick(m.rng, pool) ?? pick(m.rng, waypoints()) ?? { ...c.body.pos }, nana: false };
  }

  /** Somewhere to bide time with stolen goods: out of Nana's sight, away from her. */
  private lurkSpot(c: Char): Vec3 {
    const m = this.m, g = m.grandma;
    const lv = levelOf(c.body.pos) === 'gallery' ? 'gallery' : 'ground';
    const me = c.body.pos;
    // Out of her sight, well away from her, and not past her to get there.
    const pool = waypoints(lv).filter((p) => {
      if (!g) return true;
      if (flatDist(p, g.body.pos) <= BOTS.holdBack + 1 || m.canSeeNow(p) || this.facedBy(g, p)) return false;
      const away = (p.x - me.x) * (me.x - g.body.pos.x) + (p.z - me.z) * (me.z - g.body.pos.z);
      return away >= 0 || flatDist(me, g.body.pos) > BOTS.holdBack + 2;
    });
    return pick(m.rng, pool) ?? this.awayFromGrandma(c);
  }

  private aimAway(c: Char): number {
    const g = this.m.grandma;
    const base = g ? yawToward(c.body.pos.x - g.body.pos.x, c.body.pos.z - g.body.pos.z) : c.yaw;
    return base + (this.m.rng() - 0.5) * 1.2;
  }

  /** Nana could tell it was me right now (a careless plan does not check). */
  private watched(c: Char, careless: boolean): boolean {
    return !careless && this.m.canSeeNow(c.body.pos);
  }

  // ───── doing ─────

  private go(c: Char, inp: InputMsg, goal: Vec3, run: boolean): number {
    const s = this.walker.steer(c, goal, this.m.time);
    let yaw = s.yaw;
    const g = this.m.grandma;
    if (g && !s.unsticking && sameFloor(g.body.pos, c.body.pos)) yaw = giveWay(c.body.pos, g.body.pos, s.target) ?? yaw;
    inp.yaw = yaw;
    inp.move = { x: 0, z: 1 };
    inp.run = run;
    return s.d;
  }

  private face(inp: InputMsg, c: Char, p: Vec3): void {
    inp.yaw = yawToward(p.x - c.body.pos.x, p.z - c.body.pos.z);
  }

  private done(): void {
    if (this.task) this.task.until = this.m.time - 1;
  }

  /** Step back out of Nana's way after talking to her. */
  private backOff(c: Char, g: Char): Task {
    const dx = c.body.pos.x - g.body.pos.x, dz = c.body.pos.z - g.body.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const goal = freePoint({ x: g.body.pos.x + (dx / d) * 2.8, y: c.body.pos.y, z: g.body.pos.z + (dz / d) * 2.8 });
    return { k: 'wander', goal, until: this.m.time + 2.5 };
  }

  /** Never stand in Nana's personal space: back away from her (still facing her) when she is too close. */
  private keepSpace(c: Char, inp: InputMsg): void {
    const g = this.m.grandma;
    if (!g || !sameFloor(g.body.pos, c.body.pos)) return;
    if (inp.shove || inp.interact || inp.plant || inp.secondary) return; // mid-action: finish it first
    if (flatDist(c.body.pos, g.body.pos) >= BOTS.personalSpace) return;
    inp.yaw = yawToward(g.body.pos.x - c.body.pos.x, g.body.pos.z - c.body.pos.z);
    inp.move = { x: 0, z: -1 };
    inp.run = false;
  }

  /** Grandma (when she may be shoved at all) is right in front: a shove now could hit her. */
  private nanaInTheWay(c: Char): boolean {
    const m = this.m, g = m.grandma;
    if (!g || !m.options.pushGrandma) return false;
    const d = flatDist(c.body.pos, g.body.pos);
    return d < COUSIN.shoveRange + 0.4 && angleFromFacing({ pos: c.body.pos, yaw: c.yaw }, g.body.pos) < 75;
  }

  private run(c: Char, inp: InputMsg): void {
    const m = this.m, t = this.task;
    if (!t) return;
    const g = m.grandma;
    const held = c.holding ? m.props.get(c.holding) : undefined;
    // Keep a grabbed (non-sticky) thing in hands unless the task wants it gone.
    inp.primary = !!held && !c.sticky;
    switch (t.k) {
      case 'idle':
        inp.primary = false;
        break;
      case 'wander': {
        const d = this.go(c, inp, t.goal, false);
        if (d < 0.6) this.done();
        break;
      }
      case 'fetch': {
        const p = m.props.get(t.prop);
        if (!p || p.hidden || (p.heldBy && p.heldBy !== this.id) || !m.wish || m.wish.propId !== p.id) { this.done(); break; }
        if (c.holding === p.id) { this.task = { k: 'deliver', until: m.time + 20, side: (m.rng() - 0.5) * 1.4, handing: false }; break; }
        const d = this.go(c, inp, p.pos, true);
        if (this.reachable(c, p.pos)) {
          inp.move = { x: 0, z: d > 0.9 ? 0.4 : 0 };
          this.face(inp, c, p.pos);
          inp.primary = this.flip;
        }
        break;
      }
      case 'deliver': {
        if (!held || !m.wish || held.id !== m.wish.propId || !g) {
          // Handed over (or the wish is gone): step back out of her way.
          if (t.handing && g) this.task = this.backOff(c, g);
          else this.done();
          break;
        }
        inp.primary = !c.sticky;
        const d = flatDist(c.body.pos, g.body.pos);
        if (sameFloor(c.body.pos, g.body.pos) && d <= WISH.deliverRange - 0.08 && d >= BOTS.personalSpace) {
          inp.move = { x: 0, z: 0 };
          this.face(inp, c, g.body.pos);
          inp.interact = this.flip;
          t.handing = true;
        } else {
          this.go(c, inp, besideNana(g, BOTS.deliverAt, t.side), d > 4);
        }
        break;
      }
      case 'compliment': {
        if (!g) { this.done(); break; }
        if (t.saidAt === null) {
          const d = flatDist(c.body.pos, g.body.pos);
          // In the sweet spot, and where she can see who is talking (or it is taking too long).
          const inFront = angleFromFacing({ pos: g.body.pos, yaw: g.yaw }, c.body.pos) < 70 || m.time - t.since > 8;
          if (sameFloor(c.body.pos, g.body.pos) && d >= BOTS.complimentMin && d <= BOTS.complimentMax && inFront) {
            inp.move = { x: 0, z: 0 };
            this.face(inp, c, g.body.pos);
            t.saidAt = m.time;
            m.handleQuick(this.id, m.rng() < 0.5 ? 0 : 4);
            this.nextComplimentAt = m.time + BOTS.complimentGap * (1 + m.rng() * 0.5) * this.pace();
          } else {
            this.go(c, inp, besideNana(g, t.standoff, t.side), false);
          }
          break;
        }
        inp.move = { x: 0, z: 0 };
        this.face(inp, c, g.body.pos);
        if (m.time - t.saidAt > 1.0) {
          if (t.thenShove && this.sabotageReady()) {
            // Someone close by whom Nana cannot see right now: by the time the bot is on them, she cannot see it either.
            const v = this.pickVictim(c, 7, (o) => !m.canSeeNow(o.body.pos));
            if (v) { this.task = { k: 'shove', target: v, until: m.time + 5, careless: false }; break; }
          }
          this.task = this.backOff(c, g);
        }
        break;
      }
      case 'shove': {
        const v = m.chars.get(t.target);
        if (!v || v.state !== 'normal' || !this.sabotageReady() || !this.fairGame(v.id)) { this.done(); break; }
        const d = this.go(c, inp, v.body.pos, flatDist(c.body.pos, v.body.pos) > 3);
        if (d < COUSIN.shoveRange - 0.25 && Math.abs(v.body.pos.y - c.body.pos.y) < 1) {
          this.face(inp, c, v.body.pos);
          inp.move = { x: 0, z: 0.3 };
          if (c.shoveCd <= 0 && !this.watched(c, t.careless) && !this.nanaInTheWay(c)) {
            inp.shove = true;
            this.done();
          }
        }
        break;
      }
      case 'break': {
        const p = m.props.get(t.prop);
        if (!p || p.broken || (p.heldBy && p.heldBy !== this.id)) { inp.primary = false; this.done(); break; }
        if (c.holding === p.id) {
          inp.primary = true;
          if (t.holdSince === null) t.holdSince = m.time;
          if (t.chargeStart === null) {
            // Someone else broke one meanwhile, or this has gone on too long: put it down.
            if (!this.sabotageReady() || !this.breakAllowed() || m.time - t.holdSince > 8) { inp.primary = false; this.done(); break; }
            if (t.aim === null) t.aim = this.aimAway(c);
            inp.yaw = wrapAngle(t.aim);
            inp.pitch = -0.35;
            inp.move = { x: 0, z: 0 };
            if (!this.watched(c, t.careless)) t.chargeStart = m.time;
            else {
              // Nana is looking: wander off with it and aim again out of her sight.
              this.go(c, inp, this.awayFromGrandma(c), false);
              t.aim = null;
            }
          } else {
            inp.yaw = wrapAngle(t.aim ?? c.yaw);
            inp.pitch = -0.35;
            inp.move = { x: 0, z: 0 };
            inp.secondary = m.time - t.chargeStart < 0.55;
            if (!inp.secondary) this.done();
          }
          break;
        }
        if (!this.sabotageReady() || !this.breakAllowed()) { this.done(); break; }
        const d = this.go(c, inp, p.pos, true);
        if (this.reachable(c, p.pos)) {
          inp.move = { x: 0, z: d > 0.9 ? 0.4 : 0 };
          this.face(inp, c, p.pos);
          inp.primary = this.flip;
        }
        break;
      }
      case 'steal': {
        if (held && held.kind === 'item' && held.owner !== this.id) { this.task = this.plantTask(); break; }
        const v = m.chars.get(t.victim);
        const it = v?.itemId ? m.props.get(v.itemId) : undefined;
        if (!v || !it || it.heldBy !== v.id || !it.onBody || !this.sabotageReady() || !this.fairGame(v.id)) { this.done(); break; }
        const d = this.go(c, inp, v.body.pos, flatDist(c.body.pos, v.body.pos) > 3);
        if (d < COUSIN.reach - 0.25 && Math.abs(v.body.pos.y - c.body.pos.y) < 1) {
          inp.move = { x: 0, z: 0.2 };
          this.face(inp, c, v.body.pos);
          if (!this.watched(c, t.careless)) inp.interact = this.flip;
        }
        break;
      }
      case 'plant': {
        if (!held || held.kind !== 'item' || held.owner === this.id) {
          // Planted (or lost it): slip away before anyone sees who was standing there.
          if (t.planting) this.task = { k: 'wander', goal: this.lurkSpot(c), until: m.time + 6 };
          else this.done();
          break;
        }
        const owner = held.owner ?? '';
        if (!this.sabotageReady() || !this.fairGame(owner) || this.timeToFrame() < 0) {
          // Not yet (the gap since the theft, or that human was just picked on), or too late for
          // Nana to come across it before the visit ends: bide time out of her sight. A careful
          // thief keeps well away from her and from wherever she is looking.
          const exposed = !!t.lurk && !!g && !t.careless && (flatDist(t.lurk, g.body.pos) < BOTS.holdBack || this.facedBy(g, c.body.pos));
          if (!t.lurk || ((exposed || flatDist(c.body.pos, t.lurk) < 0.8) && m.time >= t.lurkAt)) {
            t.lurk = this.lurkSpot(c);
            t.lurkAt = m.time + 0.5; // think again in a moment, not every tick
          }
          if (flatDist(c.body.pos, t.lurk) < 0.8) { inp.move = { x: 0, z: 0 }; break; }
          this.go(c, inp, t.lurk, false);
          t.until = Math.max(t.until, m.time + 5);
          break;
        }
        // Keep at it for a while (then start over with a fresh plan).
        if (t.readySince === null) t.readySince = m.time;
        t.until = Math.max(t.until, Math.min(m.time + 5, t.readySince + 45));
        // A spot beside Nana is no good once she has wandered off.
        if (!t.spot || (t.spot.nana && g && flatDist(t.spot.at, g.body.pos) > GRANDMA.findRange + 0.5)) t.spot = this.plantSpot(c);
        if (t.spot.nana && g && !t.careless && !t.planting && this.facedBy(g, c.body.pos)) {
          // She is looking this way: circle round to her flank, out of recognising range and
          // out of her view, and come in from there; if she just will not look away, leave it
          // somewhere else.
          if (t.heldBackSince === null) t.heldBackSince = m.time;
          if (m.time - t.heldBackSince > BOTS.holdBackPatience) { t.spot = this.plantSpot(c, false); t.heldBackSince = null; break; }
          const f = forwardOf(g.yaw);
          const side = f.x * (c.body.pos.z - g.body.pos.z) - f.z * (c.body.pos.x - g.body.pos.x) >= 0 ? -1 : 1;
          this.go(c, inp, besideNana(g, BOTS.holdBack, side * ((SENSES.coneHalfAngleDeg + 35) * Math.PI) / 180), false);
          break;
        }
        t.heldBackSince = null;
        const d = this.go(c, inp, t.spot.at, false);
        // Beside her: drop it from just outside her sharp sight, so she cannot tell who it was if she turns.
        const fromNana = g ? flatDist(c.body.pos, g.body.pos) : Infinity;
        const placed = t.spot.nana ? d < 0.35 || (d < 0.8 && fromNana >= BOTS.plantBesideDist - 0.2 && fromNana <= BOTS.plantBesideDist + 0.6) : d < 0.7;
        if (placed) {
          inp.move = { x: 0, z: 0 };
          // Not under Nana's nose, and not with its owner looking on (they would just pick it up);
          // beside her, only while she stands still (she would walk away from it).
          const ownerChar = m.chars.get(owner);
          const ownerLooking = !!ownerChar && ownerChar.state !== 'sleeping' && this.spots(ownerChar, c.body.pos, BOTS.spotLying + 1);
          const nanaWalking = t.spot.nana && !!g && Math.hypot(g.body.vel.x, g.body.vel.z) > 0.3;
          const watched = this.watched(c, t.careless) || ownerLooking || nanaWalking;
          inp.plant = !watched || c.plantT > 1.2;
          if (t.spot.nana && g) this.face(inp, c, g.body.pos); // drop it at her heels
          if (inp.plant) t.planting = true;
          if (!watched) t.watchedSince = null;
          else if (t.watchedSince === null) t.watchedSince = m.time;
          else if (m.time - t.watchedSince > 4) { t.spot = this.plantSpot(c); t.watchedSince = null; }
        }
        break;
      }
      case 'retrieve': {
        const mine = c.itemId ? m.props.get(c.itemId) : undefined;
        if (!mine || mine.hidden || (mine.heldBy === this.id && mine.onBody)) { this.done(); break; }
        if (held && held.id !== mine.id) { inp.primary = false; this.done(); break; }
        const holder = mine.heldBy ? m.chars.get(mine.heldBy) : undefined;
        const at = holder ? holder.body.pos : mine.pos;
        // It has to be found first: someone carrying it is easy to spot, a thing lying on the floor
        // is not, and once it changes hands (or is dropped) it has to be found again.
        const where = holder ? holder.id : 'floor';
        if (t.spotted !== where && this.spots(c, at, holder ? BOTS.spotCarried : BOTS.spotLying)) t.spotted = where;
        if (t.spotted !== where) {
          if (!t.search || flatDist(c.body.pos, t.search) < 0.8) t.search = pick(m.rng, waypoints(levelOf(c.body.pos) === 'gallery' ? 'gallery' : 'ground')) ?? null;
          if (t.search) this.go(c, inp, t.search, false);
          break;
        }
        if (holder && holder.id !== this.id) this.grudge(holder.id); // there's my phone, in their hands
        const d = this.go(c, inp, at, true);
        if (d < COUSIN.reach - 0.3 && Math.abs(at.y - c.body.pos.y) < 1.5) {
          inp.move = { x: 0, z: 0.2 };
          this.face(inp, c, at);
          inp.interact = this.flip;
        }
        break;
      }
      case 'summoned': {
        if (!g || !m.summon) { this.done(); break; }
        const d = flatDist(c.body.pos, g.body.pos);
        if (sameFloor(c.body.pos, g.body.pos) && d < GRANDMA.summonRadius - 0.9) {
          inp.move = { x: 0, z: 0 };
          this.face(inp, c, g.body.pos);
        } else {
          const dx = c.body.pos.x - g.body.pos.x, dz = c.body.pos.z - g.body.pos.z;
          const n = Math.hypot(dx, dz) || 1;
          const spot = freePoint({ x: g.body.pos.x + (dx / n) * 2.6, y: g.body.pos.y, z: g.body.pos.z + (dz / n) * 2.6 });
          this.go(c, inp, spot, true);
        }
        break;
      }
      case 'tattle': {
        if (!g || !m.cousinIds.includes(t.accused)) { this.done(); break; }
        const d = flatDist(c.body.pos, g.body.pos);
        if (sameFloor(c.body.pos, g.body.pos) && d <= COUSIN.tattleRange - 0.5 && d >= BOTS.personalSpace) {
          inp.move = { x: 0, z: 0 };
          this.face(inp, c, g.body.pos);
          m.handleTattle(this.id, t.accused);
          this.lastTattleAt = m.time;
          this.say(1); // "It was HIM!"
          this.grudges = this.grudges.filter((x) => x !== t.accused);
          this.task = this.backOff(c, g);
        } else {
          this.go(c, inp, besideNana(g, 2.1, t.side), d > 4);
        }
        break;
      }
    }
  }

  /** Nana is facing this way, near enough to recognise someone coming closer (what a cousin can read off her). */
  private facedBy(g: Char, p: Vec3): boolean {
    return angleFromFacing({ pos: g.body.pos, yaw: g.yaw }, p) < SENSES.coneHalfAngleDeg + 15 && flatDist(g.body.pos, p) < BOTS.holdBack + 0.5;
  }

  /** Can this cousin see that spot (within `range`, nothing solid in between)? */
  private spots(c: Char, p: Vec3, range: number): boolean {
    return dist(c.body.pos, p) <= range && lineOfSight(eyeOf(c.body.pos), { x: p.x, y: p.y + PROP_MID, z: p.z });
  }

  private reachable(c: Char, p: Vec3): boolean {
    const dy = p.y - c.body.pos.y;
    return flatDist(c.body.pos, p) <= COUSIN.reach - 0.05 && dy > -0.6 && dy < 2;
  }

  private awayFromGrandma(c: Char): Vec3 {
    const g = this.m.grandma;
    if (!g) return c.body.pos;
    const dx = c.body.pos.x - g.body.pos.x, dz = c.body.pos.z - g.body.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    return freePoint({ x: c.body.pos.x + (dx / d) * 3, y: c.body.pos.y, z: c.body.pos.z + (dz / d) * 3 });
  }
}

// ───────────────────────── Grandma bot ─────────────────────────

interface Reaction { at: number; run: () => void }
/** How sure she is of a reason to edit the will: what she saw or found herself, fair grounds, or a hunch. */
type Sure = 'strong' | 'fair' | 'weak';
/** What she last saw of a cousin (only recorded while she could tell who it was). */
interface Sighting { t: number; pos: Vec3; holding: string | null; kind: PropKind | null }

const COMPLIMENT_LINES = new Set<string>([QUICKCHAT.cousin[0], QUICKCHAT.cousin[4]]);
const LOVE_RE = /\b(love|lovely|beautiful|wonderful|best|gorgeous|adore)\b/i;
const NANA_RE = /\b(nana|gran|granny|grandma|grandmother)\b/i;
const GARBLED_RE = /[#*@%&~]|…/;

/** A compliment, as she heard it: the wheel's lines word for word, or typed words of love for Nana that reached her ungarbled. */
function isCompliment(text: string, quick: boolean): boolean {
  if (quick) return COMPLIMENT_LINES.has(text);
  return LOVE_RE.test(text) && NANA_RE.test(text) && !GARBLED_RE.test(text);
}

export class GrandmaBot implements Bot {
  private seq = 0;
  private walker: Walker;
  private goal: Vec3 | null = null;
  private waitUntil = 0;
  private lookYaw = 0;
  private attention: { pos: Vec3; until: number } | null = null;
  /** Walk over to look at a crash scene (and maybe find planted evidence). */
  private investigate: { pos: Vec3; until: number } | null = null;
  private reactions: Reaction[] = [];
  private tuts = new Map<string, number>();
  /** How naughty she thinks each cousin is, from what she saw and heard (fades). */
  private suspicion = new Map<string, number>();
  /** How fond she is of each cousin, from compliments and errands (fades). */
  private fondness = new Map<string, number>();
  private sightings = new Map<string, Sighting>();
  /** Signature items she noticed in someone else's hands (and could tell whose): item → who, when. */
  private seenWith = new Map<string, { by: string; t: number }>();
  /** Every sighting of an item in someone else's hands, noticed or not (so each sighting is one chance to notice). */
  private noticed = new Map<string, { by: string; t: number; soft: boolean; sharp: boolean }>();
  private complimentBlessAt = new Map<string, number>();
  private naughty: { id: string; until: number } | null = null;
  private tap = { primary: false, secondary: false, shove: false };
  private parchment: { openAt: number; setAt: number; closeAt: number; visit: number } | null = null;
  private summonAt = Infinity;
  private planned = -1;
  private voted = false;
  private scanAt = 0;
  private fadeAt = 0;

  constructor(private m: Match, readonly id: string) {
    this.walker = new Walker(m.rng);
  }

  vote(): string | null {
    let best: string | null = null, n = -Infinity;
    for (const id of this.m.cousinIds) {
      const s = this.susp(id) + (this.tuts.get(id) ?? 0) * 0.5;
      if (s > n) { n = s; best = id; }
    }
    return best;
  }

  private later(delay: number, run: () => void): void {
    this.reactions.push({ at: this.m.time + delay, run });
  }

  private susp(id: string): number { return this.suspicion.get(id) ?? 0; }
  private fondOf(id: string): number { return this.fondness.get(id) ?? 0; }
  private suspect(id: string, by: number): void {
    if (this.m.cousinIds.includes(id)) this.suspicion.set(id, this.susp(id) + by);
  }
  private fond(id: string, by: number): void {
    if (this.m.cousinIds.includes(id)) this.fondness.set(id, this.fondOf(id) + by);
  }

  /**
   * Whether she has the will budget for an edit, given how sure she is: she
   * spends her last edit only on what she saw or found herself, and keeps
   * some in hand before acting on a hunch or a flatterer.
   */
  private room(sure: Sure): boolean {
    const av = available(this.m.will, this.m.time);
    if (sure === 'strong') return av.now >= WILL.quickStep;
    const keep = sure === 'fair' ? BOTS.grandma.keepInHand.fair : BOTS.grandma.keepInHand.weak;
    const reserve = sure === 'fair' ? BOTS.grandma.budgetReserve.fair : BOTS.grandma.budgetReserve.weak;
    return av.now >= WILL.quickStep * (1 + keep) && av.budget - WILL.quickStep >= reserve;
  }

  private bless(id: string, sure: Sure): void {
    if (!this.m.cousinIds.includes(id) || !this.room(sure)) return;
    this.m.handleGrandma(this.id, { a: 'bless', target: id });
  }

  private tut(id: string, sure: Sure): void {
    if (!this.m.cousinIds.includes(id)) return;
    if (this.m.freeTuts <= 0 && !this.room(sure)) return;
    this.tuts.set(id, (this.tuts.get(id) ?? 0) + 1);
    this.m.handleGrandma(this.id, { a: 'tut', target: id });
  }

  /** Thank a flatterer, but not for every single compliment. */
  private blessCompliment(id: string): void {
    const last = this.complimentBlessAt.get(id) ?? -Infinity;
    if (this.m.time - last < BOTS.grandma.complimentMemory) return;
    this.complimentBlessAt.set(id, this.m.time);
    this.bless(id, 'weak');
  }

  private attend(pos: Vec3, secs: number): void {
    this.attention = { pos: { ...pos }, until: this.m.time + secs };
  }

  /** Could she hear a voice from `p` at all? */
  private audible(p: Vec3, whisper: boolean): boolean {
    const g = this.m.grandma;
    if (!g) return false;
    return hearingBand(dist(g.body.pos, p), g.aidT > 0, whisper ? VOICE.whisperRange : Infinity) !== 'silent';
  }

  /** The upright cousin she can make out nearest to `p` (within `r`), if any. */
  private visibleNear(p: Vec3, r: number, except = ''): string | null {
    const m = this.m;
    let best: string | null = null, bestD = r;
    for (const id of m.cousinIds) {
      if (id === except) continue;
      const c = m.chars.get(id);
      if (!c || c.state !== 'normal' || !sameFloor(c.body.pos, p) || !m.canSeeNow(c.body.pos)) continue;
      const d = flatDist(c.body.pos, p);
      if (d <= bestD) { bestD = d; best = id; }
    }
    return best;
  }

  /** Who she saw carrying that heirloom (or, when she did not see which broke, any heirloom near there) a moment ago. */
  private carrierOf(heirloom: string, at: Vec3): string | null {
    const m = this.m;
    let best: string | null = null, bestD = Infinity;
    for (const [id, s] of this.sightings) {
      if (m.time - s.t > 4 || !s.holding || !m.cousinIds.includes(id)) continue;
      if (heirloom ? s.holding !== heirloom : s.kind !== 'heirloom' || flatDist(s.pos, at) > 8) continue;
      const d = flatDist(s.pos, at);
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  /** What her eyes take in (10 times a second): who is where, holding what. */
  private scan(): void {
    const m = this.m;
    const sense = m.grandmaSense();
    for (const id of m.cousinIds) {
      const c = m.chars.get(id);
      if (!c || c.state === 'sleeping' || !m.canSeeNow(c.body.pos)) continue;
      const held = c.holding ? m.props.get(c.holding) : undefined;
      this.sightings.set(id, { t: m.time, pos: { ...c.body.pos }, holding: held?.id ?? null, kind: held?.kind ?? null });
      // Someone else's signature item in their hands. Up close (sharp) she can tell whose it is
      // from its colour band; through the blur she only sometimes notices.
      if (held && held.kind === 'item' && held.owner && held.owner !== id) {
        // One glance (a run of sightings less than 5 s apart) is one chance to notice through the blur.
        const prev = this.noticed.get(held.id);
        const glance = prev && prev.by === id && m.time - prev.t <= 5 ? prev : { by: id, t: m.time, soft: false, sharp: false };
        glance.t = m.time;
        this.noticed.set(held.id, glance);
        const known = this.seenWith.get(held.id);
        if (known && known.by === id) { known.t = m.time; continue; }
        // Each glance is one chance to notice: a good one up close (sharp), a slim one through the
        // blur and only when looking right at them.
        let notice = false;
        if (sense && visionBand(sense, c.body.pos) === 'sharp') {
          if (!glance.sharp) { glance.sharp = true; notice = m.rng() < BOTS.grandma.noticeItemSharp; }
        } else if (sense && !glance.soft && angleFromFacing(sense, c.body.pos) < BOTS.grandma.noticeCone) {
          glance.soft = true;
          notice = m.rng() < BOTS.grandma.noticeItemSoft;
        }
        if (!notice) continue;
        this.seenWith.set(held.id, { by: id, t: m.time });
        this.suspect(id, 1.5);
        if (m.rng() < BOTS.grandma.tutThief) this.later(0.8 + m.rng() * 0.8, () => this.tut(id, 'fair'));
      }
    }
  }

  /** The bot Grandma never reads the secret log: she knows only what her client is sent and what she sees. */
  onLog(): void {}

  onEvent(ev: GameEvent): void {
    const m = this.m, rnd = m.rng;
    const g = m.grandma;
    if (!g || g.id !== this.id) return;
    switch (ev.e) {
      case 'wish-done': {
        if (!m.cousinIds.includes(ev.by)) break;
        this.fond(ev.by, 1);
        if (rnd() < BOTS.grandma.blessWish) {
          const by = ev.by;
          this.later(0.6 + rnd() * 0.8, () => {
            this.bless(by, 'fair');
            if (rnd() < 0.3) m.handleQuick(this.id, 5); // "Good child."
          });
        }
        break;
      }
      case 'bubble':
        this.heard(ev);
        break;
      case 'tattle': {
        if (!m.cousinIds.includes(ev.accused)) break;
        const accused = ev.accused;
        this.suspect(accused, 0.5);
        if (rnd() < BOTS.grandma.tutTattle + 0.1 * Math.min(3, this.susp(accused))) this.later(1 + rnd(), () => this.tut(accused, 'weak'));
        break;
      }
      case 'shove': {
        if (ev.by && m.cousinIds.includes(ev.by)) {
          // She saw who did it.
          const by = ev.by;
          this.suspect(by, 3);
          this.naughty = { id: by, until: m.time + 6 };
          m.handleQuick(this.id, 3); // "I saw that!"
          if (rnd() < BOTS.grandma.tutSeen) this.later(0.6 + rnd() * 0.8, () => this.tut(by, 'strong'));
        } else if (ev.pos && dist(ev.pos, g.body.pos) <= SENSES.mumble) {
          // An "oof" somewhere: turn to look, and eye whoever is standing over the victim.
          const at = { ...ev.pos }, victim = ev.victim;
          this.attend(at, 2.5);
          this.later(0.9 + rnd() * 0.6, () => {
            const who = this.visibleNear(at, 2, victim);
            if (!who) return;
            this.suspect(who, 1);
            if (rnd() < BOTS.grandma.tutNearShove) this.tut(who, 'weak');
          });
        }
        break;
      }
      case 'crash': {
        const at = { ...ev.pos };
        this.attend(at, 3);
        if (rnd() < BOTS.grandma.investigate) this.later(1 + rnd(), () => { this.investigate = { pos: at, until: m.time + 14 }; this.walker.reset(); });
        if (rnd() < 0.35) m.handleQuick(this.id, 1); // "WHO BROKE THAT?"
        if (rnd() < 0.5) this.tap.shove = true; // spectacles on
        const carrier = this.carrierOf(ev.heirloom, at);
        if (carrier) {
          // She saw who had it.
          this.suspect(carrier, 3);
          this.naughty = { id: carrier, until: m.time + 6 };
          if (rnd() < BOTS.grandma.tutSeen) this.later(0.6 + rnd() * 0.8, () => this.tut(carrier, 'strong'));
        } else {
          // After a moment, blame whoever she can make out near the crash.
          const favourite = !!ev.favourite;
          this.later(1.6 + rnd(), () => {
            const who = this.visibleNear(at, 4);
            if (!who) return;
            this.suspect(who, 1);
            if ((favourite && m.freeTuts > 0) || rnd() < BOTS.grandma.tutNearCrash) this.tut(who, 'weak');
          });
        }
        break;
      }
      case 'found': {
        this.attend(ev.pos, 2);
        const w = this.seenWith.get(ev.item);
        // Someone she can see standing over it (not its owner) looks a little shifty.
        const lurker = this.visibleNear(ev.pos, 2, ev.owner);
        if (lurker) this.suspect(lurker, 0.5);
        if (w && w.by !== ev.owner && m.cousinIds.includes(w.by) && m.time - w.t < BOTS.grandma.itemMemory) {
          // She saw who was carrying it a moment ago: that is who left it here.
          const by = w.by;
          this.suspect(by, 2);
          if (rnd() < BOTS.grandma.tutSeen) this.later(0.5 + rnd() * 0.6, () => this.tut(by, 'strong'));
        } else if (ev.owner && m.cousinIds.includes(ev.owner)) {
          // Their own signature item at the scene: most of the time, she believes it.
          const owner = ev.owner;
          const p = clamp(BOTS.grandma.accuseFound + 0.04 * (this.susp(owner) - this.fondOf(owner)), 0.5, 0.95);
          if (rnd() < p) {
            this.suspect(owner, 1);
            this.later(0.5 + rnd() * 0.6, () => this.tut(owner, 'strong'));
          }
        }
        break;
      }
      case 'specs-off': {
        // Only someone she saw holding something in front of her a moment ago can have thrown it.
        const now = m.time;
        const throwers = [...this.sightings].filter(([id, s]) => {
          if (now - s.t > 1.5 || !s.holding || !m.cousinIds.includes(id)) return false;
          // Not someone she can see still holding it.
          const c = m.chars.get(id);
          return !(c && m.canSeeNow(c.body.pos) && c.holding === s.holding);
        }).map(([id]) => id);
        if (throwers.length === 1) {
          const by = throwers[0];
          this.suspect(by, 2);
          if (rnd() < BOTS.grandma.tutSeen) this.later(0.6 + rnd() * 0.8, () => this.tut(by, 'strong'));
        }
        break;
      }
      case 'summon-ignored': {
        for (const id of ev.ids) this.suspect(id, 0.5);
        const id = pick(rnd, ev.ids.filter((x) => m.cousinIds.includes(x)));
        if (id && rnd() < 0.25) this.later(0.5, () => this.tut(id, 'weak'));
        break;
      }
      default:
        break;
    }
  }

  /** A voice: compliments she hears clearly get a Bless (if she can tell who); anything else makes her look. */
  private heard(ev: Extract<GameEvent, { e: 'bubble' }>): void {
    const m = this.m, rnd = m.rng;
    if (ev.from === this.id) return;
    const speaker = ev.from ? m.chars.get(ev.from) : undefined;
    const seen = !!speaker && speaker.role === 'cousin' && m.canSeeNow(speaker.body.pos);
    // Where the voice came from, as far as her ears can tell.
    const where = ev.pos ?? (speaker && this.audible(speaker.body.pos, ev.whisper) ? speaker.body.pos : null);
    if (!seen && !where) return;
    if (isCompliment(ev.text, ev.quick)) {
      if (seen && speaker) {
        const id = speaker.id;
        this.fond(id, 0.5);
        if (rnd() < BOTS.grandma.blessCompliment) this.later(0.6 + rnd() * 0.8, () => this.blessCompliment(id));
      } else if (where) {
        // "Who said that?" Turn round and thank whoever she finds there.
        const at = { ...where };
        this.attend(at, 2);
        if (rnd() < BOTS.grandma.blessCompliment) {
          this.later(0.9 + rnd() * 0.5, () => {
            const who = this.visibleNear(at, 1.5);
            if (who) { this.fond(who, 0.5); this.blessCompliment(who); }
          });
        }
      }
      return;
    }
    if (ev.text === '…' && rnd() < 0.15) this.tap.secondary = true; // what was that? hearing aid
    const at = seen && speaker ? speaker.body.pos : where;
    if (at && rnd() < 0.5) this.attend(at, 1.5);
  }

  update(dt: number): void {
    const m = this.m;
    const g = m.chars.get(this.id);
    if (!g || m.grandmaId !== this.id) return;
    if (m.phase === 'vote' && !this.voted && m.rng() < 0.05) {
      const v = this.vote();
      if (v) m.handleVote(this.id, v);
      this.voted = true;
    }
    const inp = m.blankInput(++this.seq, g.yaw);
    if (m.phase !== 'visit' || g.state !== 'normal') {
      this.reactions = [];
      m.botInput(this.id, inp);
      return;
    }
    // Per-visit plans: one parchment opening and maybe a summon. New day, new evidence.
    if (this.planned !== m.visitIndex) {
      this.planned = m.visitIndex;
      const len = m.phaseEndsAt - m.time;
      this.parchment = m.rng() < 0.7 ? { openAt: m.time + len * (0.25 + m.rng() * 0.4), setAt: 0, closeAt: 0, visit: m.visitIndex } : null;
      this.summonAt = m.rng() < 0.5 ? m.time + len * (0.3 + m.rng() * 0.5) : Infinity;
      this.seenWith.clear();
      this.noticed.clear();
      this.sightings.clear();
      this.investigate = null;
      this.attention = null;
    }
    // Her impressions fade (half-life about two minutes), checked a few times a second.
    if (m.time >= this.fadeAt) {
      const fade = Math.exp(-(m.time - this.fadeAt + 0.25) / 170);
      this.fadeAt = m.time + 0.25;
      for (const [id, v] of this.suspicion) this.suspicion.set(id, v * fade);
      for (const [id, v] of this.fondness) this.fondness.set(id, v * fade);
    }
    if (m.time >= this.scanAt) {
      this.scanAt = m.time + 0.1;
      this.scan();
    }
    // Scheduled reactions.
    if (this.reactions.some((r) => r.at <= m.time)) {
      const due = this.reactions.filter((r) => r.at <= m.time);
      this.reactions = this.reactions.filter((r) => r.at > m.time);
      for (const r of due) r.run();
    }

    // Parchment: open, nudge one share, close.
    const pc = this.parchment;
    if (pc && m.time >= pc.openAt && !g.parchmentOpen && pc.closeAt === 0) {
      m.handleGrandma(this.id, { a: 'parchment', open: true });
      pc.setAt = m.time + 1;
      pc.closeAt = m.time + 3;
    }
    if (pc && g.parchmentOpen && pc.setAt > 0 && m.time >= pc.setAt) {
      pc.setAt = 0;
      const ids = m.cousinIds.filter((id) => m.chars.get(id)?.state !== 'sleeping');
      const worst = [...ids].sort((a, b) => this.susp(b) - this.susp(a))[0];
      const dearest = [...ids].sort((a, b) => this.fondOf(b) - this.fondOf(a))[0];
      const cut = !!worst && this.susp(worst) > 1.5;
      const target = cut ? worst : dearest && this.fondOf(dearest) > 0 ? dearest : pick(m.rng, ids);
      if (target && available(m.will, m.time).now >= 3) {
        const cur = m.will.shares[target] ?? 0;
        m.handleGrandma(this.id, { a: 'set', target, value: Math.max(0, Math.min(100, cur + (cut ? -3 : 3))) });
      }
    }
    if (pc && g.parchmentOpen && m.time >= pc.closeAt) {
      m.handleGrandma(this.id, { a: 'parchment', open: false });
      this.parchment = null;
    }
    if (m.time >= this.summonAt) {
      this.summonAt = Infinity;
      m.handleGrandma(this.id, { a: 'summon' });
      m.handleQuick(this.id, 2); // "Come here, dear."
    }

    // Cane anyone she just caught misbehaving, if they are right there.
    if (this.naughty && m.time < this.naughty.until && g.caneCd <= 0) {
      const v = m.chars.get(this.naughty.id);
      if (v && flatDist(v.body.pos, g.body.pos) < GRANDMA.caneRange - 0.2 && m.canSeeNow(v.body.pos)) {
        this.lookYaw = yawToward(v.body.pos.x - g.body.pos.x, v.body.pos.z - g.body.pos.z);
        this.turnTo(g, inp, this.lookYaw, dt, 20);
        if (Math.abs(wrapAngle(inp.yaw - this.lookYaw)) < 0.3) { this.tap.primary = true; this.naughty = null; }
        this.flushTaps(inp);
        m.botInput(this.id, inp);
        return;
      }
    }

    // Investigate a crash, look toward something, or potter about the hall.
    if (this.investigate && m.time < this.investigate.until) {
      const at = this.investigate.pos;
      const s = this.walker.steer(g, at, m.time);
      if (s.d > 1.6) {
        this.turnTo(g, inp, s.yaw, dt, 5);
        if (Math.abs(wrapAngle(inp.yaw - s.yaw)) < 0.8) inp.move = { x: 0, z: 1 };
      } else {
        // Arrived: peer around the scene.
        this.turnTo(g, inp, this.lookYaw, dt, 1.6);
        if (Math.abs(wrapAngle(g.yaw - this.lookYaw)) < 0.05) this.lookYaw = this.glance(g);
        if (this.investigate.until - m.time > 4) this.investigate.until = m.time + 4;
      }
    } else if (this.attention && m.time < this.attention.until) {
      this.investigate = null;
      const a = this.attention.pos;
      this.turnTo(g, inp, yawToward(a.x - g.body.pos.x, a.z - g.body.pos.z), dt, 4);
      if (flatDist(a, g.body.pos) > 6 && levelOf(a) === 'ground' && a.x < 8 && m.rng() < 0.3) this.goal = freePoint(a, 'ground');
    } else {
      this.attention = null;
      if (!this.goal && m.time >= this.waitUntil) this.goal = pick(m.rng, hallPoints()) ?? null;
      if (this.goal) {
        const s = this.walker.steer(g, this.goal, m.time);
        this.turnTo(g, inp, s.yaw, dt, 5);
        if (Math.abs(wrapAngle(inp.yaw - s.yaw)) < 0.8) inp.move = { x: 0, z: 1 };
        if (s.d < 0.5) {
          this.goal = null;
          this.walker.reset();
          this.waitUntil = m.time + 2 + m.rng() * 4;
          this.lookYaw = this.glance(g);
        }
      } else {
        this.turnTo(g, inp, this.lookYaw, dt, 1.2);
        if (Math.abs(wrapAngle(g.yaw - this.lookYaw)) < 0.05) this.lookYaw = this.glance(g);
      }
    }
    // Spectacles knocked off: pick them up again after a moment.
    if (g.specsOff && m.rng() < 0.02) this.tap.shove = true;
    // Hearing aid now and then when cousins are around (she can tell from their voices and footsteps).
    if (g.aidCd <= 0 && m.rng() < 0.004) {
      const near = m.cousinIds.some((id) => { const c = m.chars.get(id); return !!c && dist(c.body.pos, g.body.pos) < HEARING_AID.clearRange; });
      if (near) this.tap.secondary = true;
    }
    this.flushTaps(inp);
    m.botInput(this.id, inp);
  }

  /** Somewhere new to look while pottering about: a glance aside, now and then over her shoulder. */
  private glance(g: Char): number {
    const rnd = this.m.rng;
    return wrapAngle(g.yaw + (rnd() < 0.3 ? Math.PI : 0) + (rnd() - 0.5) * 2.5);
  }

  private turnTo(g: Char, inp: InputMsg, yaw: number, dt: number, rate: number): void {
    const diff = wrapAngle(yaw - g.yaw);
    const stepMax = rate * dt;
    inp.yaw = wrapAngle(g.yaw + Math.max(-stepMax, Math.min(stepMax, diff)));
  }

  /** Buttons are edges: press for one tick, then release. */
  private flushTaps(inp: InputMsg): void {
    const g = this.m.chars.get(this.id);
    inp.primary = this.tap.primary;
    inp.secondary = this.tap.secondary;
    inp.shove = this.tap.shove && !!g && (g.specsCd <= 0 || g.specsOff);
    this.tap = { primary: false, secondary: false, shove: false };
  }
}
