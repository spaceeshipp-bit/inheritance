// DEV ONLY. A tiny stand-in simulation for the offline mock: wandering bot
// cousins, a bot or human Grandma, heirlooms, items, the cat, wishes, and the
// will (using the real shared/will.ts rules). Not the server's physics: just
// enough to exercise the client.
import {
  COUSIN, GRANDMA, GRAVITY, HEARING_AID, HEIRLOOM, QUICKCHAT, RAGDOLL_TIME, SPECTACLES, STORM, VOICE, WILL, WISH,
} from '../../../shared/constants.js';
import { HEIRLOOM_SPOTS, HEIRLOOM_VARIANTS, SPAWNS, groundHeight } from '../../../shared/map.js';
import type { GameEvent, InputMsg, GrandmaAction } from '../../../shared/protocol.js';
import { canSee, dist, flatDist, forward, hearingBand, scrambleText } from '../../../shared/senses.js';
import type { CharSnap, CousinInfo, PropSnap, Vec3, WishInfo } from '../../../shared/types.js';
import { applyChange, available, createWill, setShare, type WillState } from '../../../shared/will.js';
import { createBody, stepMovement, type MoveBody, type MoveCmd } from '../../../shared/movement.js';
import { rng } from '../util.js';

interface SimChar extends CharSnap { target: Vec3 | null; path: Vec3[]; wait: number; nextAct: number; bot: boolean }

const NODES: Vec3[] = [
  { x: 0, y: 0, z: 2.5 }, { x: -5, y: 0, z: -1 }, { x: 5, y: 0, z: -3 }, { x: -5, y: 0, z: 4 }, { x: 5, y: 0, z: 4 },
  { x: 0, y: 0, z: -0.8 }, { x: 0, y: 3, z: -8.8 }, { x: -5, y: 3, z: -10 }, { x: 5, y: 3, z: -10 },
  { x: 9.5, y: 0, z: 0 }, { x: 12, y: 0, z: 2.2 }, { x: 14.3, y: 0, z: 2.4 }, { x: 14.5, y: 0, z: 4.6 }, { x: 11, y: 0, z: -3.8 },
  { x: -4, y: 0, z: -9.5 }, { x: 4, y: 0, z: -9.5 },
];
const EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 5], [2, 5], [5, 6], [6, 7], [6, 8], [2, 9], [0, 9], [9, 10], [10, 11], [11, 12], [9, 13], [10, 13],
  [1, 14], [2, 15], [14, 15],
];

function path(from: Vec3, to: number): Vec3[] {
  let start = 0, best = Infinity;
  NODES.forEach((n, i) => { const d = flatDist(n, from) + Math.abs(n.y - from.y) * 4; if (d < best) { best = d; start = i; } });
  const prev = new Map<number, number>([[start, -1]]);
  const q = [start];
  while (q.length) {
    const c = q.shift() as number;
    if (c === to) break;
    for (const [a, b] of EDGES) {
      const n = a === c ? b : b === c ? a : -1;
      if (n >= 0 && !prev.has(n)) { prev.set(n, c); q.push(n); }
    }
  }
  const out: Vec3[] = [];
  for (let c = to; c !== -1 && c !== undefined; c = prev.get(c) as number) out.unshift(NODES[c]);
  return out;
}

export interface SimConfig {
  me: string;
  role: 'grandma' | 'cousin';
  grandmaId: string;
  cousins: CousinInfo[];
  names: Record<string, string>;
  emit: (ev: GameEvent, onlyGrandma?: boolean) => void;
  storm: boolean;
  specsOff: boolean;
  /** Keep the Storm's lightning flash on (for screenshots). */
  flash?: boolean;
  /** Stand the bot cousins in a still row in front of the player (for close-up checks). */
  lineup?: boolean;
  /** With lineup: one cousin stands this many metres in front of the player (0 = none). */
  near?: number;
  /** A cousin stands in the kitchen behind the wall, the player (a cousin) in the hall facing it. */
  wallBot?: boolean;
  /** The player (a cousin) starts holding another cousin's signature item. */
  holding?: boolean;
  /** An heirloom breaks a few metres in front of the player at 2.5 s. */
  smash?: boolean;
}

