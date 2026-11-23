// The emote photo booth: a real match on the manor, the player performs every
// gesture and dance in turn (as a cousin, then as Grandma), and the photo
// camera shoots each one from the front at a few moments. For tuning the poses
// and for the graphics review. Not part of the e2e suite.
//
//   npx tsx tests/e2e/emoteshots.ts [--role cousin|grandma|both] [--only id,id] [--gfx medium]
//
// Shots land in tests/e2e/screenshots/emotes/<role>-<emote>-<n>.png.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMOTES, emotesFor, type EmoteId } from '../../shared/emotes.js';
import type { Role } from '../../shared/types.js';
import { Player, gather, launchBrowser, setWilling, sleep, startGameServer } from './lib.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screenshots', 'emotes');

type W = { __inh: { state: { selfId: string; latest(): { chars: { id: string; pos: { x: number; y: number; z: number }; yaw: number }[] } | null }; renderer: { photoCam: unknown }; net: { send(m: unknown): void } } };

async function booth(role: Role, only: Set<string> | null, gfx: string): Promise<void> {
  const srv = await startGameServer({ visitSeconds: 900, seed: 11, botsIdle: true });
  const browser = await launchBrowser();
  try {
    const base = `http://127.0.0.1:${srv.port}`;
    const me = await Player.open(browser, `${base}/?name=Poser`, 'Poser', `emote-${role}`, { width: 960, height: 720 });
    await gather(me, [], base);
    await setWilling(me, role === 'grandma');
    await me.page.getByText('Start the visit').click();
    if (!(await me.reached('visit', 60000))) throw new Error('the visit never began');
    await sleep(1500);
    await me.page.addStyleTag({ content: '#hud, #overlay { display: none !important; }' });
    const list = [...emotesFor(role, 'gesture'), ...emotesFor(role, 'dance')].filter((d) => !only || only.has(d.id));
    for (const d of list) {
      // Frame the camera on the player, three metres in front (behind, for a moon), at chest height.
      await me.page.evaluate(({ away }) => {
        const w = window as unknown as W;
        const s = w.__inh.state.latest();
        const c = s?.chars.find((x) => x.id === w.__inh.state.selfId);
        if (!c) return;
        // A moon from the side (behind the player is often a wall).
        const yaw = c.yaw + (away ? Math.PI / 2 : 0);
        const f = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
        const side = { x: Math.cos(yaw), z: -Math.sin(yaw) };
        w.__inh.renderer.photoCam = {
          pos: { x: c.pos.x + f.x * 3.2 + side.x * 1.1, y: c.pos.y + 1.45, z: c.pos.z + f.z * 3.2 + side.z * 1.1 },
          look: { x: c.pos.x, y: c.pos.y + 1.05, z: c.pos.z }, fov: 45,
        };
      }, { away: !!d.away });
      await sleep(600);
      await me.page.evaluate((id) => { (window as unknown as W).__inh.net.send({ t: 'emote', id }); }, d.id);
      // A screenshot takes the best part of a second here: shoot against the clock, not after sleeps.
      const t0 = Date.now();
      const times = d.kind === 'dance' ? [0.9, 2.6, 4.4] : [0.55, d.secs * 0.55, d.secs - 0.35];
      for (let i = 0; i < times.length; i++) {
        const wait = times[i] * 1000 - (Date.now() - t0);
        if (wait < -250) continue;
        await sleep(Math.max(0, wait));
        await me.page.screenshot({ path: path.join(OUT, `${role}-${d.id}-${i + 1}.png`) });
      }
      console.log(`  ${role} ${d.id}`);
      await sleep(Math.max(0, d.secs * 1000 - (Date.now() - t0)) + 900);
    }
    if (me.errors.length) console.log('page errors:', me.errors.slice(0, 5));
  } finally {
    await browser.close();
    await srv.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const role = opt('--role') ?? 'both';
  const only = opt('--only') ? new Set(opt('--only')!.split(',').filter((x) => x in EMOTES) as EmoteId[]) : null;
  const gfx = opt('--gfx') ?? 'medium';
  process.env.E2E_GFX = gfx;
  fs.mkdirSync(OUT, { recursive: true });
  if (role === 'cousin' || role === 'both') await booth('cousin', only, gfx);
  if (role === 'grandma' || role === 'both') await booth('grandma', only, gfx);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
