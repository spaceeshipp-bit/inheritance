// Match controller: per-frame glue between state, input, renderer, HUD, SFX
// and voice; turns action keys into protocol messages.
import { COUSIN, TICK_HZ } from '../../shared/constants.js';
import type { ClientMsg, GameEvent } from '../../shared/protocol.js';
import { dist } from '../../shared/senses.js';
import type { Vec3 } from '../../shared/types.js';
import type { Sfx } from './audio/sfx.js';
import type { Hud } from './hud/hud.js';
import type { HudFrame } from './hud/types.js';
import type { Action, Input } from './input.js';
import type { GameRenderer } from './render/scene.js';
import type { GameState, PhaseMsg, View } from './state.js';
import { clamp, el, localSec, show } from './util.js';
import type { VoiceManager } from './voice/index.js';

export interface GameDeps {
  state: GameState;
  send: (m: ClientMsg) => void;
  serverNow: () => number;
  renderer: GameRenderer;
  hud: Hud;
  input: Input;
  sfx: Sfx;
  voice: VoiceManager;
  micOk: () => boolean;
}

interface StepTrack { acc: number; last: number }

export class Game {
  private lockIdx = 0;
  private needYaw = true;
  private shoveCd = 0;
  private prevShove = false;
  private steps = new Map<string, StepTrack>();
  private found = new Map<string, boolean>();
  private parchmentOpen = false;
  private target: HudFrame['target'] = null;
  private lastView: View | null = null;
  private tickTimer: ReturnType<typeof setInterval> | undefined;
  /** Input ticks are paced by real time, caught up each frame (several per frame if frames are slow). */
  private tickAcc = 0;
  private tickClock = performance.now();
  private takeover = el('div', 'takeover');
  private prevCane = 0;

