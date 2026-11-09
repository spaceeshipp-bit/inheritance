# Inheritance — first playable: architecture and build spec

This repo is the **first playable** from the design doc (`docs/GDD.md`): a grey-box
Harrowgate Manor (front hall, grand staircase, heirloom gallery, kitchen, pantry),
5–8 players online (1 Grandma + cousins, bots fill empty slots), Visit 1
(Afternoon Tea) by default with an optional full match (Tea, Dinner, Storm), the
live will, Grandma's senses, framing, accusing, the Reading of the Will, the
"who was worst" vote and Grandma's score.

It is a browser game: **TypeScript + Three.js** client, **Node + ws** authoritative
server, **WebRTC** proximity voice. The same code can ship on Steam later
(Electron + steamworks.js); see `docs/STEAM.md`.

## Layout

```
shared/        Rules and data used by BOTH sides. Pure, no DOM, no Node APIs.
  constants.ts   Every tunable number from the design doc.
  types.ts       Data types (snapshots, log events, results).
  protocol.ts    WebSocket messages (ClientMsg / ServerMsg).
  senses.ts      Grandma's hearing/vision bands, voice filter params, text scramble.
  will.ts        The live will: Bless/Tut, parchment sets, budget, rolling cap.
  scoring.ts     Grandma's score.
  map.ts         Grey-box geometry (boxes, the stair ramp, spawn points) + groundHeight().
server/        Node game server (authority).
  index.ts       HTTP (serves dist/client in production) + WebSocket at /ws, PORT env (default 3000).
  room.ts        A room = a lobby code. Players, host, options, rejoin tokens, RTC relay, starts a Match.
  match.ts       One match: phases, fixed-step simulation, rules, events, reading, vote, results.
  physics.ts     Characters and props vs. the map: walking, stairs, gravity, knockback, ragdoll, throws.
  bots.ts        Bot cousins and a bot Grandma.
  log.ts         The secret event log, moments, sabotage tally, metrics.
client/        Browser client (Vite root).
  index.html
  src/main.ts    Boot: name/room screen → lobby → match → results → lobby.
  src/net.ts     Typed WebSocket client, reconnect with token, clock sync (ping/pong).
  src/state.ts   Snapshot buffer + interpolation (render ~100 ms behind) + own-player prediction.
  src/input.ts   Keyboard/mouse (pointer lock) + Gamepad API → InputMsg at TICK_HZ, plus action keys.
  src/render/    Three.js scene: map, characters (procedural, floppy when ragdolled), props, cameras.
  src/hud/       DOM overlays: lobby, mini-will, parchment, Nana Senses, wish, quick-chat wheel, bubbles, toasts, reading/vote/results.
  src/audio/     Synthesised SFX via WebAudio (no asset files): crash, quill, whistle, footsteps, cane, ding.
  src/voice/     WebRTC mesh + proximity audio graph with Grandma's filter (see "Voice").
tests/unit/    Vitest: rules, physics, a whole bot-only match fast-forwarded.
tests/e2e/     Playwright (plain `playwright` package, pre-installed): real browsers vs. a real server.
```

Imports between folders use relative paths with `.js` extensions
(e.g. `import { WILL } from '../shared/constants.js'`) so both Vite and `tsx` resolve them.

## Server

- **Rooms:** clients connect to `/ws` and send `hello {name, room, protocol, token?}`. Room codes are
  5 characters from A–Z and 2–9 excluding I and O; an empty room string creates a new room. The first
  player is host. `welcome` returns a token; sending it again in `hello` within `DISCONNECT.cousinRejoin`
  seconds rejoins the same player.
- **Lobby:** players tick "Willing to be Grandma"; the host sets options (`fullMatch`, `fillBots`,
  `pushGrandma`) and sends `start`. Start needs 5+ players counting bots (with `fillBots` the server adds
  bots up to 5). Grandma = random among willing humans, lower odds for last match's Grandma; if no human
  volunteers and `fillBots` is on, a bot Grandma; otherwise start is refused with an error explaining why.
  Nobody is ever forced to be Grandma.
- **Match loop:** fixed step at `TICK_HZ`; snapshots at `SNAPSHOT_HZ`. `Match` must be steppable without
  timers (`match.step(dt)` with an injected clock) so tests can fast-forward a full match.
- **Phases:** `roles` (ROLE_REVEAL_TIME) → for each visit: `visit` (VISITS[v].duration) then
  `intermission` (INTERMISSION_TIME, skipped after the last visit) → `reading` (READING_TIME) → `vote`
  (VOTE_TIME) → `results` (RESULTS_TIME) → back to `lobby`. The will budget resets each visit.
