// DEV ONLY (?mock=grandma | ?mock=cousin). An offline fake server behind the
// same Link interface as the WebSocket, so net.ts, state.ts and everything
// above run exactly as against the real server. It answers hello/ping, runs a
// lobby with bots, then a match from MockSim, and the reading/vote/results.
//
// Extra URL params: &phase=lobby|roles|visit|intermission|reading|vote|results
// (jump straight there), &storm=1 (power out + lightning), &flash=1 (lightning
// stays on), &specsoff=1, &lineup=1 (bots stand still in a row), &reveal=N,
// &near=M (with lineup: one cousin stands M metres in front of you), &wallbot=1
// (a cousin stands in the kitchen behind the wall you face), &holding=1 (start
// holding another cousin's item), &smash=1 (an heirloom breaks in front of you
// at 2.5 s), &tie=1 (the reading and results end in a tie for the top share).
// Bots are named like the real server's ("Bertie (bot)").
import {
  COUSINS, PREFERENCE_CARDS, PROTOCOL_VERSION, QUICKCHAT, READING_TIME, RESULTS_TIME, ROLE_REVEAL_TIME, SNAPSHOT_HZ,
  VISITS, VOTE_TIME, INTERMISSION_TIME, type VisitId,
} from '../../../shared/constants.js';
import type { ClientMsg, GameEvent, ServerMsg } from '../../../shared/protocol.js';
import { grandmaScore } from '../../../shared/scoring.js';
import type { CousinInfo, MatchOptions, Phase, PlayerInfo } from '../../../shared/types.js';
import { readingOrder } from '../../../shared/will.js';
import type { LinkFactory } from '../net.js';
import { MockSim } from './mockSim.js';

export interface MockOptions { role: 'grandma' | 'cousin'; phase: string; params: URLSearchParams }

const BOT_NAMES = ['Bertie', 'Clementine', 'Dot', 'Edmund', 'Florence', 'Gus'];

class MockServer {
  private t = 0;
  private last = performance.now();
  private timer: ReturnType<typeof setInterval> | undefined;
  private me = 'p1';
  private name = 'You';
  private players: PlayerInfo[] = [];
  private options: MatchOptions = { fullMatch: false, fillBots: true, pushGrandma: false };
  private phase: Phase = 'lobby';
  private visit: VisitId | null = null;
  private endsAt = 0;
  private sim: MockSim | null = null;
  private cousins: CousinInfo[] = [];
  private grandmaId = '';
  private names: Record<string, string> = {};
  private tick = 0;
  private snapAcc = 0;
  private hold = false;
  private visits: VisitId[] = ['tea'];

  constructor(private o: MockOptions, private out: (m: ServerMsg) => void) {}

  open(): void {
    this.last = performance.now();
    this.timer = setInterval(() => this.step(), 1000 / 60);
  }
  close(): void { clearInterval(this.timer); }

  private send(m: ServerMsg): void { this.out(m); }

  handle(m: ClientMsg): void {
    switch (m.t) {
      case 'hello': {
        this.name = m.name;
        this.send({ t: 'welcome', you: this.me, token: 'mock-token', room: m.room || 'MOCK1', protocol: PROTOCOL_VERSION });
        this.players = [
          { id: this.me, name: m.name, isBot: false, isHost: true, willingGrandma: this.o.role === 'grandma', connected: true },
          ...BOT_NAMES.slice(0, 5).map((n, i) => ({ id: `b${i + 2}`, name: `${n} (bot)`, isBot: true, isHost: false, willingGrandma: false, connected: true })),
        ];
        this.sendLobby();
        this.send({ t: 'peers', ids: [] });
        if (this.o.phase !== 'lobby') setTimeout(() => this.startMatch(), 300);
        break;
      }
      case 'ping': this.send({ t: 'pong', ts: m.ts, time: this.t }); break;
      case 'lobby':
        if (m.willingGrandma !== undefined) this.players[0].willingGrandma = m.willingGrandma;
        if (m.options) this.options = { ...this.options, ...m.options };
        this.sendLobby();
        break;
      case 'start': this.startMatch(); break;
      case 'input': this.sim?.input(m); break;
      case 'grandma': if (this.o.role === 'grandma') this.sim?.grandma(m, this.t); break;
      case 'quick': this.sim?.bubble(this.me, (this.o.role === 'grandma' ? QUICKCHAT.grandma : QUICKCHAT.cousin)[m.line] ?? '...', true); break;
      case 'chat': this.sim?.bubble(this.me, m.text, false); break;
      case 'tattle': this.sim?.bubble(this.grandmaId, 'Is that so? Hmm.', true); break;
      case 'vote': break;
      default: break;
    }
  }

  private sendLobby(): void {
    this.send({ t: 'lobby', room: 'MOCK1', players: this.players, hostId: this.me, options: this.options, phase: this.phase });
  }

