// Every tunable number in the game, taken from the design doc
// ("Inheritance — Game Design Document"). Server and client both import this
// file so the rules can never disagree. Distances are metres, times are seconds
// unless the name says Ms.

export const PROTOCOL_VERSION = 1;

/** Player counts. 1 Grandma + 4–7 cousins. */
export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 8;

/** Simulation. */
export const TICK_HZ = 30;
export const SNAPSHOT_HZ = 20;
/**
 * How the server applies each player's inputs (one per tick, in order; see
 * Match.handleInput). Counts are ticks.
 */
export const INPUT = {
  /** At most this many inputs wait per player (a second's worth); older ones are dropped. */
  queueMax: 30,
  /** A late input is stood in for by repeating the last one for up to this many ticks; then the character waits. */
  repeatMax: 6,
  /** With this many inputs waiting, a player owed ticks takes a second step in a tick. */
  catchUpAt: 2,
  /** Most ticks a player can be owed (ticks spent waiting for input). */
  creditMax: 30,
  /**
   * A client whose clock runs a little fast: if inputs never ran short (always
   * two or more waiting) for this many ticks, one extra step is taken (so at
   * most 1 in 60, under 2% faster, however fast inputs are sent).
   */
  driftWindow: 60,
} as const;
export const GRAVITY = 18;

/** Grandma's senses (one table drives audio, text scramble, HUD and vision). */
export const SENSES = {
  /** 0..clear: hears voices clearly / sees sharp. */
  clear: 2,
  /** clear..muffled: muffled hearing / soft blur. */
  muffled: 6,
  /** muffled..mumble: a mumble that tracks loudness only / heavy blur, silhouettes. */
  mumble: 10,
  /** Half-angle of Grandma's view cone in degrees. Outside it she sees nothing. */
  coneHalfAngleDeg: 55,
  /** Low-pass cutoff at the far edge of the muffled band (Hz), and gain drop (dB). */
  muffledLowpassHz: 800,
  muffledGainDb: -12,
} as const;

export const HEARING_AID = {
  /** Clear hearing range while active. */
  clearRange: 6,
  duration: 6,
  cooldown: 25,
  /** Cousins hear the whistle up to this far. */
  whistleRange: 12,
} as const;

export const SPECTACLES = {
  /** Sharp sight out to this range while active... */
  sharpRange: 8,
  /** ...but in a narrower cone. */
  coneHalfAngleDeg: 30,
  duration: 5,
  cooldown: 15,
  /** A thrown object hitting Grandma faster than this knocks them off. */
  knockOffSpeed: 6,
} as const;

/** Voice ranges for cousins. */
export const VOICE = {
  /** Cousins hear each other with normal falloff out to this range. */
  cousinRange: 15,
  /** Holding Whisper shrinks your voice range to this. */
  whisperRange: 1.5,
} as const;

/** The live will. Shares are integer percentage points that always sum to 100. */
export const WILL = {
  /** Bless / Tut move this many points. */
  quickStep: 5,
  /** Each visit Grandma can move at most this many points in total. */
  budgetPerVisit: 60,
  /** ...and no more than this many points in any rolling window. */
  rollingCap: 20,
  rollingWindow: 30,
  /** Full parchment: 1-point drags, Grandma moves at this fraction of speed. */
  parchmentStep: 1,
  parchmentMoveFactor: 0.3,
  /** The quill scratch is audible this far while the parchment is open. */
  quillRange: 10,
  /** A Tut aimed at a cousin within this many seconds of a crime counts as an accusation. */
  accuseWindow: 10,
  /** "Big Cut" moment threshold, points lost in one opening of the parchment. */
  bigCutPoints: 25,
} as const;

