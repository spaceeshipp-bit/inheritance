// End-to-end: one whole first-playable match, scripted through two real browsers.
//
// Ann creates a room and volunteers as Grandma; Bob joins as a cousin; bots
// take the other seats but sit still (botsIdle) so every human interaction is
// deterministic (chaos.e2e.ts plays with lively bots). Through the real UI and
// real keyboard/mouse input:
//   Bob walks up to Nana, compliments her on the quick-chat wheel, types a chat
//   line and tattles; Ann answers on her own wheel, blesses and tuts him, uses
//   the hearing aid, spectacles and summon, edits the full parchment by dragging
//   a bar, then canes him;
//   Bob grabs and throws an heirloom, shoves a bot, steals a bot's signature
//   item and plants it in front of Nana; Ann finds it and tuts its owner (the
//   framing loop); then reading, vote, results and back to the lobby.
// Every message each page receives is recorded and checked: shares always sum
// to 100, secrets never reach the wrong client, and the server's own log agrees
// with what the players did.
//
//   npx tsx tests/e2e/match.e2e.ts
import type { ServerHandle } from '../../server/index.js';
import type { Match } from '../../server/match.js';
import { forwardOf } from '../../shared/movement.js';
import { angleFromFacing, visionBand } from '../../shared/senses.js';
import type { Vec3 } from '../../shared/types.js';
import { Player, Report, charIn, flat, gather, launchBrowser, setWilling, sleep, startGameServer } from './lib.js';

