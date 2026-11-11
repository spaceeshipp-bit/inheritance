// First-visit coaching (review P3): short prompts that turn up when they are
// useful ("Stand next to a cousin and press E..."), one at a time, each shown
// once per browser. Remembered in localStorage when the browser allows it;
// a private window just shows them again. ?coach=reset forgets them.
import type { Role } from '../../../shared/types.js';
import { el } from '../util.js';
import { ICONS } from './icons.js';

/** What the HUD knows this frame that a tip may care about. */
export interface CoachState {
  role: Role;
  /** Local seconds since this visit began. */
  visitT: number;
  device: 'kbm' | 'pad';
  /** Flat metres to Nana (cousins), Infinity if unknown. */
  nanaDist: number;
  /** Another cousin within a few steps whose signature item is still on them. */
  markNear: boolean;
  /** Another cousin within shoving distance-ish. */
  cousinNear: boolean;
  /** Holding someone else's signature item. */
  holdingStolen: boolean;
  /** Grandma's hearing aid or spectacles are on. */
  aidOrSpecs: boolean;
}

/** Things the player did since the last frame. */
export type CoachNote = 'quick' | 'pinch' | 'plant' | 'shove' | 'bless' | 'tut' | 'parchment';

export interface Tip {
  id: string;
  role: Role;
  /** Text with [key] caps, for mouse and keyboard and for a controller. */
  kbm: string;
  pad: string;
  when: (c: CoachState) => boolean;
  done: (c: CoachState, notes: ReadonlySet<CoachNote>) => boolean;
  /** Give up (and count it as seen) after this many seconds on screen. */
  maxShow: number;
}

export const TIPS: readonly Tip[] = [
  {
    id: 'c-nana', role: 'cousin', maxShow: 22,
    kbm: 'Nana is over there — walk up and press [Q] to compliment her',
    pad: 'Nana is over there — walk up and press [LB] to compliment her',
    when: () => true,
    done: (_c, n) => n.has('quick'),
  },
  {
    id: 'c-pinch', role: 'cousin', maxShow: 16,
    kbm: 'Stand next to a cousin and press [E] to pinch their signature item',
    pad: 'Stand next to a cousin and press [Y] to pinch their signature item',
    when: (c) => c.markNear && !c.holdingStolen,
    done: (c, n) => c.holdingStolen || n.has('pinch'),
  },
  {
    id: 'c-plant', role: 'cousin', maxShow: 16,
    kbm: 'Hold [G] to plant a stolen item',
    pad: 'Hold [D-pad down] to plant a stolen item',
    when: (c) => c.holdingStolen,
    done: (c, n) => n.has('plant') || !c.holdingStolen,
  },
  {
    id: 'c-shove', role: 'cousin', maxShow: 12,
    kbm: '[F] shoves — not where Nana can see',
    pad: '[X] shoves — not where Nana can see',
    when: (c) => c.cousinNear,
    done: (_c, n) => n.has('shove'),
  },
  {
    id: 'g-aim', role: 'grandma', maxShow: 20,
    kbm: 'Aim at a cousin: [E] Bless, [Q] Tut',
    pad: 'Aim at a cousin: [RB] Bless, [LB] Tut',
    when: () => true,
    done: (_c, n) => n.has('bless') || n.has('tut'),
  },
  {
    id: 'g-tab', role: 'grandma', maxShow: 14,
    kbm: '[Tab] opens the full will',
    pad: '[View] opens the full will',
    when: (c) => c.visitT > 5,
    done: (_c, n) => n.has('parchment'),
  },
  {
    id: 'g-senses', role: 'grandma', maxShow: 14,
    kbm: '[Right click] hearing aid; [F] spectacles',
    pad: '[LT] hearing aid; [Y] spectacles',
    when: (c) => c.visitT > 10,
    done: (c) => c.aidOrSpecs,
  },
];

