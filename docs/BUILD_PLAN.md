# Build plan — handoff to finish the first playable

Read this first, then `docs/ARCHITECTURE.md` (the build spec) and `docs/GDD.md` (the design).
This file says where the build stands, what is left, in what order, and the bar each
piece has to clear. Update the "Status" section as you go; it is the project's memory.

## Status (2026-11-23)

Everything below was run in this container on this date. The browser suites must run on an
otherwise idle machine: software WebGL makes them sensitive to load.

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | passes |
| Unit and rule tests | `npm test` | 346 pass in 36 files (rules, perception and secrecy, will, inputs and prediction, netcode limits, bots, HUD logic, metrics, replays, reasons, Dinner, maps, emotes, lightmaps, the review fixes, a real server) |
| Build | `npm run build` | passes |
| E2E | `npm run e2e` | see "Last e2e run" below (re-run pending on an idle machine) |
| CI | GitHub Actions | typecheck, build and unit tests on every push; e2e on pull requests and on demand |

Done since 2026-11-11 (each with tests; see `git log`):

- **Four maps**, picked by the host in the lobby (or "Surprise me"): Harrowgate Manor redesigned as a
  ten-room mansion (library stacks, drawing room and conservatory, a dining room laid for the wake,
  study, billiard room, scullery, portrait gallery), Sunny Pines Care Home, Pettigrew & Sons Funeral
  Parlour, and The Golden Years (a cruise ship: a shove through the Lifeboat 4 gate sends a cousin
  overboard). Maps live in `shared/maps/*` (MapDef) and `client/src/render/maps/*`; every map must pass
  `tests/unit/maps.test.ts` (spawns, heirlooms, the dinner table, bot paths, a bots-only full match).
- **Gestures and dances** (Z and X): eight gestures and six dances for cousins, nine for Nana, each a
  spring-driven pose with props and a synthesised sound. Sweet ones she sees count as flattery; rude
  ones are logged; unseen rudeness aimed at her is "Behind Her Back" (replayed at the reading), seen up
  close is "The Cheek of It". Bots use them. `shared/emotes.ts`.
- **The curtain call:** after the reading the family lines up and reacts (the heir shimmies, the
  disinherited weep, Nana dances Still Alive!).
- **Two reviews** (server/rules, client/UX): 32 of 33 findings fixed with tests, the take-over
  reworked; the 33rd (decodable mishearings) is accepted and documented in SECRECY.md.
- **Graphics:** a look-dev page (`/lookdev.html`) renders the real scene in candidate styles; scenes
  export to Blender for path-traced renders (`tools/render/`); a baked-lighting pipeline lays out
  lightmap atlases in the game and bakes them in Blender (`client/src/render/lightmap.ts`,
  `tools/render/bake_lightmap.py`). Final art direction still waits for the owner's approval.

### Earlier (2026-11-11)

Everything below was run in this container on this date. The browser suites were run on an
otherwise idle machine: software WebGL makes them sensitive to load, and an earlier run alongside
other browser work failed for that reason alone.

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | passes |
| Unit and rule tests | `npm test` | 264 pass in 30 files (rules, perception and secrecy, will, inputs and prediction, netcode limits, bots, HUD logic, metrics, replays, reasons, Dinner, a real server) |
| Build | `npm run build` | passes; game code 202 kB (72 kB gzipped), three.js its own 497 kB chunk |
| E2E | `npm run e2e` | see "Last e2e run" below |
| CI | GitHub Actions | typecheck, build and unit tests green on every push; e2e on pull requests and on demand |

Done since the handoff (each with tests; see `git log` and `docs/reviews/2026-11-11.md`):

- **Reviews:** every high and medium finding is fixed with a test, and all but two lows (S21 needs a
  TURN relay and is documented; P15, the Dinner table rule, is below).
- **Secrecy:** Grandma's snapshot is built from her senses; speech, shoves and crashes reach her only
  as she perceived them; voice is shaped by each speaker for each listener (measured on real audio:
  silence reaches her client at 12 m). Audit in `docs/SECRECY.md`.
- **Netcode:** inputs queue by seq and count once, late ones are guessed and replayed; GDD Gate 3
  measured: at 150 and 300 ms round trip with 2% loss the largest correction in 90 s of play is
  1 mm (`prediction.test.ts`). `?netsim=` and `INHERITANCE_NETSIM` simulate a bad link.
