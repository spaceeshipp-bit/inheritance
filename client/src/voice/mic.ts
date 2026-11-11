// Our own outbound voice: mic → (analyser) + look-ahead delay → gate gain →
// one send chain per listener: low-pass → gain → MediaStreamAudioDestinationNode,
// whose track that listener's connection sends. Each listener is sent only what
// they may hear of us (shape(), from rules.ts): Grandma gets our voice already
// muffled by her hearing, nobody gets it from beyond earshot. Their own client
// never holds more than that. The tracks exist (silent) even when the mic is
// denied, and the gate / push-to-talk / mute never need a renegotiation.
import type { HearingBand } from '../../../shared/senses.js';
import { FULL_BAND_HZ, GATE, SMOOTHING, levelFromRms, rmsOf, type VoiceTarget } from './rules.js';

/** One listener's copy of our voice. */
interface Send {
  filter: BiquadFilterNode;
  gain: GainNode;
  dest: MediaStreamAudioDestinationNode;
  target: VoiceTarget;
  applied: { gain: number; hz: number };
}

/** What we send one listener (for `window.__voiceDebug`). */
export interface SendDebug {
  band: HearingBand;
  gain: number;
  lowpassHz: number;
  gainValue: number;
  lowpassValue: number;
}

const SILENT: VoiceTarget = { gain: 0, lowpassHz: FULL_BAND_HZ, band: 'silent' };

export const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

export class Outbound {
  private readonly sends = new Map<string, Send>();
  private readonly gate: GainNode;
  private readonly delay: DelayNode;
  private readonly analyser: AnalyserNode;
  private readonly buf: Float32Array<ArrayBuffer>;
  private mic: MediaStream | null = null;
  private src: MediaStreamAudioSourceNode | null = null;

  pushToTalk = false;
  talkKey = false;
  muted = false;
  /** Noise gate state (open mic mode). */
  gateOpen = false;
  private holdUntil = 0;
  /** Smoothed input level 0..1 (pre-gate) and last raw dBFS. */
  inputLevel = 0;
  inputDb = -120;
  private lastTick = 0;
  private gateTarget = 0;

  constructor(private readonly ctx: AudioContext) {
    this.gate = ctx.createGain();
    this.gate.gain.value = 0;
    this.delay = ctx.createDelay(0.2);
    this.delay.delayTime.value = GATE.lookahead;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0;
    this.buf = new Float32Array(this.analyser.fftSize);
    this.delay.connect(this.gate);
  }

  /** The stream and track to send listener `id`: silent until shape() says what they may hear. */
  sendFor(id: string): { stream: MediaStream; track: MediaStreamTrack } {
    let s = this.sends.get(id);
    if (!s) {
      const ctx = this.ctx;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = FULL_BAND_HZ;
      filter.Q.value = 0;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const dest = ctx.createMediaStreamDestination();
      dest.channelCount = 1;
      this.gate.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      s = { filter, gain, dest, target: SILENT, applied: { gain: 0, hz: FULL_BAND_HZ } };
      this.sends.set(id, s);
    }
    return { stream: s.dest.stream, track: s.dest.stream.getAudioTracks()[0] };
  }

  /** What listener `id` may hear of us now (rules.ts: sendTarget). */
  shape(id: string, target: VoiceTarget): void {
    const s = this.sends.get(id);
    if (!s) return;
    s.target = target;
    const t = this.ctx.currentTime;
    if (Math.abs(target.gain - s.applied.gain) > 0.002) {
      s.applied.gain = target.gain;
      s.gain.gain.setTargetAtTime(target.gain, t, SMOOTHING);
    }
    if (Math.abs(target.lowpassHz - s.applied.hz) / s.applied.hz > 0.01) {
      s.applied.hz = target.lowpassHz;
      s.filter.frequency.setTargetAtTime(target.lowpassHz, t, SMOOTHING);
    }
  }

