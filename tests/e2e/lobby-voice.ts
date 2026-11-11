// Smoke test: real client + real server, 3 browser pages in one lobby. Asserts the voice mesh
// connects through the game server, everyone hears both others, and no page throws.
// Run: npx tsx tests/e2e/lobby-voice.ts (E2E_CLIENT_DIR=<built client> reuses a build).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { startServer } from '../../server/index.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const reuse = process.env.E2E_CLIENT_DIR && fs.existsSync(path.join(process.env.E2E_CLIENT_DIR, 'index.html')) ? process.env.E2E_CLIENT_DIR : null;
const out = reuse ?? fs.mkdtempSync(path.join(os.tmpdir(), 'inh-client-'));
if (!reuse) await build({ configFile: path.resolve('vite.config.ts'), logLevel: 'warn', build: { outDir: out, emptyOutDir: true, sourcemap: false } });
const failures: string[] = [];
const port = 40000 + Math.floor(Math.random() * 9999);
const srv = await startServer({ port, staticDir: out, quiet: true });
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
const errors: string[] = [];
try {
  const p1 = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  p1.on('pageerror', (e: Error) => errors.push('p1 ' + e.message));
  await p1.goto(`http://127.0.0.1:${port}/?name=Ann`);
  await p1.getByText('Create a new room').click();
  await p1.waitForFunction(() => new URLSearchParams(location.search).get('room'), null, { timeout: 10000 });
  const room = await p1.evaluate(() => new URLSearchParams(location.search).get('room'));
  console.log('room', room);
  const pages = [p1];
  for (const n of ['Bea', 'Cal']) {
    const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    p.on('pageerror', (e: Error) => errors.push(n + ' ' + e.message));
    await p.goto(`http://127.0.0.1:${port}/?name=${n}&room=${room}`);
    pages.push(p);
  }
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const ds = await Promise.all(pages.map((p) => p.evaluate(() => (window as any).__voiceDebug?.())));
    ok = ds.every((d: any) => d && Object.keys(d.peers).length === 2 && Object.values(d.peers).every((x: any) => x.connectionState === 'connected' && x.dcOpen));
    if (ok || i % 8 === 0) console.log(i, ds.map((d: any) => d ? `${d.selfId} mic:${d.micOk} ${Object.entries(d.peers).map(([k, v]: any) => `${k}:${v.connectionState}`).join(' ')}` : 'none').join(' | '));
  }
  console.log('mesh connected via game server:', ok);
  if (!ok) failures.push('the voice mesh did not connect through the game server');
  await new Promise((r) => setTimeout(r, 2500));
  for (const p of pages) {
    const m: any = await p.evaluate(async () => {
      const o: any = { self: 0, peers: {} };
      for (let i = 0; i < 80; i++) {
        const d = (window as any).__voiceDebug();
        o.id = d.selfId; o.role = d.role; o.self = Math.max(o.self, d.self.level);
        for (const [k, v] of Object.entries(d.peers) as any) o.peers[k] = Math.max(o.peers[k] ?? 0, v.level);
        await new Promise((r) => setTimeout(r, 25));
      }
      return o;
    });
    console.log(m.id, 'role', m.role, 'self max', m.self.toFixed(2), JSON.stringify(m.peers));
    const heard = Object.values(m.peers as Record<string, number>).filter((v) => v > 0.1).length;
    if (m.self <= 0.1) failures.push(`${m.id}: own mic meter did not move`);
    if (heard < 2) failures.push(`${m.id}: hears ${heard} of the other 2 players`);
  }
  await p1.screenshot({ path: path.join(os.tmpdir(), 'inheritance-voice-lobby.png') });
} finally {
  await browser.close();
  await srv.close();
  if (!reuse) fs.rmSync(out, { recursive: true, force: true });
}
for (const e of errors) failures.push(`page error: ${e}`);
if (failures.length) {
  for (const f of failures) console.log(`FAIL  ${f}`);
  process.exitCode = 1;
} else {
  console.log('PASS  3 players in one lobby: voice mesh up, everyone hears both others, no page errors');
}
