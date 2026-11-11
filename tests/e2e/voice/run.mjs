// End-to-end test for client/src/voice: real Chromium pages with fake mics, a
// real WebRTC mesh signalled through a tiny relay, and the real proximity graph.
//
//   node tests/e2e/voice/run.mjs            (add --headed to watch, --keep to leave it open 60 s)
//
// Builds tests/e2e/voice/harness.ts (which imports client/src/voice) with esbuild
// (vite's own dependency) into memory, serves it from relay.mjs on a random port
// 40000-49999, and drives the pages through window.__h (harness) and
// window.__voiceDebug (the voice module's debug hook). Exit code 0 = all passed.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRelay } from './relay.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { build } = require('esbuild');

const here = path.dirname(fileURLToPath(import.meta.url));
const headed = process.argv.includes('--headed');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ids shaped like the game server's (p<n><hex>). The lower id offers.
const A = 'p1aaaa', B = 'p2bbbb', C = 'p3cccc', D = 'p0dddd';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const fmt = (n) => (typeof n === 'number' ? (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(3)) : String(n));

async function main() {
  // ── Build the harness bundle ──
  const bundle = await build({
    entryPoints: [path.join(here, 'harness.ts')],
    bundle: true, format: 'esm', target: 'chrome120', write: false, logLevel: 'warning', sourcemap: 'inline',
  });
  const files = {
    '/harness.html': { type: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(here, 'harness.html')) },
    '/harness.js': { type: 'text/javascript; charset=utf-8', body: bundle.outputFiles[0].text },
  };

  // ── Relay on a random high port ──
  let relay = null;
  for (let i = 0; i < 10 && !relay; i++) {
    const port = 40000 + Math.floor(Math.random() * 10000);
    relay = await startRelay({ port, files }).catch(() => null);
  }
  if (!relay) throw new Error('could not bind a relay port');
  const base = `http://127.0.0.1:${relay.port}/harness.html`;
  console.log(`relay on :${relay.port}`);

  const browser = await chromium.launch({
    headless: !headed,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      // Plain host candidates on localhost (no mDNS names to resolve in a container).
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  });
  // A second browser without --use-fake-ui-for-media-stream: getUserMedia fails for real.
  const browser2 = await chromium.launch({ headless: !headed, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  console.log(`chromium ${browser.version()}`);
  const pages = new Map();
  const errors = [];

  async function open(id, query = '', b = browser) {
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${id}: ${e.message}`));
    await page.goto(`${base}?id=${id}${query}`);
    pages.set(id, page);
    return page;
  }
  const P = (id) => pages.get(id);
  const dbg = (id) => P(id).evaluate(() => window.__voiceDebug());
  const peerDbg = async (id, peer) => (await dbg(id)).peers[peer];

  async function waitFor(desc, fn, timeoutMs = 20000) {
    const t0 = Date.now();
    let last;
    while (Date.now() - t0 < timeoutMs) {
      last = await fn().catch((e) => ({ ok: false, why: String(e) }));
      if (last === true || last?.ok) return { ok: true, ms: Date.now() - t0 };
      await sleep(200);
    }
    return { ok: false, ms: Date.now() - t0, why: last?.why ?? JSON.stringify(last).slice(0, 300) };
  }

  /** Every listed page holds a connected PC + open data channel + remote stream for each other listed id. */
  const meshUp = (ids) => async () => {
    for (const id of ids) {
      const d = await dbg(id);
      for (const other of ids) {
        if (other === id) continue;
        const p = d.peers[other];
        if (!p || p.connectionState !== 'connected' || !p.dcOpen || !p.hasStream) {
          return { ok: false, why: `${id}->${other}: ${p ? `${p.connectionState}/${p.signalingState} dc:${p.dcOpen} stream:${p.hasStream}` : 'missing'}` };
        }
      }
      if (Object.keys(d.peers).length !== ids.length - 1) return { ok: false, why: `${id} has ${Object.keys(d.peers).join(',')}` };
    }
    return true;
  };

  /** Max level / heard per peer and max self level, sampled in-page for `ms`. */
  const sampleMax = (id, ms) => P(id).evaluate(async (ms) => {
    const out = { self: 0, peers: {} };
    const end = performance.now() + ms;
    while (performance.now() < end) {
      const d = window.__voiceDebug();
      out.self = Math.max(out.self, d.self.level);
      for (const [pid, p] of Object.entries(d.peers)) {
        const m = (out.peers[pid] ??= { level: 0, heard: 0, levelDb: -120, heardDb: -120 });
        m.level = Math.max(m.level, p.level);
        m.heard = Math.max(m.heard, p.heard);
        m.levelDb = Math.max(m.levelDb, p.levelDb);
        m.heardDb = Math.max(m.heardDb, p.heardDb);
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    return out;
  }, ms);

  const at = (d) => ({ x: 0, y: 1.6, z: -d });
  const LISTENER = { x: 0, y: 1.6, z: 0 };
  const scene = (id, role, speakers, aidActive = false) => P(id).evaluate((u) => window.__h.setScene(u), {
    selfRole: role, listenerPos: LISTENER, listenerYaw: 0, aidActive,
    speakers: speakers.map(([sid, d, whispering = false]) => ({ id: sid, pos: at(d), whispering })),
  });
  const lobby = (id) => scene(id, 'lobby', []);

  try {
    // ── 1. Three pages connect into a full mesh ──
    for (const id of [A, B, C]) await open(id);
    let w = await waitFor('mesh', meshUp([A, B, C]));
    check('3 pages: every RTCPeerConnection reaches connected (data channel open, remote stream attached)', w.ok, w.ok ? `${w.ms} ms` : w.why);
    for (const id of [A, B, C]) {
      const d = await dbg(id);
      check(`${id}: mic ok, AudioContext running`, d.micOk === true && d.ctxState === 'running', `micOk=${d.micOk} ctx=${d.ctxState}`);
      const offerers = Object.entries(d.peers).filter(([, p]) => p.offersSent > 0).map(([pid]) => pid);
      const expected = Object.keys(d.peers).filter((pid) => id < pid);
      check(`${id}: offered only to higher ids`, JSON.stringify(offerers.sort()) === JSON.stringify(expected.sort()), `offered to [${offerers}]`);
    }

    // ── 2. Audio levels arrive (lobby: everyone at full volume) ──
    const lv = {};
    await Promise.all([A, B, C].map(async (id) => { lv[id] = await sampleMax(id, 3000); }));
    for (const id of [A, B, C]) {
      check(`${id}: own mic meter moves`, lv[id].self > 0.1, `max ${fmt(lv[id].self)}`);
      for (const other of [A, B, C].filter((x) => x !== id)) {
        const m = lv[id].peers[other];
        check(`${id} receives ${other}'s audio`, m && m.level > 0.1 && m.heard > 0.1, m ? `level ${fmt(m.level)} heard ${fmt(m.heard)}` : 'no peer');
      }
      const d = await dbg(id);
      const allFull = Object.values(d.peers).every((p) => p.gain === 1 && p.lowpassHz === 20000 && near(p.gainValue, 1, 0.01));
      check(`${id}: lobby = everyone at full volume, full band`, allFull);
    }

    // ── 3. Grandma's filter (A is Grandma, B speaks at 1 / 4 / 8 / 12 m) ──
    await scene(B, 'cousin', [[A, 5], [C, 5]]);
    await scene(C, 'cousin', [[A, 5], [B, 5]]);
    // `drop` = how many dB quieter the peer's signal is after her filter + gain,
    // measured on the real audio (peak RMS of the received vs. the filtered signal).
    const grandmaCases = [
      { d: 1, band: 'clear', gain: 1, hz: 20000, drop: [-1, 1] },
      { d: 4, band: 'muffled', gain: Math.pow(10, -6 / 20), hz: 8000 * Math.pow(0.1, 0.5), drop: [5, 30] },
      { d: 8, band: 'mumble', gain: 0.18, hz: 300, drop: [14, 60] },
      { d: 12, band: 'silent', gain: 0, hz: 300, drop: [50, 200] },
    ];
    for (const c of grandmaCases) {
      await scene(A, 'grandma', [[B, c.d], [C, 20]]);
      await sleep(450); // > 10 smoothing time constants
      const p = await peerDbg(A, B);
      const ok = p.band === c.band && near(p.gain, c.gain, 0.01) && near(p.lowpassHz, c.hz, c.hz * 0.01)
        && near(p.gainValue, c.gain, 0.02) && (c.gain === 0 || near(p.lowpassValue, c.hz, c.hz * 0.03));
      check(`Grandma hears B at ${c.d} m: ${c.band}, gain ${fmt(c.gain)}, low-pass ${fmt(c.hz)} Hz`, ok,
        `band ${p.band} gain ${fmt(p.gain)} (param ${fmt(p.gainValue)}) lp ${fmt(p.lowpassHz)} (param ${fmt(p.lowpassValue)})`);
      const s = (await sampleMax(A, 1500)).peers[B];
      const drop = s.levelDb - s.heardDb;
      const what = c.gain === 0 ? 'is silent' : c.gain === 1 ? 'passes unchanged' : `is ${c.drop[0]}+ dB quieter`;
      check(`  …and the real signal after her filter ${what} at ${c.d} m`, s.level > 0.1 && drop >= c.drop[0] && drop <= c.drop[1] && (c.gain > 0 || s.heardDb < -70),
        `received ${fmt(s.levelDb)} dBFS, after filter ${fmt(s.heardDb)} dBFS (−${fmt(drop)} dB)`);
    }
    await scene(A, 'grandma', [[B, 4], [C, 20]], true);
    await sleep(300);
    let p = await peerDbg(A, B);
    check('Grandma with the hearing aid hears B clearly at 4 m', p.band === 'clear' && p.gain === 1, `band ${p.band} gain ${fmt(p.gain)}`);
    await scene(A, 'grandma', [[C, 20]]);
    await sleep(100);
    p = await peerDbg(A, B);
    check('In a match, a peer with no known position is silent', p.gain === 0, `gain ${fmt(p.gain)}`);

    // ── 4. A whispering speaker at 3 m is silent to everyone ──
    await scene(A, 'grandma', [[B, 3, true], [C, 6]]);
    await scene(C, 'cousin', [[B, 3, true], [A, 6]]);
    await sleep(450);
    let pa = await peerDbg(A, B), pc = await peerDbg(C, B);
    check('Whispering B at 3 m: silent to Grandma (A)', pa.gain === 0 && pa.gainValue < 0.01, `gain ${fmt(pa.gain)} param ${fmt(pa.gainValue)}`);
    check('Whispering B at 3 m: silent to cousin C', pc.gain === 0 && pc.gainValue < 0.01, `gain ${fmt(pc.gain)} param ${fmt(pc.gainValue)}`);
    const sa = (await sampleMax(A, 1200)).peers[B], sc = (await sampleMax(C, 1200)).peers[B];
    check('  …nothing gets through either graph', sa.heardDb < -70 && sc.heardDb < -70 && sa.level > 0.1 && sc.level > 0.1,
      `received ${fmt(sa.levelDb)} / ${fmt(sc.levelDb)} dBFS, after the filters ${fmt(sa.heardDb)} / ${fmt(sc.heardDb)} dBFS`);
    await scene(A, 'grandma', [[B, 1, true], [C, 6]]);
    await scene(C, 'cousin', [[B, 1, true], [A, 6]]);
    await sleep(300);
    pa = await peerDbg(A, B); pc = await peerDbg(C, B);
    check('Whispering B at 1 m: heard by Grandma and by C', pa.gain === 1 && pc.gain === 1, `A ${fmt(pa.gain)} C ${fmt(pc.gain)}`);
    await scene(A, 'grandma', [[B, 3], [C, 6]]);
    await scene(C, 'cousin', [[B, 3], [A, 6]]);
    await sleep(300);
    pa = await peerDbg(A, B); pc = await peerDbg(C, B);
    check('Talking (not whispering) B at 3 m: muffled for Grandma, 2/3 volume for C', pa.band === 'muffled' && pa.gain > 0.5 && near(pc.gain, 2 / 3, 0.01), `A ${pa.band} ${fmt(pa.gain)}, C ${fmt(pc.gain)}`);

    // Whisper via the speaker's own data channel (before the snapshot says so).
    await P(B).evaluate(() => window.__h.setWhisper(true));
    w = await waitFor('dc whisper', async () => {
      const [x, y] = [await peerDbg(A, B), await peerDbg(C, B)];
      return x.remoteWhisper && y.remoteWhisper && x.gain === 0 && y.gain === 0 ? true : { why: `A ${x.remoteWhisper}/${x.gain} C ${y.remoteWhisper}/${y.gain}` };
    }, 2000);
    check('B presses Whisper: A and C silence B at once over the data channel', w.ok, w.ok ? `${w.ms} ms` : w.why);
    await P(B).evaluate(() => window.__h.setWhisper(false));
    w = await waitFor('dc whisper off', async () => {
      const [x, y] = [await peerDbg(A, B), await peerDbg(C, B)];
      return !x.remoteWhisper && x.gain > 0 && y.gain > 0 ? true : { why: `A ${x.gain} C ${y.gain}` };
    }, 2000);
    check('B releases Whisper: audible again', w.ok, w.ok ? `${w.ms} ms` : w.why);

    // ── 5. Cousin range ──
    for (const [d, g] of [[1, 1], [10, 0.2], [13.5, (2 / 13.5) * 0.5], [16, 0]]) {
      await scene(C, 'cousin', [[B, d], [A, 30]]);
      await sleep(350);
      pc = await peerDbg(C, B);
      check(`Cousin C hears B at ${d} m with gain ${fmt(g)}`, near(pc.gain, g, 0.005) && near(pc.gainValue, g, 0.02), `gain ${fmt(pc.gain)} param ${fmt(pc.gainValue)}`);
    }
    pc = await peerDbg(C, A);
    check('Cousin C: A at 30 m (beyond VOICE.cousinRange) is silent', pc.gain === 0, `gain ${fmt(pc.gain)}`);

    // Direction: B 3 m to C's east (+X). Facing north (yaw 0) it is to the right;
    // turned to face west (yaw +90°) it is behind.
    const east = { x: 3, y: 1.6, z: 0 };
    for (const [yaw, want, label] of [[0, { x: 1, z: 0 }, 'to the right of'], [Math.PI / 2, { x: 0, z: 1 }, 'behind']]) {
      await P(C).evaluate((u) => window.__h.setScene(u), {
        selfRole: 'cousin', listenerPos: LISTENER, listenerYaw: yaw, aidActive: false, speakers: [{ id: B, pos: east, whispering: false }],
      });
      await sleep(100);
      pc = await peerDbg(C, B);
      check(`HRTF panner places B ${label} C (yaw ${fmt(yaw)})`, near(pc.pan.x, want.x, 0.01) && near(pc.pan.z, want.z, 0.01), `pan ${fmt(pc.pan.x)}, ${fmt(pc.pan.y)}, ${fmt(pc.pan.z)}`);
    }

    // ── 6. Local mute ──
    for (const id of [A, B, C]) await lobby(id);
    await P(A).evaluate((b) => window.__h.setMuted(b, true), B);
    await sleep(350);
    p = await peerDbg(A, B);
    check('A mutes B: gain 0', p.gain === 0 && p.gainValue < 0.01 && p.muted, `gain ${fmt(p.gain)} param ${fmt(p.gainValue)}`);
    await P(A).evaluate((b) => window.__h.setMuted(b, false), B);
    await sleep(350);
    p = await peerDbg(A, B);
    check('A unmutes B: back to full volume', p.gain === 1 && p.gainValue > 0.98, `gain ${fmt(p.gain)} param ${fmt(p.gainValue)}`);

    // ── 7. Push-to-talk ──
    await P(B).evaluate(() => window.__h.setPushToTalk(true));
    await sleep(1000); // gate release + jitter buffer + meter release
    let bself = (await dbg(B)).self;
    let sb = (await sampleMax(A, 1500)).peers[B];
    check('B in push-to-talk, key up: B sends nothing', !bself.transmitting && bself.gateGain < 0.001 && sb.level < 0.03, `B transmitting ${bself.transmitting} gate ${fmt(bself.gateGain)}, A gets ${fmt(sb.level)}`);
    await P(B).evaluate(() => window.__h.setTalkKey(true));
    await sleep(300);
    sb = (await sampleMax(A, 2000)).peers[B];
    bself = (await dbg(B)).self;
    check('B holds the talk key: A hears B', bself.transmitting && sb.level > 0.1, `A gets ${fmt(sb.level)}`);
    await P(B).evaluate(() => { window.__h.setTalkKey(false); window.__h.setPushToTalk(false); });

    // ── 8. Late joiner without a mic, forced glare ──
    // D runs in a second browser without the fake-media UI flag, so getUserMedia
    // really fails, and with the autoplay policy simulated (AudioContext suspended
    // until a gesture). D has the lowest id, so it should offer to everyone; A/B/C
    // (polite) offer themselves after 4 s of silence. The relay holds those offers
    // until D's own offers go out, so every pair collides.
    for (const id of [A, B, C]) relay.glare(id, D);
    await open(D, '&autoplay=block&delay=5500', browser2);
    w = await waitFor('D started', async () => (await dbg(D)).started, 15000);
    const d0 = await dbg(D);
    check('D (no mic): start resolves micOk=false', d0.micOk === false && (await P(D).evaluate(() => window.__h.micOk())) === false, `micOk=${d0.micOk}`);
    await sleep(500);
    const ctxBefore = (await dbg(D)).ctxState;
    await P(D).mouse.click(5, 5);
    w = await waitFor('D ctx running', async () => (await dbg(D)).ctxState === 'running', 5000);
    check('D: AudioContext suspended by autoplay, resumes on the next user gesture', ctxBefore === 'suspended' && w.ok, `before click: ${ctxBefore}, after: ${(await dbg(D)).ctxState}`);
    w = await waitFor('mesh 4', meshUp([A, B, C, D]), 25000);
    check('4 pages after glare: every pair connected', w.ok, w.ok ? `${w.ms} ms` : w.why);
    const dD = await dbg(D);
    const ignored = [A, B, C].map((x) => dD.peers[x]?.offersIgnored ?? 0);
    const rolled = [];
    for (const x of [A, B, C]) rolled.push((await peerDbg(x, D))?.rollbacks ?? 0);
    check('  …glare happened and resolved (D ignored the colliding offers, A/B/C rolled back)', ignored.every((n) => n >= 1) && rolled.every((n) => n >= 1), `D ignored [${ignored}], A/B/C rollbacks [${rolled}]`);
    const sd = await sampleMax(D, 2500);
    check('D without a mic still receives A, B and C', [A, B, C].every((x) => sd.peers[x]?.level > 0.1), [A, B, C].map((x) => fmt(sd.peers[x]?.level ?? 0)).join(' / '));
    check('D sends silence', sd.self === 0 && !(await dbg(D)).self.transmitting);

    // ── 9. B restarts without the room noticing (new DTLS identity, same id) ──
    relay.quiet(B);
    await P(B).reload();
    w = await waitFor('mesh after silent rejoin', meshUp([A, B, C, D]), 30000);
    const rebuilt = [];
    for (const x of [A, C, D]) rebuilt.push((await peerDbg(x, B))?.rebuilds ?? 0);
    check('B reloads silently: A, C, D rebuild their connection to B and the mesh recovers', w.ok && rebuilt.every((n) => n >= 1), w.ok ? `${w.ms} ms, rebuilds [${rebuilt}]` : w.why);
    const sB = await sampleMax(A, 2500);
    check('  …and A hears the new B', sB.peers[B]?.level > 0.1, fmt(sB.peers[B]?.level ?? 0));

    // ── 10. stop() tears everything down; others drop the peer ──
    await P(C).evaluate(() => window.__h.stop());
    const dC = await dbg(C);
    check('C stop(): no peers, context closed, not started', !dC.started && Object.keys(dC.peers).length === 0 && dC.ctxState === 'none', `ctx ${dC.ctxState}`);
    w = await waitFor('C dropped', async () => {
      for (const x of [A, B, D]) if ((await dbg(x)).peers[C]) return { why: `${x} still has C` };
      return true;
    }, 5000);
    check('setPeers without C closes everyone\'s connection to C', w.ok, w.ok ? `${w.ms} ms` : w.why);
    w = await waitFor('mesh 3', meshUp([A, B, D]), 5000);
    check('A, B, D still connected', w.ok, w.why ?? '');

    const shot = path.join(os.tmpdir(), 'inheritance-voice-harness.png');
    try { await P(A).screenshot({ path: shot }); console.log(`screenshot of A's debug view: ${shot}`); } catch { /* optional */ }
    check('no page errors', errors.length === 0, errors.join(' | '));

    if (process.argv.includes('--keep')) await sleep(60000);
  } finally {
    await browser.close().catch(() => {});
    await browser2.close().catch(() => {});
    await relay.close().catch(() => {});
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
  }
  return failed.length === 0;
}

main().then((ok) => process.exit(ok ? 0 : 1), (err) => { console.error(err); process.exit(1); });
