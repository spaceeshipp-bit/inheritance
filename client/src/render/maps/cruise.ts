// The Golden Years: one deck of a cruise ship in white and navy, teak and
// brass, under a sunny sky over an animated sea. The Lido Deck (Nana's court,
// with its raised pool, bar and the roped-off Lifeboat 4 gate), and inside the
// superstructure the Casino Lounge, the Captain's Saloon (Family Dinner) and
// the Cabin Corridor with the Purser's desk. The hull, bridge, funnel, mast,
// bunting and lifeboats are decoration; every solid box of the map is drawn
// and blocks the camera. The sea, wake, gulls, smoke, chandelier, roulette
// wheel and the pool flamingo move (tick), and the sky darkens in the Storm.
import * as THREE from 'three';
import type { Box, MapDef } from '../../../../shared/map.js';
import { BULWARK_H, CRUISE_ROOM_H, GAP, SEA_Y } from '../../../../shared/maps/cruise.js';
import { mat, wallpaper } from '../materials.js';
import { ViewBuilder, boxMesh, ceiling, portrait, roomIn, roomWall, splitBox, type MapView } from './kit.js';

const H = CRUISE_ROOM_H;
/** Plane facings (rotation about Y): a sign facing +z (south), -z (north), +x (east), -x (west). */
const FACE_S = 0, FACE_N = Math.PI, FACE_E = Math.PI / 2, FACE_W = -Math.PI / 2;

const DAY_SKY = new THREE.Color('#8fcdf2');
const STORM_SKY = new THREE.Color('#131a28');
const FLASH_SKY = new THREE.Color('#c9d5ee');

// ───────────────────────── Canvas textures ─────────────────────────

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function roundRectPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

/** Teak decking: narrow planks with black caulking. One repeat = 2.4 m (16 planks). */
function teakTex(): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    const rh = 16;
    for (let r = 0; r < 16; r++) {
      let x = -((r * 53) % 97);
      for (let i = 0; x < 256; i++) {
        const len = 90 + ((r * 37 + i * 61) % 80);
        const sh = ((r * 13 + i * 29) % 26) - 13;
        g.fillStyle = `rgb(${183 + sh},${126 + sh * 0.6},${78 + sh * 0.4})`;
        g.fillRect(x, r * rh, len, rh);
        g.fillStyle = 'rgba(60,36,18,0.55)';
        g.fillRect(x, r * rh, 1.5, rh);
        g.strokeStyle = 'rgba(110,64,30,0.18)';
        g.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          g.moveTo(x, r * rh + 4 + k * 4);
          g.bezierCurveTo(x + len * 0.3, r * rh + 2 + k * 4, x + len * 0.6, r * rh + 7 + k * 3, x + len, r * rh + 4 + k * 4);
          g.stroke();
        }
        x += len;
      }
      g.fillStyle = '#2a1e16';
      g.fillRect(0, r * rh + rh - 2, 256, 2);
    }
  });
}

/** The casino's gloriously awful carpet. One repeat = 1.6 m. */
function casinoCarpetTex(): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#5c1428';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const cx = x * 64 + (y % 2) * 32, cy = y * 64 + 32;
      g.strokeStyle = '#d4a63a';
      g.lineWidth = 4;
      g.beginPath(); g.arc(cx, cy, 20, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = '#2b8c86';
      g.lineWidth = 3;
      g.beginPath(); g.arc(cx, cy, 10, 0.4, Math.PI * 1.6); g.stroke();
      g.fillStyle = '#e9c45a';
      g.beginPath(); g.moveTo(cx + 32, cy - 8); g.lineTo(cx + 40, cy); g.lineTo(cx + 32, cy + 8); g.lineTo(cx + 24, cy); g.closePath(); g.fill();
      g.fillStyle = '#7d2a52';
      g.beginPath(); g.arc(cx + 32, cy + 32, 6, 0, Math.PI * 2); g.fill();
    }
  });
}

/** Saloon carpet: navy with a gold lattice and anchors. One repeat = 1.2 m. */
function saloonCarpetTex(): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#1d3260';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(214,180,90,0.45)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 64); g.lineTo(64, 0); g.lineTo(128, 64); g.lineTo(64, 128); g.closePath(); g.stroke();
    g.strokeStyle = '#d6b45a';
    g.lineWidth = 3;
    for (const [cx, cy] of [[64, 64], [0, 0], [128, 0], [0, 128], [128, 128]]) {
      g.beginPath(); g.moveTo(cx, cy - 11); g.lineTo(cx, cy + 10); g.stroke();
      g.beginPath(); g.arc(cx, cy + 2, 9, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      g.beginPath(); g.moveTo(cx - 6, cy - 6); g.lineTo(cx + 6, cy - 6); g.stroke();
      g.beginPath(); g.arc(cx, cy - 13, 3, 0, Math.PI * 2); g.stroke();
    }
  });
}

/** The corridor runner: navy with a gold double border, the pattern along its length. */
function runnerTex(): THREE.CanvasTexture {
  const t = canvasTex(128, 128, (g) => {
    g.fillStyle = '#22356a';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#c9a24a';
    g.fillRect(6, 0, 5, 128); g.fillRect(117, 0, 5, 128);
    g.fillRect(15, 0, 2, 128); g.fillRect(111, 0, 2, 128);
    g.fillStyle = '#8e2a3a';
    g.beginPath(); g.moveTo(64, 30); g.lineTo(86, 64); g.lineTo(64, 98); g.lineTo(42, 64); g.closePath(); g.fill();
    g.fillStyle = '#c9a24a';
    g.beginPath(); g.arc(64, 64, 6, 0, Math.PI * 2); g.fill();
  });
  t.repeat.set(1, 9);
  return t;
}

/** Square tiles with grout. One repeat = 1 m (8 x 8). */
function tileTex(base: string, grout: string): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      g.fillStyle = `rgba(255,255,255,${((x * 7 + y * 13) % 5) * 0.025})`;
      g.fillRect(x * 16, y * 16, 16, 16);
    }
    g.fillStyle = grout;
    for (let i = 0; i < 8; i++) { g.fillRect(i * 16, 0, 1.5, 128); g.fillRect(0, i * 16, 128, 1.5); }
  });
}

/** Stripes (across u when `vertical`), for cushions, awnings, parasols and the towel hut. */
function stripeTex(a: string, b: string, n: number, vertical = true): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    const s = 128 / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? b : a;
      if (vertical) g.fillRect(i * s, 0, s + 0.5, 128);
      else g.fillRect(0, i * s, 128, s + 0.5);
    }
  });
}

/** Pool water: pale caustic ripples (scrolled in tick). */
function causticTex(): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(120,200,235,0.55)';
    g.lineWidth = 3;
    for (let i = 0; i < 26; i++) {
      const x = (i * 97) % 256, y = (i * 53) % 256;
      g.beginPath();
      g.moveTo(x - 30, y);
      g.bezierCurveTo(x - 10, y - 18, x + 12, y + 16, x + 34, y - 4);
      g.stroke();
    }
  });
}

/** The sea's surface detail: soft streaks and glints (tinted by the material colour, scrolled in tick). */
function seaTex(): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#d8e8f0';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) {
      const x = (i * 71) % 256, y = (i * 37 + (i % 7) * 11) % 256;
      const w = 20 + (i % 5) * 9;
      g.strokeStyle = i % 3 ? 'rgba(255,255,255,0.55)' : 'rgba(40,80,110,0.25)';
      g.lineWidth = 1.5 + (i % 3);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + w / 2, y - 3, x + w, y);
      g.stroke();
    }
  });
}

/** White foam streaks running along u (the wake), and its fade (alpha in the green channel). */
function foamTex(): THREE.CanvasTexture {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = '#9fb8c8';
    g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 60; i++) {
      const y = (i * 29) % 128, x = (i * 83) % 256, w = 30 + (i % 6) * 14;
      g.strokeStyle = `rgba(255,255,255,${0.5 + (i % 4) * 0.12})`;
      g.lineWidth = 2 + (i % 4);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + ((i % 3) - 1) * 2); g.stroke();
      g.beginPath(); g.moveTo(x - 256, y); g.lineTo(x - 256 + w, y + ((i % 3) - 1) * 2); g.stroke();
    }
  });
}

/** Alpha for the wake: strongest at the stern (u = 1), fading astern and to the sides. */
function wakeAlphaTex(): THREE.CanvasTexture {
  return canvasTex(128, 64, (g) => {
    const img = g.createImageData(128, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
      const along = x / 127; // 0 far astern .. 1 at the stern
      const across = Math.abs(y / 63 - 0.5) * 2; // 0 centre .. 1 edge
      const width = 0.35 + 0.65 * (1 - along); // the wake spreads astern
      const a = Math.max(0, 1 - across / width) * Math.pow(along, 0.7);
      const k = (y * 128 + x) * 4;
      const c = Math.round(255 * Math.min(1, a * 1.2));
      img.data[k] = c; img.data[k + 1] = c; img.data[k + 2] = c; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false);
}

/** Alpha for the bow wave: a white V from the stem, trailing aft (u = 1 at the bow). */
function bowAlphaTex(): THREE.CanvasTexture {
  return canvasTex(128, 64, (g) => {
    const img = g.createImageData(128, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
      const along = 1 - x / 127; // 0 at the stem .. 1 aft
      const across = Math.abs(y / 63 - 0.5) * 2;
      const edge = 0.15 + 0.85 * Math.min(1, along * 1.3);
      const band = Math.max(0, 1 - Math.abs(across - edge) / 0.16);
      const a = band * (1 - along * 0.9);
      const k = (y * 128 + x) * 4;
      const c = Math.round(255 * Math.min(1, a));
      img.data[k] = c; img.data[k + 1] = c; img.data[k + 2] = c; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false);
}

/** A lifebelt: red and white quarters, the ship's name round the top and a warning round the bottom. */
function lifebeltTex(top: string, bottom: string): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    const cx = 128, cy = 128, ro = 124, ri = 66;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#f4f1ea' : '#e0462e';
      g.beginPath();
      g.arc(cx, cy, ro, (i / 8) * Math.PI * 2 - Math.PI / 8, ((i + 1) / 8) * Math.PI * 2 - Math.PI / 8);
      g.arc(cx, cy, ri, ((i + 1) / 8) * Math.PI * 2 - Math.PI / 8, (i / 8) * Math.PI * 2 - Math.PI / 8, true);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = '#7a6a50';
    g.lineWidth = 4;
    g.beginPath(); g.arc(cx, cy, ro - 2, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, ri + 2, 0, Math.PI * 2); g.stroke();
    const arcText = (text: string, radius: number, centreAngle: number, upright: boolean) => {
      g.font = 'bold 22px Georgia, serif';
      g.fillStyle = '#16244a';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const step = 0.165;
      const n = text.length;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * step;
        const a = upright ? centreAngle + off : centreAngle - off;
        g.save();
        g.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
        g.rotate(upright ? a + Math.PI / 2 : a - Math.PI / 2);
        g.fillText(text[i], 0, 0);
        g.restore();
      }
    };
    arcText(top, 95, -Math.PI / 2, true);
    arcText(bottom, 95, Math.PI / 2, false);
  }, false);
}

/** The Red Ensign (a red flag with the Union flag in the canton). */
function ensignTex(): THREE.CanvasTexture {
  return canvasTex(192, 96, (g) => {
    g.fillStyle = '#c8202e';
    g.fillRect(0, 0, 192, 96);
    const w = 96, h = 48;
    g.fillStyle = '#012169';
    g.fillRect(0, 0, w, h);
    g.save();
    g.beginPath(); g.rect(0, 0, w, h); g.clip();
    g.strokeStyle = '#ffffff'; g.lineWidth = 10;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
    g.strokeStyle = '#c8102e'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
    g.restore();
    g.fillStyle = '#ffffff';
    g.fillRect(w / 2 - 8, 0, 16, h); g.fillRect(0, h / 2 - 8, w, 16);
    g.fillStyle = '#c8102e';
    g.fillRect(w / 2 - 5, 0, 10, h); g.fillRect(0, h / 2 - 5, w, 10);
  }, false);
}

/** The shuffleboard court painted on the deck: scoring triangles at both ends (u along the court). */
function courtTex(): THREE.CanvasTexture {
  return canvasTex(512, 64, (g) => {
    g.clearRect(0, 0, 512, 64);
    g.strokeStyle = '#f3e7b0';
    g.lineWidth = 3;
    g.strokeRect(3, 3, 506, 58);
    g.fillStyle = '#f3e7b0';
    g.font = 'bold 13px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const [x0, dir] of [[20, 1], [492, -1]] as const) {
      g.beginPath();
      g.moveTo(x0, 6); g.lineTo(x0, 58); g.lineTo(x0 + dir * 100, 32); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(x0 + dir * 34, 14); g.lineTo(x0 + dir * 34, 50); g.stroke();
      g.beginPath(); g.moveTo(x0 + dir * 68, 22); g.lineTo(x0 + dir * 68, 42); g.stroke();
      g.fillText('10', x0 + dir * 84, 32);
      g.fillText('8', x0 + dir * 52, 24); g.fillText('8', x0 + dir * 52, 40);
      g.fillText('7', x0 + dir * 18, 22); g.fillText('7', x0 + dir * 18, 42);
      g.fillText('10 OFF', x0 + dir * 130, 32);
    }
    g.fillRect(254, 6, 4, 52);
  }, false);
}