- **Hardening:** flood and size limits, per-address caps, hello timeout, abandoned matches stop,
  one tab per seat, a "match in progress" lobby with the live will for latecomers.
- **Bots:** ~4 incidents per bot per visit (was ~15), mostly unseen, a bot Grandma with only her own
  senses; framing accuracy over 50 seeded matches 43% (GDD target 30-50%). Bots go easy on players
  new to the room.
- **Playability:** onboarding (role goals, coach tips, controls chip), ranked prompts, shove and smash
  feedback, the paced reading, settings (quality, sensitivity, volumes, push-to-talk key, reduced
  motion, captions, colour-band patterns), a boot splash with a no-WebGL message.
- **Playtest metrics:** one anonymous JSON line per match (framing accuracy, leader-flip, moments...)
  and per survey answer, in `data/playtests.jsonl`.
- **What Nana Saw:** the server records around every act of sabotage; the reading ends with the best
  moments replayed split-screen, her blurred view above the truth, with what was said beside what she
  heard.
- **Nana's reasons in the margin:** at the reading her biggest decisions carry her reason and the
  truth ("She tutted: found Barnaby's phone where it shouldn't be. Really: Agatha planted it there.").
- **Family Dinner** round the kitchen table: Nana is told who leaves it; one "excuse me" a visit.
- **Survey:** three one-click questions on the results screen, recorded anonymously.
- **Docs:** README (run, play with friends, controls, deviations), SECRECY, STEAM (the path to Steam,
  researched with sources).

### Last e2e run

`npm run e2e` on an idle machine (each suite in real Chromium, software WebGL):

| Suite | What it plays | Result |
| --- | --- | --- |
| match | a whole match in two browsers: walk, compliment, chat, tattle, Bless/Tut, hearing aid, spectacles, summon, parchment, cane, throw, shove, steal, plant, find, frame, reading, vote, results | 76/76 |
| fullmatch | Tea, Dinner and the Storm with lively bots: budgets reset, the Storm dark with lightning, reading, results, lobby | 17/17 (re-run 2026-11-23 with thunder, ashes, playing dead, coffins and the Cat-apult in: 17/17) |
| reconnect | a cousin reloads mid-visit and walks on; Grandma's tab closes, a cousin takes over with J | 16/16 |
| voice | the voice mesh and hearing rules on real audio (4 pages, fake mics) | 65/65 |
| lobby-voice | three players in one real lobby | pass |

### Still to do, in order

1. Settings left: mic and output device pickers, remapping beyond push-to-talk; a gamepad test
   (Playwright can inject one) and controller glyphs.
2. ~~The reading as theatre~~: done as the curtain call (2026-11-23).
3. The GDD's practice rounds (4-minute cousin practice, 3-minute Grandma tutorial) against bots;
   today there are role goals and one-at-a-time coach tips.
4. S21: a TURN relay for voice so players' IP addresses stay hidden (docs/STEAM.md has the plan).
5. The art track: the owner chooses a direction from the look book (path-traced renders and the
   four looks on the real scene); then bake every map's lightmap (`tools/render/bake_lightmap.py`)
   and replace the stand-in characters and props with modelled ones (CC0 sources and licences are
   in the look book), keeping the spring-driven ragdolls and gestures.

## Decisions from the owner

- **Final graphics need the owner's approval.** Grey-box and stand-in art (CC0 packs
  such as Quaternius, Poly Haven, ambientCG; licences checked and listed in an
  attributions file) are fine for building and playtesting. Before any final art
  direction, character style, environment kit or animation set is locked in,
  present options (screenshots or short clips) and get an explicit yes.
- Art track order (agreed 2026-11-11): finish and verify the current build work
  first; then the code side of animation (skeleton-based characters with the
  primitive models as fallback, an asset pipeline, browser-side physics
  ragdolls); stand-in art for the Gate 1 playtest; the final style only after
  Gate 1 and the owner's approval.

## How to work

- **Commit after every milestone** with a clear message. The last session lost nothing only by
  luck. Never leave more than an hour of work uncommitted.
