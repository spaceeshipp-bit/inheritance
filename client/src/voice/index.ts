// Proximity voice: a WebRTC full mesh (one RTCPeerConnection per peer, the lower
// id offers, signalling relayed by the game server as `rtc` messages) applying
// the game's hearing rules every frame, on both ends of each connection:
//
// - Sending (mic.ts, rules.ts sendTarget): each listener gets its own copy of
//   our voice with only what they may hear. Grandma's copy is already muffled
//   by her hearing (grandmaVoiceFilter, shared/senses.ts); nobody's copy carries
//   anything from beyond earshot (VOICE.cousinRange, VOICE.whisperRange). So a
//   client never receives more than its player may hear, and a modified client
//   cannot listen in (review S2).
// - Receiving (peer.ts): cousins fade each other with distance; Grandma plays
//   what she is sent as it is. Voices are placed with an HRTF panner. In the
//   lobby everyone hears everyone at full volume.
//
// Outbound: mic (echo cancellation, noise suppression, AGC) → noise gate or
// push-to-talk → one shaped send chain per peer. See docs/ARCHITECTURE.md, "Voice".
import type { RtcSignal } from '../../../shared/protocol.js';
import { dist } from '../../../shared/senses.js';
import type { Vec3 } from '../../../shared/types.js';
import { Outbound, type SendDebug } from './mic.js';
import { Peer, type PeerDebug, type PeerHost } from './peer.js';
import { FULL_BAND_HZ, relativeDirection, sendTarget, voiceTarget, type ListenerRole, type VoiceTarget } from './rules.js';

/** Another player, as our snapshot shows them: where their voice comes from, and who they are as a listener. */
export interface VoiceSpeaker {
  id: string;
  pos: Vec3;
  whispering: boolean;
  role?: 'grandma' | 'cousin';
  /** Grandma's hearing aid is on (visible to everyone). */
  aidActive?: boolean;
}

export interface VoiceUpdate {
  selfRole: 'grandma' | 'cousin' | 'lobby';
  listenerPos: Vec3;
  listenerYaw: number;
  aidActive: boolean;
  speakers: VoiceSpeaker[];
}

export interface VoiceManager {
  start(opts: { selfId: string; send: (to: string, data: RtcSignal) => void }): Promise<{ micOk: boolean }>;
  setPeers(ids: string[]): void;
  handleSignal(from: string, data: RtcSignal): void;
  update(p: VoiceUpdate): void;
  setWhisper(on: boolean): void;
  setPushToTalk(mode: boolean): void;
  setTalkKey(down: boolean): void;
  level(id: string | 'self'): number;
  setMuted(id: string, muted: boolean): void;
  stop(): void;
}

/** What `window.__voiceDebug()` returns (for tests and the console). */
export interface VoiceDebug {
  started: boolean;
  selfId: string;
  micOk: boolean | null;
  ctxState: AudioContextState | 'none';
  role: ListenerRole;
  aidActive: boolean;
  whisper: boolean;
  pushToTalk: boolean;
  talkKey: boolean;
  selfMuted: boolean;
  self: { level: number; inputDb: number; gateOpen: boolean; gateGain: number; transmitting: boolean };
  peers: Record<string, PeerDebug>;
  /** What we send each peer (their copy of our voice, shaped to what they may hear). */
  sends: Record<string, SendDebug>;
  /** Recent negotiation / recovery notes, newest last. */
  log: string[];
}

declare global {
  interface Window { __voiceDebug?: () => VoiceDebug }
}

/** A peer we were offered by but `setPeers` never confirmed is dropped after this long (ms). */
const ADHOC_TTL_MS = 15000;
/** Ignore a snapshot's stale `whispering` this long after the data channel said "stopped" (ms). */
const WHISPER_RELEASE_GRACE_MS = 600;
const GESTURES = ['pointerdown', 'keydown', 'touchend', 'mousedown'] as const;
const AHEAD = { x: 0, y: 0, z: -1 };
/** Played as it arrives: the sender already shaped it (what Grandma is sent). */
const AS_SENT: VoiceTarget = { gain: 1, lowpassHz: FULL_BAND_HZ, band: 'clear' };

