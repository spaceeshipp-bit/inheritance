// What Grandma can see and hear, and what each player's client is sent.
// Grandma's ignorance is the game: these tests pin every review finding about
// information reaching her (or a cousin) that the game says it must not.
import { describe, expect, it } from 'vitest';
import { MISHEARD, QUICKCHAT } from '../../shared/constants.js';
import { lineOfSight } from '../../shared/sight.js';
import type { Match } from '../../server/match.js';
import { humanMatch, lastSnap, place, press, tick, yawTo } from './scenario.js';

const EAST = -Math.PI / 2;
const WEST = Math.PI / 2;

/** Hand an existing prop to a character (held "sticky", as stolen items are). */
function hand(m: Match, who: string, propId: string): void {
  const c = m.chars.get(who)!;
  const p = m.props.get(propId)!;
  p.heldBy = who;
  p.onBody = false;
  p.resting = false;
  p.spot = null;
  c.holding = propId;
  c.sticky = true;
}

function anyHeirloom(m: Match): string {
  return [...m.props.values()].find((p) => p.kind === 'heirloom' && !p.broken)!.id;
}

describe('line of sight', () => {
  it('walls, the gallery slab and the stair underside block it; railings and doorways do not', () => {
    expect(lineOfSight({ x: 6, y: 1.55, z: 3 }, { x: 9.6, y: 1.1, z: 4 })).toBe(false); // hall to kitchen through the wall
    expect(lineOfSight({ x: 6, y: 1.55, z: 0 }, { x: 10, y: 1.1, z: 0 })).toBe(true); // through the kitchen doorway
    expect(lineOfSight({ x: 0, y: 1.55, z: -10 }, { x: 1, y: 4.1, z: -10 })).toBe(false); // up through the gallery slab
    expect(lineOfSight({ x: -5, y: 4.55, z: -8.6 }, { x: -5, y: 1.1, z: 0 })).toBe(true); // over the gallery railing
    expect(lineOfSight({ x: -3, y: 1.0, z: -5 }, { x: 3, y: 1.0, z: -5 })).toBe(false); // through the staircase
  });

  it('Grandma cannot see through walls: no "found", no names, no Caught Red-Handed', () => {
    const { m, box } = humanMatch();
    // Grandma by the east hall wall, facing it; a and b in the kitchen right behind it.
    place(m, 'g', 6.5, 3.5, EAST);
    place(m, 'a', 9.4, 4, EAST);
    place(m, 'b', 10.1, 4, EAST);
    tick(m, 2);
    expect(m.canSeeNow(m.chars.get('a')!.body.pos)).toBe(false);
    press(m, 'a', { yaw: EAST, shove: true });
    tick(m);
    const shove = box.events('g', 'shove').pop() as { by: string; victim: string } | undefined;
    expect(shove?.by ?? '').toBe('');
    expect(m.log.moments.some((x) => x.kind === 'caught-red-handed')).toBe(false);
  });

  it('nor up through the gallery floor', () => {
    const { m } = humanMatch();
    place(m, 'g', 0, -10, 0);
    place(m, 'a', 1, -10, 0, 3);
    tick(m);
    expect(m.perceive(m.chars.get('a')!.body.pos).visible).toBe(false);
  });
});

describe("Grandma's snapshot holds only what she perceives", () => {
  it('leaves out cousins she can neither see nor hear, and strips what she cannot make out', () => {
    const { m, box } = humanMatch();
    place(m, 'g', -5, 1.6, EAST);
    place(m, 'a', -3.6, 1.0, WEST); // right in front of her: identifiable
    place(m, 'b', 3, 1.6, 0); // 8 m ahead: a blur
    place(m, 'c', 12, 4, 0); // in the kitchen behind the wall, 17 m away
    place(m, 'd', -7.5, 4.5, 0); // behind her, within earshot
    hand(m, 'a', 'cat');
    hand(m, 'b', 'teacup');
    m.chars.get('d')!.plantT = 1;
    tick(m, 3);
    const g = lastSnap(box, 'g');
    const ids = g.chars.map((c) => c.id).sort();
    expect(ids).toEqual(['a', 'b', 'd', 'g']);
    expect(g.chars.find((c) => c.id === 'a')!.holding).toBe('cat');
    expect(g.props.some((p) => p.id === 'cat')).toBe(true);
    expect(g.chars.find((c) => c.id === 'b')!.holding).toBeNull();
    expect(g.props.some((p) => p.id === 'teacup')).toBe(false);
    expect(g.chars.find((c) => c.id === 'd')!.plant).toBe(0);
    // Cousins see the whole house.
    const a = lastSnap(box, 'a');
    expect(a.chars.length).toBe(5);
    expect(a.props.find((p) => p.id === 'teacup')!.heldBy).toBe('b');
  });

  it('an unfound planted item is never flagged planted for her, and is left out when she cannot see it', () => {
    const { m } = humanMatch();
    const item = m.props.get(m.chars.get('b')!.itemId!)!;
    const plantAt = (x: number, z: number) => {
      item.heldBy = null; item.onBody = false; item.planted = true; item.found = false;
      item.pos = { x, y: 0, z }; item.vel = { x: 0, y: 0, z: 0 }; item.resting = true;
    };
    plantAt(-7.5, 1.6); // behind her
    let snap = m.snapshotFor('g') as Extract<ReturnType<Match['snapshotFor']>, { t: 'snap' }>;
    expect(snap.props.some((p) => p.id === item.id)).toBe(false);
    plantAt(-1.5, 1.6); // 3.5 m in front: she sees an item lying there, but has not found it
    snap = m.snapshotFor('g') as typeof snap;
    const seen = snap.props.find((p) => p.id === item.id)!;
    expect(seen.planted).toBe(false);
    // Cousins never learn whether she found it.
    item.found = true;
    const forCousin = (m.snapshotFor('a') as typeof snap).props.find((p) => p.id === item.id)!;
    expect('found' in forCousin).toBe(false);
    expect(forCousin.planted).toBe(true);
  });

  it("only she gets her own cooldowns", () => {
    const { m, box } = humanMatch();
    tick(m, 3);
    const gSelf = lastSnap(box, 'g').chars.find((c) => c.id === 'g')!;
    const gForA = lastSnap(box, 'a').chars.find((c) => c.id === 'g')!;
    expect(gSelf.aidCooldown).toBeDefined();
    expect(gSelf.summonCooldown).toBeDefined();
    expect(gForA.aidCooldown).toBeUndefined();
    expect(gForA.specsCooldown).toBeUndefined();
    expect(gForA.summonCooldown).toBeUndefined();
    expect(gForA.aidActive).toBe(false);
  });
});

