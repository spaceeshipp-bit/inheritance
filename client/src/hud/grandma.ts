// Grandma HUD: the parchment always on the left (names, shares, locked and
// aimed rows marked with icons, budget meters), cooldown rings (cane, aid,
// spectacles, summon), her two secret preference cards, found evidence (pin
// with C), the Bless/Tut target, and crash pings: at the crash when it is in
// view, else at the screen edge pointing to it, clear of her panels; after a
// few seconds a faint marker stays where it happened (review P18).
import { GRANDMA, HEARING_AID, SPECTACLES } from '../../../shared/constants.js';
import type { CousinInfo, Vec3 } from '../../../shared/types.js';
import { el, setStyle, setText, show } from '../util.js';
import { ICONS } from './icons.js';
import { nameOf, swatch } from './ident.js';
import { edgePoint, type HudFrame, type Rect } from './types.js';
import { WillList } from './willview.js';

interface Ring { root: HTMLElement; arc: SVGCircleElement; state: HTMLElement }
interface Ping { e: HTMLElement; arrow: HTMLElement; pos: Vec3; born: number }

/** A crash ping is bright this long (ms)... */
export const PING_BRIGHT_MS = 7000;
/** ...then stays as a faint marker where it happened until this age (ms). */
export const PING_FAINT_MS = 30000;

export class GrandmaHud {
  readonly root = el('div', 'hud-grandma');
  /** Left column: the will, then whatever the HUD stacks under it (the coach). */
  readonly leftCol = el('div', 'left-col');
  private will: WillList;
  private rings: Record<'cane' | 'aid' | 'specs' | 'summon', Ring>;
  private target = el('div', 'gm-target');
  private targetKey = '';
  private evidence = el('div', 'evidence');
  private evList = el('div', 'evidence-list');
  private pings: Ping[] = [];
  private pingLayer = el('div', 'pings');
  private status = el('div', 'gm-status');

  constructor(cousins: CousinInfo[], prefCards: string[]) {
    this.will = new WillList('side-will parchment hud-panel', 'My Will', cousins, 'grandma');
    const hintRow = el('div', 'will-hint', 'Tab: full parchment   Scroll: lock name');
    this.will.root.appendChild(hintRow);
    this.leftCol.appendChild(this.will.root);

    const right = el('div', 'gm-right hud-panel');
    const cards = el('div', 'pref-cards');
    cards.appendChild(el('div', 'pref-title', 'Your secret feelings'));
    for (const c of prefCards) cards.appendChild(el('div', 'pref-card', c));
    this.evidence.appendChild(el('div', 'pref-title', 'Found evidence'));
    this.evidence.appendChild(this.evList);
    this.evidence.appendChild(el('div', 'evidence-hint', 'C: pin the newest find'));
    right.append(cards, this.evidence);

    const bar = el('div', 'actionbar gm-bar hud-panel');
    const mk = (key: string, label: string): Ring => {
      const root = el('div', 'cd-ring');
      root.innerHTML = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" class="ring-bg"/><circle cx="20" cy="20" r="17" class="ring-fg" transform="rotate(-90 20 20)"/></svg><span class="cd-key">${key}</span><span class="cd-label">${label}</span>`;
      const state = el('span', 'cd-state');
      root.appendChild(state);
      bar.appendChild(root);
      return { root, arc: root.querySelectorAll('circle')[1] as SVGCircleElement, state };
    };
    this.rings = { cane: mk('LMB', 'Cane'), aid: mk('RMB', 'Hearing aid'), specs: mk('F', 'Spectacles'), summon: mk('R', 'Summon') };
    const blessTut = el('div', 'bless-tut');
    blessTut.innerHTML = '<span><b>E</b> Bless +5</span><span><b>Q</b> Tut -5</span>';
    bar.appendChild(blessTut);

    const cross = el('div', 'crosshair gm');
    this.root.append(this.pingLayer, this.leftCol, right, bar, this.target, this.status, cross);
  }

  /** A crash somewhere: ping toward it. */
  crash(pos: Vec3, favourite: boolean): void {
    const e = el('div', `ping${favourite ? ' fav' : ''}`);
    const arrow = el('span', 'ping-arrow');
    arrow.innerHTML = ICONS.arrow;
    const ico = el('span', 'ping-ico');
    ico.innerHTML = ICONS.crash;
    e.append(arrow, ico, el('span', 'ping-label', favourite ? 'MY FAVOURITE!' : 'CRASH!'));
    this.pingLayer.appendChild(e);
    this.pings.push({ e, arrow, pos, born: performance.now() });
  }

