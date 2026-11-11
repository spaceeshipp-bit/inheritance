// A list of cousins and their shares: the cousins' mini-will, Grandma's
// always-visible parchment, and the standings on the intermission screen.
import { WILL } from '../../../shared/constants.js';
import type { CousinInfo } from '../../../shared/types.js';
import { el, setStyle, setText, show } from '../util.js';
import { ICONS } from './icons.js';

interface Row { root: HTMLElement; name: HTMLElement; share: HTMLElement; bar: HTMLElement; arrow: HTMLElement; delta: HTMLElement; tag: HTMLElement }

export interface WillFrame {
  shares: Record<string, number>;
  changes: Record<string, { delta: number; at: number }>;
  /** Local seconds now (for fading change arrows). */
  t: number;
  self?: string;
  locked?: string | null;
  aim?: string | null;
}

export class WillList {
  readonly root: HTMLElement;
  private rows = new Map<string, Row>();
  private body = el('div', 'will-rows');
  private meters: { budget: HTMLElement; rolling: HTMLElement; bText: HTMLElement; rText: HTMLElement } | null = null;

  constructor(cls: string, title: string, cousins: CousinInfo[], withMeters: boolean) {
    this.root = el('div', `will ${cls}`);
    this.root.appendChild(el('div', 'will-title', title));
    this.root.appendChild(this.body);
    for (const c of cousins) {
      const root = el('div', 'will-row');
      const sw = el('span', 'swatch');
      sw.style.background = c.color;
      const name = el('span', 'will-name', c.name);
      const tag = el('span', 'will-tag');
      const share = el('span', 'will-share', '0%');
      const arrow = el('span', 'will-arrow');
      const delta = el('span', 'will-delta');
      const barWrap = el('div', 'will-bar');
      const bar = el('div', 'will-fill');
      bar.style.background = c.color;
      barWrap.appendChild(bar);
      root.append(sw, name, tag, arrow, delta, share, barWrap);
      this.body.appendChild(root);
      this.rows.set(c.id, { root, name, share, bar, arrow, delta, tag });
    }
    if (withMeters) {
      const m = el('div', 'will-meters');
      const mk = (label: string) => {
        const row = el('div', 'meter');
        const lab = el('span', 'meter-label', label);
        const txt = el('span', 'meter-text');
        const wrap = el('div', 'meter-bar');
        const fill = el('div', 'meter-fill');
        wrap.appendChild(fill);
        row.append(lab, txt, wrap);
        m.appendChild(row);
        return { fill, txt };
      };
      const b = mk('Visit budget');
      const r = mk('Right now');
      this.meters = { budget: b.fill, rolling: r.fill, bText: b.txt, rText: r.txt };
      this.root.appendChild(m);
    }
  }

  frame(f: WillFrame, avail?: { budget: number; rolling: number }): void {
    for (const [id, r] of this.rows) {
      const v = f.shares[id] ?? 0;
      setText(r.share, `${v}%`);
      setStyle(r.bar, 'width', `${Math.max(0, Math.min(100, v))}%`);
      r.root.classList.toggle('self', id === f.self);
      r.root.classList.toggle('locked', id === f.locked);
      r.root.classList.toggle('aim', id === f.aim);
      r.root.classList.toggle('zero', v === 0);
      setText(r.tag, id === f.self ? 'you' : id === f.aim ? 'aim' : id === f.locked ? 'locked' : '');
      const ch = f.changes[id];
      const fresh = ch && f.t - ch.at < 4;
      show(r.arrow, !!fresh);
      show(r.delta, !!fresh);
      if (fresh && ch) {
        const up = ch.delta > 0;
        if (r.arrow.dataset.dir !== (up ? 'up' : 'down')) {
          r.arrow.dataset.dir = up ? 'up' : 'down';
          r.arrow.innerHTML = up ? ICONS.up : ICONS.down;
        }
        r.arrow.className = `will-arrow ${up ? 'up' : 'down'}`;
        r.delta.className = `will-delta ${up ? 'up' : 'down'}`;
        setText(r.delta, `${up ? '+' : '-'}${Math.abs(ch.delta)}`);
      }
    }
    if (this.meters && avail) {
      setStyle(this.meters.budget, 'width', `${(avail.budget / WILL.budgetPerVisit) * 100}%`);
      setStyle(this.meters.rolling, 'width', `${(avail.rolling / WILL.rollingCap) * 100}%`);
      setText(this.meters.bText, `${avail.budget}/${WILL.budgetPerVisit}`);
      setText(this.meters.rText, `${avail.rolling}/${WILL.rollingCap}`);
    }
  }
}
