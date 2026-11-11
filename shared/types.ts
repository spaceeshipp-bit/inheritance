// Core data types shared by server and client.
import type { ItemKey, VisitId } from './constants.js';

export interface Vec3 { x: number; y: number; z: number }

export type Role = 'grandma' | 'cousin';
export type Phase = 'lobby' | 'roles' | 'visit' | 'intermission' | 'reading' | 'vote' | 'results';

/** Movement / body state of a character. */
export type BodyState = 'normal' | 'ragdoll' | 'sleeping';

export interface PlayerInfo {
  id: string;
  name: string;
  isBot: boolean;
  isHost: boolean;
  /** Ticked "Willing to be Grandma" (requires the Grandma tutorial in the full game; free in the prototype). */
  willingGrandma: boolean;
  connected: boolean;
}

export interface CousinInfo {
  id: string;
  name: string;
  color: string;
  /** Their signature item key (always carried unless stolen). */
  item: ItemKey;
  itemName: string;
}

/** One character in a snapshot. */
export interface CharSnap {
  id: string;
  role: Role;
  pos: Vec3;
  /** Facing yaw in radians (0 = -Z). */
  yaw: number;
  /** Camera pitch, for head tilt. */
  pitch: number;
  vel: Vec3;
  state: BodyState;
  /** Seconds left in ragdoll. */
  ragdollT: number;
  /** Entity id of what they hold in their hands, if anything. */
  holding: string | null;
  running: boolean;
  sneaking: boolean;
  whispering: boolean;
  /** Charging a throw, 0..1. */
  charge: number;
  /** Planting progress, 0..1. */
  plant: number;
  /** "Nana's Pet" glow: the current leader. */
  leader: boolean;
  /** Grandma only. */
  parchmentOpen?: boolean;
  aidActive?: boolean;
  aidCooldown?: number;
  specsActive?: boolean;
  specsCooldown?: number;
  specsOff?: boolean;
  caneCooldown?: number;
  summonCooldown?: number;
  /** Last processed input seq for this character's owner (for client reconciliation). */
  ack?: number;
}

export type PropKind = 'heirloom' | 'item' | 'cat' | 'teacup' | 'pills';

export interface PropSnap {
  id: string;
  kind: PropKind;
  pos: Vec3;
  yaw: number;
  /** Who holds it, if anyone. */
  heldBy: string | null;
  /** Heirlooms: broken into shards. */
  broken?: boolean;
  /** Heirloom visual variant (vase, bust, clock, urn, portrait, teapot). */
  variant?: string;
  /** Signature items: whose it is, and whether it has been planted as evidence. */
  owner?: string;
  planted?: boolean;
  /** Grandma has found this planted item. */
  found?: boolean;
  /** Only ever sent to Grandma: this heirloom is her secret Favourite. */
  favourite?: boolean;
}

export interface WishInfo {
  id: string;
  kind: 'fetch-cat' | 'tea' | 'pills';
  text: string;
  endsAt: number;
}

/** A tagged moment (for the Reading of the Will highlight list and achievements). */
export type MomentKind = 'love-you-nana' | 'framed' | 'caught-red-handed' | 'big-cut' | 'favourite-broken';
export interface Moment {
  kind: MomentKind;
  t: number;
  /** Who did it. */
  actor: string;
  /** Who it was done to, if anyone. */
  victim?: string;
  text: string;
}

/** Server-only log of everything that happened, used for scoring and moments. */
/**
 * `seen`: Grandma could identify who did it (soft or sharp vision, line of
 * sight). `sharp`: it happened inside her sharp vision (Caught Red-Handed).
 */