/** Cousin actions. */
export const COUSIN = {
  walkSpeed: 3.6,
  runSpeed: 6.0,
  sneakSpeed: 1.8,
  jumpSpeed: 6.5,
  /** Spoken or wheel compliments count only within this range of Grandma. */
  complimentRange: 2,
  /** Tattle works within this range of Grandma. */
  tattleRange: 3,
  /** Grab / steal / interact reach. */
  reach: 1.4,
  /** Shove reach (+0.15 m slack on the server); a press up to SHOVE_BUFFER s early still lands. */
  shoveRange: 1.45,
  shoveBuffer: 0.25,
  shoveImpulse: 7,
  shoveCooldown: 1.2,
  /** Hold to plant a stolen item. */
  plantHold: 1.5,
  /** Throw speed range (charge 0..1 maps to min..max). */
  throwSpeedMin: 5,
  throwSpeedMax: 13,
  throwChargeTime: 1.0,
  /** Footstep audibility (for Grandma's HUD and bots). */
  footstepRangeRun: 8,
  footstepRangeWalk: 4,
  footstepRangeSneak: 1,
  /** The leader gets "Nana's Pet": footsteps audible this many times as far. */
  leaderFootstepFactor: 2,
} as const;

export const GRANDMA = {
  walkSpeed: 2.2,
  caneRange: 1.8,
  caneImpulse: 6,
  caneCooldown: 3,
  summonCooldown: 30,
  /** Cousins summoned must come within this radius... */
  summonRadius: 4,
  /** ...within this many seconds or Grandma is told who ignored her. */
  summonGrace: 8,
  /** Grandma "finds" an evidence item when it is this close and in her view. */
  findRange: 2.5,
} as const;

/** Ragdoll (floppy) time after a shove, cane whack, or fall. */
export const RAGDOLL_TIME = 1.5;
/** Falling more than this many metres ragdolls you. */
export const FALL_RAGDOLL_HEIGHT = 1.2;

export const HEIRLOOM = {
  /** Count placed per match (out of the map's spawn points). */
  perMatch: 6,
  /** An heirloom breaks when it hits something faster than this. */
  breakSpeed: 4,
  /** Shoving a character into an heirloom's pedestal topples it. */
  topplePushRange: 0.8,
} as const;

/** A crash is a crime scene for this long (for planting evidence and accusations). */
export const CRIME_SCENE = { radius: 3, duration: 20 } as const;

/** Match structure. Visit 1 only in the first playable; full match is optional. */
export type VisitId = 'tea' | 'dinner' | 'storm';
export const VISITS: Record<VisitId, { name: string; duration: number }> = {
  tea: { name: 'Afternoon Tea', duration: 180 },
  dinner: { name: 'Family Dinner', duration: 300 },
  storm: { name: 'The Storm', duration: 240 },
};
export const SLICE_VISITS: VisitId[] = ['tea'];
export const FULL_VISITS: VisitId[] = ['tea', 'dinner', 'storm'];
/** Long enough to read the role card's goal line and the key list (playability review P3). */
export const ROLE_REVEAL_TIME = 12;
export const INTERMISSION_TIME = 20;
export const READING_TIME = 20;
export const VOTE_TIME = 20;
export const RESULTS_TIME = 15;

/**
 * The Storm: the power is out. Grandma carries a candle (she can identify
 * someone within candleClear m and make out shapes to candleDim m); lightning
 * lights the whole house like daylight for a moment.
 */
export const STORM = { lightningEvery: 10, lightningJitter: 2, flashDuration: 0.8, candleClear: 2, candleDim: 3.5 } as const;

/** Wishes (errands). One active at a time, a new one when it is fulfilled or expires. */
export const WISH = { duration: 45, deliverRange: 1.6, gapMin: 4, gapMax: 10 } as const;

/** Disconnects. */
export const DISCONNECT = { cousinRejoin: 90, grandmaLieDown: 15 } as const;

/** Moments (auto-tagged for replays, achievements, Steam Timeline later). */
export const MOMENT = {
  /** Love You, Nana: compliment, then a shove within this many seconds while unseen. */
  loveYouNanaWindow: 5,
} as const;

