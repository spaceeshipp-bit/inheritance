// One remote voice peer: its RTCPeerConnection (rebuilt when needed) and its
// receive graph
//   MediaStreamAudioSourceNode → BiquadFilter (lowpass) → GainNode → PannerNode (HRTF) → master
// plus a raw-level analyser on the source and a "heard" analyser after the gain.
//
// Negotiation is the W3C "perfect negotiation" pattern, with every step (making
// an offer, applying a remote description, adding candidates) run one at a time
// on a per-peer queue so nothing interleaves. The lower id is the impolite side
// and makes the first offer; the higher id is polite: it waits for that offer and
// only offers on its own (a fallback) if none arrived after a few seconds.
// Collisions (glare) resolve as the spec describes: the impolite side ignores the
// colliding offer, the polite side rolls back and answers. Later renegotiation
// (ICE restarts) works from either side the same way. A description from a new
// remote session (the peer reloaded and kept its id) or one that cannot be applied
// rebuilds the connection; a fresh connection then takes the offer.
import type { RtcSignal } from '../../../shared/protocol.js';
import { FULL_BAND_HZ, SMOOTHING, levelFromRms, rmsOf, type VoiceTarget } from './rules.js';

export const STUN_URL = 'stun:stun.l.google.com:19302';
/** The polite side offers itself if no offer arrived this long after the connection was created (ms). */
const POLITE_FALLBACK_MS = 4000;
/** Watchdog: ICE restart when disconnected/failed this long (ms); rebuild if still failed after REBUILD_MS. */
const RESTART_MS = 5000;
const REBUILD_MS = 20000;
/** Connected but the data channel never opened (broken SCTP after a remote restart): rebuild (ms). */
const NO_DC_MS = 8000;

/** The session id from an SDP's o= line; it changes only when the remote starts a new RTCPeerConnection. */
export function sdpSession(sdp: string): string | null {
  const m = /^o=\S+ (\S+) /m.exec(sdp);
  return m ? m[1] : null;
}

export interface PeerHost {
  ctx: AudioContext;
  master: AudioNode;
  outStream: MediaStream;
  outTrack: MediaStreamTrack;
  send(to: string, data: RtcSignal): void;
  /** Our own whisper state, sent over the data channel when it opens. */
  ourWhisper(): boolean;
  /** Called when a remote voice track starts (or changes). */
  log?(msg: string): void;
}

export interface PeerDebug {
  polite: boolean;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  signalingState: RTCSignalingState;
  dcOpen: boolean;
  hasStream: boolean;
  remoteWhisper: boolean;
  muted: boolean;
  distance: number | null;
  band: string;
  /** Targets set by the proximity rules. */
  gain: number;
  lowpassHz: number;
  /** Current AudioParam values (what is actually being applied). */
  gainValue: number;
  lowpassValue: number;
  /** Raw voice activity 0..1 of the received stream, and level after filter + gain. */
  level: number;
  heard: number;
  /** The same as instantaneous RMS in dBFS (not smoothed, not clamped). */
  levelDb: number;
  heardDb: number;
  /** Direction the panner places this voice, listener space (+X right, +Y up, -Z ahead). */
  pan: { x: number; y: number; z: number };
  rebuilds: number;
  iceRestarts: number;
  offersSent: number;
  offersIgnored: number;
  rollbacks: number;
}

export class Peer {
  readonly polite: boolean;
  pc!: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private restartPending = false;
  private queue: Promise<void> = Promise.resolve();
  private pendingIce: RTCIceCandidateInit[] = [];
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private badSince = 0;
  private noDcSince = 0;
  private lastRestart = 0;
  private closed = false;

  // Receive graph.
  private readonly lowpass: BiquadFilterNode;
  private readonly gainNode: GainNode;
  private readonly panner: PannerNode;
  private readonly analyser: AnalyserNode;
  private readonly heardAnalyser: AnalyserNode;
  private readonly buf: Float32Array<ArrayBuffer>;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;

