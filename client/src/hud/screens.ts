// Title screen (name + room code, or create a room) and the lobby (players,
// willing-Grandma toggle, host options + Start, mic meter, push-to-talk).
import { MIN_PLAYERS } from '../../../shared/constants.js';
import type { MatchOptions } from '../../../shared/types.js';
import type { LobbyMsg } from '../state.js';
import { el, setStyle, setText, show } from '../util.js';
import { ICONS } from './icons.js';

export interface ScreenHandlers {
  join(name: string, room: string): void;
  create(name: string): void;
  willing(on: boolean): void;
  options(o: Partial<MatchOptions>): void;
  start(): void;
  pushToTalk(on: boolean): void;
  leave(): void;
}

const ROOM_RE = /^[A-HJ-NP-Z2-9]{5}$/;

export class Screens {
  readonly root: HTMLElement;
  private title = el('div', 'screen title-screen');
  private lobby = el('div', 'screen lobby-screen');
  private nameIn = el('input', 'text-in');
  private roomIn = el('input', 'text-in code');
  private err = el('div', 'err');
  private roomCode = el('div', 'room-code');
  private players = el('div', 'players');
  private willing = el('input');
  private optFull = el('input');
  private optBots = el('input');
  private optPush = el('input');
  private startBtn = el('button', 'btn primary', 'Start the visit');
  private startNote = el('div', 'start-note');
  private hostBox = el('div', 'host-box');
  private micFill = el('div', 'mic-fill');
  private micText = el('div', 'mic-text', 'Microphone: not started');
  private ptt = el('input');
  private lobbyErr = el('div', 'err');
  private selfId = '';

  constructor(root: HTMLElement, private h: ScreenHandlers) {
    this.root = root;
    this.buildTitle();
    this.buildLobby();
    root.append(this.title, this.lobby);
    this.showTitle();
  }

