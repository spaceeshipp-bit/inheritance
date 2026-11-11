// Bot cousins and a bot Grandma, so one human can play either role and still
// see a lively match. Bots read the match state directly but act only through
// the same entry points as humans (input messages, grandma actions, quick
// chat, tattles, votes), so every rule and validation applies to them too.
import { COUSIN, GRANDMA, HEARING_AID, WILL, WISH } from '../shared/constants.js';
import type { GameEvent, InputMsg } from '../shared/protocol.js';
import { canIdentify, dist, flatDist } from '../shared/senses.js';
import type { LogEvent, Vec3 } from '../shared/types.js';
import { available } from '../shared/will.js';
import { yawToward, wrapAngle } from '../shared/movement.js';
import type { Char, Match } from './match.js';
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
  private checkAt = 0;
  private checkPos: Vec3 = { x: 0, y: 0, z: 0 };
  private unstickUntil = 0;
  private unstickYaw = 0;

  constructor(private rng: () => number) {}

  reset(): void { this.goal = null; this.path = []; }

  /**
   * Steer toward `goal`. Returns the yaw to face and whether to move. Uses the
   * real goal for the final approach so bodies press up against furniture.
   */
  steer(c: Char, goal: Vec3, now: number): { yaw: number; move: boolean; d: number } {
    const pos = c.body.pos;
    if (!this.goal || flatDist(this.goal, goal) > 0.6 || Math.abs(this.goal.y - goal.y) > 1 || now >= this.replanAt) {
      this.path = findPath(pos, goal);
      this.goal = { ...goal };
      this.replanAt = now + 2 + this.rng();
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
    if (now < this.unstickUntil) return { yaw: this.unstickYaw, move: true, d };
    return { yaw: yawToward(target.x - pos.x, target.z - pos.z), move: true, d };
  }
}

function pick<T>(rng: () => number, xs: T[]): T | undefined {
  return xs.length ? xs[Math.floor(rng() * xs.length)] : undefined;
}

// ───────────────────────── Cousin bot ─────────────────────────

type Task =
  | { k: 'wander'; goal: Vec3; until: number }
  | { k: 'fetch'; prop: string; until: number }
  | { k: 'deliver'; until: number }
  | { k: 'compliment'; until: number; saidAt: number | null; thenShove: boolean }
  | { k: 'shove'; target: string; until: number }
  | { k: 'break'; prop: string; until: number; chargeStart: number | null; aim: number }
  | { k: 'steal'; victim: string; until: number }
  | { k: 'plant'; goal: Vec3; until: number }
  | { k: 'retrieve'; until: number }
  | { k: 'summoned'; until: number }
  | { k: 'tattle'; accused: string; until: number }
  | { k: 'idle'; until: number };

export class CousinBot implements Bot {
  private seq = 0;
  private task: Task | null = null;
  private walker: Walker;
  private flip = false;
  private grudges: string[] = [];
  private chatAt = 0;
  private voted = false;
  private missingSince: number | null = null;
  private noticeDelay: number;
  /** Personality. */
  readonly mischief: number;
  readonly helpful: number;
  readonly careless: number;

