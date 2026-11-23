// Scene export for offline renders: opens the dev-only /lookdev.html for a map
// and shot (the real map, the family posed mid-gesture) and saves it as a
// binary glTF plus the camera, for tools/render/cycles_render.py (Blender).
//
//   npx tsx tests/e2e/sceneexport.ts --out <dir> manor:family carehome:overview ...
//
// Writes <dir>/<map>-<shot>.glb and <dir>/<map>-<shot>.camera.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchBrowser } from './lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const oi = args.indexOf('--out');
  const out = oi >= 0 ? path.resolve(args[oi + 1]) : path.join(ROOT, 'tests/e2e/screenshots/renders');
  const jobs = args.filter((a, i) => a.includes(':') && i !== oi + 1);
  fs.mkdirSync(out, { recursive: true });
  const vite = await createServer({ configFile: path.join(ROOT, 'vite.config.ts'), server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await vite.listen();
  const addr = vite.httpServer?.address();
  const port = typeof addr === 'object' && addr ? addr.port : 5173;
  const browser = await launchBrowser();
  try {
    for (const job of jobs) {
      const [map, shot] = job.split(':');
      const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
      page.on('pageerror', (e) => console.log(`  page error (${job}): ${e.message}`));
      await page.goto(`http://127.0.0.1:${port}/lookdev.html?map=${map}&shot=${shot}&look=current`);
      await page.waitForFunction(() => (window as unknown as { __lookdev?: { ready: boolean } }).__lookdev?.ready === true, undefined, { timeout: 180000 });
      const b64 = await page.evaluate(() => (window as unknown as { __lookdev: { exportGlb(): Promise<string> } }).__lookdev.exportGlb());
      const cam = await page.evaluate(() => (window as unknown as { __lookdev: { camera(): unknown } }).__lookdev.camera());
      const base = path.join(out, `${map}-${shot}`);
      fs.writeFileSync(`${base}.glb`, Buffer.from(b64, 'base64'));
      fs.writeFileSync(`${base}.camera.json`, JSON.stringify(cam, null, 2));
      console.log(`  ${base}.glb (${(fs.statSync(`${base}.glb`).size / 1e6).toFixed(1)} MB)`);
      await page.close();
    }
  } finally {
    await browser.close();
    await vite.close();
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
