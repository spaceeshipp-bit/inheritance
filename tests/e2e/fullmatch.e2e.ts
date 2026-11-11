// End-to-end: a full match (Afternoon Tea, Family Dinner, The Storm) with
// lively bots, through two real browsers. Ann hosts and plays Grandma, Bob is
// a cousin, five bot cousins misbehave as they would in a real game. Checked:
// the three visits in order with breaks between, the edit budget fresh at each
// visit, the Storm dark with lightning seen on both clients, shares summing to
// 100 in every snapshot either client got, the reading (with any replays),
// the vote and results, and both back in the lobby, with no page errors.
//
//   npx tsx tests/e2e/fullmatch.e2e.ts
import type { Match } from '../../server/match.js';
import { WILL } from '../../shared/constants.js';
import { available } from '../../shared/will.js';
import { Player, Report, gather, launchBrowser, setWilling, sleep, startGameServer } from './lib.js';

export async function run(): Promise<Report> {
  const r = new Report('fullmatch');
  const srv = await startGameServer({ visitSeconds: 30, seed: 4242, botsIdle: false });
  const base = `http://127.0.0.1:${srv.port}`;
  const browser = await launchBrowser();
  const browser2 = await launchBrowser();
  let ann: Player | null = null;
  let bob: Player | null = null;
  try {
    ann = await Player.open(browser, `${base}/?name=Ann`, 'Ann', 'fm-grandma');
    bob = await Player.open(browser2, `${base}/`, 'Bob', 'fm-cousin');
    const room = await gather(ann, [bob], base);
    await setWilling(ann, true);
    await ann.page.getByText('Full match (Tea, Dinner, The Storm)').click();
    const roomObj = srv.rooms.rooms.get(room)!;
    r.check('the host turns on the full match', await ann.waitFor('full match', async () => roomObj.options.fullMatch, 5000));
    await ann.page.getByText('Start the visit').click();
    r.check('the match starts', await ann.reached('roles', 15000));
    const match = roomObj.match as Match | null;
    if (!match) { r.check('server created the match', false); return r; }
    r.check('three visits: Tea, Dinner, Storm', match.visits.join(',') === 'tea,dinner,storm', match.visits.join(','));

    // Watch the server from start to results.
    const visits: string[] = [];
    const budgetAtStart: number[] = [];
    let stormDark = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 10 * 60 * 1000 && match.phase !== 'results' && !match.over) {
      if (match.phase === 'visit') {
        const v = match.visits[match.visitIndex];
        if (visits[visits.length - 1] !== v) {
          visits.push(v);
          budgetAtStart.push(available(match.will, match.time).budget);
          await bob.shot(`visit-${v}`);
        }
        if (v === 'storm' && match.dark) stormDark = true;
      }
      await sleep(150);
    }
    r.check('the visits come in order', visits.join(',') === 'tea,dinner,storm', visits.join(','));
    r.check(`Nana's edit budget is fresh (${WILL.budgetPerVisit}) at the start of every visit`, budgetAtStart.length === 3 && budgetAtStart.every((b) => b === WILL.budgetPerVisit), budgetAtStart.join(','));
    r.check('the Storm puts the lights out', stormDark);
    const [a, b] = [await ann.rx(), await bob.rx()];
    r.check('both clients see the breaks between visits', a.phases.filter((p) => p === 'intermission').length >= 2 && b.phases.filter((p) => p === 'intermission').length >= 2);
    r.check('both clients see lightning in the Storm', (a.events.lightning ?? 0) > 0 && (b.events.lightning ?? 0) > 0, `${a.events.lightning ?? 0} / ${b.events.lightning ?? 0}`);
    r.check('the bots got up to something', match.log.events.some((e) => e.kind === 'shove' || e.kind === 'break' || e.kind === 'steal'));
    r.check('the reading came', a.log.some((x) => x.msg.t === 'reading') && b.log.some((x) => x.msg.t === 'reading'));
    r.check('…then the vote and the results', a.phases.includes('vote') && await ann.reached('results', 60000) && await bob.reached('results', 30000));
    await bob.shot('results');
    r.check('both are back in the lobby afterwards', await ann.reached('lobby', 60000) && await bob.reached('lobby', 30000));
    const [a2, b2] = [await ann.rx(), await bob.rx()];
    r.check('every snapshot Grandma got sums to 100', a2.badShares.length === 0, JSON.stringify(a2.badShares.slice(0, 2)));
    r.check('every snapshot the cousin got sums to 100', b2.badShares.length === 0, JSON.stringify(b2.badShares.slice(0, 2)));
    r.check('the cousin never sees which heirloom is the Favourite', b2.favouriteSeen === 0);
    for (const p of [ann, bob]) r.check(`no page errors (${p.name})`, p.errors.length === 0, p.errors.slice(0, 3).join(' | '));
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
