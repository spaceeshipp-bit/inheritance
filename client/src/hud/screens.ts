// Title screen (name + room code, or create a room) and the lobby (players,
// willing-Grandma toggle, host options + Start, mic meter, push-to-talk).
// The lobby also shows a match that is already running to players who are not
// in it (joined mid-match, replaced, back too late): its phase, time left and
// the live will. The title shows connection progress and "open in another tab".
import { MAPS, MAP_IDS, type MapId } from '../../../shared/map.js';
import { MAX_PLAYERS, MIN_PLAYERS, VISITS } from '../../../shared/constants.js';
import type { MatchInProgress } from '../../../shared/protocol.js';
import type { MatchOptions } from '../../../shared/types.js';
import type { NetStatus } from '../net.js';
import type { LobbyMsg } from '../state.js';
import { el, fmtTime, setStyle, setText, show } from '../util.js';
import { ICONS } from './icons.js';
import { botGlyph, cleanName, isBotName } from './ident.js';

export interface ScreenHandlers {
  join(name: string, room: string): void;
  create(name: string): void;
  /** A practice round on your own against bots (shared/practice.ts). */
  practice(name: string, role: 'cousin' | 'grandma'): void;
  willing(on: boolean): void;
  options(o: Partial<MatchOptions>): void;
  start(): void;
  pushToTalk(on: boolean): void;
  leave(): void;
  /** "Play here instead": take this game's seat back from the other tab. */
  reclaim(): void;
}

const ROOM_RE = /^[A-HJ-NP-Z2-9]{5}$/;

/** One line on the running match for someone waiting in the lobby; `left` = seconds left in its phase. */
export function describeInProgress(ip: MatchInProgress, left: number): string {
  const visit = ip.visit ? VISITS[ip.visit].name : '';
  const t = fmtTime(left);
  let what: string;
  switch (ip.phase) {
    case 'roles': what = `A match is starting${visit ? ` with ${visit}` : ''}`; break;
    case 'visit': what = `A match is under way — ${visit || 'a visit'}, ${t} left`; break;
    case 'intermission': what = `A match is under way — a short break before ${visit || 'the next visit'}, ${t} left`; break;
    case 'reading': what = 'A match is nearly over — the will is being read'; break;
    case 'vote': what = 'A match is nearly over — the family is voting'; break;
    case 'results': what = 'A match is nearly over — the results are in'; break;
    default: what = 'A match is under way'; break;
  }
  return `${what}. You'll join the next one.`;
}

/**
 * The line under the host's Start button, and whether Start would be refused.
 * Mirrors the server's start rules (server/room.ts `start`): connected humans
 * only; Grandma from the willing, else a bot if bots may fill seats, except
 * with a full house (MAX_PLAYERS humans), where nobody can be left out for her.
 */
export function lobbyStartNote(m: Pick<LobbyMsg, 'players' | 'hostId' | 'options' | 'inProgress'>, selfId: string): { text: string; blocked: boolean } {
  const host = m.hostId === selfId;
  const hostName = cleanName(m.players.find((p) => p.isHost)?.name ?? '');
  if (m.inProgress) {
    return { text: host ? 'You can start the next match when this one ends.' : `${hostName || 'The host'} can start the next match when this one ends.`, blocked: true };
  }
  if (!host) return { text: `Waiting for ${hostName || 'the host'} to start.`, blocked: false };
  const humans = m.players.filter((p) => !p.isBot && p.connected);
  const willing = humans.some((p) => p.willingGrandma);
  if (!willing && humans.length >= MAX_PLAYERS) {
    return { text: `With ${MAX_PLAYERS} of you there is no seat for a bot Grandma: someone must tick "Willing to be Grandma".`, blocked: true };
  }
  if (!willing && !m.options.fillBots) {
    return { text: 'Nobody is willing to be Grandma yet: tick the box, or "Fill empty seats with bots" for a bot Grandma.', blocked: true };
  }
  const total = humans.length + (willing ? 0 : 1);
  if (total < MIN_PLAYERS && !m.options.fillBots) {
    return { text: `Need ${MIN_PLAYERS} players (have ${total}), or tick "Fill empty seats with bots".`, blocked: true };
  }
  const bots = Math.max(0, MIN_PLAYERS - total);
  const parts: string[] = [];
  if (!willing) parts.push('Nobody volunteered: a bot will play Grandma.');
  if (bots > 0) parts.push(`Bots will fill ${bots} seat${bots === 1 ? '' : 's'}.`);
  return { text: parts.length ? parts.join(' ') : 'Ready when you are.', blocked: false };
}