  constructor(private m: Match, readonly id: string) {
    this.walker = new Walker(m.rng);
    this.mischief = 0.32 + m.rng() * 0.38;
    this.helpful = 0.35 + m.rng() * 0.4;
    this.careless = 0.08 + m.rng() * 0.12;
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

  onLog(ev: LogEvent): void {
    if (ev.kind === 'shove' && ev.victim === this.id) {
      this.grudges.push(ev.by);
      if (this.m.rng() < 0.35) this.say(this.m.rng() < 0.5 ? 7 : 1);
    }
    if (ev.kind === 'steal' && ev.owner === this.id && this.m.rng() < 0.5) this.grudges.push(ev.by);
  }

  onEvent(ev: GameEvent): void {
    const c = this.m.chars.get(this.id);
    if (!c) return;
    if (ev.e === 'crash' && dist(ev.pos, c.body.pos) < 8 && this.m.rng() < 0.25) this.say(3);
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
    if (m.phase === 'intermission') {
      if (!this.task || this.task.k !== 'wander' || m.time > this.task.until) this.task = this.wanderTask(c, 6);
    } else if (!this.task || m.time > this.task.until) {
      this.task = this.choose(c);
      this.walker.reset();
    }
    this.flip = !this.flip;
    this.run(c, inp);
    m.botInput(this.id, inp);
  }

  // ───── choosing ─────

  private wanderTask(c: Char, secs = 12): Task {
    const lv = levelOf(c.body.pos);
    const pool = waypoints().filter((p) => flatDist(p, c.body.pos) > 2 && (lv === 'gallery' || p.y < 1 || this.m.rng() < 0.5));
    return { k: 'wander', goal: pick(this.m.rng, pool) ?? { x: 0, y: 0, z: 0 }, until: this.m.time + secs };
  }

  private choose(c: Char): Task {
    const m = this.m, now = m.time, rnd = m.rng;
    const held = c.holding ? m.props.get(c.holding) : undefined;
    const mine = c.itemId ? m.props.get(c.itemId) : undefined;
    if (held) {
      if (m.wish && held.id === m.wish.propId) return { k: 'deliver', until: now + 20 };
      if (held.kind === 'item' && held.owner !== this.id) return { k: 'plant', goal: this.plantSpot(c), until: now + 20 };
      if (held.kind === 'heirloom') return { k: 'break', prop: held.id, until: now + 8, chargeStart: null, aim: this.aimAway(c) };
      return { k: 'idle', until: now + 0.4 };
    }
    const missing = !!mine && !(mine.heldBy === this.id && mine.onBody) && !mine.hidden;
    if (!missing) this.missingSince = null;
    else if (this.missingSince === null) this.missingSince = now;
    // You notice your item is gone after a while (bots must not be omniscient detectives).
    if (missing && this.missingSince !== null && now - this.missingSince > this.noticeDelay && rnd() < 0.5) return { k: 'retrieve', until: now + 15 };
    const g = m.grandma;
    if (m.summon && g && flatDist(c.body.pos, g.body.pos) > GRANDMA.summonRadius - 1 && rnd() < 0.85) return { k: 'summoned', until: m.summon.endsAt + 2 };
    if (m.wish && rnd() < this.helpful) {
      const p = m.props.get(m.wish.propId);
      const taken = [...m.bots.values()].some((b) => b !== this && b instanceof CousinBot && b.fetching === p?.id);
      if (p && !p.heldBy && !p.hidden && !taken) return { k: 'fetch', prop: p.id, until: now + 25 };
    }
    const awakeGrudge = this.grudges.filter((id) => m.cousinIds.includes(id));
    if (awakeGrudge.length && g && rnd() < 0.15) return { k: 'tattle', accused: awakeGrudge[awakeGrudge.length - 1], until: now + 12 };
    if (rnd() < this.mischief) {
      const makers = this.shuffle([() => this.shoveTask(c), () => this.breakTask(c), () => this.stealTask(c)]);
      for (const mk of makers) {
        const t = mk();
        if (t) return t;
      }
    }
    if (g && rnd() < 0.55) return { k: 'compliment', until: now + 14, saidAt: null, thenShove: rnd() < this.mischief * 0.7 };
    return this.wanderTask(c);
  }

  private shuffle<T>(xs: T[]): T[] {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(this.m.rng() * (i + 1));
      [xs[i], xs[j]] = [xs[j], xs[i]];
    }
    return xs;
  }

  private shoveTask(c: Char): Task | null {
    const m = this.m;
    const others = m.cousinIds.filter((id) => id !== this.id).map((id) => m.chars.get(id)!).filter((o) => o && o.state === 'normal' && flatDist(o.body.pos, c.body.pos) < 14);
    if (!others.length) return null;
    // Prefer whoever is winning, and anyone on the stairs or gallery.
    const lead = others.find((o) => (m.will.shares[o.id] ?? 0) === Math.max(...others.map((x) => m.will.shares[x.id] ?? 0)));
    const high = others.find((o) => o.body.pos.y > 1);
    const target = (high && m.rng() < 0.5 ? high : undefined) ?? (lead && m.rng() < 0.5 ? lead : undefined) ?? pick(m.rng, others)!;
    return { k: 'shove', target: target.id, until: m.time + 12 };
  }

