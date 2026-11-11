// The secret event log: everything that happened, used for Grandma's score,
// the moments list, the framing metric and the bots' reactions. Nothing here
// is sent to clients except moments (as they happen) and the final tally.
import { MOMENT, SABOTAGE_POINTS, WILL } from '../shared/constants.js';
import type { FinalResult, LogEvent, Moment, NanaReason } from '../shared/types.js';

export type SabotageKind = 'shove' | 'break' | 'steal' | 'plant' | 'knock-specs';
export type SabotageEvent = Extract<LogEvent, { kind: SabotageKind }>;

export function isSabotage(ev: LogEvent): ev is SabotageEvent {
  return ev.kind === 'shove' || ev.kind === 'break' || ev.kind === 'steal' || ev.kind === 'plant' || ev.kind === 'knock-specs';
}

/** Who did a sabotage act (null for an heirloom that broke on its own). */
export function culprit(ev: SabotageEvent): string | null {
  return ev.by;
}

export function sabotagePoints(ev: LogEvent): number {
  switch (ev.kind) {
    case 'shove': return SABOTAGE_POINTS.shove;
    case 'break': return ev.favourite ? SABOTAGE_POINTS.breakFavourite : SABOTAGE_POINTS.break;
    case 'steal': return SABOTAGE_POINTS.steal;
    case 'plant': return SABOTAGE_POINTS.plant;
    case 'knock-specs': return SABOTAGE_POINTS.knockSpectacles;
    default: return 0;
  }
}

export type LogListener = (ev: LogEvent, index: number) => void;
export type MomentListener = (m: Moment) => void;

export class EventLog {
  readonly events: LogEvent[] = [];
  readonly moments: Moment[] = [];
  private logListeners: LogListener[] = [];
  private momentListeners: MomentListener[] = [];
  /** Plant event indices already turned into a Framed moment. */
  private framed = new Set<number>();
  /** Last caught-red-handed moment per actor (to avoid spamming the reading). */
  private lastCaught = new Map<string, number>();
  /** Last Love You, Nana moment per actor. */
  private lastLoveYou = new Map<string, number>();
  /** The log index of the event each moment is about (for its replay). Server-side only. */
  private momentEvents = new Map<Moment, number>();

  constructor(private name: (id: string) => string = (id) => id) {}

  onLog(l: LogListener): void { this.logListeners.push(l); }
  onMoment(l: MomentListener): void { this.momentListeners.push(l); }

  /** Append an event; derives moments. Returns its index. */
  add(ev: LogEvent): number {
    const index = this.events.push(ev) - 1;
    this.deriveMoments(ev);
    for (const l of this.logListeners) l(ev, index);
    return index;
  }

  addMoment(m: Moment, event?: number): void {
    this.moments.push(m);
    if (event !== undefined) this.momentEvents.set(m, event);
    for (const l of this.momentListeners) l(m);
  }

  /** The log index of the event a moment is about, if it has one. */
  momentEvent(m: Moment): number | undefined {
    return this.momentEvents.get(m);
  }

  count(kind: LogEvent['kind']): number {
    return this.events.reduce((n, e) => n + (e.kind === kind ? 1 : 0), 0);
  }

  /** Sabotage points per cousin (only ids in `cousins` are reported). */
  sabotageTally(cousins: string[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const id of cousins) out[id] = 0;
    for (const ev of this.events) {
      if (!isSabotage(ev) || ev.by === null) continue;
      if (ev.by in out) out[ev.by] += sabotagePoints(ev);
    }
    return out;
  }

  /**
   * Plants (by log index) that led Grandma to accuse their owner: the
   * accusation's crime is that plant, or it targets the owner of an item she
   * found while it was still planted (the 'found' entry links the plant), in
   * the same visit and before the owner took it back.
   */
  framedPlants(): Map<number, { accuse: number; t: number }> {
    const out = new Map<number, { accuse: number; t: number }>();
    const evs = this.events;
    evs.forEach((a, ai) => {
      if (a.kind !== 'accuse') return;
      const link = (pi: number | null) => {
        if (pi === null || out.has(pi)) return;
        const p = evs[pi];
        if (!p || p.kind !== 'plant' || p.owner !== a.target || p.by === a.target || p.t > a.t) return;
        out.set(pi, { accuse: ai, t: a.t });
      };
      if (a.crime !== null && evs[a.crime]?.kind === 'plant') link(a.crime);
      // The newest find of one of the target's items before this accusation.
      for (let i = ai - 1; i >= 0; i--) {
        const f = evs[i];
        if (f.kind === 'found' && f.owner === a.target) { link(f.plant); break; }
      }
    });
    return out;
  }