- **Run everything you claim.** Every milestone ends with: typecheck, `npm test`, `npx vite build`,
  the e2e suites, and looking at fresh screenshots (Read the PNGs). Paste real results in Status.
  If something fails, say so; do not skip, loosen or delete a test to get green.
- **Tests come with the change.** Every bug fix gets a test that fails without it. Every rule in
  the GDD's "Core rules" has at least one unit test naming the rule.
- **The GDD is the judge.** Where code and `docs/GDD.md` disagree, the GDD wins unless you record
  a reasoned deviation in the README's "Known deviations". `shared/constants.ts` is the only
  place numbers live.
- **Grandma's ignorance is the game.** Before sending anything to Grandma's client, ask: would
  she know this from her own eyes and ears? If not, it does not go on the wire. Same for cousins
  and her preference cards, the Favourite heirloom and the sabotage tally.
- **No corner-cutting patterns:** no `any` to silence types, no `// @ts-ignore`, no swallowed
  errors, no `setTimeout` to paper over races, no tests that assert only "does not throw".
- **Subagents:** use them for independent work (reviews by lens, parallel features in disjoint
  folders). Give each the files to read, the area it owns, and how to verify. Verify their claims
  yourself before recording them here.
- Ports: random 40000–49999 for anything you start; kill it after. Never leave processes running.
- Do not touch `/home/user/alien-empire`; that is a different project.

## Work remaining, in order

The original handoff plan, kept as written. What is done and what is left is tracked in Status above.

### 1. Integration (finish what the workflow never ran)

- `tests/e2e/run.mjs` (`npm run e2e`): build, start the real server (`INHERITANCE_FAST=1`, free
  port), page A = Grandma, page B = cousin, bots fill. Drive **real inputs**: the cousin walks to
  Grandma, compliments on the wheel, grabs and throws an heirloom, shoves a bot, steals and plants
  an item; Grandma Blesses and Tuts, opens the Tab parchment and drags a share, uses hearing aid,
  spectacles, cane, summon. Assert: no console/page errors, phases reach results and return to
  lobby, shares sum to 100 in every snapshot, the A–B voice connection is `connected`
  (`window.__voiceDebug`), Grandma's client never received a `moment` she should not have.
  Save screenshots and look at them.
- A second e2e for the full match (`fullMatch: true`): Tea → Dinner → Storm, lightning seen.
- A reconnect e2e: cousin page reloads mid-visit and gets its character back; Grandma page closes
  and a willing human takes over within 15 s.
- Fold `tests/e2e/lobby-voice.ts` and `tests/e2e/voice/run.mjs` into `npm run e2e` (or `e2e:all`).

### 2. Three independent reviews, then fix everything real

Run these as separate reviewers who do not see each other's findings; each must reproduce or
quote code for every finding. Then fix high and medium, and cheap lows.

- **Rules vs GDD**, rule by rule: sense bands and every use of them; the will (only Grandma edits,
  5-point quick steps, quick Tut never reaches 0, parchment can, 60/visit, 20 per 30 s, Favourite
  free Tut, Big Cut per parchment opening); framing (own item always on you, steal then plant,
  crime scenes); accusation window; wishes give no automatic share; scoring; disconnect rules;
  nobody forced to be Grandma; push-Grandma off by default.
- **Bugs, netcode, security**: hostile WebSocket clients (wrong role, wrong phase, NaN, huge
  payloads, floods), room/timer leaks when rooms empty, host leaving, rejoin edge cases, physics
  tunnelling or leaving the map, voice connection leaks, and a full audit of **every** server →
  client message for information Grandma or cousins should not have (snapshots included: does
  Grandma's snapshot carry cousins who are behind her or out of range? It should not carry more
  than she could perceive, or at minimum must not carry `holding`, `plant`, `charge` for them).
- **Playability**: play a whole match as each role against bots through Playwright at 1280×720
  and 1280×800, reading many screenshots. Can a new player tell what to do in the first 30 s?

### 3. Known issues to resolve (from the build reports)

- **Bots are too rowdy:** about 25 shoves a minute with 7 bot cousins, and all 6 heirlooms usually
  break inside one 3-minute visit. Tune so a visit has a few memorable crimes, not constant noise;
  bots should mostly sabotage when Grandma cannot see them, and sometimes get caught.