  // Proximity state.
  target: VoiceTarget = { gain: 0, lowpassHz: FULL_BAND_HZ, band: 'silent' };
  distance: number | null = null;
  muted = false;
  private applied = { gain: -1, hz: -1, x: 9, y: 9, z: 9 };

  // Remote whisper flag from the data channel (lower latency than snapshots).
  remoteWhisper = false;
  remoteWhisperOffAt = 0;

  // Levels (computed lazily, at most once per ~15 ms).
  private lvl = 0;
  private heardLvl = 0;
  private lvlDb = -120;
  private heardDb = -120;
  private lvlAt = 0;

  // Counters for the debug hook.
  stats = { rebuilds: 0, iceRestarts: 0, offersSent: 0, offersIgnored: 0, rollbacks: 0 };
  /** Created from an incoming offer before `setPeers` listed this id. */
  adhoc = false;
  readonly createdAt = performance.now();

  constructor(readonly id: string, selfId: string, private readonly host: PeerHost) {
    this.polite = selfId > id;
    const ctx = host.ctx;
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = FULL_BAND_HZ;
    this.lowpass.Q.value = 0;
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0;
    this.panner = new PannerNode(ctx, {
      panningModel: 'HRTF',
      // Distance attenuation is ours (rules.ts); the panner only places the voice.
      distanceModel: 'inverse', refDistance: 1, rolloffFactor: 0,
      positionX: 0, positionY: 0, positionZ: -1,
    });
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0;
    this.heardAnalyser = ctx.createAnalyser();
    this.heardAnalyser.fftSize = 1024;
    this.heardAnalyser.smoothingTimeConstant = 0;
    this.buf = new Float32Array(1024);
    this.lowpass.connect(this.gainNode);
    this.gainNode.connect(this.panner);
    this.gainNode.connect(this.heardAnalyser);
    this.panner.connect(host.master);
    this.createPc();
  }

  // ───────────────────────── Connection ─────────────────────────

