# Inheritance

Rich Grandma is rewriting her will, live. One player is Grandma: half-deaf, short-sighted, holding the
quill. Everyone else is a cousin, sweet as pie to her face and ruthless behind her back: break an
heirloom, steal a cousin's signature item and plant it at the scene, shove someone down the stairs, then
tell Nana you love her. Only Grandma moves the will, and only by what she sees and hears. At the end the
will is read, and the replay shows what really happened.

This repository is the first playable: a browser build (TypeScript, Three.js, a Node game server,
WebRTC proximity voice) of the design in [docs/GDD.md](docs/GDD.md). The path to a Steam release is in
[docs/STEAM.md](docs/STEAM.md).

## Play it

You need Node 20 or newer.

```sh
npm ci
npm run build      # typecheck and build the client into dist/client
npm start          # the game server on http://localhost:3000 (PORT=… to change)
```

Open http://localhost:3000, type a name, and **Create a new room**. Share the 5-character room code;
friends type it and press **Join room**. The host presses **Start** with 1 to 8 players; with "Fill
with bots" on (the default), bots take the empty seats up to 5, so one person can play against bots.
Tick "Willing to be Grandma" to be in the draw: Grandma is picked at random from the willing, and
nobody who did not tick it is ever made Grandma (with nobody willing, a bot plays her).

For development, `npm run dev` runs the server (restarting on changes) and the Vite client with hot
reload on http://localhost:5173.

### With friends on your network

Run `npm start` on one computer and have friends open `http://<that computer's address>:3000`.
Browsers only allow the microphone on secure pages (https, or localhost), so on plain http over the
network friends can play and hear voices but not talk. For voice, put the server behind https: a
tunnel or a reverse proxy (next section).

### Over the internet

Expose port 3000 through any tunnel or reverse proxy that serves https and passes WebSockets through
(for example Cloudflare Tunnel, ngrok, or Caddy/nginx with a certificate; check your tool's own
instructions). Then start the server with `TRUST_PROXY=1` so its per-address limits see real players
instead of the proxy:

```sh
TRUST_PROXY=1 npm start
```

Voice connects players directly (WebRTC, with a public STUN server). It works for most home networks;
players behind strict firewalls may not hear each other, and players learn each other's public IP
address. Fixing both needs a TURN relay (not set up yet; see "Known deviations").

## Controls

Press **H** in game for the full list. Gamepads follow the design doc's controller layout.

| | Cousin | Grandma |
| --- | --- | --- |
| Move / look | WASD, mouse | WASD, mouse |
| Run / sneak / jump | Shift / Ctrl (or C) / Space | — |
| Main actions | LMB grab, RMB throw (hold to charge), F shove, E interact, G hold to plant a stolen item | E Bless, Q Tut (aimed at who you look at; scroll to lock a name), LMB cane, RMB hearing aid, F spectacles, R summon, C pin, Tab the parchment (the full will) |
| Talk | Voice (open mic; push-to-talk in settings, default B), Left Alt whisper, Q quick-chat wheel, T tattle wheel, Enter typed chat | Voice, V quick-chat wheel, Enter typed chat |

If Grandma's connection drops, cousins see a prompt: press **J** to take over as Grandma.

## Testing

```sh
npm run typecheck
npm test                     # unit and rule tests (Vitest), including a real server
npm run e2e                  # every end-to-end suite in real Chromium, one client build shared
npm run e2e -- match voice   # only some: match, voice, lobby-voice
```

The suites: `match` plays a whole match in two real browsers, `voice` checks the voice mesh and
the hearing rules on real audio, `lobby-voice` puts three players in one real lobby. They need
Playwright's Chromium (`npx playwright install chromium`), pick free ports in 40000-49999, and
take a while (software WebGL is slow): run them on an otherwise idle machine. CI runs the unit
tests and build on every push, and the e2e suites on pull requests or on demand.

To feel the game on a bad connection, add `?netsim=150,20,2` to the page address (150 ms round trip,
±20 ms jitter, 2% loss), or start the server with `INHERITANCE_NETSIM=150,20,2` for everyone.
`INHERITANCE_FAST=1` shortens every phase, and `INHERITANCE_VISIT_SECONDS=<n>` sets the visit length.

## What is in, and what is not yet

In: the hall and kitchen, Afternoon Tea (and Tea → Dinner → Storm with "full match"), Grandma's
senses (sight bands, hearing bands, hearing aid, spectacles, the Storm's candle and lightning), the live
will with its budget and caps, heirlooms, signature items, stealing and planting, shoves and ragdolls,
wishes, tattling, quick chat, the reading of the will, the family vote, moments, bots for either role,
proximity voice with Grandma's hearing, rejoining, Grandma's lie-down and take-over, settings.

Not yet: the "What Nana Saw" replay, onboarding tutorials, Steam features (see docs/STEAM.md), public
quick-play, block/report/vote-kick, final art and animation (stand-ins until the owner approves a style).

## Known deviations from the design

- **Engine and platform.** The GDD plans Unity on Steam with a player-hosted listen server over Steam
  Networking. This build runs in the browser against a small Node server that is authoritative for
  everything (the GDD's "the host decides what happened").
- **Voice.** The GDD has the host forward each voice only to listeners in range. Here voice is a
  peer-to-peer mesh and each speaker's client sends every listener only what they may hear (Grandma's
  copy already muffled), which keeps the same guarantee: no client receives more than its player may
  hear (docs/SECRECY.md). Peer-to-peer voice exposes IP addresses until a TURN relay is added.
- **Synced bodies.** Characters are synced as positions with simple local ragdolls, not the GDD's
  pelvis-and-limbs sync.

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (how it is built),
[docs/SECRECY.md](docs/SECRECY.md) (what each client is told), [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)
(status and what is next).