- **Physics (physics.ts):** characters are capsules (radius 0.35, height 1.7) moving on `groundHeight()`;
  boxes with `solid` block horizontally when their top is above `y + stepUp`; the stair ramp is solid from
  y=0 up to its surface (you can't walk under it). Gravity `GRAVITY`. Knockback (shove / cane) sets
  velocity and `ragdoll` for `RAGDOLL_TIME` (no control while ragdolled). Falling more than
  `FALL_RAGDOLL_HEIGHT` ragdolls you. Shoving someone at the top of the stairs or by the gallery rail
  sends them down. Props: point bodies with gravity, simple bounce, rest on boxes. A carried prop follows
  its carrier's hands. A thrown or falling heirloom that hits anything faster than `HEIRLOOM.breakSpeed`
  breaks; a character ragdolled into a pedestal topples its heirloom.
- **Cousin actions:** grab/carry (primary held, within `COUSIN.reach`), throw (secondary: charge then
  release), shove (edge, `shoveRange`, cooldown), interact (deliver a wish item to Grandma within
  `WISH.deliverRange`; steal another cousin's signature item from within reach — it moves to your hands;
  pick up a planted item), plant (hold `plantHold` s while holding someone else's signature item → it is
  dropped as planted evidence at your feet; it is a crime scene plant if within `CRIME_SCENE.radius` of a
  crash in the last `CRIME_SCENE.duration` s), quick-chat lines, typed chat, tattle (within `tattleRange`).
  Every cousin starts carrying their own signature item "on them" (not in hands; it shows on the body).
  The owner can take a planted item back with interact.
- **Grandma actions:** move at `GRANDMA.walkSpeed` (× `WILL.parchmentMoveFactor` while the parchment is
  open), cane (primary edge: knockback a cousin within `caneRange` in front of her), hearing aid
  (secondary edge), spectacles (shove key edge), Bless/Tut/set via `grandma` messages (validated with
  `shared/will.ts`), parchment open/close (quill events to cousins within `WILL.quillRange` while open),
  summon (cooldown; after `summonGrace` s tell her who is outside `summonRadius`), pin (marks a found item).
  Grandma "finds" a planted item when it is within `GRANDMA.findRange` and `canSee()` → `found` event.
- **Accuse:** a Tut aimed at a cousin within `WILL.accuseWindow` s of a crime they are near, or at the
  owner of a found planted item, is logged as an accusation (`accuse` log event).
- **Wishes:** one at a time from `fetch-cat` (Mittens the cat wanders and can be carried), `tea` (teacup
  from the kitchen counter), `pills` (spawn at a random `SPAWNS.pills`). Delivering it (interact near
  Grandma while carrying it) sends `wish-done` to everyone. **No automatic will change**: Grandma decides.
- **Text:** bubbles go to everyone; for Grandma the server scrambles text with `scrambleText()` using
  `hearingBand(distance)` (whisper = speaker range 1.5 m). Quick-chat compliments ("Love you, Nana!",
  "You look lovely today, Nana.") within `complimentRange` of Grandma are logged as compliments.
- **Secrets:** preference cards and the `favourite` flag go only to Grandma. Sabotage tallies are never
  sent until `results`.
- **Moments (log.ts):** Love You, Nana (a compliment then a shove by the same cousin within 5 s while
  Grandma cannot see them); Framed (an accusation of the owner of a planted item); Caught Red-Handed
  (sabotage while `canSee()`); Big Cut (a cousin loses ≥ `WILL.bigCutPoints` in one parchment opening);
  Favourite broken. Broadcast as `moment` events and listed in the reading.
- **Scoring:** `SABOTAGE_POINTS` per act → `grandmaScore()`; the vote is for laughs only.
- **Disconnects:** a cousin who drops sleeps on the spot (`state: 'sleeping'`), share frozen, can rejoin
  with their token; Grandma drops → 15 s pause where a willing human may take over (first to send
  `lobby {willingGrandma:true}`), else the will is read as it stands. Fewer than 3 cousins connected
  (bots count) → read the will.
- **Bots:** cousin bots wander between rooms, fulfil wishes, compliment Grandma, and sometimes shove,
  break heirlooms, steal and plant when Grandma can't see them. The bot Grandma wanders the hall, turns
  toward crashes and voices, Blesses compliments/wish deliveries she witnesses and Tuts sabotage she sees
  or items she finds (respecting the budget). Bots exist so one human can test either role.
- **RTC relay:** `rtc` messages are forwarded to `to` if in the same room. Send `peers` (all connected
  human ids in the room except the recipient) on join/leave.

## Client

- **Screens:** title (name + room code or "create room"), lobby (players, willing-Grandma toggle, host
  options and Start, mic test meter), match, results. URL `?room=CODE&name=NAME` pre-fills and auto-joins.
- **Cameras:** cousins get a third-person orbit camera (pointer lock). **Grandma gets first person** with a
  field of view matching her cone, so she cannot see behind her.
- **Grandma's view:** what she sees follows `visionBand()`: sharp ≤ 2 m; soft blur 2–6 m; heavy blur
  6–10 m (silhouettes, colour bands unreadable); beyond, shapes only. Implement with distance fog plus
  per-character material degradation (colour band and item hidden past `soft`) plus a screen-space blur
  that grows with depth (or an equivalent). Spectacles narrow the FOV and sharpen; knocked-off spectacles
  blur everything. The Storm: dark with lightning flashes. Crash pings at the screen edge point toward the
  crash. She sees **scrambled bubbles** (the server already scrambled them).
- **Cousin HUD:** mini-will (own row highlighted, arrows on change), **Nana Senses** (eye: seen clearly /
  blurry / unseen; ear: clear / muffled / silent — computed from Grandma's snapshot with `shared/senses.ts`
  and your whisper state), the current wish + timer, your item status ("On you" / "Stolen" / "Planted"),
  an arrow to Grandma when off screen, cooldown on shove, plant progress ring.
- **Grandma HUD:** parchment always visible on the left (names, shares, locked name glowing), budget and
  rolling-cap meters, cooldown rings (cane, aid, spectacles, summon), her two preference cards, found
  evidence list (pin with C), summon-ignored notices. **Tab** opens the full parchment: per-cousin +/− and
  drag in 1-point steps (sends `grandma set`), shows remaining budget, closing it ends the "opening".
- **Bless/Tut targeting:** the cousin under her crosshair (raycast, within 10 m and identifiable), else
  the locked name (scroll wheel / D-pad cycles the lock).
- **Controls** exactly as the design doc's tables (cousin: WASD, mouse, Shift run, Ctrl sneak, Space jump,
  LMB grab, RMB throw, F shove, E interact, G plant, Q quick-chat wheel, T tattle wheel, Left Alt whisper,
  Enter typed chat; Grandma: E Bless, Q Tut, scroll lock name, Tab parchment, LMB cane, RMB hearing aid,
  F spectacles, R summon, C pin, V quick-chat wheel). Gamepad via the Gamepad API with the doc's layout.
  Voice is open mic with noise gate by default; optional push-to-talk on a key in settings.
