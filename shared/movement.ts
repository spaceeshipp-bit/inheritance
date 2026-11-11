// Pure kinematic character movement on the grey-box map. The server runs it as
// the authority; the client can run the exact same step for own-player
// prediction (replay unacknowledged inputs from the last `ack`).
// No DOM, no Node APIs, no randomness: same inputs give the same result.
//
// Conventions: yaw 0 looks down -Z, forward(yaw) = (-sin yaw, -cos yaw);
// InputMsg.move.x = strafe right, move.z = forward. Positions are the feet.
import { COUSIN, GRANDMA, GRAVITY, WILL } from './constants.js';
import { BOXES, RAMPS, groundHeight } from './map.js';
import type { Role, Vec3 } from './types.js';

export interface BodyShape { radius: number; height: number; stepUp: number }

/** Characters are capsules: radius 0.35, height 1.7, can step up 0.45 m. */
export const CHAR_SHAPE: BodyShape = { radius: 0.35, height: 1.7, stepUp: 0.45 };

export const MOVE = {
  /** Horizontal acceleration toward the wished velocity (m/s²). */
  groundAccel: 40,
  airAccel: 8,
  /** Ragdolls on the ground slow down by this much (m/s²). */
  ragdollFriction: 7,
  /** Stick to the ground when walking down stairs up to this drop per step. */
  snapDown: 0.6,
  ragdollSnapDown: 0.25,
  /** Maximum horizontal travel per collision sub-step (m). */
  maxSubstep: 0.1,
  /** Ragdolls bounce off walls keeping this fraction of normal speed. */
  wallBounce: 0.35,
} as const;

export interface MoveBody {
  pos: Vec3;
  vel: Vec3;
  onGround: boolean;
  /** Highest point since last standing on the ground (for fall damage). */
  peakY: number;
}

/** What one input tick asks of a body. Mirrors the relevant fields of InputMsg. */
export interface MoveCmd {
  move: { x: number; z: number };
  yaw: number;
  run: boolean;
  sneak: boolean;
  jump: boolean;
}

export interface MoveOpts {
  role: Role;
  /** Ragdolled (or asleep): no control, friction, bounces, tumbles over railings. */
  ragdoll: boolean;
  parchmentOpen?: boolean;
  shape?: BodyShape;
}

export interface MoveResult {
  /** Touched down this step after being airborne. */
  landed: boolean;
  /** Height fallen when `landed` (peak minus landing height). */
  fall: number;
  /** Largest speed into a wall this step (ragdolls report impacts). */
  wallHit: number;
}

export function createBody(pos: Vec3): MoveBody {
  return { pos: { ...pos }, vel: { x: 0, y: 0, z: 0 }, onGround: true, peakY: pos.y };
}

