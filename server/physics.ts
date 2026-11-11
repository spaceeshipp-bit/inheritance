// Server physics: characters (via shared/movement.ts), knockback and ragdoll,
// character-vs-character separation, and props as point bodies that fall,
// bounce, rest on boxes and the stair ramp, get carried and thrown.
// Pure functions over plain data so tests can drive them directly.
import { FALL_RAGDOLL_HEIGHT, GRAVITY, HEIRLOOM, RAGDOLL_TIME } from '../shared/constants.js';
import { BOXES, RAMPS, groundHeight } from '../shared/map.js';
import {
  CHAR_SHAPE, createBody, forwardOf, rampHeightAt, stepMovement,
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

/** Push overlapping characters apart (flat), so bodies never stack. */
export function separateCharacters(chars: PhysChar[]): void {
  const minD = CHAR_SHAPE.radius * 2;
  for (let i = 0; i < chars.length; i++) {
    for (let j = i + 1; j < chars.length; j++) {
      const a = chars[i].body.pos, b = chars[j].body.pos;
      if (Math.abs(a.y - b.y) > CHAR_SHAPE.height * 0.8) continue;
      let dx = b.x - a.x, dz = b.z - a.z;
      let d = Math.hypot(dx, dz);
      if (d >= minD) continue;
      if (d < 1e-6) { dx = 1; dz = 0; d = 1e-6; }
      const push = (minD - d) / 2;
      const nx = dx / d, nz = dz / d;
      a.x -= nx * push; a.z -= nz * push;
      b.x += nx * push; b.z += nz * push;
    }
  }
}

/** Where a character's hands are (a carried prop sits here). */
export function handPos(c: { body: MoveBody; yaw: number }): Vec3 {
  const f = forwardOf(c.yaw);
  return { x: c.body.pos.x + f.x * 0.45, y: c.body.pos.y + 1.05, z: c.body.pos.z + f.z * 0.45 };
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
      } else {
        // Started inside (e.g. spawned in a wall): pop out on top.
        p.pos.y = b.max.y;
        p.vel.y = 0;
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

/** Keep a character inside the house; returns true if it had to be rescued. */
export function rescueIfLost(c: PhysChar, fallback: Vec3): boolean {
  const p = c.body.pos;
  const bad = !Number.isFinite(p.x + p.y + p.z) || p.y < -3 || p.x < -9 || p.x > 17 || p.z < -13 || p.z > 7;
  if (!bad) return false;
  c.body = createBody(fallback);
  return true;
}