/** Sabotage points per act, for Grandma's score (server-logged, never shown in-match). */
export const SABOTAGE_POINTS = {
  shove: 1,
  break: 1,
  breakFavourite: 2,
  plant: 2,
  steal: 1,
  knockSpectacles: 1,
} as const;

/** Cousin identities: colour band + signature item. Order = join order. */
export const COUSINS = [
  { key: 'trophy', item: 'Trophy', color: '#e0b100' },
  { key: 'phone', item: 'Phone', color: '#d23c3c' },
  { key: 'sneakers', item: 'Sneakers', color: '#2f80ed' },
  { key: 'briefcase', item: 'Briefcase', color: '#27ae60' },
  { key: 'jacket', item: 'Leather jacket', color: '#8e44ad' },
  { key: 'ring', item: 'Wedding ring', color: '#e67e22' },
  { key: 'trowel', item: 'Trowel', color: '#16a085' },
  { key: 'scarf', item: 'Scarf', color: '#e84393' },
] as const;
export type ItemKey = (typeof COUSINS)[number]['key'];

/** Grandma's secret preference cards (2 drawn per match, only she sees them). */
export const PREFERENCE_CARDS = [
  'Hates whistling',
  'Loves Mittens more than her family',
  'Cannot abide a liar who repeats himself',
  'Thinks anyone who runs indoors is up to something',
  'Adores a cousin who brings tea unasked',
  'Suspects whoever is closest to a crash',
  'Remembers every broken vase',
  'Has a soft spot for the quiet one',
  'Distrusts phones at the table',
  'Never forgives a shove on the stairs',
] as const;

/**
 * What Grandma hears when a cousin's quick-chat line reaches her muffled
 * (2-6 m): a plausible mishearing, picked per line. Same order as QUICKCHAT.cousin.
 */
export const MISHEARD: readonly (readonly string[])[] = [
  ['Shove you, Nana?', 'Glove shoe, banana!', 'Love stew, Nana?'],
  ['It was HYMN!', 'Is it ham?', 'It was tin?'],
  ["I'll pinch your pills!", "I'll stretch your bills!", 'Aisle, fetch the hills!'],
  ['Was it me?', "Wasn't tea!", 'Was then he!'],
  ['You look lumpy today, Nana.', 'Ooh, look, lovely tray, Nana.', 'You cook lovely toast, Nana.'],
  ["Nana, look, I'm a bear!", 'Banana, cook over there!', 'Nana, hook over chair!'],
  ['Starry!', 'Saury?', 'Sari!'],
  ['Kelp!', 'Yelp!', 'Help?'],
];

/** Quick-chat wheel lines (8 per role). Passed through Grandma's hearing like speech. */
export const QUICKCHAT = {
  cousin: [
    'Love you, Nana!',
    'It was HIM!',
    "I'll fetch your pills!",
    'Wasn\'t me!',
    'You look lovely today, Nana.',
    'Nana, look over there!',
    'Sorry!',
    'Help!',
  ],
  grandma: [
    'Speak up!',
    'WHO BROKE THAT?',
    'Come here, dear.',
    'I saw that!',
    'Liar!',
    'Good child.',
    'Where are my pills?',
    'Out of my sight!',
  ],
} as const;

/**
 * Bots (server/bots.ts): how often bot cousins misbehave, their manners around
 * Nana, and how the bot Grandma reacts. Times are for real visits (Afternoon
 * Tea and longer); shorter test visits compress them in proportion.
 */
