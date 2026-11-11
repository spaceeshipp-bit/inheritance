// Captions (settings: on by default): quick-chat and typed lines and the
// important sounds, as short lines at the bottom right, for players who play
// muted or cannot hear well. Grandma's captions only say what her own ears
// caught (the server already muffles or mishears her lines).
import { el } from '../util.js';

interface Line { e: HTMLElement; until: number; key: string }

const MAX_LINES = 3;

export class Captions {
  readonly root = el('div', 'captions');
  private lines: Line[] = [];
  enabled = true;

  /** A spoken line: `who` may be '' when the speaker is unknown. */
  speech(who: string, text: string, opts: { whisper?: boolean; color?: string } = {}): void {
    const e = el('div', 'caption speech');
    if (who) {
      const n = el('span', 'cap-who', `${who}${opts.whisper ? ' (whispering)' : ''}:`);
      if (opts.color) n.style.color = opts.color;
      e.appendChild(n);
    }
    e.appendChild(el('span', 'cap-text', `“${text}”`));
    this.add(e, `s:${who}:${text}`, Math.min(6, 2.8 + text.length * 0.05));
  }

  /** A sound: "[Crash! upstairs, behind you]". Repeats of the same sound refresh one line. */
  sound(text: string, seconds = 3.5): void {
    this.add(el('div', 'caption sound', `[${text}]`), `f:${text}`, seconds);
  }

  private add(e: HTMLElement, key: string, seconds: number): void {
    if (!this.enabled) return;
    const now = performance.now();
    const same = this.lines.find((l) => l.key === key);
    if (same) { same.until = now + seconds * 1000; same.e.classList.remove('fade'); return; }
    this.root.appendChild(e);
    this.lines.push({ e, until: now + seconds * 1000, key });
    while (this.lines.length > MAX_LINES) this.lines.shift()?.e.remove();
  }

  frame(): void {
    const now = performance.now();
    this.lines = this.lines.filter((l) => {
      if (now > l.until) { l.e.remove(); return false; }
      l.e.classList.toggle('fade', now > l.until - 400);
      return true;
    });
  }

  clear(): void {
    for (const l of this.lines) l.e.remove();
    this.lines = [];
  }
}

/**
 * "upstairs, behind you" / "to your left" / "right here": where a sound came
 * from relative to a listener at `from` facing `yaw` (0 = -Z).
 */
export function whereFrom(from: { x: number; y: number; z: number }, yaw: number, at: { x: number; y: number; z: number }): string {
  const dx = at.x - from.x, dz = at.z - from.z, dy = at.y - from.y;
  const d = Math.hypot(dx, dz);
  if (d < 2.5 && Math.abs(dy) < 1.5) return 'right here';
  const parts: string[] = [];
  if (dy > 1.8) parts.push('upstairs');
  else if (dy < -1.8) parts.push('downstairs');
  // Angle of the sound relative to facing: forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw).
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const ahead = (dx * fx + dz * fz) / Math.max(1e-6, d);
  const right = (dx * rx + dz * rz) / Math.max(1e-6, d);
  if (d >= 2.5) {
    if (ahead > 0.7) parts.push('ahead');
    else if (ahead < -0.7) parts.push('behind you');
    else parts.push(right > 0 ? 'to your right' : 'to your left');
  }
  return parts.join(', ') || 'nearby';
}