export class MockSim {
  chars = new Map<string, SimChar>();
  props = new Map<string, PropSnap & { vel?: Vec3 }>();
  will: WillState;
  wish: WishInfo | null = null;
  dark = false;
  flash = false;
  ack = 0;
  private r = rng(42);
  private lastInput: InputMsg | null = null;
  private pressed = new Set<'primary' | 'secondary' | 'shove' | 'interact'>();
  private nextWish = 4;
  private nextLightning = 6;
  private flashUntil = 0;
  private gAct = 6;
  private quillAt = 0;
  private parchmentUntil = 0;
  private aidUntil = 0;
  private specsUntil = 0;
  private specsOffUntil = 0;
  private summonCheck: { at: number; pos: Vec3 } | null = null;
  private found = new Set<string>();
  private bodies = new Map<string, MoveBody>();
  private script: { at: number; done: boolean; fn: () => void }[] = [];

  constructor(private c: SimConfig) {
    this.will = createWill(c.cousins.map((x) => x.id));
    const mk = (id: string, role: 'grandma' | 'cousin', pos: Vec3, yaw: number): SimChar => ({
      id, role, pos: { ...pos }, yaw, pitch: 0, vel: { x: 0, y: 0, z: 0 }, state: 'normal', ragdollT: 0, holding: null,
      running: false, sneaking: false, whispering: false, charge: 0, plant: 0, leader: false,
      ...(role === 'grandma' ? { parchmentOpen: false, aidActive: false, aidCooldown: 0, specsActive: false, specsCooldown: 0, specsOff: false, caneCooldown: 0, summonCooldown: 0 } : {}),
      target: null, path: [], wait: 0, nextAct: 8 + this.r() * 10, bot: id !== c.me,
    });
    this.chars.set(c.grandmaId, mk(c.grandmaId, 'grandma', SPAWNS.grandma, SPAWNS.grandmaYaw));
    c.cousins.forEach((x, i) => {
      const p = SPAWNS.cousins[i % SPAWNS.cousins.length];
      const ch = mk(x.id, 'cousin', p, 0);
      if (ch.bot) ch.pos = { x: p.x + (this.r() - 0.5) * 6, y: 0, z: p.z - 2 - this.r() * 4 };
      this.chars.set(x.id, ch);
      this.props.set(`item-${x.id}`, { id: `item-${x.id}`, kind: 'item', pos: { ...p }, yaw: 0, heldBy: x.id, owner: x.id, planted: false });
    });
    // Put the human near the action at the start (in front of Grandma for her, by the stairs for a cousin).
    const me = this.chars.get(c.me);
    if (me && c.role === 'cousin') { me.pos = { x: -2.2, y: 0, z: 2.8 }; me.yaw = Math.PI * 0.35; }
    const spots = [0, 1, 4, 5, 6, 8];
    spots.forEach((s, i) => {
      const sp = HEIRLOOM_SPOTS[s];
      this.props.set(`h${i}`, { id: `h${i}`, kind: 'heirloom', pos: { ...sp }, yaw: this.r() * 6, heldBy: null, broken: false, variant: HEIRLOOM_VARIANTS[i % HEIRLOOM_VARIANTS.length], ...(c.role === 'grandma' && i === 4 ? { favourite: true } : {}) });
    });
    this.props.set('cat', { id: 'cat', kind: 'cat', pos: { ...SPAWNS.cat }, yaw: 0, heldBy: null });
    this.props.set('teacup', { id: 'teacup', kind: 'teacup', pos: { ...SPAWNS.teacup }, yaw: 0, heldBy: null });
    this.props.set('pills', { id: 'pills', kind: 'pills', pos: { ...SPAWNS.pills[2] }, yaw: 0, heldBy: null });
    // A tiny scripted story so every screenshot has something going on.
    const cs = c.cousins.filter((x) => x.id !== c.me);
    const thief = cs[1], victim = c.role === 'cousin' ? c.me : cs[2].id;
    this.at(2, () => this.bubble(cs[0].id, QUICKCHAT.cousin[0], true));
    this.at(3.5, () => this.willChange(cs[0].id, WILL.quickStep, 'bless'));
    this.at(5, () => this.willChange(cs[2].id, -WILL.quickStep, 'tut'));
    this.at(7, () => this.breakHeirloom('h2', cs[3]?.id ?? cs[0].id));
    this.at(8, () => this.steal(thief.id, victim));
    this.at(11, () => this.plantNear(thief.id, c.role === 'grandma' ? { x: -3.6, y: 0, z: 0.6 } : { x: 4, y: 0, z: -3 }));
    this.at(12, () => this.shove(cs[0].id, cs[3]?.id ?? cs[2].id));
    this.at(14, () => this.bubble(cs[2].id, 'Nana, have you had your pills today?', false));
    if (c.specsOff) this.specsOffUntil = 1e9;
    if (c.flash) this.flashUntil = 1e9;
    if (c.lineup) {
      this.script = [];
      let i = 0;
      for (const ch of this.chars.values()) {
        if (!ch.bot || ch.role !== 'cousin') continue;
        ch.pos = { x: -3.4 + i * 1.25, y: 0, z: 0.4 };
        ch.yaw = i % 2 ? 0.25 : Math.PI - 0.25;
        ch.wait = 1e9;
        ch.nextAct = 1e9;
        i++;
      }
      if (me) { me.pos = { x: -1.6, y: 0, z: 3.6 }; me.yaw = 0; }
      const gm = this.chars.get(c.grandmaId);
      if (gm && c.role === 'cousin') { gm.pos = { x: 2.2, y: 0, z: 0.2 }; gm.yaw = Math.PI - 0.6; gm.wait = 1e9; }
      if (c.near && me) {
        const front = [...this.chars.values()].find((x) => x.bot && x.role === 'cousin');
        if (front) { front.pos = { x: me.pos.x + 0.1, y: 0, z: me.pos.z - c.near }; front.yaw = Math.PI; }
      }
    }
    if (c.wallBot && me) {
      // Kitchen at x > 8; the hall's east wall stands between z 1.5 and 6.
      const hidden = [...this.chars.values()].find((x) => x.bot && x.role === 'cousin');
      // Within name-tag range of the camera (about 9 m), but the wall is in the way.
      if (hidden) { hidden.pos = { x: 11, y: 0, z: 4 }; hidden.wait = 1e9; hidden.nextAct = 1e9; }
      me.pos = { x: 6.2, y: 0, z: 4 };
      me.yaw = -Math.PI / 2;
    }
    if (c.holding && me && c.role === 'cousin') {
      const victim = c.cousins.find((x) => x.id !== c.me);
      const it = victim ? this.props.get(`item-${victim.id}`) : undefined;
      if (it) { it.heldBy = me.id; me.holding = it.id; }
    }
    if (c.smash) {
      this.at(2.5, () => {
        const m = this.chars.get(c.me);
        if (!m) return;
        // The nearest whole heirloom to the player, broken right where it stands.
        let best: (PropSnap & { vel?: Vec3 }) | undefined, bd = Infinity;
        for (const p of this.props.values()) {
          if (p.kind !== 'heirloom' || p.broken) continue;
          const d = flatDist(p.pos, m.pos) + Math.abs(p.pos.y - m.pos.y) * 3;
          if (d < bd) { bd = d; best = p; }
        }
        if (!best) return;
        // It topples off its pedestal and smashes on the floor beside it.
        const x = best.pos.x + 0.5, z = best.pos.z + 0.5;
        best.broken = true;
        best.pos = { x, y: groundHeight(x, z, best.pos.y - 0.5), z };
        this.c.emit({ e: 'crash', pos: { ...best.pos }, heirloom: best.id, ...(best.favourite ? { favourite: true } : {}) });
      });
    }
  }

