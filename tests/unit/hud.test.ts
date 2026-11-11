// The HUD's decisions, as pure functions (playability review 2026-11-11):
// prompt ranking (P11), the shove target (P12), the reading's pacing and its
// three moments (P6), the parchment's drag range (P7), edge markers clear of
// panels (P16/P18), name-tag stacking (P17), names without "(bot)" (P20),
// the next-visit line (P5), first-visit coaching order (P3), caption
// directions, and that the band patterns cover every cousin slot.
import { describe, expect, it } from 'vitest';
import { COUSIN, COUSINS, VISITS, WILL } from '../../shared/constants.js';
import type { CharSnap, Moment, PropSnap } from '../../shared/types.js';
import { stackTags, TAG_RANGE } from '../../client/src/hud/bubbles.js';
import { whereFrom } from '../../client/src/hud/captions.js';
import { pickTip, tipHtmlParts, TIPS, type CoachState } from '../../client/src/hud/coach.js';
import { rankPrompts, shoveTarget, type PromptCtx } from '../../client/src/hud/cousin.js';
import { PING_BRIGHT_MS } from '../../client/src/hud/grandma.js';
import { cleanName, cleanText, isBotName, nameOf } from '../../client/src/hud/ident.js';
import { BLOCK_TEXT, blockedBy, dragRange } from '../../client/src/hud/parchment.js';
import { nextVisitText, ROLE_GOAL } from '../../client/src/hud/phases.js';
import { listNames, pickMoments, planReading } from '../../client/src/hud/reading.js';
import { edgePoint, type Rect } from '../../client/src/hud/types.js';
import { BAND_PATTERNS, bandPatternIndex } from '../../client/src/render/materials.js';

function char(id: string, x: number, z: number, o: Partial<CharSnap> = {}): CharSnap {
  return {
    id, role: 'cousin', pos: { x, y: 0, z }, yaw: 0, pitch: 0, vel: { x: 0, y: 0, z: 0 }, state: 'normal', ragdollT: 0,
    holding: null, running: false, sneaking: false, whispering: false, charge: 0, plant: 0, leader: false, ...o,
  };
}
function item(owner: string, heldBy: string | null, x = 0, z = 0, o: Partial<PropSnap> = {}): PropSnap {
  return { id: `item-${owner}`, kind: 'item', pos: { x, y: 0, z }, yaw: 0, heldBy, owner, planted: false, ...o };
}
function ctx(me: CharSnap, others: CharSnap[], props: PropSnap[], o: Partial<PromptCtx> = {}): PromptCtx {
  return {
    me, selfId: me.id, grandma: others.find((c) => c.role === 'grandma') ?? null, chars: [me, ...others], props,
    wishKind: null, summonLeft: null, pushGrandma: false, pad: false,
    name: (id) => id.toUpperCase(), itemName: () => 'Phone', propLabel: (p) => `the ${p.kind}`, ...o,
  };
}