describe('what Grandma hears', () => {
  it('nothing from a voice beyond her hearing, or a whisper beyond 1.5 m; cousins out of earshot get nothing either', () => {
    const { m, box } = humanMatch();
    place(m, 'g', -5, 1.6, EAST);
    place(m, 'a', 7, 1.6, 0); // 12 m: silent
    m.handleChat('a', 'shall we break the urn?');
    expect(box.events('g', 'bubble').length).toBe(0);
    box.clear();
    place(m, 'a', -2, 1.6, 0); // 3 m away, whispering
    place(m, 'b', -1.2, 1.6, 0); // 0.8 m from a: hears the whisper
    place(m, 'c', 7.6, 1.6, 0); // 9.6 m from a: does not
    press(m, 'a', { whisper: true });
    tick(m);
    m.handleChat('a', 'psst, steal the trophy while she looks away');
    expect(box.events('g', 'bubble').length).toBe(0);
    expect(box.events('b', 'bubble').pop()).toMatchObject({ from: 'a', whisper: true });
    expect(box.events('c', 'bubble').length).toBe(0);
  });

  it('a muffled quick-chat line is misheard (a real phrase, not scrambled symbols), with the speaker only if she can see them', () => {
    const { m, box } = humanMatch();
    place(m, 'g', -5, 1.6, EAST);
    place(m, 'a', -1, 1.6, WEST); // 4 m in front: muffled, identifiable
    m.handleQuick('a', 0);
    const heard = box.events('g', 'bubble').pop() as { from: string; text: string };
    expect(heard.from).toBe('a');
    expect(MISHEARD[0]).toContain(heard.text);
    expect(heard.text).not.toBe(QUICKCHAT.cousin[0]);
    place(m, 'a', -7.5, 2.5, 0); // behind her, 2.7 m: muffled, unseen
    m.handleQuick('a', 1);
    const behind = box.events('g', 'bubble').pop() as { from: string; text: string; pos?: { x: number } };
    expect(behind.from).toBe('');
    expect(behind.pos).toBeDefined();
    expect(MISHEARD[1]).toContain(behind.text);
  });

  it('a whispered compliment she reads as a mumble does not count; a whispered tattle from 2.9 m is refused', () => {
    const { m, box } = humanMatch();
    // (z 1.0 keeps clear of the side table that stands just south-east of her chair)
    place(m, 'g', -5, 1.0, EAST);
    place(m, 'a', -3.2, 1.0, WEST); // 1.8 m
    press(m, 'a', { yaw: WEST, whisper: true });
    tick(m);
    m.handleQuick('a', 0);
    expect(m.log.events.some((e) => e.kind === 'compliment')).toBe(false);
    place(m, 'a', -2.1, 1.0, WEST); // 2.9 m, still whispering
    press(m, 'a', { yaw: WEST, whisper: true });
    tick(m);
    m.handleTattle('a', 'b');
    expect(box.events('g', 'tattle').length).toBe(0);
    expect(m.log.events.some((e) => e.kind === 'tattle')).toBe(false);
    press(m, 'a', { yaw: WEST, whisper: false });
    tick(m);
    m.handleTattle('a', 'b');
    expect(box.events('g', 'tattle').pop()).toMatchObject({ from: 'a', accused: 'b' });
  });

  it('a crash she did not see comes without the heirloom and with only a rough position', () => {
    const { m, box } = humanMatch();
    place(m, 'g', -5, 1.6, EAST);
    const id = anyHeirloom(m);
    const p = m.props.get(id)!;
    p.spot = null; p.resting = false; p.pos = { x: -7.3, y: 2.2, z: 1.37 }; p.vel = { x: 0, y: -2, z: 0 };
    tick(m, 30);
    expect(p.broken).toBe(true);
    const forG = box.events('g', 'crash').pop() as { heirloom: string; pos: { x: number; z: number } };
    expect(forG.heirloom).toBe('');
    expect(Number.isInteger(forG.pos.x) && Number.isInteger(forG.pos.z)).toBe(true);
    expect(box.events('a', 'crash').pop()).toMatchObject({ heirloom: id });
  });
});