  private at(t: number, fn: () => void): void { this.script.push({ at: t, done: false, fn }); }

  /** Latch button presses between sim steps, like the real server. */
  input(m: InputMsg): void {
    for (const k of ['primary', 'secondary', 'shove', 'interact'] as const) if (m[k] && !this.lastInput?.[k]) this.pressed.add(k);
    this.lastInput = m;
    this.ack = m.seq;
  }

  bubble(from: string, text: string, quick: boolean, whisper = false): void {
    const g = this.chars.get(this.c.grandmaId);
    const sp = this.chars.get(from);
    if (this.c.role === 'grandma' && g && sp && from !== this.c.grandmaId) {
      // Like the server: nothing out of earshot, muffled text, and who spoke only if she can see them.
      const band = hearingBand(dist(g.pos, sp.pos), !!g.aidActive, whisper ? VOICE.whisperRange : Infinity);
      if (band === 'silent') return;
      const t = scrambleText(text, band, from.length * 31 + text.length);
      const sense = { pos: g.pos, yaw: g.yaw, aidActive: !!g.aidActive, specsActive: !!g.specsActive, specsOff: !!g.specsOff };
      const seen = canSee(sense, sp.pos);
      const rough = { x: Math.round(sp.pos.x), y: Math.round(sp.pos.y), z: Math.round(sp.pos.z) };
      this.c.emit({ e: 'bubble', from: seen ? from : '', text: t, quick, whisper: false, ...(seen ? {} : { pos: rough }) });
      return;
    }
    this.c.emit({ e: 'bubble', from, text, quick, whisper });
  }

