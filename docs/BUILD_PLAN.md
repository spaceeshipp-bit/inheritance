# Build plan — handoff to finish the first playable

Read this first, then `docs/ARCHITECTURE.md` (the build spec) and `docs/GDD.md` (the design).
This file says where the build stands, what is left, in what order, and the bar each
piece has to clear. Update the "Status" section as you go; it is the project's memory.

## Status (2026-11-11)

The parallel build was cut off by a usage limit after the build phase. Server, client and
voice were all finished by their agents; integration, review and fix never ran.

Verified on this date, from a clean shell:

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc -p tsconfig.json --noEmit` | passes |
| Unit tests | `npm test` | 81 pass (will, senses, scoring, validation, physics, 3 whole bot matches, 20 rule scenarios, real WebSocket server) |
| Production build | `npx vite build` | passes (only three.js chunk-size warning) |
| Voice e2e | `node tests/e2e/voice/run.mjs` | 59/59 (3–4 Chromium pages, fake mics, real WebRTC mesh, Grandma filter bands, whisper, glare, reload) |
| Lobby voice smoke | `npx tsx tests/e2e/lobby-voice.ts` | 3 pages in one real lobby, mesh connected through the game server, no page errors |
| Looks | `tests/e2e/screenshots/real-*.png`, `mock-*.png` | cousin view, Grandma view (blurred), parchment, reading, results all render well |

Fixed during the handoff review (both were secrecy leaks, both now have tests):

- **Moments were broadcast to everyone mid-match**, so Grandma's screen said "Agatha told Nana
  they loved her, then shoved Barnaby". Now a moment goes only to the cousin who earned it;
  Grandma gets only Caught Red-Handed and Big Cut; everything is revealed at the reading.
- **`shove` events carried the shover's id to Grandma's client even when she could not see it.**
  Now `by` is `''` for Grandma unless `canSeeNow()` was true.

Not done yet: everything under "Work remaining".

**Not pushed.** The GitHub repo `spaceeshipp-bit/inheritance` did not exist / was not accessible
when last tried. Call `add_repo` (owner `spaceeshipp-bit`, repo `inheritance`, access `push`)
again; if it still fails, ask the user to create the empty repo and grant the Claude GitHub app
access. Then `git remote add origin … && git push -u origin main`. Push after every milestone
from then on: the container is ephemeral and local commits are the only copy.

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
- **Footsteps she can read:** distinct run, walk and sneak sounds with direction, so she can play
  half the game by ear. *Gives her real evidence that cousins can learn to fool (sneak past).*
- **Forgeable evidence:** ash footprints from the urn lead to whoever walked through; a cousin can
  walk a victim through them. *A second framing tool that she sees with her own eyes.*
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
