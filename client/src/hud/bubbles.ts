// Speech bubbles over heads (typed chat and quick-chat), and name tags.
// Grandma's bubbles arrive already scrambled by the server.
import type { Vec3 } from '../../../shared/types.js';
import type { ScreenPoint } from '../render/scene.js';
import { el, setStyle, setText } from '../util.js';

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

interface Bubble { e: HTMLElement; until: number }

export class Bubbles {
  readonly root = el('div', 'bubbles');
  private bubbles = new Map<string, Bubble>();
  private tags = new Map<string, HTMLElement>();

  add(from: string, text: string, quick: boolean, whisper: boolean): void {
    this.bubbles.get(from)?.e.remove();
    const e = el('div', `bubble${quick ? ' quick' : ''}${whisper ? ' whisper' : ''}`);
    e.textContent = whisper ? `(${text})` : text;
    this.root.appendChild(e);
    const secs = Math.min(7, 2.8 + text.length * 0.06);
    this.bubbles.set(from, { e, until: performance.now() + secs * 1000 });
  }

  clear(): void {
    for (const b of this.bubbles.values()) b.e.remove();
    for (const t of this.tags.values()) t.remove();
    this.bubbles.clear();
    this.tags.clear();
  }

  frame(f: BubbleFrame): void {
    const now = performance.now();
    const live = new Set(f.ids);
    for (const [id, t] of this.tags) if (!live.has(id)) { t.remove(); this.tags.delete(id); }
    for (const id of f.ids) {
      const head = f.headPos(id);
      const sp = head ? f.project(head) : null;
      const d = head ? Math.hypot(head.x - f.camPos.x, head.y - f.camPos.y, head.z - f.camPos.z) : 99;
      // Name tag.
      const wantTag = (f.showTags && id !== f.selfId && d < 22) || f.sleeping(id);
      let tag = this.tags.get(id);
      if (wantTag && !tag) {
        tag = el('div', 'nametag');
        tag.appendChild(el('span', 'swatch'));
        tag.appendChild(el('span', 'nm'));
        this.root.appendChild(tag);
        this.tags.set(id, tag);
      }
      if (tag) {
        const vis = wantTag && !!sp && sp.onScreen;
        setStyle(tag, 'display', vis ? '' : 'none');
        if (vis && sp) {
          setText(tag.lastChild as HTMLElement, f.sleeping(id) ? `${f.showTags ? f.name(id) + ' ' : ''}Zzz` : f.name(id));
          (tag.firstChild as HTMLElement).style.background = f.color(id);
          setStyle(tag, 'transform', `translate(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px) translate(-50%, -100%)`);
          setStyle(tag, 'opacity', String(Math.max(0.35, Math.min(1, 1.6 - d / 14))));
        }
      }
      // Bubble.
      const b = this.bubbles.get(id);
      if (b) {
        if (now > b.until) { b.e.remove(); this.bubbles.delete(id); continue; }
        const vis = !!sp && sp.onScreen;
        setStyle(b.e, 'display', vis ? '' : 'none');
        if (vis && sp) {
          const lift = tag && wantTag ? 26 : 6;
          setStyle(b.e, 'transform', `translate(${sp.x.toFixed(1)}px, ${(sp.y - lift).toFixed(1)}px) translate(-50%, -100%)`);
          b.e.classList.toggle('fade', now > b.until - 500);
        }
      }
    }
    for (const [id, b] of this.bubbles) if (!live.has(id)) { b.e.remove(); this.bubbles.delete(id); }
  }
}