describe('context prompts (review P11, P8, P12)', () => {
  // Yaw 0 faces -Z: "in front" is smaller z.
  const me = char('me', 0, 0);
  const nana = char('nana', 0.5, -1.2, { role: 'grandma' });
  const bea = char('bea', -0.6, -0.9);

  it('next to Nana, a compliment outranks pinching the cousin beside you', () => {
    const p = rankPrompts(ctx(me, [nana, bea], [item('me', 'me'), item('bea', 'bea')]));
    expect(p[0]).toMatchObject({ key: 'Q', text: 'Compliment Nana', sabotage: false });
    expect(p.map((x) => x.text)).toContain("Pinch BEA's Phone");
    expect(p.length).toBeLessThanOrEqual(3);
  });

  it('shows at most three prompts, best first, and marks sabotage', () => {
    const p = rankPrompts(ctx(me, [nana, bea], [item('me', 'me'), item('bea', 'bea'), { id: 'h1', kind: 'heirloom', pos: { x: 0.3, y: 0.5, z: -0.5 }, yaw: 0, heldBy: null }]));
    expect(p).toHaveLength(3);
    for (let i = 1; i < p.length; i++) expect(p[i - 1].score).toBeGreaterThanOrEqual(p[i].score);
    expect(p.find((x) => x.text.startsWith('Pinch'))?.sabotage).toBe(true);
    expect(p.find((x) => x.text.startsWith('Compliment'))?.sabotage).toBe(false);
  });

  it('a stolen item in your hands is about planting it first', () => {
    const holding = char('me', 0, 0, { holding: 'item-bea' });
    const p = rankPrompts(ctx(holding, [bea], [item('me', 'me'), item('bea', 'me')]));
    expect(p[0]).toMatchObject({ key: 'Hold G', text: "Plant BEA's Phone", sabotage: true });
  });

  it('a cousin just out of reach gets a dimmed "closer" prompt, not a dead E', () => {
    const far = char('bea', 0, -(COUSIN.reach + 0.8));
    const p = rankPrompts(ctx(me, [far], [item('me', 'me'), item('bea', 'bea')]));
    expect(p.find((x) => x.text.includes('pinch'))).toMatchObject({ dim: true, key: '' });
  });

  it('controller prompts name the pad buttons', () => {
    const p = rankPrompts(ctx(me, [nana, bea], [item('me', 'me'), item('bea', 'bea')], { pad: true }));
    expect(p[0].key).toBe('LB');
  });

  it('the shove target follows the server rule: in front, in range, never Nana unless allowed', () => {
    const front = char('front', 0, -1.2);
    const behind = char('behind', 0, 0.8);
    expect(shoveTarget(me, [me, front, behind], false)?.id).toBe('front');
    expect(shoveTarget(me, [me, behind], false)).toBeNull();
    expect(shoveTarget(me, [me, char('far', 0, -(COUSIN.shoveRange + 0.4))], false)).toBeNull();
    const gran = char('g', 0, -1, { role: 'grandma' });
    expect(shoveTarget(me, [me, gran], false)).toBeNull();
    expect(shoveTarget(me, [me, gran], true)?.id).toBe('g');
  });
});

describe('the Reading of the Will (review P6)', () => {
  const m = (kind: Moment['kind'], actor: string, t: number): Moment => ({ kind, actor, t, text: `${actor} ${kind}` });

  it('picks at most three moments: people first, then framed > big cut > love you > favourite > caught, one per actor', () => {
    const human = (id: string) => id === 'h';
    const picked = pickMoments([
      m('caught-red-handed', 'b1', 1), m('love-you-nana', 'b2', 2), m('caught-red-handed', 'b2', 3),
      m('framed', 'b3', 4), m('favourite-broken', 'h', 5), m('big-cut', 'g', 6), m('framed', 'b3', 7),
    ], human);
    expect(picked.map((x) => `${x.kind}:${x.actor}`)).toEqual(['favourite-broken:h', 'framed:b3', 'big-cut:g']);
    expect(pickMoments([], human)).toEqual([]);
    expect(new Set(picked.map((x) => x.actor)).size).toBe(picked.length);
  });

  it('paces the lines over the whole reading, pauses before the top share, then badges, then the moments', () => {
    for (const [n, top, moments, total] of [[4, 1, 3, 20], [7, 1, 3, 20], [5, 2, 2, 20], [4, 1, 3, 5], [6, 6, 0, 20]] as const) {
      const p = planReading(n, top, moments, total);
      expect(p.lines).toHaveLength(n);
      for (let i = 1; i < n; i++) expect(p.lines[i]).toBeGreaterThanOrEqual(p.lines[i - 1]);
      const rest = n - top;
      // Tied top shares are read together, after a pause longer than the gap between the others.
      for (let i = rest; i < n; i++) expect(p.lines[i]).toBe(p.lines[n - 1]);
      if (rest >= 2) expect(p.lines[rest] - p.lines[rest - 1]).toBeGreaterThan(p.lines[1] - p.lines[0]);
      expect(p.badges).toBeGreaterThan(p.lines[n - 1]);
      expect(p.moments).toHaveLength(moments);
      for (let i = 0; i < moments; i++) expect(p.moments[i]).toBeGreaterThan(i ? p.moments[i - 1] : p.badges);
      // Everything lands inside the phase, and the reading uses most of it (it used to finish in 8 s of 20).
      const last = moments ? p.moments[moments - 1] : p.badges;
      expect(last).toBeLessThan(total);
      if (total >= 20 && moments) expect(last).toBeGreaterThan(total * 0.75);
    }
  });

  it('lists tied names in words', () => {
    expect(listNames(['Bea'])).toBe('Bea');
    expect(listNames(['Bea', 'Dot'])).toBe('Bea and Dot');
    expect(listNames(['Bea', 'Dot', 'Gus'])).toBe('Bea, Dot and Gus');
  });
});

