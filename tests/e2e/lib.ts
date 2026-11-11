// Shared harness for the end-to-end suites.
//
// - builds the client once (vite) into a temp dir,
// - runs the REAL game server in-process (fast phases, optional visit length),
// - drives real Chromium pages (fake mic) through the real UI and keyboard/mouse,
// - records every message each page receives, so suites can assert on what went
//   over the wire (shares always sum to 100, secrets never reach the wrong client),
// - collects page errors and console errors, and takes screenshots.
//
// Camera direction is the one thing set through the client's debug hook
// (window.__inh.input.yaw): headless Chromium delivers pointer-locked mouse
// moves as jumps that cancel out. Every action (keys, mouse buttons, clicks,
// drags) goes through the real input path.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { build } from 'vite';
import { findPath } from '../../server/nav.js';
import { startServer, type ServerHandle } from '../../server/index.js';
import type { CharSnap, Phase, PropSnap, Vec3 } from '../../shared/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(here, '../..');
export const SHOTS = path.join(here, 'screenshots');

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ───────────────────────── results ─────────────────────────

export interface Check { suite: string; name: string; ok: boolean; detail: string }

export class Report {
  readonly checks: Check[] = [];
  constructor(readonly suite: string) {}
  check(name: string, ok: boolean, detail = ''): boolean {
    this.checks.push({ suite: this.suite, name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  [${this.suite}] ${name}${detail ? `  — ${detail}` : ''}`);
    return ok;
  }
  get failed(): Check[] { return this.checks.filter((c) => !c.ok); }
}

// ───────────────────────── build + server ─────────────────────────

let builtDir: string | null = null;

/** Build the client once per process (or reuse E2E_CLIENT_DIR). */
export async function buildClient(): Promise<string> {
  if (builtDir) return builtDir;
  const reuse = process.env.E2E_CLIENT_DIR;
  if (reuse && fs.existsSync(path.join(reuse, 'index.html'))) { builtDir = reuse; return reuse; }
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'inh-e2e-client-'));
  await build({
    configFile: path.join(REPO, 'vite.config.ts'), root: path.join(REPO, 'client'), logLevel: 'error',
    build: { outDir: out, emptyOutDir: true, sourcemap: false },
  });
  builtDir = out;
  process.on('exit', () => { if (!reuse) fs.rmSync(out, { recursive: true, force: true }); });
  return out;
}

export async function startGameServer(opts: { visitSeconds?: number; seed?: number; botsIdle?: boolean } = {}): Promise<ServerHandle> {
  const staticDir = await buildClient();
  for (let i = 0; i < 10; i++) {
    const port = 40000 + Math.floor(Math.random() * 10000);
    try {
      return await startServer({ port, staticDir, quiet: true, fast: true, visitSeconds: opts.visitSeconds, seed: opts.seed, botsIdle: opts.botsIdle });
    } catch { /* port in use: try another */ }
  }
  throw new Error('could not bind a port for the game server');
}

export async function launchBrowser(): Promise<Browser> {
  const b = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
  b.on('disconnected', () => console.log('  (browser disconnected)'));
  return b;
}

// ───────────────────────── wire recording (runs in the page) ─────────────────────────

/** What a page has received, summarised in the page (snapshots are too many to ship back raw). */
export interface Rx {
  role: string | null;
  phases: string[];
  types: Record<string, number>;
  events: Record<string, number>;
  /** Every non-snapshot message, in order, with the phase it arrived in. */
  log: { phase: string; msg: Record<string, unknown> }[];
  snaps: number;
  maxSnapBytes: number;
  /** Snapshots whose shares did not sum to 100 (or were not integers). */
  badShares: { phase: string; shares: Record<string, number> }[];
  /** Snapshot props flagged favourite (only Grandma may ever see one). */
  favouriteSeen: number;
  /** Phases in which a snapshot carried a sleeping/ragdoll state for us, for reconnect checks. */
  selfStates: Record<string, number>;
}

function installRecorder(): void {
  type Msg = Record<string, unknown>;
  const rx = {
    role: null as string | null, phases: [] as string[], types: {} as Record<string, number>, events: {} as Record<string, number>,
    log: [] as { phase: string; msg: Msg }[], snaps: 0, maxSnapBytes: 0, badShares: [] as { phase: string; shares: Record<string, number> }[],
    favouriteSeen: 0, selfStates: {} as Record<string, number>,
  };
  let phase = 'none';
  let selfId = '';
  (window as unknown as { __rx: typeof rx }).__rx = rx;
  const Orig = window.WebSocket;
  class Recording extends Orig {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      this.addEventListener('message', (e: MessageEvent) => {
        if (typeof e.data !== 'string') return;
        let m: Msg;
        try { m = JSON.parse(e.data) as Msg; } catch { return; }
        const t = String(m.t);
        rx.types[t] = (rx.types[t] ?? 0) + 1;
        if (t === 'welcome') selfId = String(m.you);
        if (t === 'match') rx.role = String(m.role);
        if (t === 'phase') { phase = String(m.phase); rx.phases.push(phase); }
        if (t === 'ev') { const k = String(m.e); rx.events[k] = (rx.events[k] ?? 0) + 1; }
        if (t === 'snap') {
          rx.snaps++;
          rx.maxSnapBytes = Math.max(rx.maxSnapBytes, e.data.length);
          const shares = (m.shares ?? {}) as Record<string, number>;
          const vals = Object.values(shares);
          const sum = vals.reduce((a, b) => a + b, 0);
          if (vals.length > 0 && (sum !== 100 || vals.some((v) => !Number.isInteger(v) || v < 0))) {
            if (rx.badShares.length < 20) rx.badShares.push({ phase, shares });
          }
          for (const p of (m.props ?? []) as { favourite?: boolean }[]) if (p.favourite) rx.favouriteSeen++;
          for (const c of (m.chars ?? []) as { id: string; state: string }[]) {
            if (c.id === selfId) rx.selfStates[c.state] = (rx.selfStates[c.state] ?? 0) + 1;
          }
          return;
        }
        if (t === 'pong' || t === 'rtc') return;
        if (rx.log.length < 5000) rx.log.push({ phase, msg: m });
      });
    }
  }
  window.WebSocket = Recording as typeof WebSocket;
}

/**
 * In-page steering for tests: while `__steerPts` holds waypoints, every frame
 * turns the camera (input.yaw) toward the next one from our latest snapshot
 * position. Turning happens at frame rate in the page; the test holds the real
 * W key from Node.
 *
 * It also zeroes mouse-look sensitivity: under pointer lock, Playwright's
 * synthetic mouse buttons arrive with bogus movement jumps (the gap between its
 * cursor and the page's), which would spin the camera. Tests aim with yaw.
 */
function installSteer(): void {
  interface SteerWindow {
    __steerPts: { x: number; z: number }[] | null;
    __inh?: { state: { selfId: string; latest(): { chars: { id: string; pos: { x: number; z: number } }[] } | null }; input: { yaw: number; sensitivity: number } };
  }
  const w = window as unknown as SteerWindow;
  w.__steerPts = null;
  const loop = (): void => {
    const pts = w.__steerPts;
    const inh = w.__inh;
    if (inh) inh.input.sensitivity = 0;
    if (pts && pts.length > 0 && inh) {
      const s = inh.state;
      const me = s.latest()?.chars.find((c) => c.id === s.selfId);
      if (me) {
        while (pts.length > 1 && Math.hypot(pts[0].x - me.pos.x, pts[0].z - me.pos.z) < 0.4) pts.shift();
        const t = pts[0];
        inh.input.yaw = Math.atan2(-(t.x - me.pos.x), -(t.z - me.pos.z));
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ───────────────────────── a player (one browser page) ─────────────────────────

interface InhWindow {
  __inh: {
    state: {
      selfId: string; phase: Phase; role: string | null; grandmaId: string; shares: Record<string, number>;
      latest(): { time: number; chars: CharSnap[]; props: PropSnap[] } | null;
      lobby: { room: string; players: { id: string; name: string; isBot: boolean; willingGrandma: boolean }[] } | null;
      match: { cousins: { id: string; name: string }[]; grandmaId: string } | null;
    };
    input: { yaw: number; pitch: number; locked: boolean };
  };
  __rx: Rx;
  __voiceDebug?: () => { selfId: string; micOk: boolean | null; peers: Record<string, { connectionState: string; dcOpen: boolean; gain: number; level: number }> };
}

export class Player {
  readonly errors: string[] = [];
  readonly consoleErrors: string[] = [];
  private shotN = 0;

  private constructor(readonly name: string, readonly ctx: BrowserContext, readonly page: Page, readonly tag: string) {}

  /**
   * Open a page. Tests render at the low graphics preset (?gfx=low): this
   * container has no GPU, and software WebGL at full resolution runs at ~2 fps.
   */
  static async open(browser: Browser, url: string, name: string, tag: string, viewport = { width: 1280, height: 720 }): Promise<Player> {
    const ctx = await browser.newContext({ viewport });
    // tsx (esbuild keepNames) can wrap functions in __name(...); give the page a no-op.
    await ctx.addInitScript({ content: 'window.__name = window.__name || ((f) => f);' });
    await ctx.addInitScript(installRecorder);
    await ctx.addInitScript(installSteer);
    const page = await ctx.newPage();
    const p = new Player(name, ctx, page, tag);
    page.on('pageerror', (e) => p.errors.push(e.message));
    page.on('crash', () => { p.errors.push('PAGE CRASHED'); console.log(`  !! ${tag}: page crashed`); });
    page.on('close', () => console.log(`  (${tag}: page closed)`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const text = m.text();
      // The fake media device and headless GPU are noisy in ways that are not bugs in the game.
      if (/GPU stall|WebGL.*performance|Autoplay|favicon/i.test(text)) return;
      p.consoleErrors.push(text);
    });
    await page.goto(withGfx(url));
    return p;
  }

  /** Navigate this player's page (keeps the test graphics preset). */
  async goto(url: string): Promise<void> {
    await this.page.goto(withGfx(url));
  }

  private ev<T>(fn: (w: InhWindow) => T): Promise<T> {
    // Playwright serialises the function: it must not close over anything.
    return this.page.evaluate(`(${fn.toString()})(window)`) as Promise<T>;
  }

  async id(): Promise<string> { return this.ev((w) => w.__inh.state.selfId); }
  async phase(): Promise<Phase> { return this.ev((w) => w.__inh.state.phase); }
  async role(): Promise<string | null> { return this.ev((w) => w.__inh.state.role); }
  async rx(): Promise<Rx> { return this.ev((w) => w.__rx); }
  async room(): Promise<string> { return this.ev((w) => w.__inh.state.lobby?.room ?? ''); }

  async snap(): Promise<{ time: number; chars: CharSnap[]; props: PropSnap[] } | null> {
    return this.ev((w) => w.__inh.state.latest());
  }

  async me(): Promise<CharSnap | null> {
    return this.ev((w) => {
      const s = w.__inh.state;
      return s.latest()?.chars.find((c) => c.id === s.selfId) ?? null;
    });
  }

  async char(id: string): Promise<CharSnap | null> {
    const s = await this.snap();
    return s?.chars.find((c) => c.id === id) ?? null;
  }

  async voice(): Promise<ReturnType<NonNullable<InhWindow['__voiceDebug']>> | null> {
    return this.ev((w) => (w.__voiceDebug ? w.__voiceDebug() : null));
  }

  async waitFor(desc: string, fn: () => Promise<boolean>, timeoutMs = 20000, every = 100): Promise<boolean> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (await fn()) return true;
      await sleep(every);
    }
    console.log(`  (${this.tag}: timed out waiting for ${desc})`);
    return false;
  }

  /** Wait until the page is in `phase` now. */
  async waitPhase(phase: Phase, timeoutMs = 30000): Promise<boolean> {
    return this.waitFor(`phase ${phase}`, async () => (await this.phase()) === phase, timeoutMs, 150);
  }

  /** Wait until the page has been told about `phase` at least `times` times (phases are short in fast mode). */
  async reached(phase: Phase, timeoutMs = 30000, times = 1): Promise<boolean> {
    return this.waitFor(`phase ${phase} reached`, async () => (await this.rx()).phases.filter((p) => p === phase).length >= times, timeoutMs, 200);
  }

  async setYaw(yaw: number): Promise<void> {
    await this.page.evaluate((y) => { (window as unknown as InhWindow).__inh.input.yaw = y; }, yaw);
  }

  async faceTo(p: { x: number; z: number }): Promise<void> {
    const me = await this.me();
    if (!me) return;
    await this.setYaw(Math.atan2(-(p.x - me.pos.x), -(p.z - me.pos.z)));
  }

  /** Click the game canvas to take pointer lock (needed for mouse buttons). */
  async lock(): Promise<boolean> {
    for (let i = 0; i < 5; i++) {
      if (await this.ev((w) => w.__inh.input.locked)) return true;
      // Park the cursor first: once locked, a cursor jump arrives as a huge mouse-look.
      await this.page.mouse.move(640, 400);
      await this.page.mouse.click(640, 400);
      await sleep(200);
    }
    return this.ev((w) => w.__inh.input.locked);
  }

  async tap(key: string, holdMs = 80): Promise<void> {
    await this.page.keyboard.down(key);
    await sleep(holdMs);
    await this.page.keyboard.up(key);
  }

  async mouse(button: 'left' | 'right', holdMs = 80): Promise<void> {
    await this.page.mouse.down({ button });
    await sleep(holdMs);
    await this.page.mouse.up({ button });
  }

  /** Hold-Q quick-chat wheel and pick line `n` (1-8) with the number key. */
  async quickChat(n: number, wheelKey = 'q'): Promise<void> {
    await this.page.keyboard.down(wheelKey);
    await sleep(120);
    await this.tap(`Digit${n}`);
    await sleep(60);
    await this.page.keyboard.up(wheelKey);
  }

  /**
   * Walk to a (possibly moving) target with the real W key, routing around
   * furniture with the bots' path finder; the page steers toward the next
   * waypoint every frame. Slows to a sneak (C) for the last 1.5 m so it stops
   * close to the goal. Returns true once within `within` metres (flat).
   */
  async walkTo(target: Vec3 | (() => Promise<Vec3 | null>), opts: { within?: number; timeoutMs?: number; run?: boolean } = {}): Promise<boolean> {
    const within = opts.within ?? 0.8;
    const end = Date.now() + (opts.timeoutMs ?? 20000);
    const kb = this.page.keyboard;
    const held = new Set<string>();
    const hold = async (k: string, on: boolean) => {
      if (on && !held.has(k)) { await kb.down(k); held.add(k); }
      if (!on && held.has(k)) { await kb.up(k); held.delete(k); }
    };
    let lastPos: Vec3 | null = null;
    let stuckSince = Date.now();
    try {
      while (Date.now() < end) {
        const me = await this.me();
        const goal = typeof target === 'function' ? await target() : target;
        if (!me || !goal) { await sleep(100); continue; }
        if (me.state !== 'normal') { await hold('KeyW', false); await sleep(150); continue; }
        const d = Math.hypot(goal.x - me.pos.x, goal.z - me.pos.z);
        if (d <= within) return true;
        const path = findPath(me.pos, goal).map((w) => ({ x: w.x, z: w.z }));
        if (path.length === 0 || Math.hypot(path[path.length - 1].x - goal.x, path[path.length - 1].z - goal.z) > 0.05) path.push({ x: goal.x, z: goal.z });
        await this.page.evaluate((pts) => { (window as unknown as { __steerPts: unknown }).__steerPts = pts; }, path);
        await hold('ShiftLeft', !!opts.run && d > 2.5);
        await hold('KeyC', d < 1.5);
        await hold('KeyW', true);
        if (lastPos && Math.hypot(me.pos.x - lastPos.x, me.pos.z - lastPos.z) > 0.1) stuckSince = Date.now();
        else if (Date.now() - stuckSince > 1500) {
          // Wedged against something: side-step and try again.
          const side = Math.random() < 0.5 ? 'KeyA' : 'KeyD';
          await kb.down(side); await sleep(400); await kb.up(side);
          stuckSince = Date.now();
        }
        lastPos = me.pos;
        await sleep(60);
      }
      return false;
    } finally {
      for (const k of [...held]) await hold(k, false);
      await this.page.evaluate(() => { (window as unknown as { __steerPts: unknown }).__steerPts = null; });
    }
  }

  async shot(label: string): Promise<string> {
    fs.mkdirSync(SHOTS, { recursive: true });
    const file = path.join(SHOTS, `${this.tag}-${String(++this.shotN).padStart(2, '0')}-${label}.png`);
    await this.page.screenshot({ path: file });
    return file;
  }

  async close(): Promise<void> { await this.ctx.close().catch(() => {}); }
}

function withGfx(url: string): string {
  const u = new URL(url);
  if (!u.searchParams.has('gfx')) u.searchParams.set('gfx', process.env.E2E_GFX ?? 'low');
  return u.toString();
}

/** Snapshot helpers usable in Node with a fetched snapshot. */
export function charIn(s: { chars: CharSnap[] } | null, id: string): CharSnap | null {
  return s?.chars.find((c) => c.id === id) ?? null;
}

export function flat(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Create a room on `host`, then join the others to it. Returns the room code. */
export async function gather(host: Player, others: Player[], base: string): Promise<string> {
  await host.page.getByText('Create a new room').click();
  await host.waitFor('room code', async () => (await host.room()) !== '', 10000);
  const room = await host.room();
  for (const o of others) {
    await o.goto(`${base}/?name=${encodeURIComponent(o.name)}&room=${room}`);
    await o.waitFor('lobby', async () => (await o.room()) === room, 10000);
  }
  return room;
}

export async function setWilling(p: Player, on: boolean): Promise<void> {
  const box = p.page.getByLabel('Willing to be Grandma');
  if ((await box.isChecked()) !== on) await box.click();
  await p.waitFor('willing flag', async () => p.page.evaluate((want) => {
    const s = (window as unknown as InhWindow).__inh.state;
    return s.lobby?.players.find((x) => x.id === s.selfId)?.willingGrandma === want;
  }, on), 5000);
}

/** Pass/fail summary for a set of reports; returns true when everything passed. */
export function summarise(reports: Report[]): boolean {
  const all = reports.flatMap((r) => r.checks);
  const failed = all.filter((c) => !c.ok);
  console.log(`\n${all.length - failed.length}/${all.length} checks passed`);
  for (const f of failed) console.log(`  FAILED [${f.suite}] ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  return failed.length === 0;
}
