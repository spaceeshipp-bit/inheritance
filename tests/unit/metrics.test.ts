// Playtest metrics (GDD "Playtest metrics", BUILD_PLAN 4): one anonymous JSON
// line per finished match and one per survey answer, so the GDD's gates can be
// measured from real playtests: Grandma's replay intent, framing accuracy, the
// leader-flip rate.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../../shared/constants.js';
import { SURVEY_QUESTIONS, type ServerMsg } from '../../shared/protocol.js';
import { surveyQuestions } from '../../client/src/hud/reading.js';
import { jsonLines } from '../../server/index.js';
import { RoomManager, type Conn, type Session } from '../../server/room.js';
import { parseClientMsg } from '../../server/validate.js';
import { makeMatch, stepUntil, toVisit } from './helpers.js';

class FakeConn implements Conn {
  msgs: ServerMsg[] = [];
  send(data: string): void { this.msgs.push(JSON.parse(data) as ServerMsg); }
  close(): void { /* nothing */ }
}

/** A room with two humans (Ann is the willing Grandma) and bots, run on a fake clock. */
function playedRoom() {
  let now = 1000;
  const records: Record<string, unknown>[] = [];
  const mgr = new RoomManager({ now: () => now, fast: true, seed: 3, record: (l) => records.push(l) });
  const join = (name: string, room: string): { s: Session; id: string; conn: FakeConn } => {
    const conn = new FakeConn();
    const s = mgr.connect(conn, '');
    mgr.onRaw(s, JSON.stringify({ t: 'hello', name, room, protocol: PROTOCOL_VERSION }));
    const w = conn.msgs.find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>;
    return { s, id: w.you, conn };
  };
  const ann = join('Ann Example', '');
  const code = [...mgr.rooms.keys()][0];
  const bob = join('Bob Example', code);
  const send = (j: { s: Session }, msg: object): void => mgr.onRaw(j.s, JSON.stringify(msg));
  const run = (secs: number, until?: () => boolean): void => {
    for (let i = 0; i < secs * 30 && !until?.(); i++) { now += 1 / 30; mgr.tick(1 / 30); }
  };
  send(ann, { t: 'lobby', willingGrandma: true });
  send(ann, { t: 'start' });
  const room = mgr.rooms.get(code)!;
  return { mgr, room, ann, bob, send, run, records, advance: (s: number) => { now += s; } };
}

describe('playtest records', () => {
  it('a finished match writes one anonymous record with the numbers the gates need', () => {
    const w = playedRoom();
    expect(w.room.match).not.toBeNull();
    w.run(400, () => w.room.match === null);
    expect(w.room.match).toBeNull();
    const matches = w.records.filter((r) => r.type === 'match');
    expect(matches).toHaveLength(1);
    const r = matches[0];
    expect(r).toMatchObject({ type: 'match', protocol: PROTOCOL_VERSION, finished: true, humans: 2, grandma: 'human', visitsPlayed: 1 });
    expect(typeof r.match).toBe('string');
    expect(typeof r.at).toBe('string');
    const cousins = r.cousins as { human: boolean; share: number; sabotage: number }[];
    expect(cousins).toHaveLength(4);
    expect(cousins.filter((c) => c.human)).toHaveLength(1);
    expect(cousins.reduce((a, c) => a + c.share, 0)).toBe(100);
    for (const k of ['framingAccuracy', 'plants', 'plantsAccusedOwner', 'shoves', 'breaks', 'grandmaScore', 'leaderKept', 'voteFoundWorst', 'moments', 'leaders']) expect(r).toHaveProperty(k);
    // One visit: the leader is noted at its halfway mark and at its end.
    expect((r.leaders as { at: string }[]).map((l) => l.at)).toEqual(['half', 'end']);
    // Nothing names or identifies a player.
    const text = JSON.stringify(r);
    for (const p of [...w.room.players.values()]) {
      expect(text).not.toContain(p.name);
      expect(text).not.toContain(p.id);
    }
    expect(text).not.toContain('Example');
  });

  it("survey answers count on the results screen and for 10 minutes after, tagged with the player's role", () => {
    const w = playedRoom();
    w.send(w.ann, { t: 'survey', q: 'again', a: 'yes' }); // mid-match: not yet
    expect(w.records.filter((r) => r.type === 'survey')).toHaveLength(0);
    w.run(400, () => w.room.match?.phase === 'results');
    expect(w.room.match?.phase).toBe('results');
    w.send(w.ann, { t: 'survey', q: 'again', a: 'yes' });
    w.run(60, () => w.room.match === null);
    w.send(w.bob, { t: 'survey', q: 'laughed', a: 'no' });
    const survey = w.records.filter((r) => r.type === 'survey');
    expect(survey).toEqual([
      expect.objectContaining({ role: 'grandma', q: 'again', a: 'yes' }),
      expect.objectContaining({ role: 'cousin', q: 'laughed', a: 'no' }),
    ]);
    const matchId = w.records.find((r) => r.type === 'match')!.match;
    expect(survey.every((r) => r.match === matchId)).toBe(true);
    // Too late, and too many, count for nothing.
    w.advance(601);
    w.send(w.bob, { t: 'survey', q: 'clip', a: 'yes' });
    expect(w.records.filter((r) => r.type === 'survey')).toHaveLength(2);
  });

  it('answers are capped per player per match', () => {
    const w = playedRoom();
    w.run(400, () => w.room.match === null);
    for (let i = 0; i < 30; i++) w.send(w.bob, { t: 'survey', q: 'clip', a: i % 2 ? 'yes' : 'no' });
    expect(w.records.filter((r) => r.type === 'survey')).toHaveLength(12);
  });

  it('the results screen asks exactly what the server accepts, Grandma about playing Grandma', () => {
    for (const role of ['grandma', 'cousin'] as const) {
      const qs = surveyQuestions(role);
      expect(qs.map((x) => x.q)).toEqual([...SURVEY_QUESTIONS]);
      for (const x of qs) for (const a of x.answers) expect(parseClientMsg(JSON.stringify({ t: 'survey', q: x.q, a }))).not.toBeNull();
    }
    expect(surveyQuestions('grandma')[0].text).toContain('Grandma');
    expect(surveyQuestions('cousin')[0].text).not.toContain('Grandma');
  });

  it('only the three questions and three answers are accepted', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'survey', q: 'again', a: 'maybe' }))).toEqual({ t: 'survey', q: 'again', a: 'maybe' });
    expect(parseClientMsg(JSON.stringify({ t: 'survey', q: 'again', a: 'definitely' }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'survey', q: 'name', a: 'yes' }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'survey', q: 'again' }))).toBeNull();
  });
});

