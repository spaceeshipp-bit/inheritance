// Test page for client/src/voice: wires the real VoiceManager to the tiny relay
// exactly the way client/src/main.ts wires it to the game server (signals that
// arrive before start() resolves are queued, then setPeers + flush), and feeds it
// a "scene" (VoiceUpdate) every animation frame that run.mjs sets.
//
// Query: ?id=ID [&delay=ms before start()] [&nomic=1: getUserMedia is denied]
//        [&autoplay=block: AudioContexts start suspended and resume() only works
//         inside a real input event, like Chrome's autoplay policy on a page the
//         user has not touched; headless Chromium does not enforce that itself]
import type { RtcSignal } from '../../../shared/protocol.js';
import { createVoice, type VoiceUpdate } from '../../../client/src/voice/index.js';

const q = new URLSearchParams(location.search);
const id = q.get('id') ?? 'p0';
const delay = Number(q.get('delay') ?? 0);
if (q.get('nomic')) {
  // Simulates the user clicking "Block" on the mic prompt.
  navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
}
if (q.get('autoplay') === 'block') {
  const Native = window.AudioContext;
  const resume = Native.prototype.resume;
  const unlocked = new WeakSet<AudioContext>();
  // Only real input events count (Playwright's page.evaluate grants user
  // activation, so navigator.userActivation would be no test at all). These
  // listeners are registered before the voice module's, so they run first.
  let inGesture = false;
  for (const type of ['pointerdown', 'mousedown', 'keydown', 'touchend']) {
    window.addEventListener(type, (e) => {
      if (!e.isTrusted) return;
      inGesture = true;
      setTimeout(() => { inGesture = false; }, 0);
    }, { capture: true });
  }
  Native.prototype.resume = function (this: AudioContext) {
    // Without a gesture Chrome leaves the promise pending; so do we.
    if (!inGesture) return new Promise<void>(() => {});
    unlocked.add(this);
    return resume.call(this);
  };
  window.AudioContext = class extends Native {
    constructor(opts?: AudioContextOptions) {
      super(opts);
      // Keep it suspended (headless Chromium would start it) until a gesture resumes it.
      const hold = () => { if (!unlocked.has(this) && this.state === 'running') void this.suspend(); };
      this.addEventListener('statechange', hold);
      hold();
    }
  };
}

const voice = createVoice();
let ready = false;
let micOk: boolean | null = null;
let peers: string[] = [];
const pending: { from: string; data: RtcSignal }[] = [];
let scene: VoiceUpdate = { selfRole: 'lobby', listenerPos: { x: 0, y: 0, z: 0 }, listenerYaw: 0, aidActive: false, speakers: [] };

const ws = new WebSocket(`ws://${location.host}/ws?id=${encodeURIComponent(id)}`);
ws.onmessage = (e) => {
  const m = JSON.parse(String(e.data)) as { t: 'rtc'; from: string; data: RtcSignal } | { t: 'peers'; ids: string[] };
  if (m.t === 'rtc') {
    if (ready) voice.handleSignal(m.from, m.data);
    else pending.push({ from: m.from, data: m.data });
  } else if (m.t === 'peers') {
    peers = m.ids;
    if (ready) voice.setPeers(m.ids);
  }
};
ws.onopen = () => {
  setTimeout(() => {
    voice.start({ selfId: id, send: (to, data) => ws.send(JSON.stringify({ t: 'rtc', to, data })) })
      .then((r) => { micOk = r.micOk; }, () => { micOk = false; })
      .finally(() => {
        ready = true;
        voice.setPeers(peers);
        for (const p of pending.splice(0)) voice.handleSignal(p.from, p.data);
      });
  }, delay);
};

const loop = () => {
  voice.update(scene);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);

const pre = document.getElementById('out')!;
setInterval(() => {
  const d = window.__voiceDebug?.();
  if (!d) return;
  const rows = Object.entries(d.peers).map(([pid, p]) =>
    `${pid.padEnd(8)} ${p.connectionState.padEnd(12)} dc:${p.dcOpen ? 'open' : '-   '} band:${p.band.padEnd(8)} gain:${p.gain.toFixed(2)} lp:${Math.round(p.lowpassHz).toString().padStart(5)} lvl:${p.level.toFixed(2)} heard:${p.heard.toFixed(2)}`);
  pre.textContent = `${id}  role:${d.role}  ctx:${d.ctxState}  mic:${d.micOk}  self:${d.self.level.toFixed(2)} gate:${d.self.gateOpen ? 'open' : 'shut'}\n${rows.join('\n')}`;
}, 250);

declare global {
  interface Window {
    __h: {
      id: string;
      ready(): boolean;
      micOk(): boolean | null;
      setScene(u: VoiceUpdate): void;
      setWhisper(on: boolean): void;
      setPushToTalk(on: boolean): void;
      setTalkKey(down: boolean): void;
      setMuted(peer: string, muted: boolean): void;
      level(peer: string): number;
      stop(): void;
    };
  }
}

window.__h = {
  id,
  ready: () => ready,
  micOk: () => micOk,
  setScene: (u) => { scene = u; voice.update(u); },
  setWhisper: (on) => voice.setWhisper(on),
  setPushToTalk: (on) => voice.setPushToTalk(on),
  setTalkKey: (down) => voice.setTalkKey(down),
  setMuted: (peer, muted) => voice.setMuted(peer, muted),
  level: (peer) => voice.level(peer),
  stop: () => { voice.stop(); ready = false; ws.close(); },
};