describe('blame and moments', () => {
  it('Caught Red-Handed needs her sharp vision (a shove 4 m away is seen, not caught red-handed)', () => {
    const { m } = humanMatch();
    place(m, 'g', -5, 1.0, EAST);
    place(m, 'a', -1.0, 1.0, EAST);
    place(m, 'b', -0.3, 1.0, 0);
    press(m, 'a', { yaw: EAST, shove: true });
    tick(m);
    const far = m.log.events.find((e) => e.kind === 'shove');
    expect(far).toMatchObject({ seen: true, sharp: false });
    expect(m.log.moments.some((x) => x.kind === 'caught-red-handed')).toBe(false);
    tick(m, 60);
    place(m, 'c', -3.6, 0.9, EAST);
    place(m, 'd', -2.9, 0.9, 0);
    press(m, 'c', { yaw: EAST, shove: true });
    tick(m);
    expect(m.log.moments.some((x) => x.kind === 'caught-red-handed' && x.actor === 'c')).toBe(true);
  });

  it('shoving someone carrying an heirloom blames the shover for the break, not the victim', () => {
    const { m } = humanMatch();
    place(m, 'g', -5, 1.6, WEST); // looking away
    place(m, 'a', 2, 1.6, EAST);
    place(m, 'b', 2.7, 1.6, EAST);
    const id = anyHeirloom(m);
    hand(m, 'b', id);
    tick(m);
    press(m, 'a', { yaw: EAST, shove: true });
    tick(m, 60);
    const brk = m.log.events.find((e) => e.kind === 'break');
    expect(brk).toMatchObject({ by: 'a', heirloom: id });
    expect(m.log.sabotageTally(m.cousinIds).b).toBe(0);
  });

  it("Grandma's own cane never makes her the culprit of what it knocks over", () => {
    const { m } = humanMatch();
    place(m, 'g', -5, 1.0, EAST);
    place(m, 'b', -3.8, 1.0, EAST);
    const id = anyHeirloom(m);
    hand(m, 'b', id);
    tick(m);
    press(m, 'g', { yaw: EAST, primary: true });
    tick(m, 60);
    const brk = m.log.events.find((e) => e.kind === 'break');
    expect(brk).toBeDefined();
    expect(brk!.kind === 'break' && brk!.by).toBe(null);
    expect(m.log.moments.some((x) => x.actor === 'g' && x.kind === 'caught-red-handed')).toBe(false);
  });

  it('shoving Grandma (when the lobby allows it) knocks her spectacles off', () => {
    const { m, box } = humanMatch(5, { pushGrandma: true });
    place(m, 'g', -5, 1.6, EAST);
    place(m, 'a', -4.3, 1.6, yawTo(-4.3, 1.6, -5, 1.6));
    press(m, 'a', { yaw: yawTo(-4.3, 1.6, -5, 1.6), shove: true });
    tick(m);
    expect(m.chars.get('g')!.specsOff).toBe(true);
    expect(m.log.events.some((e) => e.kind === 'knock-specs' && e.by === 'a')).toBe(true);
    expect(box.events('b', 'specs-off').length).toBe(1);
  });

  it('a successful steal tells the thief', () => {
    const { m, box } = humanMatch();
    place(m, 'a', 2, 2.2, 0);
    place(m, 'b', 2, 3, 0);
    press(m, 'a', { interact: true });
    tick(m);
    expect(m.chars.get('a')!.holding).toBe(m.chars.get('b')!.itemId);
    expect(box.events('a', 'toast').some((e) => /pinched/.test(String((e as { text: string }).text)))).toBe(true);
  });

  it("Nana's Pet glow goes to the leader at the intermission, not with the first Bless", () => {
    const { m, box } = humanMatch(5, { fullMatch: true });
    m.handleGrandma('g', { a: 'bless', target: 'a' });
    tick(m, 3);
    expect(lastSnap(box, 'b').chars.some((c) => c.leader)).toBe(false);
    m.phaseEndsAt = m.time;
    tick(m, 3);
    expect(m.phase).toBe('intermission');
    expect(lastSnap(box, 'b').chars.find((c) => c.leader)?.id).toBe('a');
  });
});
