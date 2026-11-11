// The settings panel: a gear fixed at the top right on every screen (title,
// lobby and in a match); in a match Escape opens it too when no wheel or
// parchment is open. It edits client/src/settings.ts, which applies each change
// at once (main.ts and the HUD listen) and keeps it in this browser.
import { Input } from '../input.js';
import { DEFAULT_SETTINGS, type Quality, type Settings, type SettingsData } from '../settings.js';
import { el, setText } from '../util.js';
import { ICONS } from './icons.js';

/** Keys the game already uses, so a push-to-talk key that clashes can say so. */
const GAME_KEY_USES: Record<string, string> = {
  KeyW: 'move', KeyA: 'move', KeyS: 'move', KeyD: 'move', ArrowUp: 'move', ArrowDown: 'move', ArrowLeft: 'move', ArrowRight: 'move',
  ShiftLeft: 'run', ShiftRight: 'run', ControlLeft: 'sneak', ControlRight: 'sneak', Space: 'jump',
  KeyF: 'shove / spectacles', KeyE: 'interact / Bless', KeyG: 'plant', KeyQ: 'compliment wheel / Tut', KeyT: 'tattle',
  KeyC: 'sneak / pin', KeyR: 'summon', KeyV: "Nana's quick-chat", Tab: 'full parchment', AltLeft: 'whisper',
  Enter: 'chat', KeyH: 'controls help', Escape: 'settings',
};

/** "KeyB" -> "B", "Digit4" -> "4", "ShiftLeft" -> "Left Shift". */
export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `Num ${code.slice(6)}`;
  const side = /^(Shift|Control|Alt|Meta)(Left|Right)$/.exec(code);
  if (side) return `${side[2]} ${side[1] === 'Control' ? 'Ctrl' : side[1]}`;
  const named: Record<string, string> = { Backquote: '`', CapsLock: 'Caps Lock', Space: 'Space', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/' };
  return named[code] ?? code;
}

interface Slider { input: HTMLInputElement; out: HTMLElement; fmt: (v: number) => string }

export class SettingsPanel {
  readonly gear = el('button', 'gear-btn');
  readonly root = el('div', 'settings-modal');
  isOpen = false;
  /**
   * May Escape open the panel right now (in a match, no wheel/parchment/chat
   * open)? Set by the HUD. While the mouse is captured the browser keeps the
   * first Escape to free the mouse; the next one opens the panel.
   */
  canOpenWithEscape: () => boolean = () => false;
  private card = el('div', 'settings-card');
  private quality = el('select', 'set-select');
  private sliders: Partial<Record<keyof SettingsData, Slider>> = {};
  private checks: Partial<Record<keyof SettingsData, HTMLInputElement>> = {};
  private pttKey = el('button', 'btn small key-btn');
  private pttNote = el('div', 'set-note');
  private capturing = false;
  private relock = false;

  constructor(private getSettings: () => Settings | null) {
    this.gear.type = 'button';
    this.gear.title = 'Settings (Esc)';
    this.gear.setAttribute('aria-label', 'Settings');
    this.gear.innerHTML = ICONS.gear;
    // Do not keep keyboard focus on the gear: Space (jump) would press it again.
    this.gear.addEventListener('click', () => { this.gear.blur(); this.toggle(); });
    this.build();
    this.root.appendChild(this.card);
    this.root.style.display = 'none';
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    document.body.append(this.gear, this.root);
    // Capture phase: runs before the game's own key handling (input.ts), so the
    // Escape that opens or closes the panel never also reaches the game.
    window.addEventListener('keydown', (e) => this.onKey(e), true);
  }