  private breakTask(c: Char): Task | null {
    const m = this.m;
    // Space heirloom breaks out so the house is not empty after a minute.
    const quiet = m.fast ? 10 : 25;
    if (m.rng() < 0.45 || m.crimes.some((cr) => cr.kind === 'break' && m.time - cr.t < quiet)) return null;
    const hs = [...m.props.values()].filter((p) => p.kind === 'heirloom' && !p.broken && !p.heldBy && !p.hidden);
    if (!hs.length) return null;
    hs.sort((a, b) => flatDist(a.pos, c.body.pos) - flatDist(b.pos, c.body.pos));
    const p = m.rng() < 0.6 ? hs[0] : pick(m.rng, hs)!;
    return { k: 'break', prop: p.id, until: m.time + 22, chargeStart: null, aim: 0 };
  }

  private stealTask(c: Char): Task | null {
    const m = this.m;
    const victims = m.cousinIds.filter((id) => id !== this.id).map((id) => m.chars.get(id)!).filter((o) => {
      if (!o || !o.itemId) return false;
      const it = m.props.get(o.itemId);
      return !!it && it.heldBy === o.id && it.onBody && flatDist(o.body.pos, c.body.pos) < 16;
    });
    const v = pick(m.rng, victims);
    return v ? { k: 'steal', victim: v.id, until: m.time + 15 } : null;
  }

  private plantSpot(c: Char): Vec3 {
    const m = this.m;
    const crash = [...m.crimes].reverse().find((cr) => cr.kind === 'break' && m.time - cr.t < 15);
    if (crash && m.rng() < 0.8) {
      const a = m.rng() * Math.PI * 2;
      return freePoint({ x: crash.pos.x + Math.cos(a) * 0.8, y: crash.pos.y, z: crash.pos.z + Math.sin(a) * 0.8 });
    }
    const g = m.grandma;
    const pool = waypoints().filter((p) => !g || flatDist(p, g.body.pos) > 7);
    return pick(m.rng, pool) ?? { ...c.body.pos };
  }

  private aimAway(c: Char): number {
    const g = this.m.grandma;
    const base = g ? yawToward(c.body.pos.x - g.body.pos.x, c.body.pos.z - g.body.pos.z) : c.yaw;
    return base + (this.m.rng() - 0.5) * 1.2;
  }

  /** Grandma could identify me doing it? (Careless bots sometimes do it anyway.) */
  private watched(c: Char): boolean {
    return this.m.canSeeNow(c.body.pos) && this.m.rng() > this.careless * 0.05;
  }

  // ───── doing ─────

  private go(c: Char, inp: InputMsg, goal: Vec3, run: boolean): number {
    const s = this.walker.steer(c, goal, this.m.time);
    inp.yaw = s.yaw;
    inp.move = { x: 0, z: s.move ? 1 : 0 };
    inp.run = run;
    return s.d;
  }

  private face(inp: InputMsg, c: Char, p: Vec3): void {
    inp.yaw = yawToward(p.x - c.body.pos.x, p.z - c.body.pos.z);
  }