describe('the full parchment (review P7)', () => {
  it('a drag reaches only as far as the points she can still move', () => {
    expect(dragRange(20, 10)).toEqual({ lo: 10, hi: 30 });
    expect(dragRange(5, 20)).toEqual({ lo: 0, hi: 25 });
    expect(dragRange(95, 20)).toEqual({ lo: 75, hi: 100 });
    expect(dragRange(40, 0)).toEqual({ lo: 40, hi: 40 });
  });

  it('says which limit blocks her: the visit budget first, then the rolling cap', () => {
    expect(blockedBy({ budget: 0, rolling: 20 })).toBe('budget');
    expect(blockedBy({ budget: 30, rolling: 0 })).toBe('rolling');
    expect(blockedBy({ budget: WILL.budgetPerVisit, rolling: WILL.rollingCap })).toBeNull();
    expect(BLOCK_TEXT.budget).toBe('Out of budget for this visit');
  });
});

describe('screen-edge markers (review P16 and P18)', () => {
  const W = 1280, H = 720;
  const willPanel: Rect = { left: 0, top: 0, right: 300, bottom: 300 };

  it('sit on the real screen edge, not on an ellipse in the middle of the scene', () => {
    const left = edgePoint({ x: -500, y: 360, onScreen: false, behind: false }, W, H, 40, 30);
    expect(left.x).toBeCloseTo(40);
    const down = edgePoint({ x: 640, y: 2000, onScreen: false, behind: false }, W, H, 40, 30);
    expect(down.y).toBeCloseTo(H - 30);
    // Behind the camera: mirrored, so the marker points the right way round.
    const behind = edgePoint({ x: 2000, y: 360, onScreen: false, behind: true }, W, H, 40, 30);
    expect(behind.x).toBeCloseTo(40);
  });

  it('slide out of HUD panels', () => {
    const a = edgePoint({ x: -900, y: -600, onScreen: false, behind: false }, W, H, 40, 30, [willPanel]);
    const inside = a.x > willPanel.left && a.x < willPanel.right && a.y > willPanel.top && a.y < willPanel.bottom;
    expect(inside).toBe(false);
    expect(a.x === 40 || a.y === 30 || a.x === W - 40 || a.y === H - 30 || a.x === 300 || a.y === 300).toBe(true);
  });

  it('crash pings stay bright for 6-8 s', () => {
    expect(PING_BRIGHT_MS).toBeGreaterThanOrEqual(6000);
    expect(PING_BRIGHT_MS).toBeLessThanOrEqual(8000);
  });
});

describe('name tags (review P17)', () => {
  it('stack instead of overlapping, nearest first, and drop the ones with no room', () => {
    const shifts = stackTags([
      { id: 'far', x: 500, y: 300, w: 80, d: 9 },
      { id: 'near', x: 510, y: 300, w: 80, d: 3 },
      { id: 'mid', x: 505, y: 302, w: 80, d: 6 },
      { id: 'farther', x: 505, y: 301, w: 80, d: 11 },
      { id: 'apart', x: 900, y: 300, w: 80, d: 10 },
    ]);
    expect(shifts.get('near')).toBe(0);
    expect(shifts.get('apart')).toBe(0);
    expect(shifts.get('mid')).toBeGreaterThan(0);
    expect(shifts.get('far')).toBeGreaterThan(shifts.get('mid') ?? 0);
    expect(shifts.has('farther')).toBe(false);
    expect(TAG_RANGE).toBe(12);
  });
});

