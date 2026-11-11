import { describe, expect, it } from 'vitest';
import { COUSIN, FALL_RAGDOLL_HEIGHT, GALLERY_Y_FOR_TESTS, HEIRLOOM, RAGDOLL_TIME, TICK_HZ } from './helpers.js';
import { groundHeight } from '../../shared/map.js';
import { createBody, stepMovement, wishVelocity, type MoveCmd } from '../../shared/movement.js';
import { knockback, stepCharacter, stepProp, type PhysChar, type PhysProp } from '../../server/physics.js';
import type { Vec3 } from '../../shared/types.js';

const DT = 1 / TICK_HZ;

function char(pos: Vec3, yaw = 0, role: 'cousin' | 'grandma' = 'cousin'): PhysChar {
  return { id: 'x', role, body: createBody(pos), yaw, state: 'normal', ragdollT: 0, knockedBy: null, knockedAt: 0 };
}

function cmd(over: Partial<MoveCmd> = {}): MoveCmd {
  return { move: { x: 0, z: 1 }, yaw: 0, run: false, sneak: false, jump: false, ...over };
}

/** Run a character for `secs` with a fixed command; returns whether it ever fell over. */
function run(c: PhysChar, secs: number, command: MoveCmd | null): { fellOver: boolean; maxFall: number } {
  let fellOver = false, maxFall = 0;
  for (let i = 0; i < Math.round(secs * TICK_HZ); i++) {
    const r = stepCharacter(c, command, DT);
    if (r.fellOver) fellOver = true;
    if (r.landed) maxFall = Math.max(maxFall, r.fall);
  }
  return { fellOver, maxFall };
}

describe('character movement (shared/movement.ts)', () => {
  it('camera-space input maps to world space (yaw 0 = -Z)', () => {
    const v = wishVelocity({ move: { x: 0, z: 1 }, yaw: 0 }, 2);
    expect(v.x).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(-2);
    const r = wishVelocity({ move: { x: 1, z: 0 }, yaw: 0 }, 2);
    expect(r.x).toBeCloseTo(2);
    const diag = wishVelocity({ move: { x: 1, z: 1 }, yaw: 0 }, 1);
    expect(Math.hypot(diag.x, diag.z)).toBeCloseTo(1);
  });

  it('walks at walk speed and runs at run speed on flat ground', () => {
    const c = char({ x: 0, y: 0, z: 4 }, -Math.PI / 2); // facing +X across the hall
    run(c, 0.5, cmd({ yaw: -Math.PI / 2 }));
    expect(c.body.vel.x).toBeCloseTo(COUSIN.walkSpeed, 1);
    run(c, 0.3, cmd({ yaw: -Math.PI / 2, run: true }));
    expect(c.body.vel.x).toBeCloseTo(COUSIN.runSpeed, 1);
    expect(c.body.pos.y).toBe(0);
  });

  it('walks up the grand staircase to the gallery', () => {
    const c = char({ x: 0, y: 0, z: -1 });
    const r = run(c, 4, cmd());
    expect(c.body.pos.z).toBeLessThan(-8.5);
    expect(c.body.pos.y).toBeCloseTo(GALLERY_Y_FOR_TESTS, 5);
    expect(c.state).toBe('normal');
    expect(r.fellOver).toBe(false);
  });

  it('walks back down the stairs without falling over', () => {
    const c = char({ x: 0, y: 3, z: -9 }, Math.PI); // facing +Z (down the stairs)
    const r = run(c, 4, cmd({ yaw: Math.PI, run: true }));
    expect(c.body.pos.y).toBe(0);
    expect(c.body.pos.z).toBeGreaterThan(-2);
    expect(r.fellOver).toBe(false);
  });

  it('cannot walk under the stairs or through walls', () => {
    const under = char({ x: 0, y: 0, z: -10 }, Math.PI);
    run(under, 3, cmd({ yaw: Math.PI }));
    expect(under.body.pos.z).toBeLessThan(-8 + 0.01);
    expect(under.body.pos.y).toBe(0);

    const side = char({ x: 4, y: 0, z: -5 }, Math.PI / 2); // facing -X toward the side of the stairs
    run(side, 3, cmd({ yaw: Math.PI / 2 }));
    expect(side.body.pos.x).toBeGreaterThan(1.5);

    const wall = char({ x: 0, y: 0, z: 4 }, Math.PI); // walk south into the front wall
    run(wall, 3, cmd({ yaw: Math.PI, run: true }));
    expect(wall.body.pos.z).toBeLessThanOrEqual(6 - 0.35 + 1e-6);
  });

  it('cannot walk off the side of the stairs, or off the gallery through the railing', () => {
    const stairs = char({ x: 0, y: 1.5, z: -5 }, -Math.PI / 2);
    stairs.body.pos.y = groundHeight(0, -5, 2);
    run(stairs, 2, cmd({ yaw: -Math.PI / 2 }));
    expect(stairs.body.pos.x).toBeLessThan(1.5);
    expect(stairs.body.pos.y).toBeGreaterThan(1.2);

    const gallery = char({ x: 5, y: 3, z: -9.5 }, Math.PI);
    run(gallery, 2, cmd({ yaw: Math.PI }));
    expect(gallery.body.pos.y).toBeCloseTo(3);
    expect(gallery.body.pos.z).toBeLessThan(-8.1);
  });

  it('jumping on flat ground does not ragdoll you', () => {
    const c = char({ x: 0, y: 0, z: 3 });
    const r = run(c, 1.5, cmd({ move: { x: 0, z: 0 }, jump: true }));
    expect(r.maxFall).toBeGreaterThan(0.5);
    expect(r.maxFall).toBeLessThan(FALL_RAGDOLL_HEIGHT);
    expect(r.fellOver).toBe(false);
  });

  it('grandma cannot run or jump', () => {
    const g = char({ x: 0, y: 0, z: 3 }, -Math.PI / 2, 'grandma');
    stepMovement(g.body, cmd({ yaw: -Math.PI / 2, run: true, jump: true }), 1, { role: 'grandma', ragdoll: false });
    expect(g.body.pos.y).toBe(0);
    expect(Math.hypot(g.body.vel.x, g.body.vel.z)).toBeCloseTo(2.2, 1);
  });
});