type Line = string | { t: string; s?: number; c?: string; f?: string };
interface SignStyle {
  bg?: string; fg?: string; border?: string; font?: string; bold?: boolean; italic?: boolean;
  /** Emissive glow (neon, lit screens). */
  glow?: number; radius?: number;
  /** No background: the letters alone (alpha-tested), e.g. lettering painted on a wall. */
  clear?: boolean;
}

/** A sign: lines of text on a board, fitted to w x h metres, as a plane facing +z. */
function sign(lines: Line[], w: number, h: number, st: SignStyle = {}): THREE.Mesh {
  const ppm = Math.min(220, 1024 / Math.max(w, h));
  const cw = Math.max(32, Math.round(w * ppm)), ch = Math.max(32, Math.round(h * ppm));
  const tex = canvasTex(cw, ch, (g) => {
    const rad = (st.radius ?? 0.04) * ppm;
    if (!st.clear) {
      g.fillStyle = st.bg ?? '#f4f1ea';
      roundRectPath(g, 0, 0, cw, ch, rad);
      g.fill();
    }
    if (st.border) {
      const lw = Math.max(2, Math.min(cw, ch) * 0.045);
      g.strokeStyle = st.border;
      g.lineWidth = lw;
      roundRectPath(g, lw * 1.2, lw * 1.2, cw - lw * 2.4, ch - lw * 2.4, rad * 0.7);
      g.stroke();
    }
    const L = lines.map((l) => (typeof l === 'string' ? { t: l } : l));
    const pad = Math.min(cw, ch) * 0.12;
    const total = L.reduce((a, l) => a + (l.s ?? 1), 0);
    let unit = (ch - pad * 2) / (total * 1.18);
    const fontOf = (l: { s?: number; f?: string }, u: number) =>
      `${st.italic ? 'italic ' : ''}${st.bold === false ? '' : 'bold '}${Math.max(6, u * (l.s ?? 1))}px ${l.f ?? st.font ?? 'Georgia, "Times New Roman", serif'}`;
    for (const l of L) {
      g.font = fontOf(l, unit);
      const wpx = g.measureText(l.t).width;
      if (wpx > cw - pad * 2) unit *= (cw - pad * 2) / wpx;
    }
    const usedH = L.reduce((a, l) => a + unit * (l.s ?? 1) * 1.18, 0);
    let y = (ch - usedH) / 2;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const l of L) {
      const lh = unit * (l.s ?? 1) * 1.18;
      g.font = fontOf(l, unit);
      g.fillStyle = l.c ?? st.fg ?? '#1d2d50';
      g.fillText(l.t, cw / 2, y + lh / 2);
      y += lh;
    }
  }, false);
  const m = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.75, alphaTest: st.clear ? 0.35 : 0, transparent: false,
    emissive: st.glow ? '#ffffff' : '#000000', emissiveMap: st.glow ? tex : null, emissiveIntensity: st.glow ?? 0,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

// ───────────────────────── The waves ─────────────────────────

const WAVES = [
  { a: 0.17, k: (2 * Math.PI) / 15, dx: 0.94, dz: 0.34, w: 0.85, p: 0 },
  { a: 0.1, k: (2 * Math.PI) / 9, dx: -0.28, dz: 0.96, w: 1.25, p: 1.7 },
  { a: 0.06, k: (2 * Math.PI) / 6, dx: 0.71, dz: -0.7, w: 1.8, p: 3.1 },
];

/** Height of the sea (above SEA_Y) and its slope at (x, z) at time t. */
function waveAt(x: number, z: number, t: number, amp: number, out: { h: number; sx: number; sz: number }): void {
  let h = 0, sx = 0, sz = 0;
  for (const w of WAVES) {
    const ph = w.k * (w.dx * x + w.dz * z) - w.w * t + w.p;
    const a = w.a * amp;
    h += a * Math.sin(ph);
    const c = a * w.k * Math.cos(ph);
    sx += c * w.dx;
    sz += c * w.dz;
  }
  out.h = h; out.sx = sx; out.sz = sz;
}

