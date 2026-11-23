// Practice rounds (GDD, "First launch"): a short visit against bots with a
// checklist the server ticks off as you do each thing. As a cousin: flatter
// Nana, steal from a cousin and plant it, break an heirloom, pull a face
// behind her back. As Grandma: spectacles, hearing aid, Bless, Tut, the will.
// Only the server can see what you really did, so it tells you each tick.
import type { Role } from './types.js';

export type PracticeRole = Role;

export interface PracticeStep {
  id: string;
  /** The checklist line. */
  text: string;
  /** How to do it (shown for the next step not yet done). */
  hint: string;
}

export const PRACTICE: Record<PracticeRole, { minutes: number; steps: PracticeStep[] }> = {
  cousin: {
    minutes: 4,
    steps: [
      { id: 'compliment', text: 'Pay Nana a compliment', hint: 'Walk up close to her, hold Q and pick "Love you, Nana!".' },
      { id: 'steal', text: "Pinch a cousin's item", hint: 'Creep up behind a cousin (hold C to sneak) and press E.' },
      { id: 'plant', text: 'Plant it as evidence', hint: 'With the stolen item, hold G somewhere Nana will find it.' },
      { id: 'break', text: 'Break an heirloom', hint: 'Grab a vase (left mouse) and throw it (right mouse), or shove a cousin into a pedestal (F).' },
      { id: 'cheek', text: 'Pull a face behind her back', hint: 'Get behind Nana, face her, hold Z and pick the raspberry.' },
    ],
  },
  grandma: {
    minutes: 3,
    steps: [
      { id: 'specs', text: 'Put your spectacles on', hint: 'Press F: you see sharply for a few seconds.' },
      { id: 'aid', text: 'Turn up your hearing aid', hint: 'Hold the right mouse button and listen.' },
      { id: 'bless', text: 'Bless a flatterer', hint: 'Look at a cousin being sweet to you and press E.' },
      { id: 'tut', text: 'Tut a wrong-doer', hint: 'Catch a cousin misbehaving, look at them and press Q.' },
      { id: 'parchment', text: 'Rewrite the will', hint: 'Press Tab, drag a share, and press Tab again.' },
    ],
  },
};

export function isPracticeRole(x: unknown): x is PracticeRole {
  return x === 'cousin' || x === 'grandma';
}
