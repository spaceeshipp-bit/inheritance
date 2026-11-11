// Server physics: characters (via shared/movement.ts), knockback and ragdoll,
// character-vs-character separation, and props as point bodies that fall,
// bounce, rest on boxes and the stair ramp, get carried and thrown.
// Pure functions over plain data so tests can drive them directly.
import { FALL_RAGDOLL_HEIGHT, GRAVITY, HEIRLOOM, RAGDOLL_TIME } from '../shared/constants.js';
import { BOXES, RAMPS, groundHeight } from '../shared/map.js';
import {
  CHAR_SHAPE, createBody, forwardOf, rampHeightAt, resolveHorizontal, stepMovement,
  type MoveBody, type MoveCmd, type MoveResult,
} from '../shared/movement.js';
import type { BodyState, PropKind, Role, Vec3 } from '../shared/types.js';

export { CHAR_SHAPE, createBody };

/** The physical part of a character. */
export interface PhysChar {
  id: string;
  role: Role;
  body: MoveBody;
  yaw: number;
  state: BodyState;
  /** Seconds left in ragdoll. */
  ragdollT: number;
  /** Who knocked them over last (for blame), and when. */
  knockedBy: string | null;
  knockedAt: number;
}

export interface CharStepResult extends MoveResult {
  /** The fall was long enough to ragdoll. */
  fellOver: boolean;
  /** Ragdoll ended this step. */
  stoodUp: boolean;
}

/** Step one character: control when upright, tumbling when ragdolled/asleep, fall ragdoll on landing. */
export function stepCharacter(c: PhysChar, cmd: MoveCmd | null, dt: number, parchmentOpen = false): CharStepResult {
  const floppy = c.state !== 'normal';
  const r = stepMovement(c.body, floppy ? null : cmd, dt, { role: c.role, ragdoll: floppy, parchmentOpen });
  const out: CharStepResult = { ...r, fellOver: false, stoodUp: false };
  if (r.landed && r.fall > FALL_RAGDOLL_HEIGHT && c.state !== 'sleeping') {
    c.state = 'ragdoll';
    c.ragdollT = RAGDOLL_TIME;
    out.fellOver = true;
  }
  if (c.state === 'ragdoll') {
    c.ragdollT = Math.max(0, c.ragdollT - dt);
    const slow = Math.hypot(c.body.vel.x, c.body.vel.z) < 1.5;
    if (c.ragdollT <= 0 && c.body.onGround && slow) {
      c.state = 'normal';
      out.stoodUp = true;
    }
  }
  return out;
}

/**
 * Knock a character over: horizontal velocity `impulse` along `dir` (flat),
 * a little upward pop, and a ragdoll for RAGDOLL_TIME.
 */
export function knockback(c: PhysChar, dir: { x: number; z: number }, impulse: number, up: number, by: string | null, now: number): void {
  const len = Math.hypot(dir.x, dir.z);
  const f = len > 1e-6 ? { x: dir.x / len, z: dir.z / len } : forwardOf(c.yaw + Math.PI);
  c.body.vel.x = f.x * impulse;
  c.body.vel.z = f.z * impulse;
  c.body.vel.y = Math.max(c.body.vel.y, up);
  c.body.onGround = false;
  c.body.peakY = Math.max(c.body.peakY, c.body.pos.y);
  if (c.state !== 'sleeping') c.state = 'ragdoll';
  c.ragdollT = RAGDOLL_TIME;
  c.knockedBy = by;
  c.knockedAt = now;
}

/**
 * Push overlapping characters apart (flat), so bodies never stack. Anyone in
 * `immovable` (Grandma, when cousins may not push her) does not budge: the
 * other body takes the whole push. Every body that moved is then resolved
 * against the map again, so a crowd can never squeeze someone through a wall
 * or the gallery railing.
 */