  frame(f: HudFrame, avoid: Rect[]): void {
    const s = f.state;
    const me = f.view.self;
    this.will.frame({ shares: s.shares, changes: s.shareChange, t: f.t, locked: f.locked, aim: f.target?.via === 'aim' ? f.target.id : null }, s.willAvail);

    // Cooldowns.
    const circ = 2 * Math.PI * 17;
    const setRing = (r: Ring, left: number, total: number, active: boolean, label: string) => {
      const frac = Math.max(0, Math.min(1, left / total));
      setStyle(r.arc, 'stroke-dasharray', `${(circ * (1 - frac)).toFixed(1)} ${circ.toFixed(1)}`);
      r.root.classList.toggle('cooling', frac > 0 && !active);
      r.root.classList.toggle('active', active);
      setText(r.state, active ? label : frac > 0 ? `${Math.ceil(left)}s` : '');
    };
    setRing(this.rings.cane, me?.caneCooldown ?? 0, GRANDMA.caneCooldown, false, '');
    setRing(this.rings.aid, me?.aidCooldown ?? 0, HEARING_AID.cooldown, !!me?.aidActive, 'ON');
    setRing(this.rings.specs, me?.specsCooldown ?? 0, SPECTACLES.cooldown, !!me?.specsActive || !!me?.specsOff, me?.specsOff ? 'OFF!' : 'ON');
    this.rings.specs.root.classList.toggle('broken', !!me?.specsOff);
    setRing(this.rings.summon, me?.summonCooldown ?? 0, GRANDMA.summonCooldown, false, '');

    // Bless/Tut target: who is in her sights, else the locked name, else a nudge to aim.
    const tId = f.target?.id ?? f.locked ?? null;
    const via = f.target ? f.target.via : f.locked ? 'locked' : 'none';
    const key = `${tId}|${via}`;
    if (key !== this.targetKey) {
      this.targetKey = key;
      this.target.textContent = '';
      if (tId) {
        const c = s.cousin(tId);
        const ico = el('span', `tag-ico ${via === 'aim' ? 'aim' : 'lock'}`);
        ico.innerHTML = via === 'aim' ? ICONS.aim : ICONS.lock;
        this.target.append(swatch(c?.color ?? '#888', c?.item), el('span', '', nameOf(s, tId)), ico,
          el('span', 'via', via === 'aim' ? 'in your sights' : 'locked - scroll to change'));
      } else {
        const ico = el('span', 'tag-ico aim');
        ico.innerHTML = ICONS.aim;
        this.target.append(ico, el('span', '', 'Aim at a cousin'), el('span', 'via', 'or scroll to lock a name'));
      }
    }
    this.target.classList.toggle('none', !tId);

    // Status line (spectacles off, parchment, Storm).
    const st = me?.specsOff ? 'Your spectacles! Everything is a blur.' : me?.parchmentOpen ? 'Writing... (slow)' : s.dark && !s.flash ? 'The lights are out!' : '';
    setText(this.status, st);
    show(this.status, st !== '');

    // Found evidence.
    const rows = s.found.slice(-5).reverse();
    const ekey = rows.map((r) => `${r.item}:${r.pinned}`).join('|');
    if (this.evList.dataset.key !== ekey) {
      this.evList.dataset.key = ekey;
      this.evList.innerHTML = '';
      if (!rows.length) this.evList.appendChild(el('div', 'evidence-empty', 'Nothing yet. Keep your eyes peeled.'));
      for (const r of rows) {
        const c = s.cousin(r.owner);
        const row = el('div', `evidence-row${r.pinned ? ' pinned' : ''}`);
        row.append(swatch(c?.color ?? '#888', c?.item), el('span', '', `${c ? nameOf(s, c.id) : '?'}'s ${c?.itemName ?? 'item'}`));
        if (r.pinned) { const p = el('span', 'ico pin'); p.innerHTML = ICONS.pin; row.appendChild(p); }
        this.evList.appendChild(row);
      }
    }

    // Crash pings.
    const now = performance.now();
    const w = window.innerWidth, h = window.innerHeight;
    this.pings = this.pings.filter((p) => {
      const age = now - p.born;
      if (age > PING_FAINT_MS) { p.e.remove(); return false; }
      const faint = age > PING_BRIGHT_MS;
      const sp = f.project({ x: p.pos.x, y: p.pos.y + 0.5, z: p.pos.z });
      p.e.classList.toggle('faint', faint);
      if (sp.onScreen) {
        setStyle(p.e, 'transform', `translate(${sp.x.toFixed(0)}px, ${sp.y.toFixed(0)}px) translate(-50%, -50%)`);
        p.e.classList.remove('edge');
        p.e.style.display = '';
      } else if (!faint) {
        const a = edgePoint(sp, w, h, 44, 40, avoid);
        setStyle(p.e, 'transform', `translate(${a.x.toFixed(0)}px, ${a.y.toFixed(0)}px) translate(-50%, -50%)`);
        setStyle(p.arrow, 'transform', `rotate(${a.deg.toFixed(0)}deg)`);
        p.e.classList.add('edge');
        p.e.style.display = '';
      } else {
        p.e.style.display = 'none';
      }
      return true;
    });
  }
}
