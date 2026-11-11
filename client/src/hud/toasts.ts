// Short notices stacked at the top centre. The same notice again refreshes its
// line with a count instead of stacking copies (review P7: rejections piled up).
import { el } from '../util.js';

export type ToastKind = 'info' | 'good' | 'bad' | 'moment' | 'warn';

interface Item { e: HTMLElement; until: number; key: string; count: number; badge: HTMLElement | null }

export class Toasts {
  readonly root = el('div', 'toasts');
  private items: Item[] = [];

  push(text: string, kind: ToastKind = 'info', seconds = 4): void {
    const key = `${kind}|${text}`;
    const now = performance.now();
    const same = this.items.find((t) => t.key === key);
    if (same) {
      same.until = now + seconds * 1000;
      same.count++;
      same.e.classList.remove('fade');
      if (!same.badge) { same.badge = el('span', 'toast-count'); same.e.appendChild(same.badge); }
      same.badge.textContent = `×${same.count}`;
      return;
    }
    const e = el('div', `toast toast-${kind}`, text);
    this.root.appendChild(e);
    this.items.push({ e, until: now + seconds * 1000, key, count: 1, badge: null });
    while (this.items.length > 4) this.items.shift()?.e.remove();
  }

  frame(): void {
    const now = performance.now();
    this.items = this.items.filter((t) => {
      if (now > t.until) { t.e.remove(); return false; }
      t.e.classList.toggle('fade', now > t.until - 400);
      return true;
    });
  }

  clear(): void {
    for (const t of this.items) t.e.remove();
    this.items = [];
  }
}
