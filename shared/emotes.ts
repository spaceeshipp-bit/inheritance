// Gestures and dances. Cousins have a gesture wheel (Z) and a dance wheel (X):
// sweet ones (heart hands, crocodile tears, a jig, a tea-party twirl) count as
// flattery if Nana clearly sees them aimed at her; rude ones (a raspberry, the
// bird, a moon, measuring her for a coffin, dancing on her grave) are noted if
// she catches you, and are the best thing in the replays when she doesn't.
// Grandma has her own: shaking her cane, "I'm watching you", a fake faint.
//
// An emote plays until it ends, or until you move, act or fall over. The will
// never moves on its own: what Nana makes of it is up to Nana.
import type { Role } from './types.js';

export type EmoteId =
  // Cousin gestures
  | 'heart-hands' | 'crocodile-tears' | 'raspberry' | 'nose-thumb' | 'the-bird' | 'moon' | 'coffin-measure' | 'money-count'
  // Cousin dances
  | 'will-jig' | 'tea-twirl' | 'gold-digger' | 'grave-stomp' | 'funeral-march' | 'hip-replacement'
  // Grandma gestures
  | 'cane-shake' | 'watching-you' | 'wag-finger' | 'clutch-pearls' | 'blow-kiss' | 'fake-faint'
  // Grandma dances
  | 'charleston' | 'the-twist' | 'still-alive';

/** The synthesised sound an emote makes when it starts (dances loop their tune). */
export type EmoteSound =
  | 'aww' | 'sob' | 'raspberry' | 'nyah' | 'bleep' | 'tape' | 'kaching'
  | 'jig' | 'waltz' | 'shimmy' | 'stomp' | 'dirge' | 'creak'
  | 'oi' | 'hmm' | 'tsk' | 'gasp' | 'kiss' | 'thud' | 'ragtime' | 'twist' | 'fanfare';

export interface EmoteDef {
  id: EmoteId;
  /** Wheel label. */
  name: string;
  kind: 'gesture' | 'dance';
  who: Role;
  /** How long it plays (s) unless cut short. */
  secs: number;
  /** Rude: noted if Nana sees it aimed at her. Sweet: counts as flattery if she sees it. Neither: just for show. */
  tone: 'rude' | 'sweet' | 'show';
  /** Censored: drawn with a pixelated block over the offending part. */
  censored?: boolean;
  sound: EmoteSound;
  /** The pop of text above the head ("PFFBT!"). */
  pop: string;
  /** For captions: "Agatha {does}" ("blows a raspberry"). */
  does: string;
  /** For the reading: "Agatha {did} behind Nana's back" ("blew a raspberry"). */
  did: string;
  /** For Nana's reasons: "saw Agatha {saw}" ("blow a raspberry at her"). */
  saw: string;
  /** Told to whoever it is aimed at: "Barnaby {atYou}" ("measures you for a coffin."). */
  atYou: string;
  /** Aimed with your back (a moon): its target is behind you. */
  away?: boolean;
}

const E = (d: EmoteDef): EmoteDef => d;