  private setPhase(phase: Phase, dur: number, visit: VisitId | null = this.visit): void {
    this.phase = phase;
    this.visit = visit;
    this.endsAt = this.t + dur;
    this.send({ t: 'phase', phase, visit, endsAt: this.endsAt, time: this.t });
  }

  private startMatch(): void {
    const p = this.o.params;
    const storm = p.get('storm') === '1';
    this.visits = this.options.fullMatch ? ['tea', 'dinner', 'storm'] : storm ? ['storm'] : ['tea'];
    // Jumping to an intermission needs a match with a visit after it.
    if (this.o.phase === 'intermission' && this.visits.length < 2) this.visits = ['tea', 'dinner', 'storm'];
    const bots = this.players.slice(1);
    let cousinPlayers: PlayerInfo[];
    if (this.o.role === 'grandma') { this.grandmaId = this.me; cousinPlayers = bots; }
    else { this.grandmaId = bots[bots.length - 1].id; cousinPlayers = [this.players[0], ...bots.slice(0, -1)]; }
    this.names = Object.fromEntries(this.players.map((x) => [x.id, x.id === this.grandmaId && this.o.role === 'cousin' ? 'Nana Agatha (bot)' : x.name]));
    this.cousins = cousinPlayers.map((x, i) => ({ id: x.id, name: x.name, color: COUSINS[i].color, item: COUSINS[i].key, itemName: COUSINS[i].item }));
    this.send({
      t: 'match', role: this.o.role, grandmaId: this.grandmaId, cousins: this.cousins, names: this.names, visits: this.visits,
      options: this.options, ...(this.o.role === 'grandma' ? { prefCards: [PREFERENCE_CARDS[0], PREFERENCE_CARDS[5]] } : {}),
    });
    this.t = 0;
    this.sim = new MockSim({
      me: this.me, role: this.o.role, grandmaId: this.grandmaId, cousins: this.cousins, names: this.names, storm,
      specsOff: p.get('specsoff') === '1', lineup: p.get('lineup') === '1', flash: p.get('flash') === '1',
      near: Number(p.get('near') ?? 0) || 0, wallBot: p.get('wallbot') === '1', holding: p.get('holding') === '1', smash: p.get('smash') === '1',
      emit: (ev: GameEvent, onlyGrandma?: boolean) => { if (!onlyGrandma || this.o.role === 'grandma') this.send({ t: 'ev', ...ev }); },
    });
    const jump = this.o.phase;
    this.visit = this.visits[0];
    if (jump === 'roles') this.setPhase('roles', ROLE_REVEAL_TIME);
    // Like the server, an intermission names the visit that comes next.
    else if (jump === 'intermission') { this.fastForward(15); this.setPhase('intermission', INTERMISSION_TIME, this.visits[1]); }
    else if (jump === 'reading' || jump === 'vote' || jump === 'results') { this.fastForward(20); this.toReading(); }
    else this.setPhase('roles', p.get('reveal') ? Number(p.get('reveal')) : Math.min(3, ROLE_REVEAL_TIME));
    this.hold = jump === 'reading' || jump === 'vote' || jump === 'results' || jump === 'roles' || jump === 'intermission';
    if (jump === 'vote') this.setPhase('vote', 600);
    if (jump === 'results') { this.setPhase('vote', 1); this.toResults(600); }
  }

  /** Run the sim quietly for a while (for jumping to later phases). */
  private fastForward(seconds: number): void {
    const sim = this.sim;
    if (!sim) return;
    for (let i = 0; i < seconds * 30; i++) { this.t += 1 / 30; sim.step(1 / 30, this.t); }
  }

  private toReading(): void {
    const sim = this.sim;
    if (!sim) return;
    // Make the reading interesting: one cousin cut off, one favourite (or, with
    // &tie=1, two cousins sharing the top share).
    const ids = this.cousins.map((c) => c.id);
    const shares: Record<string, number> = {};
    const tie = this.o.params.get('tie') === '1';
    const preset = tie ? [30, 30, 20, 20, 0, 0] : [34, 22, 18, 14, 12, 0];
    ids.forEach((id, i) => { shares[id] = preset[(i + 2) % ids.length] ?? 10; });
    const sum = Object.values(shares).reduce((a, b) => a + b, 0);
    shares[ids[tie ? 2 : 0]] += 100 - sum;
    sim.will.shares = shares;
    const order = readingOrder(sim.will);
    const n = (id: string) => this.names[id] ?? id;
    // More moments than the reading shows: it must pick three, people first, one per actor.
    const moments = [
      { kind: 'caught-red-handed' as const, t: 22, actor: ids[2], text: `${n(ids[2])} was caught red-handed (a shove).` },
      { kind: 'love-you-nana' as const, t: 41, actor: ids[1], victim: ids[2], text: `${n(ids[1])} said "Love you, Nana!" and shoved ${n(ids[2])} three seconds later.` },
      { kind: 'caught-red-handed' as const, t: 52, actor: ids[1], text: `${n(ids[1])} was caught red-handed (a theft).` },
      { kind: 'framed' as const, t: 77, actor: ids[3], victim: ids[2], text: `${n(ids[3])} planted ${n(ids[2])}'s item, and Nana fell for it.` },
      { kind: 'favourite-broken' as const, t: 95, actor: ids[0], text: `${n(ids[0])} broke Nana's favourite heirloom.` },
      { kind: 'big-cut' as const, t: 120, actor: this.grandmaId, victim: ids[4], text: `Nana took 28 points off ${n(ids[4])} in one sitting.` },
    ];
    this.send({ t: 'reading', result: { shares, order, moments } });
    this.setPhase('reading', READING_TIME);
  }

