// The secret event log: everything that happened, used for Grandma's score,
// the moments list, the framing metric and the bots' reactions. Nothing here
// is sent to clients except moments (as they happen) and the final tally.
import { MOMENT, SABOTAGE_POINTS, WILL } from '../shared/constants.js';
import { EMOTE, EMOTES } from '../shared/emotes.js';
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
  /** Last Behind Her Back / The Cheek of It moment per actor. */
  private lastRude = new Map<string, number>();
  /**
   * Grandma is playing dead right now (the match keeps this up to date): what
   * she sees is Dancing on Her Grave, a compliment Gone Too Soon (once each per
   * collapse: `mourned` is cleared when she drops again).
   */
  nanaDead = false;
  private lastGrave = new Map<string, number>();
  readonly mourned = new Set<string>();
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
   * the same visit, and only while the owner had not got the item back since
   * it was planted (a 'recovered' entry ends it).
   */
  framedPlants(): Map<number, { accuse: number; t: number }> {
    const out = new Map<number, { accuse: number; t: number }>();
    const evs = this.events;
    const recoveredBetween = (item: string, owner: string, from: number, to: number): boolean => {
      for (let i = from + 1; i < to; i++) {
        const e = evs[i];
        if (e.kind === 'recovered' && e.item === item && e.by === owner) return true;
      }
      return false;
    };
    evs.forEach((a, ai) => {
      if (a.kind !== 'accuse') return;
      const link = (pi: number | null) => {
        if (pi === null || pi > ai || out.has(pi)) return;
        const p = evs[pi];
        if (!p || p.kind !== 'plant' || p.owner !== a.target || p.by === a.target || p.t > a.t) return;
        if (recoveredBetween(p.item, p.owner, pi, ai)) return;
        out.set(pi, { accuse: ai, t: a.t });
      };
      if (a.crime !== null && evs[a.crime]?.kind === 'plant') link(a.crime);
      // The newest find of one of the target's items before this accusation, if it was this visit.
      for (let i = ai - 1; i >= 0; i--) {
        const f = evs[i];
        if (f.kind === 'found' && f.owner === a.target) {
          if (f.visit === a.visit) link(f.plant);
          break;
        }
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
        const rude = before((e) => e.kind === 'rude' && e.by === d.target && e.seen);
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
        } else if (rude >= 0) {
          why = `saw ${who} ${EMOTES[(ev[rude] as Extract<LogEvent, { kind: 'rude' }>).emote].saw}`;
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
        // The actor is told this one mid-match: never say which heirloom was her Favourite (that waits for the reading).
        this.addMoment({ kind: 'caught-red-handed', t: ev.t, actor: ev.by, text: `${n(ev.by)} was caught red-handed (${describe(ev, false)}).` }, this.events.length - 1);
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
    // While she plays dead: rudeness or sabotage she sees is Dancing on Her Grave; a compliment is Gone Too Soon.
    if (this.nanaDead) {
      if ((ev.kind === 'rude' || isSabotage(ev)) && ev.seen && ev.by) {
        const last = this.lastGrave.get(ev.by) ?? -Infinity;
        if (ev.t - last >= 6) {
          this.lastGrave.set(ev.by, ev.t);
          this.addMoment({ kind: 'graveside', t: ev.t, actor: ev.by, ...(ev.kind === 'shove' ? { victim: ev.victim } : {}), text: `${n(ev.by)} ${graveside(ev, n)} She was only resting.` }, this.events.length - 1);
        }
        return;
      }
      if (ev.kind === 'compliment' && !this.mourned.has(ev.by)) {
        this.mourned.add(ev.by);
        this.addMoment({ kind: 'mourner', t: ev.t, actor: ev.by, text: `${n(ev.by)} wept over Nana's body: "${ev.line}". She heard every word.` }, this.events.length - 1);
      }
    }
    // Rudeness aimed at Nana: unseen, it is Behind Her Back; up close and seen, The Cheek of It.
    if (ev.kind === 'rude' && ev.atNana && (!ev.seen || ev.sharp)) {
      const last = this.lastRude.get(ev.by) ?? -Infinity;
      if (ev.t - last >= EMOTE.momentGap) {
        this.lastRude.set(ev.by, ev.t);
        const did = EMOTES[ev.emote].did;
        this.addMoment(ev.seen
          ? { kind: 'cheek', t: ev.t, actor: ev.by, text: `${n(ev.by)} ${did} right in front of Nana.` }
          : { kind: 'behind-her-back', t: ev.t, actor: ev.by, text: `${n(ev.by)} ${did} behind Nana's back.` }, this.events.length - 1);
      }
    }
    if (ev.kind === 'overboard') {
      this.addMoment(ev.by
        ? { kind: 'overboard', t: ev.t, actor: ev.by, victim: ev.victim, text: `${n(ev.by)} sent ${n(ev.victim)} overboard.` }
        : { kind: 'overboard', t: ev.t, actor: ev.victim, text: `${n(ev.victim)} went overboard all on their own.` }, this.events.length - 1);
    }
    // Under Cover of Thunder: smashed while the thunder rolled, where she could not see it.
    if (ev.kind === 'break' && ev.thunder && ev.by) {
      this.addMoment({ kind: 'thunder', t: ev.t, actor: ev.by, text: `${n(ev.by)} smashed the ${n(ev.heirloom)} on the thunderclap. Nana never heard a thing.` }, this.events.length - 1);
    }
    // Early Burial: knocked flying into an open coffin, and the lid comes down.
    if (ev.kind === 'buried') {
      this.addMoment(ev.by
        ? { kind: 'buried', t: ev.t, actor: ev.by, victim: ev.victim, text: `${n(ev.by)} buried ${n(ev.victim)} alive in ${ev.coffin}.` }
        : { kind: 'buried', t: ev.t, actor: ev.victim, text: `${n(ev.victim)} fell into ${ev.coffin}. The lid did the rest.` }, this.events.length - 1);
    }
    // The Cat-apult: Mittens, thrown, took an heirloom with her (never which: it might be the Favourite).
    if (ev.kind === 'catapult') {
      this.addMoment({ kind: 'catapult', t: ev.t, actor: ev.by, text: `${n(ev.by)} threw Mittens. Mittens took an heirloom with her.` }, this.events.length - 1);
    }
    // Grandpa's ashes: shoved in by a cousin (a trail that leads to the wrong person), or trodden in all by yourself.
    if (ev.kind === 'ash') {
      this.addMoment(ev.pushedBy
        ? { kind: 'grandpa', t: ev.t, actor: ev.pushedBy, victim: ev.by, text: `${n(ev.pushedBy)} shoved ${n(ev.by)} into Grandpa's ashes.` }
        : { kind: 'grandpa', t: ev.t, actor: ev.by, text: `${n(ev.by)} trod in Grandpa and walked him all over the house.` }, this.events.length - 1);
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

/** An act of sabotage in a few words. `favourite`: may say the heirloom was her Favourite (only at the reading). */
/** What someone did over Nana's "body" (never which heirloom: the Favourite stays secret until the reading). */
function graveside(ev: SabotageEvent | Extract<LogEvent, { kind: 'rude' }>, n: (id: string) => string): string {
  switch (ev.kind) {
    case 'rude': return `${EMOTES[ev.emote].did} over Nana's body.`;
    case 'shove': return `shoved ${n(ev.victim)} over Nana's body.`;
    case 'break': return "smashed an heirloom beside Nana's body.";
    case 'steal': return `went through ${n(ev.owner)}'s pockets beside Nana's body.`;
    case 'plant': return "planted evidence beside Nana's body.";
    case 'knock-specs': return "knocked the spectacles off Nana's body.";
  }
}

function describe(ev: SabotageEvent, favourite = true): string {
  switch (ev.kind) {
    case 'shove': return 'a shove';
    case 'break': return favourite && ev.favourite ? 'the favourite heirloom' : 'a broken heirloom';
    case 'steal': return 'a theft';
    case 'plant': return 'planting evidence';
    case 'knock-specs': return "Nana's spectacles";
  }
}