export async function run(): Promise<Report> {
  const r = new Report('match');
  // The visit clock is long; the script ends the visit itself when it is done
  // (software WebGL in CI makes the timing of each step unpredictable).
  const srv: ServerHandle = await startGameServer({ visitSeconds: 900, seed: 20261111, botsIdle: true });
  const base = `http://127.0.0.1:${srv.port}`;
  // One browser per player: all pages of one browser share a single GPU process,
  // and this container renders WebGL in software on that one thread.
  const browser = await launchBrowser();
  const browser2 = await launchBrowser();
  let ann: Player | null = null;
  let bob: Player | null = null;
  try {
    ann = await Player.open(browser, `${base}/?name=Ann`, 'Ann', 'grandma');
    bob = await Player.open(browser2, `${base}/`, 'Bob', 'cousin');
    await ann.shot('title');
    const room = await gather(ann, [bob], base);
    r.check('both players reach the same lobby', (await bob.room()) === room, room);
    await setWilling(ann, true);
    await ann.shot('lobby');

    const annId = await ann.id();
    const bobId = await bob.id();
    const lobbyVoice = await ann.waitFor('voice mesh in the lobby', async () => {
      const [a, b] = [await ann!.voice(), await bob!.voice()];
      return a?.peers[bobId]?.connectionState === 'connected' && b?.peers[annId]?.connectionState === 'connected';
    }, 20000);
    r.check('voice connects Ann and Bob in the lobby', lobbyVoice);

    // ── start ──
    await ann.page.getByText('Start the visit').click();
    r.check('host starts the match: both see the role reveal', await ann.reached('roles', 10000) && await bob.reached('roles', 10000));
    r.check('the willing volunteer is Grandma', (await ann.role()) === 'grandma');
    r.check('the other human is a cousin', (await bob.role()) === 'cousin');
    await ann.shot('role-reveal');
    await bob.shot('role-reveal');
    const roomObj = srv.rooms.rooms.get(room);
    const match: Match | null = roomObj?.match ?? null;
    r.check('server created the match', !!match);
    if (!match) return r;
    r.check('bots fill the cousin seats up to 5 players', match.chars.size === 5, `${match.chars.size} characters`);

    r.check('Afternoon Tea begins on both clients', await ann.reached('visit', 15000) && await bob.reached('visit', 15000));
    const bots = match.cousinIds.filter((id) => id !== bobId);
    await sleep(600);
    await ann.shot('grandma-view-start');
    await bob.shot('cousin-view-start');

    const grandmaPos = (): Vec3 => ({ ...match.chars.get(annId)!.body.pos });
    const distToNana = (): number => flat(match.chars.get(bobId)!.body.pos, grandmaPos());
    /** A spot `d` m in front of Grandma, nudged north of the side table that sits south-east of her chair. */
    const frontOfNana = (d = 1.25): Vec3 => {
      const g = match.chars.get(annId)!;
      const f = forwardOf(g.yaw);
      return { x: g.body.pos.x + f.x * d, y: 0, z: g.body.pos.z + f.z * d - 0.35 };
    };
    const comeToNana = async (): Promise<boolean> => {
      for (let i = 0; i < 3; i++) {
        await bob!.walkTo(frontOfNana(), { within: 0.35, timeoutMs: 15000 });
        await bob!.faceTo(grandmaPos());
        await sleep(300);
        if (distToNana() < 1.75) return true;
      }
      return false;
    };

    // ── Bob walks up to Nana (in front of her: she faces east) ──
    r.check('cousin walks up to Nana with real W presses', await comeToNana(), `${distToNana().toFixed(2)} m`);
    await bob.shot('cousin-at-nana');

    // Compliment on the quick-chat wheel (Q, then 1 = "Love you, Nana!").
    await bob.quickChat(1);
    const heard = await ann.waitFor('compliment bubble', async () => (await ann!.rx()).log.some((x) => x.msg.e === 'bubble' && x.msg.from === bobId), 3000);
    r.check('Grandma receives the compliment bubble', heard);
    const bubble = (await ann.rx()).log.find((x) => x.msg.e === 'bubble' && x.msg.from === bobId)?.msg;
    r.check('...unscrambled, because he is within 2 m', bubble?.text === 'Love you, Nana!', `${String(bubble?.text)} at ${distToNana().toFixed(2)} m`);
    r.check('server logs the compliment', match.log.events.some((e) => e.kind === 'compliment' && e.by === bobId));

    // Typed chat: Enter opens the box (it takes focus), type, Enter sends.
    await bob.tap('Enter');
    await bob.waitFor('chat box focused', async () => bob!.page.evaluate(() => document.activeElement?.classList.contains('chat-input') ?? false), 3000, 50);
    await bob.page.keyboard.type('Nana, your pills are on the gallery', { delay: 15 });
    await bob.tap('Enter');
    r.check('typed chat reaches the cousin\'s own client as a bubble', await bob.waitFor('own typed bubble', async () => (await bob!.rx()).log.some((x) => x.msg.e === 'bubble' && x.msg.from === bobId && x.msg.quick === false), 3000));

    // Tattle on the first bot (T, then 1).
    await bob.quickChat(1, 't');
    r.check('tattle reaches Grandma', await ann.waitFor('tattle event', async () => (await ann!.rx()).log.some((x) => x.msg.e === 'tattle' && x.msg.from === bobId), 3000));

    // Ann answers on her own wheel (V, then 6 = "Good child.").
    await ann.quickChat(6, 'v');
    r.check('Grandma\'s quick-chat (V) reaches the cousin', await bob.waitFor('grandma bubble', async () => (await bob!.rx()).log.some((x) => x.msg.e === 'bubble' && x.msg.from === annId && x.msg.text === 'Good child.'), 3000));

    // ── Ann: Bless and Tut Bob (he is under her crosshair), aid, spectacles, summon ──
    await ann.faceTo(match.chars.get(bobId)!.body.pos);
    r.check('Grandma takes pointer lock by clicking', await ann.lock());
    await sleep(300);
    const sharesBefore = { ...match.will.shares };
    await ann.tap('KeyE');
    r.check('E blesses the cousin under her crosshair (+5)', await ann.waitFor('bless', async () => match.will.shares[bobId] === sharesBefore[bobId] + 5, 3000), `${sharesBefore[bobId]} -> ${match.will.shares[bobId]}`);
    await sleep(300);
    await ann.tap('KeyQ');
    r.check('Q tuts him back (-5)', await ann.waitFor('tut', async () => match.will.shares[bobId] === sharesBefore[bobId], 3000), `now ${match.will.shares[bobId]}`);
    r.check('the cousin sees both will changes', await bob.waitFor('will events', async () => ((await bob!.rx()).events.will ?? 0) >= 2, 3000));

    await ann.mouse('right');
    r.check('right click turns on the hearing aid', await ann.waitFor('hearing aid', async () => !!(await ann!.me())?.aidActive, 3000));
    r.check('the cousin hears the hearing-aid whistle', await bob.waitFor('whistle', async () => ((await bob!.rx()).events.whistle ?? 0) > 0, 4000));
    await ann.tap('KeyF');
    r.check('F puts the spectacles on', await ann.waitFor('specs', async () => !!(await ann!.me())?.specsActive, 3000));
    await ann.shot('grandma-aid-specs');
    await ann.tap('KeyR');
    r.check('R summons: the cousin is told', await bob.waitFor('summon', async () => ((await bob!.rx()).events.summon ?? 0) > 0, 3000));
    await bob.shot('cousin-summoned');

    // ── Ann: the full parchment ──
    await ann.tap('Tab');
    const fp = ann.page.locator('.full-parchment');
    r.check('Tab opens the full parchment', await ann.waitFor('parchment open', async () => fp.isVisible(), 3000));
    await sleep(300);
    await ann.shot('grandma-parchment');
    const usedBefore = match.will.usedThisVisit;
    const bar = ann.page.locator('.fp-bar').nth(1);
    const box = await bar.boundingBox();
    if (box) {
      await ann.page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
      await ann.page.mouse.down();
      for (let i = 1; i <= 6; i++) { await ann.page.mouse.move(box.x + box.width * 0.2 + i * 5, box.y + box.height / 2); await sleep(60); }
      await ann.page.mouse.up();
    }
    r.check('dragging a bar moves the will 1 point per step', await ann.waitFor('parchment drag', async () => match.will.usedThisVisit >= usedBefore + 6, 4000), `moved ${match.will.usedThisVisit - usedBefore}`);
    await ann.page.locator('.fp-row').nth(2).locator('.fp-btn').first().click();
    r.check('the - button moves one point', await ann.waitFor('minus', async () => match.will.usedThisVisit >= usedBefore + 7, 3000));
    r.check('a cousin nearby hears the quill scratch', await bob.waitFor('quill', async () => ((await bob!.rx()).events.quill ?? 0) > 0, 3000));
    await ann.tap('Tab');
    r.check('Tab closes the parchment', await ann.waitFor('parchment closed', async () => !(await fp.isVisible()), 3000));
    r.check('server logged parchment edits', match.log.events.some((e) => e.kind === 'will' && e.via === 'parchment'));
    const sum = Object.values(match.will.shares).reduce((a, b) => a + b, 0);
    r.check('shares still sum to 100 on the server', sum === 100, String(sum));

    // ── Ann canes Bob ──
    await ann.setYaw(-Math.PI / 2);
    await ann.waitFor('facing east', async () => Math.abs(match.chars.get(annId)!.yaw + Math.PI / 2) < 0.05, 3000, 50);
    for (let i = 0; i < 3 && !(await comeToNana() && distToNana() < 1.55); i++) await sleep(200);
    await ann.faceTo(match.chars.get(bobId)!.body.pos);
    await ann.waitFor('facing Bob', async () => {
      const g = match.chars.get(annId)!, b = match.chars.get(bobId)!.body.pos;
      const f = forwardOf(g.yaw);
      const dx = b.x - g.body.pos.x, dz = b.z - g.body.pos.z;
      return (dx * f.x + dz * f.z) / Math.hypot(dx, dz) > 0.9;
    }, 3000, 50);
    const relocked = await ann.lock();
    await sleep(300);
    await ann.mouse('left');
    const caneSwung = await ann.waitFor('cane swing', async () => match.chars.get(annId)!.caneCd > 0, 3000, 50);
    r.check('left click canes the cousin in front of her', await bob.waitFor('cane', async () => ((await bob!.rx()).events.cane ?? 0) > 0, 3000), `${distToNana().toFixed(2)} m, relocked ${relocked}, swung ${caneSwung}, yaw ${match.chars.get(annId)!.yaw.toFixed(2)}`);
    r.check('...and he goes floppy', match.chars.get(bobId)!.state === 'ragdoll' || await bob.waitFor('ragdoll', async () => (await bob!.me())?.state === 'ragdoll', 1500, 50));
    await bob.shot('cousin-caned');
    await bob.waitFor('upright', async () => match.chars.get(bobId)!.state === 'normal', 5000);

    // ── Bob: grab and throw an heirloom ──
    const target = pickHeirloom(match, bobId);
    let threw = false;
    if (target) {
      const at = () => ({ ...match.props.get(target)!.pos });
      r.check('cousin reaches an heirloom', await bob.walkTo(at(), { within: 0.95, timeoutMs: 25000 }), target);
      await bob.faceTo(at());
      const locked = await bob.lock();
      await sleep(150);
      await bob.page.mouse.down({ button: 'left' });
      const me = match.chars.get(bobId)!;
      r.check('left click grabs the heirloom', await bob.waitFor('holding', async () => match.chars.get(bobId)!.holding === target, 2500, 50), `locked ${locked}, holding ${me.holding}, dist ${flat(me.body.pos, at()).toFixed(2)}, primary ${me.input.primary}`);
      await bob.shot('cousin-carrying');
      // Turn to face the open hall, charge (hold right) and release to throw.
      await bob.setYaw(Math.atan2(-(0 - match.chars.get(bobId)!.body.pos.x), -(1 - match.chars.get(bobId)!.body.pos.z)));
      await sleep(200);
      await bob.page.mouse.down({ button: 'right' });
      await sleep(800);
      await bob.page.mouse.up({ button: 'right' });
      await sleep(80);
      await bob.page.mouse.up({ button: 'left' });
      threw = await bob.waitFor('thrown', async () => match.chars.get(bobId)!.holding === null && match.props.get(target)!.thrownBy !== null || match.props.get(target)!.broken, 2500, 50);
      r.check('right-click charge and release throws it', threw);
      r.check('the thrown heirloom smashes (crash event)', await bob.waitFor('crash', async () => (await bob!.rx()).log.some((x) => x.msg.e === 'crash' && x.msg.heirloom === target), 5000));
      r.check('server blames Bob for the break', match.log.events.some((e) => e.kind === 'break' && e.heirloom === target && e.by === bobId));
      await bob.shot('cousin-after-throw');
    } else r.check('an unbroken heirloom is left to throw', false);

    // ── Bob: shove a bot ──
    let shoved = false;
    for (let attempt = 0; attempt < 4 && !shoved; attempt++) {
      const victim = nearestBot(match, bobId, bots);
      if (!victim) break;
      await bob.walkTo(() => Promise.resolve({ ...match.chars.get(victim)!.body.pos }), { within: 0.95, timeoutMs: 15000 });
      await bob.faceTo(match.chars.get(victim)!.body.pos);
      await sleep(100);
      await bob.tap('KeyF');
      shoved = await bob.waitFor('shove', async () => match.log.events.some((e) => e.kind === 'shove' && e.by === bobId), 2500, 50)
        && await bob.waitFor('shove event', async () => (await bob!.rx()).log.some((x) => x.msg.e === 'shove' && x.msg.by === bobId), 2500, 50);
    }
    r.check('F shoves a bot (the cousin\'s client is told who shoved)', shoved);
    await bob.shot('cousin-shoved-bot');

    // ── Bob: steal a bot's signature item, plant it in front of Nana ──
    let stolen: string | null = null;
    const stealNotes: string[] = [];
    for (let attempt = 0; attempt < 4 && !stolen; attempt++) {
      const victim = nearestBot(match, bobId, bots, true);
      if (!victim) { stealNotes.push('no victim'); break; }
      await bob.walkTo(() => Promise.resolve({ ...match.chars.get(victim)!.body.pos }), { within: 0.9, timeoutMs: 15000 });
      const me = match.chars.get(bobId)!;
      const vic = match.chars.get(victim)!;
      const vItem = vic.itemId ? match.props.get(vic.itemId) : undefined;
      const loose = [...match.props.values()].filter((p) => p.kind === 'item' && !p.heldBy && !p.hidden && flat(p.pos, me.body.pos) < 1.5).map((p) => p.id);
      stealNotes.push(`#${attempt} ${victim} d=${flat(me.body.pos, vic.body.pos).toFixed(2)} dy=${(vic.body.pos.y - me.body.pos.y).toFixed(2)} vstate=${vic.state} item=${vItem?.heldBy}/${vItem?.onBody} me=${me.state}/holding=${me.holding} loose=[${loose.join(',')}] typing=${await bob.page.evaluate(() => (window as unknown as { __inh: { input: { typing: boolean; active: boolean; lookFrozen: boolean } } }).__inh.input.typing)}`);
      await bob.tap('KeyE');
      await bob.waitFor('stolen item in hands', async () => (match.chars.get(bobId)!.holding ?? '').startsWith('item-'), 2500, 50);
      const h = match.chars.get(bobId)!.holding;
      if (h && h.startsWith('item-')) stolen = h;
    }
    r.check('E steals a signature item off a bot', !!stolen, stolen ?? stealNotes.join(' | '));
    let framed = false;
    if (stolen) {
      const owner = match.props.get(stolen)?.owner ?? '';
      await ann.setYaw(-Math.PI / 2); // she must be looking east, towards the spot, to find it
      await ann.waitFor('Grandma facing east', async () => Math.abs(match.chars.get(annId)!.yaw + Math.PI / 2) < 0.05, 3000, 50);
      let planted = false;
      for (let attempt = 0; attempt < 3 && !planted; attempt++) {
        await bob.walkTo(frontOfNana(1.75), { within: 0.35, timeoutMs: 15000 });
        await bob.faceTo(grandmaPos());
        await sleep(200);
        await bob.page.keyboard.down('KeyG');
        planted = await bob.waitFor('planted', async () => !!match.props.get(stolen!)?.planted, 3000, 50);
        await bob.page.keyboard.up('KeyG');
      }
      r.check('holding G plants the stolen item', planted);
      await bob.shot('cousin-planted');
      // Nana looks where it landed (bodies jostle, so it is not always dead ahead).
      if (planted) await ann.faceTo(match.props.get(stolen)!.pos);
      const found = await ann.waitFor('found', async () => (await ann!.rx()).log.some((x) => x.msg.e === 'found' && x.msg.item === stolen), 4000);
      const g = match.chars.get(annId)!, it = match.props.get(stolen)!;
      const sense = match.grandmaSense();
      r.check('Grandma finds the planted item right in front of her', found,
        `yaw ${g.yaw.toFixed(2)} item ${JSON.stringify(it.pos)} planted ${it.planted} heldBy ${it.heldBy} d ${flat(g.body.pos, it.pos).toFixed(2)} angle ${angleFromFacing({ pos: g.body.pos, yaw: g.yaw }, it.pos).toFixed(0)} band ${sense ? visionBand(sense, it.pos) : '-'} connected ${g.connected} pause ${!!match.pause}`);
      r.check('...and is told whose it is', (await ann.rx()).log.some((x) => x.msg.e === 'found' && x.msg.owner === owner));
      r.check('the cousin is not told she found it', !(await bob.rx()).log.some((x) => x.msg.e === 'found'));
      await ann.shot('grandma-found');
      // Ann looks away from everyone and tuts the owner by locking their name with
      // the scroll wheel (the lock starts on nobody; each notch moves one cousin on).
      await ann.setYaw(Math.PI / 2);
      await sleep(300);
      const idx = match.cousinIds.indexOf(owner);
      for (let i = 0; i <= idx; i++) { await ann.page.mouse.wheel(0, 120); await sleep(80); }
      await sleep(250);
      await ann.tap('KeyQ');
      framed = await ann.waitFor('accusation', async () => match.log.events.some((e) => e.kind === 'accuse' && e.target === owner), 3000, 50);
      r.check('tutting the owner frames them (a framing, in the secret log)', framed && match.log.framedPlants().size > 0);
      r.check('…and the framer is not told until the reading', !(await bob.rx()).log.some((x) => x.msg.e === 'moment' && (x.msg.moment as { kind: string }).kind === 'framed'));
      r.check('server logs the accusation of the owner', match.log.events.some((e) => e.kind === 'accuse' && e.target === owner));
    }

    // ── secrecy while the visit runs ──
    const annRx = await ann.rx();
    const forbidden = annRx.log.filter((x) => x.msg.e === 'moment' && !['big-cut', 'caught-red-handed'].includes((x.msg.moment as { kind: string }).kind));
    r.check('Grandma is never told about moments she could not witness', forbidden.length === 0, forbidden.map((x) => (x.msg.moment as { kind: string }).kind).join(','));

    // ── reading, vote, results ──
    const visitLeft = match.phaseEndsAt - match.time;
    r.check('the scripted visit finished well inside its clock', match.phase === 'visit' && visitLeft > 0, `${visitLeft.toFixed(0)} s left`);
    match.phaseEndsAt = match.time; // end the visit now
    r.check('the visit ends and the will is read', await ann.reached('reading', 15000) && await bob.reached('reading', 5000));
    await sleep(1500);
    await bob.shot('reading');
    const readMsg = (await bob.rx()).log.find((x) => x.msg.t === 'reading')?.msg as { result: { shares: Record<string, number>; order: string[]; moments: { kind: string }[] } } | undefined;
    r.check('reading lists everyone lowest to highest', !!readMsg && readMsg.result.order.every((id, i, a) => i === 0 || readMsg.result.shares[a[i - 1]] <= readMsg.result.shares[id]));
    if (framed) r.check('the reading reveals the Framed moment to everyone', !!readMsg?.result.moments.some((m) => m.kind === 'framed'));

    r.check('then the vote', await bob.reached('vote', 15000));
    match.phaseEndsAt = match.time + 60; // hold the (fast-mode 5 s) vote open while the script votes
    await bob.shot('vote');
    await bob.page.locator('.vote-btn:not([disabled])').first().click();
    r.check('a vote click reaches the server', await bob.waitFor('vote', async () => match.votes.get(bobId) !== undefined, 3000), String(match.votes.get(bobId)));
    r.check('a cousin cannot vote for himself (his own button is disabled)', await bob.page.locator('.vote-btn[disabled]').count() === 1);
    match.phaseEndsAt = match.time; // close the vote

    r.check('then the results', await bob.reached('results', 15000) && await ann.reached('results', 3000));
    await sleep(900);
    await ann.shot('results');
    await bob.shot('results');
    const res = match.results;
    r.check('results carry a numeric Grandma score', typeof res?.grandmaScore === 'number', String(res?.grandmaScore));
    const minSabotage = (shoved ? 1 : 0) + (stolen ? 3 : 0) + (threw ? 1 : 0);
    r.check('Bob\'s sabotage is tallied', (res?.sabotage[bobId] ?? 0) >= minSabotage, `${res?.sabotage[bobId]} >= ${minSabotage}`);
    r.check('his vote is counted', (res?.votes[match.votes.get(bobId) ?? ''] ?? 0) >= 1);

    r.check('everyone returns to the lobby', await ann.reached('lobby', 20000) && await bob.reached('lobby', 5000));
    await sleep(600);
    r.check('the lobby screen is shown again', await bob.page.locator('.lobby-screen').isVisible());
    r.check('bots leave the room after the match', [...(roomObj?.players.values() ?? [])].every((p) => !p.isBot));
    r.check('voice is still connected after the match', (await ann.voice())?.peers[bobId]?.connectionState === 'connected');

    // ── what went over the wire ──
    const a = await ann.rx(), b = await bob.rx();
    r.check('phases arrive in order on both clients', ['roles', 'visit', 'reading', 'vote', 'results', 'lobby'].every((p, i, all) => i === 0 || a.phases.indexOf(p) > a.phases.indexOf(all[i - 1])), a.phases.join('>'));
    r.check('every snapshot Grandma got sums to 100', a.badShares.length === 0, JSON.stringify(a.badShares.slice(0, 2)));
    r.check('every snapshot the cousin got sums to 100', b.badShares.length === 0, JSON.stringify(b.badShares.slice(0, 2)));
    r.check('the cousin never sees which heirloom is the Favourite', b.favouriteSeen === 0, String(b.favouriteSeen));
    r.check('Grandma does see her Favourite', a.favouriteSeen > 0);
    const bobMatch = b.log.find((x) => x.msg.t === 'match')?.msg;
    r.check('the cousin never receives the preference cards', !!bobMatch && !('prefCards' in bobMatch));
    const annMatch = a.log.find((x) => x.msg.t === 'match')?.msg as { prefCards?: string[] } | undefined;
    r.check('Grandma receives exactly two preference cards', annMatch?.prefCards?.length === 2);
    const earlyTally = [...a.log, ...b.log].filter((x) => x.phase !== 'results' && JSON.stringify(x.msg).includes('"sabotage"'));
    r.check('nobody gets the sabotage tally before the results', earlyTally.length === 0);
    r.check('snapshots stay small', b.maxSnapBytes < 12000, `${b.maxSnapBytes} bytes max`);
    r.check('both clients got ~20 snapshots a second', a.snaps > 2000 && b.snaps > 2000, `${a.snaps} / ${b.snaps}`);

    for (const p of [ann, bob]) {
      r.check(`no page errors (${p.name})`, p.errors.length === 0, p.errors.slice(0, 3).join(' | '));
      r.check(`no console errors (${p.name})`, p.consoleErrors.length === 0, p.consoleErrors.slice(0, 3).join(' | '));
    }
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

/** The unbroken, not-held heirloom nearest to the player (ground floor first). */
function pickHeirloom(m: Match, who: string): string | null {
  const me = m.chars.get(who)!.body.pos;
  const cands = [...m.props.values()].filter((p) => p.kind === 'heirloom' && !p.broken && !p.heldBy);
  cands.sort((a, b) => (a.pos.y > 2 ? 100 : 0) + flat(a.pos, me) - ((b.pos.y > 2 ? 100 : 0) + flat(b.pos, me)));
  return cands[0]?.id ?? null;
}

/** The nearest upright bot cousin on the same floor (optionally: still wearing its own item). */
function nearestBot(m: Match, who: string, bots: string[], withItem = false): string | null {
  const me = m.chars.get(who)!.body.pos;
  let best: string | null = null, bd = Infinity;
  for (const id of bots) {
    const c = m.chars.get(id);
    if (!c || c.state !== 'normal' || Math.abs(c.body.pos.y - me.y) > 0.8) continue;
    if (withItem) {
      const it = c.itemId ? m.props.get(c.itemId) : undefined;
      if (!it || it.heldBy !== id || !it.onBody) continue;
    }
    const d = flat(c.body.pos, me);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

export { charIn };

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  run().then((r) => { console.log(`\n${r.checks.length - r.failed.length}/${r.checks.length} checks passed`); process.exit(r.failed.length ? 1 : 0); }, (e) => { console.error(e); process.exit(1); });
}