  private done(): void {
    if (this.task) this.task.until = this.m.time - 1;
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
        if (c.holding === p.id) { this.task = { k: 'deliver', until: m.time + 20 }; break; }
        const d = this.go(c, inp, p.pos, true);
        if (this.reachable(c, p.pos)) {
          inp.move = { x: 0, z: d > 0.9 ? 0.4 : 0 };
          this.face(inp, c, p.pos);
          inp.primary = this.flip;
        }
        break;
      }
      case 'deliver': {
        if (!held || !m.wish || held.id !== m.wish.propId || !g) { this.done(); break; }
        inp.primary = !c.sticky;
        const d = this.go(c, inp, g.body.pos, true);
        if (d < WISH.deliverRange - 0.35) {
          inp.move = { x: 0, z: 0 };
          this.face(inp, c, g.body.pos);
          inp.interact = this.flip;
        }
        break;
      }
      case 'compliment': {
        if (!g) { this.done(); break; }
        const d = this.go(c, inp, g.body.pos, false);
        if (d < COUSIN.complimentRange - 0.45 || t.saidAt !== null) {
          inp.move = { x: 0, z: 0 };
          this.face(inp, c, g.body.pos);
          if (t.saidAt === null) {
            t.saidAt = m.time;
            m.handleQuick(this.id, m.rng() < 0.5 ? 0 : 4);
          } else if (m.time - t.saidAt > 1.0) {
            if (t.thenShove) {
              const near = m.cousinIds.map((id) => m.chars.get(id)!).filter((o) => o && o.id !== this.id && o.state === 'normal' && flatDist(o.body.pos, c.body.pos) < 4);
              const v = pick(m.rng, near);
              if (v) { this.task = { k: 'shove', target: v.id, until: m.time + 4 }; break; }
            }
            this.done();
          }
        }
        break;
      }
      case 'shove': {
        const v = m.chars.get(t.target);
        if (!v || v.state !== 'normal') { this.done(); break; }
        const d = this.go(c, inp, v.body.pos, flatDist(c.body.pos, v.body.pos) > 3);
        if (d < COUSIN.shoveRange - 0.25) {
          this.face(inp, c, v.body.pos);
          inp.move = { x: 0, z: 0.3 };
          if (c.shoveCd <= 0 && !this.watched(c)) {
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
          if (t.chargeStart === null) {
            if (t.aim === 0) t.aim = this.aimAway(c);
            inp.yaw = wrapAngle(t.aim);
            inp.pitch = -0.35;
            inp.move = { x: 0, z: 0 };
            if (!this.watched(c)) t.chargeStart = m.time;
            else this.go(c, inp, this.awayFromGrandma(c), false);
          } else {
            inp.yaw = wrapAngle(t.aim);
            inp.pitch = -0.35;
            inp.move = { x: 0, z: 0 };
            inp.secondary = m.time - t.chargeStart < 0.55;
            if (!inp.secondary) this.done();
          }
          break;
        }
        const d = this.go(c, inp, p.pos, true);
        if (this.reachable(c, p.pos)) {
          inp.move = { x: 0, z: d > 0.9 ? 0.4 : 0 };
          this.face(inp, c, p.pos);
          inp.primary = this.flip;
        }
        break;
      }
      case 'steal': {
        const v = m.chars.get(t.victim);
        const it = v?.itemId ? m.props.get(v.itemId) : undefined;
        if (held && held.kind === 'item') { this.task = { k: 'plant', goal: this.plantSpot(c), until: m.time + 20 }; break; }
        if (!v || !it || it.heldBy !== v.id || !it.onBody) { this.done(); break; }
        const d = this.go(c, inp, v.body.pos, flatDist(c.body.pos, v.body.pos) > 3);
        if (d < COUSIN.reach - 0.25 && Math.abs(v.body.pos.y - c.body.pos.y) < 1) {
          inp.move = { x: 0, z: 0.2 };
          this.face(inp, c, v.body.pos);
          if (!this.watched(c)) inp.interact = this.flip;
        }
        break;
      }
      case 'plant': {
        if (!held || held.kind !== 'item' || held.owner === this.id) { this.done(); break; }
        const d = this.go(c, inp, t.goal, false);
        if (d < 1.0) {
          inp.move = { x: 0, z: 0 };
          inp.plant = !this.watched(c) || c.plantT > 1.2;
          if (!inp.plant && m.rng() < 0.01) t.goal = this.plantSpot(c);
        }
        break;
      }
      case 'retrieve': {
        const mine = c.itemId ? m.props.get(c.itemId) : undefined;
        if (!mine || mine.hidden || (mine.heldBy === this.id && mine.onBody)) { this.done(); break; }
        if (held && held.id !== mine.id) { inp.primary = false; this.done(); break; }
        const holder = mine.heldBy ? m.chars.get(mine.heldBy) : undefined;
        const at = holder ? holder.body.pos : mine.pos;
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
        const d = this.go(c, inp, g.body.pos, true);
        if (d < GRANDMA.summonRadius - 1.5) { inp.move = { x: 0, z: 0 }; this.face(inp, c, g.body.pos); }
        break;
      }
      case 'tattle': {
        if (!g || !m.cousinIds.includes(t.accused)) { this.done(); break; }
        const d = this.go(c, inp, g.body.pos, true);
        if (d < COUSIN.tattleRange - 0.8) {
          inp.move = { x: 0, z: 0 };
          this.face(inp, c, g.body.pos);
          m.handleTattle(this.id, t.accused);
          this.say(1);
          this.grudges = this.grudges.filter((x) => x !== t.accused);
          this.done();
        }
        break;
      }
    }
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
  private naughty: { id: string; until: number } | null = null;
  private tap = { primary: false, secondary: false, shove: false };
  private parchment: { openAt: number; setAt: number; closeAt: number; visit: number } | null = null;
  private summonAt = Infinity;
  private planned = -1;
  private voted = false;