export function forwardOf(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export function rightOf(yaw: number): { x: number; z: number } {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

/** Yaw that faces along (dx, dz). */
export function yawToward(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  if (!Number.isFinite(a)) return 0;
  a = a % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** Top speed for a role and input. */
export function moveSpeed(role: Role, cmd: Pick<MoveCmd, 'run' | 'sneak'>, parchmentOpen = false): number {
  if (role === 'grandma') return GRANDMA.walkSpeed * (parchmentOpen ? WILL.parchmentMoveFactor : 1);
  if (cmd.sneak) return COUSIN.sneakSpeed;
  if (cmd.run) return COUSIN.runSpeed;
  return COUSIN.walkSpeed;
}

/** World-space wished velocity from a camera-space move. */
export function wishVelocity(cmd: Pick<MoveCmd, 'move' | 'yaw'>, speed: number): { x: number; z: number } {
  let mx = clamp(cmd.move.x, -1, 1), mz = clamp(cmd.move.z, -1, 1);
  if (!Number.isFinite(mx)) mx = 0;
  if (!Number.isFinite(mz)) mz = 0;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const f = forwardOf(cmd.yaw), r = rightOf(cmd.yaw);
  return { x: (r.x * mx + f.x * mz) * speed, z: (r.z * mx + f.z * mz) * speed };
}

// ───────────────────────── Collision geometry ─────────────────────────

/** An axis-aligned blocker; `railing` blockers are skipped by ragdolls (they tumble over). */
export interface Blocker { minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number; railing: boolean }

const STATIC_BLOCKERS: Blocker[] = BOXES.filter((b) => b.solid).map((b) => ({
  minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z, minY: b.min.y, maxY: b.max.y, railing: b.kind === 'railing',
}));

/**
 * Stair side rails: upright characters cannot walk off the sides of the
 * staircase once it is higher than a step; ragdolls go over them.
 */
const STAIR_RAILS: Blocker[] = RAMPS.flatMap((r) => {
  const lo = Math.min(r.zStart, r.zEnd), hi = Math.max(r.zStart, r.zEnd);
  // Rails start where the ramp is one step high.
  const t = CHAR_SHAPE.stepUp / Math.max(0.001, r.yEnd - r.yStart);
  const zStep = r.zStart + t * (r.zEnd - r.zStart);
  const zLo = r.zEnd < r.zStart ? lo : zStep;
  const zHi = r.zEnd < r.zStart ? zStep : hi;
  const top = Math.max(r.yStart, r.yEnd) + 1;
  return [
    { minX: r.minX - 0.1, maxX: r.minX, minZ: zLo, maxZ: zHi, minY: 0, maxY: top, railing: true },
    { minX: r.maxX, maxX: r.maxX + 0.1, minZ: zLo, maxZ: zHi, minY: 0, maxY: top, railing: true },
  ];
});

export function rampHeightAt(x: number, z: number): number | null {
  for (const r of RAMPS) {
    if (x < r.minX || x > r.maxX) continue;
    const lo = Math.min(r.zStart, r.zEnd), hi = Math.max(r.zStart, r.zEnd);
    if (z < lo || z > hi) continue;
    const t = (z - r.zStart) / (r.zEnd - r.zStart);
    return r.yStart + t * (r.yEnd - r.yStart);
  }
  return null;
}

/**
 * The part of each ramp that is a wall for a body whose feet are at `y`:
 * the ramp is solid from y = 0 up to its surface, so wherever the surface is
 * more than a step above the feet it blocks (you cannot walk under the stairs).
 */
function rampBlockers(y: number, stepUp: number, out: Blocker[]): void {
  for (const r of RAMPS) {
    const lo = Math.min(r.zStart, r.zEnd), hi = Math.max(r.zStart, r.zEnd);
    const dy = r.yEnd - r.yStart;
    if (Math.abs(dy) < 1e-6) continue;
    const t = (y + stepUp - r.yStart) / dy; // where the surface is exactly a step above us
    if (t >= 1) continue;
    const zCut = r.zStart + Math.max(0, t) * (r.zEnd - r.zStart);
    // The blocking part runs from zCut to the high end.
    const highEnd = r.zEnd;
    const zMin = Math.max(lo, Math.min(zCut, highEnd));
    const zMax = Math.min(hi, Math.max(zCut, highEnd));
    if (zMax - zMin < 1e-4) continue;
    out.push({ minX: r.minX, maxX: r.maxX, minZ: zMin, maxZ: zMax, minY: Math.min(r.yStart, r.yEnd), maxY: Math.max(r.yStart, r.yEnd), railing: false });
  }
}

/** Everything that blocks a body with feet at `y` horizontally. */
export function blockersAt(y: number, shape: BodyShape, ragdoll: boolean): Blocker[] {
  const out: Blocker[] = [];
  const head = y + shape.height - 0.05;
  const knee = y + shape.stepUp;
  for (const b of STATIC_BLOCKERS) {
    if (ragdoll && b.railing) continue;
    if (b.minY < head && b.maxY > knee) out.push(b);
  }
  if (!ragdoll) {
    for (const b of STAIR_RAILS) if (b.minY < head && b.maxY > knee) out.push(b);
  }
  rampBlockers(y, shape.stepUp, out);
  return out;
}

/** Push a circle out of a rectangle. Returns the outward normal and depth, or null if not overlapping. */
export function circleRectPush(px: number, pz: number, r: number, b: Blocker): { nx: number; nz: number; depth: number } | null {
  const cx = clamp(px, b.minX, b.maxX), cz = clamp(pz, b.minZ, b.maxZ);
  const dx = px - cx, dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, nz: dz / d, depth: r - d };
  }
  // Centre inside the rectangle: leave by the nearest face.
  const left = px - b.minX, right = b.maxX - px, back = pz - b.minZ, front = b.maxZ - pz;
  const m = Math.min(left, right, back, front);
  if (m === left) return { nx: -1, nz: 0, depth: left + r };
  if (m === right) return { nx: 1, nz: 0, depth: right + r };
  if (m === back) return { nx: 0, nz: -1, depth: back + r };
  return { nx: 0, nz: 1, depth: front + r };
}

/**
 * Resolve a body's horizontal position against the map. Adjusts `vel` so it
 * no longer points into what it hit (ragdolls bounce). Returns the largest
 * speed into a surface.
 */
export function resolveHorizontal(pos: Vec3, vel: Vec3, shape: BodyShape, ragdoll: boolean): number {
  let hit = 0;
  const blockers = blockersAt(pos.y, shape, ragdoll);
  for (let iter = 0; iter < 3; iter++) {
    let any = false;
    for (const b of blockers) {
      const p = circleRectPush(pos.x, pos.z, shape.radius, b);
      if (!p) continue;
      any = true;
      pos.x += p.nx * p.depth;
      pos.z += p.nz * p.depth;
      const vn = vel.x * p.nx + vel.z * p.nz;
      if (vn < 0) {
        hit = Math.max(hit, -vn);
        const k = ragdoll ? 1 + MOVE.wallBounce : 1;
        vel.x -= p.nx * vn * k;
        vel.z -= p.nz * vn * k;
      }
    }
    if (!any) break;
  }
  return hit;
}

/**
 * Advance a body by `dt` with an optional world-space wished velocity.
 * Lower level than `stepMovement`; also used for Mittens the cat.
 */
export function integrateBody(
  b: MoveBody,
  wish: { x: number; z: number } | null,
  jumpSpeed: number,
  dt: number,
  shape: BodyShape,
  ragdoll: boolean,
): MoveResult {
  const res: MoveResult = { landed: false, fall: 0, wallHit: 0 };
  if (!(dt > 0)) return res;
  const wasOnGround = b.onGround;

  // Horizontal control / friction.
  if (!ragdoll && wish) {
    const accel = (b.onGround ? MOVE.groundAccel : MOVE.airAccel) * dt;
    const dx = wish.x - b.vel.x, dz = wish.z - b.vel.z;
    const d = Math.hypot(dx, dz);
    if (d <= accel) { b.vel.x = wish.x; b.vel.z = wish.z; } else { b.vel.x += (dx / d) * accel; b.vel.z += (dz / d) * accel; }
  } else if (b.onGround) {
    const sp = Math.hypot(b.vel.x, b.vel.z);
    const drop = (ragdoll ? MOVE.ragdollFriction : MOVE.groundAccel) * dt;
    if (sp <= drop) { b.vel.x = 0; b.vel.z = 0; } else { b.vel.x *= (sp - drop) / sp; b.vel.z *= (sp - drop) / sp; }
  }

  // Jump.
  let jumped = false;
  if (jumpSpeed > 0 && b.onGround && !ragdoll) {
    b.vel.y = jumpSpeed;
    b.onGround = false;
    jumped = true;
  }

  // Horizontal move in sub-steps.
  const hs = Math.hypot(b.vel.x, b.vel.z) * dt;
  const n = Math.min(10, Math.max(1, Math.ceil(hs / MOVE.maxSubstep)));
  for (let i = 0; i < n; i++) {
    b.pos.x += (b.vel.x * dt) / n;
    b.pos.z += (b.vel.z * dt) / n;
    res.wallHit = Math.max(res.wallHit, resolveHorizontal(b.pos, b.vel, shape, ragdoll));
  }

  // Vertical: gravity, ceilings, ground.
  const prevY = b.pos.y;
  b.vel.y -= GRAVITY * dt;
  let ny = prevY + b.vel.y * dt;
  if (b.vel.y > 0) {
    const head = prevY + shape.height;
    for (const bx of STATIC_BLOCKERS) {
      if (bx.minY < head - 0.01 || bx.minY >= ny + shape.height) continue;
      if (b.pos.x < bx.minX || b.pos.x > bx.maxX || b.pos.z < bx.minZ || b.pos.z > bx.maxZ) continue;
      ny = bx.minY - shape.height;
      b.vel.y = 0;
    }
  }
  const g = groundHeight(b.pos.x, b.pos.z, prevY, shape.stepUp);
  const snap = ragdoll ? MOVE.ragdollSnapDown : MOVE.snapDown;
  if (ny <= g) {
    ny = g;
    if (b.vel.y < 0) b.vel.y = 0;
    b.onGround = true;
  } else if (wasOnGround && !jumped && b.vel.y <= 0 && prevY - g <= snap) {
    ny = g;
    b.vel.y = 0;
    b.onGround = true;
  } else {
    b.onGround = false;
  }
  b.pos.y = ny;

  if (b.onGround) {
    if (!wasOnGround) {
      res.landed = true;
      res.fall = Math.max(0, b.peakY - ny);
    }
    b.peakY = ny;
  } else {
    b.peakY = Math.max(b.peakY, ny, prevY);
  }
  return res;
}

/**
 * One fixed movement step for a character. `cmd` null (or `opts.ragdoll`)
 * means no control this step. Grandma cannot run, sneak or jump.
 */
export function stepMovement(b: MoveBody, cmd: MoveCmd | null, dt: number, opts: MoveOpts): MoveResult {
  const shape = opts.shape ?? CHAR_SHAPE;
  if (opts.ragdoll || !cmd) return integrateBody(b, opts.ragdoll ? null : { x: 0, z: 0 }, 0, dt, shape, opts.ragdoll);
  const isCousin = opts.role === 'cousin';
  const speed = moveSpeed(opts.role, { run: isCousin && cmd.run, sneak: isCousin && cmd.sneak }, opts.parchmentOpen);
  const wish = wishVelocity(cmd, speed);
  const jump = isCousin && cmd.jump ? COUSIN.jumpSpeed : 0;
  return integrateBody(b, wish, jump, dt, shape, false);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