class Voice implements VoiceManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private out: Outbound | null = null;
  private peers = new Map<string, Peer>();
  private wanted: string[] = [];
  private early: { from: string; data: RtcSignal }[] = [];
  private selfId = '';
  private send: ((to: string, data: RtcSignal) => void) | null = null;
  private started = false;
  private generation = 0;
  private micOk: boolean | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastWatchdog = 0;
  private gestureArmed = false;
  private mutedIds = new Set<string>();
  private logLines: string[] = [];

  private whisper = false;
  private pushToTalk = false;
  private talkKey = false;
  private selfMuted = false;
  private lastUpdate: VoiceUpdate | null = null;

  constructor() {
    if (typeof window !== 'undefined') window.__voiceDebug = () => this.debug();
  }

  async start(opts: { selfId: string; send: (to: string, data: RtcSignal) => void }): Promise<{ micOk: boolean }> {
    if (this.ctx) this.stop();
    const gen = ++this.generation;
    this.selfId = opts.selfId;
    this.send = opts.send;
    this.micOk = null;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    const out = new Outbound(ctx);
    out.pushToTalk = this.pushToTalk;
    out.talkKey = this.talkKey;
    out.muted = this.selfMuted;
    this.out = out;
    this.ensureRunning();

    const micOk = await out.acquire(() => gen !== this.generation);
    if (gen !== this.generation) return { micOk: false }; // stopped while waiting for the mic
    this.micOk = micOk;
    this.note(micOk ? 'mic ok' : 'no mic: receive only');
    this.started = true;
    this.timer = setInterval(() => this.tick(), 20);
    this.ensureRunning();
    // Anything that arrived before we were ready.
    if (this.wanted.length) this.setPeers(this.wanted);
    for (const s of this.early.splice(0)) this.handleSignal(s.from, s.data);
    if (this.lastUpdate) this.update(this.lastUpdate);
    return { micOk };
  }

  private note(msg: string): void {
    this.logLines.push(`${(performance.now() / 1000).toFixed(2)} ${msg}`);
    if (this.logLines.length > 60) this.logLines.splice(0, this.logLines.length - 60);
  }

  private host(id: string): PeerHost {
    const ctx = this.ctx!, out = this.out!;
    const send = out.sendFor(id);
    return {
      ctx,
      master: this.master!,
      outStream: send.stream,
      outTrack: send.track,
      send: (to, data) => this.send?.(to, data),
      ourWhisper: () => this.whisper,
      log: (msg) => this.note(msg),
    };
  }

  private addPeer(id: string): Peer {
    const p = new Peer(id, this.selfId, this.host(id));
    p.muted = this.mutedIds.has(id);
    this.peers.set(id, p);
    this.note(`peer ${id} added (${p.polite ? 'waits for offer' : 'offers'})`);
    return p;
  }

  setPeers(ids: string[]): void {
    const want = [...new Set(ids)].filter((id) => id && id !== this.selfId);
    this.wanted = want;
    if (!this.started) return;
    for (const [id, p] of this.peers) {
      if (!want.includes(id)) {
        p.close();
        this.peers.delete(id);
        this.out?.release(id);
        this.note(`peer ${id} removed`);
      }
    }
    for (const id of want) {
      const p = this.peers.get(id);
      if (p) p.adhoc = false;
      else this.addPeer(id);
    }
    if (this.lastUpdate) this.update(this.lastUpdate);
  }

  handleSignal(from: string, data: RtcSignal): void {
    if (!from || from === this.selfId) return;
    if (!this.started) {
      if (this.early.length < 500) this.early.push({ from, data });
      return;
    }
    let p = this.peers.get(from);
    if (!p) {
      // An offer from someone `setPeers` has not listed (yet): accept it; the next
      // setPeers (or the ad-hoc timeout) decides whether the connection stays.
      if (data.type !== 'offer') return;
      p = this.addPeer(from);
      p.adhoc = true;
      if (this.lastUpdate) this.update(this.lastUpdate);
    }
    p.handle(data);
  }

  update(u: VoiceUpdate): void {
    this.lastUpdate = u;
    if (!this.started || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ensureRunning();
    const role: ListenerRole = u.selfRole;
    const now = performance.now();
    const byId = new Map<string, VoiceSpeaker>();
    for (const s of u.speakers) byId.set(s.id, s);
    const out = this.out;
    for (const [id, p] of this.peers) {
      const s = byId.get(id);
      // What we send them: only what they may hear of us.
      const d = s ? dist(u.listenerPos, s.pos) : Infinity;
      out?.shape(id, sendTarget(role, s?.role ? { role: s.role, d, aidActive: !!s.aidActive } : null, this.whisper));
      // What we hear of them.
      if (role === 'lobby') {
        p.apply(voiceTarget('lobby', 0, false, false), AHEAD, null);
        continue;
      }
      if (role === 'grandma') {
        // Cousins send Grandma only what she may hear: play it as it comes, from where they are if she knows.
        p.apply(AS_SENT, s ? relativeDirection(u.listenerPos, u.listenerYaw, s.pos) : AHEAD, s ? d : null);
        continue;
      }
      if (!s) {
        // In a match we do not know where they are: keep them silent.
        p.apply({ gain: 0, lowpassHz: FULL_BAND_HZ, band: 'silent' }, AHEAD, null);
        continue;
      }
      // The speaker's own data-channel flag is instant; the snapshot flag lags a
      // little, so right after the speaker stops whispering we trust the channel.
      const snapWhisper = s.whispering && !(p.dcOpen && now - p.remoteWhisperOffAt < WHISPER_RELEASE_GRACE_MS);
      const whispering = p.remoteWhisper || snapWhisper;
      const target = voiceTarget(role, d, whispering, u.aidActive);
      p.apply(target, relativeDirection(u.listenerPos, u.listenerYaw, s.pos), d);
    }
  }

  setWhisper(on: boolean): void {
    if (this.whisper === on) return;
    this.whisper = on;
    for (const p of this.peers.values()) p.sendWhisper(on);
  }

  setPushToTalk(mode: boolean): void {
    this.pushToTalk = mode;
    if (this.out) { this.out.pushToTalk = mode; this.out.apply(); }
  }

  setTalkKey(down: boolean): void {
    this.talkKey = down;
    if (this.out) { this.out.talkKey = down; this.out.apply(); }
    if (down) this.ensureRunning();
  }

  level(id: string): number {
    if (id === 'self' || id === this.selfId) return this.out && this.started ? this.out.level() : 0;
    return this.peers.get(id)?.level() ?? 0;
  }

  /** Mute a peer locally ('self' or our own id mutes our mic instead). */
  setMuted(id: string, muted: boolean): void {
    if (id === 'self' || (id && id === this.selfId)) {
      this.selfMuted = muted;
      if (this.out) { this.out.muted = muted; this.out.apply(); }
      return;
    }
    if (muted) this.mutedIds.add(id);
    else this.mutedIds.delete(id);
    const p = this.peers.get(id);
    if (p) {
      p.muted = muted;
      if (this.lastUpdate) this.update(this.lastUpdate);
    }
  }

  stop(): void {
    this.generation++;
    this.started = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    for (const p of this.peers.values()) p.close();
    this.peers.clear();
    this.early = [];
    this.wanted = [];
    this.lastUpdate = null;
    this.out?.stop();
    this.out = null;
    this.disarmGesture();
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx && ctx.state !== 'closed') ctx.close().catch(() => { /* already closed */ });
    this.micOk = null;
    this.send = null;
    this.note('stopped');
  }

  // ───────────────────────── Internals ─────────────────────────

  private tick(): void {
    const now = performance.now();
    this.out?.tick(now);
    if (now - this.lastWatchdog < 1000) return;
    this.lastWatchdog = now;
    for (const [id, p] of this.peers) {
      if (p.adhoc && now - p.createdAt > ADHOC_TTL_MS && p.pc.connectionState !== 'connected') {
        p.close();
        this.peers.delete(id);
        this.out?.release(id);
        this.note(`ad-hoc peer ${id} dropped`);
        continue;
      }
      p.watchdog(now);
    }
  }

  /** Resume the AudioContext now, or on the next user gesture if the browser refuses. */
  private ensureRunning(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'suspended') return;
    ctx.resume().catch(() => { /* needs a gesture */ });
    this.armGesture();
  }

  private readonly onGesture = (): void => {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') { this.disarmGesture(); return; }
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => { if (ctx.state === 'running') this.disarmGesture(); }, () => { /* next gesture */ });
    } else {
      this.disarmGesture();
    }
  };

  private armGesture(): void {
    if (this.gestureArmed || typeof window === 'undefined') return;
    this.gestureArmed = true;
    for (const g of GESTURES) window.addEventListener(g, this.onGesture, { capture: true });
  }

  private disarmGesture(): void {
    if (!this.gestureArmed || typeof window === 'undefined') return;
    this.gestureArmed = false;
    for (const g of GESTURES) window.removeEventListener(g, this.onGesture, { capture: true });
  }

  debug(): VoiceDebug {
    const out = this.out;
    const peers: Record<string, PeerDebug> = {};
    for (const [id, p] of this.peers) peers[id] = p.debug();
    return {
      started: this.started,
      selfId: this.selfId,
      micOk: this.micOk,
      ctxState: this.ctx?.state ?? 'none',
      role: this.lastUpdate?.selfRole ?? 'lobby',
      aidActive: !!this.lastUpdate?.aidActive,
      whisper: this.whisper,
      pushToTalk: this.pushToTalk,
      talkKey: this.talkKey,
      selfMuted: this.selfMuted,
      self: {
        level: this.level('self'),
        inputDb: out?.inputDb ?? -120,
        gateOpen: !!out?.gateOpen,
        gateGain: out?.gateGain ?? 0,
        transmitting: !!out?.transmitting,
      },
      peers,
      sends: out?.sendDebug() ?? {},
      log: [...this.logLines],
    };
  }
}

export function createVoice(): VoiceManager {
  return new Voice();
}
