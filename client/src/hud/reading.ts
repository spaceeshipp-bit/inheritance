// The Reading of the Will: the family solicitor reads the shares from lowest
// to highest, paced over the whole reading, with a pause before the top share;
// only then do the outcome badges appear (ties split the lot), and then up to
// three moments of the match, one at a time, saving the best for last (review
// P6). Then the final results with Grandma's score and who actually sabotaged.
import { cousinOutcome, type CousinOutcome } from '../../../shared/scoring.js';
import type { FinalResult, Moment, MomentKind, ReadingResult } from '../../../shared/types.js';
import type { GameState } from '../state.js';
import { el, setText, show } from '../util.js';
import { MOMENT_TITLES, botGlyph, cleanText, isBot, nameOf, swatch } from './ident.js';
import { ReplayTheatre } from './replay.js';
import type { ReplayView } from '../render/scene.js';


export const OUTCOME_TEXT: Record<CousinOutcome, string> = {
  winner: 'Inherits the lot',
  tied: 'Splits the lot',
  partial: 'Gets a share',
  disgraced: 'Cut off without a penny',
};

/** How good a moment is for the reading: lower is better. */
const MOMENT_RANK: Record<MomentKind, number> = { framed: 0, 'big-cut': 1, 'love-you-nana': 2, 'favourite-broken': 3, 'caught-red-handed': 4 };

/**
 * The (at most) `max` moments worth reading out: people before bots, then
 * framed > big cut > love you, Nana > favourite broken > caught red-handed,
 * then the earliest; never two for the same actor. Returned best first.
 */
export function pickMoments(moments: Moment[], isHuman: (id: string) => boolean, max = 3): Moment[] {
  const sorted = [...moments].sort((a, b) =>
    Number(isHuman(b.actor)) - Number(isHuman(a.actor)) || MOMENT_RANK[a.kind] - MOMENT_RANK[b.kind] || a.t - b.t);
  const out: Moment[] = [];
  const actors = new Set<string>();
  for (const m of sorted) {
    if (actors.has(m.actor)) continue;
    actors.add(m.actor);
    out.push(m);
    if (out.length >= max) break;
  }
  return out;
}

export interface ReadingPlan {
  /** Seconds from the start at which each line of `order` is read (the tied top lines together). */
  lines: number[];
  /** When the outcome badges appear (after the last line). */
  badges: number;
  /** When each picked moment appears (worst first, best last). */
  moments: number[];
}

/**
 * Pace the reading over `total` seconds: a short preamble, the lower shares at
 * an even pace, a pause, the top share (all tied top shares at once), the
 * badges, then the moments one at a time, leaving a beat to read the last.
 */
export function planReading(n: number, topCount: number, momentCount: number, total: number): ReadingPlan {
  const T = Math.max(3, total);
  const intro = Math.min(1.6, T * 0.08);
  const pause = Math.min(2.4, Math.max(0.6, T * 0.11));
  const badgeGap = Math.min(1.1, Math.max(0.3, T * 0.05));
  const tail = Math.min(2.2, Math.max(0.5, T * 0.1));
  const rest = Math.max(0, n - Math.max(1, topCount));
  const mGapMin = Math.min(2.2, T * 0.11);
  const linesBudget = T - intro - pause - badgeGap - tail - momentCount * mGapMin;
  const interval = rest > 0 ? Math.min(2.6, Math.max(0.35, linesBudget / rest)) : 0;
  const lines: number[] = [];
  for (let i = 0; i < rest; i++) lines.push(intro + i * interval);
  const top = intro + Math.max(0, rest - 1) * interval + (rest > 0 ? interval * 0.5 : 0) + pause;
  for (let i = rest; i < n; i++) lines.push(top);
  const badges = top + badgeGap;
  const left = Math.max(0, T - tail - badges);
  const mGap = momentCount ? Math.min(3.2, left / momentCount) : 0;
  const moments: number[] = [];
  for (let i = 0; i < momentCount; i++) moments.push(badges + mGap * (i + 1) * 0.92);
  return { lines, badges, moments };
}

