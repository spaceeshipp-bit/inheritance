# Inheritance on Steam: from the web build to a release

Checked on 2026-11-11. Facts about Steam, wrappers and libraries link to the page they were checked against that day. "(uncertain: …)" marks what could not be confirmed. Versions and dates change quickly, so re-check them before relying on them.

## Recommendation

1. **Ship this TypeScript build inside Electron for now, not a Unity port.** Electron bundles Chromium (the browser our tests already use) and Node, so the client, the Node game server and WebRTC voice carry over almost unchanged.
2. **Use steamworks-ffi-node for Steam.** It has the widest coverage and a recent release. Add steamwand.js for Steam Timeline markers, which ffi-node lacks.
3. **Keep the Node server as the referee.** Run it inside the host player's app and send game traffic over Steam Datagram Relay (SDR). This is the GDD's listen-server model: no port forwarding, hidden IP addresses, no server bill. Enforce "Grandma never hosts a public lobby" in code.
4. **Keep WebRTC voice and add a TURN relay (relay-only)** before strangers play together. Steam's voice API cannot give Grandma a pre-muffled copy.
5. **Start with a 1–2 week spike, and start the Steamworks paperwork now.** The spike tests the two real unknowns, the Steam overlay and Steam Deck behaviour in a Chromium wrapper, using Valve's test app ID 480 (the one the bindings' own examples use). The paperwork includes a 21-day wait and tax checks of up to 30 days, and the store page is due in March 2027.

**Why this order:** everything else is ordinary engineering. If the spike shows the overlay or the Deck cannot be made acceptable, Electron still carries the Playtests, and Gate 1 (end of February 2027) becomes the point to decide on the GDD's Unity port with real data.

## 1. Packaging: which wrapper

