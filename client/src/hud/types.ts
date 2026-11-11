import type { Vec3, PropSnap } from '../../../shared/types.js';
import type { ScreenPoint } from '../render/scene.js';
import type { GameState, View } from '../state.js';

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
      return p.owner === s.selfId ? `your ${c.itemName}` : `${c.name}'s ${c.itemName}`;
    }
    case 'cat': return 'Mittens';
    case 'teacup': return 'the teacup';
    default: return 'the pills';
  }
}

/**
 * Place an arrow toward an off-screen point, on an ellipse inset from the
 * screen edge so it never sits on the corner panels. Returns CSS px + rotation.
 */
export function edgeArrow(sp: ScreenPoint, w: number, h: number, insetX = 300, insetY = 120): { x: number; y: number; deg: number } {
  const cx = w / 2, cy = h / 2;
  let dx = sp.x - cx, dy = sp.y - cy;
  if (sp.behind) { dx = -dx; dy = -dy; }
  if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) dy = 1;
  const a = Math.atan2(dy, dx);
  const rx = Math.max(80, cx - insetX), ry = Math.max(80, cy - insetY);
  return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, deg: (a * 180) / Math.PI + 90 };
}
