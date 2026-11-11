// Player settings, kept per browser in localStorage (when available) and
// overridable from the URL for testing (?gfx=low). Every read and write is
// guarded: private windows and blocked storage just fall back to defaults.
export type Quality = 'auto' | 'low' | 'medium' | 'high';

export interface SettingsData {
  /** Graphics quality. 'auto' scales the render resolution to hold the frame rate. */
  quality: Quality;
  /** Mouse look sensitivity multiplier (1 = default). */
  mouseSensitivity: number;
  /** Controller look sensitivity multiplier (1 = default). */
  padSensitivity: number;
  /** Invert vertical look. */
  invertY: boolean;
  /** 0..1 volumes. */
  masterVolume: number;
  sfxVolume: number;
  voiceVolume: number;
  /** Voice: push-to-talk instead of open mic. */
  pushToTalk: boolean;
  /** Push-to-talk key (KeyboardEvent.code). */
  pushToTalkKey: string;
  /** Calmer camera: no shake, slower ragdoll camera, no screen flashes. */
  reducedMotion: boolean;
  /** Show captions for quick-chat lines and important sounds. */
  captions: boolean;
  /** Draw a pattern on each cousin's colour band as well as the colour. */
  bandPatterns: boolean;
}

export const DEFAULT_SETTINGS: SettingsData = {
  quality: 'auto',
  mouseSensitivity: 1,
  padSensitivity: 1,
  invertY: false,
  masterVolume: 0.9,
  sfxVolume: 0.8,
  voiceVolume: 1,
  pushToTalk: false,
  pushToTalkKey: 'KeyB',
  reducedMotion: false,
  captions: true,
  bandPatterns: true,
};

const KEY = 'inheritance.settings.v1';
const QUALITIES: Quality[] = ['auto', 'low', 'medium', 'high'];

function clampNum(v: unknown, lo: number, hi: number, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
}

/** Validate anything (stored JSON, URL values) into a complete SettingsData. */
export function sanitize(raw: unknown): SettingsData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const bool = (k: keyof SettingsData) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : (d[k] as boolean));
  return {
    quality: QUALITIES.includes(r.quality as Quality) ? (r.quality as Quality) : d.quality,
    mouseSensitivity: clampNum(r.mouseSensitivity, 0.2, 4, d.mouseSensitivity),
    padSensitivity: clampNum(r.padSensitivity, 0.2, 4, d.padSensitivity),
    invertY: bool('invertY'),
    masterVolume: clampNum(r.masterVolume, 0, 1, d.masterVolume),
    sfxVolume: clampNum(r.sfxVolume, 0, 1, d.sfxVolume),
    voiceVolume: clampNum(r.voiceVolume, 0, 1, d.voiceVolume),
    pushToTalk: bool('pushToTalk'),
    pushToTalkKey: typeof r.pushToTalkKey === 'string' && /^[A-Za-z0-9]{2,20}$/.test(r.pushToTalkKey) ? r.pushToTalkKey : d.pushToTalkKey,
    reducedMotion: bool('reducedMotion'),
    captions: bool('captions'),
    bandPatterns: bool('bandPatterns'),
  };
}

type Listener = (s: SettingsData) => void;

export class Settings {
  private data: SettingsData;
  private listeners: Listener[] = [];
  /** URL overrides apply for this page load only and are never saved. */
  private overrides: Partial<SettingsData> = {};

  constructor(search = typeof location !== 'undefined' ? location.search : '') {
    let stored: unknown = null;
    try {
      const s = localStorage.getItem(KEY);
      if (s) stored = JSON.parse(s);
    } catch { /* storage blocked or corrupt: defaults */ }
    this.data = sanitize(stored);
    const q = new URLSearchParams(search);
    const gfx = q.get('gfx');
    if (gfx && QUALITIES.includes(gfx as Quality)) this.overrides.quality = gfx as Quality;
    if (q.get('reducedMotion') === '1') this.overrides.reducedMotion = true;
  }

  get(): SettingsData {
    return { ...this.data, ...this.overrides };
  }

  set(patch: Partial<SettingsData>): void {
    this.data = sanitize({ ...this.data, ...patch });
    for (const k of Object.keys(patch) as (keyof SettingsData)[]) delete this.overrides[k];
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* not saved: fine */ }
    const s = this.get();
    for (const fn of this.listeners) fn(s);
  }

  onChange(fn: Listener): void {
    this.listeners.push(fn);
  }
}
