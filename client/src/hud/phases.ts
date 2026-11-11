// Full-screen phase cards: role reveal, intermission, the "who was worst" vote.
import { VISITS } from '../../../shared/constants.js';
import type { VisitId } from '../../../shared/types.js';
import type { GameState } from '../state.js';
import { el, fmtTime, setStyle, setText } from '../util.js';
import { botGlyph, isBot, nameOf, swatch } from './ident.js';
import { WillList } from './willview.js';

export const COUSIN_KEYS = 'WASD move - Shift run - Ctrl/C sneak - Space jump - LMB grab - RMB throw - F shove - E interact/steal - G plant - Q quick-chat - T tattle - Alt whisper - Enter chat';
export const GRANDMA_KEYS = 'WASD move - E Bless - Q Tut - Scroll lock name - Tab parchment - LMB cane - RMB hearing aid - F spectacles - R summon - C pin - V quick-chat - Enter chat';

/** The one-line goal on each role card (review P3: no stated goal). */
export const ROLE_GOAL = {
  cousin: 'Biggest share when the will is read wins. Only Nana changes the will.',
  grandma: "Leave the least to whoever really misbehaved. That's your score.",
} as const;

/** The intermission card's "Next:" line. The server sends the upcoming visit in `phase.visit` (review P5). */
export function nextVisitText(upcoming: VisitId | null, visits: VisitId[]): string {
  if (!upcoming) return 'Next visit';
  const i = visits.indexOf(upcoming);
  return `Next: ${VISITS[upcoming].name}${i >= 0 && visits.length > 1 ? ` (visit ${i + 1} of ${visits.length})` : ''}`;
}

export class RoleReveal {
  readonly root = el('div', 'phase-card reveal');
  private timer = el('div', 'phase-timer');
  private bar = el('div', 'reveal-progress-fill');
  private total = 0;

  constructor(s: GameState) {
    const m = s.match;
    if (!m) return;
    if (m.role === 'grandma') {
      this.root.classList.add('grandma');
      this.root.appendChild(el('div', 'reveal-kicker', 'You are'));
      this.root.appendChild(el('div', 'reveal-name', 'GRANDMA'));
      this.root.appendChild(el('div', 'reveal-sub', 'Rich, ninety-one, and very hard of hearing. The will is yours to rewrite, live.'));
      this.root.appendChild(this.goal(ROLE_GOAL.grandma));
      const ul = el('ul', 'reveal-list');
      for (const t of [
        'Bless (E) the dears who flatter you, Tut (Q) the wicked ones. Tab opens the full parchment.',
        'You only see sharply up close. Spectacles (F) help for a moment; the hearing aid (RMB) too.',
        'Catch them at it! Planted evidence is not always what it seems...',
      ]) ul.appendChild(el('li', '', t));
      this.root.appendChild(ul);
      if (m.prefCards?.length) {
        const cards = el('div', 'reveal-cards');
        cards.appendChild(el('div', 'pref-title', 'Your secret feelings'));
        for (const c of m.prefCards) cards.appendChild(el('div', 'pref-card', c));
        this.root.appendChild(cards);
      }
      this.root.appendChild(el('div', 'reveal-keys', GRANDMA_KEYS));
    } else {
      const me = s.cousin(s.selfId);
      this.root.classList.add('cousin');
      this.root.appendChild(el('div', 'reveal-kicker', 'You are a cousin'));
      const name = el('div', 'reveal-name', nameOf(s, s.selfId));
      name.style.color = me?.color ?? '#fff';
      this.root.appendChild(name);
      this.root.appendChild(this.goal(ROLE_GOAL.cousin));
      const band = el('div', 'reveal-band');
      band.append(swatch(me?.color ?? '#888', me?.item, 'huge'), el('span', '', `Your colour band. Your signature item: ${me?.itemName ?? '?'} (worn on your back).`));
      this.root.appendChild(band);
      const ul = el('ul', 'reveal-list');
      for (const t of [
        'Flatter Nana to her face: compliments, fetch her wishes, bring her tea.',
        'Behind her back: shove, smash heirlooms, steal items and plant them to frame your cousins.',
        'Watch the Nana Senses (top right). If she sees you, she knows.',
      ]) ul.appendChild(el('li', '', t));
      this.root.appendChild(ul);
      this.root.appendChild(el('div', 'reveal-keys', COUSIN_KEYS));
    }
    this.root.appendChild(el('div', 'reveal-help', 'Press H any time for the controls. The gear (top right) has the settings.'));
    const progress = el('div', 'reveal-progress');
    progress.appendChild(this.bar);
    this.root.append(this.timer, progress);
  }

