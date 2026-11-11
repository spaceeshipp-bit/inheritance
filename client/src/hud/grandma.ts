// Grandma HUD: the parchment always on the left (names, shares, locked name
// glowing, budget + rolling meters), cooldown rings (cane, aid, spectacles,
// summon), her two secret preference cards, found evidence (pin with C), the
// Bless/Tut target, and crash pings at the screen edge.
import { GRANDMA, HEARING_AID, SPECTACLES } from '../../../shared/constants.js';
import type { CousinInfo, Vec3 } from '../../../shared/types.js';
import { el, setStyle, setText, show } from '../util.js';
import { ICONS } from './icons.js';
import { edgeArrow, type HudFrame } from './types.js';
import { WillList } from './willview.js';

interface Ring { root: HTMLElement; arc: SVGCircleElement; state: HTMLElement }
interface Ping { e: HTMLElement; pos: Vec3; until: number }

export class GrandmaHud {
  readonly root = el('div', 'hud-grandma');
  private will: WillList;
  private rings: Record<'cane' | 'aid' | 'specs' | 'summon', Ring>;
  private target = el('div', 'gm-target');
  private evidence = el('div', 'evidence');
  private evList = el('div', 'evidence-list');
  private pings: Ping[] = [];
  private pingLayer = el('div', 'pings');
  private status = el('div', 'gm-status');

  constructor(cousins: CousinInfo[], prefCards: string[]) {
    this.will = new WillList('side-will parchment', 'My Will', cousins, true);
    const hintRow = el('div', 'will-hint', 'Tab: full parchment   Scroll: lock name');
    this.will.root.appendChild(hintRow);

    const right = el('div', 'gm-right');
    const cards = el('div', 'pref-cards');
    cards.appendChild(el('div', 'pref-title', 'Your secret feelings'));
    for (const c of prefCards) cards.appendChild(el('div', 'pref-card', c));
    this.evidence.appendChild(el('div', 'pref-title', 'Found evidence'));
    this.evidence.appendChild(this.evList);
    this.evidence.appendChild(el('div', 'evidence-hint', 'C: pin the newest find'));
    right.append(cards, this.evidence);

    const bar = el('div', 'actionbar gm-bar');
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
    this.root.append(this.will.root, right, bar, this.target, this.pingLayer, this.status, cross);
  }

  /** A crash somewhere: ping toward it for a few seconds. */
  crash(pos: Vec3, favourite: boolean): void {
    const e = el('div', `ping${favourite ? ' fav' : ''}`);
    e.innerHTML = `<span class="ping-ico">${ICONS.crash}</span><span class="ping-label">${favourite ? 'MY FAVOURITE!' : 'CRASH!'}</span>`;
    this.pingLayer.appendChild(e);
    this.pings.push({ e, pos, until: performance.now() + 4000 });
  }

  frame(f: HudFrame): void {
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

    // Bless/Tut target.
    if (f.target) {
      const c = s.cousin(f.target.id);
      this.target.innerHTML = '';
      const sw = el('span', 'swatch');
      sw.style.background = c?.color ?? '#888';
      this.target.append(sw, el('span', '', s.name(f.target.id)), el('span', 'via', f.target.via === 'aim' ? 'in your sights' : 'locked'));
    } else {
      setText(this.target, 'Nobody in your sights - scroll to lock a name');
    }
    this.target.classList.toggle('none', !f.target);

    // Status line (spectacles off, parchment, Storm).
    const st = me?.specsOff ? 'Your spectacles! Everything is a blur.' : me?.parchmentOpen ? 'Writing... (slow)' : s.dark && !s.flash ? 'The lights are out!' : '';
    setText(this.status, st);
    show(this.status, st !== '');

    // Found evidence.
    const rows = s.found.slice(-5).reverse();
    const key = rows.map((r) => `${r.item}:${r.pinned}`).join('|');
    if (this.evList.dataset.key !== key) {
      this.evList.dataset.key = key;
      this.evList.innerHTML = '';
      if (!rows.length) this.evList.appendChild(el('div', 'evidence-empty', 'Nothing yet. Keep your eyes peeled.'));
      for (const r of rows) {
        const c = s.cousin(r.owner);
        const row = el('div', `evidence-row${r.pinned ? ' pinned' : ''}`);
        const sw = el('span', 'swatch');
        sw.style.background = c?.color ?? '#888';
        row.append(sw, el('span', '', `${c?.name ?? '?'}'s ${c?.itemName ?? 'item'}`));
        if (r.pinned) { const p = el('span', 'ico pin'); p.innerHTML = ICONS.pin; row.appendChild(p); }
        this.evList.appendChild(row);
      }
    }

    // Crash pings: at the crash if on screen, else at the screen edge pointing to it.
    const now = performance.now();
    this.pings = this.pings.filter((p) => {
      if (now > p.until) { p.e.remove(); return false; }
      const sp = f.project({ x: p.pos.x, y: p.pos.y + 0.5, z: p.pos.z });
      if (sp.onScreen) {
        setStyle(p.e, 'transform', `translate(${sp.x.toFixed(0)}px, ${sp.y.toFixed(0)}px) translate(-50%, -50%)`);
        setStyle(p.e.firstChild as HTMLElement, 'transform', 'none');
        p.e.classList.remove('edge');
      } else {
        const a = edgeArrow(sp, window.innerWidth, window.innerHeight);
        setStyle(p.e, 'transform', `translate(${a.x.toFixed(0)}px, ${a.y.toFixed(0)}px) translate(-50%, -50%)`);
        p.e.classList.add('edge');
      }
      p.e.classList.toggle('fade', now > p.until - 600);
      return true;
    });
  }
}