const KEY = 'inheritance.coach.v1';
/** A tip on screen this long counts as seen even if the player ignores it. */
const SEEN_AFTER = 4;
/** Quiet time between two tips. */
const GAP = 2.5;
/** No tips in the first moment of a visit (let the player see the room first). */
const START_DELAY = 0.8;

function loadSeen(): Set<string> {
  try {
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('coach') === 'reset') localStorage.removeItem(KEY);
    const raw = localStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>): void {
  try { localStorage.setItem(KEY, JSON.stringify([...seen])); } catch { /* not remembered: shown again next time */ }
}

/**
 * The tip to show next for this role, if any: never one already seen, and the
 * role's first tip (how to get started) before any other; after it, whichever
 * tip the moment calls for, in list order.
 */
export function pickTip(role: Role, seen: ReadonlySet<string>, c: CoachState, notes: ReadonlySet<CoachNote> = new Set()): Tip | null {
  if (c.visitT < START_DELAY) return null;
  const mine = TIPS.filter((t) => t.role === role && !seen.has(t.id));
  const intro = TIPS.find((t) => t.role === role);
  const pool = intro && !seen.has(intro.id) ? [intro] : mine;
  return pool.find((t) => t.when(c) && !t.done(c, notes)) ?? null;
}

/** Render "[Q] does a thing" with key caps. */
export function tipHtmlParts(text: string): { key: boolean; text: string }[] {
  const out: { key: boolean; text: string }[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ key: false, text: text.slice(last, m.index) });
    out.push({ key: true, text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ key: false, text: text.slice(last) });
  return out;
}

export class Coach {
  /** A HUD panel: edge markers keep off it. */
  readonly root = el('div', 'coach hud-panel');
  private body = el('div', 'coach-text');
  private seen: Set<string>;
  private current: Tip | null = null;
  private shownFor = 0;
  private idleFor = GAP;
  private notes = new Set<CoachNote>();
  private device: 'kbm' | 'pad' | null = null;

  constructor(private role: Role) {
    this.seen = loadSeen();
    const head = el('div', 'coach-head');
    const ico = el('span', 'coach-ico');
    ico.innerHTML = ICONS.bulb;
    head.append(ico, el('span', '', 'First visit tip'));
    this.root.append(head, this.body);
    this.root.style.display = 'none';
  }

  /** Something the player did (wheel opened, Bless sent...). */
  note(n: CoachNote): void { this.notes.add(n); }

  /** The tip on screen now, if any (for tests and screenshots). */
  get active(): string | null { return this.current?.id ?? null; }

  frame(c: CoachState, dt: number): void {
    const notes = this.notes;
    this.notes = new Set();
    if (this.current) {
      const tip = this.current;
      this.shownFor += dt;
      if (this.shownFor >= SEEN_AFTER) this.markSeen(tip.id);
      if (tip.done(c, notes) || this.shownFor >= tip.maxShow) {
        this.markSeen(tip.id);
        this.current = null;
        this.idleFor = 0;
        this.root.style.display = 'none';
        return;
      }
      if (c.device !== this.device) this.render(tip, c.device);
      return;
    }
    this.idleFor += dt;
    if (this.idleFor < GAP) return;
    const next = pickTip(this.role, this.seen, c, notes);
    if (!next) return;
    this.current = next;
    this.shownFor = 0;
    this.render(next, c.device);
    this.root.style.display = '';
    this.root.classList.remove('enter');
    void this.root.offsetWidth;
    this.root.classList.add('enter');
  }

  private markSeen(id: string): void {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    saveSeen(this.seen);
  }

  private render(tip: Tip, device: 'kbm' | 'pad'): void {
    this.device = device;
    this.body.textContent = '';
    for (const p of tipHtmlParts(device === 'pad' ? tip.pad : tip.kbm)) {
      if (p.key) this.body.appendChild(el('kbd', '', p.text));
      else this.body.appendChild(document.createTextNode(p.text));
    }
  }
}
