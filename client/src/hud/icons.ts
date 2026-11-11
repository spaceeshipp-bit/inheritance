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
} as const;

export function icon(name: keyof typeof ICONS, cls = 'ico'): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = cls;
  s.innerHTML = ICONS[name];
  return s;
}
