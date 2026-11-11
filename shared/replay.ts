// What Nana Saw: how long the replays take at the reading. The server makes the
// reading phase this much longer and the client plays them in that time, so
// both work it out the same way.
import { REPLAY } from './constants.js';
import type { Replay } from './types.js';

/** Seconds of recorded clip a replay holds. */
export function clipSeconds(r: Replay): number {
  const f = r.frames;
  return f.length > 1 ? f[f.length - 1].t - f[0].t : 0;
}

/** Seconds one replay plays for: its title card, the clip, a pause. */
export function replaySeconds(r: Replay): number {
  return REPLAY.title + clipSeconds(r) + REPLAY.gap;
}

/** Seconds all of them take, back to back. */
export function replaysSeconds(rs: readonly Replay[] | undefined): number {
  return (rs ?? []).reduce((a, r) => a + replaySeconds(r), 0);
}
