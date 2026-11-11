// In-match HUD controller: owns the role HUD, top bar, toasts, bubbles,
// wheels, chat, the full parchment, the phase overlays, first-visit coaching,
// captions and the floating feedback words; turns game events into toasts,
// bubbles, pings, captions and effects (the shove gesture and whoosh, a
// crash's shake and "Nana heard that!"). The settings gear lives here too and
// shows on every screen.
import { QUICKCHAT, VOICE } from '../../../shared/constants.js';
import type { GameEvent } from '../../../shared/protocol.js';
import { dist, flatDist, hearingBand } from '../../../shared/senses.js';
import type { Vec3 } from '../../../shared/types.js';
import { LOUDNESS, RANGE, Sfx } from '../audio/sfx.js';
import type { SfxKind } from '../audio/synth.js';
import { cueShake } from '../render/camera.js';
import { cuePush, setBandPatterns } from '../render/characters.js';
import type { Settings, SettingsData } from '../settings.js';
import type { GameState, View } from '../state.js';
import { el, setText, show } from '../util.js';
import type { BubbleFrame } from './bubbles.js';
import { Bubbles } from './bubbles.js';
import { Captions, whereFrom } from './captions.js';
import { ChatBox } from './chat.js';
import { Coach, type CoachState } from './coach.js';
import { CousinHud } from './cousin.js';
import { Floats } from './floats.js';
import { GrandmaHud } from './grandma.js';
import { cleanText, nameOf } from './ident.js';
import { FullParchment } from './parchment.js';
import { COUSIN_KEYS, GRANDMA_KEYS, Intermission, RoleReveal, VoteScreen } from './phases.js';
import { ReadingScreen, ResultsScreen } from './reading.js';
import type { ReplayView } from '../render/scene.js';
import type { SurveyAnswer, SurveyQuestion } from '../../../shared/protocol.js';
import { SettingsPanel } from './settings.js';
import { Toasts } from './toasts.js';
import { TopBar } from './topbar.js';
import { panelRects, type HudFrame, type Rect } from './types.js';
import { Wheel } from './wheel.js';

type Overlay = { root: HTMLElement; frame(s: GameState, now: number, t: number): void };

const REJECT_TEXT: Record<string, string> = {
  budget: "You've changed the will enough for one visit, dear.",
  rolling: 'Slow down! Give it a moment (rolling cap).',
  'zero-needs-parchment': 'Cutting someone off entirely needs the full parchment (Tab).',
  'no-room': "That can't go any further.",
  'unknown-target': 'Who?',
  'no-op': 'Nothing to change.',
};

/** Words a cousin sees float up over a smash this close (m). */
const CRASH_FLOAT_RANGE = 16;
/** A smash this close shakes the camera a little (unless reduced motion). */
const CRASH_SHAKE_RANGE = 6;

export class Hud {
  readonly toasts = new Toasts();
  readonly bubbles = new Bubbles();
  readonly wheel = new Wheel();
  readonly chat = new ChatBox();
  readonly captions = new Captions();
  readonly floats = new Floats();
  readonly settingsPanel: SettingsPanel;
  parchment: FullParchment | null = null;
  private top = new TopBar();
  private cousinHud: CousinHud | null = null;
  private grandmaHud: GrandmaHud | null = null;
  private coach: Coach | null = null;
  private roleRoot = el('div', 'role-hud');
  private overlay: Overlay | null = null;
  private overlayKey = '';
  private help = el('div', 'help-card');
  private hChip = el('button', 'h-chip hud-panel');
  private lockHint = el('div', 'lock-hint', 'Click to look around');
  private net = el('div', 'net-banner');
  private lastView: View | null = null;
  private lastPhase = '';
  /** Local seconds when the current visit began (for the coach). */
  private visitStart = 0;
  private prevShoveCd = 0;
  private lastShoveShownAt = -Infinity;
  private prevParchment = false;
  private prevStolen = false;
  private rects: Rect[] = [];
  private rectsAt = 0;
  private prefs: SettingsData | null = null;
  private store: Settings | null = null;
  onVote: (id: string) => void = () => {};
  onSurvey: (q: SurveyQuestion, a: SurveyAnswer) => void = () => {};
  onParchmentSet: (target: string, value: number) => void = () => {};

