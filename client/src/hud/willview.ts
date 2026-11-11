// A list of cousins and their shares: the cousins' mini-will, Grandma's
// always-visible parchment, and the standings on the intermission screen.
// Names show without the server's "(bot)" suffix (a robot glyph instead), and
// Grandma's locked / aimed rows are marked with icons, not words, so the name
// she needs is never cut short (review P14).
import { WILL } from '../../../shared/constants.js';
import type { CousinInfo } from '../../../shared/types.js';
import { el, setStyle, setText, show } from '../util.js';
import { ICONS } from './icons.js';
import { botGlyph, cleanName, isBotName, swatch } from './ident.js';

interface Row { root: HTMLElement; name: HTMLElement; share: HTMLElement; bar: HTMLElement; arrow: HTMLElement; delta: HTMLElement; tag: HTMLElement; tagKey: string }

export interface WillFrame {
  shares: Record<string, number>;
  changes: Record<string, { delta: number; at: number }>;
  /** Local seconds now (for fading change arrows). */
  t: number;
  self?: string;
  locked?: string | null;
  aim?: string | null;
}

/**
 * Budget meters under the will. Grandma's: her own budget. Cousins see the
 * same numbers labelled as what they are to them: how much Nana can still
 * change the will (review P19).
 */
export type WillMeters = 'grandma' | 'cousin' | false;

export class WillList {
  readonly root: HTMLElement;
  private rows = new Map<string, Row>();
  private body = el('div', 'will-rows');
  private meters: { budget: HTMLElement; rolling: HTMLElement; bText: HTMLElement; rText: HTMLElement } | null = null;

  constructor(cls: string, title: string, cousins: CousinInfo[], meters: WillMeters) {
    this.root = el('div', `will ${cls}`);
    this.root.appendChild(el('div', 'will-title', title));
    this.root.appendChild(this.body);
    for (const c of cousins) {
      const root = el('div', 'will-row');
      const sw = swatch(c.color, c.item);
      const name = el('span', 'will-name');
      name.appendChild(el('span', 'will-name-text', cleanName(c.name)));
      if (isBotName(c.name)) name.appendChild(botGlyph());
      name.title = cleanName(c.name);
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
      this.rows.set(c.id, { root, name, share, bar, arrow, delta, tag, tagKey: '' });
    }
    if (meters) {
      const m = el('div', 'will-meters');
      if (meters === 'cousin') m.appendChild(el('div', 'meter-head', "Nana's edits left"));
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
      const b = mk(meters === 'cousin' ? 'This visit' : 'Edits left this visit');
      const r = mk(meters === 'cousin' ? 'Right now' : 'Edits right now');
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
      const tagKey = id === f.self ? 'you' : `${id === f.aim ? 'aim' : ''}${id === f.locked ? 'lock' : ''}`;
      if (tagKey !== r.tagKey) {
        r.tagKey = tagKey;
        r.tag.textContent = '';
        r.tag.title = '';
        if (tagKey === 'you') r.tag.textContent = 'you';
        else {
          if (id === f.aim) { const i = el('span', 'tag-ico aim'); i.innerHTML = ICONS.aim; r.tag.appendChild(i); r.tag.title = 'In your sights'; }
          if (id === f.locked) { const i = el('span', 'tag-ico lock'); i.innerHTML = ICONS.lock; r.tag.appendChild(i); r.tag.title = r.tag.title ? `${r.tag.title}, locked` : 'Locked'; }
        }
      }
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
