// Where the match is, in the HUD's words: the top bar while everyone arrives,
// and the address on Grandma's will. Each map gets lines of its own; a map
// added later falls back to its name (shared/map.ts) until it has some.
import { mapById, type MapId } from '../../../shared/map.js';

export interface MapWords {
  /** The top bar during the role reveal. */
  arriving: string;
  /** After Grandma's name on the will: "of Agatha, <address>". */
  address: string;
}

const WORDS: Partial<Record<MapId, MapWords>> = {
  manor: { arriving: 'Arriving at Harrowgate', address: 'of Harrowgate Manor' },
  carehome: { arriving: 'Visiting hours at Sunny Pines', address: 'of Room 12, Sunny Pines Care Home' },
  parlour: { arriving: 'Gathering at Pettigrew & Sons', address: 'presently of Pettigrew & Sons Funeral Parlour (just looking)' },
  cruise: { arriving: 'All aboard The Golden Years', address: 'at sea, aboard The Golden Years' },
};

/** The lines for map `id` (the match's `options.map`); an unknown id reads as the manor, as everywhere else. */
export function mapWords(id: string | null | undefined): MapWords {
  const def = mapById(id);
  return WORDS[def.id] ?? { arriving: `Arriving at ${def.name}`, address: `of ${def.name}` };
}