  willChange(target: string, delta: number, via: 'bless' | 'tut', now = 0): void {
    const r = applyChange(this.will, target, delta, now, false);
    if (r.ok) this.c.emit({ e: 'will', target, moved: r.moved, via });
    else this.c.emit({ e: 'will-rejected', target, reason: r.reason ?? 'no-op' }, true);
  }

  grandma(a: GrandmaAction, now: number): void {
    const g = this.chars.get(this.c.grandmaId);
    if (!g) return;
    switch (a.a) {
      case 'bless': case 'tut': {
        const r = applyChange(this.will, a.target, a.a === 'bless' ? WILL.quickStep : -WILL.quickStep, now, false);
        this.c.emit(r.ok ? { e: 'will', target: a.target, moved: r.moved, via: a.a } : { e: 'will-rejected', target: a.target, reason: r.reason ?? 'no-op' });
        break;
      }
      case 'set': {
        const r = setShare(this.will, a.target, a.value, now);
        this.c.emit(r.ok ? { e: 'will', target: a.target, moved: r.moved, via: 'parchment' } : { e: 'will-rejected', target: a.target, reason: r.reason ?? 'no-op' });
        break;
      }
      case 'parchment': g.parchmentOpen = a.open; break;
      case 'summon':
        if ((g.summonCooldown ?? 0) <= 0) {
          g.summonCooldown = GRANDMA.summonCooldown;
          this.c.emit({ e: 'summon', pos: { ...g.pos }, endsAt: now + GRANDMA.summonGrace });
          this.summonCheck = { at: now + GRANDMA.summonGrace, pos: { ...g.pos } };
          for (const ch of this.chars.values()) if (ch.bot && ch.role === 'cousin' && this.r() < 0.6) { ch.path = [{ ...g.pos, x: g.pos.x + 1 }]; ch.wait = 0; }
        }
        break;
      default: break;
    }
  }

  private breakHeirloom(id: string, by: string): void {
    const p = this.props.get(id);
    if (!p || p.broken) return;
    const b = this.chars.get(by);
    if (b) { b.pos = { x: p.pos.x + 0.8, y: groundHeight(p.pos.x + 0.8, p.pos.z, p.pos.y), z: p.pos.z + 0.4 }; }
    p.broken = true;
    p.pos = { x: p.pos.x + 0.4, y: groundHeight(p.pos.x + 0.4, p.pos.z + 0.3, p.pos.y - 0.5), z: p.pos.z + 0.3 };
    this.c.emit({ e: 'crash', pos: { ...p.pos }, heirloom: id, ...(p.favourite ? { favourite: true } : {}) });
  }

  private steal(thief: string, owner: string): void {
    const t = this.chars.get(thief), o = this.chars.get(owner), it = this.props.get(`item-${owner}`);
    if (!t || !o || !it || t.holding) return;
    t.pos = { x: o.pos.x + 0.9, y: o.pos.y, z: o.pos.z + 0.4 };
    it.heldBy = thief;
    t.holding = it.id;
  }

  private plantNear(thief: string, pos: Vec3): void {
    const t = this.chars.get(thief);
    if (!t || !t.holding) return;
    const it = this.props.get(t.holding);
    if (!it || it.kind !== 'item') return;
    t.pos = { x: pos.x + 0.6, y: 0, z: pos.z };
    it.heldBy = null;
    it.planted = true;
    it.pos = { ...pos };
    t.holding = null;
  }

