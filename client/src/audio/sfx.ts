// Positional SFX. Each sound goes synth -> [Grandma's distance filter] ->
// PannerNode (HRTF) -> master. Grandma hears SFX through the same distance
// filter as voices (shared/senses.ts grandmaVoiceFilter); loud sounds (a
// crash) count as closer so she still hears them, muffled, from afar.
import { grandmaVoiceFilter } from '../../../shared/senses.js';
import type { Vec3 } from '../../../shared/types.js';
import { rng } from '../util.js';
import { synth, type SfxKind } from './synth.js';

const LOUDNESS: Partial<Record<SfxKind, number>> = { crash: 3, thunder: 10, whistle: 1.5, summon: 2, oof: 1.2 };
/** Beyond this many metres cousins don't hear it at all. */
const RANGE: Partial<Record<SfxKind, number>> = { step: 10, quill: 12, whistle: 14, oof: 16, cane: 14, clink: 8 };

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private rand = rng(7);
  private role: 'grandma' | 'cousin' | 'lobby' = 'lobby';
  private pos: Vec3 = { x: 0, y: 0, z: 0 };
  private aid = false;
  volume = 0.7;

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
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { this.ctx = null; }
  }

  get ready(): boolean { return !!this.ctx && this.ctx.state === 'running'; }

  setListener(pos: Vec3, yaw: number, role: 'grandma' | 'cousin' | 'lobby', aid: boolean): void {
    this.pos = pos;
    this.role = role;
    this.aid = aid;
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
