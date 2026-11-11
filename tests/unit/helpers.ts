// Shared helpers for the unit tests.
import { GALLERY_Y } from '../../shared/map.js';
import type { ServerMsg } from '../../shared/protocol.js';
import { Match, type MatchConfig, type MatchPlayer } from '../../server/match.js';
import type { MatchOptions } from '../../shared/types.js';

export { COUSIN, FALL_RAGDOLL_HEIGHT, HEIRLOOM, RAGDOLL_TIME, TICK_HZ } from '../../shared/constants.js';
export const GALLERY_Y_FOR_TESTS = GALLERY_Y;

export interface Inbox {
  all: { to: string; msg: ServerMsg }[];
  of(id: string): ServerMsg[];
  events(id: string, e?: string): Extract<ServerMsg, { t: 'ev' }>[];
  clear(): void;
}

export function inbox(): Inbox & { send: (to: string, msg: ServerMsg) => void } {
  const all: { to: string; msg: ServerMsg }[] = [];
  return {
    all,
    send: (to, msg) => { all.push({ to, msg }); },
    of: (id) => all.filter((m) => m.to === id).map((m) => m.msg),
    events: (id, e) => all
      .filter((m) => m.to === id && m.msg.t === 'ev' && (!e || (m.msg as { e: string }).e === e))
      .map((m) => m.msg as Extract<ServerMsg, { t: 'ev' }>),
    clear: () => { all.length = 0; },
  };
}

export function players(humans: string[], bots: string[]): MatchPlayer[] {
  return [
    ...humans.map((id) => ({ id, name: id.toUpperCase(), isBot: false })),
    ...bots.map((id) => ({ id, name: `Bot ${id}`, isBot: true })),
  ];
}

export function makeMatch(opts: {
  humans?: string[]; bots?: string[]; grandmaId: string; options?: Partial<MatchOptions>; fast?: boolean; seed?: number;
  onEnd?: MatchConfig['onEnd'];
}): { m: Match; box: ReturnType<typeof inbox> } {
  const box = inbox();
  const m = new Match({
    players: players(opts.humans ?? [], opts.bots ?? []),
    grandmaId: opts.grandmaId,
    options: { fullMatch: false, fillBots: true, pushGrandma: false, ...opts.options },
    fast: opts.fast ?? true,
    seed: opts.seed ?? 1,
    send: box.send,
    onEnd: opts.onEnd,
  });
  return { m, box };
}

/** Step until `pred` or `maxSecs` of match time. */
export function stepUntil(m: Match, pred: () => boolean, maxSecs = 60): boolean {
  const end = m.time + maxSecs;
  while (m.time < end) {
    if (pred()) return true;
    m.step(1 / 30);
  }
  return pred();
}

/** Skip the role reveal into the first visit. */
export function toVisit(m: Match): void {
  m.start();
  stepUntil(m, () => m.phase === 'visit', 30);
}
