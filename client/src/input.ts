// Keyboard + mouse (pointer lock) + Gamepad API -> InputMsg at TICK_HZ, plus
// discrete action keys (wheels, chat, Grandma's Bless/Tut/parchment...).
//
// Cousin:  WASD move, mouse look, Shift run, Ctrl sneak (C also works: Ctrl+W
//          closes browser tabs), Space jump, LMB grab, RMB throw, F shove,
//          E interact, G plant, Q quick-chat wheel, T tattle wheel,
//          Left Alt whisper, Enter typed chat.
// Grandma: WASD move, mouse look, E Bless, Q Tut, scroll lock name,
//          Tab parchment, LMB cane, RMB hearing aid, F spectacles, R summon,
//          C pin, V quick-chat wheel, Left Alt whisper, Enter typed chat.
// Gamepad: the design doc's controller table (see padAction).
// Both:    B push-to-talk (when enabled in the lobby), H controls help.
import type { InputMsg } from '../../shared/protocol.js';
import type { Role } from '../../shared/types.js';
import { clamp } from './util.js';

export type Action =
  | 'quickWheel' | 'tattleWheel' | 'chat' | 'bless' | 'tut' | 'parchment' | 'summon' | 'pin'
  | 'lockNext' | 'lockPrev' | 'whisper' | 'talk' | 'help' | 'back'
  | 'navUp' | 'navDown' | 'navLeft' | 'navRight' | 'select';

/** Standard Gamepad mapping indices. */
const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

const GAME_KEYS = new Set([
  'Tab', 'Space', 'AltLeft', 'AltRight', 'ControlLeft', 'ControlRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyE', 'KeyG', 'KeyQ', 'KeyT', 'KeyR', 'KeyC', 'KeyV', 'KeyB', 'KeyH',
]);

export class Input {
  role: Role = 'cousin';
  /** True while in a match phase where game input matters. */
  active = false;
  /** Chat box focused: the game ignores the keyboard. */
  typing = false;
  /** A wheel is open: mouse/right stick moves `cursor` instead of the camera. */
  lookFrozen = false;
  /** Grandma's full parchment is open: D-pad navigates it. */
  parchmentOpen = false;
  yaw = 0;
  pitch = 0;
  /** Virtual cursor for radial wheels, pixels from the screen centre. */
  cursor = { x: 0, y: 0 };
  sensitivity = 0.0024;
  padSensitivity = 2.8;
  onAction: (a: Action, down: boolean) => void = () => {};
  /** Last input device used (for on-screen prompts). */
  lastDevice: 'kbm' | 'pad' = 'kbm';

  private keys = new Set<string>();
  private mouse = 0;
  /** Presses since the last InputMsg, so a tap shorter than one tick still counts. */
  private latchKeys = new Set<string>();
  private latchMouse = 0;
  private latchPad: boolean[] = [];
  private seq = 0;
  private padButtons: boolean[] = [];
  private padAxes: number[] = [0, 0, 0, 0];
  /** L3 toggles running until the stick is released. */
  private padRun = false;