describe('names, visits and goals (review P5, P20, P3)', () => {
  it('shows names without the "(bot)" suffix', () => {
    expect(isBotName('Agatha (bot)')).toBe(true);
    expect(isBotName('Agatha')).toBe(false);
    expect(cleanName('Clementine (bot)')).toBe('Clementine');
    expect(cleanName('Bea')).toBe('Bea');
    expect(cleanText('Agatha (bot) told Nana they loved her, then shoved Barnaby (bot).')).toBe('Agatha told Nana they loved her, then shoved Barnaby.');
  });

  it('an id Grandma was not given (by/from === "") reads "Someone", never an empty name', () => {
    const s = { name: (id: string) => (id === 'b2' ? 'Bertie (bot)' : '???') } as unknown as Parameters<typeof nameOf>[0];
    expect(nameOf(s, '')).toBe('Someone');
    expect(nameOf(s, 'b2')).toBe('Bertie');
  });

  it('the intermission names the visit the server says comes next', () => {
    // The server sends the upcoming visit in phase.visit during an intermission.
    expect(nextVisitText('dinner', ['tea', 'dinner', 'storm'])).toBe(`Next: ${VISITS.dinner.name} (visit 2 of 3)`);
    expect(nextVisitText('storm', ['tea', 'dinner', 'storm'])).toBe(`Next: ${VISITS.storm.name} (visit 3 of 3)`);
    expect(nextVisitText(null, [])).toBe('Next visit');
  });

  it('each role card states the goal', () => {
    expect(ROLE_GOAL.cousin).toBe('Biggest share when the will is read wins. Only Nana changes the will.');
    expect(ROLE_GOAL.grandma.length).toBeGreaterThan(20);
  });
});

describe('first-visit coaching (review P3)', () => {
  const base: CoachState = { role: 'cousin', visitT: 5, device: 'kbm', nanaDist: 6, markNear: true, cousinNear: true, holdingStolen: false, aidOrSpecs: false };

  it('starts each role with how to get going, before any situational tip', () => {
    expect(pickTip('cousin', new Set(), base)?.id).toBe('c-nana');
    expect(pickTip('grandma', new Set(), { ...base, role: 'grandma' })?.id).toBe('g-aim');
    expect(pickTip('cousin', new Set(), { ...base, visitT: 0.2 })).toBeNull();
  });

  it('then shows whatever the moment calls for, each tip once', () => {
    expect(pickTip('cousin', new Set(['c-nana']), base)?.id).toBe('c-pinch');
    expect(pickTip('cousin', new Set(['c-nana']), { ...base, holdingStolen: true })?.id).toBe('c-plant');
    expect(pickTip('cousin', new Set(['c-nana', 'c-pinch']), base)?.id).toBe('c-shove');
    expect(pickTip('cousin', new Set(TIPS.filter((t) => t.role === 'cousin').map((t) => t.id)), base)).toBeNull();
  });

  it('the tips say the keys', () => {
    const texts = TIPS.map((t) => t.kbm);
    expect(texts).toContain('Nana is over there — walk up and press [Q] to compliment her');
    expect(texts).toContain('Stand next to a cousin and press [E] to pinch their signature item');
    expect(texts).toContain('Hold [G] to plant a stolen item');
    expect(texts).toContain('[F] shoves — not where Nana can see');
    expect(texts).toContain('Aim at a cousin: [E] Bless, [Q] Tut');
    expect(texts).toContain('[Tab] opens the full will');
    expect(tipHtmlParts('Hold [G] to plant')).toEqual([{ key: false, text: 'Hold ' }, { key: true, text: 'G' }, { key: false, text: ' to plant' }]);
  });
});

describe('captions and colour-band patterns', () => {
  it('say where a sound came from, relative to where you face', () => {
    const at = { x: 0, y: 0, z: 0 };
    expect(whereFrom(at, 0, { x: 0, y: 0, z: -8 })).toBe('ahead');
    expect(whereFrom(at, 0, { x: 0, y: 0, z: 8 })).toBe('behind you');
    expect(whereFrom(at, 0, { x: 8, y: 0, z: 0 })).toBe('to your right');
    expect(whereFrom(at, 0, { x: -8, y: 0, z: 0 })).toBe('to your left');
    expect(whereFrom(at, 0, { x: 0, y: 4, z: -8 })).toBe('upstairs, ahead');
    expect(whereFrom(at, 0, { x: 1, y: 0, z: 1 })).toBe('right here');
  });

  it('every cousin slot has its own band pattern', () => {
    const idx = COUSINS.map((c) => bandPatternIndex(c.key));
    expect(new Set(idx).size).toBe(COUSINS.length);
    expect(idx.every((i) => i >= 0 && i < BAND_PATTERNS.length)).toBe(true);
    expect(bandPatternIndex(null)).toBe(-1);
  });
});