- **Interpolation:** render remote entities ~100 ms behind using the snapshot buffer; predict your own
  movement with the same movement code as the server (put shared kinematic movement in `shared/` if
  needed) and reconcile on `ack`.
- **SFX:** synthesised with WebAudio, positional (PannerNode) for crash, footsteps, quill, whistle, cane,
  shove "oof", wish "ding". Grandma hears SFX through the same distance filter as voices.
- **Ragdoll look:** while `state === 'ragdoll'`, limbs flop (procedural springs), body tumbles in the
  direction of velocity. Characters are built from primitives: torso, head, arms, legs; a colour band
  (sash) in the cousin's colour; the signature item visible on the body or in hand.

## Voice (client/src/voice/)

```ts
export interface VoiceSpeaker { id: string; pos: Vec3; whispering: boolean }
export interface VoiceManager {
  /** Ask for the mic (open mic + noise gate). Resolves micOk=false if denied/unavailable; voice still receives. */
  start(opts: { selfId: string; send: (to: string, data: RtcSignal) => void }): Promise<{ micOk: boolean }>;
  /** Server `peers` message: open/close connections so we hold one per peer (lower id offers). */
  setPeers(ids: string[]): void;
  handleSignal(from: string, data: RtcSignal): void;
  /** Every frame: listener and speaker positions. Applies Grandma's filter when selfRole === 'grandma'. */
  update(p: { selfRole: 'grandma' | 'cousin' | 'lobby'; listenerPos: Vec3; listenerYaw: number; aidActive: boolean; speakers: VoiceSpeaker[] }): void;
  /** Whisper / push-to-talk state for our own mic. */
  setWhisper(on: boolean): void;
  setPushToTalk(mode: boolean): void;
  setTalkKey(down: boolean): void;
  /** Voice activity 0..1 for a peer (mouth flap, speaking icon) and for ourselves (mic meter). */
  level(id: string | 'self'): number;
  setMuted(id: string, muted: boolean): void;
  stop(): void;
}
export function createVoice(): VoiceManager;
```

Audio graph per remote peer: `MediaStreamAudioSourceNode → BiquadFilter (lowpass) → GainNode → PannerNode
(HRTF) → destination`. Cousins: normal falloff to `VOICE.cousinRange`, zero beyond; a whispering speaker
is zero beyond `VOICE.whisperRange`. Grandma: `grandmaVoiceFilter()` drives cutoff and gain (the 6–10 m
"mumble" keeps loudness only). Chrome needs each remote stream also attached to a muted `<audio>` element
for WebAudio to receive it. In the lobby everyone hears everyone at full volume (mic check).
STUN: `stun:stun.l.google.com:19302`. Note for the GDD: the GDD wants the host to cull audio Grandma
should not hear; in this P2P prototype the filter is client-side (known deviation, documented).

## Testing

- `npm test` — Vitest unit tests: will rules, senses, scoring, physics (stairs, falls, knockback), and a
  whole bot-only match fast-forwarded through every phase asserting invariants (shares always sum to 100,
  budget never exceeded, results produced).
- `npm run e2e` — builds, starts the server on a free port, opens Chromium pages (fake mic via
  `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`): one Grandma, one or more cousins,
  bots fill the rest; drives inputs; asserts the match reaches results; saves screenshots to
  `tests/e2e/screenshots/`.