/**
 * Put text on the clipboard: the Clipboard API where the page may use it
 * (https, localhost), else the old copy command (plain http on a home network).
 * False if neither worked.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* try the old way */ }
  try {
    const ta = el('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** The will as the waiting lobby lists it: highest share first. */
export function inProgressWill(ip: MatchInProgress): { id: string; name: string; share: number }[] {
  return Object.entries(ip.shares)
    .map(([id, share]) => ({ id, name: ip.names[id] ?? '???', share }))
    .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));
}

export class Screens {
  readonly root: HTMLElement;
  private title = el('div', 'screen title-screen');
  private lobby = el('div', 'screen lobby-screen');
  private nameIn = el('input', 'text-in');
  private roomIn = el('input', 'text-in code');
  private joinBtn = el('button', 'btn primary', 'Join room');
  private createBtn = el('button', 'btn', 'Create a new room');
  private netNote = el('div', 'net-note');
  private netText = el('span', '');
  private elsewhere = el('div', 'elsewhere');
  private err = el('div', 'err');
  private roomCode = el('div', 'room-code');
  private players = el('div', 'players');
  private willing = el('input');
  private optFull = el('input');
  private optBots = el('input');
  private optPush = el('input');
  private optRotate = el('input');
  /** The map picker: one card per map, then "Surprise me". */
  private mapCards = el('div', 'map-cards');
  private mapButtons = new Map<string, HTMLButtonElement>();
  private startBtn = el('button', 'btn primary', 'Start the visit');
  private startNote = el('div', 'start-note');
  /** The invite link, shown to copy by hand when the browser would not copy it. */
  private inviteBox = el('div', 'invite-box');
  private inviteIn = el('input', 'text-in invite-in');
  private hostBox = el('div', 'host-box');
  private micFill = el('div', 'mic-fill');
  private micText = el('div', 'mic-text', 'Microphone: not started');
  private ptt = el('input');
  private pttLabel = el('span', '', 'Push-to-talk (hold B)');
  private lobbyErr = el('div', 'err');
  private ipBox = el('div', 'in-progress');
  private ipText = el('div', 'ip-text');
  private ipGrandma = el('div', 'ip-grandma');
  private ipWill = el('div', 'ip-will');
  /** The running match we are waiting out, and when (performance.now) its clock was read. */
  private ip: { msg: MatchInProgress; at: number } | null = null;
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
    const back = el('button', 'btn primary', 'Play here instead');
    back.addEventListener('click', () => this.h.reclaim());
    this.elsewhere.append(
      el('div', 'elsewhere-title', 'This game is open in another tab.'),
      el('div', 'elsewhere-text', 'Only one tab can hold your seat. Carry on over there, or take the seat back here.'),
      back,
    );
    show(this.elsewhere, false);
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
    const join = this.joinBtn, create = this.createBtn;
    const go = (fn: () => void) => () => {
      if (join.disabled) return;
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
    const cancel = el('button', 'btn small ghost', 'Cancel');
    cancel.addEventListener('click', () => this.h.leave());
    this.netNote.append(this.netText, cancel);
    show(this.netNote, false);
    // Practice rounds: on your own, against bots, with a checklist.
    const practice = el('div', 'practice-row');
    const pc = el('button', 'btn small ghost', 'Practise as a cousin (4 min)');
    const pg = el('button', 'btn small ghost', 'Practise as Grandma (3 min)');
    pc.addEventListener('click', go(() => this.h.practice(this.nameIn.value.trim(), 'cousin')));
    pg.addEventListener('click', go(() => this.h.practice(this.nameIn.value.trim(), 'grandma')));
    practice.append(el('span', 'practice-label', 'New here?'), pc, pg);
    card.append(this.elsewhere, f1, f2, btns, practice, this.netNote, this.err);
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
      void copyText(url).then((ok) => {
        show(this.inviteBox, !ok);
        if (ok) {
          copy.textContent = 'Copied!';
          setTimeout(() => { copy.textContent = 'Copy invite link'; }, 1500);
        } else {
          // The browser would not let us: hand them the link to copy themselves.
          this.inviteIn.value = url;
          this.inviteIn.focus();
          this.inviteIn.select();
        }
      });
    });
    this.inviteIn.readOnly = true;
    this.inviteIn.addEventListener('focus', () => this.inviteIn.select());
    this.inviteBox.append(el('span', 'invite-label', 'Your browser would not copy it. Send the family this link:'), this.inviteIn);
    show(this.inviteBox, false);
    const leave = el('button', 'btn small ghost', 'Leave');
    leave.addEventListener('click', () => this.h.leave());
    head.append(el('div', 'lobby-label', 'Room'), this.roomCode, copy, leave);
    this.ipBox.append(this.ipText, el('div', 'section-title ip-will-title', 'The will right now'), this.ipWill, this.ipGrandma);
    show(this.ipBox, false);
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
      this.check(this.optRotate, 'Rotate Grandma (the smallest share takes the shawl)', (v) => this.h.options({ rotateGrandma: v })),
      this.startBtn, this.startNote, this.lobbyErr,
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
    this.ptt.type = 'checkbox';
    this.ptt.addEventListener('change', () => this.h.pushToTalk(this.ptt.checked));
    const pttRow = el('label', 'check');
    pttRow.append(this.ptt, this.pttLabel);
    mic.append(el('div', 'section-title', 'Mic check'), micRow, this.micText, pttRow);
    right.appendChild(mic);
    cols.append(left, right);
    const where = el('div', 'map-pick');
    where.append(el('div', 'section-title', 'Where the family gathers'), this.mapCards);
    const choices: { id: MapId | 'random'; name: string; blurb: string }[] = [
      ...MAP_IDS.map((id) => ({ id, name: MAPS[id].name, blurb: MAPS[id].blurb })),
      { id: 'random', name: 'Surprise me', blurb: 'Nana could be anywhere. She often is.' },
    ];
    for (const c of choices) {
      const b = el('button', `map-card${c.id === 'random' ? ' random' : ''}`) as HTMLButtonElement;
      b.dataset.map = c.id;
      b.append(el('span', 'map-name', c.name), el('span', 'map-blurb', c.blurb));
      b.addEventListener('click', () => this.h.options({ map: c.id }));
      this.mapButtons.set(c.id, b);
      this.mapCards.appendChild(b);
    }
    card.append(head, this.inviteBox, this.ipBox, cols, where);
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

  showTitle(): void { show(this.root, true); show(this.title, true); show(this.lobby, false); show(this.elsewhere, false); }
  showLobby(): void {
    // Every lobby update calls this: only a fresh arrival clears the last error.
    const already = this.root.style.display !== 'none' && this.lobby.style.display !== 'none';
    show(this.root, true);
    show(this.title, false);
    show(this.lobby, true);
    if (!already) setText(this.lobbyErr, '');
  }
  hide(): void { show(this.root, false); }

  /** Show the push-to-talk setting (also changed from the settings panel) and its key. */
  setPushToTalk(on: boolean, keyName: string): void {
    this.ptt.checked = on;
    setText(this.pttLabel, `Push-to-talk (hold ${keyName})`);
  }

  /** This game is open in another tab, which took the seat. */
  showReplaced(): void {
    this.showTitle();
    show(this.elsewhere, true);
  }

  /** Connection progress: Join / Create stay disabled while a connection is being made. */
  setNetStatus(s: NetStatus): void {
    const busy = s === 'connecting';
    this.joinBtn.disabled = busy;
    this.createBtn.disabled = busy;
    show(this.netNote, busy || s === 'reconnecting');
    setText(this.netText, busy ? 'Connecting...' : 'Cannot reach the game server - still trying...');
    if (s !== 'replaced' && s !== 'idle' && s !== 'closed') show(this.elsewhere, false);
  }

  setSelf(id: string): void { this.selfId = id; }

  updateLobby(m: LobbyMsg): void {
    setText(this.roomCode, m.room);
    this.players.innerHTML = '';
    for (const p of m.players) {
      const row = el('div', `player${p.id === this.selfId ? ' self' : ''}${p.connected ? '' : ' away'}`);
      row.appendChild(el('span', `dot${p.connected ? ' on' : ''}`));
      // A bot's name without the server's "(bot)": the badge says it.
      row.appendChild(el('span', 'pname', p.isBot ? cleanName(p.name) : p.name));
      if (p.isHost) row.appendChild(el('span', 'badge host', 'host'));
      if (p.isBot) row.appendChild(el('span', 'badge bot', 'bot'));
      if (p.willingGrandma) row.appendChild(el('span', 'badge granny', 'willing Grandma'));
      if (p.id === this.selfId) row.appendChild(el('span', 'badge you', 'you'));
      this.players.appendChild(row);
    }
    const me = m.players.find((p) => p.id === this.selfId);
    this.willing.checked = !!me?.willingGrandma;
    const host = m.hostId === this.selfId;
    const running = !!m.inProgress;
    for (const i of [this.optFull, this.optBots, this.optPush, this.optRotate]) i.disabled = !host || running;
    this.optFull.checked = m.options.fullMatch;
    this.optBots.checked = m.options.fillBots;
    this.optPush.checked = m.options.pushGrandma;
    this.optRotate.checked = !!m.options.rotateGrandma;
    for (const [id, b] of this.mapButtons) {
      b.disabled = !host || running;
      b.classList.toggle('chosen', m.options.map === id);
      b.title = host ? '' : 'The host picks where the family gathers.';
    }
    show(this.startBtn, host);
    this.startBtn.disabled = running;
    const note = lobbyStartNote(m, this.selfId);
    setText(this.startNote, note.text);
    this.startNote.classList.toggle('warn', host && note.blocked && !running);
    this.updateInProgress(m.inProgress ?? null);
  }

  private updateInProgress(ip: MatchInProgress | null): void {
    this.ip = ip ? { msg: ip, at: performance.now() } : null;
    show(this.ipBox, !!ip);
    if (!ip) return;
    this.ipWill.innerHTML = '';
    for (const r of inProgressWill(ip)) {
      const row = el('div', `ip-row${r.id === this.selfId ? ' self' : ''}`);
      const name = el('span', 'ip-name', cleanName(r.name));
      if (isBotName(r.name)) name.appendChild(botGlyph());
      row.append(name, el('span', 'ip-share', `${r.share}%`));
      this.ipWill.appendChild(row);
    }
    setText(this.ipGrandma, `Grandma: ${cleanName(ip.names[ip.grandmaId] ?? '???')}${ip.map ? ` · ${MAPS[ip.map].name}` : ''}`);
    this.frame();
  }

  /** Every frame while the screens are up: the running match's countdown. */
  frame(): void {
    if (!this.ip) return;
    const { msg, at } = this.ip;
    const left = Math.max(0, msg.endsAt - msg.time - (performance.now() - at) / 1000);
    setText(this.ipText, describeInProgress(msg, left));
  }

  /** Every frame while the lobby is up. */
  mic(level: number, ok: boolean | null): void {
    setStyle(this.micFill, 'width', `${Math.min(100, level * 140).toFixed(0)}%`);
    setText(this.micText, ok === null ? 'Microphone: starting...' : ok ? 'Microphone OK - say something to see the meter move.' : 'No microphone - you can still listen and use quick-chat.');
  }
}
