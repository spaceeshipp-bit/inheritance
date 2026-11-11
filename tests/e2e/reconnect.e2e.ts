// End-to-end: dropping out and coming back, through two real browsers.
//
// Ann volunteers as Grandma, Bob is a cousin, bots sit still. Mid-visit:
//   1. Bob reloads his page: he rejoins with his token, gets his own character
//      back and can walk again at once (his input count starts afresh).
//   2. Ann closes her tab: Nana has a lie-down (the match pauses, Bob sees the
//      take-over prompt); after the grace Bob presses J and becomes Grandma;
//      the match carries on with him holding the quill.
//
//   npx tsx tests/e2e/reconnect.e2e.ts
import type { Match } from '../../server/match.js';
import { GRANDMA_TAKEOVER_GRACE } from '../../server/match.js';
import { Player, Report, flat, gather, launchBrowser, setWilling, sleep, startGameServer } from './lib.js';

export async function run(): Promise<Report> {
  const r = new Report('reconnect');
  const srv = await startGameServer({ visitSeconds: 900, seed: 777, botsIdle: true });
  const base = `http://127.0.0.1:${srv.port}`;
  const browser = await launchBrowser();
  const browser2 = await launchBrowser();
  let ann: Player | null = null;
  let bob: Player | null = null;
  try {
    ann = await Player.open(browser, `${base}/?name=Ann`, 'Ann', 'rc-grandma');
    bob = await Player.open(browser2, `${base}/`, 'Bob', 'rc-cousin');
    const room = await gather(ann, [bob], base);
    await setWilling(ann, true);
    const annId = await ann.id();
    const bobId = await bob.id();
    await ann.page.getByText('Start the visit').click();
    r.check('the visit begins', await ann.reached('visit', 30000) && await bob.reached('visit', 30000));
    const match = srv.rooms.rooms.get(room)?.match as Match | undefined;
    if (!match) { r.check('server created the match', false); return r; }
    await sleep(800);

    // ── 1. Bob reloads mid-visit ──
    const before = { ...match.chars.get(bobId)!.body.pos };
    await bob.page.reload();
    r.check('the reloaded page is back in the match', await bob.reached('visit', 30000));
    r.check('…with the same player id', (await bob.id()) === bobId, `${await bob.id()} vs ${bobId}`);
    r.check('…as a cousin', (await bob.role()) === 'cousin');
    r.check('…and the server has him connected and awake', await bob.waitFor('awake', async () => {
      const c = match.chars.get(bobId);
      return !!c && c.connected && c.state === 'normal';
    }, 10000));
    await bob.lock();
    const from = { ...match.chars.get(bobId)!.body.pos };
    await bob.page.keyboard.down('KeyW');
    const moved = await bob.waitFor('walks after the reload', async () => flat(match.chars.get(bobId)!.body.pos, from) > 0.8, 8000, 100);
    await bob.page.keyboard.up('KeyW');
    r.check('his inputs count at once after the reload (he walks)', moved, `moved ${flat(match.chars.get(bobId)!.body.pos, from).toFixed(2)} m, from ${flat(from, before).toFixed(2)} m off where he was`);
    await bob.shot('after-reload');

    // ── 2. Ann's tab closes: Nana's lie-down, then Bob takes over ──
    await ann.close();
    r.check('Nana has a lie-down: the match pauses', await bob.waitFor('pause', async () => !!match.pause, 15000));
    r.check('…and Bob sees the take-over prompt', await bob.waitFor('prompt', async () => bob!.page.evaluate(() => {
      const t = document.querySelector('.takeover') as HTMLElement | null;
      return !!t && getComputedStyle(t).display !== 'none' && (t.textContent ?? '').trim().length > 0;
    }), 10000));
    await bob.shot('takeover-prompt');
    await sleep(GRANDMA_TAKEOVER_GRACE * 1000 + 600);
    await bob.tap('KeyJ');
    r.check('pressing J after the grace makes Bob Grandma on the server', await bob.waitFor('takeover', async () => match.grandmaId === bobId, 10000));
    r.check('…and on his own screen', await bob.waitFor('role', async () => (await bob!.role()) === 'grandma', 10000));
    r.check('the match carries on (no pause)', await bob.waitFor('unpaused', async () => !match.pause, 10000));
    r.check('Ann is no longer in the will', !(annId in match.will.shares) || match.grandmaId !== annId);
    r.check('Bob is out of the will (Grandma leaves it)', !(bobId in match.will.shares));
    r.check('shares still sum to 100', Object.values(match.will.shares).reduce((a, b) => a + b, 0) === 100, JSON.stringify(match.will.shares));
    r.check('the take-over is in the log as a will change', match.log.events.some((e) => e.kind === 'will' && e.via === 'takeover'));
    await sleep(1500);
    await bob.shot('bob-as-grandma');
    r.check('no page errors (Bob)', bob.errors.length === 0, bob.errors.slice(0, 3).join(' | '));
    return r;
  } catch (err) {
    r.check('suite ran to the end', false, err instanceof Error ? `${err.message}\n${err.stack}` : String(err));
    return r;
  } finally {
    await ann?.close();
    await bob?.close();
    await browser.close();
    await browser2.close();
    await srv.close();
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  run().then((r) => { console.log(`\n${r.checks.length - r.failed.length}/${r.checks.length} checks passed`); process.exit(r.failed.length ? 1 : 0); }, (e) => { console.error(e); process.exit(1); });
}
