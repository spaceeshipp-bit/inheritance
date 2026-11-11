// Cousin HUD: mini-will, Nana Senses (eye/ear, flashing when Nana hears a
// crash), item status, up to three ranked context prompts (red when Nana can
// see you sabotaging), a marker on the cousin your shove would hit, shove
// cooldown, throw charge, plant ring, and an arrow to Nana at the screen edge
// when she is off screen.
import { COUSIN, VOICE, WISH } from '../../../shared/constants.js';
import { dist, flatDist, forward, hearingBand, visionBand } from '../../../shared/senses.js';
import type { CharSnap, CousinInfo, PropSnap, Vec3, WishInfo } from '../../../shared/types.js';
import { el, setStyle, setText, show } from '../util.js';
import { ICONS } from './icons.js';
import { cleanName, swatch } from './ident.js';
import { edgePoint, propName, type HudFrame, type Rect } from './types.js';
import { WillList } from './willview.js';

/** One context prompt: the key to press and what it does. */
export interface Prompt {
  key: string;
  text: string;
  /** Sabotage: shown red when Nana can see you. */
  sabotage: boolean;
  /** Not possible yet (get closer): drawn dimmed. */
  dim?: boolean;
  score: number;
}

/** Everything the prompt ranking looks at (pure, so it can be unit tested). */
export interface PromptCtx {
  me: CharSnap;
  selfId: string;
  grandma: CharSnap | null;
  chars: Iterable<CharSnap>;
  props: Iterable<PropSnap>;
  wishKind: WishInfo['kind'] | null;
  /** Nana's summons, when it is on and you are not with her yet: seconds left. */
  summonLeft: number | null;
  pushGrandma: boolean;
  pad: boolean;
  name: (id: string) => string;
  itemName: (owner: string) => string;
  propLabel: (p: PropSnap) => string;
}

const KEYS = {
  kbm: { compliment: 'Q', tattle: 'T', interact: 'E', grab: 'LMB', throw: 'RMB', plant: 'Hold G', shove: 'F', drop: 'LMB' },
  pad: { compliment: 'LB', tattle: 'D-pad up', interact: 'Y', grab: 'RT', throw: 'RB', plant: 'Hold D-pad down', shove: 'X', drop: 'RT' },
} as const;

/** Is `o` within grabbing / stealing reach of `me` (the server's inReach)? */
function inReach(me: CharSnap, p: Vec3, reach: number = COUSIN.reach): boolean {
  const dy = p.y - me.pos.y;
  return flatDist(me.pos, p) <= reach && dy >= -0.7 && dy <= 2.1;
}

function wants(kind: WishInfo['kind'] | null, p: PropSnap): boolean {
  return (kind === 'tea' && p.kind === 'teacup') || (kind === 'pills' && p.kind === 'pills') || (kind === 'fetch-cat' && p.kind === 'cat');
}

/** The character a shove would hit right now, by the server's rule (nearest in front within range). */
export function shoveTarget(me: CharSnap, chars: Iterable<CharSnap>, pushGrandma: boolean): CharSnap | null {
  const f = forward(me.yaw);
  let best: CharSnap | null = null;
  let bestD = Infinity;
  for (const o of chars) {
    if (o.id === me.id || o.state === 'sleeping') continue;
    if (o.role === 'grandma' && !pushGrandma) continue;
    const dx = o.pos.x - me.pos.x, dz = o.pos.z - me.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > COUSIN.shoveRange + 0.15 || Math.abs(o.pos.y - me.pos.y) > 1.2) continue;
    if (d > 0.05 && (dx * f.x + dz * f.z) / d < 0.34) continue;
    if (d < bestD) { best = o; bestD = d; }
  }
  return best;
}

/** A cousin whose signature item is still on them, and how far away. */
function markOf(me: CharSnap, chars: Iterable<CharSnap>, props: PropSnap[]): { c: CharSnap; d: number } | null {
  let best: { c: CharSnap; d: number } | null = null;
  for (const o of chars) {
    if (o.id === me.id || o.role !== 'cousin' || o.state === 'sleeping') continue;
    const it = props.find((p) => p.kind === 'item' && p.owner === o.id);
    if (!it || it.heldBy !== o.id || o.holding === it.id) continue;
    if (Math.abs(o.pos.y - me.pos.y) > 1.2) continue;
    const d = flatDist(me.pos, o.pos);
    if (!best || d < best.d) best = { c: o, d };
  }
  return best;
}

