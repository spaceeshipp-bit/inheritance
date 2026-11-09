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
export type LogEvent =
  | { t: number; kind: 'shove'; by: string; victim: string; pos: Vec3; seen: boolean }
  | { t: number; kind: 'break'; by: string | null; heirloom: string; favourite: boolean; pos: Vec3; seen: boolean }
  | { t: number; kind: 'steal'; by: string; item: string; owner: string; pos: Vec3; seen: boolean }
  | { t: number; kind: 'plant'; by: string; item: string; owner: string; pos: Vec3; seen: boolean }
  | { t: number; kind: 'compliment'; by: string; line: string }
  | { t: number; kind: 'tattle'; by: string; accused: string }
  | { t: number; kind: 'accuse'; target: string; crime: number | null }
  | { t: number; kind: 'will'; target: string; moved: number; via: 'bless' | 'tut' | 'parchment' }
  | { t: number; kind: 'wish'; by: string; wish: WishInfo['kind'] }
  | { t: number; kind: 'cane'; victim: string }
  | { t: number; kind: 'knock-specs'; by: string };

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
}

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
