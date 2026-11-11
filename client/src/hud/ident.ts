// Who is who on screen: display names without the server's " (bot)" suffix
// (a small robot glyph says it instead), and colour swatches that carry the
// cousin's band pattern as well as the colour (style.css draws the patterns
// under body.band-patterns).
import type { ItemKey } from '../../../shared/constants.js';
import { bandPatternIndex } from '../render/materials.js';
import type { GameState } from '../state.js';
import { el } from '../util.js';
import { ICONS } from './icons.js';

const BOT_SUFFIX = /\s*\(bot\)\s*$/i;

/** The server names bots "Agatha (bot)". */
export function isBotName(name: string): boolean {
  return BOT_SUFFIX.test(name);
}

/** "Agatha (bot)" -> "Agatha". */
export function cleanName(name: string): string {
  const n = name.replace(BOT_SUFFIX, '');
  return n || name;
}

/** Strip every " (bot)" from a server sentence (toasts, moments). */
export function cleanText(text: string): string {
  return text.replace(/ \(bot\)/gi, '');
}

/** Is this player a bot? The lobby list says so; the name suffix is the fallback. */
export function isBot(s: GameState, id: string): boolean {
  const p = s.lobby?.players.find((x) => x.id === id);
  return p ? p.isBot : isBotName(s.name(id));
}

/**
 * A player's name as the HUD shows it. Grandma's events leave out who did
 * something she could not see (`by: ''`, `from: ''`): that reads "Someone".
 */
export function nameOf(s: GameState, id: string): string {
  return id ? cleanName(s.name(id)) : 'Someone';
}

/** A small robot glyph that marks a bot seat (replaces the "(bot)" text). */
export function botGlyph(): HTMLElement {
  const e = el('span', 'bot-glyph');
  e.innerHTML = ICONS.bot;
  e.title = 'Bot';
  return e;
}

/** Paint a swatch with a cousin's colour and band pattern. */
export function paintSwatch(e: HTMLElement, color: string, item?: ItemKey | null): HTMLElement {
  const pat = bandPatternIndex(item);
  if (e.dataset.c === color && (e.dataset.pat ?? '') === (pat >= 0 ? String(pat) : '')) return e;
  e.dataset.c = color;
  e.style.backgroundColor = color;
  if (pat >= 0) e.dataset.pat = String(pat);
  else delete e.dataset.pat;
  return e;
}

/** A new swatch for a cousin (`cls` adds size classes such as 'big'). */
export function swatch(color: string, item?: ItemKey | null, cls = ''): HTMLElement {
  return paintSwatch(el('span', `swatch${cls ? ' ' + cls : ''}`), color, item);
}
