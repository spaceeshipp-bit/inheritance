// Short notices stacked at the top centre.
import { el } from '../util.js';

export type ToastKind = 'info' | 'good' | 'bad' | 'moment' | 'warn';

export class Toasts {
  readonly root = el('div', 'toasts');
  private items: { e: HTMLElement; until: number }[] = [];

  push(text: string, kind: ToastKind = 'info', seconds = 4): void {
    const e = el('div', `toast toast-${kind}`, text);
    this.root.appendChild(e);
    this.items.push({ e, until: performance.now() + seconds * 1000 });
    while (this.items.length > 4) this.items.shift()?.e.remove();
  }

  frame(): void {
    const now = performance.now();
    this.items = this.items.filter((t) => {
      if (now > t.until) { t.e.remove(); return false; }
      if (now > t.until - 400) t.e.classList.add('fade');
      return true;
    });
  }

  clear(): void {
    for (const t of this.items) t.e.remove();
    this.items = [];
  }
}