describe('falls, knockback and ragdoll (server/physics.ts)', () => {
  it('dropping from gallery height ragdolls you on landing', () => {
    const c = char({ x: 4, y: 3, z: -5 }); // in the air over the hall floor
    c.body.onGround = false;
    const r = run(c, 1.2, null);
    expect(c.body.pos.y).toBe(0);
    expect(r.fellOver).toBe(true);
    expect(r.maxFall).toBeGreaterThan(FALL_RAGDOLL_HEIGHT);
    expect(c.state).toBe('ragdoll');
  });

  it('a shove at the gallery rail sends you over it and down to the hall, ragdolled', () => {
    const c = char({ x: 5, y: 3, z: -8.5 });
    knockback(c, { x: 0, z: 1 }, COUSIN.shoveImpulse, 2.5, 'shover', 0);
    expect(c.state).toBe('ragdoll');
    let fellOver = false;
    let landed = false;
    for (let i = 0; i < TICK_HZ * 1.5; i++) {
      const r = stepCharacter(c, null, DT);
      if (r.fellOver) fellOver = true;
      if (r.landed && c.body.pos.y < 0.01) landed = true;
    }
    expect(landed).toBe(true);
    expect(c.body.pos.y).toBe(0);
    expect(c.body.pos.z).toBeGreaterThan(-8);
    expect(fellOver).toBe(true);
    expect(c.knockedBy).toBe('shover');
  });

  it('a shove at the top of the stairs sends you down them', () => {
    const c = char({ x: 0, y: 3, z: -8.4 });
    knockback(c, { x: 0, z: 1 }, COUSIN.shoveImpulse, 2.5, 's', 0);
    run(c, 2.5, null);
    expect(c.body.pos.y).toBeLessThan(1.5);
    expect(c.body.pos.z).toBeGreaterThan(-5.5);
  });

  it('shove knockback moves the victim and they get up after RAGDOLL_TIME', () => {
    const c = char({ x: 0, y: 0, z: 2 });
    knockback(c, { x: 1, z: 0 }, COUSIN.shoveImpulse, 2.5, 's', 0);
    expect(c.body.vel.x).toBeCloseTo(COUSIN.shoveImpulse);
    expect(c.ragdollT).toBe(RAGDOLL_TIME);
    // No control while ragdolled: a move command is ignored.
    stepCharacter(c, cmd({ yaw: Math.PI / 2, run: true }), DT);
    expect(c.body.vel.x).toBeGreaterThan(0);
    run(c, RAGDOLL_TIME + 0.6, cmd({ move: { x: 0, z: 0 } }));
    expect(c.body.pos.x).toBeGreaterThan(1.5);
    expect(c.state).toBe('normal');
  });
});

describe('props', () => {
  const prop = (pos: Vec3, vel: Vec3 = { x: 0, y: 0, z: 0 }): PhysProp => ({ id: 'p', kind: 'heirloom', pos: { ...pos }, vel: { ...vel }, resting: false });

  it('an heirloom falling off a pedestal hits the floor faster than it can take', () => {
    const p = prop({ x: 0, y: 1, z: 3 });
    let impact = 0;
    for (let i = 0; i < 60 && !p.resting; i++) impact = Math.max(impact, stepProp(p, DT));
    expect(impact).toBeGreaterThan(HEIRLOOM.breakSpeed);
    expect(p.resting).toBe(true);
    expect(p.pos.y).toBe(0);
  });

  it('a gently placed prop rests on the kitchen counter', () => {
    const p = prop({ x: 12, y: 1.1, z: -5.5 });
    let impact = 0;
    for (let i = 0; i < 60 && !p.resting; i++) impact = Math.max(impact, stepProp(p, DT));
    expect(p.resting).toBe(true);
    expect(p.pos.y).toBeCloseTo(0.95);
    expect(impact).toBeLessThan(HEIRLOOM.breakSpeed);
  });

  it('a thrown prop bounces off a wall and stays in the house', () => {
    const p = prop({ x: 6, y: 1.2, z: 0 }, { x: 0, y: 1, z: 12 });
    let impact = 0;
    for (let i = 0; i < 120 && !p.resting; i++) impact = Math.max(impact, stepProp(p, DT));
    expect(impact).toBeGreaterThan(HEIRLOOM.breakSpeed);
    expect(p.pos.z).toBeLessThan(6);
    expect(p.pos.y).toBeGreaterThanOrEqual(0);
  });

  it('a prop lands on the stair ramp', () => {
    const p = prop({ x: 0, y: 3, z: -5 });
    for (let i = 0; i < 60 && !p.resting; i++) stepProp(p, DT);
    expect(p.pos.y).toBeCloseTo(1.5, 1);
  });
});