  private createPc(): void {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: STUN_URL }] });
    this.pc = pc;
    this.restartPending = false;
    this.pendingIce = [];
    this.badSince = 0;
    this.noDcSince = 0;
    pc.addTrack(this.host.outTrack, this.host.outStream);
    const dc = pc.createDataChannel('voice', { negotiated: true, id: 0, ordered: true });
    this.dc = dc;
    dc.onopen = () => {
      if (this.dc !== dc) return;
      this.sendWhisper(this.host.ourWhisper());
    };
    dc.onmessage = (e) => {
      if (this.dc !== dc || typeof e.data !== 'string') return;
      try {
        const m = JSON.parse(e.data) as { w?: unknown };
        if (typeof m.w === 'boolean') this.setRemoteWhisper(m.w);
      } catch { /* ignore junk */ }
    };
    dc.onclose = () => {
      if (this.dc === dc) this.setRemoteWhisper(false);
    };

    pc.onicecandidate = (e) => {
      if (this.pc !== pc) return;
      this.host.send(this.id, { type: 'ice', candidate: e.candidate ? e.candidate.toJSON() : null });
    };
    pc.onnegotiationneeded = () => {
      if (this.pc !== pc) return;
      // "Lower id offers": the polite (higher id) side waits for the first offer.
      if (this.polite && !pc.currentRemoteDescription) {
        this.armFallback(pc);
        return;
      }
      this.enqueue(() => this.negotiate(pc));
    };
    pc.ontrack = (e) => {
      if (this.pc !== pc || e.track.kind !== 'audio') return;
      this.attach(e.streams[0] ?? new MediaStream([e.track]));
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      if (pc.connectionState === 'connected') this.badSince = 0;
    };
  }

  private armFallback(pc: RTCPeerConnection): void {
    if (this.fallbackTimer) return;
    this.fallbackTimer = setTimeout(() => {
      this.fallbackTimer = null;
      if (this.closed || this.pc !== pc) return;
      if (pc.currentRemoteDescription || pc.signalingState !== 'stable') return;
      this.host.log?.(`voice: no offer from ${this.id}, offering myself`);
      this.enqueue(() => this.negotiate(pc));
    }, POLITE_FALLBACK_MS);
  }

  /** Does this connection still need an offer? (A queued negotiationneeded may be stale.) */
  private needsNegotiation(pc: RTCPeerConnection): boolean {
    if (this.restartPending) return true;
    if (!pc.currentLocalDescription || !pc.currentRemoteDescription) return true;
    for (const t of pc.getTransceivers()) {
      if (t.currentDirection === 'stopped') continue;
      if (!t.mid || t.currentDirection !== t.direction) return true;
    }
    return false;
  }

  private async negotiate(pc: RTCPeerConnection): Promise<void> {
    if (this.closed || this.pc !== pc || pc.signalingState !== 'stable') return;
    if (!this.needsNegotiation(pc)) return;
    await pc.setLocalDescription();
    const d = pc.localDescription;
    if (this.pc !== pc || !d || d.type !== 'offer') return;
    this.restartPending = false;
    this.stats.offersSent++;
    this.host.send(this.id, { type: 'offer', sdp: d.sdp });
  }

  /** Throw away the RTCPeerConnection and start a fresh one (the audio graph stays). */
  rebuild(): void {
    if (this.closed) return;
    this.stats.rebuilds++;
    this.closePc();
    this.createPc();
  }

  private closePc(): void {
    if (this.fallbackTimer) { clearTimeout(this.fallbackTimer); this.fallbackTimer = null; }
    const pc = this.pc;
    if (!pc) return;
    pc.onicecandidate = null;
    pc.onnegotiationneeded = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    try { this.dc?.close(); } catch { /* closed */ }
    this.dc = null;
    try { pc.close(); } catch { /* closed */ }
  }

  private enqueue(step: () => Promise<void>): void {
    this.queue = this.queue.then(step).catch((err) => {
      this.host.log?.(`voice: negotiation with ${this.id} failed: ${String(err)}`);
    });
  }

  /** Signals are handled strictly in arrival order. */
  handle(data: RtcSignal): void {
    this.enqueue(() => this.onSignal(data));
  }

  private async onSignal(data: RtcSignal): Promise<void> {
    if (this.closed) return;
    if (data.type === 'ice') {
      const c = data.candidate;
      if (!c || !c.candidate) return; // end-of-candidates: nothing to do
      const pc = this.pc;
      if (!pc.remoteDescription) {
        if (this.pendingIce.length < 200) this.pendingIce.push(c);
        return;
      }
      try {
        await pc.addIceCandidate(c);
      } catch {
        /* candidate for an ignored / rolled-back / replaced description */
      }
      return;
    }

    let pc = this.pc;
    const desc: RTCSessionDescriptionInit = { type: data.type, sdp: data.sdp };
    const incoming = sdpSession(data.sdp);
    const known = pc.currentRemoteDescription ? sdpSession(pc.currentRemoteDescription.sdp) : null;
    const restarted = !!known && !!incoming && known !== incoming;
    if (data.type === 'answer') {
      if (pc.signalingState !== 'have-local-offer') return; // stale answer
      if (restarted) {
        // A fresh remote connection answered our renegotiation: our old transport
        // (DTLS / SCTP) cannot follow it. Start over; the new connection re-offers.
        this.host.log?.(`voice: ${this.id} restarted (answer from a new session); rebuilding`);
        this.rebuild();
        return;
      }
      try {
        await pc.setRemoteDescription(desc);
      } catch (err) {
        this.host.log?.(`voice: bad answer from ${this.id}: ${String(err)}`);
        return;
      }
      await this.flushIce(pc);
      return;
    }

    // An offer from a new remote session: the peer reloaded and kept its id. Our
    // connection belongs to its old session, so take the offer on a fresh one.
    if (restarted) {
      this.host.log?.(`voice: ${this.id} restarted (offer from a new session); rebuilding`);
      this.rebuild();
      pc = this.pc;
    }

    // An offer. With every step queued, "collision" simply means our own offer is out.
    const collision = pc.signalingState !== 'stable';
    if (collision && !this.polite) {
      this.stats.offersIgnored++;
      return;
    }
    if (collision) this.stats.rollbacks++;
    try {
      await pc.setRemoteDescription(desc); // implicit rollback on the polite side
    } catch (err) {
      // Typically the peer restarted (new DTLS identity) while we kept the old
      // connection: start a fresh connection and take the offer there.
      this.host.log?.(`voice: offer from ${this.id} did not apply (${String(err)}); rebuilding`);
      this.rebuild();
      pc = this.pc;
      await pc.setRemoteDescription(desc);
    }
    await this.flushIce(pc);
    await pc.setLocalDescription();
    if (this.pc !== pc || !pc.localDescription) return;
    this.host.send(this.id, { type: 'answer', sdp: pc.localDescription.sdp });
  }

  private async flushIce(pc: RTCPeerConnection): Promise<void> {
    const list = this.pendingIce.splice(0);
    for (const c of list) {
      try { await pc.addIceCandidate(c); } catch { /* stale */ }
    }
  }

  /** Called about once a second: recover from failed / stuck connections. */
  watchdog(nowMs: number): void {
    if (this.closed) return;
    const pc = this.pc;
    const st = pc.connectionState;
    // Connected without a data channel means the SCTP association is broken (e.g.
    // the remote restarted and we followed it on the old transport).
    if (st === 'connected' && !this.dcOpen && pc.signalingState === 'stable') {
      if (!this.noDcSince) this.noDcSince = nowMs;
      if (nowMs - this.noDcSince > (this.polite ? NO_DC_MS * 2 : NO_DC_MS)) {
        this.host.log?.(`voice: connected to ${this.id} but no data channel; rebuilding`);
        this.rebuild();
        return;
      }
    } else {
      this.noDcSince = 0;
    }
    const bad = st === 'failed' || st === 'disconnected';
    if (!bad) { this.badSince = 0; return; }
    if (!this.badSince) this.badSince = nowMs;
    const badFor = nowMs - this.badSince;
    // The impolite side leads recovery; the polite side joins in if it stays broken.
    const lead = !this.polite || badFor > RESTART_MS * 2;
    if (lead && badFor > RESTART_MS && nowMs - this.lastRestart > RESTART_MS && pc.signalingState === 'stable') {
      this.lastRestart = nowMs;
      if (badFor > REBUILD_MS && st === 'failed') {
        this.host.log?.(`voice: connection to ${this.id} still failed; rebuilding`);
        this.rebuild(); // the new connection offers (impolite) or waits for an offer (polite)
        this.badSince = nowMs;
      } else {
        this.stats.iceRestarts++;
        this.restartPending = true;
        pc.restartIce(); // negotiationneeded follows with an ICE-restart offer
      }
    }
  }

  // ───────────────────────── Data channel ─────────────────────────

  sendWhisper(on: boolean): void {
    const dc = this.dc;
    if (dc && dc.readyState === 'open') {
      try { dc.send(JSON.stringify({ w: on })); } catch { /* closing */ }
    }
  }

  private setRemoteWhisper(on: boolean): void {
    if (this.remoteWhisper && !on) this.remoteWhisperOffAt = performance.now();
    this.remoteWhisper = on;
  }

  get dcOpen(): boolean {
    return this.dc?.readyState === 'open';
  }

  // ───────────────────────── Audio ─────────────────────────

  private attach(stream: MediaStream): void {
    if (this.closed) return;
    if (this.stream === stream && this.source) return;
    this.stream = stream;
    // Chrome only feeds a remote WebRTC stream into WebAudio while it is also
    // attached to a media element; a muted one is enough and plays nothing itself.
    if (!this.audioEl) {
      const el = document.createElement('audio');
      el.muted = true;
      el.autoplay = true;
      el.setAttribute('playsinline', '');
      el.dataset.voicePeer = this.id;
      this.audioEl = el;
    }
    this.audioEl.srcObject = stream;
    this.audioEl.play().catch(() => { /* muted autoplay; retried by the browser on gesture */ });
    try { this.source?.disconnect(); } catch { /* gone */ }
    this.source = this.host.ctx.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    this.source.connect(this.lowpass);
    this.host.log?.(`voice: receiving ${this.id}`);
  }

  /** Apply the proximity target and the speaker direction (listener space, unit vector). */
  apply(target: VoiceTarget, dir: { x: number; y: number; z: number }, distance: number | null): void {
    this.target = target;
    this.distance = distance;
    const ctx = this.host.ctx;
    const t = ctx.currentTime;
    const gain = this.muted ? 0 : target.gain;
    const a = this.applied;
    if (Math.abs(gain - a.gain) > 0.002) {
      a.gain = gain;
      this.gainNode.gain.setTargetAtTime(gain, t, SMOOTHING);
    }
    const hz = target.lowpassHz;
    if (a.hz < 0 || Math.abs(hz - a.hz) / a.hz > 0.01) {
      a.hz = hz;
      this.lowpass.frequency.setTargetAtTime(hz, t, SMOOTHING);
    }
    if (Math.abs(dir.x - a.x) + Math.abs(dir.y - a.y) + Math.abs(dir.z - a.z) > 0.01) {
      a.x = dir.x; a.y = dir.y; a.z = dir.z;
      const p = this.panner;
      if (p.positionX) {
        p.positionX.setTargetAtTime(dir.x, t, SMOOTHING);
        p.positionY.setTargetAtTime(dir.y, t, SMOOTHING);
        p.positionZ.setTargetAtTime(dir.z, t, SMOOTHING);
      } else {
        p.setPosition(dir.x, dir.y, dir.z);
      }
    }
  }

  private measure(): void {
    const now = performance.now();
    const dt = now - this.lvlAt;
    if (dt < 15) return;
    this.lvlAt = now;
    const decay = Math.exp(-Math.min(1000, dt) / 150);
    if (!this.source) { this.lvl = 0; this.heardLvl = 0; this.lvlDb = -120; this.heardDb = -120; return; }
    this.analyser.getFloatTimeDomainData(this.buf);
    const rms = rmsOf(this.buf);
    this.lvlDb = rms > 0 ? Math.max(-120, 20 * Math.log10(rms)) : -120;
    const raw = levelFromRms(rms);
    this.lvl = raw >= this.lvl ? raw : Math.max(raw, this.lvl * decay);
    this.heardAnalyser.getFloatTimeDomainData(this.buf);
    const hrms = rmsOf(this.buf);
    this.heardDb = hrms > 0 ? Math.max(-120, 20 * Math.log10(hrms)) : -120;
    const heard = levelFromRms(hrms);
    this.heardLvl = heard >= this.heardLvl ? heard : Math.max(heard, this.heardLvl * decay);
  }

  /** Voice activity 0..1 of what this peer sends (before proximity). */
  level(): number {
    this.measure();
    return this.lvl;
  }

  heard(): number {
    this.measure();
    return this.heardLvl;
  }

  debug(): PeerDebug {
    const pc = this.pc;
    return {
      polite: this.polite,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      signalingState: pc.signalingState,
      dcOpen: this.dcOpen,
      hasStream: !!this.source,
      remoteWhisper: this.remoteWhisper,
      muted: this.muted,
      distance: this.distance,
      band: this.target.band,
      gain: this.muted ? 0 : this.target.gain,
      lowpassHz: this.target.lowpassHz,
      gainValue: this.gainNode.gain.value,
      lowpassValue: this.lowpass.frequency.value,
      level: this.level(),
      heard: this.heard(),
      levelDb: this.lvlDb,
      heardDb: this.heardDb,
      pan: { x: this.applied.x, y: this.applied.y, z: this.applied.z },
      ...this.stats,
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.closePc();
    try { this.source?.disconnect(); } catch { /* gone */ }
    this.source = null;
    for (const n of [this.lowpass, this.gainNode, this.panner]) {
      try { n.disconnect(); } catch { /* gone */ }
    }
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.srcObject = null;
      this.audioEl = null;
    }
    this.stream = null;
  }
}
