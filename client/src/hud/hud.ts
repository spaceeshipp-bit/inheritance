// In-match HUD controller: owns the role HUD, top bar, toasts, bubbles,
// wheels, chat, the full parchment and the phase overlays; turns game events
// into toasts, bubbles and pings.
import { QUICKCHAT } from '../../../shared/constants.js';
import type { GameEvent } from '../../../shared/protocol.js';
import type { Settings } from '../settings.js';
import type { GameState } from '../state.js';
import { el, setText, show } from '../util.js';
import type { BubbleFrame } from './bubbles.js';
import { Bubbles } from './bubbles.js';
import { ChatBox } from './chat.js';
import { CousinHud } from './cousin.js';
import { GrandmaHud } from './grandma.js';
import { FullParchment } from './parchment.js';
import { COUSIN_KEYS, GRANDMA_KEYS, Intermission, RoleReveal, VoteScreen } from './phases.js';
import { ReadingScreen, ResultsScreen } from './reading.js';
import { Toasts } from './toasts.js';
import { TopBar } from './topbar.js';
import type { HudFrame } from './types.js';
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

export class Hud {
  readonly toasts = new Toasts();
  readonly bubbles = new Bubbles();
  readonly wheel = new Wheel();
  readonly chat = new ChatBox();
  parchment: FullParchment | null = null;
  private top = new TopBar();
  private cousinHud: CousinHud | null = null;
  private grandmaHud: GrandmaHud | null = null;
  private roleRoot = el('div', 'role-hud');
  private overlay: Overlay | null = null;
  private overlayKey = '';
  private help = el('div', 'help-card');
  private lockHint = el('div', 'lock-hint', 'Click to look around');
  private net = el('div', 'net-banner');
  /** Player settings (the settings panel reads and writes these). */
  settings: Settings | null = null;
  onVote: (id: string) => void = () => {};
  onParchmentSet: (target: string, value: number) => void = () => {};

  constructor(private hudRoot: HTMLElement, labels: HTMLElement, private overlayRoot: HTMLElement, private s: GameState) {
    hudRoot.append(this.roleRoot, this.top.root, this.toasts.root, this.chat.root, this.lockHint, this.help);
    labels.appendChild(this.bubbles.root);
    overlayRoot.append(this.wheel.root);
    document.body.appendChild(this.net);
    show(this.help, false);
    show(this.net, false);
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
    this.help.innerHTML = '';
    this.help.append(el('div', 'pref-title', 'Controls (H to close)'), el('div', 'help-keys', m.role === 'grandma' ? GRANDMA_KEYS : COUSIN_KEYS),
      el('div', 'help-keys', 'Gamepad: left stick move, right stick look. ' + (m.role === 'grandma'
        ? 'RB Bless, LB Tut, D-pad left/right lock name, View parchment, RT cane, LT hearing aid, Y spectacles, B summon, X pin, R3 quick-chat wheel.'
        : 'L3 run, B sneak, A jump, RT grab, RB throw, X shove, Y interact, D-pad down plant, LB compliment wheel, D-pad up tattle, LT whisper.')));
  }

