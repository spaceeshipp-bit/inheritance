// The reading as theatre: once the will has been read out, the family reacts
// where they stand. Whoever got the most does a smug gold-digger shimmy, anyone
// cut off without a penny weeps (real tears this time), Nana reminds everyone
// she is still alive, and the rest put on their bravest face (heart hands).
// Purely cosmetic and client-side: the gestures ride on the characters'
// snapshots, the same way a real emote does.
import type { EmoteId } from '../../../shared/emotes.js';
import type { CharSnap } from '../../../shared/types.js';

export interface Reaction { emote: EmoteId; /** Seconds after the reveal it starts (a little stagger reads better). */ delay: number }

/** Who reacts how, from the final shares (empty while there is nothing to react to). */
export function reactions(shares: Record<string, number> | null, grandmaId: string): Map<string, Reaction> {
  const out = new Map<string, Reaction>();
  if (!shares) return out;
  const ids = Object.keys(shares);
  if (ids.length === 0) return out;
  const top = Math.max(...ids.map((id) => shares[id]));
  const winners = ids.filter((id) => shares[id] === top);
  ids.forEach((id, i) => {
    const s = shares[id];
    const emote: EmoteId = s === top && winners.length === 1 ? 'gold-digger' : s === 0 ? 'crocodile-tears' : s === top ? 'will-jig' : 'heart-hands';
    out.set(id, { emote, delay: 0.3 + (i % 4) * 0.35 });
  });
  out.set(grandmaId, { emote: 'still-alive', delay: 0.9 });
  return out;
}

/**
 * The characters with their reactions on, `since` seconds after the reveal.
 * Gestures loop (a sob, a shimmy) for as long as the scene is up.
 */
export function withReactions(chars: Iterable<CharSnap>, rs: Map<string, Reaction>, since: number, secsOf: (e: EmoteId) => number): CharSnap[] {
  const out: CharSnap[] = [];
  for (const c of chars) {
    const r = rs.get(c.id);
    const t = r ? since - r.delay : -1;
    if (!r || t < 0 || c.state !== 'normal') { out.push(c); continue; }
    const len = secsOf(r.emote);
    out.push({ ...c, vel: { x: 0, y: 0, z: 0 }, emote: r.emote, emoteT: t % len });
  }
  return out;
}