  /** Stop sending to listener `id`. */
  release(id: string): void {
    const s = this.sends.get(id);
    if (!s) return;
    this.sends.delete(id);
    try { this.gate.disconnect(s.filter); } catch { /* already gone */ }
    try { s.filter.disconnect(); s.gain.disconnect(); } catch { /* already gone */ }
    for (const tr of s.dest.stream.getTracks()) tr.stop();
  }

  sendDebug(): Record<string, SendDebug> {
    const out: Record<string, SendDebug> = {};
    for (const [id, s] of this.sends) {
      out[id] = { band: s.target.band, gain: s.target.gain, lowpassHz: s.target.lowpassHz, gainValue: s.gain.gain.value, lowpassValue: s.filter.frequency.value };
    }
    return out;
  }

  get hasMic(): boolean {
    return !!this.src;
  }

  /** Ask for the mic. Resolves false when denied or unavailable (insecure origin, no device). */
  async acquire(isCancelled: () => boolean): Promise<boolean> {
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!md || typeof md.getUserMedia !== 'function') return false;
    let mic: MediaStream;
    try {
      mic = await md.getUserMedia({ audio: MIC_CONSTRAINTS, video: false });
    } catch {
      return false;
    }
    if (isCancelled() || mic.getAudioTracks().length === 0) {
      for (const t of mic.getTracks()) t.stop();
      return false;
    }
    this.mic = mic;
    this.src = this.ctx.createMediaStreamSource(mic);
    this.src.connect(this.analyser);
    this.src.connect(this.delay);
    return true;
  }

  /** Are we sending voice right now (gate open or talk key held, not muted)? */
  get transmitting(): boolean {
    if (this.muted || !this.src) return false;
    return this.pushToTalk ? this.talkKey : this.gateOpen;
  }

  /** Run the gate. Called every ~20 ms. */
  tick(nowMs: number): void {
    if (!this.src) return;
    const dt = this.lastTick ? Math.min(1, (nowMs - this.lastTick) / 1000) : 0.02;
    this.lastTick = nowMs;
    this.analyser.getFloatTimeDomainData(this.buf);
    const rms = rmsOf(this.buf);
    this.inputDb = rms > 0 ? 20 * Math.log10(rms) : -120;
    const lvl = levelFromRms(rms);
    // Fast attack, ~150 ms release, so meters do not flicker.
    this.inputLevel = lvl >= this.inputLevel ? lvl : Math.max(lvl, this.inputLevel * Math.exp(-dt / 0.15));
    if (this.inputDb >= GATE.openDb) {
      this.gateOpen = true;
      this.holdUntil = nowMs + GATE.holdMs;
    } else if (this.gateOpen && this.inputDb < GATE.closeDb && nowMs >= this.holdUntil) {
      this.gateOpen = false;
    } else if (this.gateOpen && this.inputDb >= GATE.closeDb) {
      this.holdUntil = Math.max(this.holdUntil, nowMs + GATE.holdMs * 0.5);
    }
    this.apply();
  }

  /** Push the gate gain toward open (1) or closed (0). */
  apply(): void {
    const target = this.transmitting ? 1 : 0;
    if (target === this.gateTarget) return;
    this.gateTarget = target;
    const t = this.ctx.currentTime;
    this.gate.gain.setTargetAtTime(target, t, target > 0 ? GATE.attack : GATE.release);
  }

  /** Level 0..1 of what we send (0 while the gate is closed / PTT up / muted). */
  level(): number {
    return this.transmitting ? this.inputLevel : 0;
  }

  get gateGain(): number {
    return this.gate.gain.value;
  }

  stop(): void {
    try { this.src?.disconnect(); } catch { /* already gone */ }
    for (const t of this.mic?.getTracks() ?? []) t.stop();
    this.mic = null;
    this.src = null;
    for (const id of [...this.sends.keys()]) this.release(id);
    try { this.gate.disconnect(); this.delay.disconnect(); } catch { /* already gone */ }
  }
}
