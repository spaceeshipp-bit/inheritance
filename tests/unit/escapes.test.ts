// Nothing escapes the house, nothing ends up inside or on top of a wall, and a
// crowd cannot squeeze anyone through a railing (review S11, S12, S16).
import { describe, expect, it } from 'vitest';
import { BOXES } from '../../shared/map.js';
import { createBody, inFrontClear, propOutside, separateCharacters, stepProp, type PhysChar, type PhysProp } from '../../server/physics.js';
import { humanMatch, place, press, tick } from './scenario.js';

const solid = BOXES.filter((b) => b.solid);
const insideSolid = (p: { x: number; y: number; z: number }) =>
  solid.some((b) => p.x > b.min.x + 0.01 && p.x < b.max.x - 0.01 && p.z > b.min.z + 0.01 && p.z < b.max.z - 0.01 && p.y > b.min.y + 0.01 && p.y < b.max.y - 0.01);

function prop(pos: { x: number; y: number; z: number }, vel: { x: number; y: number; z: number }): PhysProp {
  return { id: 'p', kind: 'heirloom', pos: { ...pos }, vel: { ...vel }, resting: false };
}

describe('nothing leaves the house', () => {
  it('a hard throw up from the gallery hits the ceiling and comes back down inside', () => {
    const p = prop({ x: 0, y: 4.2, z: -10 }, { x: 0, y: 14, z: 3 });
    let peak = 0;
    for (let i = 0; i < 300 && !p.resting; i++) { stepProp(p, 1 / 30); peak = Math.max(peak, p.pos.y); }
    expect(peak).toBeLessThan(6.01);
    expect(propOutside(p.pos)).toBe(false);
    expect(p.resting).toBe(true);
  });

  it('a throw at the kitchen ceiling stays in the kitchen', () => {
    const p = prop({ x: 12, y: 1.2, z: 0 }, { x: 2, y: 13, z: 1 });
    for (let i = 0; i < 300 && !p.resting; i++) stepProp(p, 1 / 30);
    expect(propOutside(p.pos)).toBe(false);
    expect(p.pos.y).toBeLessThan(3.01);
  });

  it('random hard throws all over the house never escape and never rest inside a box', () => {
    let s = 12345;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let n = 0; n < 2000; n++) {
      const start = rnd() < 0.5 ? { x: -7 + rnd() * 14, y: 1.1, z: -11 + rnd() * 16 } : { x: 8.6 + rnd() * 7, y: 1.1, z: -5.5 + rnd() * 11 };
      if (insideSolid(start)) continue;
      const a = rnd() * Math.PI * 2, sp = 5 + rnd() * 9;
      const p = prop(start, { x: Math.cos(a) * sp, y: rnd() * 10, z: Math.sin(a) * sp });
      for (let i = 0; i < 600 && !p.resting; i++) stepProp(p, 1 / 30);
      expect(propOutside(p.pos)).toBe(false);
      expect(insideSolid(p.pos)).toBe(false);
    }
  });
});

describe('nothing starts inside a wall', () => {
  it('hands pressed against a wall hold things on the near side', () => {
    const c = { body: createBody({ x: 7.7, y: 0, z: 3 }), yaw: -Math.PI / 2 }; // facing the east hall wall at x = 8
    const hp = inFrontClear(c, 0.45, 1.05);
    expect(hp.x).toBeLessThan(8);
    expect(insideSolid(hp)).toBe(false);
  });

  it('a prop that starts inside a wall is pushed out sideways, not onto the top of the wall', () => {
    const p = prop({ x: 8.15, y: 1.0, z: 3 }, { x: 0, y: 0, z: 0 });
    stepProp(p, 1 / 30);
    expect(p.pos.y).toBeLessThan(2);
    expect(p.pos.x < 8 || p.pos.x > 8.3).toBe(true);
  });

  it('throwing while facing a wall from right against it keeps the heirloom in the room', () => {
    const { m } = humanMatch();
    const c = place(m, 'a', 7.7, 3, -Math.PI / 2);
    const id = [...m.props.values()].find((p) => p.kind === 'heirloom' && !p.broken)!.id;
    const p = m.props.get(id)!;
    p.heldBy = 'a'; p.onBody = false; p.spot = null; p.resting = false;
    c.holding = id; c.sticky = true;
    tick(m);
    press(m, 'a', { yaw: -Math.PI / 2, secondary: true });
    tick(m, 20);
    press(m, 'a', { yaw: -Math.PI / 2, secondary: false });
    tick(m, 90);
    expect(p.pos.x).toBeLessThan(8);
    expect(propOutside(p.pos)).toBe(false);
  });
});

describe('crowds', () => {
  it('bodies pushed apart are not pushed through the gallery railing', () => {
    const mk = (id: string, x: number, z: number): PhysChar => ({
      id, role: 'cousin', body: createBody({ x, y: 3, z }), yaw: 0, state: 'normal', ragdollT: 0, knockedBy: null, knockedAt: -1,
    });
    // Five bodies jammed against the railing (z = -8) on the gallery.
    const crowd = [mk('a', -5, -8.4), mk('b', -5.1, -8.45), mk('c', -4.9, -8.4), mk('d', -5, -8.6), mk('e', -5.05, -8.7)];
    for (let i = 0; i < 20; i++) separateCharacters(crowd);
    for (const c of crowd) expect(c.body.pos.z).toBeLessThan(-8.1 + 0.001);
  });

  it('Grandma does not budge when cousins may not push her', () => {
    const g: PhysChar = { id: 'g', role: 'grandma', body: createBody({ x: 0, y: 0, z: 0 }), yaw: 0, state: 'normal', ragdollT: 0, knockedBy: null, knockedAt: -1 };
    const a: PhysChar = { id: 'a', role: 'cousin', body: createBody({ x: 0.3, y: 0, z: 0 }), yaw: 0, state: 'normal', ragdollT: 0, knockedBy: null, knockedAt: -1 };
    separateCharacters([g, a], new Set([g]));
    expect(g.body.pos).toEqual({ x: 0, y: 0, z: 0 });
    expect(a.body.pos.x).toBeCloseTo(0.7, 5);
  });
});
