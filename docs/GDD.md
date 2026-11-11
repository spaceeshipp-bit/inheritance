# Inheritance — Game Design Document

Nov 8, 2026 · Living copy: [Inheritance — Game Design Document](https://claude.ai/artifact/YUHMTqzckCJjEwrbUuMmUy) (the shared doc is the source of truth; this file is a snapshot for the repo).

Inheritance is a 5–8 player online physics party game for Steam, planned for Early Access in December 2027 at $7.99. One player is a rich, half-deaf Grandma rewriting her will live; everyone else is a grandchild who flatters her face to face and sabotages the others behind her back.

## At a glance

The game sells on one 15-second clip: a cousin hugs Nana, says "love you, Nana," and shoves another cousin down the stairs behind her back.

| | Decision |
| --- | --- |
| Platform | PC on Steam, online only. Mouse and keyboard or controller. Steam Deck Verified as the target. |
| Players | 5–8: one Grandma and 4–7 cousins. A 3–4 player mode with an AI Grandma comes after Early Access. |
| Match length | About 15 minutes: three visits (3 + 5 + 4 min), then the Reading of the Will. |
| Camera and feel | Third person. Characters move normally and go fully floppy for about 1.5 s when shoved, whacked or falling. |
| Price | $7.99 in Early Access, rising to $9.99 at 1.0, announced up front. Free Plus-One Pass for friends. |
| Release | Steam Next Fest in October 2027, Early Access in December 2027, 1.0 about 6–9 months later. |
| Money | Buy once. New houses and modes are free; only cosmetics are paid. No loot boxes. |
| Team | 4 core developers; audio and trailer contracted out. |

## Core rules

The whole game comes from what Grandma can and cannot perceive: to earn favour you must get close to her, and to sabotage you must get away from her.

### Grandma's senses

One table drives the voice audio, the text-bubble scramble, the HUD icons and every Grandma variant.

| Distance from Grandma | What she hears | What she sees (in her view cone) |
| --- | --- | --- |
| 0–2 m | Voices clearly | Sharp |
| 2–6 m | Muffled and quieter | Soft blur |
| 6–10 m | A mumble: someone is talking, not what | Heavy blur, silhouettes and colours only |
| Over 10 m | Nothing (the server does not send the audio) | Shapes only |
| Behind her | Same as above by distance | Nothing |

- **Hearing aid:** clear hearing out to 6 m for 6 s, then a 25 s recharge. It whistles, and cousins hear the whistle up to 12 m away.
- **Spectacles:** sharper sight at distance for a few seconds, but a narrower cone. A thrown object (or a shove, where pushing Grandma is on) can knock them off, leaving her blurry until she picks them up.
- **Crashes always reach her.** A breaking heirloom sends a direction ping to the edge of her screen ("something broke, upstairs-ish").

### The live will

The will is a parchment everyone can see, listing each cousin's share. It is the scoreboard, and Grandma is the only one who can change it.

- **Quick edits:** Bless (+5%) and Tut (−5%) are single presses on the cousin under her reticle, or on a name she has locked. The 5% comes from, or goes to, everyone else in proportion.
- **Big edits:** opening the full parchment (Tab) allows 1% drags. While it is open she moves at 30% speed and the quill scratch is audible 10 m away, so big changes are public moments.
- **Edit budget:** each visit she can move at most 60 percentage points in total (starting value, tune in playtests). No more than 20 points can move in any 30 s, so the end of the Storm cannot decide everything.
- **0% ("disgraced")** can only be set from the full parchment.
- **No hidden values.** Compliments, gifts and errands are worth exactly what Grandma decides. The game never adds or subtracts share on its own.

### Framing and accusing

- Every cousin always carries their own signature item (scarf, phone, sneakers, briefcase). Each has a fixed colour band so it reads at a distance.
- **To frame someone, you steal their item and plant it** at the scene of a crime. Grandma finds it and draws her own conclusions.
- **Accuse:** a Tut aimed at a cousin within 10 s of a crime (or at the owner of an item found at one) is recorded as Grandma blaming them. This feeds replays, achievements and the framing metric.
- **Grandma's Favourite heirloom:** one heirloom per match is secretly her favourite. Breaking it gives her a free Tut outside the edit budget.

### How each side scores

- **Cousins:** the biggest share when the will is read wins. Anyone above 0% is a partial winner; 0% is disgraced.
- **Grandma:** the server secretly records every act of sabotage. Grandma's score is how well her final shares punish the cousins who actually did it.
- **"Who was actually worst" vote:** stays for laughs and XP only, so cousins cannot team up to rig Grandma's score.
- **Pushing Grandma** is off by default. As a Custom Lobby option, it freezes the will as it stands if she falls; achievements are off in Custom Lobbies.

## Roles and controls

Cousins flatter up close and sabotage out of sight; Grandma watches, listens and edits the will without stopping to fiddle with sliders.

### What cousins do

- **Flatter:** spoken compliments within 2 m (or the voiced compliment wheel). Grandma alone judges whether they count.
- **Errands:** Grandma gets random wishes ("fetch Mittens," "my pills," "tea"). Cousins race to fulfil them and trip each other on the way.
- **Gifts:** a flower from the garden, or the flower another cousin was carrying.
- **Sabotage:** break heirlooms, plant stolen items, shove cousins down stairs or into the pond, lock them in the pantry.
- **Tattle:** walk up to Grandma and tell her. The accused usually runs over to argue.
- **Whisper:** hold to shrink your voice range to 1.5 m for talking behind her back.

### What Grandma does

- **Bless / Tut** and the full parchment (see Core rules).
- **"Come here, all of you!":** a summon. Every cousin has to gather round her for an interrogation.
- **Cane whack:** short knockback, for liars or for clearing a crowd.
- **Evidence corkboard:** pin found items and lightning-flash frames to remember them across visits.
- **Two secret preference cards** drawn at the start (for example, "Hates whistling," "Loves Mittens more than her family"). Only Grandma sees them.

### Controls

| Cousin action | Mouse and keyboard | Controller |
| --- | --- | --- |
| Move / camera | WASD / mouse | Left stick / right stick |
| Run (loud) / sneak (quiet) | Shift / Ctrl | Left stick click / B |
| Jump | Space | A |
| Grab or carry (hold) | Left click | Right trigger |
| Throw (hold to charge) | Right click | Right bumper |
| Shove | F | X |
| Interact (errand, gift, lock door) | E | Y |
| Plant a stolen item (hold 1.5 s) | G | D-pad down |
| Compliment wheel (hold) | Q | Left bumper |
| Tattle (within 3 m of Grandma) | T | D-pad up |
| Whisper (hold) | Left Alt | Left trigger |

| Grandma action | Mouse and keyboard | Controller |
| --- | --- | --- |
| Bless / Tut the target | E / Q | Right bumper / left bumper |
| Lock a name | Scroll wheel | D-pad left / right |
| Full parchment | Tab | View |
| Cane whack / hearing aid | Left click / right click | Right trigger / left trigger |
| Spectacles / summon / pin evidence | F / R / C | Y / B / X |
| Quick-chat wheel (hold) | V | Right stick click |

Voice is open mic with a noise gate and echo cancellation by default, so hands stay on movement. Push-to-talk is optional and remappable; on Steam Deck it defaults to the R4 back button.

### HUD

- **Cousins:** a mini-will (your row highlighted), the **Nana Senses** pair (an eye and an ear showing whether she can see or hear you right now), the current wish with its timer, your stolen-item slot, and an arrow to Grandma when she is off screen.
- **Grandma:** the parchment always open on the left edge with the locked name glowing, a blur on distant things, crash direction pings, cooldown rings and her two preference cards.

### Onboarding

1. **First launch:** a 4-minute cousin practice visit against a scripted Grandma: compliment her, break a vase, steal a scarf and plant it. Skippable.
2. **Grandma tutorial (3 min):** unlocks after that. Bot cousins misbehave while she learns spectacles, the hearing aid and Bless/Tut under pressure.
3. **First 3 online matches:** contextual prompts, with tooltips on the Nana Senses icons.

### Who plays Grandma

Only players who have finished the Grandma tutorial can tick "Willing to be Grandma." Grandma is picked at random from volunteers, with lower odds for last match's Grandma. Nobody is ever forced; with no volunteer, the lobby keeps waiting. Rotating Grandma is a lobby option the host can switch on: the lowest-share cousin who has finished the tutorial and volunteered becomes the next Grandma, never a Plus-One guest.

### Steam Deck

- Full Steam Input button prompts, readable text at 1280×800, and the on-screen keyboard for names and codes.
- A Deck preset at 40 fps with at most 12 ragdolls active at once. Physics runs at a fixed 50 Hz regardless of frame rate.

## A match, minute by minute

One 6-player match runs about 16 minutes from lobby to rematch, and every visit escalates what Grandma can and cannot perceive.

1. **0:00 Lobby.** The host opens a Steam lobby and invites friends. The lobby is Grandma's front hall: players flop around, pick their cousin and test their mic by talking into an old gramophone.
2. **1:30 Roles.** Grandma privately draws two preference cards ("Hates whistling," "Loves Mittens more than her family"). Each of the 5 cousins starts at 20%.
3. **2:00 Visit 1, Afternoon Tea (3 min).** A gentle warm-up with few heirlooms and lots of errands. Wish: "Fetch Mittens." Two cousins grab the cat at once and Mittens goes flying into the teapot. Grandma sees a blur, hears "it was DEV" clearly from 1.5 m, and Tuts both of them.
4. **5:00 Intermission (20 s).** The will is shown. The leader gets the "Nana's Pet" glow, which makes their footsteps audible twice as far.
5. **5:20 Visit 2, Family Dinner (5 min).** Everyone has to stay near the table; sabotage happens under it and on bathroom trips. Priya leans in with "love you, Nana" while kicking Sam's chair, and Sam goes face-first into the soup. Grandma fires the hearing aid and everyone freezes at the whistle.
6. **10:20 Visit 3, The Storm (4 min).** The power flickers and Grandma is almost blind in the dark. Every 20 s or so, a lightning flash gives her 0.5 s of sharp vision. One flash catches Dev mid-shove at the top of the stairs, and she pins the frame to her corkboard. "I was CATCHING him!"
7. **14:20 Reading of the Will (about 2 min).** The family lawyer reads the shares from lowest to highest. Then the three best moments of the match replay, then the "who was actually worst" vote.
8. **16:20 Rematch.** The lobby carries over and the game suggests a new Grandma from the volunteers.

## Online play on Steam

Every match is a Steam lobby run by one player's PC, with the game's own proximity voice chat: no dedicated game servers, and no Remote Play Together.

### Getting into a game

- **Friends (the main way):** invite from the Steam overlay, or click "Join Game" on a friend in the Steam friends list.
- **Lobby code:** 5 characters from A–Z and 2–9, excluding I and O, to share in Discord. Streamer Mode hides it.
- **Public quick-play:** filtered by region and language, mic required. It starts when the lobby has 8 players, or after 60 s with at least 5 and a Grandma volunteer who is not the host.

### Host and network model

- **Host:** the player who made the lobby runs the match (a listen server) over Steam Networking Sockets, routed through Steam Datagram Relay. Relay handles NAT and hides players' IP addresses.
- **The host decides what happened.** Every shove, break and plant is a host event written to a log. That log, not the physics, drives scoring, replays, achievements and Steam Timeline markers.
- **What is synced:** upright characters as simple positions; fallen characters as pelvis plus 4 limbs at 20 Hz, plus hands while they hold items. Heirlooms, doors, the pantry lock and Grandma's spectacles are synced. Shards, splashes and limb flop are local only.
- **Secrets stay secret:** preference cards go only to Grandma's machine. In public lobbies Grandma is never the host, so she never holds the full game state.
- **No host migration at launch.** If the host drops, the will is read as it stands and the lobby re-forms.

### Proximity voice

- **Stack:** Dissonance voice chat in Unity, with the host forwarding each voice stream only to listeners in range. In public lobbies Grandma never hosts, so she never receives audio from more than 10 m away and a modified client cannot undo her deafness. In private lobbies among friends she may host.
- **Cousins hear each other** with normal falloff out to about 15 m, quieter through walls.
- **Grandma's mix** follows the senses table: clean, then a low-pass filter sweeping down to about 800 Hz with −12 dB, then a mumble that tracks only loudness.
- **Defaults:** open mic with noise gate and echo cancellation, plus a "wear headphones" prompt.
- **Discord:** a loading-screen tip says "Leave your Discord call. Nana can't hear Discord." The game cannot enforce this, so in-game voice has to be where the fun is.

### Playing without a mic

- **Quick-chat wheel:** 8 voiced lines per role, passed through Grandma's hearing like real speech. Cousins get lines like "Love you, Nana!" and "It was HIM!"; Grandma gets "Speak up!" and "WHO BROKE THAT?"
- **Text bubbles:** shown over the speaker's head and run through Steam's text filter. For Grandma, letters scramble with distance ("I l#ve y*u N@na", then "…").
- **Typing has a cost:** you are stuck in a "looking at your phone" pose and can be shoved.

### Disconnects

- **A cousin drops:** their character naps on the sofa with the share frozen. They have 90 s to rejoin; after that, they stay asleep and their share stays frozen until the reading, though Grandma can still edit it.
- **Grandma drops:** a 15 s "lie-down" pause, during which a tutorial-finished volunteer can take over; otherwise the will is read as it stands.
- **Fewer than 3 cousins remain:** the will is read as it stands.

### Remote Play Together: not enabled

Remote Play Together streams the host's single screen to everyone and carries voices over Steam's own chat. That would show cousins exactly what Grandma sees and skip her hearing filter, so the Steamworks feature stays switched off.

### Safety with strangers

- Per-player mute (voice and text), a one-click "mute all strangers," and an option to start strangers muted.
- A block list by Steam account; blocked players are kept out of your public lobbies.
- Vote-kick by majority; the host can also kick in private lobbies.
- **Report** mutes and blocks the player and sends their Steam ID and a timestamp. The shipped game never uploads voice.
- **Age rating:** answer Steam's content survey honestly about unmoderated voice chat with strangers and slapstick violence toward an elderly character. Steam's ratings are its own, not IARC or ESRB; those only matter for a later console release.

## Content and modes

Early Access ships one polished house and one Grandma; everything else is a free update, because a party game breaks when one friend does not own the new map.

### Early Access launch

- **Harrowgate Manor:** the grand staircase, the heirloom gallery, the kitchen, the dining room and the garden with the koi pond.
- **8 cousins**, each with a clear silhouette and a signature item: trophy, phone, sneakers, briefcase, leather jacket, wedding ring, trowel, scarf. No gameplay perks yet.
- **Grandma, Nana Dot:** the baseline senses from Core rules.
- **Randomised every match:** about 25 wishes (some chained, such as "find my glasses" then "now read me the crossword"), 20 preference cards, and 15 heirlooms in the house, one of them secretly her Favourite.
- **Custom Lobby:** switches for pushing Grandma and visit lengths. Presets share as 6-character codes. Achievements are off in Custom Lobbies.

### After Early Access launch

| Addition | What it changes |
| --- | --- |
| Shady Pines Retirement Home | No stairs: a wheelchair ramp and a slow lift to the basement laundry. Four resident NPCs tattle but name the wrong cousin half the time. |
| The Lake House | A moored houseboat that tilts when 3 or more players crowd one side. Going overboard replaces the stairs; wet cousins leave a 30 s drip trail. |
| Great-Aunt Hawk | A Grandma variant who hears clearly only within 1 m and has no hearing aid, but sees sharply to 15 m and has long-zoom opera glasses. |
| Grandpa Colonel | Hears clearly to 5 m, blurry past 4 m. Can bark "ATTENTION!" every 60 s to freeze cousins for 2 s, but has no full parchment: only Bless and Tut, and a Tut on a cousin at 5% or less disgraces them. |
| Doorbell events | One per visit: the Vicar drops in as a second witness, the cat escapes, or Grandma's old flame calls and takes her attention for 45 s. |
| Family lawyer NPC | A Custom Lobby option: he wanders the house and reports sabotage he sees, clearly, at any distance. |
| Cousin perks | Small trade-offs that never change share values directly, e.g. the sneakers run 15% faster with louder footsteps. Can be switched off. |
| Nana-Bot mode | 3–4 players against an AI Grandma that reacts to loudness, crashes, footsteps and an emote-based sweet-talk wheel. |
| Sunday Roast mutator | A weekly rule change sent from the server, no patch: "Everyone's Whispering," "Grandma's Birthday," "Power Cut." |

### Seasonal Family Gatherings

Free updates about every 3 months, timed to Steam's seasonal sales:

- **Halloween, The Séance:** Grandma is already a ghost, possessing furniture and finishing the will through a Ouija board.
- **Winter, Christmas at Nana's:** Secret Santa assigns who gives to whom, so you can rig someone else's gift; the chimney is the new staircase.
- **Spring, The Wedding:** Grandma remarries, and a step-grandpa NPC competes for the estate and has to be framed too.
- **Summer, Reunion BBQ:** a garden-only map with water balloons and a grill.

Steam Workshop is not planned for launch. Custom houses would need tuning of Grandma's sightlines and errand routes that players cannot easily do.

## Price and Steam features

Price Inheritance at $7.99 in Early Access and $9.99 at 1.0: the buying decision is a whole friend group, so it belongs with the cheap, easy-yes party games.

| Comparable Steam game | Base price (USD) |
| --- | --- |
| [Among Us](https://steamdb.info/app/945360) | $4.99 |
| Content Warning | $7.99 |
| [PEAK](https://steamdb.info/app/3527290) | $7.99 |
| [Lethal Company](https://steamdb.info/app/1966720) | $9.99 |
| [Golf With Your Friends](https://www.steampulse.org/game/431240) | $14.99 |
| [Gang Beasts](https://steamdb.info/app/285900) | $19.99 |
| [Party Animals](https://steamdb.info/sub/917099) | $19.99 |

[Goose Goose Duck](https://store.steampowered.com/app/1568590/Goose_Goose_Duck/) is free to play. Use Steam's suggested regional pricing, and keep room for 50–60% seasonal sales later.

### Free Plus-One Pass

A separate free Steam listing, like [Split Fiction's Friend's Pass](https://store.steampowered.com/app/3052150), lets a friend join someone who owns the game.

- One owner per 4 players: a 5-player game needs 1 purchase, a 6–8 player game needs 2. With one owner, that owner hosts and plays Grandma.
- Guests play only in private lobbies with an owner, cannot host and can never be Grandma.
- Guests earn no XP. Grandma is the reason to buy.

Not free-to-play: free throwaway accounts plus proximity voice with strangers would invite abuse, and free-to-play needs a constant cosmetics store. A 48-hour free weekend about 3 months after launch gives the reach without that (free weekends need Valve's approval). Content Warning shows the effect: about 6.2M players claimed it during its 24-hour free launch, and it then sold about 2.2M copies at $7.99 within two months.

### Steam's cut and break-even

- Valve takes 30% of revenue up to $10M, 25% from $10M to $50M, and 20% above that. Each lower rate applies only to revenue past its threshold.
- The $100 Steam Direct fee is paid back once the game earns $1,000.
- A full-price US sale at $7.99 returns about $5.59 before refunds. After regional pricing, sales tax and refunds, plan on roughly $5 per sale.
- At $5 per sale, every $100k of budget needs about 20,000 sales to break even.

### Cosmetics

- **Earned by playing:** cousin outfits, emotes ("clutches pearls," "fake sob"), cane toppers, spectacle frames, and the ink and wax seal on the will.
- **Paid:** a $4.99 supporter pack at launch (3 outfits and the soundtrack), then $2.99 themed packs. No loot boxes, no premium currency.
- **Readability rule:** a cosmetic never changes a hitbox, weight, footstep volume, or a signature item's outline and colour band. A tartan scarf must still read clearly as that cousin's scarf.

### Family Tree progression

- Levels 1–50, cosmetic unlocks only. Every gameplay tool, including the corkboard and preference cards, is available from the first match.
- XP: +100 for finishing a match, +2 per point of final share, a Grandma bonus based on her score, and a +75 "Rotten Apple" bonus for the cousin voted worst, so chaos earns XP too.
- Your tree grows a branch per level and shows in the lobby. Level 50 offers a "New Generation" prestige that resets to 1 and adds a portrait frame.
- XP lives in Steam Stats, with settings, keybinds and loadouts in Steam Cloud.

### Achievements

About 25 at launch. Examples:

1. **Love You, Nana:** compliment Grandma, then shove a cousin within 5 s while she cannot see you.
2. **It Was Like That When I Got Here:** break an heirloom and get another cousin accused of it.
3. **Sole Heir:** finish with 100% of the will.
4. **Written Out:** finish with 0%.
5. **Pardon, Dear?:** as Grandma, catch a sabotage while the hearing aid is on.
6. **Pantry Pariah:** spend an entire visit locked in the pantry.
7. **Spectacle Spectacle:** knock off Grandma's glasses and get her to accuse the wrong cousin.
8. **Saint:** win without a single act of sabotage.
9. **Mittens First:** as Grandma, leave the biggest share to whoever fetched the cat most.
10. **Family Reunion:** play 10 matches with the same three Steam friends.

### Trading cards and clips

- **Trading cards:** prepare an 8-card "Family Portraits" set, profile backgrounds and emoticons (:nana:, :brokenvase:), but do not promise them. Valve only enables cards once a game passes an undisclosed bar for sales and activity.
- **Steam Game Recording:** the game adds Timeline markers for shoves, heirloom crashes and big will changes, so every "love you, Nana" moment is one click to clip.

## Getting found on Steam

Inheritance sells through short clips of dramatic irony, so the game is built to make, capture and share them, and the store page exists early enough to catch the viewers.

### Designing for clips

- **"What Nana Saw" replays:** built from the host's event log plus 10 Hz position snapshots, kept for each tagged moment. They play split screen: Grandma's blurry, muffled view on top, what really happened underneath. Stacked like that, the frame is already vertical for TikTok and Shorts.
- **Tagged moments**, each also a Steam Timeline marker:
    - *Love You, Nana:* a compliment, then a shove within 5 s while she cannot see you.
    - *Framed:* a planted item leads to an accusation of its owner.
    - *Caught Red-Handed:* sabotage inside her sharp vision.
    - *Big Cut:* a cousin loses 25 points or more in one opening of the full parchment.
- **The ending is the highlight reel:** the Reading of the Will plays the top 3 moments before the vote.
- **Voice in clips is opt-in.** Opted-in voice lives only in the player's local clip buffer; everyone else's voice plays through the garbled "Nana hearing" filter.
- **Export:** at Early Access, players clip through Steam Game Recording using the markers. A one-button in-game MP4 export (vertical and widescreen, with a caption and a "Wishlist on Steam" watermark) comes after launch.

### Streamer features

- **Streamer Mode** hides lobby codes and Steam names (everyone becomes "Cousin Beatrice" and so on). All music is original and safe to stream.
- **Chat as the family lawyer** when the streamer plays Grandma: chat sees the whole map and votes on who to accuse; every 60 s the top suspect appears on her corkboard with chat's confidence. This needs balancing so Grandma does not become all-seeing.
- **Chat picks the wishes** when the streamer plays a cousin: a 3-option poll every 45 s. Wishes apply to all cousins equally.
- Twitch integration comes after Early Access launch; YouTube later.

### Store page

- **Capsule art:** Nana, huge, in a wingback chair, squinting through thick glasses with the will in hand. One grinning cousin hugs her knee while holding a vase over another cousin's head. It must read as "grandma, vase, smile" at thumbnail size.
- **Trailer, first 5 seconds**, subtitled so it works muted:
    1. 0:00 A cousin hugs Nana: "love you, Nana."
    2. 0:02 The camera drifts behind them; the cousin's free hand shoves another cousin down the stairs.
    3. 0:04 The parchment slams in: DEREK 22% → 58%, with a quill scratch.
    4. 0:05 Title card. No logos before the gameplay.
- **Short description:** "Nana is rewriting her will — live. Compliment her, fetch her pills, then shove your cousin down the stairs while she isn't looking. A 5–8 player physics party game: one player is a half-deaf Grandma, everyone else is a grandchild with a plan."
- **Tags, in this order:** Party Game, Physics, Multiplayer, Funny, Comedy, Social Deduction, PvP, Dark Humor, Third Person, Casual, Indie, Cartoony. "Online PvP" is a store feature set separately, not a tag.

### Playtest, demo and Next Fest

- **Store page live in March 2027**, with a 30-second teaser. Steam Playtest's sign-up button sits on the store page, so it must exist first.
- **Steam Playtest waves** (48 hours each, so lobbies fill): May 2027; July 2027 after the Summer Sale; and Grandparents Day weekend, September 10–12, 2027, with a "Call your Nana" push.
- **Demo, "A Short Visit":** the ground floor and grand staircase, Visit 1 and the full Reading of the Will. Dinner, the Storm and the garden stay for the full game. No AI Grandma: during Next Fest, developers host daily "Open House" lobbies so solo players get into games. The end screen says "The power's about to go out. Wishlist to stay for dinner."
- **Next Fest: October 2027** (dates not yet announced). A game gets one Next Fest ever and must release after it; the demo goes in for review at least 3 weeks before (5 weeks to be in the press preview). June 2027 (June 14–21) is too early to use our one shot.

### Wishlists and launch

- **Targets:** about 10,000 wishlists going into Next Fest and 30,000+ at launch (an indie rule of thumb, not Valve data). Under 10,000 after Next Fest means moving the launch rather than launching cold.
- **Early Access launch: early December 2027**, about two weeks before the Winter Sale (2027 dates not yet published). Friend groups find it over the holidays, when families really are visiting Grandma. Steam emails wishlisters automatically on launch day.

## Production

Build it in Unity 6 with a host-authoritative design, and prove in the first 3 months that playing Grandma is fun before any money goes into art.

> Repo note: this repository's first playable is a TypeScript web build (Three.js + Node + WebRTC) so it can be built, tested and played in a browser today. See `docs/STEAM.md` for how that relates to the Unity plan below.

### Engine and tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Engine | Unity 6 | The genre's recent hits (Human Fall Flat, Lethal Company, Content Warning) were built in Unity, so ragdoll, voice and Steam plugins are proven. |
| Netcode | FishNet (or Netcode for GameObjects) | Host-authoritative listen server. Neither has built-in host migration, which is why the game does not migrate hosts at launch. |
| Steam connection | Facepunch.Steamworks | Lobbies, invites, Steam Networking Sockets over Datagram Relay, achievements, Stats, Cloud and Timeline. |
| Voice | Dissonance | Each speaker plays through a Unity audio source, so Grandma's client can add the distance-driven filter; the host culls out-of-range streams. |
| Backend | One small, budgeted service | Reports, the weekly mutator config and playtest telemetry. No accounts of our own. |

Unreal's physics offers more fidelity than the game needs and adds a 5% royalty past $1M in revenue. Godot's voice and Steam tooling is thinner for 8-player networked physics.

### First playable (end of month 3)

A grey-box front hall, grand staircase and kitchen; Visit 1 only; 5 players; 6 heirlooms; 4 signature items; the live will, cane, tattle and summon. It must pass three gates:

1. **Grandma is fun:** at least 60% of Grandma players volunteer to play her again.
2. **Framing reads:** Grandma accuses the framed cousin in 30–50% of plants. Higher means framing is too strong; lower means it is pointless.
3. **Shoves feel good** at 150 ms latency and 2% packet loss, simulated from week 1.

If Grandma fails two rounds of testing, make Rotating Grandma the default and redesign her role before spending on art.

### Team

Four core people: a networking and physics engineer, a gameplay engineer, a designer-programmer and a 3D artist. Audio and the trailer are contracted out. With one artist, Early Access scope stays at one house and one Grandma.

### Top risks

| Risk | Mitigation |
| --- | --- |
| Grandma is less fun than the cousins | A wish or event pings her about every 30 s; she has her own score; her view is the default spectator camera so idle players watch her. Gate 1 above. |
| Friend groups stay on Discord and skip the deafness | Make in-game voice the fun part (whisper, muffling, clips with voice); loading tips. Cannot be enforced. |
| Networked physics desync | The host owns the result and scoring comes from events, not physics. Every build runs with a network simulator on and a desync counter in the debug display. |
| Needing 5+ people to test anything | Scripted bot cousins by week 4; fixed 6-person sessions twice a week; a Discord pool of 50+ testers from month 4. |
| Public lobbies do not fill | Low price, Steam Playtest waves, developer-hosted lobbies; bot cousins to backfill are an open question. |
| Voice toxicity with strangers | Friends-only lobbies by default, mute-all-strangers, block list, vote-kick, reporting. |
| Scope creep | Early Access is one house, one Grandma, no perks, no Workshop, no Twitch, no MP4 export. |

### Playtest metrics

Record every playtest session (with signed consent) and run a 3-question survey after each match. Track:

- Grandma replay rate
- Framing accuracy (how often she accuses the framed cousin)
- Leader-flip rate: the Visit 2 leader should win no more than 55% of matches
- Clips per match, counted from Timeline markers

Gut check: if nobody laughs in the first 90 seconds of Visit 1, the errands are too dull.

## Roadmap

Early Access lands in December 2027, behind two go/no-go gates. Phases are not to scale.

| Phase | When | What |
| --- | --- | --- |
| Prove it | Nov 2026 – Feb 2027 | Grey-box house, Visit 1 only, 5 players |
| **Gate 1: Grandma is fun** | end of Feb 2027 | 60% replay as Grandma; framing lands 30–50%; shoves fine at 150 ms; fail twice → redesign her |
| Build it | Mar – Sep 2027 | Store page (Mar); full mansion, all 3 visits; Playtests May, Jul, Sep |
| Show it | Oct – Nov 2027 | Next Fest demo; wishlist push |
| **Gate 2: 10k wishlists** | after Next Fest | short of it → move the launch |
| Early Access | Dec 2027 | Launch at $7.99; one house, one Grandma |
| Grow to 1.0 | 2028 | Free houses and Grandma variants; 1.0 Jun–Sep 2028 at $9.99 |

Gate 1 settles whether Grandma's role works before any art spending; Gate 2 moves the launch if wishlists are short of 10,000 after Next Fest.

## Open questions

- [ ] **Deaf and hard-of-hearing players:** a game built on hearing needs captions or speech-to-text for proximity voice. How do we do it without giving Grandma perfect hearing?
- [ ] **Disgraced cousins:** what does a cousin at 0% do for the remaining visits so they stay in the game?
- [ ] **Spectators:** what can idle or disgraced players say on voice while watching Grandma's view, so they cannot relay what she sees?
- [ ] **Backfill:** do public lobbies need bot cousins or join-in-progress once player numbers drop?
- [ ] **Edit budget:** is 60 percentage points per visit right? Tune it against the leader-flip target.
- [ ] **Streamer chat as lawyer:** how much information can chat give Grandma before she becomes all-seeing?
- [ ] **Moderation:** who reviews reports, what a ban means, and what the UK Online Safety Act and EU Digital Services Act require for voice chat with strangers. Needs a privacy policy covering Steam IDs and telemetry.
- [ ] **Localisation:** voiced quick-chat lines per language, and whether the quick-play language filter splits the player pool too thinly.
- [ ] **Accessibility beyond hearing:** colour-blind-safe signature colour bands, and motion-sickness options for the ragdoll camera.
- [ ] **Tone:** art direction guardrails for slapstick toward Grandma, so the game stays cartoonish rather than cruel.
- [ ] **Budget:** funding, runway and the break-even sales number for the actual team cost.
- [ ] **Versions:** how the demo, the full game and the Plus-One Pass (three Steam apps) keep builds and lobbies compatible.

## Sources

- [Steamworks: Voice](https://partner.steamgames.com/doc/features/voice)
- [Steamworks: Steam Datagram Relay](https://partner.steamgames.com/doc/features/multiplayer/steamdatagramrelay)
- [Steamworks: ISteamTimeline](https://partner.steamgames.com/doc/api/ISteamTimeline)
- [Steamworks: Steam Playtest](https://partner.steamgames.com/doc/features/playtest)
- [Steamworks: Next Fest rules](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest)
- [Steamworks: June 2027 Next Fest](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/june_2027)
- [Steamworks: Steam Deck compatibility](https://partner.steamgames.com/doc/steamdeck/compat)
- [Steam popular tags list](https://store.steampowered.com/tagdata/populartags/english)
- [PC Gamer: Steam sale dates for the first half of 2027](https://www.pcgamer.com/games/steam-reveals-all-the-sale-dates-and-themed-events-for-the-first-half-of-2027/)
- [PC Gamer: Remote Play Together](https://www.pcgamer.com/steam-remote-play-together-is-now-available-to-try-in-beta)
- [PC Gamer: Steam Trading Cards confidence metric](https://www.pcgamer.com/big-changes-are-coming-to-steam-trading-cards/)
- [TechCrunch: Steam revenue share tiers](https://techcrunch.com/?p=1753729)
- [Presskit.gg: how much Steam takes](https://presskit.gg/field-guides/how-much-does-steam-take)
- [GamesRadar: Content Warning free launch and sales](https://www.gamesradar.com/games/co-op/turns-out-you-can-give-away-66-million-copies-of-your-game-add-a-price-later-and-still-sell-22-million-more-in-just-2-months)
- [Split Fiction Friend's Pass on Steam](https://store.steampowered.com/app/3052150)
- Comparable game prices: SteamDB pages linked in the price table
