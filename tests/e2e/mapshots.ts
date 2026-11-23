// Map photographs: a real match on one map (you plus bots), photographed with
// the renderer's photo camera: a cut-away from above, a view into every room,
// the dinner table, and a cousin's-eye view. For building maps and for the
// graphics review. Not part of the e2e suite.
//
//   npx tsx tests/e2e/mapshots.ts <map> [--gfx high] [--size 1600x900]
//
// Shots land in tests/e2e/screenshots/maps/<map>-*.png.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAPS, MAP_IDS, type MapId } from '../../shared/map.js';
import type { Vec3 } from '../../shared/types.js';
import { Player, gather, launchBrowser, sleep, startGameServer } from './lib.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screenshots', 'maps');

interface Cam { label: string; pos: Vec3; look: Vec3; fov?: number }

/** Cameras for a map: from above, into each room, and over the dinner table. */
export function cameras(id: MapId): Cam[] {
  const d = MAPS[id];
  const b = d.bounds;
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  const w = b.max.x - b.min.x, depth = b.max.z - b.min.z;
  const cams: Cam[] = [
    { label: 'overview', pos: { x: cx + w * 0.1, y: Math.max(w, depth) * 0.85, z: b.max.z + depth * 0.45 }, look: { x: cx, y: 0, z: cz }, fov: 50 },
    { label: 'topdown', pos: { x: cx, y: Math.max(w, depth) * 1.15, z: cz + 0.01 }, look: { x: cx, y: 0, z: cz }, fov: 55 },
  ];
  const seen = new Set<string>();
  for (const r of d.rooms) {
    if (seen.has(r.name)) continue;
    seen.add(r.name);
    const h = Math.min(r.max.y - r.min.y, 3.4);
    const corner = { x: r.min.x + 0.6, y: r.min.y + Math.max(1.6, h - 0.45), z: r.max.z - 0.6 };
    cams.push({ label: `room-${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, pos: corner, look: { x: (r.min.x + r.max.x) / 2, y: r.min.y + 0.8, z: (r.min.z + r.max.z) / 2 }, fov: 70 });
  }
  const t = d.dinner.table;
  const tc = { x: (t.minX + t.maxX) / 2, y: 0.8, z: (t.minZ + t.maxZ) / 2 };
  cams.push({ label: 'dinner-table', pos: { x: tc.x + 2.6, y: 2.6, z: tc.z + 2.6 }, look: tc, fov: 60 });
  cams.push({ label: 'grandma-spawn', pos: { x: d.spawns.grandma.x, y: 1.75, z: d.spawns.grandma.z }, look: { x: d.spawns.cousins[0].x, y: 1.2, z: d.spawns.cousins[0].z }, fov: 70 });
  return cams;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const id = args.find((a) => !a.startsWith('--') && MAP_IDS.includes(a as MapId)) as MapId | undefined;
  if (!id) { console.error(`usage: npx tsx tests/e2e/mapshots.ts <${MAP_IDS.join('|')}> [--gfx high] [--size 1600x900]`); process.exit(2); }
  const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const gfx = opt('--gfx') ?? 'medium';
  const [vw, vh] = (opt('--size') ?? '1280x720').split('x').map(Number);
  process.env.E2E_GFX = gfx;
  fs.mkdirSync(OUT, { recursive: true });

  const srv = await startGameServer({ visitSeconds: 900, seed: 5 });
  const browser = await launchBrowser();
  try {
    const base = `http://127.0.0.1:${srv.port}`;
    const me = await Player.open(browser, `${base}/?name=Photographer`, 'Photographer', `map-${id}`, { width: vw, height: vh });
    await gather(me, [], base);
    await me.page.locator(`.map-card[data-map="${id}"]`).click();
    await me.waitFor('map chosen', async () => me.page.evaluate((m) => (window as unknown as { __inh: { state: { lobby?: { options: { map: string } } } } }).__inh.state.lobby?.options.map === m, id), 5000);
    await me.shot('lobby');
    fs.renameSync(path.join(path.dirname(OUT), fs.readdirSync(path.dirname(OUT)).filter((f) => f.startsWith(`map-${id}-`) && f.endsWith('-lobby.png')).sort().pop()!), path.join(OUT, `${id}-lobby.png`));
    await me.page.getByText('Start the visit').click();
    if (!(await me.reached('visit', 60000))) throw new Error('the visit never began');
    await sleep(2500);
    await me.page.screenshot({ path: path.join(OUT, `${id}-cousin-view.png`) });
    await me.page.addStyleTag({ content: '#hud, #labels, #overlay { display: none !important; }' });
    for (const c of cameras(id)) {
      await me.page.evaluate((cam) => {
        (window as unknown as { __inh: { renderer: { photoCam: unknown } } }).__inh.renderer.photoCam = cam;
      }, c);
      await sleep(gfx === 'high' ? 1800 : 900);
      await me.page.screenshot({ path: path.join(OUT, `${id}-${c.label}.png`) });
      console.log(`  ${id}-${c.label}.png`);
    }
    if (me.errors.length) console.log('page errors:', me.errors.slice(0, 5));
  } finally {
    await browser.close();
    await srv.close();
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
