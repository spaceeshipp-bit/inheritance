// Screenshots of the client against the offline dev mock (no server needed).
// Usage: npx vite --port 4xxxx &  then  node client/scripts/mock-screens.mjs http://localhost:4xxxx [filter]
// Writes tests/e2e/screenshots/mock-*.png (scenes marked size 800 also at 1280x800 as mock-*-800.png).
// Pages use the low graphics preset (?gfx=low): software WebGL here has no GPU. One page at a time.
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
const waitPhase = (page, phase, timeout = 30000) => page.waitForFunction((p) => window.__inh?.state?.phase === p, phase, { timeout });
const visible = (page, sel, timeout = 20000) => page.waitForSelector(sel, { state: 'visible', timeout });
const tap = async (page, key, ms = 90) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); };
/** Dismiss the first coaching tip (Q opens and closes the compliment wheel). */
const dismissNanaTip = async (page) => { await tap(page, 'KeyQ', 150); await sleep(300); };

const scenes = [
  { name: 'title', url: '/', sizes: [720, 800], run: async () => { await sleep(1500); } },
  {
    name: 'settings-title', url: '/', run: async (p) => {
      await sleep(1200); await p.click('.gear-btn'); await visible(p, '.settings-card'); await sleep(400);
    },
  },
  { name: 'lobby', url: '/?mock=cousin&phase=lobby', run: async () => { await sleep(1500); } },
  { name: 'cousin-reveal', url: '/?mock=cousin&phase=roles', sizes: [720, 800], run: async (p) => { await visible(p, '.phase-card.reveal'); await sleep(1200); } },
  { name: 'grandma-reveal', url: '/?mock=grandma&phase=roles', sizes: [720, 800], run: async (p) => { await visible(p, '.phase-card.reveal'); await sleep(1200); } },
  {
    name: 'cousin-visit', url: '/?mock=cousin', sizes: [720, 800], run: async (p) => {
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
    // A cousin right in front of you, Nana watching: ranked prompts in red, shove marker, the pinch tip.
    name: 'cousin-near', url: '/?mock=cousin&lineup=1&near=1', sizes: [720, 800], run: async (p) => {
      await waitPhase(p, 'visit'); await setView(p, 0, -0.12); await sleep(1500);
      await dismissNanaTip(p); await setView(p, 0, -0.12);
      await visible(p, '.coach'); await sleep(1200);
    },
  },
  {
    // F with someone in range: the push gesture and "SHOVED!".
    name: 'cousin-shove', url: '/?mock=cousin&lineup=1&near=1', run: async (p, shot) => {
      await waitPhase(p, 'visit'); await setView(p, 0, -0.12); await sleep(2000);
      await p.keyboard.down('KeyF'); await sleep(140); await p.keyboard.up('KeyF');
      await sleep(250); await shot('cousin-shove');
      await sleep(500);
    },
    final: false,
  },
  {
    // F at nobody: the push gesture and "whiff".
    name: 'cousin-whiff', url: '/?mock=cousin&lineup=1', run: async (p, shot) => {
      await waitPhase(p, 'visit'); await setView(p, Math.PI, -0.12); await sleep(2000);
      await p.keyboard.down('KeyF'); await sleep(140); await p.keyboard.up('KeyF');
      await sleep(200); await shot('cousin-whiff');
    },
    final: false,
  },
  {
    // Holding a stolen item: the plant prompt and the plant tip.
    name: 'cousin-plant', url: '/?mock=cousin&holding=1&lineup=1', run: async (p) => {
      await waitPhase(p, 'visit'); await setView(p, 0, -0.12); await sleep(1500);
      await dismissNanaTip(p); await setView(p, 0, -0.12);
      await p.waitForFunction(() => document.querySelector('.coach-text')?.textContent?.includes('plant'), null, { timeout: 15000 });
      await sleep(800);
    },
  },
  {
    // An heirloom smashes in front of you: dust, flying shards, CRASH!, a jolt, "Nana heard that!".
    name: 'cousin-smash', url: '/?mock=cousin&smash=1', run: async (p, shot) => {
      await waitPhase(p, 'visit'); await setView(p, 0.35, -0.1);
      await visible(p, '.float-text.crash', 20000); await sleep(150); await shot('cousin-smash');
      await sleep(900); await shot('cousin-smash-after');
    },
    final: false,
  },
  {
    // Nana off screen: the arrow sits on the real screen edge, clear of the panels, with her distance.
    name: 'cousin-arrow', url: '/?mock=cousin&lineup=1', run: async (p, shot) => {
      await waitPhase(p, 'visit'); await sleep(1500);
      await setView(p, Math.PI / 2 + 0.3, -0.1); await sleep(1200); await shot('cousin-arrow');
      await setView(p, -Math.PI * 0.85, -0.1); await sleep(1200); await shot('cousin-arrow-2');
    },
    final: false,
  },
  {
    // Your item was just taken (the mock's story steals it at 8 s): "Stolen!", without naming the thief (R20).
    name: 'cousin-stolen', url: '/?mock=cousin', run: async (p) => {
      await waitPhase(p, 'visit');
      await p.waitForFunction(() => document.querySelector('.item-status')?.textContent === 'Stolen!', null, { timeout: 20000 });
      await sleep(300);
    },
  },
  {
    // A cousin in the kitchen behind the wall, about 9 m from the camera: no name tag through the wall.
    name: 'cousin-walltag', url: '/?mock=cousin&wallbot=1', run: async (p) => {
      await waitPhase(p, 'visit'); await setView(p, -Math.PI / 2, -0.05); await sleep(2500);
      const r = await p.evaluate(() => {
        const s = window.__inh.state, cam = window.__inh.renderer.camera.position;
        const hidden = s.latest()?.chars.find((c) => c.pos.x > 10.5 && c.pos.x < 11.5 && Math.abs(c.pos.z - 4) < 0.5);
        const tags = [...document.querySelectorAll('.nametag')].filter((t) => t.style.display !== 'none').map((t) => t.textContent);
        return { hidden: hidden ? s.name(hidden.id) : null, d: hidden ? Math.hypot(hidden.pos.x - cam.x, hidden.pos.z - cam.z) : null, tags };
      });
      console.log(`     walltag: ${JSON.stringify(r)}`);
      if (!r.hidden || r.d > 12 || r.tags.some((t) => t.startsWith(r.hidden.replace(/ \(bot\)$/, '')))) throw new Error(`a tag shows through the wall: ${JSON.stringify(r)}`);
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
    // Escape in a match opens the settings.
    name: 'settings-match', url: '/?mock=cousin', sizes: [720, 800], run: async (p) => {
      await waitPhase(p, 'visit'); await sleep(2000);
      await p.keyboard.press('Escape'); await visible(p, '.settings-card'); await sleep(500);
    },
  },
  {
    name: 'grandma-visit', url: '/?mock=grandma', sizes: [720, 800], run: async (p) => {
      await waitPhase(p, 'visit'); await sleep(12000);
      await setView(p, -Math.PI / 2 - 0.15, 0.05); await sleep(1000);
    },
  },
  {
    // Aiming at a cousin: the target label and the aim icon on her will.
    name: 'grandma-aim', url: '/?mock=grandma&lineup=1', run: async (p) => {
      await waitPhase(p, 'visit'); await sleep(1500);
      // The lineup puts her at (-1.6, 3.6); the third cousin in the row stands about 3 m ahead.
      await setView(p, -0.21, -0.2); await sleep(1800);
    },
  },
  {
    // A cousin pressed right up against her (0.3 m): the body fades instead of filling her view (P13).
    name: 'grandma-crowd', url: '/?mock=grandma&lineup=1&near=0.3', run: async (p) => {
      await waitPhase(p, 'visit'); await sleep(1500);
      await setView(p, 0, -0.25); await sleep(1800);
    },
  },
  {
    name: 'grandma-gallery', url: '/?mock=grandma', run: async (p) => {
      await waitPhase(p, 'visit'); await sleep(4000);
      await setView(p, 0.35, 0.25); await sleep(1000);
    },
  },
  {
    // The full parchment: a drag stops at what she can still move (the rest is shaded) and says why.
    name: 'grandma-parchment', url: '/?mock=grandma', sizes: [720, 800], run: async (p, shot) => {
      await waitPhase(p, 'visit'); await sleep(5500);
      await setView(p, -Math.PI / 2, 0); await p.keyboard.press('Tab'); await visible(p, '.fp-sheet'); await sleep(800);
      await shot('grandma-parchment-open');
      const box = await p.locator('.fp-bar').nth(1).boundingBox();
      if (box) {
        await p.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
        await p.mouse.down();
        for (let i = 1; i <= 14; i++) { await p.mouse.move(box.x + box.width * 0.2 + i * 10, box.y + box.height / 2); await sleep(40); }
        await sleep(300); await shot('grandma-parchment-drag');
        await p.mouse.up();
      }
      await sleep(1500);
      await p.click('.fp-row:nth-child(3) .fp-btn:last-of-type'); await sleep(900);
    },
  },
  {
    // A crash behind her: an edge ping clear of her panels; later a faint marker where it happened.
    name: 'grandma-pings', url: '/?mock=grandma', run: async (p, shot) => {
      await waitPhase(p, 'visit'); await setView(p, Math.PI / 2, 0);
      await visible(p, '.ping', 20000); await sleep(1200); await shot('grandma-ping-edge');
      await setView(p, -0.66, -0.15); await sleep(800); await shot('grandma-ping-on');
      await sleep(7000); await shot('grandma-ping-faint');
    },
    final: false,
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
  { name: 'intermission', url: '/?mock=cousin&phase=intermission', sizes: [720, 800], run: async (p) => { await waitPhase(p, 'intermission'); await sleep(3000); } },
  { name: 'intermission-grandma', url: '/?mock=grandma&phase=intermission', run: async (p) => { await waitPhase(p, 'intermission'); await sleep(3000); } },
  {
    // The reading, step by step: lower shares, the pause, the top share and badges, then the moments.
    name: 'reading', url: '/?mock=cousin&phase=reading', sizes: [720, 800], run: async (p, shot) => {
      await visible(p, '.phase-card.reading');
      const t0 = Date.now();
      const at = async (s) => { const w = s * 1000 - (Date.now() - t0); if (w > 0) await sleep(w); };
      await at(3); await shot('reading-1');
      await at(9); await shot('reading-2');
      await at(12.4); await shot('reading-3');
      await at(15); await shot('reading-4');
      await at(19.2); await shot('reading-5');
    },
    final: false,
  },
  {
    name: 'reading-tie', url: '/?mock=grandma&phase=reading&tie=1', run: async (p) => {
      await visible(p, '.phase-card.reading'); await sleep(19000);
    },
  },
  {
    name: 'vote', url: '/?mock=cousin&phase=vote', sizes: [720, 800], run: async (p) => {
      await visible(p, '.vote-btn'); await sleep(800); await p.click('.vote-btn:nth-child(3)'); await sleep(400);
    },
  },
  { name: 'results', url: '/?mock=grandma&phase=results', sizes: [720, 800], run: async (p) => { await visible(p, '.results-table'); await sleep(1200); } },
  { name: 'results-tie', url: '/?mock=cousin&phase=results&tie=1', run: async (p) => { await visible(p, '.results-table'); await sleep(1200); } },
];

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader'] });
let failures = 0;
for (const s of scenes) {
  if (filter && !s.name.includes(filter)) continue;
  for (const h of s.sizes ?? [720]) {
    const suffix = h === 720 ? '' : `-${h}`;
    const page = await browser.newPage({ viewport: { width: 1280, height: h } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const t0 = Date.now();
    const shot = (name) => page.screenshot({ path: `${out}/mock-${name}${suffix}.png` });
    try {
      const url = base + s.url + (s.url.includes('?') ? '&' : '?') + 'gfx=low';
      await page.goto(url);
      // The boot splash (index.html) covers the page until main.ts has started.
      await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 60000 });
      await s.run(page, shot);
      if (s.final !== false) await shot(s.name);
      console.log(`ok   ${s.name}${suffix} (${Date.now() - t0} ms)${errors.length ? ' errors: ' + errors.join(' | ') : ''}`);
      if (errors.length) failures++;
    } catch (e) {
      failures++;
      console.log(`FAIL ${s.name}${suffix}: ${e.message.split('\n')[0]} ${errors.join(' | ')}`);
      await page.screenshot({ path: `${out}/mock-${s.name}${suffix}-FAILED.png` }).catch(() => {});
    }
    await page.close();
  }
}
await browser.close();
process.exit(failures ? 1 : 0);
