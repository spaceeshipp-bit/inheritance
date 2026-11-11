// The Reading of the Will (the family solicitor reads from lowest share to
// highest, then the tagged moments), and the final results with Grandma's
// score and who actually sabotaged.
import { READING_TIME } from '../../../shared/constants.js';
import { cousinOutcome } from '../../../shared/scoring.js';
import type { FinalResult, MomentKind, ReadingResult } from '../../../shared/types.js';
import type { GameState } from '../state.js';
import { el, setText } from '../util.js';

const MOMENT_TITLES: Record<MomentKind, string> = {
  'love-you-nana': 'Love You, Nana',
  framed: 'Framed!',
  'caught-red-handed': 'Caught Red-Handed',
  'big-cut': 'The Big Cut',
  'favourite-broken': 'Her Favourite, Broken',
};

const OUTCOME_TEXT = { winner: 'Inherits the lot', partial: 'Gets a share', disgraced: 'Cut off without a penny' } as const;

export class ReadingScreen {
  readonly root = el('div', 'phase-card reading');
  private lines: HTMLElement[] = [];
  private start = performance.now();
  private interval: number;
  private timer = el('div', 'phase-timer');

  constructor(s: GameState, r: ReadingResult) {
    this.root.appendChild(el('div', 'reveal-kicker', 'The Reading of the Will'));
    this.root.appendChild(el('div', 'lawyer', 'Mr Pettigrew, the family solicitor, clears his throat and unfolds the parchment...'));
    const cols = el('div', 'reading-cols');
    const list = el('div', 'reading-list');
    const n = r.order.length;
    this.interval = Math.max(1.2, Math.min(2.6, (READING_TIME - 6) / Math.max(1, n)));
    r.order.forEach((id, i) => {
      const c = s.cousin(id);
      const share = r.shares[id] ?? 0;
      const line = el('div', 'reading-line hidden');
      const sw = el('span', 'swatch big');
      sw.style.background = c?.color ?? '#888';
      const who = el('span', 'rl-name', c?.name ?? s.name(id));
      const what = el('span', 'rl-text', share === 0 ? 'nothing at all.' : i === n - 1 ? `${share}%... and the house.` : `${share}%.`);
      const out = cousinOutcome(r.shares, id);
      line.append(sw, el('span', 'rl-to', 'To'), who, el('span', 'rl-to', 'I leave'), what, el('span', `rl-outcome ${out}`, OUTCOME_TEXT[out]));
      if (id === s.selfId) line.classList.add('self');
      list.appendChild(line);
      this.lines.push(line);
    });
    const moments = el('div', 'moments');
    moments.appendChild(el('div', 'pref-title', 'Moments'));
    if (!r.moments.length) moments.appendChild(el('div', 'moment-empty', 'A suspiciously quiet afternoon.'));
    for (const m of r.moments.slice(0, 8)) {
      const row = el('div', `moment ${m.kind}`);
      row.append(el('div', 'moment-title', MOMENT_TITLES[m.kind] ?? m.kind), el('div', 'moment-text', m.text));
      moments.appendChild(row);
    }
    cols.append(list, moments);
    this.root.append(cols, this.timer);
  }

  frame(s: GameState, now: number): void {
    const t = (performance.now() - this.start) / 1000;
    const shown = Math.floor(t / this.interval) + 1;
    this.lines.forEach((l, i) => l.classList.toggle('hidden', i >= shown));
    setText(this.timer, `${Math.max(0, Math.ceil(s.phaseEndsAt - now))}`);
  }
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
    const gName = s.name(s.grandmaId);
    const side = el('div', 'results-side');
    side.append(el('div', 'results-verdict', `${gName} (Grandma): ${verdict}`));
    const worstSab = Object.keys(r.sabotage).sort((a, b) => (r.sabotage[b] ?? 0) - (r.sabotage[a] ?? 0))[0];
    if (worstSab && (r.sabotage[worstSab] ?? 0) > 0) side.append(el('div', 'results-line', `Most sabotage: ${s.name(worstSab)} (${r.sabotage[worstSab]} points)`));
    if (r.votedWorst) side.append(el('div', 'results-line', `The family voted ${s.name(r.votedWorst)} the worst.`));
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
      const sw = el('span', 'swatch');
      sw.style.background = c?.color ?? '#888';
      nameTd.append(sw, el('span', '', c?.name ?? s.name(id)));
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
