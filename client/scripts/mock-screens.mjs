// Screenshots of the client against the offline dev mock (no server needed).
// Usage: npx vite --port 4xxxx &  then  node client/scripts/mock-screens.mjs http://localhost:4xxxx [filter]
// Writes tests/e2e/screenshots/mock-*.png
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../tests/e2e/screenshots');
mkdirSync(out, { recursive: true });
const base = process.argv[2] ?? 'http://localhost:5173';
const filter = process.argv[3] ?? '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const setView = (page, yaw, pitch = 0) => page.evaluate(([y, p]) => { const i = window.__inh.input; i.yaw = y; i.pitch = p; }, [yaw, pitch]);
const waitPhase = (page, phase, timeout = 20000) => page.waitForFunction((p) => window.__inh?.state?.phase === p, phase, { timeout });

const scenes = [
  { name: 'title', url: '/', run: async (p) => { await sleep(1500); } },
  { name: 'lobby', url: '/?mock=cousin&phase=lobby', run: async (p) => { await sleep(1500); } },
  { name: 'cousin-reveal', url: '/?mock=cousin&phase=roles', run: async (p) => { await sleep(2500); } },
  {
    name: 'cousin-visit', url: '/?mock=cousin', run: async (p) => {
      await waitPhase(p, 'visit'); await sleep(9500);
      await setView(p, Math.PI * 0.35, -0.15); await sleep(800);
    },
  },
  {
    name: 'cousin-closeup', url: '/?mock=cousin&lineup=1', run: async (p) => {
      await waitPhase(p, 'visit'); await sleep(1500);
      await setView(p, 0, -0.12); await sleep(1500);
    },
  },
  {
    name: 'cousin-wheel', url: '/?mock=cousin', run: async (p) => {
      await waitPhase(p, 'visit'); await sleep(2500);
      await p.keyboard.down('KeyQ'); await sleep(300);
      await p.evaluate(() => { window.__inh.input.cursor.x = 120; window.__inh.input.cursor.y = -40; }); await sleep(300);
    },
  },
  {
    name: 'grandma-visit', url: '/?mock=grandma', run: async (p) => {
      await waitPhase(p, 'visit'); await sleep(12000);
      await setView(p, -Math.PI / 2 - 0.15, 0.05); await sleep(1000);
    },
  },
  {
    name: 'grandma-gallery', url: '/?mock=grandma', run: async (p) => {
      await waitPhase(p, 'visit'); await sleep(4000);
      await setView(p, 0.35, 0.25); await sleep(1000);
    },
  },
  {
    name: 'grandma-parchment', url: '/?mock=grandma', run: async (p) => {
      await waitPhase(p, 'visit'); await sleep(5000);
      await setView(p, -Math.PI / 2, 0); await p.keyboard.press('Tab'); await sleep(1200);
      await p.click('.fp-row:nth-child(2) .fp-btn:last-of-type'); await sleep(200);
      await p.click('.fp-row:nth-child(2) .fp-btn:last-of-type'); await sleep(900);
    },
  },
  {
    name: 'grandma-specsoff', url: '/?mock=grandma&specsoff=1', run: async (p) => {
      await waitPhase(p, 'visit'); await sleep(4000);
      await setView(p, -Math.PI / 2, 0); await sleep(1000);
    },
  },
  {
    name: 'grandma-specs', url: '/?mock=grandma', run: async (p) => {
      await waitPhase(p, 'visit'); await sleep(4000);
      await setView(p, -Math.PI / 2, 0); await sleep(500);
      await p.keyboard.press('KeyF'); await sleep(1500);
    },
  },
  {
    name: 'grandma-storm', url: '/?mock=grandma&storm=1', run: async (p) => {
      await waitPhase(p, 'visit'); await sleep(3000);
      await setView(p, -Math.PI / 2, 0); await sleep(500);
    },
  },
  {
    name: 'grandma-lightning', url: '/?mock=grandma&storm=1&flash=1', run: async (p) => {
      await waitPhase(p, 'visit'); await sleep(3000);
      await setView(p, -Math.PI / 2, 0); await sleep(800);
    },
  },
  {
    name: 'cousin-storm', url: '/?mock=cousin&storm=1', run: async (p) => {
      await waitPhase(p, 'visit'); await sleep(3000);
      await setView(p, Math.PI * 0.35, -0.15); await sleep(500);
    },
  },
  { name: 'intermission', url: '/?mock=cousin&phase=intermission', run: async (p) => { await waitPhase(p, 'intermission'); await sleep(4000); } },
  { name: 'reading', url: '/?mock=cousin&phase=reading', run: async (p) => { await sleep(15000); } },
  {
    name: 'vote', url: '/?mock=cousin&phase=vote', run: async (p) => {
      await sleep(2000); await p.click('.vote-btn:nth-child(3)'); await sleep(400);
    },
  },
  { name: 'results', url: '/?mock=grandma&phase=results', run: async (p) => { await sleep(2500); } },
];

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader'] });
let failures = 0;
for (const s of scenes) {
  if (filter && !s.name.includes(filter)) continue;
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const t0 = Date.now();
  try {
    await page.goto(base + s.url);
    await s.run(page);
    await page.screenshot({ path: `${out}/mock-${s.name}.png` });
    console.log(`ok   ${s.name} (${Date.now() - t0} ms)${errors.length ? ' errors: ' + errors.join(' | ') : ''}`);
    if (errors.length) failures++;
  } catch (e) {
    failures++;
    console.log(`FAIL ${s.name}: ${e.message.split('\n')[0]} ${errors.join(' | ')}`);
    await page.screenshot({ path: `${out}/mock-${s.name}-FAILED.png` }).catch(() => {});
  }
  await page.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
