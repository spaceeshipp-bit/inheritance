// The practice round's checklist (shared/practice.ts): each step, ticked as the
// server sees you do it, with a hint for the next one; a final line when done.
import { PRACTICE, type PracticeRole } from '../../../shared/practice.js';
import { el, setText } from '../util.js';

export class PracticeList {
  readonly root = el('div', 'practice-list');
  private items = new Map<string, HTMLElement>();
  private hint = el('div', 'practice-hint');
  private role: PracticeRole;

  constructor(role: PracticeRole) {
    this.role = role;
    this.root.appendChild(el('div', 'practice-title', role === 'grandma' ? 'Practice: being Grandma' : 'Practice: being a cousin'));
    const ul = el('ul', 'practice-steps');
    for (const s of PRACTICE[role].steps) {
      const li = el('li', '', s.text);
      li.dataset.step = s.id;
      this.items.set(s.id, li);
      ul.appendChild(li);
    }
    this.root.append(ul, this.hint);
    this.update([]);
  }

  /** The steps done so far (from the server's practice events). */
  update(done: string[], all = false): void {
    const d = new Set(done);
    for (const [id, li] of this.items) li.classList.toggle('done', d.has(id));
    const next = PRACTICE[this.role].steps.find((s) => !d.has(s.id));
    setText(this.hint, all || !next ? 'All done. The will is about to be read: stay for the fireworks.' : next.hint);
    this.root.classList.toggle('complete', all || !next);
  }
}