export class ReadingScreen {
  /** The card, and What Nana Saw over the whole screen once the will has been read. */
  readonly root = el('div', 'reading-wrap');
  private card = el('div', 'phase-card reading');
  private theatre: ReplayTheatre;
  private lines: HTMLElement[] = [];
  private badges: HTMLElement[] = [];
  private momentEls: HTMLElement[] = [];
  private momentWait = el('div', 'moment-wait', 'Mr Pettigrew turns the page...');
  private plan: ReadingPlan | null = null;
  /** The reading length the plan was made for (re-planned if the clock corrects itself). */
  private planTotal = 0;
  private startedAt = 0;
  private timer = el('div', 'phase-timer');
  private topCount: number;
  private picked: Moment[];

  constructor(s: GameState, r: ReadingResult) {
    this.card.appendChild(el('div', 'reveal-kicker', 'The Reading of the Will'));
    this.card.appendChild(el('div', 'lawyer', 'Mr Pettigrew, the family solicitor, clears his throat and unfolds the parchment...'));
    const cols = el('div', 'reading-cols');
    const list = el('div', 'reading-list');
    const n = r.order.length;
    const max = n ? Math.max(...r.order.map((id) => r.shares[id] ?? 0)) : 0;
    this.topCount = r.order.filter((id) => (r.shares[id] ?? 0) === max).length;
    // Lowest first; the tied top shares are read together at the end.
    r.order.forEach((id) => {
      const c = s.cousin(id);
      const share = r.shares[id] ?? 0;
      const out = cousinOutcome(r.shares, id);
      const line = el('div', 'reading-line hidden');
      const who = el('span', 'rl-name', nameOf(s, id));
      const what = el('span', 'rl-text', share === 0 ? 'nothing at all.'
        : out === 'winner' ? `${share}%... and the house.`
          : out === 'tied' ? `${share}%... and an equal share of the house.` : `${share}%.`);
      const badge = el('span', `rl-outcome ${out} hidden`, OUTCOME_TEXT[out]);
      line.append(swatch(c?.color ?? '#888', c?.item, 'big'), el('span', 'rl-to', 'To'), who);
      if (isBot(s, id)) line.appendChild(botGlyph());
      line.append(el('span', 'rl-to', 'I leave'), what, badge);
      if (id === s.selfId) line.classList.add('self');
      if (out === 'winner' || out === 'tied') line.classList.add('top');
      list.appendChild(line);
      this.lines.push(line);
      this.badges.push(badge);
    });
    const moments = el('div', 'moments');
    moments.appendChild(el('div', 'pref-title', 'What really happened'));
    this.picked = pickMoments(r.moments, (id) => !isBot(s, id) && id !== '');
    // Read out worst first, the best one last.
    const reveal = [...this.picked].reverse();
    moments.appendChild(this.momentWait);
    if (!reveal.length) {
      const empty = el('div', 'moment moment-empty hidden', 'A suspiciously quiet afternoon.');
      moments.appendChild(empty);
      this.momentEls.push(empty);
    }
    reveal.forEach((m, i) => {
      const row = el('div', `moment ${m.kind} hidden${i === reveal.length - 1 ? ' best' : ''}`);
      row.append(el('div', 'moment-title', MOMENT_TITLES[m.kind] ?? m.kind), el('div', 'moment-text', cleanText(m.text)));
      moments.appendChild(row);
      this.momentEls.push(row);
    });
    cols.append(list, moments);
    this.card.append(cols, this.timer);
    this.theatre = new ReplayTheatre(s, r.replays ?? []);
    this.root.append(this.card, this.theatre.root);
  }

  /** What the renderer should draw while a replay plays (null: the usual establishing shot). */
  replayView(): ReplayView | null {
    return this.theatre.view();
  }

  frame(s: GameState, now: number): void {
    if (!this.plan) this.startedAt = performance.now();
    const t = (performance.now() - this.startedAt) / 1000;
    // The whole reading as the clock sees it now; a clock that settles mid-reading re-paces the rest.
    // What Nana Saw takes the last part of it, so the will is read in what is left before.
    const replays = this.theatre.duration;
    const left = Math.max(0, s.phaseEndsAt - now);
    const total = Math.max(3, t + left - replays);
    // Replays start when only their own length is left on the clock.
    const replaying = this.theatre.seek(replays > 0 ? replays - left : -1);
    show(this.card, !replaying);
    if (!this.plan || Math.abs(total - this.planTotal) > 0.5) {
      this.planTotal = total;
      this.plan = planReading(this.lines.length, this.topCount, this.momentEls.length, total);
    }
    const p = this.plan;
    this.lines.forEach((l, i) => l.classList.toggle('hidden', t < (p.lines[i] ?? 0)));
    const badgesOn = t >= p.badges;
    for (const b of this.badges) b.classList.toggle('hidden', !badgesOn);
    let any = false;
    this.momentEls.forEach((m, i) => {
      const on = t >= (p.moments[i] ?? p.badges);
      m.classList.toggle('hidden', !on);
      any ||= on;
    });
    show(this.momentWait, !any);
    setText(this.timer, `${Math.max(0, Math.ceil(s.phaseEndsAt - now))}`);
  }
}