  private shove(by: string, victim: string): void {
    const b = this.chars.get(by), v = this.chars.get(victim);
    if (!b || !v || v.state !== 'normal') return;
    if (flatDist(b.pos, v.pos) > 2.5) b.pos = { x: v.pos.x - 0.9, y: v.pos.y, z: v.pos.z };
    const dx = v.pos.x - b.pos.x, dz = v.pos.z - b.pos.z, l = Math.hypot(dx, dz) || 1;
    this.knock(v, dx / l, dz / l, COUSIN.shoveImpulse);
    this.c.emit({ e: 'shove', by, victim, pos: { ...v.pos } });
  }

  private knock(v: SimChar, dx: number, dz: number, imp: number): void {
    v.vel = { x: dx * imp, y: 3, z: dz * imp };
    v.state = 'ragdoll';
    v.ragdollT = RAGDOLL_TIME;
    if (v.holding) { const p = this.props.get(v.holding); if (p) { p.heldBy = null; p.pos = { ...v.pos }; } v.holding = null; }
  }

  step(dt: number, now: number): void {
    for (const s of this.script) if (!s.done && now >= s.at) { s.done = true; s.fn(); }
    const g = this.chars.get(this.c.grandmaId) as SimChar;
    // Grandma timers.
    g.caneCooldown = Math.max(0, (g.caneCooldown ?? 0) - dt);
    g.summonCooldown = Math.max(0, (g.summonCooldown ?? 0) - dt);
    g.aidCooldown = Math.max(0, (g.aidCooldown ?? 0) - dt);
    g.specsCooldown = Math.max(0, (g.specsCooldown ?? 0) - dt);
    g.aidActive = now < this.aidUntil;
    g.specsActive = now < this.specsUntil;
    g.specsOff = now < this.specsOffUntil;
    // Storm.
    if (this.c.storm) {
      this.dark = true;
      if (now > this.nextLightning) {
        this.nextLightning = now + STORM.lightningEvery * 0.4 + this.r() * STORM.lightningJitter;
        this.flashUntil = Math.max(this.flashUntil, now + STORM.flashDuration);
        this.c.emit({ e: 'lightning' });
      }
      this.flash = now < this.flashUntil;
    }
    // Wishes.
    if (!this.wish && now > this.nextWish) {
      const kinds: [WishInfo['kind'], string][] = [['tea', 'A nice cup of tea, dear.'], ['pills', 'Where are my pills?'], ['fetch-cat', 'Fetch me Mittens!']];
      const [kind, text] = kinds[Math.floor(this.r() * kinds.length)];
      this.wish = { id: `w${Math.floor(now)}`, kind, text, endsAt: now + WISH.duration };
      this.c.emit({ e: 'wish', wish: this.wish });
    }
    if (this.wish && now > this.wish.endsAt) { this.wish = null; this.nextWish = now + WISH.gapMin; this.c.emit({ e: 'wish', wish: null }); }
    if (this.summonCheck && now > this.summonCheck.at) {
      const pos = this.summonCheck.pos;
      const ids = [...this.chars.values()].filter((c) => c.role === 'cousin' && flatDist(c.pos, pos) > GRANDMA.summonRadius).map((c) => c.id);
      this.c.emit({ e: 'summon-ignored', ids }, true);
      this.summonCheck = null;
    }
    // Bot Grandma acts now and then.
    if (this.c.role === 'cousin' && now > this.gAct) {
      this.gAct = now + 5 + this.r() * 6;
      const ids = this.c.cousins.map((x) => x.id);
      const t = ids[Math.floor(this.r() * ids.length)];
      if (this.r() < 0.35) this.parchmentUntil = now + 4;
      else this.willChange(t, this.r() < 0.5 ? WILL.quickStep : -WILL.quickStep, this.r() < 0.5 ? 'bless' : 'tut', now);
    }
    if (this.c.role === 'cousin') g.parchmentOpen = now < this.parchmentUntil;
    if (g.parchmentOpen && now > this.quillAt) {
      this.quillAt = now + 1.2;
      this.c.emit({ e: 'quill', pos: { ...g.pos } });
      if (this.c.role === 'cousin' && this.r() < 0.5) {
        const ids = this.c.cousins.map((x) => x.id);
        const t = ids[Math.floor(this.r() * ids.length)];
        const r = setShare(this.will, t, (this.will.shares[t] ?? 0) + (this.r() < 0.5 ? 2 : -2), now);
        if (r.ok) this.c.emit({ e: 'will', target: t, moved: r.moved, via: 'parchment' });
      }
    }

    for (const ch of this.chars.values()) this.stepChar(ch, dt, now);
    this.stepProps(dt, now);

    // Leader glow.
    const lead = Object.entries(this.will.shares).sort((a, b) => b[1] - a[1]);
    for (const ch of this.chars.values()) ch.leader = lead.length > 1 && lead[0][1] > lead[1][1] && ch.id === lead[0][0];
    // Grandma finds planted evidence she can see up close.
    if (this.c.role === 'grandma') {
      const sense = { pos: g.pos, yaw: g.yaw, aidActive: !!g.aidActive, specsActive: !!g.specsActive, specsOff: !!g.specsOff };
      for (const p of this.props.values()) {
        if (p.kind === 'item' && p.planted && !this.found.has(p.id) && dist(p.pos, g.pos) < GRANDMA.findRange && canSee(sense, p.pos)) {
          this.found.add(p.id);
          p.found = true;
          this.c.emit({ e: 'found', item: p.id, owner: p.owner ?? '', pos: { ...p.pos } });
        }
      }
    }
  }

