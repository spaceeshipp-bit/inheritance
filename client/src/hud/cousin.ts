// Cousin HUD: mini-will, Nana Senses (eye/ear), item status, context hints,
// shove cooldown, throw charge, plant ring, and an arrow to Nana when she is
// off screen.
import { COUSIN, VOICE, WISH } from '../../../shared/constants.js';
import { dist, flatDist, hearingBand, visionBand } from '../../../shared/senses.js';
import type { CousinInfo, PropSnap } from '../../../shared/types.js';
import { el, setStyle, setText, show } from '../util.js';
import { ICONS } from './icons.js';
import { edgeArrow, propName, type HudFrame } from './types.js';
import { WillList } from './willview.js';

export class CousinHud {
  readonly root = el('div', 'hud-cousin');
  private will: WillList;
  private eye = el('div', 'sense sense-eye');
  private eyeIco = el('span', 'sense-ico');
  private eyeText = el('span', 'sense-text');
  private ear = el('div', 'sense sense-ear');
  private earIco = el('span', 'sense-ico');
  private earText = el('span', 'sense-text');
  private senseDist = el('div', 'sense-dist');
  private item = el('div', 'item-card');
  private itemName = el('div', 'item-name');
  private itemStatus = el('div', 'item-status');
  private holding = el('div', 'holding');
  private hint = el('div', 'hint');
  private shove = el('div', 'cd-ring');
  private shoveArc: SVGCircleElement;
  private charge = el('div', 'charge');
  private chargeFill = el('div', 'charge-fill');
  private plant = el('div', 'plant-ring');
  private plantArc: SVGCircleElement;
  private arrow = el('div', 'nana-arrow');
  private voice = el('div', 'voice-pill');
  private voiceFill = el('div', 'voice-fill');
  private voiceText = el('span', 'voice-text');
  private lastEye = '';
  private lastEar = '';

  constructor(private me: CousinInfo, cousins: CousinInfo[]) {
    this.will = new WillList('mini-will', "Nana's Will", cousins, true);
    const senses = el('div', 'senses');
    senses.appendChild(el('div', 'senses-title', 'Nana Senses'));
    this.eye.append(this.eyeIco, this.eyeText);
    this.ear.append(this.earIco, this.earText);
    senses.append(this.eye, this.ear, this.senseDist);

    const sw = el('span', 'swatch big');
    sw.style.background = me.color;
    const itemHead = el('div', 'item-head');
    itemHead.append(sw, this.itemName);
    this.item.append(itemHead, this.itemStatus, this.holding);
    setText(this.itemName, `Your ${me.itemName}`);

    const bar = el('div', 'actionbar');
    this.shove.innerHTML = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" class="ring-bg"/><circle cx="20" cy="20" r="17" class="ring-fg" transform="rotate(-90 20 20)"/></svg><span class="cd-key">F</span><span class="cd-label">Shove</span>`;
    this.shoveArc = this.shove.querySelectorAll('circle')[1] as SVGCircleElement;
    this.charge.append(el('span', 'charge-label', 'Throw'), this.chargeFill);
    this.voice.append(el('span', 'ico', ''), this.voiceText, this.voiceFill);
    (this.voice.firstChild as HTMLElement).innerHTML = ICONS.mic;
    bar.append(this.shove, this.charge, this.voice);

    this.plant.innerHTML = `<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="26" class="ring-bg"/><circle cx="30" cy="30" r="26" class="ring-fg" transform="rotate(-90 30 30)"/></svg><span>Planting...</span>`;
    this.plantArc = this.plant.querySelectorAll('circle')[1] as SVGCircleElement;

    this.arrow.innerHTML = `<span class="arrow-ico">${ICONS.arrow}</span><span class="arrow-label">Nana</span>`;
    const cross = el('div', 'crosshair');
    this.root.append(this.will.root, senses, this.item, this.hint, bar, this.plant, this.arrow, cross);
  }

