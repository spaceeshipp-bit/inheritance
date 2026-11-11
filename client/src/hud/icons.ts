// Inline SVG icons (no icon fonts or emoji: they may be missing offline).
const svg = (body: string, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  eyeOpen: svg('<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/>'),
  eyeBlur: svg('<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="3" stroke-dasharray="2 2"/>'),
  eyeClosed: svg('<path d="M2 10c3 4 6 5 10 5s7-1 10-5"/><path d="M5 14l-2 3M9 16l-1 3M15 16l1 3M19 14l2 3"/>'),
  ear: svg('<path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0"/><path d="M10 9a2 2 0 0 1 4 0"/>'),
  earMuffled: svg('<path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0"/><path d="M19 7c1.5 1.5 1.5 6.5 0 8" stroke-dasharray="2 2"/>'),
  earOff: svg('<path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0"/><path d="M3 3l18 18"/>'),
  mic: svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>'),
  pin: svg('<path d="M12 22s-7-7-7-12a7 7 0 0 1 14 0c0 5-7 12-7 12z"/><circle cx="12" cy="10" r="2.5" fill="currentColor"/>'),
  arrow: svg('<path d="M12 2l8 14h-5v6H9v-6H4z" fill="currentColor" stroke="none"/>'),
  up: svg('<path d="M12 4l8 12H4z" fill="currentColor" stroke="none"/>'),
  down: svg('<path d="M12 20l8-12H4z" fill="currentColor" stroke="none"/>'),
  crash: svg('<path d="M12 2l2 6 6-2-3 6 5 3-6 1 1 6-5-4-5 4 1-6-6-1 5-3-3-6 6 2z" fill="currentColor" stroke="none"/>'),
  quill: svg('<path d="M20 2C10 4 6 10 4 20l2 2c2-6 5-9 9-11-3 0-5 1-7 3 2-6 6-9 12-12z" fill="currentColor" stroke="none"/>'),
  gear: svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/><circle cx="12" cy="12" r="6.5"/>'),
  /** A small robot head: this seat is played by a bot. */
  bot: svg('<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4"/><circle cx="12" cy="3.5" r="1.2" fill="currentColor"/><circle cx="9.5" cy="13" r="1.3" fill="currentColor"/><circle cx="14.5" cy="13" r="1.3" fill="currentColor"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" stroke="none"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  aim: svg('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
  bulb: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>'),
  hand: svg('<path d="M6 13V8a1.5 1.5 0 0 1 3 0v4M9 11V5.5a1.5 1.5 0 0 1 3 0V11M12 11V6.5a1.5 1.5 0 0 1 3 0V12M15 12V9a1.5 1.5 0 0 1 3 0v5c0 4-3 7-6.5 7S6 19 5 16l-1.6-3.2a1.5 1.5 0 0 1 2.6-1.4L6 13"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
} as const;

export function icon(name: keyof typeof ICONS, cls = 'ico'): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = cls;
  s.innerHTML = ICONS[name];
  return s;
}