export function separateCharacters(chars: PhysChar[], immovable: ReadonlySet<PhysChar> = new Set()): void {
  const minD = CHAR_SHAPE.radius * 2;
  const moved = new Set<PhysChar>();
  for (let i = 0; i < chars.length; i++) {
    for (let j = i + 1; j < chars.length; j++) {
      const ca = chars[i], cb = chars[j];
      const a = ca.body.pos, b = cb.body.pos;
      if (Math.abs(a.y - b.y) > CHAR_SHAPE.height * 0.8) continue;
      let dx = b.x - a.x, dz = b.z - a.z;
      let d = Math.hypot(dx, dz);
      if (d >= minD) continue;
      if (d < 1e-6) { dx = 1; dz = 0; d = 1e-6; }
      const fixA = immovable.has(ca), fixB = immovable.has(cb);
      if (fixA && fixB) continue;
      const nx = dx / d, nz = dz / d;
      const pushA = fixA ? 0 : fixB ? minD - d : (minD - d) / 2;
      const pushB = fixB ? 0 : fixA ? minD - d : (minD - d) / 2;
      a.x -= nx * pushA; a.z -= nz * pushA;
      b.x += nx * pushB; b.z += nz * pushB;
      if (pushA > 0) moved.add(ca);
      if (pushB > 0) moved.add(cb);
    }
  }
  for (const c of moved) resolveHorizontal(c.body.pos, c.body.vel, CHAR_SHAPE, c.state === 'ragdoll');
}

/** Does the flat segment a→b at height y cross a solid box (props see railings as solid)? */
function crossesBox(a: Vec3, b: Vec3, y: number, box: { min: Vec3; max: Vec3 }, r: number): boolean {
  if (y < box.min.y || y >= box.max.y) return false;
  let t0 = 0, t1 = 1;
  for (const ax of ['x', 'z'] as const) {
    const lo = box.min[ax] - r, hi = box.max[ax] + r;
    const d = b[ax] - a[ax];
    if (Math.abs(d) < 1e-9) { if (a[ax] <= lo || a[ax] >= hi) return false; continue; }
    let ta = (lo - a[ax]) / d, tb = (hi - a[ax]) / d;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 >= t1) return false;
  }
  return true;
}

/**
 * A point `reach` m in front of a character at height `dy` above their feet,
 * pulled back to their own centre if a wall (or anything solid) is in the way:
 * what they hold, drop, throw or plant never starts inside a wall.
 */
export function inFrontClear(c: { body: MoveBody; yaw: number }, reach: number, dy: number): Vec3 {
  const f = forwardOf(c.yaw);
  const centre = { x: c.body.pos.x, y: c.body.pos.y + dy, z: c.body.pos.z };
  const p = { x: centre.x + f.x * reach, y: centre.y, z: centre.z + f.z * reach };
  for (const b of PROP_BOXES) if (crossesBox(centre, p, centre.y, b, PROP_RADIUS)) return centre;
  return p;
}

/** Where a character's hands are (a carried prop sits here), never inside a wall. */
export function handPos(c: { body: MoveBody; yaw: number }): Vec3 {
  return inFrontClear(c, 0.45, 1.05);
}

/** Where an item carried "on the body" sits (hip). */
export function bodyItemPos(c: { body: MoveBody }): Vec3 {
  return { x: c.body.pos.x, y: c.body.pos.y + 0.95, z: c.body.pos.z };
}

// ───────────────────────── Props ─────────────────────────

export const PROP_RADIUS = 0.12;

export interface PhysProp {
  id: string;
  kind: PropKind;
  /** Bottom point of the prop. */
  pos: Vec3;
  vel: Vec3;
  resting: boolean;
}

const PROP_BOXES = BOXES.filter((b) => b.solid);

function pointInRect(p: Vec3, r: number, b: { min: Vec3; max: Vec3 }): boolean {
  return p.x > b.min.x - r && p.x < b.max.x + r && p.z > b.min.z - r && p.z < b.max.z + r && p.y >= b.min.y && p.y < b.max.y;
}

/**
 * Advance a free prop. Returns the largest impact speed against the map this
 * step (0 if it did not hit anything). Props come to rest on any surface.
 */