  private stepChar(ch: SimChar, dt: number, now: number): void {
    const human = !ch.bot;
    let cmd: MoveCmd | null = null;
    if (ch.state === 'ragdoll') {
      ch.ragdollT -= dt;
      if (ch.ragdollT <= 0) { ch.state = 'normal'; ch.ragdollT = 0; }
    } else if (human && this.lastInput) {
      const m = this.lastInput;
      ch.yaw = m.yaw;
      ch.pitch = m.pitch;
      const moving = Math.hypot(ch.vel.x, ch.vel.z) > 0.3;
      ch.running = m.run && moving; ch.sneaking = m.sneak && moving; ch.whispering = m.whisper;
      cmd = { move: m.move, yaw: m.yaw, run: m.run, sneak: m.sneak, jump: m.jump };
      this.humanActions(ch, m, dt, now);
    } else if (ch.bot) {
      if (ch.wait > 0) ch.wait -= dt;
      else {
        if (!ch.path.length) {
          const pool = ch.role === 'grandma' ? [0, 1, 3, 5, 2] : NODES.map((_, i) => i);
          ch.path = path(ch.pos, pool[Math.floor(this.r() * pool.length)]);
        }
        const tgt = ch.path[0];
        if (tgt) {
          const dx = tgt.x - ch.pos.x, dz = tgt.z - ch.pos.z, l = Math.hypot(dx, dz);
          if (l < 0.4) { ch.path.shift(); if (!ch.path.length) ch.wait = 1 + this.r() * 3; }
          else { ch.yaw = Math.atan2(-dx, -dz); cmd = { move: { x: 0, z: 1 }, yaw: ch.yaw, run: false, sneak: false, jump: false }; }
        }
      }
      if (ch.role === 'cousin' && now > ch.nextAct) {
        ch.nextAct = now + 9 + this.r() * 12;
        const g = this.chars.get(this.c.grandmaId);
        if (g && flatDist(g.pos, ch.pos) < 5) this.bubble(ch.id, QUICKCHAT.cousin[this.r() < 0.5 ? 0 : 4], true);
        else if (this.r() < 0.5) this.bubble(ch.id, QUICKCHAT.cousin[Math.floor(this.r() * 8)], true);
        else {
          const other = [...this.chars.values()].find((o) => o.id !== ch.id && o.role === 'cousin' && flatDist(o.pos, ch.pos) < 3);
          if (other) this.shove(ch.id, other.id);
        }
      }
    }
    // Same kinematics as the real server (shared/movement.ts).
    let body = this.bodies.get(ch.id);
    if (!body) { body = createBody(ch.pos); this.bodies.set(ch.id, body); }
    body.pos = ch.pos;
    body.vel = ch.vel;
    const ragdoll = ch.state === 'ragdoll';
    stepMovement(body, ragdoll ? null : cmd ?? { move: { x: 0, z: 0 }, yaw: ch.yaw, run: false, sneak: false, jump: false }, dt,
      { role: ch.role, ragdoll, parchmentOpen: !!ch.parchmentOpen });
  }