  constructor(private d: GameDeps) {
    d.input.onAction = (a, down) => this.onAction(a, down);
    d.hud.onVote = (id) => { d.state.myVote = id; d.send({ t: 'vote', target: id }); d.sfx.play('pop'); };
    d.hud.onParchmentSet = (target, value) => d.send({ t: 'grandma', a: 'set', target, value });
    d.hud.chat.onSend = (text) => d.send({ t: 'chat', text });
    d.hud.chat.onClose = () => { d.input.typing = false; };
    document.body.appendChild(this.takeover);
    show(this.takeover, false);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyJ' && this.takeover.style.display !== 'none' && !d.input.typing) d.send({ t: 'lobby', willingGrandma: true });
    });
  }

  private get s(): GameState { return this.d.state; }
  private get isGrandma(): boolean { return this.s.role === 'grandma'; }

  /** A match started (or our role changed). */
  begin(): void {
    const { state: s, renderer, hud, input } = this.d;
    const m = s.match;
    if (!m) return;
    renderer.setMatch({ grandmaId: m.grandmaId, cousins: m.cousins.map((c) => ({ id: c.id, color: c.color, item: c.item })) });
    hud.startMatch();
    input.role = m.role;
    input.clear();
    this.needYaw = true;
    this.lockIdx = 0;
    this.found.clear();
    this.parchmentOpen = false;
    input.parchmentOpen = false;
    this.steps.clear();
    clearInterval(this.tickTimer);
    this.tickAcc = 0;
    this.tickClock = performance.now();
    // Fallback for hidden tabs, where requestAnimationFrame stops.
    this.tickTimer = setInterval(() => { if (document.hidden) { this.tick(); this.tickClock = performance.now(); } }, 1000 / TICK_HZ);
  }

  end(): void {
    clearInterval(this.tickTimer);
    this.d.hud.endMatch();
    this.d.renderer.setMatch(null);
    this.d.input.active = false;
    this.d.input.releaseLock();
    show(this.takeover, false);
  }

  onPhase(p: PhaseMsg): void {
    const { input, hud } = this.d;
    input.clear();
    if (hud.wheel.isOpen) { hud.wheel.close(); input.lookFrozen = false; }
    if (p.phase !== 'visit' && this.parchmentOpen) this.toggleParchment();
    input.active = p.phase === 'visit' || p.phase === 'intermission';
    if (p.phase === 'reading' || p.phase === 'vote' || p.phase === 'results') input.releaseLock();
  }

  /** Fixed-rate input send. */
  private tick(): void {
    const { input, state: s } = this.d;
    if (!s.inMatch || !(s.phase === 'visit' || s.phase === 'intermission' || s.phase === 'roles')) return;
    const msg = input.build();
    if (!this.isGrandma && msg.shove && !this.prevShove && this.shoveCd <= 0) this.shoveCd = COUSIN.shoveCooldown;
    this.prevShove = msg.shove;
    this.d.send(msg);
    if (s.role) s.predictor.input(msg, s.role, this.parchmentOpen);
  }

  // ───────────── actions ─────────────

  private cousinTargets(): string[] { return this.s.cousinIds(); }

  private lockedId(): string | null {
    const ids = this.cousinTargets();
    return ids.length ? ids[((this.lockIdx % ids.length) + ids.length) % ids.length] : null;
  }

  private toggleParchment(): void {
    const { hud, input, send } = this.d;
    const p = hud.parchment;
    if (!p) return;
    this.parchmentOpen = !this.parchmentOpen;
    input.parchmentOpen = this.parchmentOpen;
    send({ t: 'grandma', a: 'parchment', open: this.parchmentOpen });
    if (this.parchmentOpen) { p.open(); input.releaseLock(); this.d.sfx.play('quill'); }
    else { p.close(); input.requestLock(); }
  }

  private onAction(a: Action, down: boolean): void {
    const { hud, input, send, voice, sfx } = this.d;
    const s = this.s;
    const visit = s.phase === 'visit';
    switch (a) {
      case 'help': if (down) hud.toggleHelp(); return;
      case 'whisper': voice.setWhisper(down); return;
      case 'talk': voice.setTalkKey(down); return;
      case 'chat':
        if (down && !hud.chat.isOpen) { input.typing = true; input.clear(); hud.chat.open(); }
        return;
      case 'back':
        if (!down) return;
        if (this.parchmentOpen) this.toggleParchment();
        else if (hud.wheel.isOpen) { hud.wheel.close(); input.lookFrozen = false; }
        return;
      case 'quickWheel':
      case 'tattleWheel': {
        if (!visit && !(a === 'quickWheel' && s.phase === 'intermission')) return;
        const kind = a === 'quickWheel' ? 'quick' : 'tattle';
        if (down) {
          if (hud.wheel.isOpen) return;
          input.cursor.x = input.cursor.y = 0;
          input.lookFrozen = true;
          hud.openWheel(kind);
        } else if (hud.wheel.isOpen && hud.wheel.kind === kind) {
          this.finishWheel();
        }
        return;
      }
      case 'select':
        if (hud.wheel.isOpen) { hud.wheel.point(0, 0, input.digit()); this.finishWheel(); }
        return;
      default: break;
    }
    if (!down || !visit || !this.isGrandma) return;
    switch (a) {
      case 'bless':
      case 'tut': {
        const t = this.target?.id ?? this.lockedId();
        if (!t) { hud.toasts.push('Aim at a cousin, or scroll to lock a name.', 'warn', 2); return; }
        send({ t: 'grandma', a, target: t });
        sfx.play(a === 'bless' ? 'bless' : 'tut');
        return;
      }
      case 'parchment': this.toggleParchment(); return;
      case 'summon': send({ t: 'grandma', a: 'summon' }); return;
      case 'pin': {
        const f = [...s.found].reverse().find((x) => !x.pinned);
        if (!f) { hud.toasts.push('No new evidence to pin.', 'info', 2); return; }
        f.pinned = true;
        this.found.set(f.item, true);
        send({ t: 'grandma', a: 'pin', item: f.item });
        sfx.play('pop');
        return;
      }
      case 'lockNext': this.lockIdx++; sfx.play('pop', undefined, 0.4); return;
      case 'lockPrev': this.lockIdx--; sfx.play('pop', undefined, 0.4); return;
      case 'navUp': hud.parchment?.nav('up'); return;
      case 'navDown': hud.parchment?.nav('down'); return;
      case 'navLeft': hud.parchment?.nav('left'); return;
      case 'navRight': hud.parchment?.nav('right'); return;
      default: return;
    }
  }

  private finishWheel(): void {
    const { hud, input, send } = this.d;
    input.lookFrozen = false;
    const pick = hud.closeWheel();
    if (!pick) return;
    if (pick.kind === 'quick' && pick.line !== undefined) send({ t: 'quick', line: pick.line });
    if (pick.kind === 'tattle' && pick.accused) send({ t: 'tattle', accused: pick.accused });
  }

  // ───────────── events ─────────────

  onEvent(ev: GameEvent): void {
    const { sfx, hud, renderer } = this.d;
    const s = this.s;
    hud.onEvent(ev);
    const gpos = this.lastView?.grandma?.pos;
    switch (ev.e) {
      case 'crash': sfx.play('crash', ev.pos); break;
      case 'quill': sfx.play('quill', ev.pos, 0.8); break;
      case 'whistle': sfx.play('whistle', ev.pos, 0.6); break;
      case 'cane': sfx.play('cane', ev.pos); sfx.play('oof', ev.pos, 0.8); renderer.caneSwing(s.grandmaId, s.selfId); break;
      case 'shove': sfx.play('oof', ev.pos); break;
      case 'wish-done': sfx.play('ding'); break;
      case 'specs-off': sfx.play('clink', ev.pos); break;
      case 'lightning': setTimeout(() => sfx.play('thunder'), 400 + Math.random() * 800); break;
      case 'summon': sfx.play('summon', ev.pos); break;
      case 'moment': sfx.play('pop', undefined, 0.6); break;
      case 'will':
        if (!this.isGrandma && ev.via !== 'parchment' && gpos) sfx.play(ev.via === 'bless' ? 'bless' : 'tut', gpos, 0.7);
        break;
      case 'found': this.found.set(ev.item, false); sfx.play('pop'); break;
      default: break;
    }
  }

  // ───────────── frame ─────────────

  frame(dt: number): void {
    const { state: s, input, renderer, hud, sfx, voice } = this.d;
    const now = this.d.serverNow();
    const t = localSec();
    input.frame(dt);
    if (this.isGrandma) input.pitch = clamp(input.pitch, -1.2, 1.2);
    else input.pitch = clamp(input.pitch, -1.05, 0.75);
    this.shoveCd = Math.max(0, this.shoveCd - dt);
    // Real elapsed time, not the frame's capped dt: a slow frame still sends its
    // share of inputs (up to 8), so the input rate holds even at low frame rates.
    const nowMs = performance.now();
    this.tickAcc = Math.min(this.tickAcc + Math.min(0.5, (nowMs - this.tickClock) / 1000), 8 / TICK_HZ);
    this.tickClock = nowMs;
    while (this.tickAcc >= 1 / TICK_HZ) { this.tickAcc -= 1 / TICK_HZ; this.tick(); }
    const view = s.view(now, dt, input.yaw, input.pitch);
    if (this.needYaw && view.self) { input.yaw = view.self.yaw; input.pitch = 0; this.needYaw = false; }
    this.lastView = view;

    // Cane swing animation for remote viewers (cooldown jumps up when she swings).
    const g = view.grandma;
    if (g && (g.caneCooldown ?? 0) > this.prevCane + 0.5) renderer.caneSwing(s.grandmaId, s.selfId);
    this.prevCane = g?.caneCooldown ?? 0;

    renderer.frame({
      view, selfId: s.selfId, role: s.role, yaw: input.yaw, pitch: input.pitch, dt, time: t,
      dark: s.dark, flash: s.flash, wishKind: s.wish?.kind ?? null, found: this.found,
      level: (id) => voice.level(id), parchment: this.parchmentOpen || s.phase !== 'visit',
      cinematic: s.phase === 'reading' || s.phase === 'vote' || s.phase === 'results',
    });

    // Grandma's Bless/Tut target: crosshair first, else the locked name.
    if (this.isGrandma) {
      const aim = renderer.pickCousin(s.selfId, s.grandmaId, 10);
      const locked = this.lockedId();
      this.target = aim ? { id: aim, via: 'aim' } : locked ? { id: locked, via: 'locked' } : null;
    } else this.target = null;

    if (hud.wheel.isOpen) hud.wheel.point(input.cursor.x, input.cursor.y, input.digit());

    const me = view.self;
    const whisper = input.whispering();
    const camPos = renderer.camera.position;
    hud.frame({
      state: s, view, now, t, dt, project: (p) => renderer.project(p), whisper, talking: voice.level('self'),
      micOk: this.d.micOk(), shoveCd: this.shoveCd, target: this.target, locked: this.isGrandma ? this.lockedId() : null,
      device: input.lastDevice, pointerLocked: input.locked,
    }, {
      ids: [...view.chars.keys()], selfId: s.selfId, headPos: (id) => renderer.headPos(id), project: (p) => renderer.project(p),
      showTags: !this.isGrandma, name: (id) => s.name(id), color: (id) => s.cousin(id)?.color ?? '#ddd',
      sleeping: (id) => view.chars.get(id)?.state === 'sleeping', camPos: { x: camPos.x, y: camPos.y, z: camPos.z },
    });

    // Audio listener + voice positions.
    const live = s.phase === 'visit' || s.phase === 'intermission' || s.phase === 'roles';
    const lp: Vec3 = me ? me.pos : { x: 0, y: 0, z: 0 };
    const role = live && s.role ? s.role : 'lobby';
    const aid = !!me?.aidActive;
    sfx.setListener(this.isGrandma ? lp : { x: camPos.x, y: camPos.y - 1.6, z: camPos.z }, input.yaw, role, aid);
    voice.update({
      selfRole: role, listenerPos: { x: lp.x, y: lp.y + 1.6, z: lp.z }, listenerYaw: input.yaw, aidActive: aid,
      speakers: [...view.chars.values()].filter((c) => c.id !== s.selfId).map((c) => ({ id: c.id, pos: { x: c.pos.x, y: c.pos.y + 1.6, z: c.pos.z }, whispering: c.whispering })),
    });
    if (s.phase === 'visit') this.footsteps(view, dt);

    // A cousin may take over if Grandma drops.
    // (`live` above: roles, visit or intermission.)
    const gDown = !this.isGrandma && live && g?.state === 'sleeping';
    show(this.takeover, gDown);
    if (gDown) this.takeover.textContent = 'Nana has nodded off (disconnected). Press J to take over as Grandma.';
  }

  private footsteps(view: View, dt: number): void {
    const { sfx, state: s } = this.d;
    const me = view.self;
    const here = me?.pos;
    for (const c of view.chars.values()) {
      let tr = this.steps.get(c.id);
      if (!tr) { tr = { acc: 0, last: 0 }; this.steps.set(c.id, tr); }
      const speed = Math.hypot(c.vel.x, c.vel.z);
      if (c.state !== 'normal' || Math.abs(c.vel.y) > 1 || speed < 0.6) { tr.acc = 0.6; continue; }
      const stride = c.running ? 1.05 : c.role === 'grandma' ? 0.55 : 0.8;
      tr.acc += (speed * dt) / stride;
      if (tr.acc < 1) continue;
      tr.acc -= 1;
      tr.last ^= 1;
      const range = (c.sneaking ? COUSIN.footstepRangeSneak : c.running ? COUSIN.footstepRangeRun : COUSIN.footstepRangeWalk) * (c.leader ? COUSIN.leaderFootstepFactor : 1);
      const mine = c.id === s.selfId;
      if (!mine && here && dist(here, c.pos) > range + 2) continue;
      const gain = (c.sneaking ? 0.2 : c.running ? 0.9 : 0.55) * (mine ? 0.5 : 1);
      if (c.role === 'grandma' && tr.last) sfx.play('cane', c.pos, 0.25);
      else sfx.play('step', c.pos, gain);
    }
  }
}
