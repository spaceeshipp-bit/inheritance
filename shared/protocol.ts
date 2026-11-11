// WebSocket protocol between the browser client and the game server.
// JSON messages, one object per frame, discriminated by `t`.
// The server is the authority on everything; clients send intents.
import type {
  CharSnap, CousinInfo, FinalResult, MatchOptions, Phase, PlayerInfo, PropSnap,
  ReadingResult, Role, Vec3, VisitId, WishInfo, Moment,
} from './types.js';

// ───────────────────────── Client → Server ─────────────────────────

/** Sent at TICK_HZ while in a match. Buttons are "held" booleans; the server detects edges. */
export interface InputMsg {
  t: 'input';
  seq: number;
  /** Desired move in camera space: x = strafe right, z = forward. Each -1..1. */
  move: { x: number; z: number };
  /** Camera yaw (radians, 0 = -Z) and pitch. Characters face their camera yaw. */
  yaw: number;
  pitch: number;
  run: boolean;
  sneak: boolean;
  jump: boolean;
  whisper: boolean;
  /** Cousin: grab/carry (held). Grandma: cane (edge). Left mouse / RT. */
  primary: boolean;
  /** Cousin: charge throw while held, release to throw. Grandma: hearing aid (edge). Right mouse / RB or LT. */
  secondary: boolean;
  /** Cousin: shove (edge). Grandma: spectacles (edge). F / X or Y. */
  shove: boolean;
  /** Cousin: interact - deliver wish item, steal an item, pick up evidence (edge). E / Y. */
  interact: boolean;
  /** Cousin: plant held stolen item (hold PLANT_HOLD seconds). G / D-pad down. */
  plant: boolean;
}

export type GrandmaAction =
  | { a: 'bless'; target: string }
  | { a: 'tut'; target: string }
  | { a: 'set'; target: string; value: number }
  | { a: 'parchment'; open: boolean }
  | { a: 'summon' }
  | { a: 'pin'; item: string };

export type ClientMsg =
  | { t: 'hello'; name: string; room: string; protocol: number; /** Rejoin token from a previous welcome. */ token?: string }
  | { t: 'lobby'; willingGrandma?: boolean; options?: Partial<MatchOptions> }
  | { t: 'start' }
  | InputMsg
  | ({ t: 'grandma' } & GrandmaAction)
  /** Quick-chat wheel line (index into QUICKCHAT[role]). */
  | { t: 'quick'; line: number }
  /** Typed chat (text bubble over your head). */
  | { t: 'chat'; text: string }
  /** Tattle on a cousin (must be within tattle range of Grandma). */
  | { t: 'tattle'; accused: string }
  | { t: 'vote'; target: string }
  /** WebRTC signalling, relayed by the server to `to` within the same room. */
  | { t: 'rtc'; to: string; data: RtcSignal }
  | { t: 'ping'; ts: number };

export type RtcSignal =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit | null };

// ───────────────────────── Server → Client ─────────────────────────

export interface SnapMsg {
  t: 'snap';
  /** Server match time in seconds. */
  time: number;
  tick: number;
  chars: CharSnap[];
  props: PropSnap[];
  /** Current shares by cousin id. */
  shares: Record<string, number>;
  /** Will points Grandma can move right now: { budget, rolling } (sent to everyone; cousins see the bar too). */
  willAvail: { budget: number; rolling: number };
  /** The Storm: power out right now, and lightning flash active. */
  dark: boolean;
  flash: boolean;
}

