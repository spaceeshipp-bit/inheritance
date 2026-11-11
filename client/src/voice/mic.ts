// Our own outbound voice: mic → (analyser) + look-ahead delay → gate gain →
// MediaStreamAudioDestinationNode. The destination's track is what every peer
// connection sends, so it exists (silent) even when the mic is denied, and the
// gate / push-to-talk / mute never need a renegotiation.
import { GATE, levelFromRms, rmsOf } from './rules.js';

export const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

export class Outbound {
  readonly dest: MediaStreamAudioDestinationNode;
  readonly stream: MediaStream;
  readonly track: MediaStreamTrack;
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
    this.dest = ctx.createMediaStreamDestination();
    this.dest.channelCount = 1;
    this.gate = ctx.createGain();
    this.gate.gain.value = 0;
    this.delay = ctx.createDelay(0.2);
    this.delay.delayTime.value = GATE.lookahead;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0;
    this.buf = new Float32Array(this.analyser.fftSize);
    this.delay.connect(this.gate);
    this.gate.connect(this.dest);
    this.stream = this.dest.stream;
    this.track = this.stream.getAudioTracks()[0];
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
    try { this.gate.disconnect(); this.delay.disconnect(); } catch { /* already gone */ }
    this.track.stop();
  }
}