export type LogEvent =
  | { t: number; kind: 'shove'; by: string; victim: string; pos: Vec3; seen: boolean; sharp?: boolean }
  | { t: number; kind: 'break'; by: string | null; heirloom: string; favourite: boolean; pos: Vec3; seen: boolean; sharp?: boolean }
  | { t: number; kind: 'steal'; by: string; item: string; owner: string; pos: Vec3; seen: boolean; sharp?: boolean }
  | { t: number; kind: 'plant'; by: string; item: string; owner: string; pos: Vec3; seen: boolean; sharp?: boolean }
  /** Grandma found a planted item (it was still planted, in this visit). */
  | { t: number; kind: 'found'; item: string; owner: string; plant: number | null; visit: number }
  | { t: number; kind: 'compliment'; by: string; line: string }
  | { t: number; kind: 'tattle'; by: string; accused: string }
  /** A Tut that landed on a cousin linked to a crime (`crime` = log index of it). */
  | { t: number; kind: 'accuse'; target: string; crime: number | null }
  | { t: number; kind: 'will'; target: string; moved: number; via: 'bless' | 'tut' | 'parchment' | 'takeover' }
  | { t: number; kind: 'wish'; by: string; wish: WishInfo['kind'] }
  | { t: number; kind: 'cane'; victim: string }
  /** Family Dinner: Nana noticed this cousin's empty chair. */
  | { t: number; kind: 'left-table'; by: string }
  | { t: number; kind: 'knock-specs'; by: string; seen?: boolean; sharp?: boolean };

export interface MatchOptions {
  /** false = Visit 1 only (first playable); true = Tea, Dinner, Storm. */
  fullMatch: boolean;
  /** Fill empty cousin slots (and Grandma, if nobody volunteers) with bots. */
  fillBots: boolean;
  /** Custom-lobby rule: cousins may shove Grandma (off by default). */
  pushGrandma: boolean;
}

export interface ReadingResult {
  /** Final shares by cousin id. */
  shares: Record<string, number>;
  /** Lowest to highest, for the lawyer's reading. */
  order: string[];
  moments: Moment[];
  /** What Nana Saw: the best moments replayed, the truth beside her perception of it. */
  replays?: Replay[];
  /** Nana's reasons: her biggest decisions, why she made them, and what really happened. */
  reasons?: NanaReason[];
}

/**
 * One of Grandma's will decisions at the reading: what she did, what she had
 * just perceived that explains it, and the truth beside it.
 */
export interface NanaReason {
  target: string;
  via: 'bless' | 'tut' | 'parchment';
  /** Points moved (negative: taken away). */
  moved: number;
  /** Her reason, as she saw it ("found Barnaby's phone where it shouldn't be"). */
  why: string;
  /** What really happened ("Clementine planted it."), or null if her reason was true. */
  truth: string | null;
}

/**
 * What Nana Saw: a few seconds around a moment, ten frames a second: where
 * everyone really was and what they did, beside how Grandma perceived each of
 * them, and what was said beside what she heard. Sent at the reading only.
 */
export interface Replay {
  moment: Moment;
  /** Match time (s) the clip covers. */
  from: number;
  to: number;
  frames: ReplayFrame[];
  speech: ReplaySpeech[];
}

/** How Grandma perceived a character in one frame (her own entry is 'self'). */
export type ReplaySeen = 'self' | 'sharp' | 'soft' | 'shape' | 'heard' | 'none';

export interface ReplayFrame {
  t: number;
  chars: ReplayChar[];
  /** Props that appeared or changed since the previous frame (all of them in the first). */
  props: ReplayProp[];
  /** Grandma's view; null if she was not in the house (a take-over gap). */
  nana: ReplayNana | null;
}

export interface ReplayChar {
  id: string;
  x: number; y: number; z: number;
  yaw: number;
  state: BodyState;
  holding: string | null;
  seen: ReplaySeen;
}

export interface ReplayProp {
  id: string;
  kind: PropKind;
  x: number; y: number; z: number;
  yaw: number;
  broken: boolean;
  heldBy: string | null;
  hidden: boolean;
  /** Which heirloom it is (vase, bust...). */
  variant?: string;
  /** Whose signature item it is. */
  owner?: string;
}

export interface ReplayNana {
  x: number; y: number; z: number;
  yaw: number;
  pitch: number;
  specs: boolean;
  aid: boolean;
  dark: boolean;
  flash: boolean;
}

/** A line spoken in the clip, and what Grandma heard of it (null: nothing). */
export interface ReplaySpeech { t: number; from: string; said: string; heard: string | null }

export interface FinalResult extends ReadingResult {
  /** Sabotage points per cousin (revealed only now). */
  sabotage: Record<string, number>;
  grandmaScore: number;
  /** "Who was actually worst" vote: votes per cousin id, and the winner. */
  votes: Record<string, number>;
  votedWorst: string | null;
  /** Playtest metrics for this match. */
  metrics: {
    plants: number;
    plantsAccusedOwner: number;
    framingAccuracy: number | null;
    shoves: number;
    breaks: number;
  };
}

export type { VisitId };
