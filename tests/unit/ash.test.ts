// Grandpa's ashes: the urn breaks into a pile; whoever walks (or is shoved)
// through it gets grey shoes and leaves a trail of footprints. Cousins see
// every print, Grandma only those she has laid eyes on, and nobody is told
// whose they are: the trail is the evidence, and it can be forged.
import { describe, expect, it } from 'vitest';
import { ASH } from '../../shared/constants.js';
import type { AshPrint } from '../../shared/protocol.js';
import type { Match } from '../../server/match.js';
import { stepUntil } from './helpers.js';
import { humanMatch, lastSnap, place, tick } from './scenario.js';

/** Break the urn at (x, z) (dropped, blamed on `by`). */
function smashUrn(m: Match, by: string, at: { x: number; z: number }): void {
  const p = [...m.props.values()].find((x) => x.kind === 'heirloom' && x.variant === 'urn')!;
  p.spot = null; p.resting = false; p.lastBy = by;
  p.pos = { x: at.x, y: 1.2, z: at.z }; p.vel = { x: 0, y: -6, z: 0 };
  expect(stepUntil(m, () => !!p.broken, 1.5)).toBe(true);
}

/** Walk `id` from (x, z) towards +x in steps, `n` steps of `step` m. */
function walkEast(m: Match, id: string, x: number, z: number, n: number, step = 0.32): void {
  for (let i = 0; i <= n; i++) { place(m, id, x + i * step, z, -Math.PI / 2); tick(m); }
}

const printsTo = (box: ReturnType<typeof humanMatch>['box'], id: string) =>
  (box.events(id, 'prints') as unknown as { prints: AshPrint[]; clear?: boolean }[]).flatMap((e) => e.prints);

describe("Grandpa's ashes", () => {
  it('the urn breaks into a pile where it lands, and the cousins are told', () => {
    const { m, box } = humanMatch();
    smashUrn(m, 'a', { x: -2, z: -1 });
    expect(m.ashPiles).toHaveLength(1);
    expect(m.ashPiles[0].x).toBeCloseTo(-2, 0);
    expect((box.events('b', 'toast') as unknown as { text: string }[]).some((e) => /Grandpa's urn/.test(e.text))).toBe(true);
  });

  it('walk through it and you leave a trail (and grey shoes) until it wears off', () => {
    const { m, box } = humanMatch();
    smashUrn(m, 'a', { x: -2, z: -1 });
    const pile = m.ashPiles[0];
    walkEast(m, 'c', pile.x, pile.z, 40);
    tick(m, 10); // the last prints go out
    const mine = m.prints.filter((p) => p.by === 'c');
    expect(mine.length).toBeGreaterThanOrEqual(ASH.prints - 1);
    expect(mine.length).toBeLessThanOrEqual(ASH.prints + 2);
    // They alternate feet and point the way walked (east: yaw -PI/2).
    expect(mine[0].side).not.toBe(mine[1].side);
    expect(mine[2].yaw).toBeCloseTo(-Math.PI / 2, 1);
    // Every cousin is sent them, without a name on them.
    const got = printsTo(box, 'b');
    expect(got.length).toBe(m.prints.length);
    expect(got.every((p) => !('by' in p) && !('nanaSaw' in p))).toBe(true);
    // Worn off by now: no more grey shoes.
    expect(m.chars.get('c')!.ashy).toBe(0);
    expect(m.log.moments.find((x) => x.kind === 'grandpa')?.text).toBe('C trod in Grandpa and walked him all over the house.');
  });

  it('grey shoes show in the snapshot while they still leave prints', () => {
    const { m, box } = humanMatch();
    smashUrn(m, 'a', { x: -2, z: -1 });
    const pile = m.ashPiles[0];
    place(m, 'd', pile.x, pile.z, 0);
    tick(m, 2);
    expect(lastSnap(box, 'b').chars.find((c) => c.id === 'd')?.ashy).toBe(true);
    expect(lastSnap(box, 'b').chars.find((c) => c.id === 'c')?.ashy).toBeUndefined();
  });

  it('shoved in by a cousin: a moment for the shover (the trail now leads to the victim)', () => {
    const { m } = humanMatch();
    smashUrn(m, 'a', { x: -2, z: -1 });
    const pile = m.ashPiles[0];
    const c = place(m, 'c', pile.x + 1.5, pile.z, 0);
    // Knocked flying by B, landing in the pile.
    c.knockedBy = 'b';
    c.knockedAt = m.time;
    place(m, 'c', pile.x, pile.z, 0);
    c.state = 'ragdoll';
    c.ragdollT = 1;
    tick(m);
    expect(m.log.events.filter((e) => e.kind === 'ash')).toEqual([expect.objectContaining({ by: 'c', pushedBy: 'b' })]);
    expect(m.log.moments.find((x) => x.kind === 'grandpa')).toMatchObject({ actor: 'b', victim: 'c', text: "B shoved C into Grandpa's ashes." });
  });

  it('Grandma is sent only the prints she has seen, once she looks', () => {
    const { m, box } = humanMatch();
    // She faces away (west) while the urn breaks east of her and a cousin walks through it.
    place(m, 'g', -5, 1.6, Math.PI / 2);
    smashUrn(m, 'a', { x: -2, z: -1 });
    const pile = m.ashPiles[0];
    walkEast(m, 'c', pile.x, pile.z, 8);
    place(m, 'g', -5, 1.6, Math.PI / 2);
    tick(m, 10);
    expect(m.prints.length).toBeGreaterThan(2);
    expect(printsTo(box, 'g')).toHaveLength(0);
    // She turns round.
    place(m, 'g', -5, 1.6, -Math.PI / 2);
    tick(m, 10);
    const seen = printsTo(box, 'g');
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.length).toBe(m.prints.filter((p) => p.nanaSaw).length);
    expect(seen.every((p) => !('by' in p))).toBe(true);
  });
});