  private humanActions(ch: SimChar, m: InputMsg, dt: number, now: number): void {
    const pressed = new Set(this.pressed);
    this.pressed.clear();
    const edge = (k: 'primary' | 'secondary' | 'shove' | 'interact') => pressed.has(k);
    if (ch.role === 'grandma') {
      if (edge('primary') && (ch.caneCooldown ?? 0) <= 0) {
        ch.caneCooldown = GRANDMA.caneCooldown;
        const f = forward(ch.yaw);
        for (const o of this.chars.values()) {
          if (o.id === ch.id || o.state !== 'normal') continue;
          const dx = o.pos.x - ch.pos.x, dz = o.pos.z - ch.pos.z, l = Math.hypot(dx, dz);
          if (l < GRANDMA.caneRange && (dx * f.x + dz * f.z) / (l || 1) > 0.5) {
            this.knock(o, dx / l, dz / l, GRANDMA.caneImpulse);
            this.c.emit({ e: 'cane', victim: o.id, pos: { ...o.pos } });
            break;
          }
        }
      }
      if (edge('secondary') && (ch.aidCooldown ?? 0) <= 0 && !ch.aidActive) {
        this.aidUntil = now + HEARING_AID.duration;
        ch.aidCooldown = HEARING_AID.duration + HEARING_AID.cooldown;
        this.c.emit({ e: 'whistle', pos: { ...ch.pos } });
      }
      if (edge('shove') && (ch.specsCooldown ?? 0) <= 0 && !ch.specsOff) {
        this.specsUntil = now + SPECTACLES.duration;
        ch.specsCooldown = SPECTACLES.duration + SPECTACLES.cooldown;
      }
      return;
    }
    // Cousin: grab / drop / throw / shove / interact / plant.
    const held = ch.holding ? this.props.get(ch.holding) : undefined;
    if (m.secondary && held) ch.charge = Math.min(1, ch.charge + dt / COUSIN.throwChargeTime);
    if (!m.secondary && ch.charge > 0 && held) {
      const f = forward(ch.yaw);
      const sp = COUSIN.throwSpeedMin + (COUSIN.throwSpeedMax - COUSIN.throwSpeedMin) * ch.charge;
      held.heldBy = null;
      held.pos = { x: ch.pos.x + f.x * 0.5, y: ch.pos.y + 1.3, z: ch.pos.z + f.z * 0.5 };
      held.vel = { x: f.x * sp, y: 3, z: f.z * sp };
      ch.holding = null;
    }
    if (!m.secondary) ch.charge = 0;
    if (m.primary && !ch.holding) {
      let best: (PropSnap & { vel?: Vec3 }) | undefined, bd: number = COUSIN.reach;
      for (const p of this.props.values()) {
        if (p.heldBy || p.broken || (p.kind === 'item' && p.planted)) continue;
        const d = dist(p.pos, { ...ch.pos, y: ch.pos.y + 0.6 });
        if (d < bd + 0.6) { bd = d; best = p; }
      }
      if (best) { best.heldBy = ch.id; ch.holding = best.id; best.vel = undefined; }
    }
    if (!m.primary && !m.secondary && held && held.kind !== 'item') {
      const f = forward(ch.yaw);
      held.heldBy = null;
      held.pos = { x: ch.pos.x + f.x * 0.6, y: ch.pos.y + 0.9, z: ch.pos.z + f.z * 0.6 };
      held.vel = { x: 0, y: 0, z: 0 };
      ch.holding = null;
    }
    if (edge('shove')) {
      const f = forward(ch.yaw);
      for (const o of this.chars.values()) {
        if (o.id === ch.id || o.role === 'grandma' || o.state !== 'normal') continue;
        const dx = o.pos.x - ch.pos.x, dz = o.pos.z - ch.pos.z, l = Math.hypot(dx, dz);
        if (l < COUSIN.shoveRange + 0.3 && (dx * f.x + dz * f.z) / (l || 1) > 0.3) { this.shove(ch.id, o.id); break; }
      }
    }
    if (edge('interact')) {
      const g = this.chars.get(this.c.grandmaId);
      const w = this.wish;
      if (held && w && g && flatDist(ch.pos, g.pos) < WISH.deliverRange + 0.5 &&
        ((w.kind === 'tea' && held.kind === 'teacup') || (w.kind === 'pills' && held.kind === 'pills') || (w.kind === 'fetch-cat' && held.kind === 'cat'))) {
        this.c.emit({ e: 'wish-done', by: ch.id, wish: w });
        this.wish = null;
        this.nextWish = now + WISH.gapMin;
        held.heldBy = null;
        held.pos = held.kind === 'teacup' ? { ...SPAWNS.teacup } : held.kind === 'pills' ? { ...SPAWNS.pills[0] } : { ...SPAWNS.cat };
        ch.holding = null;
      } else if (!ch.holding) {
        const mine = this.props.get(`item-${ch.id}`);
        const victim = [...this.chars.values()].find((o) => o.role === 'cousin' && o.id !== ch.id && flatDist(o.pos, ch.pos) < COUSIN.reach + 0.3);
        if (mine && mine.planted && flatDist(mine.pos, ch.pos) < COUSIN.reach + 0.3) { mine.planted = false; mine.heldBy = ch.id; }
        else if (victim) {
          const it = this.props.get(`item-${victim.id}`);
          if (it && it.heldBy === victim.id && victim.holding !== it.id) { it.heldBy = ch.id; ch.holding = it.id; }
        }
      }
    }
    if (m.plant && held && held.kind === 'item' && held.owner !== ch.id) {
      ch.plant = Math.min(1, ch.plant + dt / COUSIN.plantHold);
      if (ch.plant >= 1) {
        held.heldBy = null; held.planted = true; held.pos = { ...ch.pos };
        ch.holding = null; ch.plant = 0;
      }
    } else ch.plant = 0;
  }