/** "Bea", "Bea and Dot", "Bea, Dot and Gus". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export class ResultsScreen {
  readonly root = el('div', 'phase-card results');
  private timer = el('div', 'phase-timer');

  constructor(s: GameState, r: FinalResult) {
    this.root.appendChild(el('div', 'reveal-kicker', 'Results'));
    const top = el('div', 'results-top');
    const score = el('div', 'gm-score');
    score.append(el('div', 'gm-score-num', String(r.grandmaScore)), el('div', 'gm-score-label', "Grandma's judgement"));
    const verdict = r.grandmaScore >= 75 ? 'Sharp as a tack: the saboteurs got what they deserved.'
      : r.grandmaScore >= 55 ? 'Not bad, Nana. Mostly the right ones.'
        : r.grandmaScore >= 45 ? 'Hard to say whether she noticed anything at all.'
          : 'Bamboozled! She rewarded the worst of them.';
    const side = el('div', 'results-side');
    side.append(el('div', 'results-verdict', `${nameOf(s, s.grandmaId)} (Grandma): ${verdict}`));
    const ids = Object.keys(r.shares);
    const mostSab = Math.max(0, ...ids.map((id) => r.sabotage[id] ?? 0));
    if (mostSab > 0) {
      const worst = ids.filter((id) => (r.sabotage[id] ?? 0) === mostSab).map((id) => nameOf(s, id));
      side.append(el('div', 'results-line', `Most sabotage: ${listNames(worst)} (${mostSab} point${mostSab === 1 ? '' : 's'}${worst.length > 1 ? ' each' : ''})`));
    }
    const mostVotes = Math.max(0, ...ids.map((id) => r.votes[id] ?? 0));
    if (r.votedWorst) side.append(el('div', 'results-line', `The family voted ${nameOf(s, r.votedWorst)} the worst.`));
    else if (mostVotes > 0) {
      const tied = ids.filter((id) => (r.votes[id] ?? 0) === mostVotes).map((id) => nameOf(s, id));
      side.append(el('div', 'results-line', `The family could not agree on the worst: ${listNames(tied)}.`));
    }
    top.append(score, side);
    this.root.appendChild(top);

    const table = el('table', 'results-table');
    const head = el('tr');
    for (const h of ['Cousin', 'Share', 'Outcome', 'Sabotage', 'Votes']) head.appendChild(el('th', '', h));
    table.appendChild(head);
    const order = [...r.order].reverse();
    for (const id of order) {
      const c = s.cousin(id);
      const tr = el('tr', id === s.selfId ? 'self' : '');
      const nameTd = el('td', 'rt-name');
      nameTd.append(swatch(c?.color ?? '#888', c?.item), el('span', 'rt-name-text', nameOf(s, id)));
      if (isBot(s, id)) nameTd.appendChild(botGlyph());
      const out = cousinOutcome(r.shares, id);
      const outTd = el('td');
      outTd.appendChild(el('span', `rl-outcome ${out}`, OUTCOME_TEXT[out]));
      tr.append(nameTd, el('td', '', `${r.shares[id] ?? 0}%`), outTd,
        el('td', (r.sabotage[id] ?? 0) > 0 ? 'sab' : '', String(r.sabotage[id] ?? 0)), el('td', '', String(r.votes[id] ?? 0)));
      table.appendChild(tr);
    }
    this.root.appendChild(table);
    const mt = r.metrics;
    this.root.appendChild(el('div', 'results-metrics',
      `Shoves ${mt.shoves} - Breaks ${mt.breaks} - Plants ${mt.plants} (owner accused ${mt.plantsAccusedOwner})` +
      (mt.framingAccuracy !== null ? ` - Framing success ${Math.round(mt.framingAccuracy * 100)}%` : '')));
    this.root.appendChild(this.timer);
  }

  frame(s: GameState, now: number): void {
    setText(this.timer, `Back to the lobby in ${Math.max(0, Math.ceil(s.phaseEndsAt - now))}`);
  }
}