  private toResults(dur = RESULTS_TIME): void {
    const sim = this.sim;
    if (!sim) return;
    const shares = sim.will.shares;
    const ids = this.cousins.map((c) => c.id);
    const tie = this.o.params.get('tie') === '1';
    const sabotage: Record<string, number> = {};
    ids.forEach((id, i) => { sabotage[id] = (tie ? [0, 6, 2, 6, 1, 3] : [0, 6, 2, 9, 1, 3])[i % 6]; });
    const votes: Record<string, number> = {};
    ids.forEach((id, i) => { votes[id] = i === 3 ? (tie ? 2 : 3) : i === 1 ? 2 : 0; });
    const order = readingOrder(sim.will);
    this.send({
      t: 'results',
      result: {
        shares, order, moments: [], sabotage, grandmaScore: grandmaScore(shares, sabotage), votes, votedWorst: tie ? null : ids[3],
        metrics: { plants: 2, plantsAccusedOwner: 1, framingAccuracy: 0.5, shoves: 7, breaks: 3 },
      },
    });
    this.setPhase('results', dur);
  }

  private step(): void {
    const now = performance.now();
    // Follow wall-clock time even when frames are slow (software GL), in small sim steps.
    const dt = Math.min(1, (now - this.last) / 1000);
    this.last = now;
    const sim = this.sim;
    if (!sim) { this.t += dt; return; }
    const live = this.phase === 'visit' || this.phase === 'intermission';
    for (let left = dt; left > 1e-6; left -= 0.05) {
      const h = Math.min(0.05, left);
      this.t += h;
      if (live) sim.step(h, this.t);
    }
    if (!this.hold && this.t >= this.endsAt) this.advance();
    this.snapAcc += dt;
    if (this.snapAcc >= 1 / SNAPSHOT_HZ && this.phase !== 'lobby') {
      this.snapAcc = 0;
      this.tick++;
      this.send({
        t: 'snap', time: this.t, tick: this.tick, chars: sim.snapshotChars(), props: sim.snapshotProps(),
        shares: { ...sim.will.shares }, willAvail: sim.avail(this.t), dark: sim.dark && !sim.flash, flash: sim.flash,
      });
    }
  }

  private advance(): void {
    switch (this.phase) {
      case 'roles': this.setPhase('visit', VISITS[this.visits[0]].duration, this.visits[0]); break;
      case 'visit': {
        const i = this.visit ? this.visits.indexOf(this.visit) : -1;
        // The intermission's phase message carries the visit that comes next, as on the server.
        if (i >= 0 && i < this.visits.length - 1) this.setPhase('intermission', INTERMISSION_TIME, this.visits[i + 1]);
        else this.toReading();
        break;
      }
      case 'intermission': {
        const next = this.visit ?? 'tea';
        if (this.sim) this.sim.will.usedThisVisit = 0;
        this.setPhase('visit', VISITS[next].duration, next);
        break;
      }
      case 'reading': this.setPhase('vote', VOTE_TIME); break;
      case 'vote': this.toResults(); break;
      case 'results':
        this.sim = null;
        this.phase = 'lobby';
        this.send({ t: 'phase', phase: 'lobby', visit: null, endsAt: 0, time: this.t });
        this.sendLobby();
        break;
      default: break;
    }
  }

  get myName(): string { return this.name; }
}

/** A LinkFactory that talks to the in-page MockServer. */
export function mockLink(o: MockOptions): LinkFactory {
  return (h) => {
    let server: MockServer | null = new MockServer(o, (m) => setTimeout(() => h.message(JSON.stringify(m)), 15));
    setTimeout(() => { server?.open(); h.open(); }, 20);
    return {
      send: (s: string) => { if (server) setTimeout(() => server?.handle(JSON.parse(s) as ClientMsg), 15); },
      close: () => { server?.close(); server = null; setTimeout(() => h.close(), 0); },
    };
  };
}