describe('newcomers', () => {
  it('humans count as new in their first match in a room, not in the next', () => {
    const w = playedRoom();
    const m1 = w.room.match!;
    expect(m1.isNewcomer(w.ann.id)).toBe(true);
    expect(m1.isNewcomer(w.bob.id)).toBe(true);
    w.run(400, () => w.room.match === null);
    w.send(w.ann, { t: 'start' });
    const m2 = w.room.match!;
    expect(m2).not.toBe(m1);
    expect(m2.isNewcomer(w.ann.id)).toBe(false);
    expect(m2.isNewcomer(w.bob.id)).toBe(false);
    // A friend who just arrived is new, bots never are.
    expect(m2.cousinIds.filter((id) => !m2.isHuman(id)).some((id) => m2.isNewcomer(id))).toBe(false);
  });
});

describe('the leader-flip metric', () => {
  it('compares the winner with the leader at the halfway mark of a one-visit match', () => {
    const { m } = makeMatch({ humans: ['g', 'a', 'b', 'c', 'd'], grandmaId: 'g', seed: 4 });
    toVisit(m);
    const shares = (s: Record<string, number>) => { Object.assign(m.will.shares, s); };
    shares({ a: 40, b: 20, c: 20, d: 20 });
    stepUntil(m, () => m.leaders.length > 0, 120);
    expect(m.leaders[0]).toMatchObject({ visit: 0, at: 'half', id: 'a' });
    shares({ a: 20, b: 40, c: 20, d: 20 });
    stepUntil(m, () => m.phase === 'results', 300);
    const s = m.summary();
    expect(s.leaders.map((l) => [l.at, l.leader])).toEqual([['half', m.cousinIds.indexOf('a')], ['end', m.cousinIds.indexOf('b')]]);
    expect(s.leaderKept).toBe(false);
  });
});

describe('the JSON-lines file', () => {
  it('appends one line per record, in order, creating the folder', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inh-metrics-'));
    const file = path.join(dir, 'nested', 'playtests.jsonl');
    const sink = jsonLines(file, (msg) => { throw new Error(msg); });
    for (let i = 0; i < 5; i++) sink({ type: 'survey', n: i });
    // Wait for the writes to land.
    for (let t = 0; t < 100 && (!fs.existsSync(file) || fs.readFileSync(file, 'utf8').split('\n').length < 6); t++) await new Promise((r) => setTimeout(r, 10));
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { n: number });
    expect(lines.map((l) => l.n)).toEqual([0, 1, 2, 3, 4]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
