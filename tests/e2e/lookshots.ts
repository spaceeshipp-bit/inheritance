// Look-dev photographs: the dev-only /lookdev.html page (the game's real scene,
// posed) in each candidate art direction. For the owner's graphics review.
//
//   npx tsx tests/e2e/lookshots.ts [--map manor] [--shots family,hall] [--looks current,storybook,cel,gorey] [--size 1600x900]
//
// Shots land in tests/e2e/screenshots/looks/<map>-<shot>-<look>.png.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchBrowser, sleep } from './lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tests/e2e/screenshots/looks');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opt = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const map = opt('--map', 'manor');
  const shots = opt('--shots', 'family').split(',');
  const looks = opt('--looks', 'current,storybook,cel,gorey').split(',');
  const [w, h] = opt('--size', '1600x900').split('x').map(Number);
  // --baked: apply the map's baked lightmap (client/public/lightmaps/), as the game does.
  const baked = args.includes('--baked');
  fs.mkdirSync(OUT, { recursive: true });
  const vite = await createServer({ configFile: path.join(ROOT, 'vite.config.ts'), server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await vite.listen();
  const addr = vite.httpServer?.address();
  const port = typeof addr === 'object' && addr ? addr.port : 5173;
  const browser = await launchBrowser();
  try {
    for (const shot of shots) {
      for (const look of looks) {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        page.on('pageerror', (e) => console.log(`  page error (${look}): ${e.message}`));
        page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`  console (${look}): ${m.text().slice(0, 300)}`); });
        await page.goto(`http://127.0.0.1:${port}/lookdev.html?map=${map}&shot=${shot}&look=${look}${baked ? '&baked=1' : ''}`);
        await page.waitForFunction(() => (window as unknown as { __lookdev?: { ready: boolean } }).__lookdev?.ready === true, undefined, { timeout: 120000 });
        await sleep(1500);
        const file = path.join(OUT, `${map}-${shot}-${look}${baked ? '-baked' : ''}.png`);
        await page.screenshot({ path: file });
        console.log(`  ${path.relative(ROOT, file)}`);
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await vite.close();
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
