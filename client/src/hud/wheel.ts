// Radial wheel (quick-chat lines, tattle targets). Hold the key, flick the
// mouse / right stick toward an entry (or press 1-8), release to choose.
import { el } from '../util.js';

export interface WheelItem { label: string; color?: string }

export class Wheel {
  readonly root = el('div', 'wheel');
  private title = el('div', 'wheel-title');
  private entries: HTMLElement[] = [];
  private items: WheelItem[] = [];
  private sel = -1;
  isOpen = false;
  kind: 'quick' | 'tattle' = 'quick';

  constructor() {
    this.root.appendChild(this.title);
    this.root.style.display = 'none';
  }

  open(kind: 'quick' | 'tattle', title: string, items: WheelItem[]): void {
    this.kind = kind;
    this.items = items;
    this.isOpen = true;
    this.sel = -1;
    this.title.textContent = title;
    for (const e of this.entries) e.remove();
    this.entries = items.map((it, i) => {
      const a = (i / items.length) * Math.PI * 2 - Math.PI / 2;
      const e = el('div', 'wheel-item');
      const num = el('span', 'wheel-num', String(i + 1));
      e.appendChild(num);
      if (it.color) {
        const sw = el('span', 'swatch');
        sw.style.background = it.color;
        e.appendChild(sw);
      }
      e.appendChild(el('span', '', it.label));
      e.style.left = `calc(50% + ${Math.cos(a) * 150}px)`;
      e.style.top = `calc(50% + ${Math.sin(a) * 120}px)`;
      this.root.appendChild(e);
      return e;
    });
    this.root.style.display = '';
  }

  /** Update the highlighted entry from a cursor offset (px from centre) or a digit (1..8). */
  point(x: number, y: number, digit = 0): void {
    let s = -1;
    if (digit > 0 && digit <= this.items.length) s = digit - 1;
    else if (Math.hypot(x, y) > 28 && this.items.length) {
      const a = Math.atan2(y, x) + Math.PI / 2;
      const n = this.items.length;
      s = ((Math.round((a / (Math.PI * 2)) * n) % n) + n) % n;
    }
    if (s === this.sel) return;
    this.sel = s;
    this.entries.forEach((e, i) => e.classList.toggle('sel', i === s));
  }

  /** Close; returns the chosen index or -1. */
  close(): number {
    this.isOpen = false;
    this.root.style.display = 'none';
    return this.sel;
  }
}
