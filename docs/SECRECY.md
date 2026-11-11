# Secrecy audit: what each player's client is told

Grandma's ignorance is the game. A cousin who can see the sabotage tally, or a
Grandma whose client knows who is behind her, breaks it, and anything a client
receives can be read from the browser console. So the rule is the one in
`docs/BUILD_PLAN.md`: **before anything goes on the wire to a player, ask
whether they would know it from their own eyes and ears.** If not, it is not
sent. This file lists every message the server sends, who gets it and what is
filtered, and the risks that remain. Audited 2026-11-11 against `server/match.ts`,
`server/room.ts` and `client/src/voice/`; tests are named where they pin a rule.

Players in a match are Grandma and the cousins; everybody else in the room
(joined mid-match, replaced, back too late) is a spectator in the lobby.

## Snapshots (`snap`, 20 a second)

| To | Contents | Filtered |
| --- | --- | --- |
| Cousins | Every character (position, facing, state, what they hold, charge, plant progress, whispering), every prop not hidden, the will, the budget left, darkness and lightning | One snapshot is shared by all cousins, except each cousin's own entry: `ack` (how far the server has got with their inputs) goes only to its owner, and while the server is guessing a late player's ticks, that player's own entry shows where they were before the guess (`Match.snapshots`, inputs.test.ts). Items show `planted` (cousins can see an item lying where it should not), never `found`. Heirlooms never show which is the Favourite. |
| Grandma | Built from her senses (`grandmaSnapshot`, perception.test.ts) | A character she can neither see nor hear (footsteps by gait, voices to the mumble range) is left out. One she perceives but cannot identify (out of sharp sight, in the dark, behind her) has `holding`, `charge`, `plant` and `whispering` stripped. A prop is included only if she can see it (an item only if she can identify it); a held prop only if she can identify the holder. `planted` shows only once she has found it. Her own cooldowns are hers alone. Line of sight goes through `shared/sight.ts` (walls, the stair underside; railings do not block). |

## Events (`ev`)

| Event | To | Filtered |
| --- | --- | --- |
| `shove` | Cousins: all of it. Grandma: only within earshot (mumble range) | `by` only if she could see the shover, `victim` only if she can identify them, the position rounded to the metre when she did not see it (perception.test.ts). |
| `crash` | Everyone | Grandma gets the heirloom and exact position only if she saw it; otherwise a rough position and no heirloom. She always learns when her Favourite broke (she owns it; it also earns her a free Tut). |
| `bubble` (quick chat, typed chat) | The speaker; cousins within earshot (whisper range when whispering); Grandma by her hearing | Grandma gets what she heard: clear, misheard into a real phrase (quick chat, `MISHEARD`), or scrambled with a per-match secret (typed); nothing when silent. `from` is `''` unless she can see the speaker, then a rough position (perception.test.ts). |
| `tattle` | The tattler, Grandma, cousins within earshot | Only possible within `COUSIN.tattleRange` of her and when she can hear it (a whisper from too far is refused). |
| `will` | Everyone (the will is public) | The free Tut's `reason: 'favourite'` only to Grandma (match.test.ts). The take-over split is a public will change. |
| `will-rejected`, `found`, `summon-ignored` | Grandma only | `found` reveals an item's owner only when she finds it in front of her. |
| `moment` | The cousin who earned it; Grandma only Caught Red-Handed (she saw it) and Big Cut (she did it) | Favourite Broken and Framed are held back to the reading (match.test.ts). |
| `quill`, `whistle` | Cousins within `WILL.quillRange` / `HEARING_AID.whistleRange` of her | — |
| `cane`, `specs-off`, `summon`, `lightning`, `wish`, `wish-done` | Everyone | Public slapstick and public weather; a wish is handed over in front of her. |
| `toast` | Mostly one player | The broadcasts (a cousin dozed off, Nana's lie-down and return, a take-over, a visit begins, Nana fell over, the will is read) are things everyone sees. |

## Everything else

| Message | To | Notes |
| --- | --- | --- |
| `match` | Each player | Grandma's preference cards only to Grandma. Cousin names and signature items are public. |
| `phase`, `reading`, `results` | Players | The reading and results reveal everything, by design, after the match. |
| `lobby` | Everyone in the room | Spectators also get `inProgress`: the phase, its clock and the live will (public facts only; room-limits.test.ts). |
| `peers`, `rtc` | Voice groups | While a match runs, its players pair only with each other and spectators only with each other; the signalling relay enforces it (room-limits.test.ts). |
| `welcome`, `error`, `pong` | That connection | Rejoin token only to its owner. |

## Voice

Each speaker's own client sends every listener only what that listener may hear
(`client/src/voice/rules.ts` `sendTarget`; voice-rules.test.ts and
`tests/e2e/voice/run.mjs` in real browsers). Grandma's copy of a cousin's voice
is already muffled, mumbled or silent by distance and her hearing aid; whispers
are cut past `VOICE.whisperRange` for everyone; a cousin's copy is cut past
`VOICE.cousinRange` plus 1 m. So no client receives more than its player may
hear, and mouth flaps and speaking icons, which use the received level, show
only that. Each speaker can only reveal more of themselves, never of others.

## Residual risks (accepted, or open)

- **Identity of a blur.** A character Grandma perceives but cannot identify
  keeps its id in her snapshot, so it can be drawn and interpolated smoothly. A
  modified client could label the blur. Pseudonyms per unidentified stretch
  would make that harder, though position continuity still links them. Open, low.
- **IP addresses.** Voice is peer-to-peer, so players learn each other's public
  IP addresses from ICE candidates (review S21). Hiding them needs a TURN relay
  with relay-only candidates; see the README.
- **A cousin's own client** decides what it sends of its own voice; a modified
  one could send Grandma more (only of itself, which hurts that cousin).
- **Debug hooks** stay in the build on purpose: `window.__inh` (this client's
  state, net, input, renderer, settings) and `window.__voiceDebug` (this
  client's voice graph). They expose only what this client already received.
  The bot Grandma reads the server's secret log (review S19); it runs on the
  server, not on anyone's client.
