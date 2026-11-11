// Speech bubbles over heads (typed chat and quick-chat), and name tags.
// Grandma's bubbles arrive already muffled by the server; when she could not
// see who spoke, `from` is '' and the bubble floats where the voice came from.
// Name tags (review P17): only within 12 m, never through walls, and stacked
// so two tags never sit on top of each other (the nearest wins).
import type { ItemKey } from '../../../shared/constants.js';
import type { Vec3 } from '../../../shared/types.js';
import { lineOfSight } from '../render/camera.js';
import type { ScreenPoint } from '../render/scene.js';
import { el, setStyle, setText } from '../util.js';
import { cleanName, paintSwatch } from './ident.js';

export interface BubbleFrame {
  ids: string[];
  selfId: string;
  headPos: (id: string) => Vec3 | null;
  project: (p: Vec3) => ScreenPoint;
  /** Name tags (cousins see names; Grandma must recognise colours). */
  showTags: boolean;
  name: (id: string) => string;
  color: (id: string) => string;
  sleeping: (id: string) => boolean;
  /** Camera position for distance fade. */
  camPos: Vec3;
}

interface Bubble { e: HTMLElement; until: number; pos: Vec3 | null }
interface TagBox { left: number; right: number; top: number; bottom: number }

/** Name tags further than this from the camera are not drawn. */
export const TAG_RANGE = 12;
const TAG_H = 21;
const SIGHT_RECHECK_MS = 150;

/**
 * Lay out name tags: nearest first; a tag that would overlap one already
 * placed moves up a row, at most two rows, else it is hidden. Returns the
 * vertical shift (px, upward) for each placed id.
 */
export function stackTags(tags: { id: string; x: number; y: number; w: number; d: number }[], h = TAG_H, maxRows = 2): Map<string, number> {
  const placed: TagBox[] = [];
  const out = new Map<string, number>();
  for (const t of [...tags].sort((a, b) => a.d - b.d)) {
    for (let row = 0; row <= maxRows; row++) {
      const box = { left: t.x - t.w / 2, right: t.x + t.w / 2, top: t.y - h - row * (h + 2), bottom: t.y - row * (h + 2) };
      if (!placed.some((p) => box.left < p.right && box.right > p.left && box.top < p.bottom && box.bottom > p.top)) {
        placed.push(box);
        out.set(t.id, row * (h + 2));
        break;
      }
    }
  }
  return out;
}

export class Bubbles {
  readonly root = el('div', 'bubbles');
  private bubbles = new Map<string, Bubble>();
  private tags = new Map<string, HTMLElement>();
  private sight = new Map<string, { at: number; ok: boolean }>();
  private anon = 0;
  /** A cousin's signature item, so a tag's swatch carries their band pattern (set by the HUD). */
  itemOf: (id: string) => ItemKey | null | undefined = () => null;

  /** A speech bubble over `from`'s head, or, with `from` = '' and a `pos`, where an unseen voice came from. */
  add(from: string, text: string, quick: boolean, whisper: boolean, pos?: Vec3): void {
    const key = from || `?${this.anon++ % 3}`;
    this.bubbles.get(key)?.e.remove();
    const e = el('div', `bubble${quick ? ' quick' : ''}${whisper ? ' whisper' : ''}${from ? '' : ' unseen'}`);
    e.textContent = whisper ? `(${text})` : text;
    this.root.appendChild(e);
    const secs = Math.min(7, 2.8 + text.length * 0.06);
    this.bubbles.set(key, { e, until: performance.now() + secs * 1000, pos: from ? null : pos ? { x: pos.x, y: pos.y + 1.8, z: pos.z } : null });
  }

  clear(): void {
    for (const b of this.bubbles.values()) b.e.remove();
    for (const t of this.tags.values()) t.remove();
    this.bubbles.clear();
    this.tags.clear();
    this.sight.clear();
  }

  private visibleFromCamera(id: string, p: Vec3, now: number): boolean {
    const c = this.sight.get(id);
    if (c && now - c.at < SIGHT_RECHECK_MS) return c.ok;
    const ok = lineOfSight(p);
    this.sight.set(id, { at: now, ok });
    return ok;
  }

  frame(f: BubbleFrame): void {
    const now = performance.now();
    const live = new Set(f.ids);
    for (const [id, t] of this.tags) if (!live.has(id)) { t.remove(); this.tags.delete(id); this.sight.delete(id); }
    const heads = new Map<string, { sp: ScreenPoint; d: number }>();
    const cands: { id: string; x: number; y: number; w: number; d: number }[] = [];
    for (const id of f.ids) {
      const head = f.headPos(id);
      if (!head) continue;
      const sp = f.project(head);
      const d = Math.hypot(head.x - f.camPos.x, head.y - f.camPos.y, head.z - f.camPos.z);
      heads.set(id, { sp, d });
      const sleeping = f.sleeping(id);
      const wantTag = ((f.showTags && id !== f.selfId && d < TAG_RANGE) || sleeping) && sp.onScreen;
      if (!wantTag || !this.visibleFromCamera(id, head, now)) continue;
      const text = sleeping ? `${f.showTags ? cleanName(f.name(id)) + ' ' : ''}Zzz` : cleanName(f.name(id));
      let tag = this.tags.get(id);
      if (!tag) {
        tag = el('div', 'nametag');
        tag.append(el('span', 'swatch'), el('span', 'nm'));
        this.root.appendChild(tag);
        this.tags.set(id, tag);
      }
      setText(tag.lastChild as HTMLElement, text);
      paintSwatch(tag.firstChild as HTMLElement, f.color(id), this.itemOf(id));
      cands.push({ id, x: sp.x, y: sp.y, w: 30 + text.length * 6.8, d });
    }
    const shift = stackTags(cands);
    for (const [id, tag] of this.tags) {
      const dy = shift.get(id);
      const h = heads.get(id);
      if (dy === undefined || !h) { setStyle(tag, 'display', 'none'); continue; }
      setStyle(tag, 'display', '');
      setStyle(tag, 'transform', `translate(${h.sp.x.toFixed(1)}px, ${(h.sp.y - dy).toFixed(1)}px) translate(-50%, -100%)`);
      setStyle(tag, 'opacity', String(Math.max(0.45, Math.min(1, 1.5 - h.d / TAG_RANGE))));
      setStyle(tag, 'z-index', String(100 - Math.round(h.d * 4)));
    }
    // Bubbles: above the head (and above its tag), or where an unseen voice came from.
    for (const [key, b] of this.bubbles) {
      if (now > b.until || (!b.pos && !live.has(key))) { b.e.remove(); this.bubbles.delete(key); continue; }
      let sp: ScreenPoint | null = null;
      let lift = 6;
      if (b.pos) sp = f.project(b.pos);
      else {
        const h = heads.get(key);
        sp = h ? h.sp : null;
        const dy = shift.get(key);
        if (dy !== undefined) lift = 6 + TAG_H + dy;
      }
      const vis = !!sp && sp.onScreen;
      setStyle(b.e, 'display', vis ? '' : 'none');
      if (vis && sp) {
        setStyle(b.e, 'transform', `translate(${sp.x.toFixed(1)}px, ${(sp.y - lift).toFixed(1)}px) translate(-50%, -100%)`);
        b.e.classList.toggle('fade', now > b.until - 500);
      }
    }
  }
}