  private stepProps(dt: number, now: number): void {
    for (const p of this.props.values()) {
      if (p.heldBy) {
        const h = this.chars.get(p.heldBy);
        if (h) p.pos = { x: h.pos.x, y: h.pos.y + 1, z: h.pos.z };
        continue;
      }
      if (p.vel) {
        p.vel.y -= GRAVITY * dt;
        p.pos.x += p.vel.x * dt; p.pos.y += p.vel.y * dt; p.pos.z += p.vel.z * dt;
        const gh = groundHeight(p.pos.x, p.pos.z, p.pos.y + 0.3);
        if (p.pos.y <= gh) {
          const sp = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
          p.pos.y = gh;
          if (p.kind === 'heirloom' && sp > HEIRLOOM.breakSpeed && !p.broken) {
            p.broken = true;
            this.c.emit({ e: 'crash', pos: { ...p.pos }, heirloom: p.id, ...(p.favourite ? { favourite: true } : {}) });
          }
          p.vel = undefined;
        }
      } else if (p.kind === 'cat') {
        const t = now * 0.15;
        const tx = 3 + Math.sin(t) * 3, tz = 1.5 + Math.cos(t * 1.3) * 2;
        p.pos.x += (tx - p.pos.x) * Math.min(1, dt * 0.6);
        p.pos.z += (tz - p.pos.z) * Math.min(1, dt * 0.6);
        p.yaw = Math.atan2(-(tx - p.pos.x), -(tz - p.pos.z));
        p.pos.y = groundHeight(p.pos.x, p.pos.z, p.pos.y);
      }
    }
  }

  snapshotChars(): CharSnap[] {
    return [...this.chars.values()].map((c) => {
      const { target: _t, path: _p, wait: _w, nextAct: _n, bot: _b, ...snap } = c;
      void _t; void _p; void _w; void _n; void _b;
      const out: CharSnap = { ...snap, pos: { ...c.pos }, vel: { ...c.vel } };
      if (c.id === this.c.me) out.ack = this.ack;
      return out;
    });
  }

  snapshotProps(): PropSnap[] {
    return [...this.props.values()].map((p) => {
      const { vel: _v, ...snap } = p;
      void _v;
      const out: PropSnap = { ...snap, pos: { ...p.pos } };
      if (this.c.role !== 'grandma') delete out.favourite;
      return out;
    });
  }

  avail(now: number): { budget: number; rolling: number } {
    const a = available(this.will, now);
    return { budget: a.budget, rolling: a.rolling };
  }
}
