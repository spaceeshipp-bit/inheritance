// What Nana Saw at the reading: plays the replays the server sent with it, one
// after another, each behind a title card. For every frame it builds what the
// renderer draws (render/scene.ts frameReplay: her view above, the truth
// below), interpolated between the recorded frames (ten a second), and shows
// what was said beside what she heard.
import { REPLAY } from '../../../shared/constants.js';
import { clipSeconds, replaySeconds } from '../../../shared/replay.js';
import type { CharSnap, PropSnap, Replay, ReplayChar, ReplayFrame, ReplaySeen, Vec3 } from '../../../shared/types.js';
import type { ReplayView } from '../render/scene.js';
import type { GameState } from '../state.js';
import { el, setText, show } from '../util.js';
import { MOMENT_TITLES, cleanName, cleanText } from './ident.js';

/** Where playback is: which replay, and its title card or how far into its clip (s). */
export interface ReplayCursor { index: number; title: boolean; clip: number }

/** Find the replay and the moment within it at `t` seconds since the replays began; null once they are over. */
export function replayAt(replays: readonly Replay[], t: number): ReplayCursor | null {
  let start = 0;
  for (let i = 0; i < replays.length; i++) {
    const len = replaySeconds(replays[i]);
    if (t < start + len) {
      const into = t - start;
      if (into < REPLAY.title) return { index: i, title: true, clip: 0 };
      return { index: i, title: false, clip: Math.min(clipSeconds(replays[i]), into - REPLAY.title) };
    }
    start += len;
  }
  return null;
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
function lerpAngle(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/** What a clip needs to know about the match: who Grandma is and everyone's names. */
export interface ReplayNames { grandmaId: string; name(id: string): string }

/** One replay, ready to sample at any clip time. */
export class ReplayClip {
  /** Every prop as it stood at each frame (the recording only repeats the ones that changed). */
  private props: Map<string, PropSnap>[] = [];

  constructor(readonly r: Replay, private s: ReplayNames) {
    let cur = new Map<string, PropSnap>();
    for (const f of r.frames) {
      cur = new Map(cur);
      for (const p of f.props) {
        if (p.hidden) { cur.delete(p.id); continue; }
        cur.set(p.id, { id: p.id, kind: p.kind, pos: { x: p.x, y: p.y, z: p.z }, yaw: p.yaw, heldBy: p.heldBy, broken: p.broken, variant: p.variant, owner: p.owner });
      }
      this.props.push(cur);
    }
  }

  /** The recorded frames either side of match time `T`, and how far between them. */
  private bracket(T: number): { a: ReplayFrame; b: ReplayFrame; i: number; k: number } {
    const f = this.r.frames;
    let i = 0;
    while (i < f.length - 2 && f[i + 1].t <= T) i++;
    const a = f[i], b = f[Math.min(i + 1, f.length - 1)];
    const k = b.t > a.t ? Math.max(0, Math.min(1, (T - a.t) / (b.t - a.t))) : 0;
    return { a, b, i, k };
  }

  view(clip: number): ReplayView {
    const T = this.r.frames[0].t + clip;
    const { a, b, i, k } = this.bracket(T);
    const dt = Math.max(1e-3, b.t - a.t);
    const chars: CharSnap[] = [];
    const seen = new Map<string, ReplaySeen>();
    for (const ca of a.chars) {
      const cb: ReplayChar = b.chars.find((c) => c.id === ca.id) ?? ca;
      const role = ca.id === this.s.grandmaId ? 'grandma' : 'cousin';
      const vel = { x: (cb.x - ca.x) / dt, y: (cb.y - ca.y) / dt, z: (cb.z - ca.z) / dt };
      const speed = Math.hypot(vel.x, vel.z);
      const n = role === 'grandma' ? a.nana : null;
      chars.push({
        id: ca.id, role, pos: { x: lerp(ca.x, cb.x, k), y: lerp(ca.y, cb.y, k), z: lerp(ca.z, cb.z, k) },
        yaw: lerpAngle(ca.yaw, cb.yaw, k), pitch: 0, vel, state: ca.state, ragdollT: 0, holding: ca.holding,
        running: speed > 4.5, sneaking: false, whispering: false, charge: 0, plant: 0, leader: false,
        ...(n ? { aidActive: n.aid, specsActive: n.specs, specsOff: false } : {}),
      });
      seen.set(ca.id, ca.seen);
    }
    const nana = a.nana && b.nana ? {
      ...a.nana,
      x: lerp(a.nana.x, b.nana.x, k), y: lerp(a.nana.y, b.nana.y, k), z: lerp(a.nana.z, b.nana.z, k),
      yaw: lerpAngle(a.nana.yaw, b.nana.yaw, k), pitch: lerp(a.nana.pitch, b.nana.pitch, k),
    } : a.nana;
    return { chars, props: this.props[i], seen, nana, focus: this.focus(chars, nana), clock: clip };
  }

  /** Who the truth camera follows: whoever the moment is about. */
  private focus(chars: CharSnap[], nana: ReplayView['nana']): Vec3 {
    const m = this.r.moment;
    const who = chars.find((c) => c.id === m.actor) ?? chars.find((c) => c.id === m.victim);
    if (who) return who.pos;
    return nana ? { x: nana.x, y: nana.y, z: nana.z } : { x: 0, y: 0, z: 0 };
  }

  /** Lines spoken in the last few seconds before match time `T`: what was said, and what she heard. */
  speechAt(clip: number): { said: string; heard: string } | null {
    const T = this.r.frames[0].t + clip;
    const recent = this.r.speech.filter((s) => s.t <= T && T - s.t <= 2.8).pop();
    if (!recent) return null;
    const who = recent.from ? cleanName(this.s.name(recent.from)) : 'Someone';
    return {
      said: `${who}: "${cleanText(recent.said)}"`,
      heard: recent.heard === null ? '(Nana hears nothing)' : `Nana hears: "${cleanText(recent.heard)}"`,
    };
  }
}

export class ReplayTheatre {
  readonly root = el('div', 'replay');
  private clips: ReplayClip[];
  private card = el('div', 'replay-card');
  private cardKicker = el('div', 'replay-kicker', 'What Nana Saw');
  private cardTitle = el('div', 'replay-card-title');
  private cardText = el('div', 'replay-card-text');
  private topLabel = el('div', 'replay-label top', 'What Nana saw');
  private bottomLabel = el('div', 'replay-label bottom', 'What really happened');
  private heard = el('div', 'replay-sub top');
  private said = el('div', 'replay-sub bottom');
  private divider = el('div', 'replay-divider');
  private cursor: ReplayCursor | null = null;

  constructor(s: GameState, replays: readonly Replay[]) {
    this.clips = replays.filter((r) => r.frames.length > 0).map((r) => new ReplayClip(r, s));
    this.card.append(this.cardKicker, this.cardTitle, this.cardText);
    this.root.append(this.divider, this.topLabel, this.bottomLabel, this.heard, this.said, this.card);
    show(this.root, false);
  }

  /** Seconds all the replays take. */
  get duration(): number {
    return this.clips.reduce((a, c) => a + replaySeconds(c.r), 0);
  }

  get count(): number { return this.clips.length; }

  /** Move to `t` seconds since the replays began (negative: not yet). Returns false once they are over. */
  seek(t: number): boolean {
    this.cursor = t >= 0 ? replayAt(this.clips.map((c) => c.r), t) : null;
    const c = this.cursor;
    show(this.root, !!c);
    if (!c) return false;
    const clip = this.clips[c.index];
    show(this.card, c.title);
    setText(this.cardTitle, MOMENT_TITLES[clip.r.moment.kind] ?? clip.r.moment.kind);
    setText(this.cardText, cleanText(clip.r.moment.text));
    const line = c.title ? null : clip.speechAt(c.clip);
    show(this.heard, !!line);
    show(this.said, !!line);
    if (line) { setText(this.heard, line.heard); setText(this.said, line.said); }
    return true;
  }

  /** What the renderer should draw now, or null when no replay is playing. */
  view(): ReplayView | null {
    const c = this.cursor;
    if (!c) return null;
    return this.clips[c.index].view(c.clip);
  }
}
