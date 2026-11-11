// Short floating words over the world: "CRASH!" over a smash near you,
// "SHOVED!" over the cousin your shove sent flying, "whiff" when it missed.
// Anchored to a world point (projected each frame) or to the screen centre.
import type { Vec3 } from '../../../shared/types.js';
import type { ScreenPoint } from '../render/scene.js';
import { el, setStyle } from '../util.js';

interface Float { e: HTMLElement; world: Vec3 | null; born: number; life: number; rise: number }

export class Floats {
  readonly root = el('div', 'floats');
  /** Reduced motion: words appear and fade where they are, without popping or rising. */
  calm = false;
  private items: Float[] = [];

  /** A word at a world point (`world`) or at the screen centre (null). */
  add(text: string, cls: string, world: Vec3 | null, life = 1.4, rise = 46): void {
    const e = el('div', `float-text ${cls}`, text);
    e.style.display = 'none';
    this.root.appendChild(e);
    this.items.push({ e, world, born: performance.now(), life: life * 1000, rise });
    while (this.items.length > 8) this.items.shift()?.e.remove();
  }

  frame(project: (p: Vec3) => ScreenPoint, w: number, h: number): void {
    const now = performance.now();
    this.items = this.items.filter((f) => {
      const k = (now - f.born) / f.life;
      if (k >= 1) { f.e.remove(); return false; }
      let x = w / 2, y = h / 2 + 46;
      if (f.world) {
        const sp = project(f.world);
        if (!sp.onScreen) { f.e.style.display = 'none'; return true; }
        x = sp.x;
        y = sp.y;
      }
      f.e.style.display = '';
      const pop = this.calm ? 1 : k < 0.12 ? 0.7 + (k / 0.12) * 0.45 : 1.15 - Math.min(0.15, (k - 0.12) * 0.4);
      const rise = this.calm ? 0 : f.rise * k;
      setStyle(f.e, 'transform', `translate(${x.toFixed(0)}px, ${(y - rise).toFixed(0)}px) translate(-50%, -50%) scale(${pop.toFixed(3)})`);
      setStyle(f.e, 'opacity', (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1).toFixed(2));
      return true;
    });
  }

  clear(): void {
    for (const f of this.items) f.e.remove();
    this.items = [];
  }
}