| | Electron | NW.js | Tauri |
| --- | --- | --- | --- |
| Engine | Chromium, bundled | Chromium, bundled | System webview: WebView2 on Windows, WebKitGTK on Linux |
| Node inside | Yes. `utilityProcess` runs Node in a child process ([docs](https://www.electronjs.org/docs/latest/api/utility-process)) | Yes | No (Rust). Ship Node as a separate "sidecar" program, or rewrite the server |
| WebRTC | Chromium's | Chromium's | On Linux, WebKitGTK needed custom builds ([Tauri #8426](https://github.com/tauri-apps/tauri/discussions/8426)). WebKit closed its bug in July 2026 after moving to libwebrtc ([WebKit 274711](https://bugs.webkit.org/show_bug.cgi?id=274711)) (uncertain: whether Linux distributions ship it) |
| Steam overlay | Works with workarounds (below) | Same approach | Blocked on WebView2, unresolved since 2023 ([WebView2Feedback #4019](https://github.com/MicrosoftEdge/WebView2Feedback/discussions/4019)) |
| Runtime download, measured | v45.3.0 (released 2026-11-10): 124 MB Linux x64 ([zip](https://github.com/electron/electron/releases/download/v45.3.0/electron-v45.3.0-linux-x64.zip)), 158 MB Windows x64 | 0.119.2 (released 2026-10-23): 198 MB Linux x64 ([archive](https://dl.nwjs.io/v0.119.2/nwjs-v0.119.2-linux-x64.tar.gz)), 218 MB Windows x64 | "less than 600KB" for a minimal app ([Tauri](https://v2.tauri.app/start/)), plus the Node sidecar |
| Verdict | **Use** | Fallback | No: voice and the overlay are both at risk |

Our own client build is 4.1 MB (`dist/client`), so the wrapper is nearly the whole download. For a party game, 150–250 MB is unremarkable (opinion).

### Steamworks bindings for Node

The dates are npm publish dates. GitHub commit history could not be read from here, so check each project's issues and recent commits before committing to it.

| Binding | Latest release | Covers | Gaps |
| --- | --- | --- | --- |
| [steamworks-ffi-node](https://www.npmjs.com/package/steamworks-ffi-node) | 0.11.3, 2026-09-24 | Says it targets Steamworks SDK 1.64. Lobbies, rich presence, achievements, overlay calls, Cloud, Steam Input, Networking Sockets (peer-to-peer over the relay), voice, and an experimental Electron overlay | No Timeline in its docs |
| [steamwand.js](https://www.npmjs.com/package/steamwand.js) | 0.6.0, 2026-09-28 | Generated from Valve's description of the whole flat API. Lobbies, rich presence, Cloud, and Timeline since 0.6.0 ([wiki](https://github.com/JDeffner/steamwand.js/wiki/Recording)) | Young project. No networking layer and no Electron overlay (its own README) |
| [steamworks.js](https://www.npmjs.com/package/steamworks.js) (ceifa) | 0.4.0, 2024-08-06 | Achievements, lobbies, rich presence, overlay dialogs, `electronEnableSteamOverlay()` | Its networking mirrors the old `ISteamNetworking` calls (`sendP2PPacket`), which Valve calls deprecated ([networking](https://partner.steamgames.com/doc/features/multiplayer/networking)). No Timeline |
| [@pipelab/steamworks.js](https://www.npmjs.com/package/@pipelab/steamworks.js) | 0.12.2, 2026-06-02 | Maintained fork of the above, adding `ISteamNetworkingMessages` ([client.d.ts](https://github.com/CynToolkit/steamworks.js/blob/main/client.d.ts)) | No Timeline and no Networking Sockets |
| [greenworks](https://github.com/greenheartgames/greenworks) | v0.22.0, released 20 September (2025, inferred from the NW.js version it targets) | Steam SDK 1.62, aimed at NW.js | "maintained on a best-effort basis" |

Both picks call Steam through the koffi FFI library, so there is no C++ build step. The exception is ffi-node's overlay module, which compiles if no prebuilt copy fits ([overlay doc](https://github.com/ArtyProf/steamworks-ffi-node/blob/main/docs/STEAM_OVERLAY_INTEGRATION.md)). In Electron, these native files must stay outside the `asar` archive ([ffi-node README](https://www.npmjs.com/package/steamworks-ffi-node)).

### The Steam overlay (Shift+Tab)

- **Why it is hard:** the overlay injects itself into the game's DirectX, OpenGL, Vulkan or Metal rendering, and it needs steady frames ([overlay](https://partner.steamgames.com/doc/features/overlay)). Chromium draws in a separate GPU process.
- **Electron workaround:** `electronEnableSteamOverlay()` adds Chromium's `--in-process-gpu` switch and repaints every frame ([index.js](https://github.com/CynToolkit/steamworks.js/blob/main/index.js)). Older notes also add `--disable-direct-composition` to stop the overlay showing up white ([notes](https://github.com/JamesMoulang/electron-steam-notes)).
- **steamworks-ffi-node's experimental overlay:** `addElectronSteamOverlay(win)` copies Electron's frames into its own OpenGL or Metal window for Steam to hook. It is tested on Windows, macOS and Deck desktop mode, on X11 only ([doc](https://github.com/ArtyProf/steamworks-ffi-node/blob/main/docs/STEAM_OVERLAY_INTEGRATION.md)).
- **Linux:** in June 2026 a Valve maintainer wrote that the overlay's Linux hook supports X11 with GLX or Vulkan, not EGL. In the same report, `--in-process-gpu` crashed Electron under native Wayland on NVIDIA ([steam-runtime #830](https://github.com/ValveSoftware/steam-runtime/issues/830)).
- (uncertain: whether the overlay appears for an Electron game in Deck Game Mode; no source was found.)

**So make the overlay a nice-to-have.**

- "Join Game" is in the Steam friends list, which is part of the Steam client, not the overlay ([ISteamFriends](https://partner.steamgames.com/doc/api/ISteamFriends)).
- `InviteUserToLobby` sends invites without the overlay ([matchmaking](https://partner.steamgames.com/doc/features/multiplayer/matchmaking)), so an in-game friends list can do the inviting.
- Show our own achievement toasts.

### Steam Deck and Linux

- **How Valve tests:** if a native Linux build exists, Valve tests it first, then the Windows build under Proton, and keeps the better result ([Deck compatibility](https://partner.steamgames.com/doc/steamdeck/compat)). Ship both builds and test both on a Deck.
- **Criteria that touch our code** (same page):
  - Glyphs must match the active input, and the Steam Input API is strongly recommended.
  - Text must be at least 9 px at 1280×800.
  - Text entry must work with a controller alone.
  - The default settings must reach 30 fps at 800p.
- **Controller:** the browser Gamepad API should see Steam Input's virtual controller (uncertain: test on a Deck).
- **Proton:** (uncertain: how Electron performs under Proton; no report was found.)

### Updates and safety

- **Updates:** SteamPipe updates the game and downloads only the changed chunks of about 1 MB ([uploading](https://partner.steamgames.com/doc/sdk/uploading)). Do not ship Electron's `autoUpdater` ([docs](https://www.electronjs.org/docs/latest/api/auto-updater)).
  - Pin one Electron version per release; upgrading it replaces large files, so those patches are bigger (inference).
  - Put the existing `protocol` number into lobby data too, so mismatched builds never meet.
- **Safety:** steamworks.js's example turns `nodeIntegration` on and `contextIsolation` off ([README](https://github.com/ceifa/steamworks.js)), which goes against Electron's security checklist ([security](https://www.electronjs.org/docs/latest/tutorial/security)).
  - Keep Steam calls in the main process, behind a small preload API.
  - Set `devTools: false` for release builds ([webPreferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences)). That stops only casual peeking: secrecy still depends on the server never sending what a player cannot perceive (docs/SECRECY.md).

## 2. Steamworks features mapped to the code

| GDD feature | Steam API | In this code |
| --- | --- | --- |
| Lobbies, codes, quick-play | `CreateLobby`, `JoinLobby`, `RequestLobbyList` with filters. Types: Private, FriendsOnly, Public, Invisible ([ISteamMatchmaking](https://partner.steamgames.com/doc/api/ISteamMatchmaking)) | Replaces the room in `server/room.ts`. Only Public and Invisible lobbies come back from searches, so a code lobby must be one of those, with the code in its lobby data. Every member can read lobby data: no secrets there. |
| Invites, "Join Game" | `ActivateGameOverlayInviteDialog`, `InviteUserToLobby`. A running game gets `GameLobbyJoinRequested_t`; otherwise Steam launches it with `+connect_lobby <id>` ([matchmaking](https://partner.steamgames.com/doc/features/multiplayer/matchmaking)). The rich presence `connect` key enables "Join Game" ([ISteamFriends](https://partner.steamgames.com/doc/api/ISteamFriends)) | The boot path in `client/src/main.ts`, which already auto-joins from `?room=` |
| Rich presence | `SetRichPresence`: `steam_display` (localized tokens), `steam_player_group`, `steam_player_group_size`. At most 30 keys and 256-character values ([ISteamFriends](https://partner.steamgames.com/doc/api/ISteamFriends)) | Public facts only, such as "Visit 2 of 3" |
| Achievements, XP | `SetAchievement` then `StoreStats` ([achievements](https://partner.steamgames.com/doc/features/achievements)) | Decided from the event log (`server/log.ts`) and sent in `results`. A player host is not trusted, so stats are "set by client" and can be cheated. |
| Timeline | `AddInstantaneousTimelineEvent`, `AddRangeTimelineEvent`, `SetTimelineGameMode`, `StartGamePhase` ([ISteamTimeline](https://partner.steamgames.com/doc/api/ISteamTimeline)) | Moments from `server/log.ts`. Recording works with no integration ([Timeline](https://partner.steamgames.com/doc/features/timeline)); markers add titles and suggested clips. That overview still names an older `AddTimelineEvent`, so follow the API reference. |
| Remote Play Together | On automatically for games listed as Local Multiplayer, Local Co-op or Shared/Split Screen. Developers can switch it off ([Remote Play](https://partner.steamgames.com/doc/features/remoteplay)) | Don't tick those features, and confirm it is off. |
| Cloud | Auto-Cloud syncs chosen files with no code ([Cloud](https://partner.steamgames.com/doc/features/cloud)) | Settings live in `localStorage` today (`client/src/settings.ts`). Have the main process write them to a JSON file for Auto-Cloud. XP goes in Stats. |

**Secrecy for achievements and markers:**

- **Achievements:** unlock only on the results screen. A mid-match "Pardon, Dear?" popup would tell Grandma that what she just saw was sabotage.
- **Timeline markers:** assume players can see markers in the overlay mid-match (uncertain: the API page does not say). Add a marker on a player's machine only for moments that player is already told live. This is the rule for `moment` events in docs/SECRECY.md: Grandma gets only Caught Red-Handed and Big Cut.
- **The rest at the reading:** add the remaining markers at the reading, with a negative offset for "an event that happened in the past" ([ISteamTimeline](https://partner.steamgames.com/doc/api/ISteamTimeline)) (uncertain: how far back is allowed).

**Clips metric:** the GDD counts "clips per match" from Timeline markers, but the API cannot list the clips players save; it only offers `DoesEventRecordingExist`. Count markers instead, and ask about clips in the survey.

(uncertain: whether Game Recording captures an Electron window cleanly; test this in the spike.)

## 3. Hosting model

SDR is the pipe and the Node server is the referee, so this is not a choice between them.

| Option | Holds every secret | Players' IPs | Running cost | Verdict |
| --- | --- | --- | --- | --- |
| A. Node server inside the host's app, over SDR | The host | Hidden | None | **Launch** |
| B. Our own dedicated Node servers | Only us | Known to us only | Servers and ops | Later, public lobbies |
| C. Host's app opens a WebSocket port | The host | Host's exposed; needs port forwarding | None | No |
| D. No referee; clients message each other | Every player | Hidden | None | No: breaks secrecy |

### Option A in this code

- **The host's app:** it runs the existing `startServer()` (`server/index.ts`) in a `utilityProcess` on 127.0.0.1, and the host's own window connects as it does today.
- **Connections:** the host calls `CreateListenSocketP2P`, and the other players call `ConnectP2P` with the host's Steam ID. Valve says that is all peer-to-peer play needs, and that "IP addresses are never revealed" ([SDR](https://partner.steamgames.com/doc/features/multiplayer/steamdatagramrelay)). steamworks-ffi-node wraps both ([docs](https://github.com/ArtyProf/steamworks-ffi-node/blob/main/docs/NETWORKING_SOCKETS_MANAGER.md)).
- **The bridge (smallest change):** each player's page keeps talking WebSocket to 127.0.0.1, and a bridge in the main process forwards the messages over SDR. On the host, each SDR connection plugs into the server through the `Conn` interface in `server/room.ts` (`send` and `close`). Start with every message reliable, as with WebSocket today; make snapshots unreliable later.
- **Force relaying:** set `k_ESteamNetworkingConfig_P2P_Transport_ICE_Enable` to `k_nSteamNetworkingConfig_P2P_Transport_ICE_Enable_Disable` ("Do not do any ICE work at all or share any IP addresses with peer"). The default follows each user's own settings ([steamnetworkingtypes.h](https://github.com/ValveSoftware/GameNetworkingSockets/blob/master/include/steam/steamnetworkingtypes.h)) (uncertain: that header is the open-source copy; confirm in the Steamworks SDK).
- **Limits:** SDR traffic is authenticated ([SDR](https://partner.steamgames.com/doc/features/multiplayer/steamdatagramrelay)), so key the limits in `server/limits.ts`, blocks and kicks on Steam IDs instead of IP addresses.
- **If the host quits,** the match ends. Clients still have the public will to read, but the secret log leaves with the host.
- **Plus-One Pass:** (uncertain: how a separate free pass app shares lobbies and relay connections with the main game; ask Valve.)

### What changes for secrecy

- Today only our server holds the whole game. Under option A, the host's computer holds the secret log, the preference cards, the Favourite and every position, and turning off devtools does not stop anyone reading memory.
- So, per the GDD, **the host is never Grandma in public lobbies.** `server/room.ts` currently draws Grandma from any willing human, and lets any willing human take over during her lie-down. Both need a host check.
- A cheating cousin host could still read Grandma's cards and the tally. The GDD trusts the host, which is fair among friends.
- Voice secrecy does not depend on the host: each speaker filters their own voice.
- If public quick-play grows, option B for public lobbies removes the host problem. SDR can front our own servers too, but that needs a key signed by Valve and a conversation with them ([SDR](https://partner.steamgames.com/doc/features/multiplayer/steamdatagramrelay)).

**IP privacy:**

| Traffic | Today | Planned |
| --- | --- | --- |
| Game | Sent to our server, or to the host through a tunnel | Hidden: SDR relay with ICE off |
| Voice | Exposed: WebRTC peer-to-peer reveals every player's public IP | Hidden from players: TURN relay-only (the relay operator still sees them) |

## 4. Voice on Steam

| Option | Grandma's deafness | IPs | Effort |
| --- | --- | --- | --- |
| 1. WebRTC in Electron plus TURN, relay-only | Unchanged: she receives a pre-muffled copy | Hidden | Days |
| 2. Steam's voice API | Weaker between 2 and 10 m | Hidden (sent over SDR) | Weeks |
| 3. Each listener's copy encoded in the page (WebCodecs Opus), sent over SDR | Unchanged | Hidden, no TURN | Weeks |

**Option 1 (recommended).**

- **The change:** add TURN to `iceServers` in `client/src/voice/peer.ts`, which today lists only Google's STUN server, and set `iceTransportPolicy: "relay"` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/RTCPeerConnection)).
- **Who runs the relay:** run coturn ourselves ([coturn](https://github.com/coturn/coturn)), or rent one; Cloudflare charges $0.05 per GB sent to clients ([Cloudflare TURN](https://developers.cloudflare.com/realtime/turn/)).
- **Cost:** about 1 GB per 8-player match-hour, a few cents. This is my own estimate, assuming 7 streams per player at about 40 kbit/s nonstop, so measure the real figure.
- **Credentials:** the small backend the GDD plans should issue short-lived TURN credentials.

**Option 2: what Steam's voice API actually is.** `ISteamUser` records the microphone and hands back compressed voice, but it "does not provide the means" to send it, so the game sends it ([Voice](https://partner.steamgames.com/doc/features/voice)). The format is "arbitrary", and `DecompressVoice` returns 16-bit mono PCM. No call compresses audio the game supplies ([ISteamUser](https://partner.steamgames.com/doc/api/ISteamUser)).

- **Per-listener routing: yes.** We choose who receives each packet, so Grandma can be sent nothing beyond 10 m (the GDD's Dissonance guarantee).
- **Per-listener filtering: no.** Between 2 and 10 m her client would receive clear speech and muffle it itself, and a modified client could undo that. This is weaker than the current build.
- **Echo cancellation:** we would lose Chromium's echo cancellation and noise suppression, which `client/src/voice/mic.ts` uses (uncertain: what processing Steam applies).
- **Open mic:** Valve's guidance is that always-on is "never recommended" for games with more than 4 players ([Voice](https://partner.steamgames.com/doc/features/voice)). That is advice rather than a rule, but it questions the GDD's open-mic default, so watch it in playtests.

**Option 3** keeps today's filtering without TURN, by encoding with WebCodecs `AudioEncoder` (Opus is registered for it, [W3C](https://www.w3.org/TR/webcodecs-opus-codec-registration/)).

- **The catch:** we would then own the jitter buffering and loss concealment that WebRTC does for us now.
- **Unverified:** (uncertain: Opus support in Electron's encoder; check in the spike.)
- **When:** revisit if TURN proves costly or unreliable.

## 5. What changes versus the GDD's Unity plan

- **Same:** a host-authoritative listen server, Steam lobbies, SDR, no dedicated servers, no host migration, Remote Play Together off, the secrecy rules.
- **Engine:** Three.js and our own server physics. Characters sync as positions with local ragdolls, not pelvis and limbs (README deviations). The server ticks at 30 Hz, while the GDD fixes physics at 50 Hz.
- **Steam library:** steamworks-ffi-node and steamwand.js, instead of Facepunch.Steamworks.
- **Voice:** WebRTC with filtering by the speaker, instead of Dissonance with forwarding by the host. That is stronger secrecy, but it needs TURN.
- **Overlay and Deck:** native in Unity; workarounds and open questions here. "Steam Deck Verified" is the riskiest target on this path.
- **If Gate 1 picks Unity,** `shared/`, docs/SECRECY.md and the tests become the port's spec.

## 6. Order of work

These are rough guesses for one experienced developer, not measurements.

| # | Step | Effort | Why now |
| --- | --- | --- | --- |
| 1 | Steamworks signup, fee, bank, tax and identity checks | Paperwork; this month | Waits before the March 2027 store page |
| 2 | Spike on app 480 (Windows, Linux, Deck): overlay, lobby, one SDR link, TURN voice | 1–2 weeks | Settles the unknowns |
| 3 | Electron shell: server in `utilityProcess`, preload API, release flags, SteamPipe scripts, beta branch, CI | 1–2 weeks | Needed for any Steam build |
| 4 | Lobbies, invites, Join Game, rich presence, codes, host-never-Grandma, host-quit ending | ~2 weeks | Core flow |
| 5 | SDR bridge, ICE off, limits keyed on Steam IDs | 2–3 weeks | Hidden IPs |
| 6 | TURN relay and credentials | 3–5 days, plus hosting | Before public Playtests |
| 7 | Achievements and stats at results, filtered Timeline markers, Auto-Cloud | 1–2 weeks | Clips |
| 8 | Deck pass: glyphs, on-screen keyboard, text size, performance preset, Linux build | 2–4 weeks | Deck target |

That is about 3–4 months alongside game work. To make the May 2027 Playtest, aim for a Steam build on a beta branch by April 2027.

## 7. Store and business steps that matter early

- **Signup:** sign the agreements, pay $100 for each app, and complete the bank, tax and identity checks. Tax checks "may take up to 30 days" ([onboarding](https://partner.steamgames.com/doc/gettingstarted/onboarding)). The fee is recouped after $1,000 in adjusted gross revenue ([app fee](https://partner.steamgames.com/doc/gettingstarted/appfee)).
- **Apps:**
  - The main game.
  - The demo, which has its own app ID ([demos](https://partner.steamgames.com/doc/store/application/demos)) (uncertain: whether it costs a fee).
  - The Playtest, which is "completely free" ([Playtest](https://partner.steamgames.com/doc/features/playtest)).
  - The Plus-One Pass, a separate app; the fee is "for each new app" ([app fee](https://partner.steamgames.com/doc/gettingstarted/appfee)) (uncertain: whether a free pass app counts).
- **Timing:**
  - Release at least 21 days after paying the fee, and at least two weeks after a public Coming Soon page goes up ([Steam Direct](https://partner.steamgames.com/steamdirect)).
  - Store review takes 3–5 business days; submit at least 7 days ahead ([releasing](https://partner.steamgames.com/doc/store/releasing)).
  - For a March 2027 page, pay and finish the paperwork by about January.
- **Playtest:** sign-up sits on the main store page, so the page comes first. Review covers capsules and icons only ([Playtest](https://partner.steamgames.com/doc/features/playtest)).
- **Next Fest:**
  - One per game, ever, and no release until it is over.
  - The demo must be public when it starts; submit it 3 weeks ahead, or 5 for the press preview ([Next Fest](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest)).
  - Dates: June 2027 is June 14–21, and October 2027 is not listed yet. The Summer Sale 2027 runs June 24 – July 8 ([events](https://partner.steamgames.com/doc/marketing/upcoming_events)).
- **Early Access:** the game must be playable, with no specific promises about the future and no permanent discount. There can be no discount within 30 days of a price increase ([Early Access](https://partner.steamgames.com/doc/store/earlyaccess)), which matters for the $7.99 → $9.99 step.
- **Deck review:** request it after a standard build review. Unreleased games qualify; demos do not ([Deck compatibility](https://partner.steamgames.com/doc/steamdeck/compat)).

## Questions the spike must answer

1. Does the overlay work on Windows, on Linux under X11, and in Deck Game Mode?
2. Does Game Recording capture the Electron window, with our Timeline markers?
3. Do two players on different networks connect over SDR with ICE off, and at what round-trip time?
4. Does voice connect through TURN with relay-only ICE, and how many GB does a real match use?
5. Does the Gamepad API see Steam Input on the Deck, and does the Deck hold 30 fps at 800p?
