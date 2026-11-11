// The secret event log: everything that happened, used for Grandma's score,
// the moments list, the framing metric and the bots' reactions. Nothing here
// is sent to clients except moments (as they happen) and the final tally.
import { MOMENT, SABOTAGE_POINTS, WILL } from '../shared/constants.js';
import type { FinalResult, LogEvent, Moment } from '../shared/types.js';

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

  addMoment(m: Moment): void {
    this.moments.push(m);
    for (const l of this.momentListeners) l(m);
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

  /** Playtest metrics. */
  metrics(): FinalResult['metrics'] {
    const plants = this.events.filter((e): e is Extract<LogEvent, { kind: 'plant' }> => e.kind === 'plant');
    const accusations = this.events.filter((e): e is Extract<LogEvent, { kind: 'accuse' }> => e.kind === 'accuse');
    const plantsAccusedOwner = plants.filter((p) => accusations.some((a) => a.target === p.owner && a.t >= p.t)).length;
    return {
      plants: plants.length,
      plantsAccusedOwner,
      framingAccuracy: plants.length > 0 ? plantsAccusedOwner / plants.length : null,
      shoves: this.count('shove'),
      breaks: this.count('break'),
    };
  }

  /** Points moved per cousin within [t0, t1] (negative = lost), from 'will' events. */
  willDeltaSince(t0: number): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.events) if (e.kind === 'will' && e.t >= t0) out[e.target] = (out[e.target] ?? 0) + e.moved;
    return out;
  }

  private deriveMoments(ev: LogEvent): void {
    const n = this.name;
    if (isSabotage(ev) && 'seen' in ev && ev.seen && ev.by) {
      const last = this.lastCaught.get(ev.by) ?? -Infinity;
      if (ev.t - last >= 10) {
        this.lastCaught.set(ev.by, ev.t);
        this.addMoment({ kind: 'caught-red-handed', t: ev.t, actor: ev.by, text: `${n(ev.by)} was caught red-handed (${describe(ev)}).` });
      }
    }
    if (ev.kind === 'shove' && !ev.seen) {
      const flattered = this.events.some(
        (e) => e.kind === 'compliment' && e.by === ev.by && e.t <= ev.t && ev.t - e.t <= MOMENT.loveYouNanaWindow,
      );
      const last = this.lastLoveYou.get(ev.by) ?? -Infinity;
      if (flattered && ev.t - last >= 30) {
        this.lastLoveYou.set(ev.by, ev.t);
        this.addMoment({ kind: 'love-you-nana', t: ev.t, actor: ev.by, victim: ev.victim, text: `${n(ev.by)} told Nana they loved her, then shoved ${n(ev.victim)}.` });
      }
    }
    if (ev.kind === 'break' && ev.favourite) {
      this.addMoment({
        kind: 'favourite-broken', t: ev.t, actor: ev.by ?? 'nobody',
        text: ev.by ? `${n(ev.by)} broke Nana's favourite heirloom.` : `Nana's favourite heirloom broke.`,
      });
    }
    if (ev.kind === 'accuse') {
      this.events.forEach((p, i) => {
        if (p.kind !== 'plant' || p.owner !== ev.target || p.by === ev.target || this.framed.has(i) || p.t > ev.t) return;
        this.framed.add(i);
        this.addMoment({ kind: 'framed', t: ev.t, actor: p.by, victim: p.owner, text: `${n(p.by)} framed ${n(p.owner)} with their own ${n(p.item).toLowerCase()}, and Nana fell for it.` });
      });
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