  frame(f: HudFrame): void {
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
    setText(this.senseDist, Number.isFinite(d) ? `${d.toFixed(1)} m away${f.whisper ? ' - whispering' : ''}` : '');

    // My signature item.
    let mine: PropSnap | undefined;
    for (const p of view.props.values()) if (p.kind === 'item' && p.owner === s.selfId) { mine = p; break; }
    let status = 'On you', cls = 'ok';
    if (mine) {
      if (mine.planted) { status = mine.found ? 'Planted - Nana found it!' : 'Planted somewhere!'; cls = 'bad'; }
      else if (mine.heldBy && mine.heldBy !== s.selfId) { status = `Stolen by ${s.name(mine.heldBy)}`; cls = 'bad'; }
      else if (!mine.heldBy) { status = 'Lying around somewhere'; cls = 'warn'; }
    }
    setText(this.itemStatus, status);
    this.itemStatus.className = `item-status ${cls}`;
    const held = me?.holding ? view.props.get(me.holding) : undefined;
    setText(this.holding, held ? `Holding ${propName(held, s)}` : '');

    // Context hint.
    setText(this.hint, this.hintFor(f, held));
    show(this.hint, this.hint.textContent !== '');

    // Shove cooldown, throw charge, voice.
    const cdFrac = Math.max(0, Math.min(1, f.shoveCd / COUSIN.shoveCooldown));
    const circ = 2 * Math.PI * 17;
    setStyle(this.shoveArc, 'stroke-dasharray', `${(circ * (1 - cdFrac)).toFixed(1)} ${circ.toFixed(1)}`);
    this.shove.classList.toggle('cooling', cdFrac > 0);
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

    // Arrow to Nana when off screen.
    let showArrow = false;
    if (g) {
      const sp = f.project({ x: g.pos.x, y: g.pos.y + 1.9, z: g.pos.z });
      if (!sp.onScreen) {
        const a = edgeArrow(sp, window.innerWidth, window.innerHeight);
        setStyle(this.arrow, 'transform', `translate(${a.x.toFixed(0)}px, ${a.y.toFixed(0)}px) translate(-50%, -50%)`);
        setStyle(this.arrow.firstChild as HTMLElement, 'transform', `rotate(${a.deg.toFixed(0)}deg)`);
        showArrow = true;
      }
      const summoning = s.summon && s.summon.endsAt > f.now;
      this.arrow.classList.toggle('summon', !!summoning);
      setText(this.arrow.lastChild as HTMLElement, summoning ? 'Nana summons you!' : 'Nana');
    }
    show(this.arrow, showArrow);
  }

  private hintFor(f: HudFrame, held: PropSnap | undefined): string {
    const { state: s, view } = f;
    const me = view.self;
    if (!me || me.state !== 'normal') return me?.state === 'ragdoll' ? 'Oof!' : '';
    const g = view.grandma;
    const summon = s.summon && s.summon.endsAt > f.now ? s.summon : null;
    if (summon && flatDist(me.pos, summon.pos) > 4) return `Nana summons everyone! Get to her (${Math.ceil(summon.endsAt - f.now)}s)`;
    const wishKind = s.wish?.kind;
    if (held) {
      const wanted = (wishKind === 'tea' && held.kind === 'teacup') || (wishKind === 'pills' && held.kind === 'pills') || (wishKind === 'fetch-cat' && held.kind === 'cat');
      if (wanted && g && flatDist(me.pos, g.pos) <= WISH.deliverRange + 0.3) return 'E  Give it to Nana';
      if (wanted) return 'Bring it to Nana!';
      if (held.kind === 'item' && held.owner && held.owner !== s.selfId) return `Hold G  Plant ${propName(held, s)}   |   RMB  Throw`;
      return 'Release LMB to drop   |   Hold RMB  Throw';
    }
    for (const p of view.props.values()) {
      if (p.kind === 'item' && p.planted && p.owner === s.selfId && flatDist(me.pos, p.pos) < COUSIN.reach) return 'E  Take back your item';
    }
    for (const c of view.chars.values()) {
      if (c.id === s.selfId || c.role !== 'cousin' || c.state === 'sleeping') continue;
      if (flatDist(me.pos, c.pos) < COUSIN.reach) {
        const ip = [...view.props.values()].find((p) => p.kind === 'item' && p.owner === c.id);
        if (!ip || (ip.heldBy === c.id && c.holding !== ip.id)) return `E  Steal ${s.name(c.id)}'s item   |   F  Shove`;
        return 'F  Shove';
      }
    }
    if (g && flatDist(me.pos, g.pos) < 2) return 'Q  Compliment Nana   |   T  Tattle';
    for (const p of view.props.values()) {
      if (!p.heldBy && !p.broken && flatDist(me.pos, p.pos) < COUSIN.reach && Math.abs(p.pos.y - me.pos.y) < 1.6) return `LMB  Grab ${propName(p, s)}`;
    }
    if (!f.pointerLocked) return 'Click to look around';
    return '';
  }
}