  endMatch(): void {
    this.cousinHud?.root.remove();
    this.grandmaHud?.root.remove();
    this.parchment?.root.remove();
    this.cousinHud = this.grandmaHud = null;
    this.parchment = null;
    this.setOverlay(null, '');
    this.toasts.clear();
    this.bubbles.clear();
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
    } else {
      const others = (s.match?.cousins ?? []).filter((c) => c.id !== s.selfId);
      this.wheel.open('tattle', 'Tattle on...', others.map((c) => ({ label: c.name, color: c.color })));
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
    switch (ev.e) {
      case 'bubble': this.bubbles.add(ev.from, ev.text, ev.quick, ev.whisper); break;
      case 'will': {
        if (ev.via === 'parchment') break;
        const n = Math.abs(ev.moved);
        const name = ev.target === me ? 'you' : s.name(ev.target);
        const why = ev.reason ? ` (${ev.reason})` : '';
        if (g) t.push(ev.via === 'bless' ? `Blessed ${name} +${n}${why}` : `Tutted at ${name} -${n}${why}`, ev.via === 'bless' ? 'good' : 'bad', 2.5);
        else t.push(ev.via === 'bless' ? `Nana blesses ${name} (+${n})${why}` : `Nana tuts at ${name} (-${n})${why}`, ev.target === me ? (ev.via === 'bless' ? 'good' : 'bad') : 'info', 3);
        break;
      }
      case 'will-rejected':
        t.push(REJECT_TEXT[ev.reason] ?? ev.reason, 'warn', 3);
        this.parchment?.rejected();
        break;
      case 'wish': if (ev.wish) t.push(g ? `You fancy: ${ev.wish.text}` : `Nana wishes: ${ev.wish.text}`, 'info', 4); break;
      case 'wish-done': t.push(ev.by === me ? 'You granted Nana\'s wish!' : `${s.name(ev.by)} granted Nana's wish!`, ev.by === me ? 'good' : 'info', 4); break;
      case 'found': {
        const c = s.cousin(ev.owner);
        t.push(`You found ${c?.name ?? '?'}'s ${c?.itemName ?? 'item'}! What is THAT doing here?`, 'warn', 5);
        break;
      }
      case 'tattle':
        if (g) t.push(`${s.name(ev.from)} tattles: it was ${s.name(ev.accused)}!`, 'warn', 4);
        else if (ev.accused === me) t.push(`${s.name(ev.from)} tattled on you!`, 'bad', 4);
        break;
      case 'summon': t.push(g ? 'You ring for the family. Who comes running?' : 'Nana summons everyone to her side!', 'warn', 4); break;
      case 'summon-ignored': if (ev.ids.length) t.push(`Ignored your summons: ${ev.ids.map((i) => s.name(i)).join(', ')}`, 'bad', 5); break;
      case 'shove': if (ev.victim === me) t.push(`Shoved by ${s.name(ev.by)}!`, 'bad', 2.5); break;
      case 'cane': if (ev.victim === me) t.push("Nana's cane! Ouch.", 'bad', 2.5); break;
      case 'specs-off': t.push(g ? 'Your spectacles! Knocked clean off!' : "Nana's spectacles went flying!", g ? 'bad' : 'info', 3); break;
      case 'crash':
        this.grandmaHud?.crash(ev.pos, !!ev.favourite);
        if (ev.favourite) t.push('MY FAVOURITE! Who did that?!', 'bad', 4);
        break;
      case 'moment': t.push(`${ev.moment.text}`, 'moment', 5); break;
      case 'toast': t.push(ev.text, 'info', 4); break;
      default: break;
    }
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
      case 'results': if (s.results) this.setOverlay(new ResultsScreen(s, s.results), 'results'); break;
      default: this.setOverlay(null, ''); break;
    }
  }

  frame(f: HudFrame, bubbles: BubbleFrame): void {
    const s = this.s;
    this.syncOverlay();
    const live = s.phase === 'visit' || s.phase === 'roles' || s.phase === 'intermission';
    show(this.roleRoot, s.phase === 'visit');
    show(this.top.root, live);
    if (s.phase === 'visit') {
      this.cousinHud?.frame(f);
      this.grandmaHud?.frame(f);
      this.parchment?.frame(s.shares, s.willAvail);
    }
    this.top.frame(s, f.now);
    this.overlay?.frame(s, f.now, f.t);
    // A phase card owns the screen: no toasts or bubbles bleeding through it.
    show(this.toasts.root, !this.overlay);
    show(this.bubbles.root, !this.overlay);
    this.toasts.frame();
    if (!this.overlay) this.bubbles.frame(bubbles);
    const needLock = s.phase === 'visit' && !f.pointerLocked && f.device === 'kbm' && !this.parchment?.isOpen && !this.chat.isOpen && s.role === 'grandma';
    show(this.lockHint, needLock);
  }
}