- **Bot Grandma framing accuracy** swings 0–50% between matches. The GDD target for humans is
  30–50%; make the bot plausible and stable across 50 seeded matches (write that as a test).
- **Input handling:** the server applies only the latest input per tick. Queue inputs by `seq`
  (bounded) so prediction reconciles cleanly under jitter.
- **Prediction:** `client/src/predict.ts` exists; prove it. Add a network simulator (delay, jitter,
  loss; a dev URL flag and a server env var) and test at 150 ms and 2% loss, the GDD's Gate 3.
  Shoves must still feel immediate: play the wind-up locally at once.
- `shove` events now carry `by: ''` for an unseen shove on Grandma's client; make sure no HUD
  path prints an empty name (`pushGrandma` case).
- Players who join mid-match only see the lobby. Give them Grandma's-eye spectating or a clear
  "match in progress" screen with the live will.
- three.js bundle is one 500 kB+ chunk; split it and add a loading screen.

### 4. Finish the slice properly

- **README.md**: what this is, run locally, play with friends on a LAN and over the internet,
  controls for both roles, what is in and out versus the GDD, known deviations, test commands.
- **docs/STEAM.md**: the path from this web build to Steam (desktop wrapper + Steamworks for
  lobbies, invites, achievements, overlay, Timeline markers; hosting model; what changes versus the
  GDD's Unity plan). Mark every uncertain claim as uncertain and check facts against current docs.
- **Onboarding**: the GDD's 4-minute cousin practice and 3-minute Grandma tutorial, against bots,
  skippable. At minimum a first-match overlay per role and contextual key prompts.
- **Gamepad**: the GDD layout is coded; test it (Playwright can inject a gamepad) and add glyphs.
- **Accessibility**: captions for quick-chat lines, colour-blind-safe signature bands (shape or
  pattern as well as colour), a reduced-motion option for ragdoll camera, remappable keys.
- **Settings**: mouse sensitivity, volumes, push-to-talk key, mic and output device pickers.
- **Playtest metrics** from the GDD, written per match to a JSON line on the server: Grandma
  replay intent (one-click survey on the results screen), framing accuracy, leader-flip rate,
  moments per match.
- **CI**: a GitHub Actions workflow running typecheck, unit tests, build and the e2e suites.

### 5. Make it a game people retell (creative brief)

The slice works; now make each match produce a story. The test for any idea: does it make the
gap between what Grandma perceives and what really happened wider, funnier, or more visible at
the reading? Keep the GDD's hard rules (only Grandma moves the will; no hidden values).

- **"What Nana Saw" at the reading:** the GDD's signature feature. Record 10 Hz snapshots around
  each moment and replay the top three split-screen: her blurred, muffled view above, the truth
  below. This is the trailer and the reason people will clip the game. Highest-value item here.
- **Slapstick quality:** floppier, readable ragdolls; stair tumbles that take every step; the cat
  as a throwable chaos agent that yowls where it lands; heirlooms with distinct breaks (the clock
  chimes as it dies, the urn leaves ash footprints that lead to whoever walked through).
- **Grandma's character:** her view should feel like *being* her — spectacles sliding down, a
  hearing-aid whine, knitting in her lap that she drops when startled, muttered reactions.
  Voice-acted-feeling quick-chat via pitch-shifted synthesis until real audio exists.
- **Evidence that tells lies:** footprints, a dropped signature item, a cousin standing closest to
  the crash. Each should be forgeable, so framing has more than one tool.
- **Sound as information:** Grandma should be able to play half the game by ear — distinct
  footsteps for run/walk/sneak, direction of a crash, the whistle making cousins freeze.
- **The Storm** should be the peak: thunder masking crashes, lightning frames auto-offered for
  pinning, candles cousins can blow out.
- **The reading as theatre:** the lawyer's delivery, a pause before the top share, cousins'
  characters reacting (collapse at 0%, smug dance at the top), then the reveal of who really did
  what next to who Grandma blamed.
- Propose further ideas of your own in this file before building them, with the one-line reason
  each widens that gap; then build the best three.

### 5a. Proposals (2026-11-11), with why each widens the gap

The best three are marked ★ and are next once the core work above is done.

- ★ **What Nana Saw** (the brief's first item): the server keeps 10 Hz frames of every
  character plus what Grandma perceived of each at that instant (band, identified or not, what she
  heard); at the reading the top three moments replay split-screen, her blurred, muffled view above
  the truth. *It shows the gap itself, on screen, at the moment everyone is paying attention.*
- ★ **Nana's reasons in the margin:** each will change records what she had just perceived (a crash
  heard to her left, Barnaby seen holding the vase); the reading prints her reason beside what really
  happened ("Tutted Barnaby: heard a crash near him." / "Clementine threw it."). *Her mistakes become
  readable jokes instead of silent numbers.*
- ★ **The reading as theatre:** the lawyer reads lowest share first with a pause before the top
  share; the cousins' characters react (collapse at 0%, a smug dance at the top); each line then
  reveals who really did what beside who she blamed, ending on the replays. *The reveal lands as a
  scene, not a table.*
- **Thunder masks crashes** in the Storm: during a thunderclap her hearing drops to silent for a
  second, so a vase timed to the thunder is unheard. *Cousins learn to use her senses against her.*
  **Built 2026-11-23:** the server times each thunderclap (0.5–1.3 s after the flash, 1.6 s long);
  no crash she did not see, no voice, no tattle, no footsteps; the Under Cover of Thunder moment;
  bot cousins wait for it; HUD, captions and replays show it (thunder.test.ts).
- **Footsteps she can read:** distinct run, walk and sneak sounds with direction, so she can play
  half the game by ear. *Gives her real evidence that cousins can learn to fool (sneak past).*
- **Forgeable evidence:** ash footprints from the urn lead to whoever walked through; a cousin can
  walk a victim through them. *A second framing tool that she sees with her own eyes.*
  **Built 2026-11-23:** the broken urn leaves a pile; treading in it gives grey shoes and 16 prints
  (one every 0.6 m, alternating feet); cousins see every print, Grandma only those she has looked
  at, nobody is told whose; shoving someone in earns the Grandpa's Ashes moment (ash.test.ts).
- **Slapstick (part, 2026-11-23):** Mittens yowls when thrown and when she lands, knocks any
  heirloom she flies through off its pedestal (the thrower's fault: The Cat-apult), then bolts;
  each heirloom dies in character (the clock chimes, the teapot whistles, the portrait tears,
  the urn goes poof, the bust cracks) for anyone who knows which one it was.
- **Mind the Stairs** (new, 2026-11-23): a cousin knocked flying who ends up 2.2 m lower names
  whoever did it: all the way down the stairs, or over the banister (tumble.test.ts).
- **Early Burial** (new, 2026-11-23): the funeral parlour's open coffins (the Deluxe on special,
  and Nana's own) shut on any cousin knocked flying into them for 6 s; they can only knock till
  they climb out. *Each map gets its own way to dispose of a relative* (coffin.test.ts).
- **Playing dead** (new, 2026-11-23): once a visit Grandma drops to the floor and peeks (sharp all
  round to 5 m, nothing beyond); she cannot move or touch the will till she gets up. Rude gestures or
  sabotage she sees meanwhile are Dancing on Her Grave, a compliment Gone Too Soon; bot cousins go to
  weep or dance, the bot Grandma tries it now and then. *The darkest joke in the game, and a trap that
  works because the cousins can never be sure she is not really peeking* (playdead.test.ts).
- **Nana's diary:** after the vote, Grandma's private suspicions (who she watched, who she trusted)
  are shown next to the truth. *Lets her enjoy her own wrongness with everyone else.*

## Definition of done for the first playable

- A stranger can open the link, read the README, and get five friends into a match in under five
  minutes; with one friend, bots fill the rest and it is still fun.
- Every check in the Status table plus the new e2e suites passes from a clean clone
  (`npm ci && npm run build && npm test && npm run e2e`), and CI runs them.
- The three reviews have run, every high and medium finding is fixed with a test, and the
  secrecy audit of every message type is written down in `docs/SECRECY.md`.
- The GDD's three gates are measurable in the build: Grandma replay intent, framing accuracy,
  and shoves under 150 ms / 2% loss.
- Pushed to `spaceeshipp-bit/inheritance`, with the Status section here current.
