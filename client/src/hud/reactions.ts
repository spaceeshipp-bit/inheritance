// The reading as theatre: once the will has been read out, the family reacts
// where they stand. Whoever got the most does a smug gold-digger shimmy, anyone
// cut off without a penny weeps (real tears this time), Nana reminds everyone
// she is still alive, and the rest put on their bravest face (heart hands).
// Purely cosmetic and client-side: the gestures ride on the characters'
// snapshots, the same way a real emote does.
import type { EmoteId } from '../../../shared/emotes.js';
import type { CharSnap, Vec3 } from '../../../shared/types.js';

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

/**
 * The curtain call: everyone in a shallow arc across the room, between the
 * cinematic camera's orbit and the point it looks at, facing the camera's
 * side, Nana in the middle; each spot nudged along the line until it is clear
 * of furniture (`clear`).
 */
export function curtainCall(ids: string[], grandmaId: string, idle: { center: Vec3; look: Vec3 }, clear: (p: Vec3) => boolean): Map<string, { pos: Vec3; yaw: number }> {
  const out = new Map<string, { pos: Vec3; yaw: number }>();
  const dx = idle.look.x - idle.center.x, dz = idle.look.z - idle.center.z;
  const len = Math.hypot(dx, dz) || 1;
  const f = { x: dx / len, z: dz / len };
  const side = { x: -f.z, z: f.x };
  const mid = { x: idle.center.x + dx * 0.55, y: 0, z: idle.center.z + dz * 0.55 };
  // Nana in the middle, the family either side of her by turns.
  const order = [grandmaId, ...ids.filter((id) => id !== grandmaId)];
  const yaw = Math.atan2(f.x, f.z); // facing back towards the camera's side
  const taken: Vec3[] = [];
  order.forEach((id, i) => {
    const k = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1);
    let pos: Vec3 | null = null;
    for (let tries = 0; tries < 12 && !pos; tries++) {
      const s = k * 1.15 + (tries === 0 ? 0 : (tries % 2 ? 1 : -1) * Math.ceil(tries / 2) * 0.35);
      const bow = -Math.abs(s) * 0.12; // a shallow arc: the ends step forward a little
      const p = { x: mid.x + side.x * s + f.x * bow, y: 0, z: mid.z + side.z * s + f.z * bow };
      if (clear(p) && taken.every((q) => Math.hypot(q.x - p.x, q.z - p.z) > 0.8)) pos = p;
    }
    if (!pos) return;
    taken.push(pos);
    out.set(id, { pos, yaw });
  });
  return out;
}
