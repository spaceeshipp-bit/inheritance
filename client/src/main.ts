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
import { Net, webSocketLink, type LinkFactory } from './net.js';
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

  const state = new GameState();
  const net = new Net(factory);
  const sfx = new Sfx();
  const voice = createVoice();
  const settings = new Settings();
  const renderer = new GameRenderer($('stage'), settings.get().quality);
  settings.onChange((s) => renderer.setQuality(s.quality));
  const input = new Input(renderer.canvas);
  const hud = new Hud($('hud'), $('labels'), $('overlay'), state);

  // Voice: started once we know our id (after the Join click); signals that
  // arrive before it is ready are queued.
  let voiceSelf = '';
  let voiceReady = false;
  let micOk: boolean | null = null;
  let peers: string[] = [];
  const pending: { from: string; data: RtcSignal }[] = [];
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
        for (const p of pending.splice(0)) voice.handleSignal(p.from, p.data);
      });
  };

  const game = new Game({
    state, send: (m) => net.send(m), serverNow: () => net.serverNow(), renderer, hud, input, sfx, voice,
    micOk: () => micOk === true,
  });

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
      voice.stop();
      voiceSelf = '';
      voiceReady = false;
      game.end();
      state.match = null;
      state.lobby = null;
      history.replaceState(null, '', location.pathname + (mockRole ? `?mock=${mockRole}` : ''));
      screens.showTitle();
    },
  });

  net.onStatus = (s) => hud.setNet(s);
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
}

void boot();