export const BOTS = {
  /** A bot cousin waits this long (random in between) after each act of sabotage. */
  sabotageGapMin: 20,
  sabotageGapMax: 30,
  /** No sabotage in a visit's opening: this many seconds, or this fraction of a short visit. */
  openingMax: 20,
  openingFrac: 0.15,
  /** The bots' first acts are spread over this long after the opening. */
  openingStagger: 10,
  /** Visits shorter than this compress the bots' timers in proportion, but never below paceFloor. */
  paceVisit: 180,
  paceFloor: 0.25,
  /** No bot picks on the same human again within this long. */
  humanCooldown: 30,
  /** While a human is in their first visit, a bot choosing a victim considers them only this often. */
  newHumanChance: 0.15,
  /** A bot tattles at most once in this long... */
  tattleGap: 30,
  /** ...and compliments Nana at most once in this long (up to half as long again). */
  complimentGap: 15,
  /** A bot free to misbehave follows its compliment with a shove behind her back ("Love You, Nana") this often, times its mischief. */
  loveYouNana: 0.6,
  /** About one plan in six is careless: the bot does not check whether Nana can see it. */
  carelessChance: 1 / 6,
  /** House-wide: bots set out to break at most this many heirlooms a visit, this many seconds apart. */
  breaksPerVisit: 2,
  breakGap: 35,
  /** Bots leave a victim alone while they stand this close to Nana. */
  victimClearOfNana: 2.5,
  /** A bot looking for its stolen item spots it in someone's hands this far away, lying on the floor only this close. */
  spotCarried: 12,
  spotLying: 5,
  /** Once a bot notices its item is gone, the chance it goes looking each time it picks something to do. */
  retrieveChance: 0.35,
  /** Bots do not plant evidence with less than this many seconds of the visit left (Nana would never find it). */
  plantMinLeft: 12,
  /** Evidence left beside Nana goes at least this far round from her facing (radians): out of her view cone... */
  plantBesideMin: 1.75,
  /** ...planted from about this far from her (up to 0.3 m more): outside her sharp sight, within her find range once dropped. */
  plantBesideDist: 2.4,
  /** A careful framer carrying stolen goods keeps this far off while Nana is facing its way (circling to her flank)... */
  holdBack: 7,
  /** ...and if she will not look away for this long, leaves it somewhere else. */
  holdBackPatience: 10,
  /** Nana's personal space: bots never come closer. */
  personalSpace: 1.2,
  /** Compliments are paid from between these distances (she hears clearly within SENSES.clear). */
  complimentMin: 1.3,
  complimentMax: 1.6,
  /** Wishes are handed over from about this far (WISH.deliverRange is the limit). */
  deliverAt: 1.4,
  /** The bot Grandma: chances she reacts to what she perceives. */
  grandma: {
    blessWish: 0.9,
    blessCompliment: 0.7,
    /** She thanks the same flatterer at most once in this long. */
    complimentMemory: 15,
    /** Tut someone she saw misbehave (or saw carrying what then broke or turned up planted). */
    tutSeen: 0.85,
    tutTattle: 0.25,
    tutNearCrash: 0.4,
    tutNearShove: 0.15,
    /** Tut someone she sees carrying another cousin's signature item. */
    tutThief: 0.3,
    /**
     * Whose signature item someone is carrying: each glance, up close (sharp sight) she notices
     * this often; through the blur only when looking right at them (within noticeCone degrees),
     * and this seldom...
     */
    noticeItemSharp: 0.7,
    noticeCone: 30,
    noticeItemSoft: 0.2,
    /** ...and remembers who had it for this long. */
    itemMemory: 15,
    /** Blame the owner of planted evidence she finds, when she has no better suspect. */
    accuseFound: 0.82,
    /** Walk over to look at a crash she heard. */
    investigate: 0.85,
    /**
     * Quick edits she keeps in hand: none for what she saw or found herself,
     * this many for fair grounds (an errand, a thief caught carrying), more for a hunch or a compliment.
     */
    keepInHand: { fair: 1, weak: 2 },
    /** ...and points of the visit's budget she keeps back for what she sees or finds herself. */
    budgetReserve: { fair: 15, weak: 25 },
  },
} as const;
