// Where the match is, in the HUD's words: the top bar while everyone arrives,
// and the address on Grandma's will. Each map gets lines of its own; a map
// added later falls back to its name (shared/map.ts) until it has some.
import { mapById, type MapId } from '../../../shared/map.js';

export interface MapWords {
  /** The top bar during the role reveal. */
  arriving: string;
  /** After Grandma's name on the will: "of Agatha, <address>". */
  address: string;
  /** The solicitor's entrance at the Reading of the Will. */
  reading: string;
  /** A cousin's tip on the role card: this house's own way to dispose of a relative. */
  tip?: string;
}

const READING = 'Mr Pettigrew, the family solicitor, clears his throat and unfolds the parchment...';

const WORDS: Partial<Record<MapId, MapWords>> = {
  manor: { arriving: 'Arriving at Harrowgate', address: 'of Harrowgate Manor', reading: READING },
  carehome: {
    arriving: 'Visiting hours at Sunny Pines', address: 'of Room 12, Sunny Pines Care Home',
    reading: 'Mr Pettigrew, the family solicitor, waits for the bingo to finish, clears his throat and unfolds the parchment...',
  },
  parlour: {
    arriving: 'Gathering at Pettigrew & Sons', address: 'presently of Pettigrew & Sons Funeral Parlour (just looking)',
    reading: 'Mr Pettigrew (the family solicitor, and, as it happens, the undertaker) clears his throat and unfolds the parchment...',
    tip: 'Open coffins (the Deluxe on special, and Nana\'s own): shove a cousin into one and the lid slams shut.',
  },
  cruise: {
    arriving: 'All aboard The Golden Years', address: 'at sea, aboard The Golden Years',
    reading: 'Mr Pettigrew, the family solicitor, steadies himself against the swell and unfolds the parchment...',
    tip: 'Mind the rail on the Lido Deck: a good shove sends a cousin overboard.',
  },
};

/** The lines for map `id` (the match's `options.map`); an unknown id reads as the manor, as everywhere else. */
export function mapWords(id: string | null | undefined): MapWords {
  const def = mapById(id);
  return WORDS[def.id] ?? { arriving: `Arriving at ${def.name}`, address: `of ${def.name}`, reading: READING };
}