  constructor(private m: Match, readonly id: string) {
    this.walker = new Walker(m.rng);
  }

  vote(): string | null {
    let best: string | null = null, n = -1;
    for (const id of this.m.cousinIds) {
      const t = this.tuts.get(id) ?? 0;
      if (t > n) { n = t; best = id; }
    }
    return best;
  }

  private later(delay: number, run: () => void): void {
    this.reactions.push({ at: this.m.time + delay, run });
  }

  private canMove(): boolean {
    return available(this.m.will, this.m.time).now >= WILL.quickStep || this.m.freeTuts > 0;
  }

  private bless(id: string): void {
    if (!this.m.cousinIds.includes(id) || available(this.m.will, this.m.time).now < WILL.quickStep) return;
    this.m.handleGrandma(this.id, { a: 'bless', target: id });
  }

  private tut(id: string): void {
    if (!this.m.cousinIds.includes(id) || !this.canMove()) return;
    this.tuts.set(id, (this.tuts.get(id) ?? 0) + 1);
    this.m.handleGrandma(this.id, { a: 'tut', target: id });
  }

  private look(pos: Vec3, secs: number): void {
    this.attention = { pos: { ...pos }, until: this.m.time + secs };
  }

  onLog(ev: LogEvent): void {
    const m = this.m, rnd = m.rng;
    const delay = 0.6 + rnd() * 0.8;
    switch (ev.kind) {
      case 'compliment':
        if (rnd() < 0.65) this.later(delay, () => this.bless(ev.by));
        break;
      case 'wish':
        if (rnd() < 0.95) this.later(delay, () => this.bless(ev.by));
        break;
      case 'shove':
      case 'steal':
      case 'plant':
        if (ev.seen) {
          if (rnd() < 0.9) this.later(delay, () => this.tut(ev.by));
          this.naughty = { id: ev.by, until: m.time + 6 };
          m.handleQuick(this.id, 3); // "I saw that!"
        } else if (ev.kind === 'shove' && dist(ev.pos, m.grandma?.body.pos ?? ev.pos) < 12) {
          this.look(ev.pos, 2.5);
        }
        break;
      case 'break':
        if (ev.seen && ev.by) {
          if (rnd() < 0.95) this.later(delay, () => this.tut(ev.by!));
          this.naughty = { id: ev.by, until: m.time + 6 };
        }
        break;
      case 'knock-specs':
        if (rnd() < 0.6) this.later(delay, () => this.tut(ev.by));
        break;
      default:
        break;
    }
  }

