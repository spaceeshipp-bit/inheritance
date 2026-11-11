// Grandma's full parchment (Tab): per-cousin - / + (one point each) and drags
// in 1-point steps. A drag only goes as far as the points she can still move
// (the rest of the bar is shaded) and sends ONE `grandma set` per row when it
// is released (review P7: one per point per move flooded the server). When the
// budget or the rolling cap blocks, a single line inside the sheet says so
// instead of toasts piling up behind it. Closing it ends the "opening" (the
// server tracks Big Cuts per opening).
import { WILL } from '../../../shared/constants.js';
import type { CousinInfo } from '../../../shared/types.js';
import { clamp, el, setStyle, setText, show } from '../util.js';
import { botGlyph, cleanName, isBotName, swatch } from './ident.js';

interface Row { root: HTMLElement; fill: HTMLElement; val: HTMLElement; bar: HTMLElement; shadeLo: HTMLElement; shadeHi: HTMLElement; name: string }

const PX_PER_POINT = 5;

export type BlockReason = 'budget' | 'rolling';
export const BLOCK_TEXT: Record<BlockReason, string> = {
  budget: 'Out of budget for this visit',
  rolling: 'Wait a moment — the quill needs a rest',
};

/**
 * The range a row can be dragged to: `avail` points either way from where the
 * drag started, never below 0 or above 100.
 */
export function dragRange(start: number, avail: number): { lo: number; hi: number } {
  const a = Math.max(0, Math.floor(avail));
  return { lo: clamp(start - a, 0, 100), hi: clamp(start + a, 0, 100) };
}

/** Which limit stops her moving any more right now, if one does. */
export function blockedBy(avail: { budget: number; rolling: number }): BlockReason | null {
  if (avail.budget <= 0) return 'budget';
  if (avail.rolling <= 0) return 'rolling';
  return null;
}

export class FullParchment {
  readonly root = el('div', 'full-parchment');
  isOpen = false;
  onSet: (target: string, value: number) => void = () => {};
  private rows = new Map<string, Row>();
  /** Values sent but not yet seen in a snapshot. */
  private pending = new Map<string, { v: number; at: number }>();
  /** The row being dragged and where it would go now (nothing sent until release). */
  private drag: { id: string; start: number; v: number; lo: number; hi: number } | null = null;
  private order: string[] = [];
  private sel = 0;
  private budget = el('div', 'fp-budget');
  private note = el('div', 'fp-note');
  private noteUntil = 0;
  private noteText = '';
  private shares: Record<string, number> = {};
  private avail: { budget: number; rolling: number } = { budget: WILL.budgetPerVisit, rolling: WILL.rollingCap };

  constructor(cousins: CousinInfo[], grandmaName: string) {
    const sheet = el('div', 'fp-sheet');
    sheet.appendChild(el('div', 'fp-title', 'Last Will and Testament'));
    sheet.appendChild(el('div', 'fp-sub', `of ${cleanName(grandmaName)}, of Harrowgate Manor`));
    const list = el('div', 'fp-rows');
    for (const c of cousins) {
      this.order.push(c.id);
      const root = el('div', 'fp-row');
      const name = el('span', 'fp-name');
      name.appendChild(el('span', '', cleanName(c.name)));
      if (isBotName(c.name)) name.appendChild(botGlyph());
      const minus = el('button', 'fp-btn', '-');
      const plus = el('button', 'fp-btn', '+');
      const bar = el('div', 'fp-bar');
      const fill = el('div', 'fp-fill');
      fill.style.background = c.color;
      const shadeLo = el('div', 'fp-shade lo');
      const shadeHi = el('div', 'fp-shade hi');
      bar.append(fill, shadeLo, shadeHi);
      const val = el('span', 'fp-val', '0%');
      root.append(swatch(c.color, c.item, 'big'), name, minus, bar, plus, val);
      list.appendChild(root);
      this.rows.set(c.id, { root, fill, val, bar, shadeLo, shadeHi, name: cleanName(c.name) });
      minus.addEventListener('click', () => this.step(c.id, -1));
      plus.addEventListener('click', () => this.step(c.id, +1));
      this.dragOn(bar, c.id);
    }
    sheet.append(list, this.note, this.budget, el('div', 'fp-hint', 'Drag a bar or press - / + (1 point each). Everyone else shifts to keep 100%. Tab to close.'));
    show(this.note, false);
    this.root.appendChild(sheet);
    this.root.style.display = 'none';
  }

  open(): void { this.isOpen = true; this.root.style.display = ''; }
  close(): void {
    this.isOpen = false;
    this.root.style.display = 'none';
    this.pending.clear();
    this.drag = null;
    this.noteUntil = 0;
  }

