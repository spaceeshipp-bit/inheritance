// Small math and DOM helpers shared by the client modules.
import type { Vec3 } from '../../shared/types.js';

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Shortest-path angle interpolation (radians). */
export function lerpAngle(a: number, b: number, t: number): number {
  const d = wrapAngle(b - a);
  return a + d * t;
}

/** Wrap an angle to -PI..PI. */
export function wrapAngle(a: number): number {
  const TAU = Math.PI * 2;
  return ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

/** Frame-rate independent smoothing factor for exponential damping. */
export const damp = (k: number, dt: number): number => 1 - Math.exp(-k * dt);

export function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fmtTime(s: number): string {
  const v = Math.max(0, Math.ceil(s));
  const m = Math.floor(v / 60);
  const r = v % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export const localSec = (): number => performance.now() / 1000;

/** Create an element with a class and optional text. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Set textContent only when it changed (avoids layout churn every frame). */
export function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

export function setStyle(e: HTMLElement | SVGElement, prop: string, value: string): void {
  if (e.style.getPropertyValue(prop) !== value) e.style.setProperty(prop, value);
}

export function show(e: HTMLElement, on: boolean): void {
  const v = on ? '' : 'none';
  if (e.style.display !== v) e.style.display = v;
}