export function stepProp(p: PhysProp, dt: number): number {
  if (p.resting || !(dt > 0)) return 0;
  p.vel.y -= GRAVITY * dt;
  const sp = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
  const n = Math.min(16, Math.max(1, Math.ceil((sp * dt) / 0.08)));
  const h = dt / n;
  const r = PROP_RADIUS;
  let impact = 0;
  for (let i = 0; i < n; i++) {
    const prev = { ...p.pos };
    p.pos.x += p.vel.x * h;
    p.pos.y += p.vel.y * h;
    p.pos.z += p.vel.z * h;
    for (const b of PROP_BOXES) {
      if (!pointInRect(p.pos, r, b)) continue;
      if (prev.y >= b.max.y - 1e-6) {
        p.pos.y = b.max.y;
        impact = Math.max(impact, -p.vel.y);
        p.vel.y = Math.abs(p.vel.y) * 0.25;
        p.vel.x *= 0.6; p.vel.z *= 0.6;
      } else if (prev.x <= b.min.x - r + 1e-6) {
        p.pos.x = b.min.x - r;
        impact = Math.max(impact, Math.abs(p.vel.x));
        p.vel.x = -Math.abs(p.vel.x) * 0.3;
      } else if (prev.x >= b.max.x + r - 1e-6) {
        p.pos.x = b.max.x + r;
        impact = Math.max(impact, Math.abs(p.vel.x));
        p.vel.x = Math.abs(p.vel.x) * 0.3;
      } else if (prev.z <= b.min.z - r + 1e-6) {
        p.pos.z = b.min.z - r;
        impact = Math.max(impact, Math.abs(p.vel.z));
        p.vel.z = -Math.abs(p.vel.z) * 0.3;
      } else if (prev.z >= b.max.z + r - 1e-6) {
        p.pos.z = b.max.z + r;
        impact = Math.max(impact, Math.abs(p.vel.z));
        p.vel.z = Math.abs(p.vel.z) * 0.3;
      } else if (prev.y < b.min.y + 1e-6) {
        p.pos.y = b.min.y - 0.01;
        impact = Math.max(impact, Math.abs(p.vel.y));
        p.vel.y = -Math.abs(p.vel.y) * 0.3;
      } else if (b.max.y - p.pos.y <= 0.15) {
        // Barely inside the top: it is resting on that surface.
        p.pos.y = b.max.y;
        p.vel.y = 0;
      } else {
        // Started inside a wall: push it out sideways through the nearest face,
        // never up onto the top of the wall.
        const outs = [
          { d: p.pos.x - (b.min.x - r), set: () => { p.pos.x = b.min.x - r; p.vel.x = -Math.abs(p.vel.x) * 0.3; } },
          { d: (b.max.x + r) - p.pos.x, set: () => { p.pos.x = b.max.x + r; p.vel.x = Math.abs(p.vel.x) * 0.3; } },
          { d: p.pos.z - (b.min.z - r), set: () => { p.pos.z = b.min.z - r; p.vel.z = -Math.abs(p.vel.z) * 0.3; } },
          { d: (b.max.z + r) - p.pos.z, set: () => { p.pos.z = b.max.z + r; p.vel.z = Math.abs(p.vel.z) * 0.3; } },
        ];
        outs.sort((m, n) => m.d - n.d)[0].set();
      }
    }
    // The staircase: a surface from above, a wall from the sides.
    const rh = rampHeightAt(p.pos.x, p.pos.z);
    if (rh !== null && p.pos.y < rh) {
      const prevH = rampHeightAt(prev.x, prev.z);
      if (prevH !== null && prev.y >= prevH - 0.05) {
        p.pos.y = rh;
        impact = Math.max(impact, -p.vel.y);
        p.vel.y = Math.abs(p.vel.y) * 0.25;
        p.vel.x *= 0.6; p.vel.z *= 0.6;
      } else {
        const ramp = RAMPS[0];
        if (prev.x < ramp.minX || prev.x > ramp.maxX) {
          p.pos.x = prev.x;
          impact = Math.max(impact, Math.abs(p.vel.x));
          p.vel.x = -p.vel.x * 0.3;
        } else {
          p.pos.z = prev.z;
          impact = Math.max(impact, Math.abs(p.vel.z));
          p.vel.z = -p.vel.z * 0.3;
        }
      }
    }
  }
  // Come to rest when slow and supported.
  const g = groundHeight(p.pos.x, p.pos.z, p.pos.y + 0.01, 0.05);
  if (Math.abs(p.pos.y - g) < 0.02 && Math.hypot(p.vel.x, p.vel.y, p.vel.z) < 0.6) {
    p.pos.y = g;
    p.vel.x = 0; p.vel.y = 0; p.vel.z = 0;
    p.resting = true;
  }
  // Safety: never lose a prop out of the world.
  if (p.pos.y < -5 || !Number.isFinite(p.pos.x + p.pos.y + p.pos.z)) {
    p.pos = { x: 0, y: 0, z: 0 };
    p.vel = { x: 0, y: 0, z: 0 };
    p.resting = true;
  }
  return impact;
}