export const EMOTES: Record<EmoteId, EmoteDef> = {
  // ── Cousin gestures ──
  'heart-hands': E({ id: 'heart-hands', name: 'Heart Hands', kind: 'gesture', who: 'cousin', secs: 2.6, tone: 'sweet', sound: 'aww', pop: '♥', does: 'makes a heart with their hands', did: 'made heart hands', saw: 'make heart hands at her', atYou: 'makes a heart at you. Aww.' }),
  'crocodile-tears': E({ id: 'crocodile-tears', name: 'Crocodile Tears', kind: 'gesture', who: 'cousin', secs: 3.2, tone: 'sweet', sound: 'sob', pop: '*sob*', does: 'weeps into a hanky', did: 'wept crocodile tears', saw: 'weep for her', atYou: 'weeps at you, very convincingly.' }),
  raspberry: E({ id: 'raspberry', name: 'Raspberry', kind: 'gesture', who: 'cousin', secs: 2.2, tone: 'rude', sound: 'raspberry', pop: 'PFFBT!', does: 'blows a raspberry', did: 'blew a raspberry', saw: 'blow a raspberry at her', atYou: 'blows a raspberry at you.' }),
  'nose-thumb': E({ id: 'nose-thumb', name: 'Thumb Your Nose', kind: 'gesture', who: 'cousin', secs: 2.4, tone: 'rude', sound: 'nyah', pop: 'nyah nyah', does: 'thumbs their nose', did: 'thumbed their nose', saw: 'thumb their nose at her', atYou: 'thumbs their nose at you.' }),
  'the-bird': E({ id: 'the-bird', name: 'The Bird', kind: 'gesture', who: 'cousin', secs: 2.4, tone: 'rude', censored: true, sound: 'bleep', pop: '[CENSORED]', does: 'makes a very rude gesture', did: 'gave her the bird', saw: 'make a very rude gesture', atYou: 'gives you the bird. Charming.' }),
  moon: E({ id: 'moon', name: 'The Moon', kind: 'gesture', who: 'cousin', secs: 2.8, tone: 'rude', censored: true, sound: 'bleep', pop: '[CENSORED]', does: 'bares their bottom', did: 'mooned her', saw: 'moon her', atYou: 'moons you. You cannot unsee it.', away: true }),
  'coffin-measure': E({ id: 'coffin-measure', name: 'Measure for a Coffin', kind: 'gesture', who: 'cousin', secs: 3.0, tone: 'rude', sound: 'tape', pop: '6 ft... ish', does: 'measures someone for a coffin', did: 'measured her for a coffin', saw: 'measure her for a coffin', atYou: 'measures you for a coffin.' }),
  'money-count': E({ id: 'money-count', name: 'Count the Money', kind: 'gesture', who: 'cousin', secs: 2.8, tone: 'rude', sound: 'kaching', pop: '£££', does: 'counts imaginary money', did: 'counted her money', saw: 'count her money in front of her', atYou: 'counts your share of the money, in front of you.' }),
  // ── Cousin dances ──
  'will-jig': E({ id: 'will-jig', name: 'The Will Jig', kind: 'dance', who: 'cousin', secs: 8, tone: 'sweet', sound: 'jig', pop: '♪', does: 'dances a jig', did: 'danced a jig for her', saw: 'dance a jig for her', atYou: 'dances a jig at you.' }),
  'tea-twirl': E({ id: 'tea-twirl', name: 'Tea-Party Twirl', kind: 'dance', who: 'cousin', secs: 8, tone: 'sweet', sound: 'waltz', pop: '♫', does: 'twirls, little finger out', did: 'twirled for her', saw: 'twirl for her', atYou: 'twirls at you, little finger out.' }),
  'gold-digger': E({ id: 'gold-digger', name: 'Gold-Digger Shimmy', kind: 'dance', who: 'cousin', secs: 8, tone: 'rude', sound: 'shimmy', pop: '£ ♪ £', does: 'does the gold-digger shimmy', did: 'did the gold-digger shimmy', saw: 'shimmy like a gold-digger', atYou: 'shimmies at you like a gold-digger.' }),
  'grave-stomp': E({ id: 'grave-stomp', name: 'Dance on Her Grave', kind: 'dance', who: 'cousin', secs: 8, tone: 'rude', sound: 'stomp', pop: 'STOMP', does: 'stomps a little dance on an imaginary grave', did: 'danced on her grave', saw: 'dance on her grave', atYou: 'dances on your grave. You are not even dead.' }),
  'funeral-march': E({ id: 'funeral-march', name: 'Funeral March', kind: 'dance', who: 'cousin', secs: 8, tone: 'rude', sound: 'dirge', pop: '♩ ♩ ♩', does: 'rehearses a funeral march', did: 'rehearsed her funeral march', saw: 'rehearse her funeral', atYou: 'rehearses your funeral.' }),
  'hip-replacement': E({ id: 'hip-replacement', name: 'The Hip Replacement', kind: 'dance', who: 'cousin', secs: 8, tone: 'rude', sound: 'creak', pop: '*creak*', does: 'does the hip replacement', did: 'did the hip replacement', saw: 'do an impression of her hips', atYou: 'does an impression of your hips.' }),
  // ── Grandma gestures ──
  'cane-shake': E({ id: 'cane-shake', name: 'Shake the Cane', kind: 'gesture', who: 'grandma', secs: 2.2, tone: 'show', sound: 'oi', pop: 'OI!', does: 'shakes her cane', did: 'shook her cane', saw: 'shake her cane', atYou: 'shakes her cane at you.' }),
  'watching-you': E({ id: 'watching-you', name: "I'm Watching You", kind: 'gesture', who: 'grandma', secs: 2.8, tone: 'show', sound: 'hmm', pop: "I'm watching you", does: 'points two fingers at her eyes, then at someone', did: 'said she was watching', saw: 'watch', atYou: 'is watching you.' }),
  'wag-finger': E({ id: 'wag-finger', name: 'Wag a Finger', kind: 'gesture', who: 'grandma', secs: 2.2, tone: 'show', sound: 'tsk', pop: 'Tsk tsk tsk', does: 'wags a finger', did: 'wagged a finger', saw: 'wag a finger', atYou: 'wags a finger at you.' }),
  'clutch-pearls': E({ id: 'clutch-pearls', name: 'Clutch Pearls', kind: 'gesture', who: 'grandma', secs: 2.4, tone: 'show', sound: 'gasp', pop: 'Well I never!', does: 'clutches her pearls', did: 'clutched her pearls', saw: 'clutch her pearls', atYou: 'clutches her pearls at you.' }),
  'blow-kiss': E({ id: 'blow-kiss', name: 'Blow a Kiss', kind: 'gesture', who: 'grandma', secs: 2.2, tone: 'show', sound: 'kiss', pop: 'Mwah!', does: 'blows a kiss', did: 'blew a kiss', saw: 'blow a kiss', atYou: 'blows you a kiss.' }),
  'fake-faint': E({ id: 'fake-faint', name: 'Fake Faint', kind: 'gesture', who: 'grandma', secs: 3.6, tone: 'show', sound: 'thud', pop: 'Oh! My heart...', does: 'clutches her heart and staggers (she is fine)', did: 'pretended to faint', saw: 'faint', atYou: 'clutches her heart at you... and is fine.' }),
  // ── Grandma dances ──
  charleston: E({ id: 'charleston', name: 'The Charleston', kind: 'dance', who: 'grandma', secs: 8, tone: 'show', sound: 'ragtime', pop: '♪ ♫', does: 'does the Charleston', did: 'did the Charleston', saw: 'dance', atYou: 'does the Charleston at you.' }),
  'the-twist': E({ id: 'the-twist', name: 'The Twist', kind: 'dance', who: 'grandma', secs: 8, tone: 'show', sound: 'twist', pop: '♫', does: 'does the Twist', did: 'did the Twist', saw: 'dance', atYou: 'does the Twist at you.' }),
  'still-alive': E({ id: 'still-alive', name: 'Still Alive!', kind: 'dance', who: 'grandma', secs: 6, tone: 'show', sound: 'fanfare', pop: 'STILL HERE!', does: 'dances a victory jig, cane aloft', did: 'reminded everyone she is still alive', saw: 'dance', atYou: 'reminds you that she is still alive.' }),
};

export const EMOTE_IDS = Object.keys(EMOTES) as EmoteId[];

export function isEmoteId(x: unknown): x is EmoteId {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(EMOTES, x);
}

/** The wheel's entries for a role and kind, in wheel order. */
export function emotesFor(role: Role, kind: 'gesture' | 'dance'): EmoteDef[] {
  return EMOTE_IDS.map((id) => EMOTES[id]).filter((d) => d.who === role && d.kind === kind);
}

export const EMOTE = {
  /** Shortest gap between starting two emotes (s). */
  cooldown: 0.8,
  /** How long into an emote Nana judges what she saw (s): the gesture is at its height. */
  judgeAt: 0.5,
  /** Aimed at someone: they are within this range (m)... */
  aimRange: 8,
  /** ...and within this angle of where you face (radians either side). */
  aimCone: 0.6,
  /** A sweet emote counts as flattery when Nana sees it from within this range (m). */
  sweetRange: 6,
  /** One Behind Her Back / The Cheek of It moment per cousin per this long (s). */
  momentGap: 30,
} as const;