  private build(): void {
    const head = el('div', 'settings-head');
    const close = el('button', 'icon-btn');
    close.type = 'button';
    close.innerHTML = ICONS.close;
    close.setAttribute('aria-label', 'Close settings');
    close.addEventListener('click', () => this.close());
    head.append(el('div', 'settings-title', 'Settings'), close);

    const cols = el('div', 'settings-cols');
    const left = el('div', 'settings-col');
    const right = el('div', 'settings-col');

    // Graphics.
    left.appendChild(el('div', 'set-section', 'Graphics'));
    for (const [v, label] of [['auto', 'Auto (adapts to your computer)'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] as const) {
      const o = el('option', '', label);
      o.value = v;
      this.quality.appendChild(o);
    }
    this.quality.addEventListener('change', () => this.set({ quality: this.quality.value as Quality }));
    left.append(this.row('Quality', this.quality), el('div', 'set-note', 'Anti-aliasing changes after a reload.'));

    // Controls.
    left.appendChild(el('div', 'set-section', 'Controls'));
    left.appendChild(this.slider('mouseSensitivity', 'Mouse sensitivity', 0.2, 4, 0.05, (v) => `${v.toFixed(2)}×`));
    left.appendChild(this.slider('padSensitivity', 'Controller sensitivity', 0.2, 4, 0.05, (v) => `${v.toFixed(2)}×`));
    left.appendChild(this.check('invertY', 'Invert vertical look'));

    // Sound.
    left.appendChild(el('div', 'set-section', 'Sound'));
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    left.appendChild(this.slider('masterVolume', 'Master volume', 0, 1, 0.01, pct));
    left.appendChild(this.slider('sfxVolume', 'Effects volume', 0, 1, 0.01, pct));
    left.appendChild(this.slider('voiceVolume', 'Voice volume', 0, 1, 0.01, pct));

    // Voice.
    right.appendChild(el('div', 'set-section', 'Voice chat'));
    right.appendChild(this.check('pushToTalk', 'Push-to-talk (otherwise open mic)'));
    this.pttKey.type = 'button';
    this.pttKey.addEventListener('click', () => {
      this.capturing = !this.capturing;
      this.refresh();
    });
    right.append(this.row('Push-to-talk key', this.pttKey), this.pttNote);

    // Accessibility.
    right.appendChild(el('div', 'set-section', 'Accessibility'));
    right.appendChild(this.check('reducedMotion', 'Reduced motion', 'No camera shake or flashing effects.'));
    right.appendChild(this.check('captions', 'Captions', 'Quick-chat lines and important sounds, bottom right.'));
    right.appendChild(this.check('bandPatterns', 'Colour-band patterns', 'Each cousin\'s band gets a pattern as well as a colour.'));

    const foot = el('div', 'settings-foot');
    const reset = el('button', 'btn small ghost', 'Reset to defaults');
    reset.type = 'button';
    reset.addEventListener('click', () => this.set({ ...DEFAULT_SETTINGS }));
    const done = el('button', 'btn small primary', 'Done');
    done.type = 'button';
    done.addEventListener('click', () => this.close());
    foot.append(el('div', 'set-note', 'Saved in this browser.'), reset, done);

    cols.append(left, right);
    this.card.append(head, cols, foot);
  }

  private row(label: string, control: HTMLElement): HTMLElement {
    const r = el('label', 'set-row');
    r.append(el('span', 'set-label', label), control);
    return r;
  }

  private slider(key: keyof SettingsData, label: string, min: number, max: number, step: number, fmt: (v: number) => string): HTMLElement {
    const input = el('input', 'set-range');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const out = el('span', 'set-value');
    input.addEventListener('input', () => {
      const v = Number(input.value);
      setText(out, fmt(v));
      this.set({ [key]: v } as Partial<SettingsData>);
    });
    this.sliders[key] = { input, out, fmt };
    const r = el('label', 'set-row');
    const top = el('span', 'set-label', label);
    r.append(top, input, out);
    return r;
  }

  private check(key: keyof SettingsData, label: string, note = ''): HTMLElement {
    const input = el('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => this.set({ [key]: input.checked } as Partial<SettingsData>));
    this.checks[key] = input;
    const l = el('label', 'check set-check');
    const text = el('span', '', label);
    if (note) text.appendChild(el('span', 'set-sub', note));
    l.append(input, text);
    return l;
  }

  private set(patch: Partial<SettingsData>): void {
    const s = this.getSettings();
    if (!s) return;
    s.set(patch);
    this.refresh();
  }

  /** Show the stored values. */
  private refresh(): void {
    const s = this.getSettings();
    if (!s) return;
    const d = s.get();
    this.quality.value = d.quality;
    for (const [k, sl] of Object.entries(this.sliders) as [keyof SettingsData, Slider][]) {
      const v = d[k] as number;
      if (document.activeElement !== sl.input) sl.input.value = String(v);
      setText(sl.out, sl.fmt(v));
    }
    for (const [k, c] of Object.entries(this.checks) as [keyof SettingsData, HTMLInputElement][]) c.checked = d[k] as boolean;
    setText(this.pttKey, this.capturing ? 'Press a key…' : keyLabel(d.pushToTalkKey));
    this.pttKey.classList.toggle('capturing', this.capturing);
    const clash = GAME_KEY_USES[d.pushToTalkKey];
    setText(this.pttNote, this.capturing ? 'Press the key to hold while you talk (Esc cancels).'
      : clash ? `Also the game's ${clash} key: push-to-talk takes it over.` : d.pushToTalk ? 'Hold it to talk.' : 'Used when push-to-talk is on.');
    this.pttNote.classList.toggle('warn', !this.capturing && !!clash);
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.capturing = false;
    this.relock = !!document.pointerLockElement;
    if (document.pointerLockElement) document.exitPointerLock();
    Input.blocked = true;
    this.refresh();
    this.root.style.display = '';
    this.gear.classList.add('on');
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.capturing = false;
    Input.blocked = false;
    // Hand the keyboard back to the game (a focused control would swallow Space or arrow keys).
    if (document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)) document.activeElement.blur();
    this.root.style.display = 'none';
    this.gear.classList.remove('on');
    // Clicking Done is a user gesture: take the mouse back for the game if it had it.
    if (this.relock) {
      const canvas = document.getElementById('game-canvas');
      try {
        const r = canvas?.requestPointerLock() as unknown;
        if (r instanceof Promise) r.catch(() => { /* needs a click on the game */ });
      } catch { /* unsupported */ }
    }
    this.relock = false;
  }

  toggle(): void { if (this.isOpen) this.close(); else this.open(); }

  private onKey(e: KeyboardEvent): void {
    if (this.capturing && this.isOpen) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      this.capturing = false;
      if (e.code !== 'Escape') this.set({ pushToTalkKey: e.code });
      else this.refresh();
      return;
    }
    if (e.code !== 'Escape' || e.repeat) return;
    if (this.isOpen) {
      this.close();
      e.preventDefault();
      e.stopImmediatePropagation();
    } else if (this.canOpenWithEscape()) {
      this.open();
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }
}