/** A flat grid (y up) whose vertices follow the waves: the sea, the wake, the bow wave. */
class WaveSheet {
  readonly mesh: THREE.Mesh;
  private base: Float32Array;
  private tmp = { h: 0, sx: 0, sz: 0 };
  constructor(w: number, d: number, sx: number, sz: number, m: THREE.Material, private cx: number, private cz: number, private lift: number) {
    const g = new THREE.PlaneGeometry(w, d, sx, sz);
    g.rotateX(-Math.PI / 2);
    this.base = (g.attributes.position.array as Float32Array).slice();
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.position.set(cx, SEA_Y, cz);
    this.mesh.frustumCulled = false;
  }
  update(t: number, amp: number): void {
    const g = this.mesh.geometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute;
    const o = this.tmp;
    for (let i = 0; i < pos.count; i++) {
      const x = this.base[i * 3] + this.cx, z = this.base[i * 3 + 2] + this.cz;
      waveAt(x, z, t, amp, o);
      pos.setY(i, o.h + this.lift);
      const len = Math.hypot(o.sx, 1, o.sz);
      nor.setXYZ(i, -o.sx / len, 1 / len, -o.sz / len);
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }
}

// ───────────────────────── The builder ─────────────────────────

export function buildCruise(def: MapDef): MapView {
  const v = new ViewBuilder(def);

  // Materials (white and navy, teak and brass).
  const paint = mat('#f3f0e8', { rough: 0.55 });
  const navy = mat('#1d2d50', { rough: 0.55 });
  const brass = mat('#c9a24a', { rough: 0.3, metal: 0.85 });
  const chrome = mat('#dfe4e8', { rough: 0.2, metal: 0.9 });
  const steel = mat('#9aa3aa', { rough: 0.45, metal: 0.6 });
  const teak = mat('#ffffff', { map: teakTex(), rough: 0.75 });
  const teakWood = mat('#9c6236', { rough: 0.55 });
  const darkWood = mat('#4a2a1a', { rough: 0.45 });
  const mahogany = mat('#6a2f22', { rough: 0.4 });
  const black = mat('#141418', { rough: 0.25 });
  const red = mat('#c23a2e', { rough: 0.55 });
  const orange = mat('#ee6e1f', { rough: 0.55 });
  const cream = mat('#efe6cf', { rough: 0.8 });
  const linen = mat('#fbf8f0', { rough: 0.9 });
  const marble = mat('#eceae4', { rough: 0.3 });
  const gold = mat('#e0b84a', { rough: 0.3, metal: 0.9 });
  const green = mat('#2f7a4a', { rough: 0.6 });
  const felt = mat('#1f6b3e', { rough: 0.95 });
  const rope = mat('#c9a878', { rough: 1 });
  const pink = mat('#f07aa8', { rough: 0.5 });
  const bulb = mat('#fff4d6', { emissive: '#ffd89a', emissiveIntensity: 2 });
  const flame = mat('#ffd27a', { emissive: '#ffb347', emissiveIntensity: 2.5 });
  const glass = new THREE.MeshStandardMaterial({ color: '#cfeef7', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2, depthWrite: false });
  const windows = new THREE.MeshStandardMaterial({ color: '#cfe0ff', emissive: '#bcd3ff', emissiveIntensity: 0.9, roughness: 0.2 });
  const darkGlass = mat('#1b2d44', { rough: 0.15, metal: 0.4 });
  const poolBlue = mat('#ffffff', { map: tileTex('#2f9fd8', 'rgba(220,240,255,0.8)'), rough: 0.3 });
  const poolWhite = mat('#ffffff', { map: tileTex('#eef3f4', 'rgba(150,170,180,0.8)'), rough: 0.35 });
  const blueStripe = mat('#ffffff', { map: stripeTex('#f4f1ea', '#2c5aa0', 8), rough: 0.85 });
  const redStripe = mat('#ffffff', { map: stripeTex('#f4f1ea', '#d0443a', 8), rough: 0.85 });
  const navyStripe = mat('#ffffff', { map: stripeTex('#f4f1ea', '#1d2d50', 6), rough: 0.85 });
  const wallMats: Record<string, THREE.Material> = {
    'Casino Lounge': mat('#5a2a50', { map: wallpaper(), rough: 0.9 }),
    "Captain's Saloon": mat('#2f5084', { map: wallpaper(), rough: 0.9 }),
    'Cabin Corridor': mat('#eadfc4', { map: wallpaper(), rough: 0.9 }),
  };
  const wallMat = (room: string): THREE.Material => wallMats[room] ?? paint;
  const roomOf = (p: { x: number; y: number; z: number }) => roomIn(def, p);

  const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: THREE.Material | THREE.Material[], block = false, tile = 1): THREE.Mesh =>
    v.add(boxMesh(x0, y0, z0, x1, y1, z1, m, tile), block);
  const put = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0, block = false): T => {
    o.position.set(x, y, z);
    o.rotation.y = ry;
    return v.add(o, block);
  };
  const cyl = (rt: number, rb: number, h: number, m: THREE.Material, seg = 12): THREE.Mesh => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  const sph = (r: number, m: THREE.Material, ws = 12, hs = 8): THREE.Mesh => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), m);
  const gbox = (g: THREE.Object3D, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: THREE.Material | THREE.Material[]): THREE.Mesh => {
    const b = boxMesh(x0, y0, z0, x1, y1, z1, m);
    g.add(b);
    return b;
  };
  const gput = <T extends THREE.Object3D>(g: THREE.Object3D, o: T, x: number, y: number, z: number): T => {
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  /** A sign (see sign()) placed facing `ry`. */
  const board = (lines: Line[], w: number, h: number, st: SignStyle, x: number, y: number, z: number, ry: number): THREE.Mesh => put(sign(lines, w, h, st), x, y, z, ry);
  /** A porthole on a wall: a brass ring and a glowing pane, facing `ry`. */
  const porthole = (x: number, y: number, z: number, ry: number, r = 0.26): void => {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 8, 20), brass);
    ring.position.z = 0.03;
    g.add(ring);
    const pane = new THREE.Mesh(new THREE.CircleGeometry(r, 20), windows);
    pane.position.z = 0.008;
    g.add(pane);
    put(g, x, y, z, ry);
  };
  /** A lifebelt with lettering, hung facing `ry`. */
  const lifebelt = (x: number, y: number, z: number, ry: number, top: string, bottom: string): void => {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.07, 8, 24), mat('#f4f1ea', { rough: 0.6 }));
    ring.position.z = -0.03;
    g.add(ring);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.76), new THREE.MeshStandardMaterial({ map: lifebeltTex(top, bottom), alphaTest: 0.5, roughness: 0.6 }));
    face.position.z = 0.045;
    g.add(face);
    put(g, x, y, z, ry);
  };

  // ── Decks: teak on the lido and the corridor, carpets in the lounge and saloon ──
  const sideM = [paint, paint];
  bx(283.7, -0.2, -8.3, 300, 0, 8.3, [paint, paint, teak, paint, paint, paint], true, 2.4);
  bx(300, -0.2, -8.3, 309.65, 0, 0, [...sideM, mat('#ffffff', { map: casinoCarpetTex(), rough: 0.95 }), paint, paint, paint], true, 1.6);
  bx(300, -0.2, 0, 309.65, 0, 8.3, [...sideM, mat('#ffffff', { map: saloonCarpetTex(), rough: 0.95 }), paint, paint, paint], true, 0.9);
  bx(309.65, -0.2, -8.3, 312.8, 0, 8.3, [...sideM, teak, paint, paint, paint], true, 2.4);
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 15.4), mat('#ffffff', { map: runnerTex(), rough: 0.95 }));
  runner.rotation.x = -Math.PI / 2;
  put(runner, 311.05, 0.006, 0);

  // ── Every box of the map ──
  for (const b of def.boxes) {
    const { min: a, max: c } = b;
    const label = b.label ?? '';
    switch (b.kind) {
      case 'wall':
        if (label.includes('bulwark')) bulwark(b);
        else if (label === 'Towel hut') towelHut(b);
        else if (label.startsWith('Ventilator')) ventilator(b, label.endsWith('port') ? -1 : 1);
        else {
          const parts = label === 'Aft wall' || label === 'Corridor wall' ? splitBox(b, 'z', 0) : [b];
          for (const p of parts) roomWall(v, p, roomOf, wallMat, navy);
        }
        break;
      case 'railing':
        if (label === 'Lifeboat 4 rope') gapRope();
        else poolRim(b, label);
        break;
      case 'slab':
        bx(a.x, a.y, a.z, c.x, c.y, c.z, poolBlue, true);
        break;
      case 'chair':
        deckchair(b);
        break;
      case 'counter':
        if (label.startsWith('Lounger')) lounger(b, label.includes('port') ? -1 : 1);
        else if (label === 'Lido bar') lidoBar(b);
        else if (label === 'Slot machines') slots(b);
        else if (label === 'Grand piano') piano(b);
        else if (label === 'Roulette table') roulette(b);
        else if (label === 'Buffet') buffet(b);
        else if (label === "Purser's desk") purser(b);
        else if (label === 'Cleaning trolley') trolley(b);
        else bx(a.x, a.y, a.z, c.x, c.y, c.z, teakWood, true);
        break;
      case 'table':
        captainsTable(b);
        break;
      case 'pedestal':
        plinth(b);
        break;
      default:
        break;
    }
  }

  // Ceilings, seen from below (the overview looks in from above).
  ceiling(v, 300.3, -8, 309.5, -0.15, H, mat('#3a1a34', { rough: 0.9 }));
  ceiling(v, 300.3, 0.15, 309.5, 8, H, mat('#f2ede0', { rough: 1 }));
  ceiling(v, 309.8, -8, 312.5, 8, H, mat('#f4efe2', { rough: 1 }));

  // ───────────── The pieces ─────────────

  /** The lido's waist-high bulwark: a white steel foot, glass panels, steel posts and a teak handrail. */
  function bulwark(b: Box): void {
    const { min: a, max: c } = b;
    const alongX = c.x - a.x > c.z - a.z;
    bx(a.x, 0, a.z, c.x, 0.32, c.z, paint, true);
    const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
    if (alongX) bx(a.x, 0.32, mz - 0.025, c.x, 1.0, mz + 0.025, glass, true);
    else bx(mx - 0.025, 0.32, a.z, mx + 0.025, 1.0, c.z, glass, true);
    bx(a.x - (alongX ? 0 : 0.04), 1.0, a.z - (alongX ? 0.04 : 0), c.x + (alongX ? 0 : 0.04), BULWARK_H, c.z + (alongX ? 0.04 : 0), teakWood, true);
    const len = alongX ? c.x - a.x : c.z - a.z;
    const n = Math.max(1, Math.round(len / 1.6));
    for (let i = 0; i <= n; i++) {
      const t = a[alongX ? 'x' : 'z'] + (i / n) * len;
      if (alongX) bx(t - 0.03, 0.32, mz - 0.05, t + 0.03, 1.0, mz + 0.05, chrome);
      else bx(mx - 0.05, 0.32, t - 0.03, mx + 0.05, 1.0, t + 0.03, chrome);
    }
  }

  /** The Lifeboat 4 gate: two brass stanchions, a sagging rope, the sign, and the gate itself hanging off over the sea. */
  function gapRope(): void {
    const z = -8.15;
    for (const x of [GAP.x0 + 0.06, GAP.x1 - 0.06]) {
      put(cyl(0.035, 0.05, 1.0, brass, 10), x, 0.5, z);
      put(sph(0.07, brass), x, 1.04, z);
      put(cyl(0.12, 0.14, 0.05, brass, 14), x, 0.025, z);
    }
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector3(GAP.x0 + 0.06 + t * (GAP.x1 - GAP.x0 - 0.12), 0.98 - 0.26 * Math.sin(Math.PI * t), z));
    }
    put(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.035, 6, false), mat('#a8202c', { rough: 0.8 })), 0, 0, 0);
    // The sign hangs from the rope's lowest point, a little askew.
    const s = sign([{ t: 'LIFEBOAT 4', s: 1.15, c: '#b3201c' }, { t: 'GATE OUT OF ORDER', s: 0.8 }], 0.86, 0.36, { bg: '#f7f3e6', border: '#b3201c', font: 'Arial, Helvetica, sans-serif' });
    s.rotation.z = 0.06;
    put(s, (GAP.x0 + GAP.x1) / 2, 0.5, z + 0.03, FACE_S);
    for (const dx of [-0.25, 0.25]) put(cyl(0.006, 0.006, 0.18, steel, 4), (GAP.x0 + GAP.x1) / 2 + dx, 0.76, z + 0.03);
    // The gate: hanging off its lower hinge, swung out over the side.
    const gate = new THREE.Group();
    gbox(gate, 0, 0, -0.03, 1.7, 0.08, 0.03, chrome);
    gbox(gate, 0, 0.62, -0.04, 1.7, 0.72, 0.04, teakWood);
    gbox(gate, 0, 0, -0.03, 0.06, 0.72, 0.03, chrome);
    gbox(gate, 1.64, 0, -0.03, 1.7, 0.72, 0.03, chrome);
    gbox(gate, 0.06, 0.08, -0.015, 1.64, 0.62, 0.015, glass);
    gate.position.set(GAP.x1, 0.25, -8.3);
    gate.rotation.set(0.2, 2.1, -0.4, 'YXZ');
    v.add(gate);
    // The empty davits of Lifeboat 4, their falls dangling to the sea.
    for (const x of [GAP.x0 - 0.35, GAP.x1 + 0.35]) {
      put(cyl(0.07, 0.09, 3.0, navy, 10), x, 0.7, -8.45);
      put(boxMesh(x - 0.06, 0, 0, x + 0.06, 0.12, 1.6, navy), x, 2.15, -9.25);
      put(cyl(0.012, 0.012, 3.6, rope, 4), x, 0.35, -10.0);
      put(cyl(0.09, 0.09, 0.14, steel, 10), x, 2.05, -10.0);
    }
    board([{ t: 'LIFEBOAT', s: 0.6 }, { t: '4', s: 1.4 }], 0.34, 0.42, { bg: '#1d2d50', fg: '#f4f1ea', font: 'Arial, sans-serif' }, GAP.x0 - 0.35, 1.55, -8.36, FACE_S);
  }

  /** A rim of the raised pool: teak coping, white tiles outside, blue tiles in. */
  function poolRim(b: Box, label: string): void {
    const { min: a, max: c } = b;
    const inner = label.endsWith('north') ? 4 : label.endsWith('south') ? 5 : label.endsWith('west') ? 0 : 1;
    const faces = [poolWhite, poolWhite, teakWood, poolWhite, poolWhite, poolWhite];
    faces[inner] = poolBlue;
    bx(a.x, a.y, a.z, c.x, c.y - 0.06, c.z, faces, true);
    bx(a.x - 0.03, c.y - 0.06, a.z - 0.03, c.x + 0.03, c.y, c.z + 0.03, teakWood, true);
  }

  /** Nana's deckchair (facing the bow, +x): a grand steamer chair with the S.K.I. banner, a parasol and a gin. */
  function deckchair(b: Box): void {
    const { min: a, max: c } = b;
    const z0 = a.z, z1 = c.z;
    // Legs and frame.
    for (const [x, z] of [[a.x + 0.1, z0 + 0.1], [c.x - 0.1, z0 + 0.1], [a.x + 0.1, z1 - 0.1], [c.x - 0.1, z1 - 0.1]]) bx(x - 0.04, 0, z - 0.04, x + 0.04, 0.3, z + 0.04, teakWood);
    bx(a.x + 0.05, 0.3, z0 + 0.05, c.x, 0.42, z1 - 0.05, teakWood, true);
    bx(a.x + 0.12, 0.42, z0 + 0.12, c.x - 0.02, 0.52, z1 - 0.12, navyStripe, true);
    // Arms.
    for (const z of [z0 + 0.02, z1 - 0.12]) {
      bx(a.x + 0.15, 0.42, z, c.x - 0.15, 0.72, z + 0.1, teakWood, true);
      bx(a.x + 0.1, 0.72, z - 0.02, c.x - 0.05, 0.78, z + 0.12, teakWood, true);
    }
    // The reclined back, padded.
    const back = new THREE.Group();
    gbox(back, -0.06, 0, z0 + 0.05, 0.06, 1.15, z1 - 0.05, teakWood);
    gbox(back, 0.06, 0.05, z0 + 0.12, 0.16, 1.05, z1 - 0.12, navyStripe);
    back.position.set(a.x + 0.22, 0.42, 0);
    back.rotation.z = 0.32;
    v.add(back, true);
    // Footrest.
    bx(c.x, 0.3, z0 + 0.15, c.x + 0.45, 0.38, z1 - 0.15, teakWood);
    bx(c.x, 0.38, z0 + 0.2, c.x + 0.42, 0.44, z1 - 0.2, navyStripe);
    // A cushion with tassels.
    put(sph(0.18, mat('#c9a24a', { rough: 0.8 }), 10, 6), a.x + 0.42, 0.7, 0).scale.set(0.6, 1, 1.4);
    // The S.K.I. banner on two poles behind her.
    for (const z of [-0.85, 0.85]) {
      put(cyl(0.03, 0.03, 2.4, brass, 8), a.x + 0.02, 1.2, z);
      put(sph(0.05, brass), a.x + 0.02, 2.42, z);
    }
    board([{ t: 'S.K.I.', s: 1.5, c: '#b3201c' }, { t: "Spending the Kids' Inheritance", s: 0.62 }], 1.66, 0.62, { bg: '#f7f1de', border: '#c9a24a', italic: false }, a.x + 0.05, 1.92, 0, FACE_E);
    // Her parasol.
    put(cyl(0.025, 0.025, 2.5, chrome, 8), a.x + 0.25, 1.25, 1.35);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.5, 16, 1, true), mat('#ffffff', { map: stripeTex('#f4f1ea', '#d0443a', 16), rough: 0.85 }));
    (shade.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    put(shade, a.x + 0.25, 2.5, 1.35);
    // Side table with a large gin.
    put(cyl(0.22, 0.22, 0.03, teakWood, 16), c.x + 0.05, 0.62, -1.15);
    put(cyl(0.03, 0.05, 0.6, teakWood, 8), c.x + 0.05, 0.31, -1.15);
    put(cyl(0.045, 0.04, 0.14, glass, 10), c.x + 0.05, 0.705, -1.15);
    put(sph(0.02, mat('#8fd14f')), c.x + 0.06, 0.76, -1.15);
  }

  /** A sun lounger (head end against the bulwark), with a striped cushion. */
  function lounger(b: Box, side: -1 | 1): void {
    const { min: a, max: c } = b;
    const head = side < 0 ? a.z : c.z;
    for (const [x, z] of [[a.x + 0.06, a.z + 0.08], [c.x - 0.06, a.z + 0.08], [a.x + 0.06, c.z - 0.08], [c.x - 0.06, c.z - 0.08]]) bx(x - 0.03, 0, z - 0.03, x + 0.03, 0.28, z + 0.03, chrome);
    bx(a.x, 0.28, a.z, c.x, 0.38, c.z, paint, true);
    bx(a.x + 0.04, 0.38, a.z + 0.04, c.x - 0.04, 0.5, c.z - 0.04, blueStripe, true);
    // The backrest, raised at the head end (hinged 0.66 m from it).
    const back = new THREE.Group();
    if (side < 0) gbox(back, a.x + 0.04, 0, -0.62, c.x - 0.04, 0.1, 0, blueStripe);
    else gbox(back, a.x + 0.04, 0, 0, c.x - 0.04, 0.1, 0.62, blueStripe);
    back.position.set(0, 0.46, head - side * 0.66);
    back.rotation.x = side < 0 ? 0.75 : -0.75;
    v.add(back, true);
  }

  /** The Last Resort: the lido bar, with its striped awning, stools and umbrella drinks. */
  function lidoBar(b: Box): void {
    const { min: a, max: c } = b;
    bx(a.x, 0, a.z, c.x, c.y - 0.08, c.z, navy, true);
    bx(a.x - 0.05, c.y - 0.08, a.z - 0.08, c.x + 0.05, c.y, c.z, teakWood, true);
    bx(a.x, 0.18, a.z - 0.14, c.x, 0.22, a.z - 0.1, brass);
    for (let x = a.x + 0.4; x < c.x - 0.2; x += 0.9) bx(x - 0.03, 0.45, a.z - 0.01, x + 0.03, 0.95, a.z, gold);
    // Awning on four posts.
    for (const [x, z] of [[a.x + 0.05, a.z + 0.1], [c.x - 0.05, a.z + 0.1], [a.x + 0.05, c.z - 0.1], [c.x - 0.05, c.z - 0.1]]) put(cyl(0.04, 0.04, 2.5 - c.y, chrome, 8), x, c.y + (2.5 - c.y) / 2, z);
    const awn = new THREE.Group();
    gbox(awn, a.x - 0.3, 0, -0.75, c.x + 0.3, 0.06, 0.75, mat('#ffffff', { map: stripeTex('#f4f1ea', '#2c5aa0', 10), rough: 0.85 }));
    for (let x = a.x - 0.3; x < c.x + 0.3; x += 0.3) {
      const flap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.18, 3), Math.round((x - a.x) / 0.3) % 2 ? paint : mat('#2c5aa0', { rough: 0.8 }));
      flap.rotation.x = Math.PI;
      gput(awn, flap, x + 0.15, -0.09, -0.75);
    }
    awn.position.set(0, 2.5, (a.z + c.z) / 2 - 0.25);
    awn.rotation.x = -0.12;
    v.add(awn);
    board([{ t: 'THE LAST RESORT', s: 1.2, c: '#f4d27a' }, { t: 'Piña Colada · Sex on the Beach (not at your age)', s: 0.55, c: '#f4f1ea' }, { t: 'The Inheritance — market price', s: 0.55, c: '#f4f1ea' }],
      2.4, 0.5, { bg: '#1d2d50', border: '#c9a24a' }, (a.x + c.x) / 2, 2.02, a.z - 0.52, FACE_N);
    // Stools.
    for (let x = a.x + 0.55; x < c.x; x += 1.1) {
      put(cyl(0.025, 0.025, 0.72, chrome, 6), x, 0.36, a.z - 0.5);
      put(cyl(0.2, 0.2, 0.02, chrome, 12), x, 0.01, a.z - 0.5);
      put(cyl(0.19, 0.19, 0.08, red, 14), x, 0.76, a.z - 0.5);
    }
    // Umbrella drinks (the teacup's spot, x 295.2, is left clear), a pineapple, a shaker.
    const umb = [mat('#e8467a'), mat('#ffd23a'), mat('#3ac4e8'), mat('#7ad04a')];
    const drinks: [number, number][] = [[294.45, 0], [296.4, 1], [297.25, 2], [298.15, 3]];
    for (const [x, k] of drinks) {
      const z = 7.45;
      put(cyl(0.05, 0.035, 0.16, glass, 10), x, c.y + 0.08, z);
      put(cyl(0.045, 0.03, 0.12, k % 2 ? mat('#ffb04a', { rough: 0.3 }) : mat('#ff6a8a', { rough: 0.3 }), 10), x, c.y + 0.07, z);
      const u = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.05, 8), umb[k]);
      put(u, x + 0.03, c.y + 0.26, z);
      put(cyl(0.004, 0.004, 0.16, paint, 4), x + 0.03, c.y + 0.18, z).rotation.z = -0.2;
    }
    put(sph(0.1, mat('#d9a43a', { rough: 0.8 }), 10, 8), 297.75, c.y + 0.1, 7.75).scale.set(1, 1.35, 1);
    put(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6), mat('#4f8a3a')), 297.75, c.y + 0.3, 7.75);
    put(cyl(0.05, 0.05, 0.22, chrome, 10), 296.0, c.y + 0.11, 7.8);
    board(['Happy Hour 6–7 pm', { t: '(Nana: 9 am – midnight)', s: 0.8 }], 0.62, 0.3, { bg: '#2b3a2f', fg: '#f0ecd8', font: '"Comic Sans MS", "Chalkboard SE", cursive', bold: false }, 294.25, c.y + 0.2, 7.85, FACE_N).rotation.x = 0.25;
  }

  /** The towel hut: a striped kiosk with towels piled in its hatch. */
  function towelHut(b: Box): void {
    const { min: a, max: c } = b;
    bx(a.x, 0, a.z, c.x, c.y - 0.2, c.z, mat('#ffffff', { map: stripeTex('#f4f1ea', '#2c5aa0', 10), rough: 0.85 }), true);
    bx(a.x - 0.15, c.y - 0.2, a.z - 0.05, c.x + 0.05, c.y, c.z + 0.15, navy, true);
    // The hatch facing the deck (+z), with towels.
    bx(a.x + 0.2, 0.95, c.z, c.x - 0.2, 1.0, c.z + 0.2, teakWood);
    const towelCols = ['#f4f1ea', '#5fa8d8', '#f4f1ea', '#e8746a', '#f4f1ea'];
    for (let i = 0; i < 5; i++) bx(a.x + 0.3 + i * 0.22, 1.0, c.z - 0.25, a.x + 0.48 + i * 0.22, 1.12 + (i % 2) * 0.08, c.z + 0.12, mat(towelCols[i], { rough: 1 }));
    board([{ t: 'TOWELS', s: 1.2 }, { t: 'One per guest.', s: 0.6 }, { t: 'Mrs ______: as many as she likes.', s: 0.6 }], 1.4, 0.55, { bg: '#f4f1ea', border: '#1d2d50' }, (a.x + c.x) / 2, 1.65, c.z + 0.01, FACE_S);
  }

  /** A ship's cowl ventilator: a white trunk and a bell mouth, red inside, turned to the wind. */
  function ventilator(b: Box, side: -1 | 1): void {
    const { min: a, max: c } = b;
    const x = (a.x + c.x) / 2, z = (a.z + c.z) / 2;
    put(cyl(0.3, 0.32, 0.1, navy, 16), x, 0.05, z, 0, true);
    put(cyl(0.24, 0.26, 1.7, paint, 16), x, 0.9, z, 0, true);
    const head = new THREE.Group();
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), paint);
    bell.rotation.x = Math.PI / 2;
    head.add(bell);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), red);
    mouth.rotation.y = Math.PI; // the bell's open side is local -z
    head.add(mouth);
    head.add(new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 6, 18), paint));
    head.position.set(x, 1.95, z);
    // Mouths turned in toward the pool (and Nana): south-west on the port side, north-west on the starboard.
    head.rotation.y = side < 0 ? (3 * Math.PI) / 4 : Math.PI / 4;
    v.add(head, true);
  }

  /** A display plinth for the heirlooms: navy base, white column, brass cap. */
  function plinth(b: Box): void {
    const { min: a, max: c } = b;
    bx(a.x, a.y, a.z, c.x, a.y + 0.12, c.z, navy, true);
    bx(a.x + 0.1, a.y + 0.12, a.z + 0.1, c.x - 0.1, c.y - 0.08, c.z - 0.1, marble, true);
    bx(a.x - 0.02, c.y - 0.08, a.z - 0.02, c.x + 0.02, c.y, c.z + 0.02, brass);
    for (const yy of [a.y + 0.35, c.y - 0.2]) bx(a.x + 0.08, yy, a.z + 0.08, c.x - 0.08, yy + 0.03, c.z - 0.08, brass);
  }

  /** The casino's bank of one-armed bandits (screens on both sides). */
  function slots(b: Box): void {
    const { min: a, max: c } = b;
    const n = 3, len = (c.z - a.z) / n;
    const reels = [['WILL', 'WILL', "WON'T"], ['NANA', 'NANA', 'NANA'], ['£', '£', 'IOU']];
    const toppers = ['ONE-ARMED BANDIT', 'JACKPOT: THE WILL', 'PAYS OUT ON DEATH'];
    for (let i = 0; i < n; i++) {
      const z0 = a.z + i * len + 0.03, z1 = z0 + len - 0.06, zm = (z0 + z1) / 2;
      bx(a.x, 0, z0, c.x, 0.85, z1, mat('#7a1a2a', { rough: 0.4 }), true);
      bx(a.x + 0.05, 0.85, z0, c.x - 0.05, 1.5, z1, mat('#2a1a2e', { rough: 0.3 }), true);
      bx(a.x, 1.5, z0, c.x, c.y, z1, gold, true);
      bx(a.x - 0.02, 0.82, z0 + 0.02, c.x + 0.02, 0.86, z1 - 0.02, chrome);
      for (const [x, ry] of [[a.x + 0.04, FACE_W], [c.x - 0.04, FACE_E]] as const) {
        const reel = sign([reels[i].join('  ·  ')], len - 0.2, 0.28, { bg: '#fff6d8', fg: '#8a1020', font: 'Arial, sans-serif', glow: 0.6 });
        put(reel, x + (ry === FACE_W ? -0.002 : 0.002), 1.2, zm, ry);
        put(sign([toppers[i]], len - 0.12, 0.2, { bg: '#1a0f22', fg: '#ffd84a', font: 'Arial, sans-serif', glow: 1.2 }), x + (ry === FACE_W ? -0.045 : 0.045), 1.66, zm, ry);
      }
    }
    // The arm on each end machine.
    for (const z of [a.z - 0.06, c.z + 0.06]) {
      put(cyl(0.02, 0.02, 0.55, chrome, 6), (a.x + c.x) / 2, 1.25, z);
      put(sph(0.06, red), (a.x + c.x) / 2, 1.55, z);
    }
    // A stool at each machine on the lido side.
    for (let i = 0; i < n; i++) {
      const zm = a.z + (i + 0.5) * len;
      put(cyl(0.025, 0.025, 0.62, chrome, 6), a.x - 0.5, 0.31, zm);
      put(cyl(0.17, 0.17, 0.07, red, 12), a.x - 0.5, 0.65, zm);
    }
  }

  /** The grand piano (keyboard to the south), with its lid up, a candelabra and the tip jar. */
  function piano(b: Box): void {
    const { min: a, max: c } = b;
    for (const [x, z] of [[a.x + 0.15, c.z - 0.15], [c.x - 0.15, c.z - 0.15], [(a.x + c.x) / 2, a.z + 0.2]]) bx(x - 0.06, 0, z - 0.06, x + 0.06, 0.62, z + 0.06, black);
    // The body: a rectangle with a rounded tail to the north.
    const shape = new THREE.Shape();
    const w = c.x - a.x, d = c.z - a.z;
    shape.moveTo(0, 0);
    shape.lineTo(w, 0);
    shape.lineTo(w, d * 0.45);
    shape.quadraticCurveTo(w, d, w * 0.45, d);
    shape.quadraticCurveTo(0, d, 0, d * 0.6);
    shape.lineTo(0, 0);
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.36, bevelEnabled: false }), black);
    body.rotation.x = -Math.PI / 2; // shape y runs north (-z) from the keyboard edge, extruded up
    body.position.set(a.x, c.y - 0.36, c.z);
    v.add(body, true);
    // Keyboard on the south side.
    bx(a.x + 0.08, 0.66, c.z, c.x - 0.08, 0.72, c.z + 0.22, paint, true);
    for (let x = a.x + 0.14; x < c.x - 0.12; x += 0.09) if (Math.round((x - a.x) / 0.09) % 7 !== 2) bx(x, 0.72, c.z + 0.02, x + 0.04, 0.745, c.z + 0.14, black);
    bx(a.x + 0.05, 0.72, c.z, c.x - 0.05, 0.82, c.z + 0.03, black);
    // The lid, propped open toward the room.
    const lidHinge = new THREE.Group();
    const lid = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false }), black);
    lid.rotation.x = -Math.PI / 2;
    lidHinge.add(lid);
    lidHinge.position.set(a.x, c.y, c.z);
    lidHinge.rotation.z = 0.55;
    v.add(lidHinge);
    put(cyl(0.012, 0.012, 0.75, black, 4), c.x - 0.2, c.y + 0.35, (a.z + c.z) / 2).rotation.z = 0.2;
    // Bench.
    bx(a.x + 0.5, 0, c.z + 0.55, c.x - 0.5, 0.48, c.z + 0.9, black);
    bx(a.x + 0.52, 0.48, c.z + 0.56, c.x - 0.52, 0.53, c.z + 0.89, mat('#7a1f2b', { rough: 0.9 }));
    // A candelabra, a brandy, and the tip jar.
    put(cyl(0.05, 0.08, 0.3, brass, 8), a.x + 0.35, c.y + 0.15, a.z + 0.6);
    for (const dz of [-0.12, 0, 0.12]) {
      put(cyl(0.018, 0.018, 0.16, cream, 6), a.x + 0.35, c.y + 0.38, a.z + 0.6 + dz);
      put(sph(0.022, flame, 6, 4), a.x + 0.35, c.y + 0.48, a.z + 0.6 + dz);
    }
    put(cyl(0.07, 0.07, 0.16, glass, 12), c.x - 0.35, c.y + 0.08, a.z + 0.55);
    board(['TIPS', { t: '(for the will)', s: 0.6 }], 0.2, 0.12, { bg: '#f4f1ea' }, c.x - 0.35, c.y + 0.1, a.z + 0.62, FACE_S);
    // Stools round the piano bar.
    for (const [x, z] of [[a.x - 0.45, a.z + 0.35], [a.x - 0.45, c.z - 0.4], [c.x + 0.3, a.z + 0.4]]) {
      put(cyl(0.025, 0.025, 0.7, brass, 6), x, 0.35, z);
      put(cyl(0.18, 0.18, 0.07, mat('#7a1f2b', { rough: 0.9 }), 12), x, 0.72, z);
    }
  }

  /** The roulette table: green baize, a betting grid, chips; the wheel spins (tick). */
  function roulette(b: Box): void {
    const { min: a, max: c } = b;
    bx(a.x + 0.15, 0, a.z + 0.15, c.x - 0.15, c.y - 0.1, c.z - 0.15, mahogany, true);
    bx(a.x, c.y - 0.1, a.z, c.x, c.y - 0.02, c.z, mahogany, true);
    bx(a.x + 0.05, c.y - 0.02, a.z + 0.05, c.x - 0.05, c.y, c.z - 0.05, felt, true);
    const grid = sign([{ t: '1 2 3 · 4 5 6 · 7 8 9', s: 1 }, { t: 'ROUGE · NOIR · NANA', s: 0.8, c: '#f4d27a' }], 1.1, 0.6, { bg: '#1f6b3e', fg: '#f4f1ea', border: '#f4f1ea', font: 'Arial, sans-serif' });
    grid.rotation.x = -Math.PI / 2;
    put(grid, a.x + 1.3, c.y + 0.002, (a.z + c.z) / 2);
    const chipCols = [red, black, mat('#2c5aa0'), mat('#f4f1ea')];
    for (let i = 0; i < 6; i++) put(cyl(0.035, 0.035, 0.02 + (i % 3) * 0.02, chipCols[i % 4], 10), a.x + 0.95 + (i % 3) * 0.25, c.y + 0.02, a.z + 0.3 + Math.floor(i / 3) * 0.5);
    board(['THE HOUSE ALWAYS WINS', { t: "(it's Nana's house)", s: 0.75 }], 0.9, 0.3, { bg: '#1a0f22', fg: '#ffd84a', font: 'Arial, sans-serif' }, (a.x + c.x) / 2, 1.85, -0.17, FACE_N);
  }

  /** The buffet: a long white cloth of chafing dishes, a roast and a wobbling jelly. */
  function buffet(b: Box): void {
    const { min: a, max: c } = b;
    bx(a.x, 0, a.z, c.x, c.y, c.z, linen, true);
    bx(a.x - 0.02, c.y - 0.25, a.z - 0.02, c.x + 0.02, c.y - 0.21, c.z, mat('#c9a24a', { rough: 0.6 }));
    const z = (a.z + c.z) / 2;
    for (const x of [a.x + 0.5, a.x + 1.3, a.x + 2.1]) {
      bx(x - 0.3, c.y, z - 0.2, x + 0.3, c.y + 0.12, z + 0.2, chrome);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), chrome);
      dome.scale.set(1, 0.6, 0.7);
      put(dome, x, c.y + 0.12, z);
    }
    put(cyl(0.3, 0.3, 0.03, paint, 16), a.x + 2.95, c.y + 0.015, z);
    put(sph(0.2, mat('#b0682a', { rough: 0.6 }), 12, 8), a.x + 2.95, c.y + 0.15, z).scale.set(1.3, 0.8, 1);
    put(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 0.22, 8), mat('#d0203a', { rough: 0.2 })), a.x + 3.6, c.y + 0.11, z);
    board(['ALL-YOU-CAN-EAT BUFFET', { t: 'Seconds: Nana only', s: 0.7 }], 1.4, 0.36, { bg: '#f4f1ea', border: '#c9a24a' }, (a.x + c.x) / 2, 2.4, 7.99, FACE_N);
    // The defibrillator station, right next to the buffet.
    bx(c.x + 0.55, 1.05, 7.86, c.x + 1.15, 1.7, 8.0, mat('#1f8a4c', { rough: 0.5 }));
    board([{ t: 'AED', s: 1.3 }, { t: 'DEFIBRILLATOR', s: 0.7 }], 0.5, 0.36, { bg: '#1f8a4c', fg: '#ffffff', font: 'Arial, sans-serif' }, c.x + 0.85, 1.48, 7.855, FACE_N);
    board([{ t: 'Conveniently located', s: 1 }, { t: 'next to the buffet', s: 1 }], 0.6, 0.2, { bg: '#f4f1ea', fg: '#1f6b3e', font: 'Arial, sans-serif' }, c.x + 0.85, 0.9, 7.99, FACE_N);
  }

  /** The Purser's desk: mahogany and brass, a bell, a ledger, keys in pigeonholes behind. */
  function purser(b: Box): void {
    const { min: a, max: c } = b;
    bx(a.x, 0, a.z, c.x, c.y - 0.06, c.z, mahogany, true);
    bx(a.x - 0.06, c.y - 0.06, a.z - 0.04, c.x, c.y, c.z + 0.04, marble, true);
    for (const z of [a.z + 0.4, (a.z + c.z) / 2, c.z - 0.4]) bx(a.x - 0.01, 0.15, z - 0.02, a.x, c.y - 0.15, z + 0.02, brass);
    put(cyl(0.06, 0.07, 0.03, brass, 12), a.x + 0.2, c.y + 0.015, a.z + 0.5);
    put(sph(0.045, brass, 10, 6), a.x + 0.2, c.y + 0.05, a.z + 0.5);
    bx(a.x + 0.15, c.y, 0.1, a.x + 0.5, c.y + 0.05, 0.55, mat('#6a1f2b', { rough: 0.7 }));
    // Pigeonholes and keys on the wall behind.
    bx(312.32, 1.3, -1.1, 312.5, 1.95, 1.1, darkWood);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
      bx(312.3, 1.35 + j * 0.3, -1.05 + i * 0.36, 312.32, 1.6 + j * 0.3, -0.75 + i * 0.36, mat('#2a1a10'));
      if ((i + j) % 3) put(cyl(0.015, 0.015, 0.12, brass, 4), 312.28, 1.45 + j * 0.3, -0.9 + i * 0.36);
    }
    board([{ t: 'PURSER', s: 1.3 }, { t: 'Currency exchange · Lost property · Disinheritance', s: 0.5 }], 2.0, 0.5, { bg: '#1d2d50', fg: '#f4d27a', border: '#c9a24a' }, 312.47, 2.35, 0, FACE_W);
  }

  /** The cleaning trolley: towels, a bin bag, a mop, sprays (pills hide on its top shelf). */
  function trolley(b: Box): void {
    const { min: a, max: c } = b;
    for (const [x, z] of [[a.x + 0.04, a.z + 0.04], [c.x - 0.04, a.z + 0.04], [a.x + 0.04, c.z - 0.04], [c.x - 0.04, c.z - 0.04]]) bx(x - 0.02, 0.06, z - 0.02, x + 0.02, c.y, z + 0.02, steel, true);
    for (const y of [0.1, 0.5, c.y - 0.03]) bx(a.x, y, a.z, c.x, y + 0.03, c.z, steel, true);
    for (const [x, z] of [[a.x + 0.06, a.z + 0.06], [c.x - 0.06, a.z + 0.06], [a.x + 0.06, c.z - 0.06], [c.x - 0.06, c.z - 0.06]]) put(sph(0.05, black, 8, 6), x, 0.05, z);
    for (let i = 0; i < 3; i++) bx(a.x + 0.06, 0.53 + i * 0.09, a.z + 0.08, c.x - 0.06, 0.61 + i * 0.09, a.z + 0.5, linen);
    put(sph(0.22, mat('#2a2a2a', { rough: 0.4 }), 10, 8), (a.x + c.x) / 2, 0.32, c.z - 0.3).scale.set(1, 0.9, 1);
    put(sph(0.2, mat('#e8c020', { rough: 0.5 }), 10, 8), (a.x + c.x) / 2, 0.3, a.z + 0.3).scale.set(1, 0.8, 1);
    const mop = cyl(0.015, 0.015, 1.4, mat('#c8b080'), 6);
    mop.rotation.x = 0.25;
    put(mop, c.x - 0.05, 0.85, c.z + 0.12);
    for (let i = 0; i < 3; i++) put(cyl(0.035, 0.035, 0.18, [mat('#3ab0e8'), mat('#e85a8a'), mat('#8ad04a')][i], 8), a.x + 0.15 + i * 0.12, c.y + 0.09, c.z - 0.15);
    board(['HOUSEKEEPING'], 0.5, 0.12, { bg: '#f4f1ea', font: 'Arial, sans-serif' }, a.x - 0.002, 0.8, (a.z + c.z) / 2, FACE_W);
  }

  /** The Captain's table: a white cloth, places laid, candelabra, the place card, chairs tucked in. */
  function captainsTable(b: Box): void {
    const { min: a, max: c } = b;
    for (const [x, z] of [[a.x + 0.2, a.z + 0.2], [c.x - 0.2, a.z + 0.2], [a.x + 0.2, c.z - 0.2], [c.x - 0.2, c.z - 0.2]]) bx(x - 0.05, 0, z - 0.05, x + 0.05, c.y - 0.05, z + 0.05, mahogany, true);
    bx(a.x, c.y - 0.05, a.z, c.x, c.y, c.z, mahogany, true);
    bx(a.x - 0.04, c.y - 0.3, a.z - 0.04, c.x + 0.04, c.y + 0.005, c.z + 0.04, linen, true);
    // Places laid.
    const places: [number, number][] = [];
    for (const x of [303.9, 305.1, 306.3]) places.push([x, a.z + 0.25], [x, c.z - 0.25]);
    places.push([c.x - 0.25, (a.z + c.z) / 2], [a.x + 0.25, (a.z + c.z) / 2]);
    for (const [x, z] of places) {
      put(cyl(0.13, 0.11, 0.015, paint, 16), x, c.y + 0.012, z);
      put(cyl(0.03, 0.02, 0.12, glass, 8), x + 0.18, c.y + 0.065, z + (z < (a.z + c.z) / 2 ? 0.12 : -0.12));
      bx(x - 0.2, c.y + 0.005, z - 0.03, x - 0.17, c.y + 0.012, z + 0.03, chrome);
    }
    // Candelabra.
    for (const x of [304.5, 305.8]) {
      put(cyl(0.05, 0.08, 0.32, brass, 8), x, c.y + 0.16, 4.0);
      bx(x - 0.18, c.y + 0.3, 3.98, x + 0.18, c.y + 0.33, 4.02, brass);
      for (const dx of [-0.16, 0, 0.16]) {
        put(cyl(0.016, 0.016, 0.18, cream, 6), x + dx, c.y + 0.42, 4.0);
        put(sph(0.022, flame, 6, 4), x + dx, c.y + 0.53, 4.0);
      }
    }
    put(sph(0.16, mat('#e8a0b8', { rough: 0.8 }), 10, 8), 305.15, c.y + 0.12, 4.0).scale.set(1.4, 0.7, 1);
    // The place card (both sides).
    for (const [dz, ry] of [[0.07, FACE_S], [-0.07, FACE_N]] as const) {
      const card = sign([{ t: "CAPTAIN'S TABLE", s: 0.8, c: '#8a6a1a' }, { t: 'Mrs ______ & Party', s: 1 }], 0.62, 0.24, { bg: '#fbf7ea', border: '#c9a24a', italic: true });
      card.rotation.order = 'YXZ';
      card.rotation.x = dz > 0 ? -0.35 : -0.35;
      put(card, 303.75, c.y + 0.13, 4.0 + dz * 1.3, ry);
    }
    // Chairs tucked in under the cloth (backs at the table's edge), Nana's high-backed at the head.
    const chair = (x: number, z: number, ry: number, high = false) => {
      const g = new THREE.Group();
      gbox(g, -0.22, 0.42, -0.22, 0.22, 0.48, 0.22, mahogany);
      gbox(g, -0.2, 0.48, -0.2, 0.2, 0.52, 0.2, mat('#7a1f2b', { rough: 0.9 }));
      for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) gbox(g, lx - 0.025, 0, lz - 0.025, lx + 0.025, 0.42, lz + 0.025, mahogany);
      gbox(g, -0.22, 0.48, 0.2, 0.22, high ? 1.4 : 1.0, 0.25, mahogany);
      if (high) gbox(g, -0.18, 0.6, 0.18, 0.18, 1.3, 0.2, mat('#7a1f2b', { rough: 0.9 }));
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      v.add(g);
    };
    for (const x of [303.9, 305.1, 306.3]) { chair(x, a.z + 0.2, Math.PI); chair(x, c.z - 0.2, 0); }
    chair(c.x - 0.2, 4.0, Math.PI / 2);
    chair(a.x + 0.2, 4.0, -Math.PI / 2, true);
  }

  // ───────────── The Lido Deck ─────────────

  // The pool's water (its caustics drift in tick), the depth markings, the flamingo (tick), a ladder.
  const water = mat('#4fc6ee', { map: causticTex(), rough: 0.1, metal: 0.1 });
  water.transparent = true;
  water.opacity = 0.78;
  water.depthWrite = false;
  const waterPlane = new THREE.Mesh(new THREE.PlaneGeometry(5.1, 3.1), water);
  waterPlane.rotation.x = -Math.PI / 2;
  put(waterPlane, 295.4, 0.42, 0);
  const depth = sign(['DEPTH 0.3 m · NO DIVING'], 1.3, 0.16, { clear: true, fg: '#1d2d50', font: 'Arial, sans-serif' });
  depth.rotation.x = -Math.PI / 2;
  depth.rotation.z = Math.PI; // read from the north side
  put(depth, 295.4, 0.503, -1.675);
  const depth2 = sign(['NO RUNNING · NO BOMBING · NO INHERITING'], 1.9, 0.16, { clear: true, fg: '#b3201c', font: 'Arial, sans-serif' });
  depth2.rotation.x = -Math.PI / 2;
  put(depth2, 295.4, 0.503, 1.675);
  for (const dz of [-0.25, 0.25]) {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 6, 12, Math.PI), chrome);
    rail.rotation.y = Math.PI / 2;
    put(rail, 298.15, 0.5, 0.9 + dz);
    put(cyl(0.025, 0.025, 0.5, chrome, 6), 297.88, 0.25, 0.9 + dz);
  }
  board([{ t: 'AQUA-AEROBICS', s: 1 }, { t: '11:00 · Over-80s only', s: 0.7 }], 0.8, 0.28, { bg: '#2c8ac8', fg: '#ffffff', font: 'Arial, sans-serif' }, 292.6, 0.75, 0, FACE_W);
  put(cyl(0.02, 0.02, 0.5, chrome, 6), 292.62, 0.75, -0.3);
  put(cyl(0.02, 0.02, 0.5, chrome, 6), 292.62, 0.75, 0.3);
  // Floating noodles.
  for (const [x, z, r, col] of [[294.0, 0.7, 0.4, '#f0d040'], [296.6, -0.9, -0.3, '#e85a8a']] as const) {
    const n = cyl(0.06, 0.06, 1.3, mat(col, { rough: 0.6 }), 8);
    n.rotation.z = Math.PI / 2;
    put(n, x, 0.43, z, r);
  }

  // The shuffleboard court and its scoreboard.
  const court = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.0), mat('#ffffff', { map: courtTex(), rough: 0.8 }));
  (court.material as THREE.MeshStandardMaterial).transparent = true;
  (court.material as THREE.MeshStandardMaterial).depthWrite = false;
  court.rotation.x = -Math.PI / 2;
  put(court, 292.5, 0.006, -6.4);
  for (const [x, z, k] of [[290.9, -6.25, 0], [291.3, -6.55, 1], [294.2, -6.3, 0], [293.6, -6.6, 1], [296.0, -6.4, 0]] as const) put(cyl(0.14, 0.14, 0.025, k ? black : red, 14), x, 0.013, z);
  board([{ t: 'SHUFFLEBOARD', s: 0.7, c: '#f0ecd8' }, { t: 'NANA  400', s: 1.1 }, { t: 'FAMILY  0', s: 1.1 }], 1.2, 0.85, { bg: '#2b3a2f', fg: '#f6f2e0', border: '#8a6a3a', font: '"Comic Sans MS", "Chalkboard SE", "Segoe Print", cursive', bold: false }, 289.2, 1.55, -7.93, FACE_S);
  for (const x of [288.7, 289.7]) put(cyl(0.025, 0.025, 1.1, teakWood, 6), x, 1.45, -7.97);
  for (const [x, r] of [[287.9, -0.25], [288.15, -0.32]] as const) {
    const cue = cyl(0.015, 0.015, 1.7, teakWood, 6);
    cue.rotation.x = r;
    put(cue, x, 0.82, -7.75);
  }

  // Lifebelts round the deck, and the deck signs.
  lifebelt(284.07, 0.62, -3.0, FACE_E, 'S.S. GOLDEN YEARS', 'NO REFUNDS');
  lifebelt(284.07, 0.62, 3.0, FACE_E, 'S.S. GOLDEN YEARS', 'NO REFUNDS');
  lifebelt(294.6, 0.62, -7.93, FACE_S, 'S.S. GOLDEN YEARS', 'NO REFUNDS');
  lifebelt(291.2, 0.62, 7.93, FACE_N, 'S.S. GOLDEN YEARS', 'NO REFUNDS');
  board([{ t: 'BURIALS AT SEA', s: 1 }, { t: "ask at the Purser's desk", s: 0.8 }], 0.95, 0.34, { bg: '#f4f1ea', border: '#1d2d50' }, 290.2, 1.33, 7.9, FACE_N);
  for (const x of [289.8, 290.6]) put(cyl(0.02, 0.02, 0.4, chrome, 6), x, 1.25, 7.92);
  board([{ t: 'MUSTER STATION B', s: 0.9 }, { t: 'Lifeboat 4 (see over there)', s: 0.7 }], 0.95, 0.3, { bg: '#1f8a4c', fg: '#ffffff', font: 'Arial, sans-serif' }, 297.0, 1.35, -7.92, FACE_S);
  for (const x of [296.6, 297.4]) put(cyl(0.02, 0.02, 0.4, chrome, 6), x, 1.25, -7.95);

  // The towel swan, on a lounger.
  {
    const towel = mat('#fbfbf8', { rough: 1 });
    const g = new THREE.Group();
    const body = sph(0.2, towel, 12, 8);
    body.scale.set(1.4, 0.7, 1);
    g.add(body);
    const neck = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 8, 14, Math.PI * 1.3), towel);
    neck.position.set(0.2, 0.2, 0);
    neck.rotation.z = -0.4;
    g.add(neck);
    gput(g, sph(0.06, towel, 8, 6), 0.06, 0.38, 0);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 6), mat('#e8a040'));
    beak.rotation.z = Math.PI / 2;
    gput(g, beak, 0.0, 0.37, 0);
    for (const dz of [-0.012, 0.012]) gput(g, sph(0.012, black, 4, 4), 0.07, 0.4, dz * 4);
    g.position.set(287.45, 0.62, 6.75);
    g.rotation.y = Math.PI / 2 + 0.3;
    v.add(g);
    // A folded towel on the next lounger, and a paperback ("Wills Made Easy").
    bx(285.7, 0.5, 6.4, 286.2, 0.56, 6.8, mat('#5fa8d8', { rough: 1 }));
    bx(288.75, 0.5, 6.5, 288.95, 0.53, 6.78, mat('#b3201c'));
  }

  // Parasols over the loungers.
  for (const [x, z, m] of [[287.0, 7.4, blueStripe], [286.7, -7.3, redStripe]] as const) {
    put(cyl(0.025, 0.025, 2.4, chrome, 8), x, 1.2, z);
    const p = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.45, 16, 1, true), new THREE.MeshStandardMaterial({ map: m.map, roughness: 0.85, side: THREE.DoubleSide }));
    put(p, x, 2.4, z);
  }

  // Potted palms in the stern corners.
  for (const z of [-7.5, 7.5]) {
    put(cyl(0.3, 0.24, 0.55, mat('#d8cfc0', { rough: 0.8 }), 12), 284.5, 0.275, z);
    put(cyl(0.05, 0.08, 1.6, mat('#8a6a3a', { rough: 1 }), 6), 284.5, 1.3, z);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.1, 4), mat('#3f8a3a', { rough: 0.8 }));
      leaf.position.set(284.5, 2.05, z);
      leaf.rotation.set(1.1, (i / 6) * Math.PI * 2, 0, 'YXZ');
      leaf.translateY(0.5);
      v.add(leaf);
    }
  }

  // The stern flagstaff and the Red Ensign.
  put(cyl(0.035, 0.05, 5.4, paint, 8), 283.45, 2.0, 0);
  put(sph(0.07, gold), 283.45, 4.72, 0);
  const ensign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.65), new THREE.MeshStandardMaterial({ map: ensignTex(), side: THREE.DoubleSide, roughness: 0.8 }));
  put(ensign, 283.45 - 0.68, 4.25, 0, Math.PI); // the canton at the hoist

  // ── The superstructure's aft face, onto the lido ──
  bx(299.96, 2.55, -8.3, 300, H, 8.3, navy);
  board([{ t: 'LIDO DECK', s: 1 }], 2.6, 0.36, { clear: true, fg: '#f4d27a' }, 299.955, 2.78, 0, FACE_W);
  for (const z of [-3.6, -2.3, 2.3, 3.6]) {
    bx(299.97, 0.95, z - 0.52, 300, 2.3, z + 0.52, navy);
    bx(299.95, 1.02, z - 0.45, 299.97, 2.23, z + 0.45, windows);
    bx(299.94, 1.6, z - 0.45, 299.96, 1.65, z + 0.45, navy);
  }
  board([{ t: "TODAY'S PROGRAMME", s: 0.95, c: '#f4d27a' }, { t: 'Bingo  10:00', s: 0.8 }, { t: 'Aqua-aerobics  11:00', s: 0.8 }, { t: 'Will Reading  16:00', s: 0.8, c: '#ffb0a0' }],
    1.3, 1.15, { bg: '#1d2d50', fg: '#f4f1ea', border: '#c9a24a' }, 299.95, 1.42, 0, FACE_W);
  // Door frames (both faces) and the signs over the doors.
  for (const zc of [-5.5, 5.5]) {
    for (const xf of [299.94, 300.3]) {
      bx(xf, 0, zc - 1.0, xf + 0.06, 2.4, zc - 0.9, brass);
      bx(xf, 0, zc + 0.9, xf + 0.06, 2.4, zc + 1.0, brass);
      bx(xf, 2.3, zc - 1.0, xf + 0.06, 2.4, zc + 1.0, brass);
    }
    // Teak doors, hooked back against the inside wall.
    bx(300.3, 0.02, zc - 1.8, 300.36, 2.2, zc - 0.92, teakWood);
    bx(300.3, 0.02, zc + 0.92, 300.36, 2.2, zc + 1.8, teakWood);
    porthole(300.38, 1.5, zc - 1.36, FACE_E, 0.16);
    porthole(300.38, 1.5, zc + 1.36, FACE_E, 0.16);
  }
  board(['CASINO LOUNGE'], 1.5, 0.22, { bg: '#5a2a50', fg: '#f4d27a', border: '#c9a24a' }, 299.93, 2.48, -5.5, FACE_W);
  board(["CAPTAIN'S SALOON"], 1.5, 0.22, { bg: '#1d2d50', fg: '#f4d27a', border: '#c9a24a' }, 299.93, 2.48, 5.5, FACE_W);
  board([{ t: 'Dress code: black tie', s: 1 }, { t: '(or mourning)', s: 0.85 }], 0.75, 0.32, { bg: '#f4f1ea', border: '#1d2d50', italic: true }, 299.95, 1.5, 7.3, FACE_W);
  porthole(299.95, 1.6, -7.35, FACE_W, 0.22);
  // The ship's clock between the doors.
  {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 20), brass));
    g.add(new THREE.Mesh(new THREE.CircleGeometry(0.21, 20), mat('#f8f4e8')));
    const hand = (len: number, ang: number) => { const h = boxMesh(-0.008, 0, 0.005, 0.008, len, 0.012, black); h.rotation.z = ang; g.add(h); };
    hand(0.12, -0.4); hand(0.17, 2.2);
    put(g, 299.95, 2.3, 0, FACE_W);
  }

  // ── Casino Lounge ──
  board([{ t: 'CASINO', s: 1 }], 1.9, 0.55, { bg: '#1a0f22', fg: '#ff6ab8', border: '#ffd84a', font: 'Arial Black, Arial, sans-serif', glow: 1.4 }, 302.6, 2.35, -7.98, FACE_S);
  board([{ t: 'Please gamble responsibly', s: 1 }, { t: '— with your own money', s: 0.9 }], 1.0, 0.3, { bg: '#f4f1ea', italic: true }, 302.6, 1.6, -7.98, FACE_S);
  board([{ t: 'TONIGHT IN THE LOUNGE', s: 0.7, c: '#f4d27a' }, { t: 'The Three Tenors', s: 1 }, { t: '(Two Available)', s: 0.7 }], 0.9, 0.62, { bg: '#2a1a2e', fg: '#f4f1ea', border: '#c9a24a' }, 305.6, 1.75, -0.16, FACE_N);
  for (const x of [306.6, 308.4]) porthole(x, 1.65, -7.98, FACE_S);
  board([{ t: 'MONTE CARLO NIGHT', s: 1, c: '#f4d27a' }, { t: 'Black tie · Blackjack · Black widow', s: 0.62 }], 1.2, 0.7, { bg: '#1a0f22', fg: '#f4f1ea', border: '#c9a24a' }, 300.32, 1.75, -2.0, FACE_E);
  // Gilt wall lamps.
  for (const [x, z, ry] of [[301.5, -0.17, FACE_N], [307.5, -0.17, FACE_N], [304.0, -7.98, FACE_S]] as const) {
    const g = new THREE.Group();
    g.add(boxMesh(-0.06, -0.12, 0, 0.06, 0.12, 0.05, gold));
    gput(g, new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.16, 10, 1, true), mat('#f4c8a0', { emissive: '#ffb070', emissiveIntensity: 0.8 })), 0, 0.12, 0.12);
    put(g, x, 2.1, z, ry);
  }

  // ── Captain's Saloon ──
  // Mahogany panelling to dado height round the walls (gaps at the doors).
  const dado = (x0: number, z0: number, x1: number, z1: number) => {
    bx(x0, 0, z0, x1, 1.05, z1, mahogany);
    bx(x0 - 0.01, 1.05, z0 - 0.01, x1 + 0.01, 1.1, z1 + 0.01, brass);
  };
  dado(300.3, 0.15, 309.5, 0.19); // north
  dado(300.3, 7.96, 309.5, 8.0); // south (behind the buffet)
  dado(300.3, 0.15, 300.34, 4.6); // west
  dado(300.3, 6.4, 300.34, 8.0);
  dado(309.46, 0.15, 309.5, 5.5); // east
  dado(309.46, 7.3, 309.5, 8.0);
  for (const x of [303.0, 304.6, 306.2, 308.6]) porthole(x, 1.62, 7.99, FACE_N);
  portrait(v, 309.47, 1.95, 3.0, 1, '#1d2d50', brass, 0.85);
  board([{ t: 'SEATING PLAN', s: 1, c: '#8a6a1a' }, { t: 'Nana: head of the table', s: 0.7 }, { t: 'The Favourite: at her right hand', s: 0.7 }, { t: 'Everyone else: wherever', s: 0.7 }],
    0.9, 0.75, { bg: '#fbf7ea', fg: '#1d2d50', border: '#c9a24a', italic: true }, 300.36, 1.75, 2.6, FACE_E);
  board([{ t: 'Your Captain', s: 0.7 }, { t: 'Cdr. R. N. Aground', s: 1 }], 0.7, 0.2, { bg: '#c9a24a', fg: '#1d2d50' }, 309.45, 1.15, 3.0, FACE_W);
  // A ceiling rose (the chandelier hangs from it).
  const rose = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), mat('#e8dcc0', { rough: 0.9 }));
  rose.rotation.x = Math.PI / 2;
  put(rose, 305.1, H - 0.005, 4.0);

  // ── Cabin Corridor ──
  // Dado rail and the numbered cabin doors on the forward bulkhead.
  bx(309.8, 1.0, -8.0, 309.84, 1.06, -7.3, darkWood);
  bx(309.8, 1.0, -5.5, 309.84, 1.06, 5.5, darkWood);
  bx(309.8, 1.0, 7.3, 309.84, 1.06, 8.0, darkWood);
  const cabins: [number, string, string?][] = [
    [-6.4, '101', "MRS ______ · OWNER'S SUITE"], [-4.9, '102'], [-2.4, '103', 'DO NOT DISTURB'],
    [2.4, '104'], [4.2, '105', 'DO NOT DISTURB'], [6.0, '106', 'THE FAMILY · INSIDE · NO WINDOW'],
  ];
  for (const [z, num, note] of cabins) {
    bx(312.44, 0, z - 0.5, 312.5, 2.2, z + 0.5, darkWood);
    bx(312.42, 0.02, z - 0.44, 312.46, 2.14, z + 0.44, teakWood);
    put(sph(0.035, brass, 8, 6), 312.4, 1.0, z + 0.32);
    board([num], 0.24, 0.13, { bg: '#c9a24a', fg: '#1d2d50' }, 312.41, 1.7, z, FACE_W);
    if (note) {
      const tag = sign(note.includes('DISTURB') ? [{ t: 'DO NOT DISTURB', s: 1 }, { t: '(rewriting will)', s: 0.8 }] : [note], note.includes('DISTURB') ? 0.22 : 0.7, note.includes('DISTURB') ? 0.32 : 0.14,
        note.includes('DISTURB') ? { bg: '#b3201c', fg: '#ffffff', font: 'Arial, sans-serif' } : { bg: '#f4f1ea', fg: '#1d2d50', font: 'Arial, sans-serif' });
      put(tag, 312.405, note.includes('DISTURB') ? 1.15 : 1.95, note.includes('DISTURB') ? z + 0.3 : z, FACE_W);
    }
  }
  // Room service, left outside 101.
  put(cyl(0.2, 0.2, 0.02, chrome, 14), 312.15, 0.01, -5.75);
  const cloche = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), chrome);
  put(cloche, 312.15, 0.02, -5.75);
  // Signs on the corridor's west wall.
  board([{ t: 'MUSTER STATION', s: 0.8 }, { t: 'LIFEBOAT 4  →', s: 1 }], 0.7, 0.3, { bg: '#1f8a4c', fg: '#ffffff', font: 'Arial, sans-serif' }, 309.82, 1.65, -3.2, FACE_E);
  {
    const plan = canvasTex(256, 128, (g) => {
      g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 256, 128);
      g.strokeStyle = '#1d2d50'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(14, 30); g.lineTo(180, 30); g.quadraticCurveTo(232, 34, 246, 64); g.quadraticCurveTo(232, 94, 180, 98); g.lineTo(14, 98); g.closePath(); g.stroke();
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(110, 30); g.lineTo(110, 98); g.moveTo(110, 64); g.lineTo(165, 64); g.moveTo(165, 30); g.lineTo(165, 98); g.stroke();
      g.fillStyle = '#5fb8e8'; g.fillRect(64, 56, 26, 16);
      g.fillStyle = '#b3201c'; g.beginPath(); g.arc(172, 58, 5, 0, Math.PI * 2); g.fill();
      g.font = 'bold 11px Arial'; g.fillStyle = '#1d2d50'; g.textAlign = 'center';
      g.fillText('YOU ARE HERE', 172, 22);
      g.fillText('LIDO', 77, 50); g.fillText('(gap)', 77, 112);
      g.fillStyle = '#b3201c'; g.fillRect(70, 27, 14, 6);
      g.font = 'bold 13px Georgia'; g.fillStyle = '#1d2d50'; g.fillText('DECK PLAN', 128, 14);
    }, false);
    put(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshStandardMaterial({ map: plan, roughness: 0.8 })), 309.82, 1.6, 3.0, FACE_E);
  }
  for (const z of [-4.0, 4.0]) {
    const g = new THREE.Group();
    g.add(boxMesh(-0.05, -0.1, 0, 0.05, 0.1, 0.04, brass));
    gput(g, sph(0.08, mat('#fff0d0', { emissive: '#ffd090', emissiveIntensity: 1.2 }), 10, 8), 0, 0.12, 0.1);
    put(g, 309.82, 2.2, z, FACE_E);
  }

  // ───────────── The ship around the deck ─────────────

  // Hull: the deck outline, extruded down in bands (white topsides with portholes, navy, red boot-top).
  /** The deck's outline (x, z), `inset` metres in: a square stern and a curved bow to a stem at x = 329.4. */
  const outline = (inset: number): THREE.Vector2[] => {
    const s = 8.3 - inset;
    const port: THREE.Vector2[] = [new THREE.Vector2(283.7 + inset, -(s - 0.4)), new THREE.Vector2(284.1 + inset, -s), new THREE.Vector2(316, -s)];
    for (let i = 1; i <= 14; i++) {
      const t = i / 14;
      const x = (1 - t) * (1 - t) * 316 + 2 * (1 - t) * t * 325 + t * t * (329.4 - inset);
      const z = -((1 - t) * (1 - t) * s + 2 * (1 - t) * t * (s - 0.3));
      port.push(new THREE.Vector2(x, z));
    }
    const starboard = port.slice(0, -1).reverse().map((p) => new THREE.Vector2(p.x, -p.y));
    return [...port, ...starboard];
  };
  const hullShape = new THREE.Shape(outline(0));
  const band = (top: number, bottom: number, side: THREE.Material, cap: THREE.Material) => {
    const g = new THREE.ExtrudeGeometry(hullShape, { depth: top - bottom, bevelEnabled: false, curveSegments: 4 });
    const m = new THREE.Mesh(g, [cap, side]);
    m.rotation.x = Math.PI / 2;
    m.position.y = top;
    v.add(m, true);
  };
  const teakM = teakTex();
  teakM.repeat.set(1 / 2.4, 1 / 2.4);
  band(-0.02, -2.6, paint, mat('#ffffff', { map: teakM, rough: 0.75 }));
  band(-2.6, -3.85, navy, navy);
  band(-3.85, -6.5, mat('#a8322a', { rough: 0.7 }), navy);
  // A gold line along the topsides.
  for (const s of [-1, 1]) bx(283.9, -0.42, s * 8.3 - 0.02, 316, -0.36, s * 8.3 + 0.02, gold);
  // Portholes along both sides.
  for (let x = 285.2; x < 311.5; x += 1.45) {
    porthole(x, -1.25, -8.32, FACE_N, 0.17);
    porthole(x, -1.25, 8.32, FACE_S, 0.17);
  }
  // The bow's bulwark (decoration: nobody can get forward of the bulkhead).
  {
    const out = outline(0).filter((p) => p.x > 312.7);
    const inn = outline(0.3).filter((p) => p.x > 312.7);
    out.sort((p, q) => Math.atan2(p.y, p.x - 312) - Math.atan2(q.y, q.x - 312));
    inn.sort((p, q) => Math.atan2(p.y, p.x - 312) - Math.atan2(q.y, q.x - 312));
    const ring = new THREE.Shape([new THREE.Vector2(312.8, -8.3), ...out, new THREE.Vector2(312.8, 8.3), new THREE.Vector2(312.8, 8.0), ...inn.reverse(), new THREE.Vector2(312.8, -8.0)]);
    const g = new THREE.ExtrudeGeometry(ring, { depth: BULWARK_H, bevelEnabled: false, curveSegments: 4 });
    const m = new THREE.Mesh(g, [teakWood, paint]);
    m.rotation.x = Math.PI / 2;
    m.position.y = BULWARK_H;
    v.add(m, true);
  }
  // The ship's name on both bows, and on the stern.
  for (const s of [-1, 1]) {
    put(sign(['S.S. GOLDEN YEARS'], 5.0, 0.75, { clear: true, fg: '#1d2d50', font: 'Georgia, serif' }), 314.9, -1.15, s * 8.33, s > 0 ? FACE_S : FACE_N);
  }
  board([{ t: 'GOLDEN YEARS', s: 1 }, { t: 'SOUTHAMPTON', s: 0.6 }], 5, 1.2, { clear: true, fg: '#c9a24a' }, 283.68, -1.2, 0, FACE_W);

  // The superstructure's roof edge: a white parapet and rail all round (the sun deck above, closed).
  for (const [x0, z0, x1, z1] of [[300, -8.3, 312.8, -8.1], [300, 8.1, 312.8, 8.3], [300, -8.3, 300.2, 8.3]] as const) {
    bx(x0, H, z0, x1, H + 0.55, z1, paint);
    bx(x0 - 0.03, H + 0.9, z0 - 0.03, x1 + 0.03, H + 0.96, z1 + 0.03, teakWood);
  }
  for (let z = -8.2; z <= 8.25; z += 1.37) put(cyl(0.02, 0.02, 0.4, chrome, 6), 300.1, H + 0.75, z);
  for (let x = 300.5; x <= 312.8; x += 1.37) for (const z of [-8.2, 8.2]) put(cyl(0.02, 0.02, 0.4, chrome, 6), x, H + 0.75, z);
  board(['SUN DECK CLOSED', { t: "(Nana's orders)", s: 0.7 }], 1.6, 0.42, { bg: '#f4f1ea', fg: '#b3201c', border: '#b3201c', font: 'Arial, sans-serif' }, 299.98, H + 0.3, -3.2, FACE_W);

  // Lifeboats on davits along the superstructure's sides (Lifeboat 4's davits stand empty by the lido gap).
  const lifeboat = (x: number, side: -1 | 1, name: string) => {
    const z = side * 9.55;
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 2.3, 4, 12), orange);
    hull.rotation.z = Math.PI / 2;
    hull.scale.set(0.85, 1, 1);
    put(hull, x, 1.95, z);
    const canopy = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 2.0, 4, 10), paint);
    canopy.rotation.z = Math.PI / 2;
    canopy.scale.set(0.8, 1, 0.95);
    put(canopy, x, 2.3, z);
    bx(x - 1.4, 1.98, z - side * 0.6 - 0.01, x + 1.4, 2.06, z - side * 0.6 + 0.01, paint);
    put(sign([name], 2.0, 0.3, { clear: true, fg: '#ffffff', font: 'Arial, sans-serif' }), x, 1.8, z + side * 0.64, side > 0 ? FACE_S : FACE_N);
    for (const dx of [-1.55, 1.55]) {
      bx(x + dx - 0.07, 0.2, side * 8.3, x + dx + 0.07, 3.25, side * 8.3 + side * 0.14, navy);
      bx(x + dx - 0.06, 3.1, side > 0 ? 8.3 : -10.0, x + dx + 0.06, 3.25, side > 0 ? 10.0 : -8.3, navy);
      put(cyl(0.012, 0.012, 0.85, steel, 4), x + dx * 0.8, 2.75, z);
    }
  };
  lifeboat(303.8, -1, 'RESERVED: NANA');
  lifeboat(308.4, -1, 'FAMILY · BRING A BUCKET');
  lifeboat(303.8, 1, "RESERVED: NANA'S HANDBAG");
  lifeboat(308.4, 1, 'STAFF ONLY');

  // The forward deckhouse (cabins), the bridge on top of it, the funnel, the mast and the bunting.
  bx(312.8, 0, -6.4, 320.2, 2.75, 6.4, paint, true);
  bx(312.75, 2.75, -6.45, 320.25, 2.95, 6.45, navy, true);
  bx(312.8, 2.95, -6.4, 320.2, 3.05, 6.4, [paint, paint, teak, paint, paint, paint], true, 2.4);
  for (let x = 314; x < 320; x += 1.3) { porthole(x, 1.55, -6.42, FACE_N, 0.2); porthole(x, 1.55, 6.42, FACE_S, 0.2); }
  bx(316.4, 3.05, -5.0, 320.4, 5.3, 5.0, paint, true);
  bx(316.35, 4.25, -5.05, 320.45, 4.95, 5.05, darkGlass);
  bx(316.2, 5.3, -5.4, 320.7, 5.42, 5.4, navy, true);
  bx(316.25, 5.42, -5.35, 320.65, 5.55, 5.35, paint, true);
  for (const s of [-1, 1]) {
    bx(317.6, 4.1, s * 5.0, 320.0, 4.25, s * 7.6, paint);
    bx(317.6, 4.25, s * 7.5, 320.0, 4.95, s * 7.6, paint);
  }
  board(['BRIDGE · NO VISITORS · NO WILLS'], 2.6, 0.3, { bg: '#f4f1ea', fg: '#1d2d50', font: 'Arial, sans-serif' }, 316.34, 3.6, 0, FACE_W);
  // The funnel: navy foot, red body, black top, raked aft, the line's monogram on each side.
  {
    const f = new THREE.Group();
    const seg = (y0: number, y1: number, m: THREE.Material, r0 = 1.0, r1 = 1.0) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, y1 - y0, 24), m);
      c.position.y = (y0 + y1) / 2;
      f.add(c);
    };
    seg(0, 1.0, navy);
    seg(1.0, 4.1, red);
    seg(4.1, 4.3, paint);
    seg(4.3, 5.0, black);
    f.scale.set(1.35, 1, 1.0);
    for (const s of [-1, 1]) {
      const mono = sign(['GY'], 1.0, 0.9, { clear: true, fg: '#f4d27a', font: 'Georgia, serif' });
      mono.position.set(0, 2.6, s * 1.01);
      mono.rotation.y = s > 0 ? 0 : Math.PI;
      f.add(mono);
    }
    f.position.set(314.6, 3.05, 0);
    f.rotation.z = 0.12;
    v.add(f);
  }
  // Mast, yard and radar (the scanner turns in tick).
  put(cyl(0.07, 0.1, 6.0, paint, 10), 318.6, 8.5, 0);
  bx(318.55, 10.0, -1.6, 318.65, 10.1, 1.6, paint);
  put(sph(0.12, mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.8 })), 318.6, 11.55, 0);
  // Jackstaff on the bow.
  put(cyl(0.03, 0.04, 3.0, paint, 8), 328.7, 2.0, 0);
  // The foredeck: anchor windlass and chain.
  put(cyl(0.35, 0.35, 0.5, navy, 14), 323.8, 0.35, -1.2).rotation.x = Math.PI / 2;
  put(cyl(0.35, 0.35, 0.5, navy, 14), 323.8, 0.35, 1.2).rotation.x = Math.PI / 2;
  bx(321.5, 0, -1.6, 322.4, 0.25, 1.6, navy);

  // Bunting: strings of pennants from the masthead to the stern staff and to the bow.
  {
    const cols = [red, paint, navy, mat('#f2c230', { rough: 0.7 }), mat('#3a9ad8', { rough: 0.7 })];
    const lines: [THREE.Vector3, THREE.Vector3, number][] = [
      [new THREE.Vector3(318.6, 11.2, 0), new THREE.Vector3(283.45, 4.65, 0), 1.4],
      [new THREE.Vector3(318.6, 11.2, 0), new THREE.Vector3(328.7, 3.45, 0), 0.5],
    ];
    const geos: THREE.BufferGeometry[][] = cols.map(() => []);
    let k = 0;
    for (const [p0, p1, sag] of lines) {
      const len = p0.distanceTo(p1);
      const n = Math.floor(len / 0.55);
      const at = (t: number) => new THREE.Vector3().lerpVectors(p0, p1, t).add(new THREE.Vector3(0, -sag * Math.sin(Math.PI * t), 0));
      const cord: THREE.Vector3[] = [];
      for (let i = 0; i <= 24; i++) cord.push(at(i / 24));
      put(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cord), 48, 0.012, 4, false), steel), 0, 0, 0);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const a = at(t - 0.18 / len), b = at(t + 0.18 / len);
        const tip = at(t).add(new THREE.Vector3(0, -0.42, 0));
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, tip.x, tip.y, tip.z], 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2));
        geos[k++ % cols.length].push(g);
      }
    }
    cols.forEach((m, i) => {
      if (!geos[i].length) return;
      const pm = (m as THREE.MeshStandardMaterial).clone();
      pm.side = THREE.DoubleSide;
      for (const g of geos[i]) v.add(new THREE.Mesh(g, pm));
    });
  }

  // Clouds round the horizon (lit from within, so they stay white; greyed in the Storm), and a far island.
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#e8eef4', emissiveIntensity: 0.55 });
  {
    const cloud = cloudMat;
    const spots: [number, number, number, number][] = [[235, 22, -38, 1.4], [248, 26, 50, 1.1], [350, 24, -50, 1.2], [356, 20, 36, 1.0], [300, 28, -68, 1.5], [305, 25, 66, 1.2]];
    for (const [x, y, z, s] of spots) {
      for (let i = 0; i < 5; i++) {
        const p = sph(4 * s * (0.7 + (i % 3) * 0.2), cloud, 10, 6);
        p.scale.y = 0.55;
        put(p, x + (i - 2) * 4.5 * s, y + (i % 2) * 1.5 * s, z + ((i * 7) % 5 - 2) * 1.2 * s);
      }
    }
    const isle = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#c8b27a', { rough: 1 }));
    isle.scale.y = 0.25;
    put(isle, 240, SEA_Y - 0.4, -62);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#4f8a3a', { rough: 1 }));
    hill.scale.y = 0.55;
    put(hill, 241, SEA_Y - 0.3, -62);
  }

  // ───────────── Lights ─────────────
  const sun = new THREE.DirectionalLight('#fff1d6', 1.7);
  sun.position.set(262, 48, 38);
  sun.target.position.set(298, 0, 0);
  v.lights.push({ light: sun, minor: false });
  v.point(304.6, 2.6, -4.3, '#ff9ccf', 22, 11); // casino glow
  v.point(307.3, 2.1, -2.8, '#ffd29a', 8, 6, true); // piano lamp
  v.point(305.1, 2.35, 4.0, '#ffd9a0', 30, 12); // chandelier
  v.point(304.6, 2.2, 7.0, '#fff0c8', 8, 6, true); // buffet
  v.point(311.1, 2.6, -4.0, '#ffe6b8', 12, 9); // corridor
  v.point(311.1, 2.6, 4.0, '#ffe6b8', 10, 8, true);
  v.point(296.3, 2.2, 6.9, '#ffc070', 8, 7, true); // the bar
  v.point(295.4, 0.3, 0, '#66e0ff', 5, 5, true); // pool glow

  // ───────────── Things that move (kept out of the baked meshes) ─────────────
  const live: THREE.Object3D[] = [sun.target];

  // The sea, the wake astern and the bow wave.
  const seaMat = new THREE.MeshStandardMaterial({ color: '#2b86c4', map: seaTex(), roughness: 0.28, metalness: 0.15 });
  seaMat.map!.repeat.set(18, 18);
  // The wake and the bow wave use cells of the sea's own grid (3.06 m, aligned to it), so their
  // triangles lie exactly over the sea's and a few centimetres of lift keep them on top in any swell.
  const CELL = 220 / 72;
  const cellX = (i: number) => 190 + i * CELL, cellZ = (j: number) => -110 + j * CELL;
  const sheet = (i0: number, i1: number, j0: number, j1: number, m: THREE.Material, lift: number) =>
    new WaveSheet((i1 - i0) * CELL, (j1 - j0) * CELL, i1 - i0, j1 - j0, m, (cellX(i0) + cellX(i1)) / 2, (cellZ(j0) + cellZ(j1)) / 2, lift);
  const sea = new WaveSheet(220, 220, 72, 72, seaMat, 300, 0, 0);
  live.push(sea.mesh);
  const foam = foamTex();
  foam.repeat.set(3, 1);
  const wakeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: foam, alphaMap: wakeAlphaTex(), transparent: true, depthWrite: false, roughness: 0.6 });
  const wake = sheet(15, 31, 33, 39, wakeMat, 0.04); // x 235.8..284.7, z ±9.2
  live.push(wake.mesh);
  const bowFoam = foamTex();
  bowFoam.repeat.set(1, 1);
  const bowMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: bowFoam, alphaMap: bowAlphaTex(), transparent: true, depthWrite: false, roughness: 0.6 });
  const bow = sheet(40, 46, 32, 40, bowMat, 0.05); // x 312.2..330.6, z ±12.2
  live.push(bow.mesh);

  // The sun in the sky.
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(4.5, 24), new THREE.MeshBasicMaterial({ color: '#fff6c8', fog: false }));
  sunDisc.position.set(242, 52, 46);
  sunDisc.lookAt(295, 2, 0);
  live.push(sunDisc);

  // The chandelier (it sways with the swell).
  const chand = new THREE.Group();
  {
    chand.add(place0(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 6), brass), 0, -0.27, 0));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 8, 24), brass);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.6;
    chand.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 20), brass);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = -0.8;
    chand.add(ring2);
    const crystal = mat('#eaf6ff', { rough: 0.05, metal: 0.3, emissive: '#cfe8ff', emissiveIntensity: 0.4 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      chand.add(place0(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), bulb), Math.cos(a) * 0.55, -0.52, Math.sin(a) * 0.55));
      const drop = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 6), crystal);
      drop.rotation.x = Math.PI;
      chand.add(place0(drop, Math.cos(a + 0.3) * 0.5, -0.72, Math.sin(a + 0.3) * 0.5));
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), crystal);
    tip.rotation.x = Math.PI;
    chand.add(place0(tip, 0, -1.0, 0));
    chand.position.set(305.1, H, 4.0);
  }
  live.push(chand);

  // The roulette wheel.
  const wheel = new THREE.Group();
  {
    wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.06, 24), mahogany));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.065, 24), mat('#ffffff', { map: stripeTex('#b3201c', '#141418', 18), rough: 0.4 }));
    wheel.add(top);
    wheel.add(place0(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.12, 12), gold), 0, 0.08, 0));
    wheel.add(place0(new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), paint), 0.2, 0.05, 0));
    wheel.position.set(302.25, 0.93, -2.45);
  }
  live.push(wheel);

  // The pool flamingo.
  const flamingo = new THREE.Group();
  {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.13, 8, 16), pink);
    ring.rotation.x = Math.PI / 2;
    flamingo.add(ring);
    flamingo.add(place0(cylG(0.05, 0.07, 0.6, pink), -0.28, 0.32, 0));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), pink);
    flamingo.add(place0(head, -0.24, 0.65, 0));
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 6), black);
    beak.rotation.z = Math.PI / 2 + 0.5;
    flamingo.add(place0(beak, -0.12, 0.62, 0));
    flamingo.position.set(296.4, 0.42, 0.55);
  }
  live.push(flamingo);

  // Smoke from the funnel.
  const puffs: { m: THREE.Mesh; mat: THREE.MeshStandardMaterial; phase: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.MeshStandardMaterial({ color: '#e8e8e8', transparent: true, opacity: 0.5, roughness: 1, depthWrite: false });
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), m);
    puffs.push({ m: p, mat: m, phase: i / 6 });
    live.push(p);
  }

  // Gulls circling.
  const gulls: { g: THREE.Group; l: THREE.Object3D; r: THREE.Object3D; rad: number; speed: number; y: number; ph: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    const bodyM = mat('#f6f6f2', { rough: 0.8 });
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), bodyM);
    b.scale.set(1, 0.7, 2.2);
    g.add(b);
    const mk = (s: number) => {
      const pivot = new THREE.Group();
      const wing = boxMesh(0, -0.015, -0.14, s * 0.75, 0.015, 0.14, bodyM);
      pivot.add(wing);
      const tipW = boxMesh(s * 0.55, -0.016, -0.12, s * 0.78, 0.016, 0.1, mat('#3a3a3a'));
      pivot.add(tipW);
      g.add(pivot);
      return pivot;
    };
    const l = mk(-1), r = mk(1);
    gulls.push({ g, l, r, rad: 9 + i * 4, speed: 0.22 + i * 0.07, y: 10 + i * 2.5, ph: i * 2.1 });
    live.push(g);
  }

  // Radar scanner.
  const radar = boxMesh(-0.9, 0, -0.08, 0.9, 0.12, 0.08, paint);
  radar.position.set(318.6, 11.0, 0);
  live.push(radar);

  // ───────────── Animation ─────────────
  const sky = DAY_SKY.clone();
  const smokeDay = new THREE.Color('#ececec'), smokeDark = new THREE.Color('#5a5a60');
  const seaDay = new THREE.Color('#2b86c4'), seaStorm = new THREE.Color('#355a74');
  let rough = 1;
  const tick = (t: number, dt: number): void => {
    const glow = windows.emissiveIntensity;
    const flash = glow > 2, dark = glow < 0.6 && !flash;
    const k = 1 - Math.exp(-Math.max(0, dt) * 1.5);
    rough += ((dark || flash ? 2.6 : 1) - rough) * k;
    // Sky: darkens for the Storm, white for a lightning flash.
    if (flash) sky.copy(FLASH_SKY);
    else sky.lerp(dark ? STORM_SKY : DAY_SKY, k);
    const scene = v.group.parent;
    if (scene instanceof THREE.Scene && scene.background instanceof THREE.Color) scene.background.copy(sky);
    seaMat.color.copy(seaDay).lerp(seaStorm, Math.min(1, (rough - 1) / 1.6));
    sunDisc.visible = !dark && !flash && rough < 1.3;
    cloudMat.emissiveIntensity = flash ? 0.9 : 0.55 * Math.max(0.08, 1 - (rough - 1) / 1.6);
    // Waves.
    sea.update(t, rough);
    wake.update(t, rough);
    bow.update(t, rough);
    seaMat.map!.offset.x = -t * 0.012;
    foam.offset.x = -t * 0.35;
    bowFoam.offset.x = -t * 0.5;
    if (water.map) { water.map.offset.x = Math.sin(t * 0.3) * 0.08; water.map.offset.y = t * 0.02; }
    // The chandelier sways with the swell.
    chand.rotation.x = 0.035 * rough * Math.sin(t * 0.7);
    chand.rotation.z = 0.025 * rough * Math.sin(t * 0.53 + 1);
    wheel.rotation.y -= dt * 2.2;
    flamingo.position.y = 0.42 + 0.025 * Math.sin(t * 1.4);
    flamingo.rotation.y = 0.4 * Math.sin(t * 0.15);
    flamingo.rotation.z = 0.05 * Math.sin(t * 1.1);
    radar.rotation.y = t * 1.6;
    for (const p of puffs) {
      const u = (t * 0.12 + p.phase) % 1;
      p.m.position.set(314.6 - 0.7 - u * 9, 8.4 + u * 5, Math.sin(u * 5 + p.phase * 9) * 0.6);
      p.m.scale.setScalar(0.6 + u * 2.6);
      p.mat.opacity = 0.55 * (1 - u) * (dark ? 0.6 : 1);
      p.mat.color.copy(dark ? smokeDark : smokeDay);
    }
    for (const gl of gulls) {
      const a = t * gl.speed + gl.ph;
      gl.g.position.set(296 + Math.cos(a) * gl.rad, gl.y + Math.sin(t * 0.4 + gl.ph) * 0.8, -1 + Math.sin(a) * gl.rad * 0.7);
      gl.g.rotation.y = -a;
      gl.g.rotation.z = 0.25;
      const flap = Math.sin(t * 7 + gl.ph * 3) * 0.45;
      gl.l.rotation.z = -flap;
      gl.r.rotation.z = flap;
    }
  };

  const view = v.finish({
    windows,
    idle: { center: { x: 290.5, y: 3.0, z: 4.0 }, rx: 3.5, rz: 2.2, look: { x: 297, y: 1.5, z: -1.5 } },
    background: '#8fcdf2',
    lightningFrom: { x: 300, y: 30, z: -45 },
    tick,
  });
  for (const o of live) v.group.add(o);
  tick(0, 0);
  return view;
}

function place0<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

function cylG(rt: number, rb: number, h: number, m: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 8), m);
}