/**
 * What the player can do right now, best first, at most three (review P11:
 * one prompt, often the wrong one). Next to Nana a compliment outranks a
 * theft; a stolen item in your hands is all about planting it.
 */
export function rankPrompts(c: PromptCtx): Prompt[] {
  const { me, grandma: g } = c;
  const k = c.pad ? KEYS.pad : KEYS.kbm;
  const props = [...c.props];
  const others = [...c.chars].filter((o) => o.id !== c.selfId);
  if (me.state === 'ragdoll') return [{ key: '', text: 'Oof!', sabotage: false, score: 100 }];
  if (me.state !== 'normal') return [];
  const out: Prompt[] = [];
  if (c.summonLeft !== null) out.push({ key: '', text: `Nana summons everyone! Get to her (${Math.ceil(c.summonLeft)}s)`, sabotage: false, score: 100 });
  const nanaD = g ? flatDist(me.pos, g.pos) : Infinity;
  const held = me.holding ? props.find((p) => p.id === me.holding) : undefined;
  if (held) {
    const wanted = wants(c.wishKind, held);
    if (wanted && nanaD <= WISH.deliverRange + 0.3) out.push({ key: k.interact, text: 'Give it to Nana', sabotage: false, score: 98 });
    else if (wanted) out.push({ key: '', text: 'Bring it to Nana!', sabotage: false, score: 70 });
    if (held.kind === 'item' && held.owner && held.owner !== c.selfId) {
      out.push({ key: k.plant, text: `Plant ${c.name(held.owner)}'s ${c.itemName(held.owner)}`, sabotage: true, score: 85 });
      out.push({ key: k.throw, text: 'Throw it', sabotage: true, score: 40 });
    } else if (held.kind === 'heirloom') {
      out.push({ key: k.throw, text: `Hold to throw ${c.propLabel(held)}`, sabotage: true, score: 60 });
      out.push({ key: k.drop, text: 'Release to put it down', sabotage: false, score: 30 });
    } else {
      out.push({ key: k.throw, text: 'Hold to throw', sabotage: false, score: 45 });
      out.push({ key: k.drop, text: 'Release to put it down', sabotage: false, score: 30 });
    }
  } else {
    for (const p of props) {
      if (p.kind === 'item' && p.planted && p.owner === c.selfId && inReach(me, p.pos)) {
        out.push({ key: k.interact, text: 'Take back your item', sabotage: false, score: 92 });
        break;
      }
    }
    const mine = props.find((p) => p.kind === 'item' && p.owner === c.selfId);
    if (mine?.heldBy && mine.heldBy !== c.selfId) {
      const thief = others.find((o) => o.id === mine.heldBy);
      if (thief && inReach(me, thief.pos) && Math.abs(thief.pos.y - me.pos.y) < 1.2) out.push({ key: k.interact, text: `Snatch your ${c.itemName(c.selfId)} back`, sabotage: false, score: 93 });
    }
    if (g && nanaD <= COUSIN.complimentRange) out.push({ key: k.compliment, text: 'Compliment Nana', sabotage: false, score: 90 });
    else if (g && nanaD <= 5) out.push({ key: '', text: 'Get closer to Nana to compliment her', sabotage: false, dim: true, score: 34 });
    if (g && nanaD <= COUSIN.tattleRange) out.push({ key: k.tattle, text: 'Tattle on someone', sabotage: false, score: 52 });
    const mark = markOf(me, others, props);
    if (mark && mark.d <= COUSIN.reach) out.push({ key: k.interact, text: `Pinch ${c.name(mark.c.id)}'s ${c.itemName(mark.c.id)}`, sabotage: true, score: 75 });
    else if (mark && mark.d <= COUSIN.reach + 1.4) out.push({ key: '', text: `Closer to pinch ${c.name(mark.c.id)}'s ${c.itemName(mark.c.id)}`, sabotage: true, dim: true, score: 44 });
    let grab: PropSnap | null = null;
    for (const p of props) {
      if (p.heldBy || p.broken || (p.kind === 'item' && p.planted) || !inReach(me, p.pos)) continue;
      if (!grab || wants(c.wishKind, p)) grab = p;
    }
    if (grab) {
      const wanted = wants(c.wishKind, grab);
      out.push({ key: k.grab, text: `Grab ${c.propLabel(grab)}${wanted ? ' (Nana wants it)' : ''}`, sabotage: false, score: wanted ? 88 : 55 });
    }
  }
  const tgt = shoveTarget(me, others, c.pushGrandma);
  if (tgt) out.push({ key: k.shove, text: `Shove ${tgt.role === 'grandma' ? 'Nana' : c.name(tgt.id)}`, sabotage: true, score: 70 });
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

export class CousinHud {
  readonly root = el('div', 'hud-cousin');
  /** Left column: the will, then whatever the HUD stacks under it (the coach). */
  readonly leftCol = el('div', 'left-col');
  private will: WillList;
  private eye = el('div', 'sense sense-eye');
  private eyeIco = el('span', 'sense-ico');
  private eyeText = el('span', 'sense-text');
  private ear = el('div', 'sense sense-ear');
  private earIco = el('span', 'sense-ico');
  private earText = el('span', 'sense-text');
  private senseDist = el('div', 'sense-dist');
  private heard = el('div', 'sense-heard');
  private heardUntil = 0;
  private item = el('div', 'item-card hud-panel');
  private itemName = el('div', 'item-name');
  private itemStatus = el('div', 'item-status');
  private holding = el('div', 'holding');
  private prompts = el('div', 'prompts');
  private promptRow = el('div', 'prompt-row');
  private seenWarn = el('div', 'seen-warn', 'Nana can see you!');
  private promptKey = '';
  private shoveMark = el('div', 'shove-mark');
  private shove = el('div', 'cd-ring');
  private shoveArc: SVGCircleElement;
  private charge = el('div', 'charge');
  private chargeFill = el('div', 'charge-fill');
  private plant = el('div', 'plant-ring');
  private plantArc: SVGCircleElement;
  private arrow = el('div', 'nana-arrow');
  private arrowIco = el('span', 'arrow-ico');
  private arrowLabel = el('span', 'arrow-label');
  private voice = el('div', 'voice-pill');
  private voiceFill = el('div', 'voice-fill');
  private voiceText = el('span', 'voice-text');
  private lastEye = '';
  private lastEar = '';
  /** Who a shove would hit right now (the HUD uses it for hit/miss feedback). */
  shoveTargetId: string | null = null;

  constructor(me: CousinInfo, cousins: CousinInfo[]) {
    this.will = new WillList('mini-will hud-panel', "Nana's Will", cousins, 'cousin');
    this.leftCol.appendChild(this.will.root);
    const senses = el('div', 'senses hud-panel');
    senses.appendChild(el('div', 'senses-title', 'Nana Senses'));
    this.eye.append(this.eyeIco, this.eyeText);
    this.ear.append(this.earIco, this.earText);
    this.heard.innerHTML = `<span class="sense-ico">${ICONS.ear}</span><span>Nana heard that!</span>`;
    senses.append(this.eye, this.ear, this.heard, this.senseDist);
    show(this.heard, false);

    const sw = swatch(me.color, me.item, 'big');
    const itemHead = el('div', 'item-head');
    itemHead.append(sw, this.itemName);
    this.item.append(itemHead, this.itemStatus, this.holding);
    setText(this.itemName, `Your ${me.itemName}`);

    const bar = el('div', 'actionbar hud-panel');
    this.shove.innerHTML = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" class="ring-bg"/><circle cx="20" cy="20" r="17" class="ring-fg" transform="rotate(-90 20 20)"/></svg><span class="cd-key">F</span><span class="cd-label">Shove</span>`;
    this.shoveArc = this.shove.querySelectorAll('circle')[1] as SVGCircleElement;
    this.charge.append(el('span', 'charge-label', 'Throw'), this.chargeFill);
    this.voice.append(el('span', 'ico', ''), this.voiceText, this.voiceFill);
    (this.voice.firstChild as HTMLElement).innerHTML = ICONS.mic;
    bar.append(this.shove, this.charge, this.voice);

    this.plant.innerHTML = `<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="26" class="ring-bg"/><circle cx="30" cy="30" r="26" class="ring-fg" transform="rotate(-90 30 30)"/></svg><span>Planting...</span>`;
    this.plantArc = this.plant.querySelectorAll('circle')[1] as SVGCircleElement;

    this.prompts.append(this.seenWarn, this.promptRow);
    this.shoveMark.innerHTML = `<span class="sm-ico">${ICONS.hand}</span><span class="sm-key">F</span>`;
    this.arrowIco.innerHTML = ICONS.arrow;
    this.arrow.append(this.arrowIco, this.arrowLabel);
    const cross = el('div', 'crosshair');
    this.root.append(this.leftCol, senses, this.item, this.prompts, bar, this.plant, this.shoveMark, this.arrow, cross);
  }

  /** Nana heard a crash (or similar): flash the ear for a moment. */
  nanaHeard(text = 'Nana heard that!'): void {
    setText(this.heard.lastChild as HTMLElement, text);
    this.heardUntil = performance.now() + 2600;
    show(this.heard, true);
    this.heard.classList.remove('flash');
    void this.heard.offsetWidth;
    this.heard.classList.add('flash');
  }

  frame(f: HudFrame, headPos: (id: string) => Vec3 | null, avoid: Rect[]): void {
    const { state: s, view } = f;
    const me = view.self;
    const g = view.grandma;
    this.will.frame({ shares: s.shares, changes: s.shareChange, t: f.t, self: s.selfId }, s.willAvail);

    // Nana Senses.
    let eye = 'unseen', ear = 'silent', d = Infinity;
    if (me && g) {
      const sense = s.senseOf(g);
      if (sense) {
        const vb = visionBand(sense, me.pos);
        eye = vb === 'sharp' || vb === 'soft' ? 'seen' : vb === 'heavy' ? 'blurry' : 'unseen';
        d = dist(g.pos, me.pos);
        const hb = hearingBand(d, sense.aidActive, f.whisper ? VOICE.whisperRange : Infinity);
        ear = hb === 'clear' ? 'clear' : hb === 'silent' ? 'silent' : 'muffled';
      }
    }
    if (eye !== this.lastEye) {
      this.lastEye = eye;
      this.eye.className = `sense sense-eye ${eye}`;
      this.eyeIco.innerHTML = eye === 'seen' ? ICONS.eyeOpen : eye === 'blurry' ? ICONS.eyeBlur : ICONS.eyeClosed;
      setText(this.eyeText, eye === 'seen' ? 'Sees you' : eye === 'blurry' ? 'Blurry' : 'Unseen');
    }
    if (ear !== this.lastEar) {
      this.lastEar = ear;
      this.ear.className = `sense sense-ear ${ear}`;
      this.earIco.innerHTML = ear === 'clear' ? ICONS.ear : ear === 'muffled' ? ICONS.earMuffled : ICONS.earOff;
      setText(this.earText, ear === 'clear' ? 'Hears you' : ear === 'muffled' ? 'Muffled' : "Can't hear");
    }
    if (this.heardUntil && performance.now() > this.heardUntil) { this.heardUntil = 0; show(this.heard, false); }
    setText(this.senseDist, Number.isFinite(d) ? `${d.toFixed(1)} m away${f.whisper ? ' - whispering' : ''}` : '');

    // My signature item. It says it was stolen, not who took it (review R20).
    let mine: PropSnap | undefined;
    for (const p of view.props.values()) if (p.kind === 'item' && p.owner === s.selfId) { mine = p; break; }
    let status = 'On you', cls = 'ok';
    if (mine) {
      if (mine.planted) { status = mine.found ? 'Planted - Nana found it!' : 'Planted somewhere!'; cls = 'bad'; }
      else if (mine.heldBy && mine.heldBy !== s.selfId) { status = 'Stolen!'; cls = 'bad'; }
      else if (!mine.heldBy) { status = 'Lying around somewhere'; cls = 'warn'; }
    }
    setText(this.itemStatus, status);
    this.itemStatus.className = `item-status ${cls}`;
    const held = me?.holding ? view.props.get(me.holding) : undefined;
    setText(this.holding, held ? `Holding ${propName(held, s)}` : '');

    // Context prompts and the shove target.
    const summon = s.summon && s.summon.endsAt > f.now ? s.summon : null;
    const prompts = me ? rankPrompts({
      me, selfId: s.selfId, grandma: g, chars: view.chars.values(), props: view.props.values(), wishKind: s.wish?.kind ?? null,
      summonLeft: summon && flatDist(me.pos, summon.pos) > 4 ? summon.endsAt - f.now : null,
      pushGrandma: !!s.match?.options.pushGrandma, pad: f.device === 'pad',
      name: (id) => cleanName(s.name(id)), itemName: (owner) => s.cousin(owner)?.itemName ?? 'item', propLabel: (p) => propName(p, s),
    }) : [];
    if (me && !prompts.length && !f.pointerLocked && f.device === 'kbm') prompts.push({ key: '', text: 'Click to look around', sabotage: false, score: 0 });
    this.renderPrompts(prompts, eye === 'seen');
    const tgt = me && me.state === 'normal' ? shoveTarget(me, view.chars.values(), !!s.match?.options.pushGrandma) : null;
    this.shoveTargetId = tgt?.id ?? null;
    // On the target's chest (where the shove lands), clear of the name tags over heads.
    const head = tgt ? headPos(tgt.id) : null;
    const chest = tgt ? { x: tgt.pos.x, y: (head ? head.y : tgt.pos.y + 1.9) - 0.75, z: tgt.pos.z } : null;
    const hp = chest ? f.project(chest) : null;
    const cdReady = f.shoveCd <= 0;
    show(this.shoveMark, !!hp && hp.onScreen);
    if (hp && hp.onScreen) {
      setStyle(this.shoveMark, 'transform', `translate(${hp.x.toFixed(0)}px, ${hp.y.toFixed(0)}px) translate(-50%, -50%)`);
      this.shoveMark.classList.toggle('cooling', !cdReady);
      this.shoveMark.classList.toggle('seen', eye === 'seen');
      setText(this.shoveMark.lastChild as HTMLElement, f.device === 'pad' ? 'X' : 'F');
    }

    // Shove cooldown, throw charge, voice.
    const cdFrac = Math.max(0, Math.min(1, f.shoveCd / COUSIN.shoveCooldown));
    const circ = 2 * Math.PI * 17;
    setStyle(this.shoveArc, 'stroke-dasharray', `${(circ * (1 - cdFrac)).toFixed(1)} ${circ.toFixed(1)}`);
    this.shove.classList.toggle('cooling', cdFrac > 0);
    this.shove.classList.toggle('armed', cdFrac === 0 && !!tgt);
    const ch = me?.charge ?? 0;
    show(this.charge, ch > 0);
    setStyle(this.chargeFill, 'width', `${ch * 100}%`);
    setText(this.voiceText, !f.micOk ? 'No mic' : f.whisper ? 'Whisper' : 'Voice');
    this.voice.classList.toggle('whisper', f.whisper);
    this.voice.classList.toggle('nomic', !f.micOk);
    setStyle(this.voiceFill, 'width', `${Math.min(100, f.talking * 140)}%`);

    // Plant ring.
    const pl = me?.plant ?? 0;
    show(this.plant, pl > 0);
    const pc = 2 * Math.PI * 26;
    setStyle(this.plantArc, 'stroke-dasharray', `${(pc * pl).toFixed(1)} ${pc.toFixed(1)}`);

    // Arrow to Nana when off screen: on the real screen edge, clear of the panels, with her distance (review P16).
    let showArrow = false;
    if (g) {
      const sp = f.project({ x: g.pos.x, y: g.pos.y + 1.9, z: g.pos.z });
      const summoning = !!summon;
      if (!sp.onScreen) {
        const a = edgePoint(sp, window.innerWidth, window.innerHeight, 48, 30, avoid);
        setStyle(this.arrow, 'transform', `translate(${a.x.toFixed(0)}px, ${a.y.toFixed(0)}px) translate(-50%, -50%)`);
        setStyle(this.arrowIco, 'transform', `rotate(${a.deg.toFixed(0)}deg)`);
        showArrow = true;
      }
      this.arrow.classList.toggle('summon', summoning);
      const m = me ? Math.round(flatDist(me.pos, g.pos)) : null;
      setText(this.arrowLabel, `${summoning ? 'Nana summons you!' : 'Nana'}${m !== null ? ` · ${m} m` : ''}`);
    }
    show(this.arrow, showArrow);
  }

  private renderPrompts(list: Prompt[], seen: boolean): void {
    const warn = seen && list.some((p) => p.sabotage && !p.dim);
    const key = list.map((p) => `${p.key}|${p.text}|${p.dim ? 1 : 0}|${p.sabotage && seen ? 1 : 0}`).join('/') + (warn ? '!' : '');
    if (key === this.promptKey) return;
    this.promptKey = key;
    this.promptRow.textContent = '';
    for (const p of list) {
      const chip = el('div', `prompt${p.sabotage ? ' sabotage' : ''}${p.sabotage && seen ? ' seen' : ''}${p.dim ? ' dim' : ''}`);
      if (p.key) chip.appendChild(el('kbd', '', p.key));
      chip.appendChild(el('span', '', p.text));
      this.promptRow.appendChild(chip);
    }
    show(this.seenWarn, warn);
    show(this.prompts, list.length > 0);
  }
}