  private goal(text: string): HTMLElement {
    const g = el('div', 'reveal-goal');
    g.append(el('span', 'goal-kicker', 'Your goal'), el('span', '', text));
    return g;
  }

  frame(s: GameState, now: number): void {
    const left = Math.max(0, s.phaseEndsAt - now);
    if (!this.total) this.total = Math.max(1, left);
    setText(this.timer, `The visit begins in ${Math.ceil(left)}`);
    setStyle(this.bar, 'width', `${Math.max(0, Math.min(100, (left / this.total) * 100)).toFixed(1)}%`);
  }
}

export class Intermission {
  readonly root = el('div', 'phase-card intermission');
  private timer = el('div', 'phase-timer');
  private will: WillList | null = null;
  private next = el('div', 'reveal-sub');

  constructor(s: GameState) {
    this.root.appendChild(el('div', 'reveal-kicker', 'Intermission'));
    this.root.appendChild(this.next);
    const m = s.match;
    if (m) {
      this.will = new WillList('standings', 'The will as it stands', m.cousins, false);
      this.root.appendChild(this.will.root);
    }
    this.root.appendChild(el('div', 'reveal-sub small', "Grandma's budget resets for the next visit."));
    this.root.appendChild(this.timer);
  }

  frame(s: GameState, now: number, t: number): void {
    setText(this.next, nextVisitText(s.visit, s.match?.visits ?? []));
    setText(this.timer, `Resuming in ${fmtTime(s.phaseEndsAt - now)}`);
    this.will?.frame({ shares: s.shares, changes: {}, t, self: s.selfId });
  }
}

export class VoteScreen {
  readonly root = el('div', 'phase-card vote');
  private timer = el('div', 'phase-timer');
  private buttons = new Map<string, HTMLButtonElement>();

  constructor(s: GameState, onVote: (id: string) => void) {
    this.root.appendChild(el('div', 'reveal-kicker', 'One last thing'));
    this.root.appendChild(el('div', 'reveal-name small', 'Who was actually the worst?'));
    this.root.appendChild(el('div', 'reveal-sub small', 'Just for laughs. It does not change the will.'));
    const grid = el('div', 'vote-grid');
    for (const c of s.match?.cousins ?? []) {
      const b = el('button', 'vote-btn');
      const name = el('span', 'vote-name', nameOf(s, c.id));
      name.title = nameOf(s, c.id);
      b.append(swatch(c.color, c.item, 'big'), name);
      if (isBot(s, c.id)) b.appendChild(botGlyph());
      if (c.id === s.selfId) b.appendChild(el('span', 'badge you', 'you'));
      b.disabled = c.id === s.selfId;
      b.addEventListener('click', () => {
        onVote(c.id);
        for (const [id, x] of this.buttons) x.classList.toggle('chosen', id === c.id);
      });
      this.buttons.set(c.id, b);
      grid.appendChild(b);
    }
    this.root.append(grid, this.timer);
  }

  frame(s: GameState, now: number): void {
    setText(this.timer, `Voting closes in ${Math.max(0, Math.ceil(s.phaseEndsAt - now))}`);
  }
}