  private buildTitle(): void {
    const card = el('div', 'card title-card');
    card.appendChild(el('h1', 'logo', 'Inheritance'));
    card.appendChild(el('div', 'tagline', 'Flatter Grandma to her face. Sabotage your cousins behind her back.'));
    const f1 = el('label', 'field');
    f1.append(el('span', '', 'Your name'), this.nameIn);
    this.nameIn.maxLength = 16;
    this.nameIn.placeholder = 'e.g. Bertie';
    this.nameIn.value = (() => { try { return localStorage.getItem('inheritance.name') ?? ''; } catch { return ''; } })();
    const f2 = el('label', 'field');
    f2.append(el('span', '', 'Room code'), this.roomIn);
    this.roomIn.maxLength = 5;
    this.roomIn.placeholder = 'ABCDE';
    this.roomIn.addEventListener('input', () => { this.roomIn.value = this.roomIn.value.toUpperCase(); });
    const join = el('button', 'btn primary', 'Join room');
    const create = el('button', 'btn', 'Create a new room');
    const go = (fn: () => void) => () => {
      const name = this.nameIn.value.trim();
      if (!name) { this.error('Please enter your name.'); this.nameIn.focus(); return; }
      try { localStorage.setItem('inheritance.name', name); } catch { /* private mode */ }
      fn();
    };
    join.addEventListener('click', go(() => {
      const code = this.roomIn.value.trim().toUpperCase();
      if (!ROOM_RE.test(code)) { this.error('Room codes are 5 letters/numbers (no I, O, 0 or 1).'); return; }
      this.h.join(this.nameIn.value.trim(), code);
    }));
    create.addEventListener('click', go(() => this.h.create(this.nameIn.value.trim())));
    for (const i of [this.nameIn, this.roomIn]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') (this.roomIn.value ? join : create).click(); });
    const btns = el('div', 'btn-row');
    btns.append(join, create);
    card.append(f1, f2, btns, this.err);
    card.appendChild(el('div', 'small-print', '5-8 players. One of you is Grandma; bots fill empty seats. Use headphones: voice is proximity-based.'));
    this.title.appendChild(card);
  }

  private check(input: HTMLInputElement, label: string, onChange: (v: boolean) => void): HTMLElement {
    input.type = 'checkbox';
    const l = el('label', 'check');
    l.append(input, el('span', '', label));
    input.addEventListener('change', () => onChange(input.checked));
    return l;
  }

  private buildLobby(): void {
    const card = el('div', 'card lobby-card');
    const head = el('div', 'lobby-head');
    const copy = el('button', 'btn small', 'Copy invite link');
    copy.addEventListener('click', () => {
      const url = `${location.origin}${location.pathname}?room=${this.roomCode.textContent ?? ''}`;
      void navigator.clipboard?.writeText(url).then(() => { copy.textContent = 'Copied!'; setTimeout(() => { copy.textContent = 'Copy invite link'; }, 1500); }, () => {});
    });
    const leave = el('button', 'btn small ghost', 'Leave');
    leave.addEventListener('click', () => this.h.leave());
    head.append(el('div', 'lobby-label', 'Room'), this.roomCode, copy, leave);
    const cols = el('div', 'lobby-cols');
    const left = el('div', 'lobby-left');
    left.append(el('div', 'section-title', 'The family'), this.players);
    const right = el('div', 'lobby-right');
    right.appendChild(this.check(this.willing, 'Willing to be Grandma', (v) => this.h.willing(v)));
    right.appendChild(el('div', 'hint-small', 'Grandma is picked at random from the willing. Nobody is ever forced.'));
    this.hostBox.append(
      el('div', 'section-title', 'Host options'),
      this.check(this.optFull, 'Full match (Tea, Dinner, The Storm)', (v) => this.h.options({ fullMatch: v })),
      this.check(this.optBots, 'Fill empty seats with bots', (v) => this.h.options({ fillBots: v })),
      this.check(this.optPush, 'Cousins may shove Grandma', (v) => this.h.options({ pushGrandma: v })),
      this.startBtn, this.startNote,
    );
    this.startBtn.addEventListener('click', () => this.h.start());
    right.appendChild(this.hostBox);
    const mic = el('div', 'mic-box');
    const micIco = el('span', 'ico');
    micIco.innerHTML = ICONS.mic;
    const meter = el('div', 'mic-meter');
    meter.appendChild(this.micFill);
    const micRow = el('div', 'mic-row');
    micRow.append(micIco, meter);
    mic.append(el('div', 'section-title', 'Mic check'), micRow, this.micText, this.check(this.ptt, 'Push-to-talk (hold B)', (v) => this.h.pushToTalk(v)));
    right.appendChild(mic);
    cols.append(left, right);
    card.append(head, cols, this.lobbyErr);
    this.lobby.appendChild(card);
  }

  prefill(name: string, room: string): void {
    if (name) this.nameIn.value = name;
    if (room) this.roomIn.value = room.toUpperCase();
  }

  error(msg: string): void {
    setText(this.err, msg);
    setText(this.lobbyErr, msg);
  }

  showTitle(): void { show(this.root, true); show(this.title, true); show(this.lobby, false); }
  showLobby(): void { show(this.root, true); show(this.title, false); show(this.lobby, true); setText(this.lobbyErr, ''); }
  hide(): void { show(this.root, false); }

  setSelf(id: string): void { this.selfId = id; }

  updateLobby(m: LobbyMsg): void {
    setText(this.roomCode, m.room);
    this.players.innerHTML = '';
    for (const p of m.players) {
      const row = el('div', `player${p.id === this.selfId ? ' self' : ''}${p.connected ? '' : ' away'}`);
      row.appendChild(el('span', `dot${p.connected ? ' on' : ''}`));
      row.appendChild(el('span', 'pname', p.name));
      if (p.isHost) row.appendChild(el('span', 'badge host', 'host'));
      if (p.isBot) row.appendChild(el('span', 'badge bot', 'bot'));
      if (p.willingGrandma) row.appendChild(el('span', 'badge granny', 'willing Grandma'));
      if (p.id === this.selfId) row.appendChild(el('span', 'badge you', 'you'));
      this.players.appendChild(row);
    }
    const me = m.players.find((p) => p.id === this.selfId);
    this.willing.checked = !!me?.willingGrandma;
    const host = m.hostId === this.selfId;
    for (const i of [this.optFull, this.optBots, this.optPush]) i.disabled = !host;
    this.optFull.checked = m.options.fullMatch;
    this.optBots.checked = m.options.fillBots;
    this.optPush.checked = m.options.pushGrandma;
    show(this.startBtn, host);
    const count = m.players.length;
    const willing = m.players.some((p) => p.willingGrandma && !p.isBot);
    let note = '';
    if (!host) note = `Waiting for ${m.players.find((p) => p.isHost)?.name ?? 'the host'} to start.`;
    else if (count < MIN_PLAYERS && !m.options.fillBots) note = `Need ${MIN_PLAYERS} players (have ${count}), or tick "Fill empty seats with bots".`;
    else if (!willing && !m.options.fillBots) note = 'Nobody is willing to be Grandma yet.';
    else if (!willing) note = 'Nobody volunteered: a bot will play Grandma.';
    else note = count < MIN_PLAYERS ? `Bots will fill ${MIN_PLAYERS - count} seat(s).` : 'Ready when you are.';
    setText(this.startNote, note);
  }

  /** Every frame while the lobby is up. */
  mic(level: number, ok: boolean | null): void {
    setStyle(this.micFill, 'width', `${Math.min(100, level * 140).toFixed(0)}%`);
    setText(this.micText, ok === null ? 'Microphone: starting...' : ok ? 'Microphone OK - say something to see the meter move.' : 'No microphone - you can still listen and use quick-chat.');
  }
}
