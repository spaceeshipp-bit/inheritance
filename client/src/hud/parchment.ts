// Grandma's full parchment (Tab): per-cousin - / + and drag in 1-point steps,
// each step sends `grandma set`. Shows what is left of the budget. Closing it
// ends the "opening" (the server tracks Big Cuts per opening).
import { WILL } from '../../../shared/constants.js';
import type { CousinInfo } from '../../../shared/types.js';
import { clamp, el, setStyle, setText } from '../util.js';

interface Row { root: HTMLElement; fill: HTMLElement; val: HTMLElement; bar: HTMLElement }

const PX_PER_POINT = 5;

export class FullParchment {
  readonly root = el('div', 'full-parchment');
  isOpen = false;
  onSet: (target: string, value: number) => void = () => {};
  private rows = new Map<string, Row>();
  private pending = new Map<string, { v: number; at: number }>();
  private order: string[] = [];
  private sel = 0;
  private budget = el('div', 'fp-budget');
  private shares: Record<string, number> = {};

  constructor(cousins: CousinInfo[], grandmaName: string) {
    const sheet = el('div', 'fp-sheet');
    sheet.appendChild(el('div', 'fp-title', 'Last Will and Testament'));
    sheet.appendChild(el('div', 'fp-sub', `of ${grandmaName}, of Harrowgate Manor`));
    const list = el('div', 'fp-rows');
    for (const c of cousins) {
      this.order.push(c.id);
      const root = el('div', 'fp-row');
      const sw = el('span', 'swatch big');
      sw.style.background = c.color;
      const name = el('span', 'fp-name', c.name);
      const minus = el('button', 'fp-btn', '-');
      const plus = el('button', 'fp-btn', '+');
      const bar = el('div', 'fp-bar');
      const fill = el('div', 'fp-fill');
      fill.style.background = c.color;
      bar.appendChild(fill);
      const val = el('span', 'fp-val', '0%');
      root.append(sw, name, minus, bar, plus, val);
      list.appendChild(root);
      this.rows.set(c.id, { root, fill, val, bar });
      minus.addEventListener('click', () => this.step(c.id, -1));
      plus.addEventListener('click', () => this.step(c.id, +1));
      this.dragOn(bar, c.id);
    }
    sheet.append(list, this.budget, el('div', 'fp-hint', 'Drag a bar or press - / + (1 point each). Everyone else shifts to keep 100%. Tab to close.'));
    this.root.appendChild(sheet);
    this.root.style.display = 'none';
  }

  open(): void { this.isOpen = true; this.root.style.display = ''; }
  close(): void { this.isOpen = false; this.root.style.display = 'none'; this.pending.clear(); }

  private value(id: string): number {
    const p = this.pending.get(id);
    return p ? p.v : this.shares[id] ?? 0;
  }

  private setTo(id: string, v: number): void {
    const cur = this.value(id);
    const want = clamp(Math.round(v), 0, 100);
    if (want === cur) return;
    // Send each 1-point step.
    const dir = Math.sign(want - cur);
    for (let x = cur + dir; dir > 0 ? x <= want : x >= want; x += dir) this.onSet(id, x);
    this.pending.set(id, { v: want, at: performance.now() });
  }

  step(id: string, d: number): void { this.setTo(id, this.value(id) + d); }

  private dragOn(bar: HTMLElement, id: string): void {
    let startX = 0, startV = 0, dragging = false;
    bar.addEventListener('pointerdown', (e) => {
      dragging = true;
      startX = e.clientX;
      startV = this.value(id);
      bar.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    bar.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.setTo(id, startV + Math.round((e.clientX - startX) / PX_PER_POINT));
    });
    const end = () => { dragging = false; };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  }

  /** Gamepad / keyboard navigation while open. */
  nav(dir: 'up' | 'down' | 'left' | 'right'): void {
    if (dir === 'up') this.sel = (this.sel + this.order.length - 1) % this.order.length;
    else if (dir === 'down') this.sel = (this.sel + 1) % this.order.length;
    else this.step(this.order[this.sel], dir === 'left' ? -1 : 1);
  }

  rejected(): void { this.pending.clear(); }

  frame(shares: Record<string, number>, avail: { budget: number; rolling: number }): void {
    if (!this.isOpen) return;
    this.shares = shares;
    const now = performance.now();
    for (const [id, p] of this.pending) if (shares[id] === p.v || now - p.at > 1500) this.pending.delete(id);
    this.order.forEach((id, i) => {
      const r = this.rows.get(id);
      if (!r) return;
      const v = this.value(id);
      setText(r.val, `${v}%`);
      setStyle(r.fill, 'width', `${v}%`);
      r.root.classList.toggle('sel', i === this.sel);
      r.root.classList.toggle('pending', this.pending.has(id));
    });
    setText(this.budget, `You may still move ${avail.budget} of ${WILL.budgetPerVisit} points this visit, ${Math.min(avail.budget, avail.rolling)} right now.`);
    this.budget.classList.toggle('empty', Math.min(avail.budget, avail.rolling) === 0);
  }
}