export type GameEvent =
  /**
   * An heirloom broke. Everyone hears it. For Grandma: `favourite` is set,
   * and when she did not see it `heirloom` is '' and `pos` is only rough.
   */
  | { e: 'crash'; pos: Vec3; heirloom: string; favourite?: boolean }
  | { e: 'quill'; pos: Vec3 }
  | { e: 'whistle'; pos: Vec3 }
  | { e: 'will'; target: string; moved: number; via: 'bless' | 'tut' | 'parchment' | 'takeover'; reason?: string }
  /** Rejected will change (Grandma only): out of budget, rolling cap, needs parchment... */
  | { e: 'will-rejected'; target: string; reason: string }
  /**
   * A speech bubble. For Grandma `text` is what she heard (misheard or
   * scrambled when muffled); `from` is '' when she could not see who spoke,
   * and then `pos` says roughly where it came from.
   */
  | { e: 'bubble'; from: string; text: string; quick: boolean; whisper: boolean; pos?: Vec3 }
  | { e: 'wish'; wish: WishInfo | null }
  | { e: 'wish-done'; by: string; wish: WishInfo }
  /** Grandma found a planted item. Grandma only. */
  | { e: 'found'; item: string; owner: string; pos: Vec3 }
  | { e: 'tattle'; from: string; accused: string }
  | { e: 'summon'; pos: Vec3; endsAt: number }
  /** Grandma only: who ignored her summon. */
  | { e: 'summon-ignored'; ids: string[] }
  /** For Grandma: only within earshot; `by`/`victim` are '' unless she could see them, `pos` rough if unseen. */
  | { e: 'shove'; by: string; victim: string; pos: Vec3 }
  | { e: 'cane'; victim: string; pos: Vec3 }
  | { e: 'specs-off'; pos: Vec3 }
  | { e: 'lightning' }
  | { e: 'moment'; moment: Moment }
  | { e: 'toast'; text: string };

export type ServerMsg =
  | { t: 'welcome'; you: string; token: string; room: string; protocol: number }
  | {
      t: 'error'; message: string;
      /** The server refused this connection or its hello (limits, full, bad code...): stop reconnecting and show it. */
      refused?: boolean;
    }
  | {
      t: 'lobby'; room: string; players: PlayerInfo[]; hostId: string; options: MatchOptions; phase: Phase;
      /** Only to players who are not in the running match (joined mid-match, replaced, or back too late). */
      inProgress?: MatchInProgress;
    }
  /** Sent to each player when a match starts. `prefCards` only for Grandma. */
  | {
      t: 'match';
      role: Role;
      grandmaId: string;
      cousins: CousinInfo[];
      names: Record<string, string>;
      visits: VisitId[];
      prefCards?: string[];
      options: MatchOptions;
    }
  | { t: 'phase'; phase: Phase; visit: VisitId | null; endsAt: number; time: number }
  | SnapMsg
  | ({ t: 'ev' } & GameEvent)
  | { t: 'reading'; result: ReadingResult }
  | { t: 'results'; result: FinalResult }
  /**
   * Room members you should hold a voice connection with. While a match runs, its
   * participants pair only with each other and everyone else only with each other.
   */
  | { t: 'peers'; ids: string[] }
  | { t: 'rtc'; from: string; data: RtcSignal }
  | { t: 'pong'; ts: number; time: number };

export function encode(msg: ClientMsg | ServerMsg): string {
  return JSON.stringify(msg);
}

/**
 * The running match as seen from the lobby by someone not in it. Public facts
 * only: the phase, its clock, and the will (names and shares are public).
 */
export interface MatchInProgress {
  phase: Phase;
  visit: VisitId | null;
  /** Match clock (seconds) when this phase ends, and the match clock now. */
  endsAt: number;
  time: number;
  /** The live will by cousin id. */
  shares: Record<string, number>;
  /** Names of the cousins in `shares`, and of Grandma. */
  names: Record<string, string>;
  grandmaId: string;
}

/** WebSocket close codes the server uses (4000-4999 are for applications). */
export const CLOSE_CODES = {
  /** Another connection joined with this player's rejoin token (usually a second tab). Never redial on it. */
  replaced: 4000,
  /** The server refused or timed out this connection; an `error` with `refused` says why when it can. */
  refused: 4001,
} as const;