  constructor(private hudRoot: HTMLElement, labels: HTMLElement, private overlayRoot: HTMLElement, private s: GameState) {
    this.hChip.type = 'button';
    this.hChip.innerHTML = '<kbd>H</kbd><span>Controls</span>';
    this.hChip.title = 'Show the controls (H)';
    this.hChip.addEventListener('click', () => this.toggleHelp());
    hudRoot.append(this.roleRoot, this.top.root, this.toasts.root, this.chat.root, this.lockHint, this.help, this.hChip, this.captions.root);
    labels.append(this.bubbles.root, this.floats.root);
    overlayRoot.append(this.wheel.root);
    document.body.appendChild(this.net);
    show(this.help, false);
    show(this.net, false);
    this.bubbles.itemOf = (id) => s.cousin(id)?.item;
    this.settingsPanel = new SettingsPanel(() => this.store);
    this.settingsPanel.canOpenWithEscape = () => this.s.inMatch && !this.wheel.isOpen && !this.parchment?.isOpen && !this.chat.isOpen;
  }

  /** Player settings: the settings panel edits them; the HUD applies the ones it owns. */
  get settings(): Settings | null { return this.store; }
  set settings(st: Settings | null) {
    this.store = st;
    if (!st) return;
    st.onChange((d) => this.applySettings(d));
    this.applySettings(st.get());
  }

  private applySettings(d: SettingsData): void {
    this.prefs = d;
    document.body.classList.toggle('reduced-motion', d.reducedMotion);
    this.floats.calm = d.reducedMotion;
    document.body.classList.toggle('band-patterns', d.bandPatterns);
    setBandPatterns(d.bandPatterns);
    this.captions.enabled = d.captions;
    if (!d.captions) this.captions.clear();
  }

  setNet(status: string): void {
    show(this.net, status === 'reconnecting' || status === 'connecting');
    setText(this.net, status === 'reconnecting' ? 'Connection lost - reconnecting...' : 'Connecting...');
  }

  startMatch(): void {
    this.endMatch();
    const m = this.s.match;
    if (!m) return;
    if (m.role === 'grandma') {
      this.grandmaHud = new GrandmaHud(m.cousins, m.prefCards ?? []);
      this.roleRoot.appendChild(this.grandmaHud.root);
      this.parchment = new FullParchment(m.cousins, this.s.name(m.grandmaId));
      this.parchment.onSet = (t, v) => this.onParchmentSet(t, v);
      this.overlayRoot.appendChild(this.parchment.root);
    } else {
      const me = m.cousins.find((c) => c.id === this.s.selfId) ?? m.cousins[0];
      this.cousinHud = new CousinHud(me, m.cousins);
      this.roleRoot.appendChild(this.cousinHud.root);
    }
    this.coach = new Coach(m.role);
    (this.cousinHud ?? this.grandmaHud)?.leftCol.appendChild(this.coach.root);
    this.help.innerHTML = '';
    this.help.append(el('div', 'pref-title', 'Controls (H to close)'), el('div', 'help-keys', m.role === 'grandma' ? GRANDMA_KEYS : COUSIN_KEYS),
      el('div', 'help-keys', 'Gamepad: left stick move, right stick look. ' + (m.role === 'grandma'
        ? 'RB Bless, LB Tut, D-pad left/right lock name, View parchment, RT cane, LT hearing aid, Y spectacles, B summon, X pin, R3 quick-chat wheel.'
        : 'L3 run, B sneak, A jump, RT grab, RB throw, X shove, Y interact, D-pad down plant, LB compliment wheel, D-pad up tattle, LT whisper.')),
      el('div', 'help-keys muted', 'Esc: settings (press it twice while the mouse is captured).'));
    this.prevShoveCd = 0;
    this.prevParchment = false;
    this.prevStolen = false;
    this.lastPhase = '';
  }

