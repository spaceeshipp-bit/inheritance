// Full-screen phase cards: role reveal, intermission, the "who was worst" vote.
import { VISITS } from '../../../shared/constants.js';
import type { GameState } from '../state.js';
import { el, fmtTime, setText } from '../util.js';
import { WillList } from './willview.js';

export const COUSIN_KEYS = 'WASD move - Shift run - Ctrl/C sneak - Space jump - LMB grab - RMB throw - F shove - E interact/steal - G plant - Q quick-chat - T tattle - Alt whisper - Enter chat';
export const GRANDMA_KEYS = 'WASD move - E Bless - Q Tut - Scroll lock name - Tab parchment - LMB cane - RMB hearing aid - F spectacles - R summon - C pin - V quick-chat - Enter chat';

export class RoleReveal {
  readonly root = el('div', 'phase-card reveal');
  private timer = el('div', 'phase-timer');

  constructor(s: GameState) {
    const m = s.match;
    if (!m) return;
    if (m.role === 'grandma') {
      this.root.classList.add('grandma');
      this.root.appendChild(el('div', 'reveal-kicker', 'You are'));
      this.root.appendChild(el('div', 'reveal-name', 'GRANDMA'));
      this.root.appendChild(el('div', 'reveal-sub', 'Rich, ninety-one, and very hard of hearing. The will is yours to rewrite, live.'));
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
      const name = el('div', 'reveal-name', me?.name ?? s.name(s.selfId));
      name.style.color = me?.color ?? '#fff';
      this.root.appendChild(name);
      const band = el('div', 'reveal-band');
      const sw = el('span', 'swatch huge');
      sw.style.background = me?.color ?? '#888';
      band.append(sw, el('span', '', `Your colour band. Your signature item: ${me?.itemName ?? '?'} (worn on your back).`));
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
    this.root.appendChild(this.timer);
  }

  frame(s: GameState, now: number): void {
    setText(this.timer, `The visit begins in ${Math.max(0, Math.ceil(s.phaseEndsAt - now))}`);
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
    const m = s.match;
    const idx = m && s.visit ? m.visits.indexOf(s.visit) : -1;
    const nextVisit = m && idx >= 0 ? m.visits[idx + 1] : undefined;
    setText(this.next, nextVisit ? `Next: ${VISITS[nextVisit].name}` : 'Next visit');
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
      const sw = el('span', 'swatch big');
      sw.style.background = c.color;
      b.append(sw, el('span', '', c.name + (c.id === s.selfId ? ' (you)' : '')));
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
