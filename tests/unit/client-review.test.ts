// Client review (2026-11-23): push-to-talk that works on every screen and never
// sticks on, text fields that type instead of talking, rejection lines that are
// never bare codes, the map's own words on the will, the lobby's start note
// matching the server's rules, a re-sent match keeping Nana's wish, reduced
// motion from the system and gentler lightning, and names without "(bot)" in
// Nana's reasons. Pure logic, or the real Input class over stand-in DOM targets.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_PLAYERS, MIN_PLAYERS } from '../../shared/constants.js';
import { MAPS, MAP_IDS } from '../../shared/map.js';
import type { ServerMsg } from '../../shared/protocol.js';
import type { MatchOptions, PlayerInfo } from '../../shared/types.js';
import { mapWords } from '../../client/src/hud/mapwords.js';
import { reasonText } from '../../client/src/hud/reading.js';
import { REJECT_REASONS, rejectText } from '../../client/src/hud/rejects.js';
import { lobbyStartNote } from '../../client/src/hud/screens.js';
import { Input, isTextEntry, type Action } from '../../client/src/input.js';
import { CALM_FLASH_PEAK, easeFlash } from '../../client/src/render/scene.js';
import { DEFAULT_SETTINGS, Settings, systemDefaults, sanitize } from '../../client/src/settings.js';
import { GameState } from '../../client/src/state.js';