  endMatch(): void {
    this.cousinHud?.root.remove();
    this.grandmaHud?.root.remove();
    this.parchment?.root.remove();
    this.cousinHud = this.grandmaHud = null;
    this.parchment = null;
    this.coach = null;
    this.setOverlay(null, '');
    this.toasts.clear();
    this.bubbles.clear();
    this.floats.clear();
    this.captions.clear();
    if (this.wheel.isOpen) this.wheel.close();
    this.chat.close();
  }

  /** Hide every in-match element (title/lobby screens). */
  setVisible(on: boolean): void { show(this.hudRoot, on); show(this.overlayRoot, on); }

  toggleHelp(): void { show(this.help, this.help.style.display === 'none'); }

  openWheel(kind: 'quick' | 'tattle'): void {
    const s = this.s;
    if (kind === 'quick') {
      const lines = s.role === 'grandma' ? QUICKCHAT.grandma : QUICKCHAT.cousin;
      this.wheel.open('quick', 'Say...', lines.map((l) => ({ label: l })));
      this.coach?.note('quick');
    } else {
      const others = (s.match?.cousins ?? []).filter((c) => c.id !== s.selfId);
      this.wheel.open('tattle', 'Tattle on...', others.map((c) => ({ label: nameOf(s, c.id), color: c.color })));
    }
  }

  /** Close the wheel; returns what was picked. */
  closeWheel(): { kind: 'quick' | 'tattle'; line?: number; accused?: string } | null {
    const kind = this.wheel.kind;
    const i = this.wheel.close();
    if (i < 0) return null;
    if (kind === 'quick') return { kind, line: i };
    const others = (this.s.match?.cousins ?? []).filter((c) => c.id !== this.s.selfId);
    return others[i] ? { kind, accused: others[i].id } : null;
  }