  /** Playtest metrics. */
  metrics(): FinalResult['metrics'] {
    const plants = this.events.filter((e): e is Extract<LogEvent, { kind: 'plant' }> => e.kind === 'plant');
    const plantsAccusedOwner = this.framedPlants().size;
    return {
      plants: plants.length,
      plantsAccusedOwner,
      framingAccuracy: plants.length > 0 ? plantsAccusedOwner / plants.length : null,
      shoves: this.count('shove'),
      breaks: this.count('break'),
    };
  }

  /**
   * Nana's reasons in the margin: her biggest will decisions, each with what
   * she had just perceived about that cousin, and what really happened. A Tut
   * is explained by (best first) the crime she linked it to, a planted item of
   * theirs she found, sabotage she saw them do, or a tattle; a Bless by an
   * errand they ran or sweet talk she heard. Wrong calls come first: they are
   * the jokes. At most `n`.
   */
  reasons(n = 3): NanaReason[] {
    const ev = this.events;
    const nm = this.name;
    // Her decisions: one per cousin per few seconds (a parchment drag is many small edits).
    const decisions: { i: number; t: number; target: string; via: NanaReason['via']; moved: number }[] = [];
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.kind !== 'will' || e.via === 'takeover') continue;
      const last = decisions[decisions.length - 1];
      if (last && last.target === e.target && last.via === e.via && e.t - last.t <= 5) { last.moved += e.moved; last.t = e.t; continue; }
      decisions.push({ i, t: e.t, target: e.target, via: e.via, moved: e.moved });
    }
    const sabotageBy = (who: string, from: number, to: number): SabotageEvent | undefined =>
      ev.find((x): x is SabotageEvent => isSabotage(x) && x.by === who && x.t >= from && x.t <= to);
    const out: (NanaReason & { wrong: boolean; size: number })[] = [];
    for (const d of decisions) {
      if (Math.abs(d.moved) < 3) continue;
      const before = (k: (e: LogEvent) => boolean): number => {
        for (let j = d.i; j >= 0 && d.t - ev[j].t <= 20; j--) if (k(ev[j])) return j;
        return -1;
      };
      const who = nm(d.target);
      let why = '', truth: string | null = null;
      if (d.moved < 0) {
        const acc = before((e) => e.kind === 'accuse' && e.target === d.target);
        const found = before((e) => e.kind === 'found' && e.owner === d.target);
        const saw = before((e) => isSabotage(e) && e.by === d.target && !!e.seen);
        const tat = before((e) => e.kind === 'tattle' && e.accused === d.target);
        const left = before((e) => e.kind === 'left-table' && e.by === d.target);
        const accE = acc >= 0 ? ev[acc] : null;
        const crime = accE && accE.kind === 'accuse' && accE.crime !== null ? ev[accE.crime] : null;
        if (found >= 0) {
          const f = ev[found] as Extract<LogEvent, { kind: 'found' }>;
          const p = f.plant !== null ? ev[f.plant] : null;
          why = `found ${who}'s ${nm(f.item).toLowerCase()} where it shouldn't be`;
          truth = p && p.kind === 'plant' && p.by !== d.target ? `${nm(p.by)} planted it there.` : null;
        } else if (crime && isSabotage(crime)) {
          why = `${who} was near ${describe(crime)}`;
          truth = crime.by && crime.by !== d.target ? `${nm(crime.by)} did it.` : null;
        } else if (saw >= 0) {
          why = `saw ${who} at ${describe(ev[saw] as SabotageEvent)}`;
        } else if (left >= 0) {
          const lt = ev[left];
          why = `${who} left the dinner table`;
          const bad = sabotageBy(d.target, lt.t - 20, d.t);
          truth = bad ? null : `${who} only went for a wander.`;
        } else if (tat >= 0) {
          const tt = ev[tat] as Extract<LogEvent, { kind: 'tattle' }>;
          why = `${nm(tt.by)} told her it was ${who}`;
          truth = sabotageBy(d.target, tt.t - 30, tt.t) ? null : `${who} had done nothing.`;
        } else {
          why = 'a feeling in her bones';
          truth = sabotageBy(d.target, d.t - 60, d.t) ? null : `${who} had done nothing.`;
        }
      } else {
        const wish = before((e) => e.kind === 'wish' && e.by === d.target);
        const sweet = before((e) => e.kind === 'compliment' && e.by === d.target);
        if (wish >= 0) why = `${who} ran her errand`;
        else if (sweet >= 0) why = `${who} said such lovely things`;
        else why = 'a soft spot for them';
        const bad = sabotageBy(d.target, d.t - 30, d.t + 30);
        truth = bad ? `${who} was behind ${describe(bad)}.` : null;
      }
      out.push({ target: d.target, via: d.via, moved: d.moved, why, truth, wrong: truth !== null, size: Math.abs(d.moved) });
    }
    out.sort((a, b) => Number(b.wrong) - Number(a.wrong) || b.size - a.size);
    return out.slice(0, n).map(({ target, via, moved, why, truth }) => ({ target, via, moved, why, truth }));
  }

  /** Points moved per cousin within [t0, t1] (negative = lost), from 'will' events. */
  willDeltaSince(t0: number): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.events) if (e.kind === 'will' && e.t >= t0) out[e.target] = (out[e.target] ?? 0) + e.moved;
    return out;
  }

  private deriveMoments(ev: LogEvent): void {
    const n = this.name;
    // Caught Red-Handed: inside her SHARP vision (seen = she could tell who; sharp = in plain sight up close).
    if (isSabotage(ev) && ev.sharp && ev.by) {
      const last = this.lastCaught.get(ev.by) ?? -Infinity;
      if (ev.t - last >= 10) {
        this.lastCaught.set(ev.by, ev.t);
        this.addMoment({ kind: 'caught-red-handed', t: ev.t, actor: ev.by, text: `${n(ev.by)} was caught red-handed (${describe(ev)}).` }, this.events.length - 1);
      }
    }
    if (ev.kind === 'shove' && !ev.seen) {
      const flattered = this.events.some(
        (e) => e.kind === 'compliment' && e.by === ev.by && e.t <= ev.t && ev.t - e.t <= MOMENT.loveYouNanaWindow,
      );
      const last = this.lastLoveYou.get(ev.by) ?? -Infinity;
      if (flattered && ev.t - last >= 30) {
        this.lastLoveYou.set(ev.by, ev.t);
        this.addMoment({ kind: 'love-you-nana', t: ev.t, actor: ev.by, victim: ev.victim, text: `${n(ev.by)} told Nana they loved her, then shoved ${n(ev.victim)}.` }, this.events.length - 1);
      }
    }
    if (ev.kind === 'break' && ev.favourite) {
      this.addMoment({
        kind: 'favourite-broken', t: ev.t, actor: ev.by ?? 'nobody',
        text: ev.by ? `${n(ev.by)} broke Nana's favourite heirloom.` : `Nana's favourite heirloom broke.`,
      }, this.events.length - 1);
    }
    if (ev.kind === 'accuse') {
      for (const [i] of this.framedPlants()) {
        const p = this.events[i];
        if (p.kind !== 'plant' || this.framed.has(i)) continue;
        this.framed.add(i);
        this.addMoment({ kind: 'framed', t: ev.t, actor: p.by, victim: p.owner, text: `${n(p.by)} framed ${n(p.owner)} with their own ${n(p.item).toLowerCase()}, and Nana fell for it.` }, i);
      }
    }
  }

  /** Called by the match when a parchment opening closes: Big Cut for anyone who lost enough. */
  bigCuts(t: number, grandmaId: string, lossBy: Record<string, number>): void {
    for (const [id, lost] of Object.entries(lossBy)) {
      if (lost >= WILL.bigCutPoints) {
        this.addMoment({ kind: 'big-cut', t, actor: grandmaId, victim: id, text: `Nana cut ${this.name(id)} by ${lost} points in one go.` });
      }
    }
  }
}

function describe(ev: SabotageEvent): string {
  switch (ev.kind) {
    case 'shove': return 'a shove';
    case 'break': return ev.favourite ? 'the favourite heirloom' : 'a broken heirloom';
    case 'steal': return 'a theft';
    case 'plant': return 'planting evidence';
    case 'knock-specs': return "Nana's spectacles";
  }
}