describe('push-to-talk and whisper (review 1, 2)', () => {
  // Input listens on window and document: stand-ins that can dispatch events.
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = { window: g.window, document: g.document };
  let win: EventTarget;
  let doc: EventTarget & { hidden: boolean; pointerLockElement: null };
  beforeAll(() => {
    win = new EventTarget();
    doc = Object.assign(new EventTarget(), { hidden: false, pointerLockElement: null });
    g.window = win;
    g.document = doc;
  });
  afterAll(() => { g.window = saved.window; g.document = saved.document; });

  function rig() {
    const input = new Input(new EventTarget() as unknown as HTMLElement);
    const log: string[] = [];
    input.onAction = (a: Action, down: boolean) => { if (a === 'talk' || a === 'whisper' || a === 'help') log.push(`${a}:${down ? 'on' : 'off'}`); };
    const key = (type: 'keydown' | 'keyup', code: string, repeat = false) => win.dispatchEvent(Object.assign(new Event(type), { code, repeat }));
    return { input, log, key };
  }

  it('talks in the lobby (no match running), and stops on release', () => {
    const { input, log, key } = rig();
    expect(input.active).toBe(false);
    key('keydown', 'KeyB');
    key('keydown', 'KeyB', true);
    key('keyup', 'KeyB');
    expect(log).toEqual(['talk:on', 'talk:off']);
  });

  it('a release after the visit ended still stops it (phase change)', () => {
    const { input, log, key } = rig();
    input.active = true;
    key('keydown', 'KeyB');
    input.active = false; // the reading starts
    input.clear();
    key('keyup', 'KeyB');
    expect(log).toEqual(['talk:on', 'talk:off']);
  });

  it('losing focus or hiding the tab lets go of talk and whisper', () => {
    const { input, log, key } = rig();
    input.active = true;
    key('keydown', 'KeyB');
    key('keydown', 'AltLeft');
    win.dispatchEvent(new Event('blur'));
    expect(log).toEqual(['talk:on', 'whisper:on', 'whisper:off', 'talk:off']);
    log.length = 0;
    key('keydown', 'KeyB');
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    doc.hidden = false;
    expect(log).toEqual(['talk:on', 'talk:off']);
  });

  it('never talks while typing in the chat box, and opening it lets go', () => {
    const { input, log, key } = rig();
    input.active = true;
    key('keydown', 'KeyB');
    input.typing = true; // what Game does when the chat box opens
    input.clear();
    input.releaseTalk();
    key('keydown', 'KeyB');
    expect(log).toEqual(['talk:on', 'talk:off']);
  });

  it('whisper lets go on a release between visits, and on a phase change', () => {
    const { input, log, key } = rig();
    input.active = true;
    key('keydown', 'AltLeft');
    input.active = false;
    key('keyup', 'AltLeft');
    input.active = true;
    key('keydown', 'AltLeft');
    input.clear();
    expect(log).toEqual(['whisper:on', 'whisper:off', 'whisper:on', 'whisper:off']);
  });

  it('H shows the controls on the role card and the reading too (input inactive)', () => {
    const { input, log, key } = rig();
    input.active = false;
    key('keydown', 'KeyH');
    expect(log).toEqual(['help:on']);
  });

  it('text fields type; checkboxes, sliders and buttons do not', () => {
    expect(isTextEntry({ tagName: 'INPUT', type: 'text' } as unknown as EventTarget)).toBe(true);
    expect(isTextEntry({ tagName: 'input' } as unknown as EventTarget)).toBe(true);
    expect(isTextEntry({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isTextEntry({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
    expect(isTextEntry({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    for (const type of ['checkbox', 'range', 'button']) expect(isTextEntry({ tagName: 'INPUT', type } as unknown as EventTarget)).toBe(false);
    expect(isTextEntry({ tagName: 'CANVAS' } as unknown as EventTarget)).toBe(false);
    expect(isTextEntry(null)).toBe(false);
    expect(isTextEntry(new EventTarget())).toBe(false);
  });
});

describe('rejected will changes (review 12)', () => {
  it('every reason the server sends has a line of its own, never the bare code', () => {
    const lines = new Set<string>();
    for (const r of REJECT_REASONS) {
      const t = rejectText(r);
      expect(t.length).toBeGreaterThan(5);
      expect(t).not.toContain(r);
      lines.add(t);
    }
    expect(lines.size).toBe(REJECT_REASONS.length);
  });
  it('an unknown code gets the generic line; a controller is told its button', () => {
    expect(rejectText('something-new')).toBe(rejectText('rejected'));
    expect(rejectText('constructor')).toBe(rejectText('rejected'));
    expect(rejectText('needs-parchment')).toContain('Tab');
    expect(rejectText('needs-parchment', true)).toContain('View');
  });
});

describe("the map's own words (review 14)", () => {
  it('each map has lines naming it; unknown ids read as the manor', () => {
    const arriving = new Set<string>();
    for (const id of MAP_IDS) {
      const w = mapWords(id);
      expect(w.address).toContain(MAPS[id].name);
      arriving.add(w.arriving);
    }
    expect(arriving.size).toBe(MAP_IDS.length);
    expect(mapWords('nowhere')).toEqual(mapWords('manor'));
    expect(mapWords(undefined)).toEqual(mapWords('manor'));
  });
});

describe("the lobby's start note follows the server's rules (review 5)", () => {
  const opts = (o: Partial<MatchOptions> = {}): MatchOptions => ({ fullMatch: false, fillBots: true, pushGrandma: false, map: 'manor', ...o });
  const humans = (n: number, willing: number[] = [], away: number[] = []): PlayerInfo[] =>
    Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: false, isHost: i === 0, willingGrandma: willing.includes(i), connected: !away.includes(i) }));
  const note = (players: PlayerInfo[], o?: Partial<MatchOptions>, self = 'p0') => lobbyStartNote({ players, hostId: 'p0', options: opts(o) }, self);

  it(`${MAX_PLAYERS} people and nobody willing: refused, bots or not`, () => {
    const n = note(humans(MAX_PLAYERS));
    expect(n.blocked).toBe(true);
    expect(n.text).toContain('Willing to be Grandma');
    expect(note(humans(MAX_PLAYERS, [3])).blocked).toBe(false);
  });
  it('nobody willing without bots: refused; with bots: a bot Grandma and the seats filled', () => {
    expect(note(humans(3), { fillBots: false }).blocked).toBe(true);
    const n = note(humans(3));
    expect(n).toEqual({ text: `Nobody volunteered: a bot will play Grandma. Bots will fill ${MIN_PLAYERS - 4} seat.`, blocked: false });
  });
  it('counts only people still connected', () => {
    expect(note(humans(MIN_PLAYERS, [0], [4]), { fillBots: false })).toEqual({ text: `Need ${MIN_PLAYERS} players (have ${MIN_PLAYERS - 1}), or tick "Fill empty seats with bots".`, blocked: true });
    expect(note(humans(MIN_PLAYERS, [0]), { fillBots: false })).toEqual({ text: 'Ready when you are.', blocked: false });
  });
  it('others wait for the host; nobody starts while a match runs', () => {
    expect(note(humans(5), {}, 'p2').text).toBe('Waiting for P0 to start.');
    const running = lobbyStartNote({ players: humans(5), hostId: 'p0', options: opts(), inProgress: {} as never }, 'p0');
    expect(running.blocked).toBe(true);
  });
});

describe('a match sent again keeps what the server will not resend (review 7)', () => {
  const match = (grandmaId: string): ServerMsg => ({
    t: 'match', role: 'cousin', grandmaId, names: {}, visits: ['tea'], options: { fullMatch: false, fillBots: true, pushGrandma: false, map: 'manor' },
    cousins: [{ id: 'a', name: 'A', color: '#f00', item: 'phone', itemName: 'Phone' }, { id: 'b', name: 'B', color: '#0f0', item: 'trophy', itemName: 'Trophy' }],
  });
  const wish = { id: 'w1', kind: 'tea' as const, text: 'A nice cup of tea, dear.', endsAt: 50 };

  it('a take-over mid-visit keeps the wish and the summons; a new match starts clean', () => {
    const s = new GameState();
    s.ingest(match('g'));
    s.ingest({ t: 'phase', phase: 'visit', visit: 'tea', endsAt: 100, time: 10 });
    s.ingest({ t: 'ev', e: 'wish', wish });
    s.ingest({ t: 'ev', e: 'summon', pos: { x: 0, y: 0, z: 0 }, endsAt: 30 });
    s.ingest(match('b')); // b takes over as Grandma
    expect(s.wish?.id).toBe('w1');
    expect(s.summon?.endsAt).toBe(30);
    expect(s.grandmaId).toBe('b');
    s.ingest({ t: 'phase', phase: 'lobby', visit: null, endsAt: 0, time: 0 });
    s.ingest(match('g'));
    expect(s.wish).toBeNull();
    expect(s.summon).toBeNull();
  });
});

describe('reduced motion (review 13)', () => {
  it('follows the system until the player chooses', () => {
    expect(systemDefaults(true).reducedMotion).toBe(true);
    expect(systemDefaults(false)).toEqual(DEFAULT_SETTINGS);
    expect(new Settings('', systemDefaults(true)).get().reducedMotion).toBe(true);
    expect(new Settings('', systemDefaults(false)).get().reducedMotion).toBe(false);
  });
  it('lightning is all or nothing normally; eased and dimmer with reduced motion', () => {
    expect(easeFlash(0, true, false, 1 / 60)).toBe(1);
    expect(easeFlash(1, false, false, 1 / 60)).toBe(0);
    let k = 0;
    const first = easeFlash(0, true, true, 1 / 60);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.2 * CALM_FLASH_PEAK);
    for (let i = 0; i < 60; i++) k = easeFlash(k, true, true, 1 / 60);
    expect(k).toBeLessThanOrEqual(CALM_FLASH_PEAK);
    expect(k).toBeGreaterThan(0.9 * CALM_FLASH_PEAK);
    for (let i = 0; i < 120; i++) k = easeFlash(k, false, true, 1 / 60);
    expect(k).toBeLessThan(0.01);
  });
});

describe("Nana's reasons name bots as the HUD does (review 15)", () => {
  it('no "(bot)" in the margin', () => {
    const t = reasonText({ target: 'c', via: 'tut', moved: -5, why: "found Clementine (bot)'s phone where it shouldn't be", truth: 'Dot (bot) planted it there.' });
    expect(t.did).toBe("She tutted: found Clementine's phone where it shouldn't be.");
    expect(t.really).toBe('Really: Dot planted it there.');
  });
});

describe('audio devices in the settings', () => {
  it('keep a browser device id, and fall back to the system default for anything else', () => {
    expect(DEFAULT_SETTINGS.micDevice).toBe('');
    expect(DEFAULT_SETTINGS.outputDevice).toBe('');
    const id = 'f3a9c1e0b2d4AbC+/=_-';
    expect(sanitize({ micDevice: id, outputDevice: id })).toMatchObject({ micDevice: id, outputDevice: id });
    expect(sanitize({ micDevice: '<script>', outputDevice: 42 })).toMatchObject({ micDevice: '', outputDevice: '' });
    expect(sanitize({ micDevice: 'x'.repeat(201) }).micDevice).toBe('');
  });
});
