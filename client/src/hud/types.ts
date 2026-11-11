import type { Vec3, PropSnap } from '../../../shared/types.js';
import type { ScreenPoint } from '../render/scene.js';
import type { GameState, View } from '../state.js';
import { cleanName } from './ident.js';

/** Everything an in-match HUD panel needs each frame. */
export interface HudFrame {
  state: GameState;
  view: View;
  /** Server time. */
  now: number;
  /** Local seconds. */
  t: number;
  dt: number;
  project: (p: Vec3) => ScreenPoint;
  whisper: boolean;
  /** Own voice level 0..1. */
  talking: number;
  micOk: boolean;
  /** Seconds left on the cousin's shove cooldown (client-side). */
  shoveCd: number;
  /** Grandma: Bless/Tut target and how it was chosen. */
  target: { id: string; via: 'aim' | 'locked' } | null;
  locked: string | null;
  device: 'kbm' | 'pad';
  pointerLocked: boolean;
}

/** Human-readable name for a prop ("Bertie's Phone", "the vase", "Mittens"). */
export function propName(p: PropSnap, s: GameState): string {
  switch (p.kind) {
    case 'heirloom': return `the ${p.variant ?? 'heirloom'}`;
    case 'item': {
      const c = p.owner ? s.cousin(p.owner) : undefined;
      if (!c) return 'an item';
      return p.owner === s.selfId ? `your ${c.itemName}` : `${cleanName(c.name)}'s ${c.itemName}`;
    }
    case 'cat': return 'Mittens';
    case 'teacup': return 'the teacup';
    default: return 'the pills';
  }
}

/** A screen rectangle in CSS px (a HUD panel to keep markers off). */
export interface Rect { left: number; top: number; right: number; bottom: number }

const inside = (x: number, y: number, r: Rect) => x > r.left && x < r.right && y > r.top && y < r.bottom;
const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Where to draw a marker for an off-screen world point: on the real screen
 * edge (inset by `mx` / `my`, the marker's half-width and half-height), along
 * the direction from the screen centre, then slid out of any HUD panel in
 * `avoid` (pass rects already grown by the marker's half-size). `deg` turns an
 * up-pointing arrow toward the point. Reviews P16 (the Nana arrow read as a
 * floor marker mid-scene) and P18 (crash pings drawn over the will panel).
 */
export function edgePoint(sp: ScreenPoint, w: number, h: number, mx: number, my: number, avoid: Rect[] = []): { x: number; y: number; deg: number } {
  const cx = w / 2, cy = h / 2;
  let dx = sp.x - cx, dy = sp.y - cy;
  if (sp.behind) { dx = -dx; dy = -dy; }
  if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) dy = 1;
  const hw = Math.max(1, cx - mx), hh = Math.max(1, cy - my);
  const t = Math.min(hw / Math.max(1e-6, Math.abs(dx)), hh / Math.max(1e-6, Math.abs(dy)));
  let x = cx + dx * t, y = cy + dy * t;
  for (let iter = 0; iter < 4; iter++) {
    const hit = avoid.find((r) => inside(x, y, r));
    if (!hit) break;
    const options = [
      { x: hit.left, y }, { x: hit.right, y }, { x, y: hit.top }, { x, y: hit.bottom },
    ].map((p) => ({ x: clampN(p.x, mx, w - mx), y: clampN(p.y, my, h - my) }))
      .filter((p) => !avoid.some((r) => inside(p.x, p.y, r)));
    if (!options.length) break;
    options.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    x = options[0].x;
    y = options[0].y;
  }
  return { x, y, deg: (Math.atan2(dy, dx) * 180) / Math.PI + 90 };
}

/** Screen rects of the visible elements under `root` matching `selector`, grown by `pad` px. */
export function panelRects(root: ParentNode, selector: string, pad: number): Rect[] {
  const out: Rect[] = [];
  root.querySelectorAll<HTMLElement>(selector).forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) out.push({ left: r.left - pad, top: r.top - pad, right: r.right + pad, bottom: r.bottom + pad });
  });
  return out;
}
