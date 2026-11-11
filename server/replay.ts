// What Nana Saw (GDD signature feature; BUILD_PLAN 5): the match keeps the last
// few seconds as frames, ten a second, of where everyone really was beside how
// Grandma perceived each of them. Around every act of sabotage it cuts a clip
// (a few seconds before to two after), and at the reading the best moments go
// out with their clips, so everyone can watch her blurred, muffled view next
// to the truth. Nothing here reaches a client before the reading.
import type { LogEvent, Moment, MomentKind, Replay, ReplayFrame, ReplayProp, ReplaySpeech } from '../shared/types.js';

/** Frames a second. */
export const REPLAY_HZ = 10;
/** Seconds of frames kept (the longest pre-roll a clip may need). */
const KEEP = 10;
/** A clip runs from this long before its event (longer for a Love You, Nana) to this long after. */
const BEFORE = 5;
const AFTER = 2;
/** Clips kept per kind of event, first come first kept: a shove-fest does not crowd out the plant. */
const CLIPS_PER_KIND: Partial<Record<LogEvent['kind'], number>> = { shove: 6, break: 6, plant: 6, steal: 3, 'knock-specs': 2 };
/** Which moments make the best replays, best first. Big Cut is Nana's own doing: nothing hidden to show. */
const PRIORITY: Partial<Record<MomentKind, number>> = { framed: 5, 'love-you-nana': 4, 'caught-red-handed': 3, 'favourite-broken': 3 };
/** Replays sent with the reading. */
export const REPLAYS_AT_READING = 3;

interface Pending { key: number; from: number; to: number }
interface Clip { key: number; from: number; to: number; frames: ReplayFrame[] }

/** A frame as the match samples it (props complete; they are thinned to changes inside each clip). */
export type FullFrame = ReplayFrame;

export class ReplayRecorder {
  private frames: FullFrame[] = [];
  private speech: ReplaySpeech[] = [];
  private pending: Pending[] = [];
  private clips = new Map<number, Clip>();
  private perKind = new Map<string, number>();
  private nextSample = -Infinity;

  /** Call every tick while a visit runs; `sample` is only called when a frame is due. */
  tick(time: number, sample: () => FullFrame): void {
    if (time + 1e-9 >= this.nextSample) {
      this.nextSample = time + 1 / REPLAY_HZ;
      this.frames.push(sample());
      const keepFrom = time - KEEP;
      while (this.frames.length && this.frames[0].t < keepFrom) this.frames.shift();
      while (this.speech.length && this.speech[0].t < keepFrom - 30) this.speech.shift();
    }
    for (const p of [...this.pending]) if (time >= p.to) this.cut(p);
  }

  /**
   * An event went into the log. Acts of sabotage get a clip; a shove soon
   * after the shover sweet-talked Nana starts at the sweet talk.
   */
  event(ev: LogEvent, index: number, sweetTalkAt: number | null): void {
    const cap = CLIPS_PER_KIND[ev.kind];
    if (cap === undefined) return;
    const n = this.perKind.get(ev.kind) ?? 0;
    if (n >= cap) return;
    this.perKind.set(ev.kind, n + 1);
    const from = sweetTalkAt !== null && ev.t - sweetTalkAt <= KEEP - AFTER ? Math.min(ev.t - BEFORE, sweetTalkAt - 0.5) : ev.t - BEFORE;
    this.pending.push({ key: index, from, to: ev.t + AFTER });
  }

  /** Something was said: what, and what Grandma heard of it (null: nothing). */
  said(s: ReplaySpeech): void {
    this.speech.push(s);
  }

  /** The visit ended (or the will is being read): cut what is pending with the frames there are. */
  flush(): void {
    for (const p of [...this.pending]) this.cut(p);
  }

  /** The best moments with clips, best first, at most `n`, one per event. */
  replays(moments: Moment[], eventOf: (m: Moment) => number | undefined, n = REPLAYS_AT_READING): Replay[] {
    const ranked = moments
      .map((m, i) => ({ m, i, key: eventOf(m), p: PRIORITY[m.kind] ?? 0 }))
      .filter((x) => x.p > 0 && x.key !== undefined && this.clips.has(x.key))
      .sort((a, b) => b.p - a.p || a.i - b.i);
    const out: Replay[] = [];
    const used = new Set<number>();
    for (const x of ranked) {
      const key = x.key as number;
      if (used.has(key)) continue;
      used.add(key);
      const c = this.clips.get(key) as Clip;
      out.push({ moment: x.m, from: c.from, to: c.to, frames: c.frames, speech: this.speech.filter((s) => s.t >= c.from && s.t <= c.to) });
      if (out.length >= n) break;
    }
    return out;
  }

  /** Clips kept so far (tests). */
  get clipCount(): number { return this.clips.size; }

  private cut(p: Pending): void {
    this.pending = this.pending.filter((q) => q !== p);
    const frames = this.frames.filter((f) => f.t >= p.from - 1e-6 && f.t <= p.to + 1e-6);
    if (frames.length === 0) return;
    this.clips.set(p.key, { key: p.key, from: p.from, to: p.to, frames: thinProps(frames) });
  }
}

/** Keep only the props that appeared or changed since the previous frame (all of them in the first). */
function thinProps(frames: FullFrame[]): ReplayFrame[] {
  const last = new Map<string, ReplayProp>();
  return frames.map((f, i) => {
    const props = f.props.filter((p) => {
      const q = last.get(p.id);
      last.set(p.id, p);
      return i === 0 || !q || q.x !== p.x || q.y !== p.y || q.z !== p.z || q.yaw !== p.yaw || q.broken !== p.broken || q.heldBy !== p.heldBy || q.hidden !== p.hidden;
    });
    return { ...f, props };
  });
}
