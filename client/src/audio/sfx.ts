// Positional SFX. Each sound goes synth -> [Grandma's distance filter] ->
// PannerNode (HRTF) -> master. Grandma hears SFX through the same distance
// filter as voices (shared/senses.ts grandmaVoiceFilter); loud sounds (a
// crash) count as closer so she still hears them, muffled, from afar.
import { grandmaVoiceFilter } from '../../../shared/senses.js';
import type { Vec3 } from '../../../shared/types.js';
import type { SettingsData } from '../settings.js';
import { rng } from '../util.js';
import { synth, type SfxKind } from './synth.js';

/** How much closer than it is a sound counts for Grandma's ears (a crash carries). */
export const LOUDNESS: Partial<Record<SfxKind, number>> = {
  crash: 3, chime: 3, kettle: 2.5, rip: 2, poof: 2, crack: 3, thunder: 10, whistle: 1.5, summon: 2, oof: 1.2,
  // Gestures carry a little; a dance tune carries further.
  raspberry: 1.3, bleep: 1.3, oi: 1.5, jig: 1.6, waltz: 1.4, shimmy: 1.6, stomp: 2, dirge: 1.8, creak: 1.2, ragtime: 1.8, twist: 1.6, fanfare: 2,
};
/** Beyond this many metres cousins don't hear it at all. */
export const RANGE: Partial<Record<SfxKind, number>> = {
  step: 10, quill: 12, whistle: 14, oof: 16, cane: 14, clink: 8,
  aww: 12, sob: 12, raspberry: 14, nyah: 14, bleep: 16, tape: 10, kaching: 14, kiss: 10, tsk: 10, hmm: 10, gasp: 12, oi: 16, thud: 14,
  jig: 20, waltz: 18, shimmy: 20, stomp: 20, dirge: 22, creak: 14, ragtime: 22, twist: 20, fanfare: 24,
};

export class Sfx {
  /**
   * The page's sound effects (main.ts makes exactly one). The HUD plays its own
   * feedback through it (the shove whoosh) without owning a reference.
   */
  static main: Sfx | null = null;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private rand = rng(7);
  private role: 'grandma' | 'cousin' | 'lobby' = 'lobby';
  private pos: Vec3 = { x: 0, y: 0, z: 0 };
  private aid = false;
  private thunder = false;
  volume = 0.7;

  constructor() {
    Sfx.main ??= this;
  }

  /** Create/resume the AudioContext. Call from a user gesture. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp).connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 2;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.output) void this.applyOutput();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { this.ctx = null; }
  }

  get ready(): boolean { return !!this.ctx && this.ctx.state === 'running'; }

  /** Apply player settings (master x effects volume, and the speakers). */
  applySettings(s: SettingsData): void {
    this.volume = s.masterVolume * s.sfxVolume;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    this.output = s.outputDevice;
    void this.applyOutput();
  }

  private output = '';
  /** Play through the chosen speakers where the browser can (AudioContext.setSinkId). */
  private async applyOutput(): Promise<void> {
    const ctx = this.ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!ctx?.setSinkId) return;
    try { await ctx.setSinkId(this.output); } catch { /* gone: stay on the default */ }
  }

  /** `thunder`: the Storm's thunder is rolling, and Grandma hears nothing else. */
  setListener(pos: Vec3, yaw: number, role: 'grandma' | 'cousin' | 'lobby', aid: boolean, thunder = false): void {
    this.pos = pos;
    this.role = role;
    this.aid = aid;
    this.thunder = thunder;
    const ctx = this.ctx;
    if (!ctx) return;
    const L = ctx.listener;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const y = pos.y + 1.6;
    if (L.positionX) {
      const t = ctx.currentTime;
      L.positionX.setTargetAtTime(pos.x, t, 0.02);
      L.positionY.setTargetAtTime(y, t, 0.02);
      L.positionZ.setTargetAtTime(pos.z, t, 0.02);
      L.forwardX.setTargetAtTime(fx, t, 0.02);
      L.forwardY.setTargetAtTime(0, t, 0.02);
      L.forwardZ.setTargetAtTime(fz, t, 0.02);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(pos.x, y, pos.z);
      L.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  /** Play a sound at `pos` (omit for a non-positional UI sound). */
  play(kind: SfxKind, pos?: Vec3, gain = 1): void {
    const ctx = this.ctx, master = this.master, noise = this.noise;
    if (!ctx || !master || !noise || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.01;
    const voice = ctx.createGain();
    voice.gain.value = gain;
    let out: AudioNode = master;
    const chain: AudioNode[] = [voice];
    if (pos) {
      const d = Math.hypot(pos.x - this.pos.x, pos.y - this.pos.y, pos.z - this.pos.z);
      const range = RANGE[kind];
      if (this.role !== 'grandma' && range !== undefined && d > range) return;
      const panner = new PannerNode(ctx, {
        panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 2, maxDistance: 60,
        rolloffFactor: this.role === 'grandma' ? 0 : 1,
        positionX: pos.x, positionY: pos.y + 1, positionZ: pos.z,
      });
      panner.connect(master);
      chain.push(panner);
      out = panner;
      if (this.role === 'grandma') {
        if (this.thunder && kind !== 'thunder') return;
        const f = grandmaVoiceFilter(d / (LOUDNESS[kind] ?? 1), this.aid);
        if (f.gain <= 0) return;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = f.lowpassHz;
        lp.connect(panner);
        chain.push(lp);
        voice.gain.value = gain * f.gain;
        out = lp;
      }
    }
    voice.connect(out);
    const dur = synth(kind, { ctx, noise, out: voice, t, rand: this.rand });
    setTimeout(() => { for (const n of chain) { try { n.disconnect(); } catch { /* gone */ } } }, (dur + 0.5) * 1000);
  }
}