  constructor(private canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.clear());
    canvas.addEventListener('mousedown', (e) => {
      if (!this.active) return;
      if (!this.locked) {
        if (!this.lookFrozen && !this.parchmentOpen) this.requestLock();
        return;
      }
      this.mouse |= 1 << e.button;
      this.latchMouse |= 1 << e.button;
      this.lastDevice = 'kbm';
    });
    window.addEventListener('mouseup', (e) => { this.mouse &= ~(1 << e.button); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.active || !this.locked) return;
      if (this.lookFrozen) {
        this.cursor.x = clamp(this.cursor.x + e.movementX, -160, 160);
        this.cursor.y = clamp(this.cursor.y + e.movementY, -160, 160);
        return;
      }
      if (this.parchmentOpen) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch = clamp(this.pitch - e.movementY * this.sensitivity, -1.25, 1.25);
    });
    window.addEventListener('wheel', (e) => {
      if (!this.active || this.typing || this.parchmentOpen) return;
      if (e.deltaY > 0) this.onAction('lockNext', true);
      else if (e.deltaY < 0) this.onAction('lockPrev', true);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => { if (!this.locked) this.mouse = 0; });
  }

  get locked(): boolean { return document.pointerLockElement === this.canvas; }

  requestLock(): void {
    if (this.locked) return;
    try {
      const r = this.canvas.requestPointerLock() as unknown;
      if (r instanceof Promise) r.catch(() => { /* needs a user gesture */ });
    } catch { /* unsupported */ }
  }
  releaseLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  /** Forget held keys/buttons (focus loss, chat opened, phase change). */
  clear(): void {
    this.keys.clear();
    this.mouse = 0;
    this.latchKeys.clear();
    this.latchMouse = 0;
  }

  held(code: string): boolean { return this.keys.has(code); }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (this.typing || !this.active) return;
    const code = e.code;
    if (GAME_KEYS.has(code) || (e.ctrlKey && /^Key[A-Z]$/.test(code) && code !== 'KeyW')) e.preventDefault();
    if (down && e.repeat) return;
    this.lastDevice = 'kbm';
    if (down) { this.keys.add(code); this.latchKeys.add(code); }
    else this.keys.delete(code);
    this.keyAction(code, down);
  }

  private keyAction(code: string, down: boolean): void {
    const g = this.role === 'grandma';
    const act = (a: Action) => this.onAction(a, down);
    switch (code) {
      case 'KeyQ': act(g ? 'tut' : 'quickWheel'); break;
      case 'KeyV': if (g) act('quickWheel'); break;
      case 'KeyT': if (!g) act('tattleWheel'); break;
      case 'KeyE': if (g) act('bless'); break;
      case 'Tab': if (g) act('parchment'); break;
      case 'KeyR': if (g) act('summon'); break;
      case 'KeyC': if (g) act('pin'); break;
      case 'Enter': case 'NumpadEnter': act('chat'); break;
      case 'AltLeft': act('whisper'); break;
      case 'KeyB': act('talk'); break;
      case 'KeyH': act('help'); break;
      case 'Escape': act('back'); break;
      default:
        if (/^Digit[1-8]$/.test(code) && down) this.onAction('select', true);
        break;
    }
  }

  /** Digit key currently held 1..8 (for picking wheel entries directly), or 0. */
  digit(): number {
    for (let i = 1; i <= 8; i++) if (this.keys.has(`Digit${i}`)) return i;
    return 0;
  }

  /** Per-frame: poll the gamepad, apply right-stick look. */
  frame(dt: number): void {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    let gp: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) { this.padButtons = []; this.padAxes = [0, 0, 0, 0]; return; }
    const buttons = gp.buttons.map((b) => b.pressed || b.value > 0.5);
    const axes = [0, 1, 2, 3].map((i) => deadzone(gp!.axes[i] ?? 0));
    if (buttons.some(Boolean) || axes.some((a) => a !== 0)) this.lastDevice = 'pad';
    const prev = this.padButtons;
    this.padButtons = buttons;
    this.padAxes = axes;
    if (Math.hypot(axes[0], axes[1]) < 0.2) this.padRun = false;
    if (!this.active || this.typing) return;
    for (let i = 0; i < buttons.length; i++) {
      if (buttons[i] && !(prev[i] ?? false)) this.latchPad[i] = true;
      if (buttons[i] !== (prev[i] ?? false)) this.padAction(i, buttons[i]);
    }
    if (this.lookFrozen) {
      if (Math.hypot(axes[2], axes[3]) > 0.5) { this.cursor.x = axes[2] * 120; this.cursor.y = axes[3] * 120; }
    } else if (!this.parchmentOpen) {
      this.yaw -= axes[2] * this.padSensitivity * dt;
      this.pitch = clamp(this.pitch - axes[3] * this.padSensitivity * 0.7 * dt, -1.25, 1.25);
    }
  }

  /**
   * Controller layout from the design doc. Cousin: L3 run (toggle), B sneak,
   * A jump, RT grab, RB throw, X shove, Y interact, D-down plant, LB
   * compliment wheel, D-up tattle, LT whisper. Grandma: RB Bless, LB Tut,
   * D-left/right lock, View parchment, RT cane, LT hearing aid, Y spectacles,
   * B summon, X pin, R3 quick-chat wheel.
   */
  private padAction(i: number, down: boolean): void {
    const g = this.role === 'grandma';
    const act = (a: Action) => this.onAction(a, down);
    if (this.parchmentOpen) {
      if (i === PAD.UP) act('navUp');
      else if (i === PAD.DOWN) act('navDown');
      else if (i === PAD.LEFT) act('navLeft');
      else if (i === PAD.RIGHT) act('navRight');
      else if (i === PAD.B || i === PAD.BACK) { if (down) this.onAction('parchment', true); }
      return;
    }
    if (g) {
      switch (i) {
        case PAD.RB: act('bless'); break;
        case PAD.LB: act('tut'); break;
        case PAD.BACK: act('parchment'); break;
        case PAD.B: act('summon'); break;
        case PAD.X: act('pin'); break;
        case PAD.R3: act('quickWheel'); break;
        case PAD.LEFT: if (down) this.onAction('lockPrev', true); break;
        case PAD.RIGHT: if (down) this.onAction('lockNext', true); break;
        case PAD.START: if (down) this.onAction('help', true); break;
        default: break;
      }
    } else {
      switch (i) {
        case PAD.LB: act('quickWheel'); break;
        case PAD.UP: act('tattleWheel'); break;
        case PAD.LT: act('whisper'); break;
        case PAD.L3: if (down) this.padRun = !this.padRun; break;
        case PAD.START: if (down) this.onAction('help', true); break;
        default: break;
      }
    }
  }

  /** Current analog move (camera space). */
  move(): { x: number; z: number } {
    if (this.typing || !this.active) return { x: 0, z: 0 };
    const k = (c: string) => (this.keys.has(c) ? 1 : 0);
    let x = k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft') + this.padAxes[0];
    let z = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown') - this.padAxes[1];
    x = clamp(x, -1, 1);
    z = clamp(z, -1, 1);
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    return { x, z };
  }

  /** Whisper held (Left Alt / RB). */
  whispering(): boolean {
    return !this.typing && (this.keys.has('AltLeft') || (this.role === 'cousin' && this.pb(PAD.LT)));
  }

  private pb(i: number): boolean { return (this.padButtons[i] ?? false) || (this.latchPad[i] ?? false); }

  /** Build the InputMsg for this tick. Buttons are "held" booleans. */
  build(): InputMsg {
    const k = (c: string) => !this.typing && (this.keys.has(c) || this.latchKeys.has(c));
    const m = (b: number) => !this.typing && ((this.mouse | this.latchMouse) & (1 << b)) !== 0;
    const mv = this.move();
    const g = this.role === 'grandma';
    const wheel = this.lookFrozen;
    const msg: InputMsg = {
      t: 'input',
      seq: ++this.seq,
      move: mv,
      yaw: this.yaw,
      pitch: this.pitch,
      run: !g && (k('ShiftLeft') || k('ShiftRight') || this.padRun),
      sneak: !g && (k('ControlLeft') || k('ControlRight') || k('KeyC') || this.pb(PAD.B)),
      jump: !g && (k('Space') || this.pb(PAD.A)),
      whisper: this.whispering(),
      primary: !wheel && (m(0) || this.pb(PAD.RT)),
      secondary: !wheel && (m(2) || this.pb(g ? PAD.LT : PAD.RB)),
      shove: k('KeyF') || this.pb(g ? PAD.Y : PAD.X),
      interact: !g && (k('KeyE') || this.pb(PAD.Y)),
      plant: !g && (k('KeyG') || this.pb(PAD.DOWN)),
    };
    this.latchKeys.clear();
    this.latchMouse = 0;
    this.latchPad = [];
    if (!this.active) {
      msg.move = { x: 0, z: 0 };
      msg.run = msg.sneak = msg.jump = msg.primary = msg.secondary = msg.shove = msg.interact = msg.plant = false;
    }
    return msg;
  }
}

function deadzone(v: number, dz = 0.18): number {
  const a = Math.abs(v);
  if (a < dz) return 0;
  return Math.sign(v) * Math.min(1, (a - dz) / (1 - dz));
}