  onEvent(ev: GameEvent): void {
    const s = this.s;
    const me = s.selfId;
    const g = s.role === 'grandma';
    const t = this.toasts;
    const nm = (id: string) => nameOf(s, id);
    switch (ev.e) {
      case 'bubble':
        // Grandma: an unseen speaker comes as from '' with a rough `pos` (the bubble floats
        // there). With neither, there is nowhere to float it: an unattributed line instead.
        if (ev.from || ev.pos) this.bubbles.add(ev.from, ev.text, ev.quick, ev.whisper, ev.pos);
        else if (!this.captions.enabled) t.push(`Someone says: “${ev.text}”`, 'info', 3);
        this.captionSpeech(ev);
        break;
      case 'will': {
        if (g && (ev.via === 'bless' || ev.via === 'tut')) this.coach?.note(ev.via);
        // Parchment edits show on the will itself; a takeover has its own server notice.
        if (ev.via !== 'bless' && ev.via !== 'tut') break;
        const n = Math.abs(ev.moved);
        const name = ev.target === me ? 'you' : nm(ev.target);
        const why = ev.reason ? ` (${ev.reason})` : '';
        if (g) t.push(ev.via === 'bless' ? `Blessed ${name} +${n}${why}` : `Tutted at ${name} -${n}${why}`, ev.via === 'bless' ? 'good' : 'bad', 2.5);
        else t.push(ev.via === 'bless' ? `Nana blesses ${name} (+${n})${why}` : `Nana tuts at ${name} (-${n})${why}`, ev.target === me ? (ev.via === 'bless' ? 'good' : 'bad') : 'info', 3);
        break;
      }
      case 'will-rejected':
        // With the full parchment open, the sheet says it in one line instead (review P7).
        if (this.parchment?.isOpen) this.parchment.rejected(ev.reason);
        else t.push(REJECT_TEXT[ev.reason] ?? ev.reason, 'warn', 3);
        break;
      case 'wish': if (ev.wish) t.push(g ? `You fancy: ${ev.wish.text}` : `Nana wishes: ${ev.wish.text}`, 'info', 4); break;
      case 'wish-done':
        t.push(ev.by === me ? 'You granted Nana\'s wish!' : `${nm(ev.by)} granted Nana's wish!`, ev.by === me ? 'good' : 'info', 4);
        this.captions.sound('Ding! A wish granted', 3);
        break;
      case 'found': {
        const c = s.cousin(ev.owner);
        t.push(`You found ${c ? `${nm(c.id)}'s ${c.itemName}` : 'something'}! What is THAT doing here?`, 'warn', 5);
        break;
      }
      case 'tattle':
        if (g) t.push(`${nm(ev.from)} tattles: it was ${nm(ev.accused)}!`, 'warn', 4);
        else if (ev.accused === me) t.push(`${nm(ev.from)} tattled on you!`, 'bad', 4);
        break;
      case 'summon':
        t.push(g ? 'You ring for the family. Who comes running?' : 'Nana summons everyone to her side!', 'warn', 4);
        this.soundCaption('summon', ev.pos, "Nana's bell");
        break;
      case 'summon-ignored': if (ev.ids.length) t.push(`Ignored your summons: ${ev.ids.map(nm).join(', ')}`, 'bad', 5); break;
      case 'shove':
        // Everyone sees the shover's arms go out when a shove lands (Grandma only if she saw who).
        if (ev.by && ev.by !== me) cuePush(ev.by);
        // Our own shove that the server held over from a press near the end of the cooldown
        // (COUSIN.shoveBuffer): the press itself showed nothing, so show it as it lands.
        if (ev.by === me && performance.now() - this.lastShoveShownAt > 600) this.showOwnShove();
        if (ev.victim === me) t.push(ev.by ? `Shoved by ${nm(ev.by)}!` : 'Shoved!', 'bad', 2.5);
        if (ev.by === me && ev.victim) this.floats.add('SHOVED!', 'hit', this.headOf(ev.victim, ev.pos), 1.2, 30);
        this.soundCaption('oof', ev.pos, 'Oof!');
        break;
      case 'cane':
        if (ev.victim === me) t.push("Nana's cane! Ouch.", 'bad', 2.5);
        this.soundCaption('cane', ev.pos, 'Cane whack!');
        break;
      case 'specs-off':
        t.push(g ? 'Your spectacles! Knocked clean off!' : "Nana's spectacles went flying!", g ? 'bad' : 'info', 3);
        this.soundCaption('clink', ev.pos, 'Clink: spectacles');
        break;
      case 'whistle': this.soundCaption('whistle', ev.pos, 'Hearing-aid whistle'); break;
      case 'quill': this.soundCaption('quill', ev.pos, 'Quill scratching'); break;
      case 'lightning': this.captions.sound('Thunder', 3); break;
      case 'crash':
        this.grandmaHud?.crash(ev.pos, !!ev.favourite);
        if (ev.favourite) t.push('MY FAVOURITE! Who did that?!', 'bad', 4);
        this.crashFeedback(ev.pos);
        break;
      case 'moment': t.push(cleanText(ev.moment.text), 'moment', 5); break;
      case 'toast': t.push(cleanText(ev.text), 'info', 4); break;
      default: break;
    }
  }

  /** Where to float a word over someone: their head if we have it, else the event position. */
  private headOf(id: string, fallback: Vec3): Vec3 {
    const c = this.lastView?.chars.get(id);
    const p = c?.pos ?? fallback;
    return { x: p.x, y: p.y + 2.1, z: p.z };
  }

  /** A smash: the thrower and anyone near get a "CRASH!", a jolt, and know whether Nana heard (review P9). */
  private crashFeedback(pos: Vec3): void {
    const view = this.lastView;
    const me = view?.self;
    if (!me) return;
    const d = dist(me.pos, pos);
    this.captions.sound(`Crash! ${whereFrom(me.pos, me.yaw, pos)}`, 4);
    if (this.s.role === 'grandma') return;
    // Above the dust cloud, not on it.
    if (d < CRASH_FLOAT_RANGE) this.floats.add('CRASH!', d < CRASH_SHAKE_RANGE ? 'crash big' : 'crash', { x: pos.x, y: pos.y + 1.6, z: pos.z }, 1.6, 40);
    if (d < CRASH_SHAKE_RANGE && !this.prefs?.reducedMotion) cueShake(0.05 + 0.17 * (1 - d / CRASH_SHAKE_RANGE));
    const g = view?.grandma;
    const sense = this.s.senseOf(g ?? null);
    if (g && sense) {
      const band = hearingBand(dist(g.pos, pos) / (LOUDNESS.crash ?? 1), sense.aidActive);
      if (band !== 'silent') this.cousinHud?.nanaHeard(band === 'clear' ? 'Nana heard that!' : 'Nana heard that (muffled)');
    }
  }

  /** Caption a sound if this player could hear it (cousins: the effect's range; Grandma: her ears). */
  private soundCaption(kind: SfxKind, pos: Vec3, text: string): void {
    const me = this.lastView?.self;
    if (!me) { this.captions.sound(text); return; }
    const d = dist(me.pos, pos);
    if (this.s.role === 'grandma') {
      if (hearingBand(d / (LOUDNESS[kind] ?? 1), !!me.aidActive) === 'silent') return;
    } else {
      const range = RANGE[kind];
      if (range !== undefined && d > range) return;
    }
    this.captions.sound(`${text} ${d < 2.5 ? '' : `(${whereFrom(me.pos, me.yaw, pos)})`}`.trim());
  }

  /** Caption a line of speech as this player heard it. */
  private captionSpeech(ev: Extract<GameEvent, { e: 'bubble' }>): void {
    const s = this.s;
    const me = this.lastView?.self;
    if (!ev.from) {
      // Grandma could not see who spoke: say only where it came from.
      const where = me && ev.pos ? whereFrom(me.pos, me.yaw, ev.pos) : '';
      if (ev.text === '…' || ev.text === '...') this.captions.sound(`Mumbling${where ? `, ${where}` : ''}`);
      else this.captions.speech(`Someone${where ? `, ${where}` : ''}`, ev.text, { whisper: ev.whisper });
      return;
    }
    const speaker = this.lastView?.chars.get(ev.from);
    if (ev.whisper && ev.from !== s.selfId && me && speaker && dist(me.pos, speaker.pos) > VOICE.whisperRange + 0.5) return;
    if (ev.text === '…' || ev.text === '...') { this.captions.sound(`${nameOf(s, ev.from)} mumbles`); return; }
    const who = ev.from === s.selfId ? 'You' : ev.from === s.grandmaId ? 'Nana' : nameOf(s, ev.from);
    this.captions.speech(who, ev.text, { whisper: ev.whisper, color: s.cousin(ev.from)?.color });
  }

  /** While What Nana Saw plays at the reading: the frame to draw instead of the usual shot. */
  replayView(): ReplayView | null {
    return this.overlay instanceof ReadingScreen ? this.overlay.replayView() : null;
  }

  private setOverlay(o: Overlay | null, key: string): void {
    if (key === this.overlayKey) return;
    if (o) this.toasts.clear();
    this.overlay?.root.remove();
    this.overlay = o;
    this.overlayKey = key;
    if (o) this.overlayRoot.appendChild(o.root);
  }

  /** Pick the phase overlay for the current phase. */
  private syncOverlay(): void {
    const s = this.s;
    switch (s.phase) {
      case 'roles': this.setOverlay(new RoleReveal(s), 'roles'); break;
      case 'intermission': this.setOverlay(new Intermission(s), `int-${s.visit}`); break;
      case 'reading': if (s.reading) this.setOverlay(new ReadingScreen(s, s.reading), 'reading'); break;
      case 'vote': this.setOverlay(new VoteScreen(s, (id) => this.onVote(id)), 'vote'); break;
      case 'results': if (s.results) this.setOverlay(new ResultsScreen(s, s.results, (q, a) => this.onSurvey(q, a)), 'results'); break;
      default: this.setOverlay(null, ''); break;
    }
  }

  /** What the coach looks at this frame. */
  private coachState(f: HudFrame): CoachState {
    const s = this.s;
    const me = f.view.self;
    const g = f.view.grandma;
    let markNear = false, cousinNear = false, holdingStolen = false;
    if (me && s.role === 'cousin') {
      const props = [...f.view.props.values()];
      for (const o of f.view.chars.values()) {
        if (o.id === me.id || o.role !== 'cousin' || o.state === 'sleeping' || Math.abs(o.pos.y - me.pos.y) > 1.2) continue;
        const d = flatDist(me.pos, o.pos);
        if (d < 3) cousinNear = true;
        const it = props.find((p) => p.kind === 'item' && p.owner === o.id);
        if (d < 4 && it && it.heldBy === o.id && o.holding !== it.id) markNear = true;
      }
      const held = me.holding ? f.view.props.get(me.holding) : undefined;
      holdingStolen = held?.kind === 'item' && !!held.owner && held.owner !== s.selfId;
    }
    return {
      role: s.role ?? 'cousin', visitT: f.t - this.visitStart, device: f.device,
      nanaDist: me && g ? flatDist(me.pos, g.pos) : Infinity, markNear, cousinNear, holdingStolen,
      aidOrSpecs: !!me?.aidActive || !!me?.specsActive,
    };
  }

  /** Our own shove: the arms go out and the air whooshes, whether or not it hits. */
  private showOwnShove(): void {
    this.lastShoveShownAt = performance.now();
    cuePush(this.s.selfId);
    Sfx.main?.play('whoosh', undefined, 0.8);
  }

  /** Feedback for the player's own actions this frame (review P12) and notes for the coach. */
  private actionFeedback(f: HudFrame): void {
    const s = this.s;
    const me = f.view.self;
    if (s.role === 'cousin') {
      // The shove cooldown jumps up the moment a shove goes out: show it, hit or miss.
      if (f.shoveCd > this.prevShoveCd + 0.3) {
        this.showOwnShove();
        this.coach?.note('shove');
        if (!this.cousinHud?.shoveTargetId) this.floats.add('whiff', 'whiff', null, 0.9, 24);
      }
      const held = me?.holding ? f.view.props.get(me.holding) : undefined;
      const stolen = held?.kind === 'item' && !!held.owner && held.owner !== s.selfId;
      if (stolen && !this.prevStolen) this.coach?.note('pinch');
      this.prevStolen = stolen;
      if ((me?.plant ?? 0) > 0) this.coach?.note('plant');
    }
    this.prevShoveCd = f.shoveCd;
    const open = !!this.parchment?.isOpen;
    if (open && !this.prevParchment) this.coach?.note('parchment');
    this.prevParchment = open;
  }

  frame(f: HudFrame, bubbles: BubbleFrame): void {
    const s = this.s;
    this.lastView = f.view;
    this.syncOverlay();
    if (s.phase !== this.lastPhase) {
      if (s.phase === 'visit') this.visitStart = f.t;
      this.lastPhase = s.phase;
    }
    const live = s.phase === 'visit' || s.phase === 'roles' || s.phase === 'intermission';
    const visit = s.phase === 'visit';
    show(this.roleRoot, visit);
    show(this.top.root, live);
    show(this.hChip, live);
    const nowMs = performance.now();
    if (nowMs - this.rectsAt > 300) {
      this.rectsAt = nowMs;
      this.rects = [...panelRects(this.hudRoot, '.hud-panel', 30), ...panelRects(document.body, '.gear-btn', 30)];
    }
    if (visit) {
      this.cousinHud?.frame(f, bubbles.headPos, this.rects);
      this.grandmaHud?.frame(f, this.rects);
      this.parchment?.frame(s.shares, s.willAvail);
      this.actionFeedback(f);
      this.coach?.frame(this.coachState(f), f.dt);
    }
    this.top.frame(s, f.now);
    this.overlay?.frame(s, f.now, f.t);
    // A phase card owns the screen: no toasts, bubbles or floating words bleeding through it.
    show(this.toasts.root, !this.overlay);
    show(this.bubbles.root, !this.overlay);
    show(this.floats.root, !this.overlay);
    show(this.captions.root, !this.overlay);
    // With the full parchment open, notices move to the right, clear of the sheet.
    this.toasts.root.classList.toggle('side', !!this.parchment?.isOpen);
    this.toasts.frame();
    if (!this.overlay) this.bubbles.frame(bubbles);
    this.floats.frame(f.project, window.innerWidth, window.innerHeight);
    this.captions.frame();
    const needLock = visit && !f.pointerLocked && f.device === 'kbm' && !this.parchment?.isOpen && !this.chat.isOpen && !this.settingsPanel.isOpen && s.role === 'grandma';
    show(this.lockHint, needLock);
  }
}
