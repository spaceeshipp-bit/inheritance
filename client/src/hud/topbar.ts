// Top centre: the visit name and clock, and Nana's current wish with its timer.
import { VISITS, WISH } from '../../../shared/constants.js';
import type { GameState } from '../state.js';
import { el, fmtTime, setStyle, setText, show } from '../util.js';

export class TopBar {
  readonly root = el('div', 'topbar');
  private visit = el('div', 'visit-name');
  private clock = el('div', 'visit-clock');
  private wish = el('div', 'wish');
  private wishLabel = el('div', 'wish-label');
  private wishText = el('div', 'wish-text');
  private wishTime = el('div', 'wish-time');
  private wishBar = el('div', 'wish-fill');

  constructor() {
    const head = el('div', 'visit');
    head.append(this.visit, this.clock);
    const bar = el('div', 'wish-bar');
    bar.appendChild(this.wishBar);
    const row = el('div', 'wish-row');
    row.append(this.wishText, this.wishTime);
    this.wish.append(this.wishLabel, row, bar);
    this.root.append(head, this.wish);
  }

  frame(s: GameState, now: number): void {
    const phaseName = s.phase === 'visit' && s.visit ? VISITS[s.visit].name : s.phase === 'intermission' ? 'Intermission' : s.phase === 'roles' ? 'Arriving at Harrowgate' : '';
    setText(this.visit, phaseName);
    setText(this.clock, fmtTime(s.phaseEndsAt - now));
    this.clock.classList.toggle('urgent', s.phase === 'visit' && s.phaseEndsAt - now < 20);
    const w = s.wish;
    show(this.wish, !!w && s.phase === 'visit');
    if (w) {
      const left = w.endsAt - now;
      setText(this.wishLabel, s.role === 'grandma' ? 'You would like...' : 'Nana wishes...');
      setText(this.wishText, w.text);
      setText(this.wishTime, fmtTime(left));
      setStyle(this.wishBar, 'width', `${Math.max(0, Math.min(100, (left / WISH.duration) * 100))}%`);
    }
  }
}