  onEvent(ev: GameEvent): void {
    const m = this.m, rnd = m.rng;
    switch (ev.e) {
      case 'crash': {
        this.look(ev.pos, 3);
        if (rnd() < 0.6) this.later(1 + rnd(), () => { this.investigate = { pos: { ...ev.pos }, until: m.time + 14 }; this.walker.reset(); });
        if (rnd() < 0.35) m.handleQuick(this.id, 1); // "WHO BROKE THAT?"
        if (rnd() < 0.5) this.tap.shove = true; // spectacles on
        const pos = ev.pos;
        // After a moment, blame whoever she can make out near the crash.
        this.later(1.6 + rnd(), () => {
          const s = m.grandmaSense();
          if (!s || rnd() > 0.5) return;
          const near = m.cousinIds.map((id) => m.chars.get(id)!).filter((c) => c && c.state !== 'sleeping' && dist(c.body.pos, pos) < 4 && canIdentify(s, c.body.pos));
          near.sort((a, b) => dist(a.body.pos, pos) - dist(b.body.pos, pos));
          if (near[0]) this.tut(near[0].id);
        });
        break;
      }
      case 'found':
        if (ev.owner && rnd() < 0.75) this.later(0.8 + rnd(), () => this.tut(ev.owner));
        this.look(ev.pos, 2);
        break;
      case 'tattle':
        if (rnd() < 0.35) this.later(1 + rnd(), () => this.tut(ev.accused));
        break;
      case 'bubble': {
        const c = m.chars.get(ev.from);
        if (!c || ev.from === this.id) break;
        if (ev.text === '…' && rnd() < 0.15) this.tap.secondary = true; // what was that? hearing aid
        if (rnd() < 0.5) this.look(c.body.pos, 1.5);
        break;
      }
      case 'shove':
        if (rnd() < 0.5) this.look(ev.pos, 2);
        break;
      default:
        break;
    }
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
    // Per-visit plans: one parchment opening and maybe a summon.
    if (this.planned !== m.visitIndex) {
      this.planned = m.visitIndex;
      const len = m.phaseEndsAt - m.time;
      this.parchment = m.rng() < 0.7 ? { openAt: m.time + len * (0.25 + m.rng() * 0.4), setAt: 0, closeAt: 0, visit: m.visitIndex } : null;
      this.summonAt = m.rng() < 0.5 ? m.time + len * (0.3 + m.rng() * 0.5) : Infinity;
    }
    // Scheduled reactions.
    const due = this.reactions.filter((r) => r.at <= m.time);
    this.reactions = this.reactions.filter((r) => r.at > m.time);
    for (const r of due) r.run();

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
      const worst = [...ids].sort((a, b) => (this.tuts.get(b) ?? 0) - (this.tuts.get(a) ?? 0))[0];
      const target = worst && (this.tuts.get(worst) ?? 0) > 0 ? worst : pick(m.rng, ids);
      if (target && available(m.will, m.time).now >= 3) {
        const cur = m.will.shares[target] ?? 0;
        const delta = (this.tuts.get(target) ?? 0) > 0 ? -3 : 3;
        m.handleGrandma(this.id, { a: 'set', target, value: Math.max(0, Math.min(100, cur + delta)) });
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
      if (v && flatDist(v.body.pos, g.body.pos) < GRANDMA.caneRange - 0.2) {
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
        if (Math.abs(wrapAngle(g.yaw - this.lookYaw)) < 0.05) this.lookYaw = g.yaw + (m.rng() - 0.5) * 3;
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
          this.lookYaw = g.yaw + (m.rng() - 0.5) * 3;
        }
      } else {
        this.turnTo(g, inp, this.lookYaw, dt, 1.2);
        if (Math.abs(wrapAngle(g.yaw - this.lookYaw)) < 0.05) this.lookYaw = g.yaw + (m.rng() - 0.5) * 2.5;
      }
    }
    // Spectacles knocked off: pick them up again after a moment.
    if (g.specsOff && m.rng() < 0.02) this.tap.shove = true;
    // Hearing aid now and then when cousins are around.
    if (g.aidCd <= 0 && m.rng() < 0.004) {
      const near = m.cousinIds.some((id) => { const c = m.chars.get(id); return !!c && dist(c.body.pos, g.body.pos) < HEARING_AID.clearRange; });
      if (near) this.tap.secondary = true;
    }
    this.flushTaps(inp);
    m.botInput(this.id, inp);
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
