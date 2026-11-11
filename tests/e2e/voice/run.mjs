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
  /** What `id` sends `to`: its copy of id's voice, shaped to what `to` may hear. */
  const sendDbg = async (id, to) => (await dbg(id)).sends[to];

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
  /** In a match A is Grandma and everyone else a cousin; `grandmaAid` = others see her hearing aid on. */
  const roleOf = (sid) => (sid === A ? 'grandma' : 'cousin');
  const scene = (id, role, speakers, aidActive = false, grandmaAid = false) => P(id).evaluate((u) => window.__h.setScene(u), {
    selfRole: role, listenerPos: LISTENER, listenerYaw: 0, aidActive,
    speakers: speakers.map(([sid, d, whispering = false]) => ({ id: sid, pos: at(d), whispering, role: roleOf(sid), aidActive: sid === A && grandmaAid })),
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
      const allFull = Object.values(d.peers).every((p) => p.gain === 1 && p.lowpassHz === 20000 && near(p.gainValue, 1, 0.01))
        && Object.values(d.sends).every((x) => x.gain === 1 && x.lowpassHz === 20000 && near(x.gainValue, 1, 0.01));
      check(`${id}: lobby = everyone at full volume, full band, both ways`, allFull);
    }

    // ── 3. Grandma's hearing, applied by the speaker (A is Grandma, B speaks at 1 / 4 / 8 / 12 m) ──
    // B sends A only what she may hear (review S2: her client never holds more).
    // C, a cousin 5 m from B, gets B's voice whole: what C receives is the
    // yardstick for how much quieter it reaches A.
    await scene(A, 'grandma', [[B, 5], [C, 20]]);
    await scene(C, 'cousin', [[A, 20], [B, 5]]);
    const grandmaCases = [
      { d: 1, band: 'clear', gain: 1, hz: 20000, drop: [-2, 2] },
      { d: 4, band: 'muffled', gain: Math.pow(10, -6 / 20), hz: 8000 * Math.pow(0.1, 0.5), drop: [5, 30] },
      { d: 8, band: 'mumble', gain: 0.18, hz: 300, drop: [14, 60] },
      { d: 12, band: 'silent', gain: 0, hz: 300, drop: [50, 200] },
    ];
    for (const c of grandmaCases) {
      await scene(B, 'cousin', [[A, c.d], [C, 5]]);
      await sleep(450); // > 10 smoothing time constants
      const x = await sendDbg(B, A);
      const ok = x.band === c.band && near(x.gain, c.gain, 0.01) && near(x.lowpassHz, c.hz, c.hz * 0.01)
        && near(x.gainValue, c.gain, 0.02) && (c.gain === 0 || near(x.lowpassValue, c.hz, c.hz * 0.03));
      check(`B sends Grandma at ${c.d} m only what she hears: ${c.band}, gain ${fmt(c.gain)}, low-pass ${fmt(c.hz)} Hz`, ok,
        `band ${x.band} gain ${fmt(x.gain)} (param ${fmt(x.gainValue)}) lp ${fmt(x.lowpassHz)} (param ${fmt(x.lowpassValue)})`);
      const [sa, sc] = await Promise.all([sampleMax(A, 1500), sampleMax(C, 1500)]);
      const ra = sa.peers[B], rc = sc.peers[B];
      const drop = rc.levelDb - ra.levelDb;
      const what = c.gain === 0 ? 'nothing' : c.gain === 1 ? 'all of it' : `${c.drop[0]}+ dB less`;
      check(`  …and that is all her client receives at ${c.d} m: ${what}`, rc.level > 0.1 && drop >= c.drop[0] && drop <= c.drop[1] && (c.gain > 0 || ra.levelDb < -70),
        `C receives ${fmt(rc.levelDb)} dBFS, A receives ${fmt(ra.levelDb)} dBFS (−${fmt(drop)} dB)`);
    }
    let p = await peerDbg(A, B);
    check('Grandma plays what she is sent as it is (no second filter)', p.gain === 1 && p.lowpassHz === 20000 && near(p.gainValue, 1, 0.02), `gain ${fmt(p.gain)} lp ${fmt(p.lowpassHz)}`);
    await scene(B, 'cousin', [[A, 4], [C, 5]], false, true);
    await sleep(300);
    let x = await sendDbg(B, A);
    check('Grandma with the hearing aid: B sends her a clear voice at 4 m', x.band === 'clear' && x.gain === 1, `band ${x.band} gain ${fmt(x.gain)}`);
    await scene(B, 'cousin', [[C, 5]]);
    await sleep(100);
    x = await sendDbg(B, A);
    check('In a match, B sends nothing to someone it cannot place', x.gain === 0, `gain ${fmt(x.gain)}`);
    await scene(A, 'grandma', []); // she perceives nobody: C is behind her, out of sight and silent
    await scene(C, 'cousin', [[A, 5], [B, 5]]);
    await sleep(100);
    x = await sendDbg(A, C);
    check('…except Grandma, who sends cousins she cannot see her voice (their clients fade it)', x.gain === 1, `gain ${fmt(x.gain)}`);
    await scene(A, 'grandma', [[C, 20]]);
    await sleep(100);
    x = await sendDbg(A, C);
    check('…but not to a cousin she knows is out of earshot', x.gain === 0, `gain ${fmt(x.gain)}`);

    // ── 4. A whispering speaker is cut off past VOICE.whisperRange, for everyone ──
    await scene(A, 'grandma', [[B, 3], [C, 6]]);
    await P(B).evaluate(() => window.__h.setWhisper(true));
    await scene(B, 'cousin', [[A, 3], [C, 3]]);
    await scene(C, 'cousin', [[B, 3, true], [A, 6]]);
    await sleep(450);
    let xa = await sendDbg(B, A), xc = await sendDbg(B, C);
    check('Whispering B at 3 m sends Grandma (A) nothing', xa.gain === 0 && xa.gainValue < 0.01, `gain ${fmt(xa.gain)} param ${fmt(xa.gainValue)}`);
    check('Whispering B at 3 m sends cousin C nothing', xc.gain === 0 && xc.gainValue < 0.01, `gain ${fmt(xc.gain)} param ${fmt(xc.gainValue)}`);
    const sa = (await sampleMax(A, 1200)).peers[B], sc = (await sampleMax(C, 1200)).peers[B];
    check('  …and nothing reaches either client', sa.levelDb < -70 && sc.levelDb < -70,
      `A receives ${fmt(sa.levelDb)} dBFS, C receives ${fmt(sc.levelDb)} dBFS`);
    await scene(B, 'cousin', [[A, 1], [C, 1]]);
    await scene(C, 'cousin', [[B, 1, true], [A, 6]]);
    await sleep(300);
    xa = await sendDbg(B, A); xc = await sendDbg(B, C);
    let pc = await peerDbg(C, B);
    check('Whispering B at 1 m: sent to Grandma and to C, and C hears it', xa.gain === 1 && xc.gain === 1 && pc.gain === 1, `A ${fmt(xa.gain)} C ${fmt(xc.gain)} (C plays ${fmt(pc.gain)})`);
    await P(B).evaluate(() => window.__h.setWhisper(false));
    await scene(B, 'cousin', [[A, 3], [C, 3]]);
    await scene(C, 'cousin', [[B, 3], [A, 6]]);
    await sleep(300);
    xa = await sendDbg(B, A); pc = await peerDbg(C, B);
    check('Talking (not whispering) B at 3 m: muffled for Grandma, 2/3 volume for C', xa.band === 'muffled' && xa.gain > 0.5 && near(pc.gain, 2 / 3, 0.01), `A ${xa.band} ${fmt(xa.gain)}, C ${fmt(pc.gain)}`);

    // Whisper takes effect at once: B stops sending, and C's client hears of it over the data channel.
    await P(B).evaluate(() => window.__h.setWhisper(true));
    w = await waitFor('whisper on', async () => {
      const [ya, yc, zc] = [await sendDbg(B, A), await sendDbg(B, C), await peerDbg(C, B)];
      return ya.gain === 0 && yc.gain === 0 && zc.remoteWhisper ? true : { why: `sends A ${ya.gain} C ${yc.gain}, C dc ${zc.remoteWhisper}` };
    }, 2000);
    check('B presses Whisper: B stops sending to A and C at once (C also learns it over the data channel)', w.ok, w.ok ? `${w.ms} ms` : w.why);
    await P(B).evaluate(() => window.__h.setWhisper(false));
    w = await waitFor('whisper off', async () => {
      const [ya, yc, zc] = [await sendDbg(B, A), await sendDbg(B, C), await peerDbg(C, B)];
      return ya.gain > 0 && yc.gain > 0 && !zc.remoteWhisper && zc.gain > 0 ? true : { why: `sends A ${ya.gain} C ${yc.gain}, C plays ${zc.gain}` };
    }, 2000);
    check('B releases Whisper: audible again', w.ok, w.ok ? `${w.ms} ms` : w.why);

    // ── 5. Cousin range ──
    for (const [d, g] of [[1, 1], [10, 0.2], [13.5, (2 / 13.5) * 0.5], [16, 0]]) {
      await scene(C, 'cousin', [[B, d], [A, 30]]);
      await sleep(350);
      pc = await peerDbg(C, B);
      check(`Cousin C hears B at ${d} m with gain ${fmt(g)}`, near(pc.gain, g, 0.005) && near(pc.gainValue, g, 0.02), `gain ${fmt(pc.gain)} param ${fmt(pc.gainValue)}`);
    }
    for (const [d, g] of [[10, 1], [16, 1], [17, 0]]) {
      await scene(B, 'cousin', [[C, d], [A, 30]]);
      await sleep(100);
      x = await sendDbg(B, C);
      check(`B sends cousin C at ${d} m ${g ? 'its voice (C fades it)' : 'nothing (out of earshot)'}`, x.gain === g, `gain ${fmt(x.gain)}`);
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
