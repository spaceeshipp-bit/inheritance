// Watching the snapshot for gestures and dances: when one starts, its sound
// plays where it is (Grandma hears it through her ears, like everything else),
// its word pops over the head ("PFFBT!", "[CENSORED]") and it is captioned. A
// dance keeps its tune going for as long as it lasts.
import { EMOTES, type EmoteId } from '../../../shared/emotes.js';
import type { CharSnap, Vec3 } from '../../../shared/types.js';
import { TUNE_SECS } from '../audio/emotesynth.js';
import type { Sfx } from '../audio/sfx.js';
import type { Captions } from './captions.js';
import { whereFrom } from './captions.js';
import type { Floats } from './floats.js';

interface Playing { id: EmoteId; t: number; nextTune: number }

/** Pops and captions only for emotes this close to you (m). */
const NEAR = 18;

export class EmoteWatch {
  private playing = new Map<string, Playing>();

  constructor(private d: { sfx: Sfx; floats: Floats; captions: Captions }) {}

  clear(): void { this.playing.clear(); }

  /**
   * Every frame with the characters in view. `grandma`: the viewer is Grandma
   * (she is not told names in captions: what she identified comes as a toast).
   */
  frame(chars: Iterable<CharSnap>, me: { pos: Vec3; yaw: number } | null, opts: {
    now: number; grandma: boolean; name: (id: string) => string; head: (id: string) => Vec3 | null;
  }): void {
    const seen = new Set<string>();
    for (const c of chars) {
      if (!c.emote) continue;
      seen.add(c.id);
      const was = this.playing.get(c.id);
      const t = c.emoteT ?? 0;
      const def = EMOTES[c.emote];
      if (!def) continue;
      const fresh = !was || was.id !== c.emote || t < was.t - 0.4;
      const tune = TUNE_SECS[def.sound];
      if (fresh) {
        this.playing.set(c.id, { id: c.emote, t, nextTune: opts.now + (tune ?? Infinity) });
        this.started(c, def.id, me, opts);
      } else {
        was.t = t;
        if (tune && opts.now >= was.nextTune && t < def.secs - 0.5) {
          was.nextTune = opts.now + tune;
          this.d.sfx.play(def.sound, c.pos);
        }
      }
    }
    for (const id of [...this.playing.keys()]) if (!seen.has(id)) this.playing.delete(id);
  }

  private started(c: CharSnap, id: EmoteId, me: { pos: Vec3; yaw: number } | null, opts: { grandma: boolean; name: (id: string) => string; head: (id: string) => Vec3 | null }): void {
    const def = EMOTES[id];
    this.d.sfx.play(def.sound, c.pos);
    const far = me ? Math.hypot(me.pos.x - c.pos.x, me.pos.z - c.pos.z) : 0;
    if (far > NEAR) return;
    const head = opts.head(c.id) ?? { x: c.pos.x, y: c.pos.y + 1.9, z: c.pos.z };
    this.d.floats.add(def.pop, `emote ${def.tone}${def.censored ? ' censored' : ''}`, { x: head.x, y: head.y + 0.35, z: head.z }, 1.8, 34);
    const who = opts.grandma && c.role !== 'grandma' ? 'Someone' : c.role === 'grandma' ? 'Nana' : opts.name(c.id);
    const where = me && far > 2.5 ? ` (${whereFrom(me.pos, me.yaw, c.pos)})` : '';
    this.d.captions.sound(`${who} ${def.does}${where}`, 3);
  }
}