  private value(id: string): number {
    if (this.drag?.id === id) return this.drag.v;
    const p = this.pending.get(id);
    return p ? p.v : this.shares[id] ?? 0;
  }

  /** Points still movable now: the server's figure less what was sent and not yet applied. */
  private availNow(): number {
    let out = Math.min(this.avail.budget, this.avail.rolling);
    for (const [id, p] of this.pending) out -= Math.abs(p.v - (this.shares[id] ?? 0));
    return Math.max(0, out);
  }

  /** Show the one-line message in the sheet for a while. */
  private say(text: string, seconds = 3): void {
    this.noteText = text;
    this.noteUntil = performance.now() + seconds * 1000;
  }

  private blockedText(): string {
    const why = blockedBy(this.avail);
    return why ? BLOCK_TEXT[why] : BLOCK_TEXT.rolling;
  }

  private send(id: string, v: number): void {
    const cur = this.shares[id] ?? 0;
    if (v === this.value(id) && !this.pending.has(id) && v === cur) return;
    this.onSet(id, v);
    this.pending.set(id, { v, at: performance.now() });
  }

  step(id: string, d: number): void {
    const cur = this.value(id);
    const want = clamp(cur + d, 0, 100);
    if (want === cur) return;
    if (this.availNow() < Math.abs(want - cur)) { this.say(this.blockedText()); return; }
    this.send(id, want);
  }

  private dragOn(bar: HTMLElement, id: string): void {
    let startX = 0;
    bar.addEventListener('pointerdown', (e) => {
      const start = this.value(id);
      const { lo, hi } = dragRange(start, this.availNow());
      this.drag = { id, start, v: start, lo, hi };
      startX = e.clientX;
      bar.setPointerCapture(e.pointerId);
      e.preventDefault();
      if (lo === hi) this.say(this.blockedText());
    });
    bar.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || d.id !== id) return;
      const want = d.start + Math.round((e.clientX - startX) / PX_PER_POINT);
      d.v = clamp(want, d.lo, d.hi);
      if (want !== d.v && clamp(want, 0, 100) !== d.v) this.say(this.blockedText(), 2);
    });
    const end = () => {
      const d = this.drag;
      if (!d || d.id !== id) return;
      this.drag = null;
      if (d.v !== d.start) this.send(id, d.v);
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  }

  /** Gamepad / keyboard navigation while open. */
  nav(dir: 'up' | 'down' | 'left' | 'right'): void {
    if (dir === 'up') this.sel = (this.sel + this.order.length - 1) % this.order.length;
    else if (dir === 'down') this.sel = (this.sel + 1) % this.order.length;
    else this.step(this.order[this.sel], dir === 'left' ? -1 : 1);
  }

  /** The server refused a change: drop what we were showing and say why, in the sheet. */
  rejected(reason?: string): void {
    this.pending.clear();
    if (reason === 'budget') this.say(BLOCK_TEXT.budget);
    else if (reason === 'rolling') this.say(BLOCK_TEXT.rolling);
  }

  frame(shares: Record<string, number>, avail: { budget: number; rolling: number }): void {
    this.shares = shares;
    this.avail = avail;
    if (!this.isOpen) return;
    const now = performance.now();
    for (const [id, p] of this.pending) if (shares[id] === p.v || now - p.at > 1500) this.pending.delete(id);
    const free = this.availNow();
    this.order.forEach((id, i) => {
      const r = this.rows.get(id);
      if (!r) return;
      const v = this.value(id);
      setText(r.val, `${v}%`);
      setStyle(r.fill, 'width', `${v}%`);
      // Shade what this row cannot reach now.
      const range = this.drag?.id === id ? { lo: this.drag.lo, hi: this.drag.hi } : dragRange(v, free);
      setStyle(r.shadeLo, 'width', `${range.lo}%`);
      setStyle(r.shadeHi, 'left', `${range.hi}%`);
      r.root.classList.toggle('sel', i === this.sel);
      r.root.classList.toggle('pending', this.pending.has(id));
      r.root.classList.toggle('dragging', this.drag?.id === id);
    });
    const why = blockedBy(avail);
    const showNote = now < this.noteUntil || why !== null;
    setText(this.note, now < this.noteUntil ? this.noteText : why ? BLOCK_TEXT[why] : '');
    show(this.note, showNote);
    setText(this.budget, `You may still move ${avail.budget} of ${WILL.budgetPerVisit} points this visit, ${Math.min(avail.budget, avail.rolling)} right now.`);
    this.budget.classList.toggle('empty', Math.min(avail.budget, avail.rolling) === 0);
  }
}
