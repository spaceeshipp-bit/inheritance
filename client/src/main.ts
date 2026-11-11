// Boot: title (name + room) -> lobby -> match -> results -> lobby.
// URL ?room=CODE&name=NAME pre-fills and auto-joins. In dev, ?mock=grandma or
// ?mock=cousin runs against an offline fake server (src/dev/mock.ts).
import './style.css';
import type { ServerMsg, RtcSignal } from '../../shared/protocol.js';
import { Sfx } from './audio/sfx.js';
import { Game } from './game.js';
import { Hud } from './hud/hud.js';
import { Screens } from './hud/screens.js';
import { Input } from './input.js';
import { BoundedQueue, Net, lobbyEndsOurMatch, simulatedLink, webSocketLink, type LinkFactory } from './net.js';
import { parseNetSim } from '../../shared/netsim.js';
import { GameRenderer } from './render/scene.js';
import { Settings } from './settings.js';
import { GameState } from './state.js';
import { createVoice } from './voice/index.js';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const mockRole = import.meta.env.DEV ? params.get('mock') : null;
  let factory: LinkFactory = webSocketLink();
  if (mockRole) {
    const { mockLink } = await import('./dev/mock.js');
    factory = mockLink({ role: mockRole === 'grandma' ? 'grandma' : 'cousin', phase: params.get('phase') ?? 'visit', params });
  }
  // ?netsim=150,20,2: play through a simulated slow, lossy connection (round trip ms, jitter ms, loss %).
  const netsim = parseNetSim(params.get('netsim'));
  if (netsim) {
    factory = simulatedLink(factory, netsim);
    console.info(`[netsim] ${netsim.rtt * 1000} ms round trip, ±${netsim.jitter * 1000} ms, ${netsim.loss * 100}% loss`);
  }

  const state = new GameState();
  const net = new Net(factory);
  const sfx = new Sfx();
  const voice = createVoice();
  const settings = new Settings();
  const renderer = new GameRenderer($('stage'), settings.get().quality);
  const input = new Input(renderer.canvas);
  const hud = new Hud($('hud'), $('labels'), $('overlay'), state);
  // Settings: applied now and whenever they change (the HUD's settings panel writes them).
  hud.settings = settings;
  const applySettings = () => {
    const s = settings.get();
    renderer.setQuality(s.quality);
    input.applySettings(s);
    sfx.applySettings(s);
  };
  applySettings();
  settings.onChange(applySettings);

  // Voice: started once we know our id (after the Join click); signals that
  // arrive before it is ready are queued (a bounded queue, emptied on leave).
  let voiceSelf = '';
  let voiceReady = false;
  let micOk: boolean | null = null;
  let peers: string[] = [];
  const pending = new BoundedQueue<{ from: string; data: RtcSignal }>(200);
  const startVoice = (selfId: string) => {
    if (voiceSelf === selfId) return;
    if (voiceSelf) { voice.stop(); voiceReady = false; }
    voiceSelf = selfId;
    voice.start({ selfId, send: (to, data) => net.send({ t: 'rtc', to, data }) })
      .then((r) => { micOk = r.micOk; }, () => { micOk = false; })
      .finally(() => {
        if (voiceSelf !== selfId) return;
        voiceReady = true;
        voice.setPeers(peers);
        for (const p of pending.drain()) voice.handleSignal(p.from, p.data);
      });
  };

  const game = new Game({
    state, send: (m) => net.send(m), serverNow: () => net.serverNow(), renderer, hud, input, sfx, voice,
    micOk: () => micOk === true,
  });

  /**
   * Drop a match this client still shows but is no longer in: it ended while we
   * were away, it went on without us (we were replaced or back too late), or
   * this tab lost its seat to another tab.
   */
  const endStaleMatch = () => {
    if (!state.match) return;
    game.end();
    state.match = null;
    state.buf = [];
    state.phase = 'lobby';
  };
  const stopVoice = () => {
    voice.stop();
    voiceSelf = '';
    voiceReady = false;
    pending.clear();
    peers = [];
  };
  /** Back to the title: no match, no voice, nothing queued. */
  const toTitle = () => {
    endStaleMatch();
    stopVoice();
    state.lobby = null;
    screens.showTitle();
  };

  let myName = '';
  const join = (name: string, room: string, gesture = true) => {
    if (gesture) sfx.unlock();
    myName = name;
    screens.error('');
    net.connect(name, room);
  };
  const screens = new Screens($('screens'), {
    join: (name, room) => join(name, room),
    create: (name) => join(name, ''),
    willing: (on) => net.send({ t: 'lobby', willingGrandma: on }),
    options: (o) => net.send({ t: 'lobby', options: o }),
    start: () => { sfx.unlock(); net.send({ t: 'start' }); },
    pushToTalk: (on) => voice.setPushToTalk(on),
    leave: () => {
      net.leave();
      toTitle();
      history.replaceState(null, '', location.pathname + (mockRole ? `?mock=${mockRole}` : ''));
    },
    // Take the seat back from the other tab (that tab is told it is open elsewhere).
    reclaim: () => { if (myName && net.room) join(myName, net.room); },
  });

  net.onStatus = (s) => {
    hud.setNet(s);
    screens.setNetStatus(s);
    if (s === 'replaced') {
      // Another tab joined with our rejoin token and holds the seat now.
      toTitle();
      screens.showReplaced();
    } else if (s === 'closed' && (state.lobby || state.match)) {
      // The server turned us away (its error is on screen) or we left.
      toTitle();
    }
  };
  net.onMessage = (m: ServerMsg) => {
    if (m.t === 'rtc') {
      if (voiceReady) voice.handleSignal(m.from, m.data);
      else pending.push({ from: m.from, data: m.data });
      return;
    }
    if (m.t === 'peers') {
      peers = m.ids;
      if (voiceReady) voice.setPeers(m.ids);
      return;
    }
    state.ingest(m);
  };

  state.on('welcome', ({ you, room }) => {
    screens.setSelf(you);
    startVoice(you);
    const q = new URLSearchParams(location.search);
    q.set('room', room);
    if (myName) q.set('name', myName);
    history.replaceState(null, '', `${location.pathname}?${q.toString()}`);
  });
  state.on('error', (msg) => {
    screens.error(msg);
    if (state.inMatch) hud.toasts.push(msg, 'bad');
  });
  state.on('lobby', (m) => {
    // No match running, or one we are not in, while we still show a match: it
    // ended or went on without us (e.g. we rejoined after it finished).
    if (state.match && lobbyEndsOurMatch(m)) endStaleMatch();
    screens.updateLobby(m);
    if (!state.inMatch) screens.showLobby();
  });
  state.on('match', () => {
    screens.hide();
    game.begin();
  });
  state.on('phase', (p) => {
    if (p.phase === 'lobby') {
      game.end();
      if (state.lobby) screens.updateLobby(state.lobby);
      screens.showLobby();
    } else {
      if (state.match) screens.hide();
      game.onPhase(p);
    }
  });
  state.on('ev', (ev) => game.onEvent(ev));
  state.on('results', () => { /* overlay picks it up */ });

  // Unlock audio on the first interaction even when auto-joined from the URL.
  const unlock = () => sfx.unlock();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  let last = performance.now();
  const loop = (ts: number) => {
    const dt = Math.min(0.1, Math.max(0, (ts - last) / 1000));
    renderer.adapt(ts - last);
    last = ts;
    const inMatch = !!state.match && state.phase !== 'lobby';
    hud.setVisible(inMatch);
    if (inMatch) {
      game.frame(dt);
    } else {
      renderer.frameIdle(ts / 1000);
      screens.frame();
      screens.mic(voice.level('self'), voiceSelf ? micOk : null);
      voice.update({ selfRole: 'lobby', listenerPos: { x: 0, y: 0, z: 0 }, listenerYaw: 0, aidActive: false, speakers: [] });
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // Auto-join from the URL (?room=CODE&name=NAME), or straight into the mock.
  const urlName = params.get('name') ?? '';
  const urlRoom = (params.get('room') ?? '').toUpperCase();
  screens.prefill(urlName, urlRoom);
  if (mockRole) join(urlName || (mockRole === 'grandma' ? 'Agatha' : 'You'), urlRoom || 'MOCK1', false);
  else if (urlName && urlRoom) join(urlName, urlRoom, false);

  (window as unknown as { __inh: unknown }).__inh = { state, net, input, renderer, settings };
  // The game is up: fade out the boot splash (index.html).
  const splash = document.getElementById('boot');
  if (splash) {
    splash.classList.add('gone');
    setTimeout(() => splash.remove(), 450);
  }
}

boot().catch((err: unknown) => {
  // Say so on the splash instead of leaving a blank page (most often: no WebGL).
  console.error('[boot]', err);
  const splash = document.getElementById('boot');
  if (!splash) return;
  splash.querySelector('.dots')?.remove();
  const msg = document.createElement('div');
  msg.className = 'err';
  const webgl = /webgl/i.test(String(err));
  msg.textContent = webgl
    ? 'Inheritance needs WebGL, and this browser could not start it. Try an up-to-date Chrome, Edge or Firefox, with hardware acceleration on.'
    : `Inheritance could not start: ${err instanceof Error ? err.message : String(err)}. Reloading the page usually helps.`;
  splash.appendChild(msg);
});