/** A flying prop overlapping a character's capsule (first one found), excluding `ignore`. */
export function propHitsChar<C extends { id: string; body: MoveBody; state: BodyState }>(p: PhysProp, chars: Iterable<C>, ignore: string | null): C | null {
  for (const c of chars) {
    if (c.id === ignore) continue;
    const dx = p.pos.x - c.body.pos.x, dz = p.pos.z - c.body.pos.z;
    if (dx * dx + dz * dz > (CHAR_SHAPE.radius + PROP_RADIUS) ** 2) continue;
    if (p.pos.y < c.body.pos.y - 0.05 || p.pos.y > c.body.pos.y + CHAR_SHAPE.height) continue;
    return c;
  }
  return null;
}

/**
 * Where to gently set down what a character is holding: on the surface under
 * their hands if it is within reach below, else null (then it is dropped).
 */
export function setDownPos(c: { body: MoveBody; yaw: number }): Vec3 | null {
  const hp = handPos(c);
  const inWall = PROP_BOXES.some((b) => pointInRect({ x: hp.x, y: c.body.pos.y + 0.5, z: hp.z }, PROP_RADIUS, b) && b.max.y > c.body.pos.y + 0.5);
  const at = inWall ? { x: c.body.pos.x, z: c.body.pos.z } : { x: hp.x, z: hp.z };
  const g = groundHeight(at.x, at.z, hp.y, 0.05);
  if (hp.y - g > 1.3) return null;
  return { x: at.x, y: g, z: at.z };
}

/** Pedestal footprints (for toppling heirlooms with a ragdolled body). */
export const PEDESTALS = BOXES.filter((b) => b.kind === 'pedestal');

/** A ragdolled body moving fast enough, against the pedestal under `spot`? */
export function bumpsPedestal(c: PhysChar, spot: Vec3): boolean {
  if (c.state !== 'ragdoll') return false;
  if (Math.hypot(c.body.vel.x, c.body.vel.z) < 1.2) return false;
  const dx = c.body.pos.x - spot.x, dz = c.body.pos.z - spot.z;
  if (Math.hypot(dx, dz) > HEIRLOOM.topplePushRange + CHAR_SHAPE.radius) return false;
  return c.body.pos.y > spot.y - 1.6 && c.body.pos.y < spot.y + 0.3;
}

/** Is a prop outside the house (escaped through a gap, or lost)? */
export function propOutside(p: Vec3): boolean {
  return !Number.isFinite(p.x + p.y + p.z) || p.y < -1 || p.y > 6.5 || p.x < -8.4 || p.x > 16.4 || p.z < -12.4 || p.z > 6.4
    || (p.x > 8.3 && (p.z < -6.3 || p.z > 6.3 || p.y > 3.3));
}

/** Keep a character inside the house; returns true if it had to be rescued. */
export function rescueIfLost(c: PhysChar, fallback: Vec3): boolean {
  const p = c.body.pos;
  const bad = !Number.isFinite(p.x + p.y + p.z) || p.y < -3 || p.x < -9 || p.x > 17 || p.z < -13 || p.z > 7;
  if (!bad) return false;
  c.body = createBody(fallback);
  return true;
}
