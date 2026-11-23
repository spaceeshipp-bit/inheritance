// Pettigrew & Sons Funeral Parlour: its look. Deep plum and aubergine walls,
// mahogany, lily white, brass and candlelight; cool blue-white in the
// Preparation Room. The Chapel of Rest rises above the side rooms with
// stained-glass clerestory windows (the Storm's lightning comes through them).
// Furniture is drawn from the MapDef's own boxes (by label), so what you see
// is what you bump into; the jokes live in the signage.
import * as THREE from 'three';
import type { Box, MapDef } from '../../../../shared/map.js';
import { PARLOUR_CHAPEL_H as CH, PARLOUR_SIDE_H as SH, PEW_DEPTH, PEW_HEIGHT } from '../../../../shared/maps/parlour.js';
import type { Vec3 } from '../../../../shared/types.js';
import { mat, wallpaper, wood } from '../materials.js';
import { ViewBuilder, boxMesh, ceiling, roomIn, roomWall, wingChair, type MapView } from './kit.js';

/** The parlour's centre line (world x); everything below is drawn in local x. */
const X = 200;

// ───────────── Canvas textures ─────────────

const texCache = new Map<string, THREE.CanvasTexture>();

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}

function memo(key: string, make: () => THREE.CanvasTexture): THREE.CanvasTexture {
  let t = texCache.get(key);
  if (!t) { t = make(); texCache.set(key, t); }
  return t;
}

/** A small deterministic random stream. */
function rng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/** Chapel flagstones: one repeat = 2 m (half-metre courses). */
const flagstones = () => memo('flags', () => canvasTex(256, 256, (g) => {
  g.fillStyle = '#7f766c';
  g.fillRect(0, 0, 256, 256);
  const r = rng(11);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 64 : 0;
    for (let k = -1; k < 3; k++) {
      const x = off + k * 128, y = row * 64;
      const s = 196 + Math.floor(r() * 34);
      g.fillStyle = `rgb(${s},${s - 6},${s - 16})`;
      g.fillRect(x + 2, y + 2, 124, 60);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(90,80,70,${0.05 + r() * 0.08})`;
        g.fillRect(x + 4 + r() * 118, y + 4 + r() * 54, 2 + r() * 4, 2 + r() * 3);
      }
    }
  }
}));

/** Showroom carpet: plum with a gold lattice. One repeat = 1 m. */
const plumCarpet = () => memo('plumCarpet', () => canvasTex(128, 128, (g) => {
  g.fillStyle = '#4b1b3c';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#5e2a4c';
  g.lineWidth = 3;
  for (let k = -128; k <= 128; k += 64) {
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 128, 128); g.stroke();
    g.beginPath(); g.moveTo(k + 128, 0); g.lineTo(k, 128); g.stroke();
  }
  g.fillStyle = '#b48a3c';
  for (const [x, y] of [[0, 0], [64, 64], [128, 0], [0, 128], [128, 128], [64, 0], [0, 64], [128, 64], [64, 128]]) {
    g.beginPath(); g.arc(x, y, (x + y) % 128 === 0 ? 5 : 3, 0, Math.PI * 2); g.fill();
  }
}));

/** Aisle runner: crimson with gold borders (across the width), repeating along its length. */
const runnerTex = () => memo('runner', () => {
  const t = canvasTex(64, 128, (g) => {
    g.fillStyle = '#6e1226';
    g.fillRect(0, 0, 64, 128);
    g.fillStyle = '#c9a24a';
    g.fillRect(0, 0, 6, 128); g.fillRect(58, 0, 6, 128);
    g.fillRect(10, 0, 2, 128); g.fillRect(52, 0, 2, 128);
    g.fillStyle = '#8a2234';
    for (let y = 0; y < 128; y += 32) { g.beginPath(); g.moveTo(32, y + 4); g.lineTo(44, y + 16); g.lineTo(32, y + 28); g.lineTo(20, y + 16); g.closePath(); g.fill(); }
  });
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
});

/** Office carpet: bottle green with small diamonds. One repeat = 1 m. */
const greenCarpet = () => memo('greenCarpet', () => canvasTex(128, 128, (g) => {
  g.fillStyle = '#2c4a3a';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#3a5e4a';
  for (let y = 0; y < 128; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < 128; x += 32) {
    g.beginPath(); g.moveTo(x + 16, y + 6); g.lineTo(x + 26, y + 16); g.lineTo(x + 16, y + 26); g.lineTo(x + 6, y + 16); g.closePath(); g.fill();
  }
}));

/** Back-corridor linoleum: tired beige checks. One repeat = 1 m. */
const lino = () => memo('lino', () => canvasTex(128, 128, (g) => {
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = (x + y) % 2 ? '#a8987a' : '#cbbd9c';
    g.fillRect(x * 32, y * 32, 32, 32);
  }
  g.fillStyle = 'rgba(60,50,40,0.12)';
  const r = rng(5);
  for (let i = 0; i < 60; i++) g.fillRect(r() * 128, r() * 128, 2 + r() * 6, 1 + r() * 2);
}));

/** Preparation-room floor: pale blue-grey tiles. One repeat = 1 m. */
const prepFloor = () => memo('prepFloor', () => canvasTex(128, 128, (g) => {
  g.fillStyle = '#93a8b0';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const s = (x * 7 + y * 3) % 5;
    g.fillStyle = `rgb(${206 + s},${222 + s},${228 + s})`;
    g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
  }
}));

/** Vertical stripes (tinted by the wall colour). One repeat = 1 m. */
const stripes = () => memo('stripes', () => canvasTex(128, 128, (g) => {
  for (let x = 0; x < 128; x += 32) {
    g.fillStyle = '#ffffff'; g.fillRect(x, 0, 20, 128);
    g.fillStyle = '#cfcfcf'; g.fillRect(x + 20, 0, 12, 128);
    g.fillStyle = '#e8e0c8'; g.fillRect(x + 25, 0, 2, 128);
  }
}));

/** Raised wooden panelling (tinted). One repeat = 1 m. */
const panelling = () => memo('panel', () => canvasTex(128, 128, (g) => {
  g.fillStyle = '#bdbdbd';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#dedede';
  g.fillRect(12, 12, 104, 104);
  g.fillStyle = '#f2f2f2';
  g.fillRect(12, 12, 104, 4); g.fillRect(12, 12, 4, 104);
  g.fillStyle = '#9a9a9a';
  g.fillRect(12, 112, 104, 4); g.fillRect(112, 12, 4, 104);
  g.strokeStyle = 'rgba(0,0,0,0.08)';
  for (let y = 20; y < 112; y += 7) { g.beginPath(); g.moveTo(18, y); g.bezierCurveTo(50, y - 3, 80, y + 3, 110, y); g.stroke(); }
}));

/** Small square wall tiles (tinted). One repeat = 1 m. */
const wallTiles = () => memo('wallTiles', () => canvasTex(128, 128, (g) => {
  g.fillStyle = '#b9c3c8';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = (x + y * 3) % 7 === 0 ? '#f2f6f8' : '#ffffff';
    g.fillRect(x * 16 + 1, y * 16 + 1, 15, 15);
  }
}));

/** Brick for the outside faces (tinted). One repeat = 1 m. */
const brick = () => memo('brick', () => canvasTex(128, 128, (g) => {
  g.fillStyle = '#9c9c9c';
  g.fillRect(0, 0, 128, 128);
  const r = rng(3);
  for (let row = 0; row < 16; row++) {
    const off = row % 2 ? 16 : 0;
    for (let k = -1; k < 4; k++) {
      const s = 200 + Math.floor(r() * 55);
      g.fillStyle = `rgb(${s},${s},${s})`;
      g.fillRect(off + k * 32 + 1, row * 8 + 1, 30, 6);
    }
  }
}));

/** Velvet curtain folds (tinted). One repeat = 1 m across. */
const folds = () => memo('folds', () => canvasTex(128, 16, (g) => {
  const grd = g.createLinearGradient(0, 0, 32, 0);
  grd.addColorStop(0, '#7a7a7a'); grd.addColorStop(0.5, '#ffffff'); grd.addColorStop(1, '#7a7a7a');
  for (let x = 0; x < 128; x += 32) { g.save(); g.translate(x, 0); g.fillStyle = grd; g.fillRect(0, 0, 32, 16); g.restore(); }
}));

/** Gentle pleats for a tablecloth (tinted). */
const softFolds = () => memo('softFolds', () => canvasTex(128, 16, (g) => {
  const grd = g.createLinearGradient(0, 0, 32, 0);
  grd.addColorStop(0, '#d8d6d2'); grd.addColorStop(0.5, '#ffffff'); grd.addColorStop(1, '#d8d6d2');
  for (let x = 0; x < 128; x += 32) { g.save(); g.translate(x, 0); g.fillStyle = grd; g.fillRect(0, 0, 32, 16); g.restore(); }
}));

/** Woven wicker. One repeat = 0.25 m. */
const wicker = () => memo('wicker', () => canvasTex(64, 64, (g) => {
  g.fillStyle = '#8a6a3a';
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 16) {
    const o = (y / 8) % 2 ? 8 : 0;
    g.fillStyle = '#d2ab6a'; g.fillRect((x + o) % 64, y + 1, 12, 6);
    g.fillStyle = '#b8904e'; g.fillRect((x + o + 12) % 64, y, 4, 8);
  }
}));

/** Corrugated roller shutter. One repeat = 0.5 m. */
const corrugated = () => memo('corrugated', () => canvasTex(16, 64, (g) => {
  for (let y = 0; y < 64; y += 8) {
    const grd = g.createLinearGradient(0, y, 0, y + 8);
    grd.addColorStop(0, '#6e7880'); grd.addColorStop(0.5, '#c8d0d6'); grd.addColorStop(1, '#6e7880');
    g.fillStyle = grd; g.fillRect(0, y, 16, 8);
  }
}));

/**
 * The window glass: the left three quarters a stained-glass lancet (a white
 * lily on jewelled panes), the right quarter frosted leaded diamonds for the
 * plain windows. It is both the colour and the glow (emissive) map, so the
 * Storm's lightning lights the colours up.
 */
const glassTex = () => memo('glass', () => canvasTex(512, 512, (g) => {
  const r = rng(29);
  // Region A (0..384): jewelled panes.
  g.fillStyle = '#1b1420';
  g.fillRect(0, 0, 384, 512);
  const jewels = ['#2a4fa8', '#1f3c86', '#b01e3c', '#8a1430', '#d8a12a', '#2f7a4a', '#5a2a8a', '#2a6ab0'];
  for (let y = 0; y < 512; y += 32) {
    let x = 0;
    while (x < 384) {
      const w = 28 + Math.floor(r() * 40);
      g.fillStyle = jewels[Math.floor(r() * jewels.length)];
      g.fillRect(x + 3, y + 3, Math.min(w, 384 - x) - 6, 26);
      x += w;
    }
  }
  // Border of ruby and amber squares.
  for (let y = 0; y < 512; y += 24) for (const x of [6, 354]) {
    g.fillStyle = (y / 24) % 2 ? '#c8282e' : '#e8b03a';
    g.fillRect(x, y + 3, 24, 18);
  }
  // Deep blue mandorla with the lily.
  g.fillStyle = '#16245a';
  g.beginPath(); g.ellipse(192, 270, 110, 190, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1b1420'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#f0c040';
  g.beginPath(); g.arc(192, 130, 46, 0, Math.PI * 2); g.fill();
  g.stroke();
  g.strokeStyle = '#2f8a4a'; g.lineWidth = 10;
  g.beginPath(); g.moveTo(192, 440); g.bezierCurveTo(186, 360, 198, 300, 192, 220); g.stroke();
  g.fillStyle = '#3a9a52';
  g.beginPath(); g.ellipse(160, 360, 16, 46, -0.7, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(224, 330, 16, 46, 0.7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fbf6ea';
  for (const a of [-0.9, 0, 0.9]) {
    g.save(); g.translate(192, 215); g.rotate(a);
    g.beginPath(); g.ellipse(0, -48, 22, 52, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  g.fillStyle = '#f0c040';
  for (const dx of [-10, 0, 10]) { g.beginPath(); g.arc(192 + dx, 160, 6, 0, Math.PI * 2); g.fill(); }
  // Lead lines across the panes.
  g.strokeStyle = '#1b1420'; g.lineWidth = 4;
  for (let y = 0; y <= 512; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(384, y); g.stroke(); }
  // Region B (384..512): frosted leaded diamonds.
  g.fillStyle = '#dfe9e6';
  g.fillRect(384, 0, 128, 512);
  g.strokeStyle = '#6a7470'; g.lineWidth = 2;
  for (let k = -512; k < 640; k += 32) {
    g.beginPath(); g.moveTo(384 + k, 0); g.lineTo(384 + k + 512, 512); g.stroke();
    g.beginPath(); g.moveTo(384 + k + 512, 0); g.lineTo(384 + k, 512); g.stroke();
  }
  g.fillStyle = '#1b1420';
  g.fillRect(380, 0, 8, 512);
}, false));

/** "NANA" in white chrysanthemums, the British floral tribute, on a dark ground. */
const floralTex = (text: string, ground: string) => memo(`floral:${text}:${ground}`, () => canvasTex(512, 160, (g) => {
  g.fillStyle = ground;
  g.fillRect(0, 0, 512, 160);
  const m = document.createElement('canvas');
  m.width = 512; m.height = 160;
  const mg = m.getContext('2d') as CanvasRenderingContext2D;
  mg.fillStyle = '#000';
  mg.font = 'bold 132px Arial, Helvetica, sans-serif';
  mg.textAlign = 'center';
  mg.textBaseline = 'middle';
  mg.fillText(text, 256, 84);
  const px = mg.getImageData(0, 0, 512, 160).data;
  const r = rng(text.length * 13 + 7);
  g.fillStyle = '#2f6a3a';
  g.fillRect(0, 140, 512, 20);
  for (let y = 4; y < 160; y += 7) for (let x = 4; x < 512; x += 7) {
    if (px[(y * 512 + x) * 4 + 3] < 128) continue;
    const s = 225 + Math.floor(r() * 30);
    g.fillStyle = `rgb(${s},${s},${s - 12})`;
    g.beginPath(); g.arc(x + r() * 2, y + r() * 2, 4.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(200,190,150,0.6)';
    g.beginPath(); g.arc(x, y, 1.3, 0, Math.PI * 2); g.fill();
  }
}, false));

// ───────────── Signs ─────────────

type Line = string | { t: string; s?: number; c?: string; font?: string };
interface SignStyle {
  bg: string | null;
  fg: string;
  border?: string;
  sans?: boolean;
  bold?: boolean;
  italic?: boolean;
  pad?: number;
  glow?: number;
  rough?: number;
}
type Face = 'N' | 'S' | 'E' | 'W' | 'up';

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = 'Helvetica, Arial, sans-serif';

const STYLE: Record<string, SignStyle> = {
  gilt: { bg: '#161016', fg: '#e2b84e', border: '#c9a24a', bold: true },
  plaque: { bg: '#c9a24a', fg: '#2a1810', border: '#8a6a2a', bold: true, rough: 0.35 },
  card: { bg: '#f7f2e8', fg: '#3a1a2c', border: '#c9a24a' },
  notice: { bg: '#fbf7e6', fg: '#26221e', border: '#3a3a3a', sans: true },
  staff: { bg: '#b3122a', fg: '#ffffff', border: '#ffffff', sans: true, bold: true },
  retail: { bg: '#f2c230', fg: '#a3122a', border: '#a3122a', sans: true, bold: true },
  chalk: { bg: '#262b27', fg: '#f2f0e4', border: '#6a4a2a', italic: true },
  tag: { bg: '#fbf6ec', fg: '#3a1830', border: '#3a1830' },
  cut: { bg: null, fg: '#e2b84e', bold: true },
  led: { bg: '#120808', fg: '#ff3a2a', sans: true, bold: true, glow: 0.9 },
  white: { bg: '#f4f4f0', fg: '#1d2a33', border: '#9fb2b8', sans: true },
};

function signMesh(lines: Line[], w: number, h: number, st: SignStyle): THREE.Mesh {
  const ppm = Math.min(300, 1024 / Math.max(w, h));
  const cw = Math.max(48, Math.round(w * ppm)), chh = Math.max(32, Math.round(h * ppm));
  const tex = canvasTex(cw, chh, (g) => {
    if (st.bg) { g.fillStyle = st.bg; g.fillRect(0, 0, cw, chh); }
    const pad = (st.pad ?? 0.09) * Math.min(cw, chh);
    if (st.border) {
      g.strokeStyle = st.border;
      g.lineWidth = Math.max(2, Math.min(cw, chh) * 0.03);
      g.strokeRect(pad * 0.45, pad * 0.45, cw - pad * 0.9, chh - pad * 0.9);
    }
    const ls = lines.map((l) => (typeof l === 'string' ? { t: l } : l));
    const total = ls.reduce((a, l) => a + (l.s ?? 1), 0);
    const unit = (chh - 2 * pad) / (total * 1.2);
    let y = pad;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const l of ls) {
      const lh = unit * (l.s ?? 1) * 1.2;
      let px = unit * (l.s ?? 1);
      const font = (sz: number) => `${st.italic ? 'italic ' : ''}${st.bold ? 'bold ' : ''}${Math.max(6, Math.round(sz))}px ${l.font ?? (st.sans ? SANS : SERIF)}`;
      g.font = font(px);
      const mw = g.measureText(l.t).width;
      if (mw > cw - 2 * pad) { px *= (cw - 2 * pad) / mw; g.font = font(px); }
      g.fillStyle = l.c ?? st.fg;
      g.fillText(l.t, cw / 2, y + lh / 2);
      y += lh;
    }
  }, false);
  const m = new THREE.MeshStandardMaterial({
    map: tex, roughness: st.rough ?? 0.8, alphaTest: st.bg ? 0 : 0.4, transparent: false,
    emissive: st.glow ? '#ffffff' : '#000000', emissiveMap: st.glow ? tex : null, emissiveIntensity: st.glow ?? 1,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

/** Point a mesh built facing +Z at a compass face, at local (x, y, z). */
function orient<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, face: Face): T {
  o.position.set(X + x, y, z);
  if (face === 'up') o.rotation.x = -Math.PI / 2;
  else o.rotation.y = face === 'S' ? 0 : face === 'N' ? Math.PI : face === 'E' ? Math.PI / 2 : -Math.PI / 2;
  return o;
}

// ───────────── Shapes ─────────────

/** The toe-pincher coffin outline: width along shape x, length along shape y (head at +y). */
function coffinShape(len: number, wid: number): THREE.Shape {
  const hl = len / 2, s = new THREE.Shape();
  s.moveTo(-0.29 * wid, -hl);
  s.lineTo(0.29 * wid, -hl);
  s.lineTo(0.5 * wid, hl - 0.27 * len);
  s.lineTo(0.36 * wid, hl);
  s.lineTo(-0.36 * wid, hl);
  s.lineTo(-0.5 * wid, hl - 0.27 * len);
  s.closePath();
  return s;
}

function extrude(shape: THREE.Shape, depth: number): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
}

/** A pointed-arch window, its UVs mapped into the glass texture's stained (or frosted) region. */
function lancetGeo(w: number, h: number, u0 = 0.02, u1 = 0.73): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h - w * 0.75);
  s.quadraticCurveTo(w / 2, h - w * 0.1, 0, h);
  s.quadraticCurveTo(-w / 2, h - w * 0.1, -w / 2, h - w * 0.75);
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 10);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, u0 + ((pos.getX(i) + w / 2) / w) * (u1 - u0), pos.getY(i) / h);
  return g;
}

/** A plain rectangular pane (frosted diamonds). */
function paneGeo(w: number, h: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 0.77 + uv.getX(i) * 0.21);
  return g;
}

// ───────────── The builder ─────────────

const COLORS: Record<string, string> = {
  'Chapel of Rest': '#5e2a4e', // deep plum damask
  'Coffin Showroom': '#55304e', // aubergine stripe
  'Wake Room': '#a46a74', // dusty rose damask
  'Arrangements Office': '#8a4a32', // mahogany panelling
  'Back Corridor': '#b8a888', // institutional beige
  'Preparation Room': '#bcd9e2', // cold blue-white tile
  Outside: '#8a5a50', // brick
};

export function buildParlour(def: MapDef): MapView {
  const v = new ViewBuilder(def);
  const handled = new Set<Box>();
  const at = (label: string): Box => {
    const b = def.boxes.find((q) => q.label === label);
    if (!b) throw new Error(`parlour: no box "${label}"`);
    handled.add(b);
    return b;
  };

  // Materials (cached by mat()).
  const M = {
    mahogany: mat('#511c13', { rough: 0.4 }),
    mahoganyDark: mat('#3a150e', { rough: 0.45 }),
    walnut: mat('#7a4e2c', { rough: 0.45 }),
    pine: mat('#d9b47c', { rough: 0.85 }),
    brass: mat('#c9a24a', { rough: 0.3, metal: 0.85 }),
    gold: mat('#e6b94c', { rough: 0.25, metal: 0.9 }),
    chrome: mat('#e2e6ea', { rough: 0.15, metal: 0.95 }),
    steel: mat('#b4c2ca', { rough: 0.28, metal: 0.75 }),
    lily: mat('#f8f4ea', { rough: 0.6 }),
    satin: mat('#f3e4e6', { rough: 0.3 }),
    velvet: mat('#5a1a4a', { rough: 0.95 }),
    velvetDeep: mat('#3c1032', { rough: 0.95 }),
    black: mat('#151116', { rough: 0.3 }),
    blackMatte: mat('#1c181c', { rough: 0.9 }),
    green: mat('#3e7a3e', { rough: 0.8 }),
    leaf: mat('#2f6a34', { rough: 0.8 }),
    marble: mat('#ece6dc', { rough: 0.3 }),
    stone: mat('#cbbfae', { rough: 0.9 }),
    cream: mat('#f2ead8', { rough: 0.85 }),
    cloth: mat('#fbfaf6', { rough: 0.9 }),
    tile: mat('#e8f0f2', { rough: 0.25 }),
    candle: mat('#f8f0dc', { rough: 0.6 }),
    flame: mat('#ffd27a', { emissive: '#ffb040', emissiveIntensity: 2.4 }),
    bulb: mat('#fff4d6', { emissive: '#ffd89a', emissiveIntensity: 1.8 }),
    tube: mat('#f4fbff', { emissive: '#dff2ff', emissiveIntensity: 1.6 }),
    cardboard: mat('#b48a58', { rough: 0.95 }),
    rubber: mat('#202022', { rough: 0.95 }),
    glassDark: mat('#20262e', { rough: 0.1, metal: 0.4 }),
    hazard: mat('#e8c030', { rough: 0.7 }),
    filing: mat('#4a6a58', { rough: 0.5, metal: 0.3 }),
  };

  // Shorthands in local x.
  const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: THREE.Material | THREE.Material[], block = false, tile = 1) =>
    v.add(boxMesh(X + x0, y0, z0, X + x1, y1, z1, m, tile), block);
  const cyl = (x: number, y0: number, z: number, r: number, h: number, m: THREE.Material, seg = 14, rTop = r, block = false) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, h, seg), m);
    c.position.set(X + x, y0 + h / 2, z);
    return v.add(c, block);
  };
  const ball = (x: number, y: number, z: number, r: number, m: THREE.Material, seg = 10) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 3)), m);
    s.position.set(X + x, y, z);
    return v.add(s);
  };
  const sign = (lines: Line[], x: number, y: number, z: number, face: Face, w: number, h: number, st: SignStyle | keyof typeof STYLE) =>
    v.add(orient(signMesh(lines, w, h, typeof st === 'string' ? STYLE[st] : st), x, y, z, face));
  /** A price tag on a little brass stand, standing on the floor (or a surface at y0). */
  const tag = (lines: Line[], x: number, z: number, face: Face, y0 = 0, h = 0.95) => {
    cyl(x, y0, z, 0.012, h - 0.12, M.brass, 6);
    cyl(x, y0, z, 0.08, 0.02, M.brass, 10);
    const card = orient(signMesh(lines, 0.42, 0.28, STYLE.tag), x, y0 + h, z, face);
    card.rotation.x = face === 'up' ? -Math.PI / 2 : -0.35;
    if (face !== 'up') card.rotation.order = 'YXZ';
    v.add(card);
  };
  const wx = (lx: number) => X + lx;

  // ── Walls, by room colour and texture, split where the room behind them changes ──
  const wallTex: Record<string, (() => THREE.Texture) | null> = {
    'Chapel of Rest': wallpaper, 'Coffin Showroom': stripes, 'Wake Room': wallpaper, 'Arrangements Office': panelling,
    'Back Corridor': null, 'Preparation Room': wallTiles, Outside: brick,
  };
  const wallMats = new Map<string, THREE.MeshStandardMaterial>();
  const wallMat = (room: string): THREE.MeshStandardMaterial => {
    let m = wallMats.get(room);
    if (!m) {
      const tex = wallTex[room] ?? null;
      m = new THREE.MeshStandardMaterial({ color: COLORS[room] ?? COLORS.Outside, map: tex ? tex() : null, roughness: room === 'Preparation Room' ? 0.35 : 0.9 });
      wallMats.set(room, m);
    }
    return m;
  };
  /** The room a wall face looks into; a door jamb (on a room boundary) takes the room beside it. */
  const faceRoom = (p: Vec3): string => {
    const r = roomIn(def, p);
    if (r !== 'Outside') return r;
    for (const [dx, dz] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) {
      const q = roomIn(def, { x: p.x + dx, y: p.y, z: p.z + dz });
      if (q !== 'Outside') return q;
    }
    return 'Outside';
  };
  const splitAt = (b: Box, axis: 'x' | 'y' | 'z', at: number): Box[] => {
    if (!(b.min[axis] < at - 0.05 && b.max[axis] > at + 0.05)) return [b];
    return [{ ...b, min: { ...b.min }, max: { ...b.max, [axis]: at } }, { ...b, min: { ...b.min, [axis]: at }, max: { ...b.max } }];
  };
  for (const b of def.boxes) {
    if (b.kind !== 'wall') continue;
    handled.add(b);
    let parts = splitAt(b, 'y', SH);
    const alongX = b.max.x - b.min.x > b.max.z - b.min.z;
    if (alongX) for (const sx of [wx(-5), wx(5)]) parts = parts.flatMap((p) => splitAt(p, 'x', sx));
    else for (const sz of [-7.1, -2.5, -2]) parts = parts.flatMap((p) => splitAt(p, 'z', sz));
    for (const p of parts) roomWall(v, p, faceRoom, wallMat, M.mahoganyDark);
  }

  // ── Floors and ceilings ──
  const floorTop: Record<string, [THREE.Material, number]> = {
    'Chapel floor': [mat('#ffffff', { map: flagstones(), rough: 0.7 }), 2],
    'Showroom floor': [mat('#ffffff', { map: plumCarpet(), rough: 0.95 }), 1],
    'Preparation room floor': [mat('#ffffff', { map: prepFloor(), rough: 0.3 }), 1],
    'Back corridor floor': [mat('#ffffff', { map: lino(), rough: 0.5 }), 1],
    'Office floor': [mat('#ffffff', { map: greenCarpet(), rough: 0.95 }), 1],
    'Wake room floor': [mat('#c89060', { map: wood(), rough: 0.6 }), 1.5],
  };
  for (const b of def.boxes) {
    if (b.kind !== 'floor') continue;
    handled.add(b);
    const [top, tile] = floorTop[b.label ?? ''] ?? [M.stone, 1];
    const s = M.mahoganyDark;
    v.add(boxMesh(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, [s, s, top, s, s, s], tile), true);
  }
  for (const b of def.boxes) if (b.kind === 'ceiling') handled.add(b);
  ceiling(v, wx(-4.85), -6.95, wx(4.85), 9, CH, mat('#3e1c36', { rough: 1 }));
  ceiling(v, wx(-13), -2.35, wx(-5.15), 9, SH, mat('#e6d6dc', { rough: 1 })); // showroom
  ceiling(v, wx(-13), -9.5, wx(-5.15), -2.65, SH, mat('#eef6f8', { rough: 1 })); // preparation room
  ceiling(v, wx(-4.85), -9.5, wx(4.85), -7.25, SH, mat('#e8e0cc', { rough: 1 })); // corridor
  ceiling(v, wx(5.15), -9.5, wx(13), -2.15, SH, mat('#efe2cc', { rough: 1 })); // office
  ceiling(v, wx(5.15), -1.85, wx(13), 9, SH, mat('#f0e0d8', { rough: 1 })); // wake room

  // Brass thresholds and mahogany architraves round every doorway.
  const doorway = (axis: 'x' | 'z', at: number, a0: number, a1: number, half = 0.15) => {
    const t = 0.04, w = 0.1, top = 2.4;
    for (const side of [-1, 1]) {
      const f = at + side * (half + t / 2);
      if (axis === 'x') {
        bx(f - t / 2, 0, a0 - w, f + t / 2, top + w, a0, M.mahogany);
        bx(f - t / 2, 0, a1, f + t / 2, top + w, a1 + w, M.mahogany);
        bx(f - t / 2, top, a0 - w, f + t / 2, top + w, a1 + w, M.mahogany);
      } else {
        bx(a0 - w, 0, f - t / 2, a0, top + w, f + t / 2, M.mahogany);
        bx(a1, 0, f - t / 2, a1 + w, top + w, f + t / 2, M.mahogany);
        bx(a0 - w, top, f - t / 2, a1 + w, top + w, f + t / 2, M.mahogany);
      }
    }
    // Linings on the jambs and the soffit, and a brass threshold.
    if (axis === 'x') {
      bx(at - half, 0, a0, at + half, top, a0 + 0.025, M.mahogany);
      bx(at - half, 0, a1 - 0.025, at + half, top, a1, M.mahogany);
      bx(at - half, top - 0.025, a0, at + half, top, a1, M.mahogany);
      bx(at - half, 0, a0, at + half, 0.012, a1, M.brass);
    } else {
      bx(a0, 0, at - half, a0 + 0.025, top, at + half, M.mahogany);
      bx(a1 - 0.025, 0, at - half, a1, top, at + half, M.mahogany);
      bx(a0, top - 0.025, at - half, a1, top, at + half, M.mahogany);
      bx(a0, 0, at - half, a1, 0.012, at + half, M.brass);
    }
  };
  doorway('x', -5, 3.0, 4.8);
  doorway('x', 5, 3.0, 4.8);
  doorway('x', -5, -9.2, -7.4);
  doorway('x', 5, -9.2, -7.4);
  doorway('z', -2.5, -8.4, -6.6);
  doorway('z', -2, 8.2, 10.0);
  doorway('z', -7.1, -4.85, -3.1);

  // ── Windows ──
  const glass = glassTex();
  const windows = new THREE.MeshStandardMaterial({ color: '#ffffff', map: glass, emissive: '#ffffff', emissiveMap: glass, emissiveIntensity: 0.9, roughness: 0.25 });
  /** A stained-glass lancet on a wall face, with a stone surround. */
  const lancet = (x: number, y: number, z: number, face: Face, w: number, h: number) => {
    const frame = new THREE.Mesh(lancetGeo(w + 0.16, h + 0.12, 0.02, 0.03), M.stone);
    v.add(orient(frame, x, y - 0.06, z, face));
    const pane = new THREE.Mesh(lancetGeo(w, h), windows);
    const n = face === 'E' ? [0.006, 0] : face === 'W' ? [-0.006, 0] : face === 'S' ? [0, 0.006] : [0, -0.006];
    v.add(orient(pane, x + n[0], y, z + n[1], face));
  };
  /** A plain leaded window with a painted frame and a sill. */
  const pane = (x: number, y: number, z: number, face: Face, w: number, h: number, frameM: THREE.Material = M.cream) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(paneGeo(w, h), windows));
    const f = (x0: number, y0: number, x1: number, y1: number, d = 0.05) => g.add(boxMesh(x0, y0, 0, x1, y1, d, frameM));
    f(-w / 2 - 0.06, -h / 2 - 0.06, w / 2 + 0.06, -h / 2);
    f(-w / 2 - 0.06, h / 2, w / 2 + 0.06, h / 2 + 0.06);
    f(-w / 2 - 0.06, -h / 2, -w / 2, h / 2);
    f(w / 2, -h / 2, w / 2 + 0.06, h / 2);
    f(-0.02, -h / 2, 0.02, h / 2, 0.03);
    f(-w / 2, -0.02, w / 2, 0.02, 0.03);
    g.add(boxMesh(-w / 2 - 0.1, -h / 2 - 0.1, 0, w / 2 + 0.1, -h / 2 - 0.04, 0.12, frameM));
    v.add(orient(g, x, y, z, face));
  };

  // ════════════ Chapel of Rest ════════════
  // Stained-glass clerestory (above the side rooms' roofs), a triple lancet over the dais, a rose over the doors.
  for (const z of [-3.2, 1.0, 5.2]) {
    lancet(-4.84, 3.5, z, 'E', 0.8, 1.7);
    lancet(4.84, 3.5, z, 'W', 0.8, 1.7);
  }
  lancet(0, 3.35, -6.94, 'S', 0.95, 1.95);
  lancet(-1.2, 3.5, -6.94, 'S', 0.7, 1.55);
  lancet(1.2, 3.5, -6.94, 'S', 0.7, 1.55);
  {
    const rose = new THREE.Mesh(new THREE.CircleGeometry(0.8, 28), windows);
    const uv = rose.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 0.02 + uv.getX(i) * 0.71);
    v.add(orient(rose, 0, 4.35, 8.99, 'N'));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.94, 28), M.stone);
    v.add(orient(ring, 0, 4.35, 8.985, 'N'));
  }
  // Dark timber beams across the chapel ceiling.
  // (Drawn as their underside and two faces, so the cut-away from above sees into the chapel.)
  for (const z of [-6.2, -3.6, -1.0, 1.6, 4.2, 6.8]) {
    const w = 0.24, d = 0.28;
    const under = new THREE.Mesh(new THREE.PlaneGeometry(9.7, w), M.mahoganyDark);
    under.rotation.x = Math.PI / 2;
    under.position.set(X, CH - d, z);
    v.add(under);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(9.7, d), M.mahoganyDark);
      side.position.set(X, CH - d / 2, z + (s * w) / 2);
      side.rotation.y = s > 0 ? 0 : Math.PI;
      v.add(side);
    }
  }
  // Mahogany wainscot along the walls (up to 1.2 m), stopping at the doors.
  const wains = (x0: number, z0: number, x1: number, z1: number) => {
    bx(x0, 0, z0, x1, 1.15, z1, M.mahogany);
    const cx = x1 - x0 > z1 - z0;
    bx(cx ? x0 : x0 - 0.02, 1.15, cx ? z0 - 0.02 : z0, cx ? x1 : x1 + 0.02, 1.22, cx ? z1 + 0.02 : z1, M.mahoganyDark);
  };
  wains(-4.85, -6.95, -4.8, 2.9);
  wains(-4.85, 4.9, -4.8, 9);
  wains(4.8, -5.4, 4.85, 2.9);
  wains(4.8, 4.9, 4.85, 9);
  wains(-4.85, 8.95, -1.3, 9);
  wains(1.3, 8.95, 4.85, 9);

  // The aisle runner, from the narthex to the dais.
  {
    const len = 13.6;
    const rt = runnerTex().clone();
    rt.needsUpdate = true;
    rt.repeat.set(1, len);
    const runner = new THREE.Mesh(new THREE.PlaneGeometry(1.5, len), mat('#ffffff', { map: rt, rough: 0.95 }));
    runner.rotation.x = -Math.PI / 2;
    runner.position.set(X, 0.006, -5.0 + len / 2);
    v.add(runner);
  }

  // The dais: plum carpet on mahogany, a brass nosing.
  {
    const b = at('Dais');
    const top = mat('#4a1a3e', { map: plumCarpet(), rough: 0.95 });
    v.add(boxMesh(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, [M.mahogany, M.mahogany, top, M.mahogany, M.mahogany, M.mahogany]), true);
    v.add(boxMesh(b.min.x - 0.02, b.max.y - 0.03, b.max.z - 0.02, b.max.x + 0.02, b.max.y + 0.005, b.max.z + 0.02, M.brass));
  }
  // Velvet drapes behind the coffin, a gilt pelmet and the "In Loving Memory" scroll.
  {
    const drape = mat('#6a1e56', { map: folds(), rough: 0.95 });
    bx(-2.9, 0.3, -6.95, 2.9, 3.15, -6.85, drape);
    bx(-3.0, 3.1, -6.95, 3.0, 3.3, -6.8, M.gold);
    for (const x of [-2.75, 2.75]) cyl(x, 0.3, -6.82, 0.13, 2.6, mat('#6a1e56', { rough: 0.95 }), 10, 0.09);
    sign([{ t: 'IN LOVING MEMORY', s: 1.2 }, { t: '(pending)', s: 0.7, c: '#c8b8c8' }], 0, 2.78, -6.84, 'S', 2.2, 0.55, { bg: null, fg: '#e8c25a', bold: true });
  }
  // The reserved coffin on its catafalque: open, empty, satin-lined; the lid leans on the drapes.
  {
    const b = at('The reserved coffin');
    const cx = (b.min.x + b.max.x) / 2 - X, cz = (b.min.z + b.max.z) / 2;
    const len = b.max.x - b.min.x, wid = b.max.z - b.min.z;
    const y0 = b.min.y, top = b.max.y;
    const cat = 0.4; // catafalque height
    bx(cx - len / 2 + 0.1, y0, cz - wid / 2 + 0.04, cx + len / 2 - 0.1, y0 + cat, cz + wid / 2 - 0.04, M.velvetDeep, true);
    bx(cx - len / 2 + 0.08, y0 + cat - 0.06, cz - wid / 2 + 0.02, cx + len / 2 - 0.08, y0 + cat - 0.02, cz + wid / 2 - 0.02, M.gold, true);
    const g = new THREE.Group();
    const base = top - (y0 + cat);
    const bodyM = new THREE.Mesh(extrude(coffinShape(len, wid), base), M.mahogany);
    bodyM.rotation.x = -Math.PI / 2;
    g.add(bodyM);
    const lining = new THREE.Mesh(extrude(coffinShape(len - 0.12, wid - 0.1), 0.01), M.satin);
    lining.rotation.x = -Math.PI / 2;
    lining.position.y = base;
    g.add(lining);
    const rimShape = coffinShape(len, wid);
    rimShape.holes.push(new THREE.Path(coffinShape(len - 0.1, wid - 0.08).getPoints()));
    const rim = new THREE.Mesh(extrude(rimShape, 0.1), M.mahogany);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = base;
    g.add(rim);
    // Pillow at the head (west), brass handles.
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.4), M.satin);
    pillow.position.set(0, base + 0.05, -len / 2 + 0.3);
    g.add(pillow);
    for (const s of [-1, 1]) for (const u of [-0.45, 0.2]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.3), M.brass);
      h.position.set(s * (wid / 2 + 0.01), base * 0.55, u);
      g.add(h);
    }
    g.position.set(X + cx, y0 + cat, cz);
    g.rotation.y = Math.PI / 2; // head (and pillow) to the west
    v.add(g, true);
    // The lid, propped on its foot against the drapes, with its brass plate.
    const lid = new THREE.Group();
    const lidM = new THREE.Mesh(extrude(coffinShape(2.1, 0.74), 0.07), M.mahogany);
    lidM.position.y = 1.05;
    lid.add(lidM);
    const panel = new THREE.Mesh(extrude(coffinShape(1.8, 0.56), 0.02), M.mahoganyDark);
    panel.position.set(0, 1.05, 0.07);
    lid.add(panel);
    const plate = signMesh([{ t: 'Mrs H.', s: 1 }, { t: '19__ – 20__', s: 0.8 }], 0.3, 0.18, STYLE.plaque);
    plate.position.set(0, 1.45, 0.096);
    lid.add(plate);
    lid.position.set(X + cx, y0, -6.82);
    lid.rotation.x = -0.08;
    v.add(lid);
    // The card hangs on brass chains from the rim, on the side facing the pews.
    const card = signMesh([{ t: 'RESERVED', s: 1.3, c: '#7a1430' }, { t: 'Mrs Harrowgate', s: 0.9 }, { t: 'no trying it out, please', s: 0.6, c: '#6a5a60' }], 0.62, 0.36, STYLE.card);
    v.add(orient(card, cx, top - 0.16, cz + wid / 2 + 0.035, 'S'));
    for (const dx of [-0.25, 0.25]) bx(cx + dx - 0.006, top + 0.02, cz + wid / 2 + 0.02, cx + dx + 0.006, top + 0.1, cz + wid / 2 + 0.04, M.brass);
  }
  // Lilies in tall brass urns at both ends; candles at the dais corners.
  const flames: THREE.Mesh[] = [];
  const lilies = (x: number, y0: number, z: number, scale = 1) => {
    cyl(x, y0, z, 0.14 * scale, 0.75 * scale, M.brass, 12, 0.09 * scale);
    cyl(x, y0 + 0.75 * scale, z, 0.12 * scale, 0.3 * scale, M.brass, 12, 0.18 * scale);
    const r = rng(Math.round(x * 100 + z * 10));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + r();
      const d = 0.08 + r() * 0.12;
      const h = (1.2 + r() * 0.45) * scale;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, h - 0.9 * scale, 4), M.leaf);
      stem.position.set(X + x + Math.cos(a) * d * 0.5, y0 + (0.9 * scale + h) / 2, z + Math.sin(a) * d * 0.5);
      v.add(stem);
      const trumpet = new THREE.Mesh(new THREE.ConeGeometry(0.07 * scale, 0.16 * scale, 6, 1, true), M.lily);
      trumpet.position.set(X + x + Math.cos(a) * d, y0 + h, z + Math.sin(a) * d);
      trumpet.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      v.add(trumpet);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.04 * scale, 0.35 * scale, 4), M.leaf);
      leaf.position.set(X + x + Math.cos(a) * 0.12 * scale, y0 + 1.15 * scale, z + Math.sin(a) * 0.12 * scale);
      leaf.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
      v.add(leaf);
    }
  };
  lilies(-1.55, 0.3, -6.55);
  lilies(1.55, 0.3, -6.55);
  const candle = (x: number, y0: number, z: number, h = 1.25) => {
    cyl(x, y0, z, 0.13, 0.05, M.brass, 12);
    cyl(x, y0, z, 0.03, h, M.brass, 8);
    cyl(x, y0 + h, z, 0.08, 0.04, M.brass, 10, 0.1);
    cyl(x, y0 + h + 0.04, z, 0.035, 0.28, M.candle, 8);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 6), M.flame);
    f.position.set(X + x, y0 + h + 0.36, z);
    flames.push(f);
  };
  candle(-2.6, 0.3, -5.25);
  candle(2.6, 0.3, -5.25);
  candle(-0.95, 0.3, -6.72, 1.0);
  candle(0.95, 0.3, -6.72, 1.0);

  // The organ: a mahogany case, a fan of silver pipes, a console with Nana's music.
  {
    const c = at('Organ case'), k = at('Organ console');
    v.add(boxMesh(c.min.x, c.min.y, c.min.z, c.max.x, c.max.y, c.max.z, M.mahogany), true);
    v.add(boxMesh(c.min.x - 0.04, c.max.y - 0.12, c.min.z, c.max.x, c.max.y, c.max.z + 0.05, M.mahoganyDark));
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = c.min.x + 0.15 + t * (c.max.x - c.min.x - 0.3);
      const h = 1.1 + Math.sin(t * Math.PI) * 1.4;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, h, 10), M.chrome);
      p.position.set(x, c.max.y + h / 2, (c.min.z + c.max.z) / 2 - 0.1);
      v.add(p);
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.02), M.blackMatte);
      mouth.position.set(x, c.max.y + 0.25, (c.min.z + c.max.z) / 2 - 0.02);
      v.add(mouth);
    }
    // Console: body, keyboards, stops, bench (inside the console's footprint).
    v.add(boxMesh(k.min.x, 0, k.min.z, k.max.x, 0.75, k.min.z + 0.35, M.mahogany), true);
    v.add(boxMesh(k.min.x + 0.1, 0.75, k.min.z, k.max.x - 0.1, 1.0, k.min.z + 0.12, M.mahogany), true);
    for (const [y, dz] of [[0.76, 0.1], [0.85, 0.02]] as [number, number][]) {
      v.add(boxMesh(k.min.x + 0.14, y, k.min.z + 0.12 + dz, k.max.x - 0.14, y + 0.03, k.min.z + 0.3 + dz, M.lily));
    }
    for (let i = 0; i < 6; i++) ball(k.min.x - X + 0.2 + i * 0.18, 0.95, k.min.z + 0.13, 0.025, i % 2 ? M.lily : mat('#b0283a'));
    v.add(boxMesh(k.min.x + 0.1, 0, k.max.z - 0.3, k.max.x - 0.1, 0.5, k.max.z, M.mahoganyDark), true);
    const music = signMesh([{ t: 'ABIDE WITH ME', s: 1 }, { t: "tempo: Nana's (brisk)", s: 0.7 }, { t: '♪ ♫ ♪ ♫ ♪', s: 0.9 }], 0.4, 0.28, { bg: '#f4eedc', fg: '#2a2020' });
    v.add(orient(music, (k.min.x + k.max.x) / 2 - X, 1.13, k.min.z + 0.08, 'S'));
    music.rotation.x = -0.25;
  }
  // Nana's own chair beside the coffin, facing her public.
  {
    const b = at("Nana's chair (Chief Mourner)");
    wingChair(v, b, mat('#6a1f4e', { rough: 0.9 }), mat('#8a3a6a'), Math.PI);
    const x = b.min.x - X - 0.25, z = b.max.z - 0.1;
    cyl(x, 0, z, 0.015, 1.05, M.brass, 6);
    v.add(orient(signMesh([{ t: 'CHIEF', s: 1 }, { t: 'MOURNER', s: 1 }], 0.34, 0.22, STYLE.gilt), x, 1.12, z + 0.02, 'S'));
  }
  // A wreath on an easel by the organ: "With Deepest Sympathy (In Advance)".
  {
    const x = 4.45, z = -5.05;
    for (const dx of [-0.2, 0.2]) { const leg = cyl(x + dx * 0, 0, z + dx, 0.015, 1.3, M.mahoganyDark, 5); leg.rotation.x = dx > 0 ? 0.1 : -0.1; }
    const wreath = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 8, 18), M.leaf);
    v.add(orient(wreath, x - 0.05, 1.1, z, 'W'));
    const r = rng(3);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      ball(x - 0.12, 1.1 + Math.sin(a) * 0.3, z + Math.cos(a) * 0.3, 0.06, r() > 0.5 ? M.lily : mat('#e8c0d0'), 6);
    }
    v.add(orient(signMesh([{ t: 'With Deepest Sympathy', s: 1 }, { t: '(in advance)', s: 0.8 }], 0.46, 0.16, STYLE.card), x - 0.14, 1.1, z, 'W'));
  }
  // The hymn board on the west wall at the front.
  {
    bx(-4.84, 1.5, -2.3, -4.79, 2.7, -1.5, M.mahogany);
    sign([{ t: 'HYMNS', s: 0.8, c: '#e2b84e' }, { t: '312', s: 1 }, { t: '312', s: 1 }, { t: '312', s: 1 }], -4.785, 2.13, -1.9, 'E', 0.66, 1.0, { bg: '#1a1416', fg: '#f4f0e6', bold: true, sans: true });
    sign([{ t: "Nana's selections.", s: 1 }, { t: 'NO SUBSTITUTIONS.', s: 1 }], -4.785, 1.35, -1.9, 'E', 0.66, 0.18, STYLE.card);
  }

  // The box pews: high-backed mahogany, a seat facing the dais, hymn books on the back ledge.
  const pewBoxes = def.boxes.filter((b) => (b.label ?? '').startsWith('Pew '));
  const bookMats = [mat('#7a1a2a'), mat('#1a1a2a'), mat('#2a3a6a'), mat('#5a1a4a')];
  for (const b of pewBoxes) {
    handled.add(b);
    const x0 = b.min.x - X, x1 = b.max.x - X, z0 = b.min.z, z1 = b.max.z, H = PEW_HEIGHT;
    bx(x0 + 0.06, 0, z1 - 0.1, x1 - 0.06, H - 0.07, z1, M.mahogany, true);
    bx(x0, H - 0.07, z1 - 0.14, x1, H, z1 + 0.02, M.mahoganyDark, true);
    bx(x0 + 0.06, 0.42, z0 + 0.04, x1 - 0.06, 0.48, z1 - 0.1, M.mahogany, true);
    bx(x0 + 0.06, 0.08, z0 + 0.04, x1 - 0.06, 0.42, z0 + 0.08, M.mahoganyDark, true);
    for (const ex of [x0, x1 - 0.07]) {
      bx(ex, 0, z0, ex + 0.07, H, z1, M.mahoganyDark, true);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(PEW_DEPTH / 2, PEW_DEPTH / 2, 0.07, 14, 1, false, 0, Math.PI), M.mahoganyDark);
      cap.rotation.z = Math.PI / 2;
      cap.scale.set(0.5, 1, 1);
      cap.position.set(X + ex + 0.035, H, (z0 + z1) / 2);
      v.add(cap);
    }
    // Hymn-book ledge on the back, for the row behind.
    bx(x0 + 0.1, 0.82, z1, x1 - 0.1, 0.85, z1 + 0.13, M.mahoganyDark);
    const r = rng(Math.round(x0 * 31 + z0 * 7 + 100));
    for (let i = 0; i < 3; i++) {
      const bxx = x0 + 0.3 + r() * (x1 - x0 - 0.6);
      bx(bxx - 0.05, 0.85, z1 + 0.02, bxx + 0.05, 1.0, z1 + 0.11, bookMats[i % bookMats.length]);
    }
    // Brass row number on the aisle end.
    const row = Number((b.label ?? '').slice(5)) || 0;
    const west = x1 < 0;
    const aisleX = west ? x1 + 0.002 : x0 - 0.002;
    sign([String(row)], aisleX, 0.95, (z0 + z1) / 2, west ? 'E' : 'W', 0.14, 0.14, STYLE.plaque);
    if (row === 1) sign([{ t: 'RESERVED', s: 1 }, { t: 'beneficiaries only', s: 0.7 }], aisleX, 0.62, (z0 + z1) / 2, west ? 'E' : 'W', 0.34, 0.2, STYLE.card);
  }

  // The narthex: front doors, the doormat, the black balloon arch, the book of condolence.
  {
    // Double doors with brass handles and a fanlight.
    bx(-1.0, 0, 8.93, 1.0, 2.6, 9.0, mat('#3a1810', { rough: 0.5 }));
    for (const x of [-0.5, 0.5]) {
      bx(x - 0.36, 0.3, 8.91, x + 0.36, 1.2, 8.93, M.mahogany);
      bx(x - 0.36, 1.35, 8.91, x + 0.36, 2.45, 8.93, M.mahogany);
    }
    bx(-0.015, 0, 8.9, 0.015, 2.6, 8.93, M.mahoganyDark);
    for (const x of [-0.12, 0.12]) bx(x - 0.02, 1.0, 8.86, x + 0.02, 1.3, 8.9, M.brass);
    bx(-1.15, 2.6, 8.9, 1.15, 2.75, 9.0, M.mahoganyDark);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.9, 18, 0, Math.PI), windows);
    const uv = fan.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 0.02 + uv.getX(i) * 0.71);
    v.add(orient(fan, 0, 2.76, 8.985, 'N'));
    // The doormat.
    const matMesh = signMesh([{ t: "WE'LL SEE YOU SOON!", s: 1 }], 1.7, 0.6, { bg: '#a8824a', fg: '#3a2410', border: '#5a3a1a', bold: true, sans: true, rough: 1 });
    v.add(orient(matMesh, 0, 0.008, 8.5, 'up'));
    matMesh.rotation.z = Math.PI;
    // Book of condolence on its stand.
    const gb = at('Guestbook stand');
    const gx = (gb.min.x + gb.max.x) / 2 - X, gz = (gb.min.z + gb.max.z) / 2;
    cyl(gx, 0, gz, 0.2, 0.05, M.mahoganyDark, 12, 0.2, true);
    cyl(gx, 0, gz, 0.05, 0.98, M.mahogany, 8, 0.05, true);
    const desk = new THREE.Group();
    desk.add(boxMesh(-0.3, -0.04, -0.24, 0.3, 0.04, 0.24, M.mahogany));
    desk.add(boxMesh(-0.27, 0.04, -0.2, -0.01, 0.07, 0.2, M.lily));
    desk.add(boxMesh(0.01, 0.04, -0.2, 0.27, 0.07, 0.2, M.lily));
    const quill = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.3, 5), M.lily);
    quill.position.set(0.15, 0.12, 0.05);
    quill.rotation.set(0.4, 0, 0.9);
    desk.add(quill);
    desk.position.set(X + gx, 1.04, gz);
    desk.rotation.set(-0.3, Math.PI / 2, 0, 'YXZ');
    v.add(desk, true);
    sign([{ t: 'Book of Condolence', s: 1 }, { t: 'Please sign. Nana is checking.', s: 0.75 }], -4.84, 1.75, gz, 'E', 0.8, 0.3, STYLE.card);
    // Order of Service and the suggestion box by the doors.
    sign([{ t: 'ORDER OF SERVICE', s: 1.1 }, { t: '(provisional)', s: 0.7, c: '#7a5a6a' }, { t: '1. Welcome', s: 0.75 }, { t: '2. Eulogy (Nana will give it herself)', s: 0.75 }, { t: '3. Reading of the Will', s: 0.75 }, { t: '4. Sandwiches', s: 0.75 }],
      2.55, 1.85, 8.98, 'N', 1.1, 1.0, STYLE.card);
    bx(-2.9, 1.0, 8.82, -2.3, 1.4, 9.0, M.mahogany);
    bx(-2.75, 1.36, 8.81, -2.45, 1.38, 8.83, M.blackMatte);
    sign([{ t: 'SUGGESTIONS', s: 1 }, { t: 'for the service', s: 0.7 }], -2.6, 1.55, 8.98, 'N', 0.6, 0.2, STYLE.plaque);
    sign(['"More hymns." — N.'], -2.6, 1.2, 8.815, 'N', 0.5, 0.12, { bg: '#fbf7e6', fg: '#2a2a6a', italic: true });
  }
  // The pedestal-plinths: mahogany columns with a brass plate (heirlooms stand on these).
  const plinth = (b: Box, body: THREE.Material, plate?: string) => {
    handled.add(b);
    const { min: a, max: c } = b;
    v.add(boxMesh(a.x, a.y, a.z, c.x, a.y + 0.1, c.z, M.mahoganyDark), true);
    v.add(boxMesh(a.x + 0.08, a.y + 0.1, a.z + 0.08, c.x - 0.08, c.y - 0.08, c.z - 0.08, body), true);
    v.add(boxMesh(a.x - 0.02, c.y - 0.08, a.z - 0.02, c.x + 0.02, c.y, c.z + 0.02, M.mahoganyDark));
    if (plate) {
      const p = signMesh([plate], 0.3, 0.08, STYLE.plaque);
      v.add(orient(p, (a.x + c.x) / 2 - X, a.y + (c.y - a.y) * 0.72, c.z - 0.079, 'S'));
    }
  };
  for (const b of def.boxes) if (b.kind === 'pedestal') plinth(b, M.marble);

  // ════════════ Coffin Showroom ════════════
  /** A closed coffin lying on a bier: head toward `yaw` (forwardOf convention). */
  const flatCoffin = (b: Box, yaw: number, body: THREE.Material, lid: THREE.Material, bier: number, opts: { trim?: THREE.Material; open?: boolean; panel?: THREE.Material } = {}) => {
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    const alongZ = Math.abs(Math.cos(yaw)) > 0.5;
    const len = (alongZ ? b.max.z - b.min.z : b.max.x - b.min.x) - 0.04;
    const wid = (alongZ ? b.max.x - b.min.x : b.max.z - b.min.z) - 0.04;
    const h = b.max.y - bier;
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, y: number) => { const o = new THREE.Mesh(geo, m); o.rotation.x = -Math.PI / 2; o.position.y = y; g.add(o); return o; };
    if (opts.open) {
      add(extrude(coffinShape(len, wid), h - 0.1), body, 0);
      add(extrude(coffinShape(len - 0.12, wid - 0.1), 0.01), M.satin, h - 0.1);
      const rs = coffinShape(len, wid);
      rs.holes.push(new THREE.Path(coffinShape(len - 0.1, wid - 0.08).getPoints()));
      add(extrude(rs, 0.1), body, h - 0.1);
      const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.26), M.satin);
      pillow.position.set(0, h - 0.05, -len / 2 + 0.25);
      g.add(pillow);
      // Tufting buttons.
      for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), opts.trim ?? M.gold); s.position.set((i % 2 ? 0.1 : -0.1), h - 0.085, -len / 2 + 0.6 + Math.floor(i / 2) * 0.35); g.add(s); }
    } else {
      add(extrude(coffinShape(len, wid), h - 0.06), body, 0);
      add(extrude(coffinShape(len + 0.03, wid + 0.03), 0.06), lid, h - 0.06);
      if (opts.panel) add(extrude(coffinShape(len * 0.8, wid * 0.7), 0.015), opts.panel, h);
    }
    if (opts.trim) {
      for (const s of [-1, 1]) for (const u of [-0.35, 0.05, 0.4]) {
        const hw = 0.5 * wid - Math.abs(u - (len / 2 - 0.27 * len)) * 0.15;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.26), opts.trim);
        bar.position.set(s * (hw + 0.01), h * 0.5, -u * len * 0.5);
        g.add(bar);
      }
    }
    g.position.set(cx, bier, cz);
    g.rotation.y = yaw;
    v.add(g, true);
    // The bier: two trestles and rails.
    const legM = M.mahoganyDark;
    if (bier > 0.05) {
      const ex = alongZ ? (b.max.x - b.min.x) / 2 - 0.1 : len / 2 - 0.25;
      const ez = alongZ ? len / 2 - 0.25 : (b.max.z - b.min.z) / 2 - 0.1;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) v.add(boxMesh(cx + sx * ex - 0.03, 0, cz + sz * ez - 0.03, cx + sx * ex + 0.03, bier, cz + sz * ez + 0.03, legM), true);
      v.add(boxMesh(cx - ex - 0.03, bier - 0.06, cz - ez - 0.03, cx + ex + 0.03, bier, cz + ez + 0.03, legM), true);
    }
  };
  /** An upright coffin standing on a low plinth, its lid facing `face`. */
  const uprightCoffin = (x: number, z: number, face: Face, h: number, wid: number, dep: number, body: THREE.Material, opts: { panel?: THREE.Material; plate?: string; clock?: boolean } = {}) => {
    const g = new THREE.Group();
    const len = h - 0.08;
    g.add(boxMesh(-wid / 2 - 0.02, 0, -dep / 2 - 0.02, wid / 2 + 0.02, 0.08, dep / 2 + 0.02, M.mahoganyDark));
    const bodyM = new THREE.Mesh(extrude(coffinShape(len, wid), dep - 0.05), body);
    bodyM.position.set(0, 0.08 + len / 2, -dep / 2);
    g.add(bodyM);
    const lid = new THREE.Mesh(extrude(coffinShape(len + 0.02, wid + 0.02), 0.05), body);
    lid.position.set(0, 0.08 + len / 2, dep / 2 - 0.05);
    g.add(lid);
    if (opts.panel) {
      const p = new THREE.Mesh(extrude(coffinShape(len * 0.8, wid * 0.65), 0.012), opts.panel);
      p.position.set(0, 0.08 + len / 2, dep / 2);
      g.add(p);
    }
    for (const s of [-1, 1]) for (const yy of [0.6, 1.2]) g.add(boxMesh(s * wid * 0.48 - 0.015, yy, -0.12, s * wid * 0.48 + 0.015, yy + 0.04, 0.12, M.brass));
    if (opts.clock) {
      const face2 = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), M.lily);
      face2.position.set(0, 0.08 + len * 0.78, dep / 2 + 0.02);
      g.add(face2);
      const ringM = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.235, 24), M.brass);
      ringM.position.set(0, 0.08 + len * 0.78, dep / 2 + 0.021);
      g.add(ringM);
      const hand = (a: number, l: number) => { const m2 = boxMesh(-0.008, 0, 0, 0.008, l, 0.005, M.black); m2.position.set(0, 0.08 + len * 0.78, dep / 2 + 0.024); m2.rotation.z = a; g.add(m2); };
      hand(-0.5, 0.16);
      hand(2.1, 0.11);
      const pend = boxMesh(-0.012, -0.5, 0, 0.012, 0, 0.005, M.brass);
      pend.position.set(0, 0.08 + len * 0.55, dep / 2 + 0.022);
      g.add(pend);
      const bob = new THREE.Mesh(new THREE.CircleGeometry(0.06, 14), M.brass);
      bob.position.set(0, 0.08 + len * 0.55 - 0.5, dep / 2 + 0.026);
      g.add(bob);
    }
    if (opts.plate) {
      const p = signMesh([opts.plate], 0.24, 0.09, STYLE.plaque);
      p.position.set(0, 0.08 + len * 0.62, dep / 2 + 0.03);
      if (!opts.clock) g.add(p);
    }
    v.add(orient(g, x, 0, z, face), true);
  };
  // The Viking: a longship coffin with shields and a dragon prow ("ask about our fire package").
  {
    const b = at('The Viking');
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    const len = b.max.z - b.min.z, wid = b.max.x - b.min.x;
    const bier = 0.45;
    v.add(boxMesh(cx - 0.35, 0, cz - len / 2 + 0.3, cx + 0.35, bier, cz + len / 2 - 0.3, M.blackMatte), true);
    const hull = new THREE.Shape();
    hull.moveTo(0, -len / 2);
    hull.quadraticCurveTo(wid * 0.68, 0, 0, len / 2);
    hull.quadraticCurveTo(-wid * 0.68, 0, 0, -len / 2);
    const hullM = new THREE.Mesh(new THREE.ExtrudeGeometry(hull, { depth: b.max.y - bier, bevelEnabled: false, curveSegments: 10 }), mat('#a86a3a', { map: wood(), rough: 0.6 }));
    hullM.rotation.x = -Math.PI / 2;
    hullM.position.set(cx, bier, cz);
    v.add(hullM, true);
    v.add(boxMesh(cx - 0.02, b.max.y, cz - len / 2 + 0.25, cx + 0.02, b.max.y + 0.02, cz + len / 2 - 0.25, M.gold));
    const shieldCols = [mat('#b0202a'), mat('#e8c030'), mat('#2a4a9a'), mat('#f0ece0')];
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const u = -0.75 + i * 0.5;
      const hw = wid * 0.34 * (1 - (u * 2 / len) ** 2) + 0.03;
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 14), shieldCols[(i + (s > 0 ? 1 : 0)) % 4]);
      sh.rotation.z = Math.PI / 2;
      sh.position.set(cx + s * hw, b.max.y - 0.12, cz + u);
      v.add(sh);
      ball(cx - X + s * (hw + 0.02), b.max.y - 0.12, cz + u, 0.035, M.brass, 6);
    }
    // Dragon prow at the north end, curled tail at the south.
    const neck = mat('#8a5a30', { rough: 0.6 });
    const nz = cz - len / 2;
    const segs: [number, number, number][] = [[0.12, 0.98, 0.1], [0.02, 1.18, 0.09], [-0.06, 1.38, 0.085], [-0.1, 1.56, 0.08]];
    for (const [dz, y, r] of segs) { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), neck); s.position.set(cx, y, nz + dz); v.add(s); }
    v.add(boxMesh(cx - 0.08, 1.58, nz - 0.32, cx + 0.08, 1.72, nz - 0.02, neck));
    v.add(boxMesh(cx - 0.06, 1.52, nz - 0.3, cx + 0.06, 1.58, nz - 0.08, neck));
    for (const s of [-1, 1]) {
      ball(cx - X + s * 0.08, 1.68, nz - 0.22, 0.025, mat('#ff3020', { emissive: '#ff2010', emissiveIntensity: 0.8 }), 6);
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 5), M.lily);
      horn.position.set(cx + s * 0.06, 1.78, nz - 0.05);
      horn.rotation.x = 0.5;
      v.add(horn);
    }
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 12, Math.PI * 1.4), neck);
    tail.rotation.y = Math.PI / 2;
    tail.position.set(cx, 1.12, cz + len / 2 - 0.02);
    v.add(tail);
    tag([{ t: 'THE VIKING', s: 1.1 }, { t: '£8,999', s: 1 }, { t: 'ask about our fire package', s: 0.6 }], cx - X + 0.75, cz + 0.6, 'E');
  }
  // The Upright Citizen and the back-to-back upright display.
  {
    const b = at('The Upright Citizen');
    uprightCoffin((b.min.x + b.max.x) / 2 - X, (b.min.z + b.max.z) / 2, 'S', b.max.y, b.max.x - b.min.x - 0.04, b.max.z - b.min.z, M.walnut, { panel: M.mahogany, plate: 'UPRIGHT' });
    sign([{ t: 'THE UPRIGHT CITIZEN', s: 1 }, { t: 'for those who never took it lying down', s: 0.6 }], (b.min.x + b.max.x) / 2 - X, 2.3, b.max.z, 'S', 0.9, 0.24, STYLE.gilt);
    const d = at('Upright display (back to back)');
    const dx0 = d.min.x - X, dx1 = d.max.x - X;
    // A velvet backboard (facing north) with two upright models on its south side.
    bx(dx0, 0, d.min.z, dx1, d.max.y, d.min.z + 0.3, M.velvet, true);
    bx(dx0 - 0.02, d.max.y - 0.08, d.min.z - 0.02, dx1 + 0.02, d.max.y, d.min.z + 0.32, M.gold);
    sign([{ t: 'STANDING ROOM ONLY', s: 1 }, { t: 'our upright range', s: 0.7 }], (dx0 + dx1) / 2, 1.7, d.min.z - 0.002, 'N', 1.3, 0.36, STYLE.gilt);
    sign([{ t: 'PLEASE DO NOT', s: 1 }, { t: 'LIE IN THE', s: 1 }, { t: 'DISPLAY MODELS', s: 1 }], (dx0 + dx1) / 2, 0.85, d.min.z - 0.002, 'N', 0.8, 0.5, STYLE.notice);
    const wd = (dx1 - dx0) / 2 - 0.04;
    uprightCoffin(dx0 + wd / 2 + 0.03, d.min.z + 0.3 + (d.max.z - d.min.z - 0.3) / 2, 'S', d.max.y - 0.05, wd, d.max.z - d.min.z - 0.3, mat('#2a1a14', { rough: 0.3 }), { panel: M.brass, plate: 'NOIR' });
    uprightCoffin(dx1 - wd / 2 - 0.03, d.min.z + 0.3 + (d.max.z - d.min.z - 0.3) / 2, 'S', d.max.y - 0.05, wd, d.max.z - d.min.z - 0.3, M.walnut, { clock: true });
    tag([{ t: 'THE GRANDFATHER', s: 1 }, { t: '£4,250', s: 1 }, { t: 'he had all the time in the world', s: 0.55 }], dx1 + 0.35, d.max.z + 0.25, 'S');
  }
  // The Eternal Rest Deluxe: open, tufted satin, gold handles. Lid sold separately.
  {
    const b = at('The Eternal Rest Deluxe');
    flatCoffin(b, 0, M.mahogany, M.mahogany, 0.5, { trim: M.gold, open: true });
    tag([{ t: 'ETERNAL REST DELUXE', s: 1 }, { t: '£12,500', s: 1.1 }, { t: '(lid sold separately)', s: 0.6 }], b.min.x - X - 0.45, b.min.z + 0.4, 'W');
  }
  // The cheap end: The Pauper on sawhorses, the Flat-Pack on a pallet, the Eco Wicker.
  {
    const b = at('The Pauper');
    const cx = (b.min.x + b.max.x) / 2 - X;
    for (const z of [b.min.z + 0.4, b.max.z - 0.4]) {
      bx(cx - 0.32, 0.4, z - 0.04, cx + 0.32, 0.46, z + 0.04, M.pine, true);
      for (const s of [-1, 1]) bx(cx + s * 0.25 - 0.025, 0, z - 0.025, cx + s * 0.25 + 0.025, 0.4, z + 0.025, M.pine, true);
    }
    const box2 = mat('#e0c08a', { rough: 0.9 });
    bx(cx - 0.33, 0.46, b.min.z + 0.02, cx + 0.33, b.max.y - 0.02, b.max.z - 0.02, box2, true);
    bx(cx - 0.34, b.max.y - 0.03, b.min.z, cx + 0.34, b.max.y, b.max.z, M.pine, true);
    sign([{ t: 'THIS WAY UP', s: 1 }, { t: '↑', s: 1.4 }], cx, b.max.y + 0.002, (b.min.z + b.max.z) / 2, 'up', 0.55, 0.45, { bg: null, fg: '#2a2a2a', bold: true, sans: true });
    tag([{ t: 'THE PAUPER', s: 1.1 }, { t: '£49.99', s: 1 }, { t: 'nails extra', s: 0.6 }], cx, b.min.z - 0.25, 'N');
    const f = at('The Flat-Pack');
    const fx = (f.min.x + f.max.x) / 2 - X;
    bx(fx - 0.35, 0, f.min.z, fx + 0.35, 0.12, f.max.z, M.pine, true);
    for (let i = 0; i < 4; i++) {
      const y = 0.12 + i * 0.195;
      bx(fx - 0.33 + (i % 2) * 0.02, y, f.min.z + 0.04 + (i % 2) * 0.03, fx + 0.33 - (i % 2) * 0.02, y + 0.19, f.max.z - 0.05, M.cardboard, true);
    }
    sign([{ t: 'SÖVNA', s: 1.4, c: '#1a3a8a' }, { t: 'flat-pack coffin', s: 0.8 }, { t: 'some assembly required', s: 0.6 }, { t: '1 × Allen key included', s: 0.6 }], fx, f.max.y + 0.002, (f.min.z + f.max.z) / 2, 'up', 0.6, 1.4, { bg: '#c89a64', fg: '#2a2a2a', sans: true, bold: true });
    v.add(boxMesh(wx(fx) + 0.1, f.max.y, f.min.z + 0.3, wx(fx) + 0.13, f.max.y + 0.02, f.min.z + 0.55, M.steel));
    tag([{ t: 'THE FLAT-PACK', s: 1.1 }, { t: '£89', s: 1 }, { t: 'you do the screws', s: 0.6 }], fx + 0.3, f.min.z - 0.25, 'N');
    const e = at('The Eco Wicker');
    flatCoffin(e, Math.PI, mat('#ffffff', { map: wicker(), rough: 0.95 }), mat('#ffffff', { map: wicker(), rough: 0.95 }), 0.2);
    const ex = (e.min.x + e.max.x) / 2 - X;
    for (let i = 0; i < 6; i++) ball(ex - 0.12 + (i % 3) * 0.12, e.max.y + 0.04, e.min.z + 0.6 + Math.floor(i / 3) * 0.12, 0.06, M.leaf, 6);
    tag([{ t: 'THE ECO WICKER', s: 1.1 }, { t: '£650', s: 1 }, { t: 'compost by Christmas', s: 0.6 }], ex - 0.1, e.max.z + 0.3, 'S');
  }
  // The novelty-urn cabinet (tall: good for lurking behind), facing the east lane.
  {
    const b = at('Upright display south');
    const x0 = b.min.x - X, x1 = b.max.x - X, z0 = b.min.z, z1 = b.max.z;
    bx(x0, 0, z0, x0 + 0.08, b.max.y, z1, M.mahogany, true);
    bx(x0, 0, z0, x1, b.max.y, z0 + 0.06, M.mahogany, true);
    bx(x0, 0, z1 - 0.06, x1, b.max.y, z1, M.mahogany, true);
    bx(x0, 0, z0, x1, 0.2, z1, M.mahoganyDark, true);
    bx(x0 - 0.02, b.max.y - 0.1, z0 - 0.02, x1 + 0.02, b.max.y, z1 + 0.02, M.mahoganyDark, true);
    bx(x0 + 0.08, 0.2, z0 + 0.06, x0 + 0.1, b.max.y - 0.1, z1 - 0.06, M.velvet, true);
    const urnMats = [M.brass, mat('#2a4a8a', { rough: 0.3 }), mat('#e8e0d0', { rough: 0.3 }), mat('#3a6a3a', { rough: 0.4 }), mat('#a02a2a', { rough: 0.3 }), M.chrome];
    for (let s = 0; s < 3; s++) {
      const y = 0.2 + s * 0.62;
      bx(x0 + 0.08, y + 0.6, z0 + 0.06, x1, y + 0.63, z1 - 0.06, M.mahoganyDark, true);
      for (let i = 0; i < 3; i++) {
        const z = z0 + 0.35 + i * 0.55, xm = (x0 + x1) / 2 + 0.05, k = s * 3 + i;
        const m = urnMats[k % urnMats.length];
        if (k === 1) { // a teapot
          ball(xm, y + 0.15, z, 0.13, m, 10); cyl(xm, y + 0.27, z, 0.04, 0.05, m, 8);
          const spout = cyl(xm + 0.15, y + 0.12, z, 0.02, 0.18, m, 6); spout.rotation.z = -0.8;
        } else if (k === 4) { // a football
          ball(xm, y + 0.13, z, 0.13, mat('#f4f4f4', { rough: 0.5 }), 12); ball(xm + 0.09, y + 0.18, z - 0.05, 0.04, M.black, 5);
        } else if (k === 6) { // a garden gnome
          cyl(xm, y, z, 0.08, 0.18, mat('#2a5aa0'), 8, 0.06); ball(xm, y + 0.24, z, 0.06, mat('#f0c8a8'), 8);
          const hat = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.2, 8), mat('#c82a2a')); hat.position.set(wx(xm), y + 0.38, z); v.add(hat);
        } else if (k === 8) { // a golf bag
          cyl(xm, y, z, 0.08, 0.38, mat('#2a6a3a', { rough: 0.6 }), 10);
          for (const d of [-0.03, 0.03]) cyl(xm + d, y + 0.38, z + d, 0.012, 0.15, M.chrome, 5);
        } else { // a classic urn
          cyl(xm, y, z, 0.07, 0.06, m, 10);
          cyl(xm, y + 0.06, z, 0.07, 0.2, m, 12, 0.12);
          cyl(xm, y + 0.26, z, 0.12, 0.08, m, 12, 0.06);
          ball(xm, y + 0.36, z, 0.04, m, 6);
        }
      }
    }
    sign([{ t: 'NOVELTY URNS', s: 1 }, { t: 'why not be a teapot?', s: 0.65 }], x1 + 0.002, b.max.y + 0.2, (z0 + z1) / 2, 'E', 1.2, 0.34, STYLE.gilt);
  }
  // Urns on plinths along the shop window.
  for (const label of ['Urn plinth SW', 'Urn plinth S', 'Urn plinth SE']) {
    const b = at(label);
    plinth(b, mat('#d8cfc0', { rough: 0.35 }));
    const x = (b.min.x + b.max.x) / 2 - X, z = (b.min.z + b.max.z) / 2, y = b.max.y;
    const m = label.endsWith('SW') ? M.brass : label.endsWith('SE') ? mat('#2a3a6a', { rough: 0.25 }) : mat('#5a1a4a', { rough: 0.25 });
    cyl(x, y, z, 0.09, 0.06, m, 12);
    cyl(x, y + 0.06, z, 0.09, 0.28, m, 14, 0.16);
    cyl(x, y + 0.34, z, 0.16, 0.1, m, 14, 0.08);
    ball(x, y + 0.47, z, 0.05, m, 8);
  }
  // Walls: the big offer, handle samples, today's special; the shop windows.
  sign([{ t: 'BUY ONE,', s: 1 }, { t: 'BURY ONE FREE!', s: 1 }, { t: 'selected models only · while stocks last', s: 0.35, c: '#3a1a1a' }], -12.99, 2.05, 2.4, 'E', 2.4, 1.1, STYLE.retail);
  {
    bx(-13, 1.0, 5.6, -12.97, 1.9, 7.4, M.velvet);
    sign([{ t: 'HANDLES', s: 1 }], -12.965, 1.78, 6.5, 'E', 0.8, 0.16, STYLE.cut);
    const hm = [M.brass, M.chrome, M.gold, mat('#4a8a3a', { rough: 0.5 })];
    const names = ['Brass', 'Silver', 'Gold', 'Ironic'];
    for (let i = 0; i < 4; i++) {
      const z = 5.85 + i * 0.43;
      bx(-12.97, 1.38, z - 0.15, -12.93, 1.42, z + 0.15, hm[i]);
      bx(-12.97, 1.3, z - 0.15, -12.94, 1.42, z - 0.12, hm[i]);
      bx(-12.97, 1.3, z + 0.12, -12.94, 1.42, z + 0.15, hm[i]);
      sign([names[i]], -12.965, 1.17, z, 'E', 0.36, 0.1, { bg: null, fg: '#e8d8c0', italic: true });
    }
  }
  bx(-5.2, 0.9, -0.4, -5.15, 2.1, 1.3, M.mahoganyDark);
  sign([{ t: "TODAY'S SPECIAL", s: 1 }, { t: 'The Eternal Rest Deluxe', s: 0.8 }, { t: '10% off!', s: 1.2, c: '#f0c040' }, { t: '(offer ends when you do)', s: 0.6 }], -5.205, 1.5, 0.45, 'W', 1.55, 1.05, STYLE.chalk);
  pane(-12.99, 1.65, 0.4, 'E', 1.1, 1.3, M.mahoganyDark);
  pane(-9.0, 1.95, 8.99, 'N', 2.4, 1.25, M.mahoganyDark);
  sign([{ t: 'PETTIGREW & SONS', s: 1 }, { t: 'Coffins · Caskets · Closure', s: 0.6 }], -9.0, 2.75, 8.99, 'N', 2.4, 0.4, STYLE.gilt);
  sign([{ t: 'STAFF ONLY', s: 1.2 }, { t: 'ABSOLUTELY NO RELATIVES', s: 0.8 }], -7.5, 2.62, -2.34, 'S', 1.6, 0.34, STYLE.staff);
  sign([{ t: 'CHAPEL OF REST', s: 1 }, { t: 'quiet please · Nana is choosing', s: 0.6 }], -5.16, 2.65, 3.9, 'W', 1.7, 0.36, STYLE.gilt);
  sign([{ t: 'SHOWROOM', s: 1 }, { t: 'browsing welcome', s: 0.6 }], -4.84, 2.65, 3.9, 'E', 1.4, 0.32, STYLE.gilt);
  // Track spots on the showroom ceiling.
  for (const [x, z] of [[-10.8, 0.6], [-7.5, 0.5], [-10.4, 5.8], [-7.8, 5.8], [-9.0, 3.4]]) {
    cyl(x, SH - 0.12, z, 0.07, 0.12, M.black, 10, 0.05);
    cyl(x, SH - 0.13, z, 0.05, 0.01, M.bulb, 10);
  }

  // ════════════ Preparation Room (staff only) ════════════
  {
    const t = at('Mortuary table');
    const x0 = t.min.x - X, x1 = t.max.x - X, z0 = t.min.z, z1 = t.max.z, h = t.max.y;
    bx(x0, h - 0.06, z0, x1, h, z1, M.steel, true);
    bx(x0 + 0.03, h - 0.02, z0 + 0.03, x1 - 0.03, h - 0.005, z1 - 0.03, mat('#9aaab4', { rough: 0.2, metal: 0.8 }));
    bx((x0 + x1) / 2 - 0.2, 0, (z0 + z1) / 2 - 0.2, (x0 + x1) / 2 + 0.2, h - 0.06, (z0 + z1) / 2 + 0.2, M.steel, true);
    bx(x0 + 0.2, 0, z0 + 0.15, x1 - 0.2, 0.06, z1 - 0.15, M.steel, true);
    // A neatly folded sheet and a pre-printed toe tag.
    bx(x1 - 0.55, h, z0 + 0.15, x1 - 0.12, h + 0.08, z1 - 0.15, M.cloth);
    sign([{ t: 'TOE TAG', s: 0.8 }, { t: 'Mrs Harrowgate', s: 1 }, { t: 'date: TBC', s: 0.8 }], x0 + 0.5, h + 0.003, (z0 + z1) / 2, 'up', 0.3, 0.16, { bg: '#f2e8c8', fg: '#2a2a2a', border: '#8a7a50', sans: true });
    const f = at('Refrigerated drawers');
    const fx0 = f.min.x - X, fx1 = f.max.x - X;
    bx(fx0, 0, f.min.z, fx1, f.max.y, f.max.z, M.steel, true);
    const cols = 3, rows = 3, dw = (fx1 - fx0) / cols, dh = (f.max.y - 0.2) / rows;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const xa = fx0 + c * dw + 0.05, xb = fx0 + (c + 1) * dw - 0.05, ya = 0.15 + r * dh + 0.04, yb = 0.15 + (r + 1) * dh - 0.04;
      bx(xa, ya, f.max.z, xb, yb, f.max.z + 0.03, mat('#cfd8de', { rough: 0.25, metal: 0.7 }));
      bx((xa + xb) / 2 - 0.2, yb - 0.16, f.max.z + 0.03, (xa + xb) / 2 + 0.2, yb - 0.12, f.max.z + 0.07, M.chrome);
      const reserved = c === 1 && r === 1;
      sign([reserved ? 'RESERVED' : ['vacant', 'vacant', 'Mr P. Snr (on break)', 'vacant', 'RESERVED', 'vacant', 'vacant', 'vacant', 'out of order'][c * 3 + r]], (xa + xb) / 2, ya + 0.18, f.max.z + 0.032, 'S', 0.4, 0.1, reserved ? STYLE.staff : STYLE.white);
    }
    const s = at('Sink and cosmetics bench');
    const sx0 = s.min.x - X, sx1 = s.max.x - X;
    bx(sx0, 0, s.min.z, sx1, s.max.y - 0.05, s.max.z, mat('#c8d4da', { rough: 0.3, metal: 0.4 }), true);
    bx(sx0, s.max.y - 0.05, s.min.z - 0.02, sx1, s.max.y, s.max.z, M.steel, true);
    bx(sx0 + 0.3, s.max.y - 0.04, s.min.z + 0.1, sx0 + 0.9, s.max.y + 0.005, s.max.z - 0.1, mat('#8a9aa4', { rough: 0.2, metal: 0.8 }));
    cyl(sx0 + 0.6, s.max.y, s.max.z - 0.05, 0.02, 0.35, M.chrome, 6);
    bx(sx0 + 0.58, s.max.y + 0.33, s.min.z + 0.3, sx0 + 0.62, s.max.y + 0.36, s.max.z - 0.05, M.chrome);
    // Cosmetics: lipsticks, powder, a hairdryer.
    const lip = [mat('#c8203a'), mat('#e87a8a'), mat('#8a2a4a'), mat('#f0b0a0')];
    for (let i = 0; i < 4; i++) cyl(sx0 + 1.2 + i * 0.12, s.max.y, s.min.z + 0.2, 0.025, 0.1, lip[i], 8);
    cyl(sx0 + 1.8, s.max.y, s.min.z + 0.3, 0.09, 0.04, mat('#f0d0c0'), 12);
    ball(sx0 + 1.8, s.max.y + 0.06, s.min.z + 0.3, 0.06, M.lily, 8);
    bx(sx0 + 2.1, s.max.y, s.min.z + 0.15, sx0 + 2.35, s.max.y + 0.08, s.min.z + 0.3, mat('#e87aa8'));
    sign([{ t: 'MAKE-UP CHART', s: 1 }, { t: 'Peaceful', s: 0.8, c: '#d89aa0' }, { t: 'Very Peaceful', s: 0.8, c: '#c87a8a' }, { t: 'Asleep in Church', s: 0.8, c: '#a85a6a' }, { t: 'Sunday Best', s: 0.8, c: '#8a3a4a' }],
      (sx0 + sx1) / 2 - 0.3, 1.75, -2.66, 'N', 0.9, 0.75, STYLE.white);
    const tr = at('Trolley');
    const tx0 = tr.min.x - X, tx1 = tr.max.x - X;
    bx(tx0, tr.max.y - 0.05, tr.min.z, tx1, tr.max.y, tr.max.z, M.steel, true);
    bx(tx0 + 0.1, tr.max.y, tr.min.z + 0.05, tx1 - 0.3, tr.max.y + 0.06, tr.max.z - 0.05, M.cloth);
    for (const xx of [tx0 + 0.08, tx1 - 0.08]) for (const zz of [tr.min.z + 0.06, tr.max.z - 0.06]) {
      bx(xx - 0.02, 0.1, zz - 0.02, xx + 0.02, tr.max.y - 0.05, zz + 0.02, M.chrome, true);
      ball(xx, 0.06, zz, 0.06, M.rubber, 8);
    }
  }
  // The loading bay: the roller door half up, the hearse's back end filling it.
  {
    const hb = at('The hearse (back end)');
    const z0 = hb.min.z, z1 = hb.max.z, top = hb.max.y;
    // Rolled-up shutter and its drum, hazard stripes on the jambs.
    const shutter = mat('#ffffff', { map: corrugated(), rough: 0.5, metal: 0.4 });
    bx(-12.99, top, z0 - 0.05, -12.95, SH - 0.25, z1 + 0.05, shutter, false, 0.5);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, z1 - z0 + 0.2, 12), M.steel);
    drum.rotation.x = Math.PI / 2;
    drum.position.set(wx(-12.83), SH - 0.2, (z0 + z1) / 2);
    v.add(drum);
    for (const z of [z0 - 0.15, z1 + 0.05]) {
      for (let i = 0; i < 6; i++) bx(-12.99, i * 0.32, z, -12.95, i * 0.32 + 0.16, z + 0.1, M.hazard);
      for (let i = 0; i < 6; i++) bx(-12.99, i * 0.32 + 0.16, z, -12.95, i * 0.32 + 0.32, z + 0.1, M.black);
    }
    sign([{ t: 'LOADING BAY', s: 1 }, { t: 'hearses only · keep clear', s: 0.6 }], -12.99, SH - 0.15 - 0.3, z0 - 0.95, 'E', 0.9, 0.3, { bg: '#e8c030', fg: '#1a1a1a', border: '#1a1a1a', sans: true, bold: true });
    // Rubber dock seals fill the gap round the hearse.
    bx(-13.0, 0, z0, -12.5, top, z0 + 0.12, M.rubber, true);
    bx(-13.0, 0, z1 - 0.12, -12.5, top, z1, M.rubber, true);
    bx(-13.0, top - 0.14, z0, -12.5, top, z1, M.rubber, true);
    // The hearse: rear in the bay, the rest of it parked in the yard.
    const hz0 = z0 + 0.15, hz1 = z1 - 0.15, hl = -18.1;
    bx(hl, 0.35, hz0, -12.55, 0.95, hz1, M.black, true);
    bx(hl + 1.7, 0.95, hz0 + 0.08, -12.6, 1.62, hz1 - 0.08, M.glassDark, true);
    bx(hl + 1.65, 1.6, hz0 + 0.05, -12.58, 1.68, hz1 - 0.05, M.black, true);
    bx(hl + 1.05, 0.95, hz0 + 0.12, hl + 1.75, 1.52, hz1 - 0.12, M.glassDark, true);
    bx(hl - 0.05, 0.3, hz0 - 0.02, hl + 0.05, 0.5, hz1 + 0.02, M.chrome);
    bx(-12.6, 0.3, hz0 - 0.02, -12.5, 0.45, hz1 + 0.02, M.chrome);
    for (const x of [hl + 1.7, hl + 3.0, hl + 4.3]) for (const z of [hz0 - 0.005, hz1 + 0.005]) bx(x - 0.03, 0.95, z - 0.01, x + 0.03, 1.62, z + 0.01, M.chrome);
    for (const x of [hl + 0.75, -13.9]) for (const z of [hz0 + 0.05, hz1 - 0.05]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16), M.rubber);
      w.rotation.x = Math.PI / 2;
      w.position.set(wx(x), 0.34, z);
      v.add(w);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.25, 12), M.chrome);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(wx(x), 0.34, z);
      v.add(hub);
    }
    for (const z of [hz0 + 0.2, hz1 - 0.2]) ball(hl - 0.02, 0.75, z, 0.08, M.bulb, 8);
    // Floral tribute in the side window and the livery on the doors (seen from the yard).
    const nana = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), mat('#ffffff', { map: floralTex('NANA', '#20262e'), rough: 0.6 }));
    v.add(orient(nana, -15.0, 1.25, hz1 + 0.002, 'S'));
    sign([{ t: 'PETTIGREW & SONS', s: 1 }, { t: 'we’ll see you soon', s: 0.6 }], -15.2, 0.68, hz1 + 0.003, 'S', 2.2, 0.36, { bg: null, fg: '#e2b84e', bold: true });
    // The open back: rollers, the floral tribute lying inside, a bumper sticker.
    bx(-12.56, 0.45, hz0 + 0.1, -12.54, 1.58, hz1 - 0.1, mat('#1a1418', { rough: 0.9 }));
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.32), mat('#ffffff', { map: floralTex('NANA', '#3a2a30'), rough: 0.6 }));
    v.add(orient(inside, -12.535, 0.75, (hz0 + hz1) / 2, 'E'));
    for (const y of [0.5, 0.55]) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, hz1 - hz0 - 0.3, 6), M.chrome);
      roller.rotation.x = Math.PI / 2;
      roller.position.set(wx(-12.53), y, (hz0 + hz1) / 2);
      v.add(roller);
    }
    bx(-12.6, 1.6, hz0, -12.2, 1.66, hz1, M.black);
    sign(['MY OTHER CAR IS ALSO A HEARSE'], -12.495, 0.38, (hz0 + hz1) / 2, 'E', 0.9, 0.1, { bg: '#f2f2ea', fg: '#1a1a1a', sans: true, bold: true });
  }
  sign([{ t: 'STAFF ONLY', s: 1.2 }, { t: 'ABSOLUTELY NO RELATIVES', s: 0.8 }], -7.5, 2.62, -2.66, 'N', 1.6, 0.34, STYLE.staff);
  sign([{ t: 'STAFF ONLY', s: 1.2 }, { t: 'ABSOLUTELY NO RELATIVES', s: 0.8 }], -4.84, 2.65, -8.3, 'E', 1.5, 0.32, STYLE.staff);
  sign([{ t: 'Awaiting collection', s: 1 }, { t: 'please do not dust', s: 0.7 }], -5.16, 1.45, -5.1, 'W', 0.6, 0.18, STYLE.white);
  sign([{ t: 'CAUTION', s: 1.1 }, { t: 'cold hands', s: 0.8 }], -5.16, 1.6, -3.4, 'W', 0.42, 0.3, { bg: '#f2d040', fg: '#1a1a1a', border: '#1a1a1a', sans: true, bold: true });
  pane(-7.5, 2.2, -9.49, 'S', 1.2, 0.6, M.lily);
  // Fluorescent tubes.
  for (const z of [-7.2, -4.6]) {
    bx(-10.4, SH - 0.06, z - 0.08, -7.6, SH, z + 0.08, M.lily);
    bx(-10.3, SH - 0.09, z - 0.05, -7.7, SH - 0.06, z + 0.05, M.tube);
  }

  // ════════════ Back Corridor ════════════
  bx(-4.85, 0.95, -9.5, 4.85, 1.0, -9.47, M.mahoganyDark);
  bx(-3.1, 0.95, -7.28, 4.85, 1.0, -7.25, M.mahoganyDark);
  for (const x of [-2.5, 1.8]) {
    bx(x - 0.7, SH - 0.06, -8.42, x + 0.7, SH, -8.28, M.lily);
    bx(x - 0.65, SH - 0.09, -8.39, x + 0.65, SH - 0.06, -8.31, M.tube);
  }
  sign([{ t: 'DAYS SINCE LAST', s: 0.8 }, { t: 'MIX-UP', s: 1 }, { t: '0', s: 2.2, c: '#c8102e' }], -1.2, 1.7, -9.49, 'S', 0.75, 0.75, STYLE.white);
  sign([{ t: 'HEARSE ROTA', s: 1 }, { t: 'Mon — Mr Pettigrew', s: 0.7 }, { t: 'Tue — Mr Pettigrew', s: 0.7 }, { t: 'Wed — the other Mr Pettigrew', s: 0.7 }, { t: 'Thu — NOT Nigel', s: 0.7 }],
    0.4, 1.65, -9.49, 'S', 1.1, 0.8, STYLE.white);
  // Spare lids leaning on the wall, coat pegs with top hats.
  for (const [x, m] of [[2.6, M.mahogany], [2.95, M.walnut], [3.3, M.pine]] as [number, THREE.Material][]) {
    const lid = new THREE.Mesh(extrude(coffinShape(1.95, 0.6), 0.05), m);
    lid.position.set(wx(x), 1.0, -9.45);
    lid.rotation.x = -0.1;
    v.add(lid);
  }
  for (let i = 0; i < 4; i++) {
    const x = 0.9 + i * 0.5;
    bx(x - 0.02, 1.7, -7.37, x + 0.02, 1.74, -7.25, M.brass);
    if (i % 2 === 0) {
      cyl(x, 1.62, -7.33, 0.13, 0.03, M.black, 12);
      cyl(x, 1.65, -7.33, 0.09, 0.2, M.black, 12);
    } else {
      bx(x - 0.2, 0.75, -7.36, x + 0.2, 1.7, -7.26, M.blackMatte);
    }
  }
  sign([{ t: 'VESTRY', s: 1 }, { t: 'private', s: 0.6 }], -3.95, 2.6, -6.94, 'S', 0.9, 0.28, STYLE.gilt);
  sign([{ t: 'CHAPEL', s: 1 }, { t: 'smile, you are on duty', s: 0.55 }], -3.95, 2.62, -7.26, 'N', 1.0, 0.3, STYLE.white);
  // Tie-back curtains either side of the vestry door (chapel side).
  for (const x of [-4.78, -3.18]) cyl(x, 0, -6.86, 0.12, 2.45, mat('#6a1e56', { rough: 0.95 }), 10, 0.07);
  bx(-4.85, 2.4, -6.92, -3.1, 2.55, -6.82, M.gold);

  // ════════════ Arrangements Office ════════════
  {
    const d = at("Mr Pettigrew's desk");
    const x0 = d.min.x - X, x1 = d.max.x - X, z0 = d.min.z, z1 = d.max.z, h = d.max.y;
    bx(x0, h - 0.05, z0, x1, h, z1, M.mahogany, true);
    bx(x0, 0, z0 + 0.05, x0 + 0.55, h - 0.05, z1 - 0.05, M.mahoganyDark, true);
    bx(x1 - 0.55, 0, z0 + 0.05, x1, h - 0.05, z1 - 0.05, M.mahoganyDark, true);
    bx(x0 + 0.55, 0.3, z1 - 0.08, x1 - 0.55, h - 0.05, z1 - 0.05, M.mahogany, true);
    bx(x0 + 0.6, h, z0 + 0.2, x0 + 1.3, h + 0.01, z1 - 0.15, mat('#2a5a3a', { rough: 0.9 }));
    // Green banker's lamp.
    cyl(x0 + 0.25, h, z0 + 0.25, 0.08, 0.03, M.brass, 10);
    cyl(x0 + 0.25, h, z0 + 0.25, 0.012, 0.3, M.brass, 6);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.12, 10, 1, false, 0, Math.PI), mat('#1e6a3a', { rough: 0.3, emissive: '#2a7a3a', emissiveIntensity: 0.6 }));
    shade.position.set(wx(x0 + 0.25), h + 0.33, z0 + 0.25);
    shade.rotation.y = Math.PI / 2;
    v.add(shade);
    ball(x0 + 0.25, h + 0.3, z0 + 0.27, 0.03, M.bulb, 6);
    // The hearse-shaped money box, in-tray and out-tray, a desk plate, a telephone.
    bx(x1 - 0.65, h, z0 + 0.3, x1 - 0.25, h + 0.09, z0 + 0.48, M.black);
    bx(x1 - 0.55, h + 0.09, z0 + 0.31, x1 - 0.28, h + 0.16, z0 + 0.47, M.glassDark);
    for (const xx of [x1 - 0.58, x1 - 0.32]) for (const zz of [z0 + 0.3, z0 + 0.48]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8), M.rubber);
      w.rotation.x = Math.PI / 2; w.position.set(wx(xx), h + 0.02, zz); v.add(w);
    }
    bx(x1 - 0.45, h + 0.16, z0 + 0.38, x1 - 0.38, h + 0.162, z0 + 0.4, M.gold);
    sign(['FUNERAL FUND'], x1 - 0.45, h + 0.05, z0 + 0.485, 'S', 0.26, 0.05, { bg: null, fg: '#e2b84e', bold: true, sans: true });
    for (const [xx, label] of [[x0 + 1.55, 'PENDING'], [x0 + 1.95, 'DEPARTED']] as [number, string][]) {
      bx(xx - 0.17, h, z0 + 0.15, xx + 0.17, h + 0.06, z0 + 0.45, mat('#c8a060', { rough: 0.6 }));
      bx(xx - 0.14, h + 0.06, z0 + 0.18, xx + 0.14, h + 0.08, z0 + 0.42, M.cloth);
      sign([label], xx, h + 0.03, z0 + 0.452, 'S', 0.3, 0.05, { bg: null, fg: '#2a1a10', bold: true, sans: true });
    }
    sign([{ t: 'MR PETTIGREW', s: 1 }, { t: '(the younger)', s: 0.6 }], (x0 + x1) / 2 + 0.2, h + 0.06, z1 + 0.002, 'S', 0.5, 0.12, STYLE.plaque);
    bx(x0 + 0.95, h, z0 + 0.6, x0 + 1.2, h + 0.06, z0 + 0.78, M.black);
    // His chair.
    const c = at("Mr Pettigrew's chair");
    const cx0 = c.min.x - X, cx1 = c.max.x - X;
    const leather = mat('#3a1a14', { rough: 0.5 });
    bx(cx0, 0.4, c.min.z, cx1, 0.52, c.max.z, leather, true);
    bx(cx0, 0.52, c.min.z, cx1, c.max.y, c.min.z + 0.12, leather, true);
    cyl((cx0 + cx1) / 2, 0, (c.min.z + c.max.z) / 2, 0.04, 0.4, M.chrome, 6, 0.04, true);
    cyl((cx0 + cx1) / 2, 0, (c.min.z + c.max.z) / 2, 0.28, 0.04, M.chrome, 10, 0.28, true);
    // Filing cabinets of wills.
    const f = at('Filing cabinets (wills)');
    const n = 3, span = (f.max.z - f.min.z) / n;
    const labels = [['WILLS A–M', 'WILLS N–Z', 'CODICILS'], ['CONTESTED', 'VERY CONTESTED', 'SEALED (NANA)'], ['DISINHERITED', 'MISC. FEUDS', 'DO NOT OPEN']];
    for (let i = 0; i < n; i++) {
      const za = f.min.z + i * span + 0.02, zb = f.min.z + (i + 1) * span - 0.02;
      bx(f.min.x - X, 0, za, f.max.x - X, f.max.y, zb, M.filing, true);
      for (let r = 0; r < 3; r++) {
        const ya = 0.06 + r * 0.46, yb = ya + 0.42;
        bx(f.min.x - X - 0.02, ya, za + 0.04, f.min.x - X, yb, zb - 0.04, mat('#5a7a68', { rough: 0.45, metal: 0.3 }));
        bx(f.min.x - X - 0.05, yb - 0.12, (za + zb) / 2 - 0.12, f.min.x - X - 0.02, yb - 0.09, (za + zb) / 2 + 0.12, M.chrome);
        sign([labels[i][r]], f.min.x - X - 0.021, yb - 0.22, (za + zb) / 2, 'W', 0.36, 0.08, STYLE.white);
      }
    }
    // The brochure rack.
    const b = at('Brochure rack');
    bx(b.min.x - X, 0, b.min.z, b.max.x - X, b.max.y, b.max.z, M.mahogany, true);
    const titles: [string, string][] = [['Pre-need Planning', 'Why Wait?'], ['So You’re Dying', 'a beginner’s guide'], ['Coffins & You', 'finding the one'], ['Is It Your Turn?', 'a quiz'], ['Grief on a Budget', ''], ['Urns for Every Mantel', '']];
    const bc = ['#e8d8a0', '#a0c8e0', '#e0a0b0', '#c0e0a0', '#f0f0e0', '#d0b0e0'];
    for (let i = 0; i < 6; i++) {
      const row = Math.floor(i / 2), col = i % 2;
      const y = 0.35 + row * 0.45, z = b.min.z + 0.5 + col * 1.0;
      bx(b.max.x - X, y - 0.04, z - 0.4, b.max.x - X + 0.08, y, z + 0.4, M.mahoganyDark);
      const br = signMesh([{ t: titles[i][0], s: 1 }, { t: titles[i][1] || 'Pettigrew & Sons', s: 0.7 }], 0.3, 0.38, { bg: bc[i], fg: '#2a1a2a', border: '#5a3a5a', bold: true });
      v.add(orient(br, b.max.x - X + 0.05, y + 0.19, z - 0.17 + 0.0, 'E'));
      const br2 = signMesh([{ t: titles[i][0], s: 1 }, { t: titles[i][1] || 'Pettigrew & Sons', s: 0.7 }], 0.3, 0.38, { bg: bc[i], fg: '#2a1a2a', border: '#5a3a5a', bold: true });
      v.add(orient(br2, b.max.x - X + 0.05, y + 0.19, z + 0.17, 'E'));
    }
    sign([{ t: 'PRE-NEED PLANNING', s: 1 }, { t: 'Why Wait?', s: 1.2, c: '#7a1430' }], b.max.x - X - 0.1, b.max.y + 0.15, (b.min.z + b.max.z) / 2, 'E', 1.4, 0.26, STYLE.card);
    // The bookcase, the Employee of the Month, the ticket machine, the suggestion box, the clock.
    const k = at('Bookcase');
    bx(k.min.x - X, 0, k.min.z, k.max.x - X, k.max.y, k.max.z, M.mahogany, true);
    const spines = [mat('#6a1a2a'), mat('#1a2a4a'), mat('#2a4a2a'), mat('#8a6a2a'), mat('#3a1a3a')];
    for (let s = 0; s < 4; s++) {
      const y = 0.12 + s * 0.44;
      bx(k.min.x - X + 0.04, y - 0.02, k.max.z - 0.02, k.max.x - X - 0.04, y, k.max.z + 0.01, M.mahoganyDark);
      for (let i = 0; i < 9; i++) bx(k.min.x - X + 0.08 + i * 0.14, y, k.max.z - 0.3, k.min.x - X + 0.2 + i * 0.14, y + 0.28 + ((i * 7 + s) % 4) * 0.025, k.max.z, spines[(i + s) % 5]);
    }
    bx(6.9, 1.35, -9.5, 8.1, 2.65, -9.45, M.gold);
    bx(7.0, 1.45, -9.45, 8.0, 2.55, -9.43, mat('#d8d0c0'));
    ball(7.5, 2.15, -9.4, 0.17, mat('#e8c8a8'), 10);
    bx(7.3, 1.45, -9.43, 7.7, 1.95, -9.38, M.black);
    bx(7.0, 2.42, -9.43, 7.35, 2.55, -9.41, M.black);
    sign([{ t: 'EMPLOYEE OF THE MONTH', s: 0.9 }, { t: 'Mr Pettigrew (deceased)', s: 1 }], 7.5, 1.15, -9.49, 'S', 1.3, 0.24, STYLE.plaque);
    sign([{ t: 'NOW SERVING', s: 0.7 }, { t: '87', s: 1.6 }], 6.0, 2.35, -2.16, 'N', 0.5, 0.36, STYLE.led);
    bx(5.75, 1.15, -2.2, 6.05, 1.45, -2.15, mat('#c8202a'));
    sign(['TAKE A NUMBER'], 5.9, 1.55, -2.16, 'N', 0.44, 0.08, STYLE.notice);
    bx(5.16, 1.0, -3.6, 5.32, 1.35, -3.1, M.mahogany);
    sign([{ t: 'SUGGESTION BOX', s: 1 }], 5.33, 1.45, -3.35, 'E', 0.5, 0.1, STYLE.plaque);
    cyl(12.97, 2.12, -7.1, 0.2, 0.04, M.brass, 18).rotation.z = Math.PI / 2;
    sign([{ t: 'TEMPUS FUGIT', s: 0.5 }, { t: '(so do relatives)', s: 0.4 }], 12.94, 2.12, -7.1, 'W', 0.3, 0.3, { bg: '#f4eedc', fg: '#2a1a10' });
    pane(12.99, 1.6, -3.9, 'W', 0.9, 1.2, M.mahoganyDark);
    pane(9.0, 1.65, -9.49, 'S', 1.0, 1.1, M.mahoganyDark);
    sign([{ t: 'ARRANGEMENTS', s: 1 }, { t: 'Mr Pettigrew will see you now', s: 0.55 }], 9.1, 2.62, -1.84, 'S', 1.6, 0.32, STYLE.gilt);
    sign([{ t: 'WAKE ROOM', s: 1 }, { t: 'refreshments', s: 0.6 }], 9.1, 2.62, -2.16, 'N', 1.4, 0.32, STYLE.gilt);
  }

  // ════════════ Wake Room ════════════
  {
    const t = at('The buffet');
    const x0 = t.min.x - X, x1 = t.max.x - X, z0 = t.min.z, z1 = t.max.z, h = t.max.y;
    // A trestle under a white cloth that falls to the floor.
    bx(x0 - 0.04, h - 0.04, z0 - 0.04, x1 + 0.04, h, z1 + 0.04, M.cloth, true);
    bx(x0 - 0.03, 0.02, z0 - 0.03, x1 + 0.03, h - 0.04, z0 - 0.01, M.cloth, true);
    bx(x0 - 0.03, 0.02, z1 + 0.01, x1 + 0.03, h - 0.04, z1 + 0.03, M.cloth, true);
    bx(x0 - 0.03, 0.02, z0 - 0.03, x0 - 0.01, h - 0.04, z1 + 0.03, M.cloth, true);
    bx(x1 + 0.01, 0.02, z0 - 0.03, x1 + 0.03, h - 0.04, z1 + 0.03, M.cloth, true);
    bx(x0 + 0.1, h - 0.3, z0 + 0.1, x1 - 0.1, h - 0.04, z1 - 0.1, M.cloth, true);
    for (const z of [z0 - 0.04, z1 + 0.035]) bx(x0, h - 0.1, z, x1, h - 0.06, z + 0.005, mat('#5a1a4a'));
    // The cake: "NOT YET!"
    const cakeX = (x0 + x1) / 2, cakeZ = (z0 + z1) / 2;
    cyl(cakeX, h, cakeZ, 0.3, 0.02, M.chrome, 18);
    cyl(cakeX, h + 0.02, cakeZ, 0.26, 0.16, mat('#f4ece0', { rough: 0.6 }), 20);
    cyl(cakeX, h + 0.18, cakeZ, 0.19, 0.12, mat('#f4ece0', { rough: 0.6 }), 20);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ball(cakeX + Math.cos(a) * 0.255, h + 0.17, cakeZ + Math.sin(a) * 0.255, 0.022, mat('#5a1a4a'), 5); }
    const top = signMesh([{ t: 'NOT', s: 1 }, { t: 'YET!', s: 1 }], 0.3, 0.3, { bg: '#f4ece0', fg: '#5a1a4a', bold: true, italic: true });
    v.add(orient(top, cakeX, h + 0.302, cakeZ, 'up'));
    // Plates of curling sandwiches, sausage rolls, a trifle.
    const bread = mat('#f0dca8', { rough: 0.9 }), filling = mat('#c88a8a', { rough: 0.8 });
    for (const [px, pz] of [[x0 + 0.45, z0 + 0.35], [x1 - 0.45, z1 - 0.35], [x0 + 0.5, z1 - 0.35]]) {
      cyl(px, h, pz, 0.2, 0.015, M.lily, 16);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 3), i % 2 ? bread : filling);
        s.position.set(wx(px + Math.cos(a) * 0.09), h + 0.04, pz + Math.sin(a) * 0.09);
        s.rotation.set(0.35 * ((i % 3) - 1), a, 0.3);
        v.add(s);
      }
    }
    cyl(x1 - 0.5, h, z0 + 0.35, 0.2, 0.015, M.lily, 16);
    for (let i = 0; i < 4; i++) { const r2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), mat('#d89a4a')); r2.rotation.z = Math.PI / 2; r2.position.set(wx(x1 - 0.56 + (i % 2) * 0.12), h + 0.04 + Math.floor(i / 2) * 0.05, z0 + 0.32 + (i % 2) * 0.05); v.add(r2); }
    cyl(x0 + 1.05, h, z1 - 0.3, 0.12, 0.16, mat('#f4f0f0', { rough: 0.1 }), 14, 0.16);
    cyl(x0 + 1.05, h + 0.12, z1 - 0.3, 0.15, 0.05, mat('#e8c0d0'), 14);
    sign([{ t: 'Please take a sandwich', s: 1 }, { t: "they won't keep", s: 0.7 }], x1 - 1.05, h + 0.12, z1 - 0.25, 'S', 0.4, 0.15, STYLE.card).rotation.x = -0.4;
    // The banner over the buffet.
    sign([{ t: 'CELEBRATING THE LIFE OF MRS HARROWGATE', s: 1 }, { t: '(ongoing)', s: 0.7 }], cakeX, 2.55, z0 - 0.1, 'S', 3.0, 0.42, STYLE.gilt);
    for (const xx of [cakeX - 1.4, cakeX + 1.4]) bx(xx - 0.005, 2.76, z0 - 0.105, xx + 0.005, SH, z0 - 0.095, M.brass);
    // Sideboard with the tea urn and cups.
    const s = at('Sideboard (tea urn)');
    const sx0 = s.min.x - X, sx1 = s.max.x - X;
    bx(sx0, 0, s.min.z, sx1, s.max.y - 0.04, s.max.z, M.mahogany, true);
    bx(sx0 - 0.03, s.max.y - 0.04, s.min.z - 0.03, sx1, s.max.y, s.max.z + 0.03, M.mahoganyDark, true);
    for (const z of [s.min.z + 0.6, s.max.z - 0.6]) bx(sx0 - 0.01, 0.15, z - 0.5, sx0, s.max.y - 0.12, z + 0.5, M.mahoganyDark);
    const uz = s.max.z - 0.55;
    cyl((sx0 + sx1) / 2, s.max.y, uz, 0.2, 0.55, M.chrome, 16);
    cyl((sx0 + sx1) / 2, s.max.y + 0.55, uz, 0.2, 0.06, M.chrome, 16, 0.1);
    ball((sx0 + sx1) / 2, s.max.y + 0.64, uz, 0.04, M.black, 6);
    bx(sx0 - 0.08, s.max.y + 0.12, uz - 0.02, sx0 + 0.15, s.max.y + 0.15, uz + 0.02, M.black);
    sign(['TEA'], sx0 + 0.13, s.max.y + 0.4, uz, 'W', 0.2, 0.1, { bg: null, fg: '#1a1a1a', bold: true, sans: true });
    for (let i = 0; i < 4; i++) {
      const cz = s.min.z + 0.25 + i * 0.22;
      cyl((sx0 + sx1) / 2 - 0.08, s.max.y, cz, 0.07, 0.01, M.lily, 12);
      cyl((sx0 + sx1) / 2 - 0.08, s.max.y + 0.01, cz, 0.035, 0.06, M.lily, 10, 0.045);
    }
    // The settee, the coat stand, black balloons.
    const st = at('Settee');
    const plush = mat('#4a1a40', { rough: 0.95 });
    bx(st.min.x - X, 0.1, st.min.z, st.max.x - X, 0.45, st.max.z, plush, true);
    bx(st.min.x - X, 0.45, st.max.z - 0.22, st.max.x - X, st.max.y, st.max.z, plush, true);
    for (const ex of [st.min.x - X, st.max.x - X - 0.18]) bx(ex, 0.1, st.min.z, ex + 0.18, 0.65, st.max.z, plush, true);
    for (const ex of [st.min.x - X + 0.05, st.max.x - X - 0.1]) bx(ex, 0, st.min.z + 0.05, ex + 0.05, 0.1, st.min.z + 0.1, M.mahoganyDark);
    for (const cx of [st.min.x - X + 0.6, st.max.x - X - 0.6]) bx(cx - 0.25, 0.45, st.min.z + 0.15, cx + 0.25, 0.55, st.max.z - 0.22, mat('#6a2a5a', { rough: 0.95 }));
    sign([{ t: 'In Memory of', s: 0.8 }, { t: 'NOBODY YET', s: 1 }], (st.min.x + st.max.x) / 2 - X, 1.7, 8.99, 'N', 0.9, 0.3, STYLE.plaque);
    const cs = at('Coat stand and umbrella rack');
    const cx = (cs.min.x + cs.max.x) / 2 - X;
    bx(cx - 0.2, 0, cs.min.z, cx + 0.2, 0.55, cs.max.z, M.mahoganyDark, true);
    for (const z of [cs.min.z + 0.3, cs.max.z - 0.3]) {
      cyl(cx, 0.55, z, 0.025, 1.2, M.mahoganyDark, 6, 0.025, true);
      cyl(cx, 1.62, z, 0.15, 0.2, M.black, 12, 0.1);
      cyl(cx, 1.6, z, 0.22, 0.02, M.black, 12);
    }
    for (let i = 0; i < 3; i++) cyl(cx - 0.05 + (i % 2) * 0.1, 0.4, cs.min.z + 0.8 + i * 0.18, 0.02, 0.55, M.black, 5);
    pane(12.99, 1.65, 4.5, 'W', 1.1, 1.3);
    pane(7.4, 1.75, 8.99, 'N', 1.1, 1.1);
    sign([{ t: 'CHAPEL OF REST', s: 1 }, { t: 'mind the cousins', s: 0.6 }], 5.16, 2.65, 3.9, 'E', 1.6, 0.34, STYLE.gilt);
    sign([{ t: 'WAKE ROOM', s: 1 }, { t: 'refreshments', s: 0.6 }], 4.84, 2.65, 3.9, 'W', 1.4, 0.32, STYLE.gilt);
    // Framed photo: "In Loving Memory of Mrs Harrowgate (1931 – )".
    bx(10.4, 1.3, -1.84, 11.4, 2.3, -1.8, M.gold);
    bx(10.48, 1.38, -1.8, 11.32, 2.22, -1.78, mat('#c8b8a0'));
    ball(10.9, 1.92, -1.76, 0.15, mat('#e8c8a8'), 10);
    cyl(10.9, 2.0, -1.74, 0.17, 0.06, mat('#dcdcdc'), 10);
    sign([{ t: 'Mrs Harrowgate', s: 1 }, { t: '1931 –', s: 0.9 }], 10.9, 1.52, -1.775, 'S', 0.7, 0.2, { bg: null, fg: '#2a1a10', bold: true });
  }

  // ── Outside: the yard with its parking bay, the front path, the facade sign ──
  {
    const tarmac = mat('#6a6a70', { rough: 1 });
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 9.0), tarmac);
    yard.rotation.x = -Math.PI / 2;
    yard.position.set(wx(-15.9), -0.02, -5.5);
    v.add(yard);
    for (const z of [-7.6, -3.9]) bx(-18.3, -0.015, z - 0.05, -13.4, -0.005, z + 0.05, M.lily);
    sign(['HEARSE ONLY'], -15.5, -0.004, -2.9, 'up', 1.8, 0.4, { bg: null, fg: '#e8e0c0', bold: true, sans: true });
    const path = new THREE.Mesh(new THREE.PlaneGeometry(26.6, 1.2), mat('#ffffff', { map: flagstones(), rough: 0.8 }));
    path.rotation.x = -Math.PI / 2;
    path.position.set(X, -0.02, 9.9);
    v.add(path);
    const lawn = mat('#4a7a3a', { rough: 1 });
    for (const x0 of [-13.3, 5.4]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(7.9, 0.6), lawn);
      l.rotation.x = -Math.PI / 2;
      l.position.set(wx(x0 + 3.95), -0.015, 10.2);
      v.add(l);
    }
    for (const x of [-1.6, 1.6]) {
      cyl(x, 0, 9.85, 0.22, 0.3, mat('#7a5a4a'), 10, 0.25);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.1, 10), M.leaf);
      top.position.set(wx(x), 0.85, 9.85);
      v.add(top);
    }
    for (const x of [-11, -8.5, 7.5, 10]) for (let i = 0; i < 3; i++) ball(x + i * 0.3, 0.18, 10.2, 0.16, i === 1 ? mat('#c82a4a') : M.leaf, 6);
    bx(-2.2, 3.0, 9.3, 2.2, 3.9, 9.38, M.black);
    sign([{ t: 'PETTIGREW & SONS', s: 1.2 }, { t: 'FUNERAL DIRECTORS · EST. 1888', s: 0.55 }, { t: '“We’ll see you soon”', s: 0.55 }], 0, 3.45, 9.385, 'S', 4.3, 0.85, STYLE.gilt);
    bx(-1.15, 0, 9.3, 1.15, 2.7, 9.36, mat('#3a1810', { rough: 0.5 }));
    bx(-0.02, 0, 9.36, 0.02, 2.6, 9.38, M.mahoganyDark);
    for (const x of [-0.12, 0.12]) ball(x, 1.15, 9.4, 0.04, M.brass, 6);
  }

  // ── More set dressing ──
  // The back of the novelty-urn cabinet: the loyalty scheme.
  {
    const b = at('Upright display south');
    bx(b.min.x - X - 0.03, 0.5, b.min.z + 0.15, b.min.x - X, 2.0, b.max.z - 0.15, M.gold);
    sign([{ t: 'LOYALTY SCHEME', s: 1 }, { t: 'Nine funerals,', s: 0.8 }, { t: 'your tenth', s: 0.8 }, { t: 'FREE*', s: 1.6, c: '#a3122a' }, { t: '*not transferable to the deceased', s: 0.45 }, { t: '☐ ☐ ☐ ☐ ☐ ☐ ☐ ☐ ☐ ★', s: 0.7 }],
      b.min.x - X - 0.032, 1.25, (b.min.z + b.max.z) / 2, 'W', 1.42, 1.42, STYLE.card);
  }
  // Preparation room: the examination lamp, aprons, a mop, the radio, a clock.
  {
    const t = at('Mortuary table');
    const cx = (t.min.x + t.max.x) / 2 - X, cz = (t.min.z + t.max.z) / 2;
    cyl(cx, 2.25, cz, 0.02, SH - 2.25, M.steel, 6);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.steel);
    dish.position.set(wx(cx), 2.0, cz);
    v.add(dish);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.28, 18), M.tube);
    glow.rotation.x = Math.PI / 2;
    glow.position.set(wx(cx), 1.999, cz);
    v.add(glow);
    for (const x of [-9.9, -9.35, -8.8]) {
      bx(x - 0.02, 1.75, -2.72, x + 0.02, 1.8, -2.65, M.chrome);
      bx(x - 0.22, 0.95, -2.7, x + 0.22, 1.78, -2.67, x === -9.35 ? mat('#3a6a8a', { rough: 0.8 }) : M.blackMatte);
    }
    sign(['APRONS (NOT BIBS)'], -9.35, 1.95, -2.66, 'N', 0.9, 0.12, STYLE.white);
    cyl(-5.65, 0, -3.15, 0.18, 0.32, mat('#e8c030', { rough: 0.5 }), 12, 0.2);
    const mop = cyl(-5.75, 0.2, -3.1, 0.015, 1.4, M.walnut, 5);
    mop.rotation.z = 0.25;
    bx(-11.6, 0.95, -3.1, -11.2, 1.17, -2.9, mat('#8a2a2a', { rough: 0.5 }));
    ball(-11.3, 1.06, -2.89, 0.05, M.chrome, 6);
    sign(['♪ Radio Bereavement ♪'], -11.4, 1.24, -2.95, 'N', 0.5, 0.07, { bg: null, fg: '#2a3a4a', italic: true });
    cyl(-5.17, 2.3, -6.6, 0.18, 0.03, M.lily, 18).rotation.z = Math.PI / 2;
    sign([{ t: '12  3', s: 0.5 }, { t: 'clocking off', s: 0.4 }, { t: '6  9', s: 0.5 }], -5.19, 2.3, -6.6, 'W', 0.26, 0.26, { bg: '#ffffff', fg: '#1a2a3a', sans: true });
    sign([{ t: 'HYGIENE ROTA', s: 1 }, { t: 'Mon: wash hands', s: 0.7 }, { t: 'Tue: wash hands', s: 0.7 }, { t: 'Wed: ask Nigel', s: 0.7 }], -5.16, 1.65, -7.0, 'W', 0.6, 0.5, STYLE.white);
  }
  // Flowers on the hearse's roof rack; a lighter yard so it reads from above.
  for (let i = 0; i < 7; i++) ball(-16.2 + i * 0.42, 1.76, -5.8 + (i % 2) * 0.12 - 0.06, 0.13, i % 3 === 1 ? mat('#e8c0d0') : M.lily, 8);
  bx(-16.6, 1.68, -6.3, -13.3, 1.71, -5.3, M.chrome);
  // Back corridor: a fire extinguisher, a staff notice, floor stencils.
  cyl(4.55, 0.5, -9.4, 0.09, 0.5, mat('#c81e1e', { rough: 0.4 }), 12);
  cyl(4.55, 1.0, -9.4, 0.03, 0.08, M.black, 6);
  sign([{ t: 'STAFF NOTICE', s: 1 }, { t: 'Do NOT let the relatives', s: 0.7 }, { t: 'into the back.', s: 0.7 }, { t: '— Mgmt', s: 0.6 }], 3.4, 1.65, -7.26, 'N', 0.8, 0.55, STYLE.notice);
  for (const x of [-3.9, 3.9]) sign(['STAFF ONLY'], x, 0.003, -8.4, 'up', 1.3, 0.45, { bg: null, fg: '#e8d030', bold: true, sans: true });
  // Wake room: the potted palm, a standard lamp, chairs along the walls, the memory board, a richer buffet.
  {
    const p = at('Potted palm');
    const px = (p.min.x + p.max.x) / 2 - X, pz = (p.min.z + p.max.z) / 2;
    cyl(px, 0, pz, 0.3, 0.5, M.brass, 14, 0.34, true);
    cyl(px, 0.5, pz, 0.05, 0.8, M.walnut, 6, 0.04, true);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9, 4), M.leaf);
      frond.position.set(wx(px) + Math.cos(a) * 0.3, 1.45, pz + Math.sin(a) * 0.3);
      frond.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      v.add(frond, true);
    }
    // Standard lamp with a fringed shade.
    cyl(12.6, 0, 3.2, 0.16, 0.04, M.brass, 12);
    cyl(12.6, 0, 3.2, 0.02, 1.5, M.brass, 6);
    cyl(12.6, 1.45, 3.2, 0.26, 0.32, mat('#e8c890', { emissive: '#ffc070', emissiveIntensity: 0.5 }), 12, 0.15);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; cyl(12.6 + Math.cos(a) * 0.26, 1.38, 3.2 + Math.sin(a) * 0.26, 0.012, 0.08, M.gold, 4); }
    // Stacking chairs against the walls.
    const chairM = mat('#6a2a5a', { rough: 0.8 });
    const chair = (x: number, z: number, yaw: number) => {
      const g = new THREE.Group();
      g.add(boxMesh(-0.22, 0.43, -0.22, 0.22, 0.48, 0.22, chairM));
      g.add(boxMesh(-0.22, 0.48, 0.18, 0.22, 0.92, 0.22, chairM));
      for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) g.add(boxMesh(lx - 0.015, 0, lz - 0.015, lx + 0.015, 0.43, lz + 0.015, M.chrome));
      g.position.set(wx(x), 0, z);
      g.rotation.y = yaw;
      v.add(g);
    };
    chair(5.45, 5.3, -Math.PI / 2);
    chair(5.45, 5.9, -Math.PI / 2);
    chair(6.7, -1.55, 0);
    chair(7.3, -1.55, 0);
    chair(12.7, 6.0, Math.PI / 2);
    // The memory board over the sideboard.
    bx(12.95, 1.45, 0.4, 13, 2.55, 2.4, mat('#b08a5a', { rough: 1 }));
    sign([{ t: 'NANA: THE STORY SO FAR', s: 1 }], 12.94, 2.43, 1.4, 'W', 1.8, 0.14, { bg: null, fg: '#2a1a10', bold: true });
    const r = rng(17);
    for (let i = 0; i < 7; i++) {
      const ph = new THREE.Group();
      ph.add(boxMesh(-0.12, -0.14, 0, 0.12, 0.14, 0.01, M.lily));
      ph.add(boxMesh(-0.1, -0.08, 0.005, 0.1, 0.12, 0.012, mat(['#7a8a9a', '#9a8a6a', '#6a7a6a', '#8a6a6a'][i % 4])));
      ph.position.set(wx(12.94), 1.75 + (i % 2) * 0.33, 0.6 + i * 0.26);
      ph.rotation.set(0, -Math.PI / 2, (r() - 0.5) * 0.4);
      v.add(ph);
    }
    // The buffet: pleated skirt, a plum runner, teapots, cups, a pork pie, a jelly, lilies.
    const t = at('The buffet');
    const x0 = t.min.x - X, x1 = t.max.x - X, z0 = t.min.z, z1 = t.max.z, h = t.max.y;
    const pleats = mat('#ffffff', { map: softFolds(), rough: 0.9 });
    bx(x0 - 0.045, 0.02, z0 - 0.045, x1 + 0.045, h - 0.04, z0 - 0.035, pleats, false, 0.6);
    bx(x0 - 0.045, 0.02, z1 + 0.035, x1 + 0.045, h - 0.04, z1 + 0.045, pleats, false, 0.6);
    bx(x0 + 0.15, h, (z0 + z1) / 2 - 0.2, x1 - 0.15, h + 0.004, (z0 + z1) / 2 + 0.2, mat('#5a1a4a', { rough: 0.9 }));
    const china = mat('#f4f4f8', { rough: 0.2 });
    for (const tx of [x0 + 0.45, x1 - 0.95]) {
      ball(tx, h + 0.12, z1 - 0.3, 0.11, china, 12);
      cyl(tx, h + 0.2, z1 - 0.3, 0.035, 0.05, china, 8);
      const spout = cyl(tx + 0.13, h + 0.1, z1 - 0.3, 0.018, 0.14, china, 6);
      spout.rotation.z = -0.9;
    }
    for (let i = 0; i < 6; i++) {
      const cx2 = x0 + 0.9 + i * 0.28, cz2 = z0 + 0.2;
      cyl(cx2, h, cz2, 0.07, 0.01, china, 12);
      cyl(cx2, h + 0.01, cz2, 0.035, 0.06, china, 10, 0.045);
    }
    cyl(x1 - 0.3, h, (z0 + z1) / 2 + 0.05, 0.13, 0.12, mat('#c8904a', { rough: 0.7 }), 14, 0.11);
    cyl(x0 + 2.25, h, z1 - 0.28, 0.12, 0.13, mat('#d82a3a', { rough: 0.15 }), 12, 0.07);
    lilies(x1 - 0.2, h, (z0 + z1) / 2, 0.55);
    sign([{ t: 'Help yourself', s: 1 }, { t: 'Nana is watching the ham', s: 0.65 }], x0 + 2.0, h + 0.1, z0 + 0.12, 'N', 0.36, 0.14, STYLE.card).rotation.x = 0.4;
  }

  // Any solid box not drawn above (a safety net: what you bump into is always seen).
  for (const b of def.boxes) {
    if (handled.has(b) || !b.solid) continue;
    v.add(boxMesh(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, M.mahogany), true);
  }

  // ── Lights: candlelight at the front, a warm nave, cold tubes in the back ──
  v.point(wx(0), 2.3, -5.0, '#ffb868', 30, 11); // candles round the coffin
  v.point(wx(0), 4.2, 2.0, '#ffd6a0', 46, 18); // chapel lanterns
  v.point(wx(0), 3.0, 7.6, '#ffcf9a', 16, 9, true); // narthex
  v.point(wx(-9.0), 2.6, 2.8, '#ffd2be', 34, 13); // showroom spots
  v.point(wx(-9.0), 2.75, -6.0, '#dff2ff', 34, 12); // preparation room tubes
  v.point(wx(0), 2.7, -8.3, '#f4f0e0', 12, 8, true); // back corridor
  v.point(wx(9.2), 2.5, -5.4, '#ffd08a', 26, 11); // office
  v.point(wx(9.2), 2.6, 4.2, '#ffe0b4', 34, 13); // wake room

  // Hanging lanterns over the aisle (glass glows; chains up to the beams).
  for (const z of [-1.0, 4.2]) {
    cyl(0, 3.75, z, 0.012, CH - 0.28 - 3.75, M.brass, 4);
    cyl(0, 3.2, z, 0.18, 0.5, mat('#ffe6b0', { emissive: '#ffc070', emissiveIntensity: 1.2 }), 6, 0.22);
    cyl(0, 3.7, z, 0.24, 0.08, M.brass, 6, 0.12);
    cyl(0, 3.12, z, 0.14, 0.08, M.brass, 6, 0.18);
  }

  const view = v.finish({
    windows,
    idle: { center: { x: X, y: 2.6, z: 4.4 }, rx: 2.4, rz: 2.2, look: { x: X, y: 1.5, z: -5.6 } },
    background: '#140c12',
    lightningFrom: { x: X - 40, y: 18, z: -2 },
  });

  // ── Live (unbaked) set dressing: candle flames, the balloon arch, the office fan ──
  for (const f of flames) v.group.add(f);
  const balloons = new THREE.Group();
  {
    const cols = [mat('#141016', { rough: 0.2 }), mat('#141016', { rough: 0.2 }), mat('#c0c4cc', { rough: 0.15, metal: 0.6 }), mat('#4a1a40', { rough: 0.2 })];
    const n = 21;
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1)) * Math.PI;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), cols[i % cols.length]);
      b.position.set(Math.cos(a) * 1.45, Math.sin(a) * 1.55 + 1.35 - (Math.abs(Math.cos(a)) > 0.97 ? 0.2 : 0), (i % 2) * 0.12);
      b.scale.set(1, 1.15, 1);
      balloons.add(b);
    }
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), cols[(i + 1) % cols.length]);
      b.position.set(s * 1.45, 0.25 + i * 0.36, 0.05);
      balloons.add(b);
    }
    const banner = signMesh([{ t: 'CELEBRATION OF LIFE', s: 1 }, { t: '(pending)', s: 0.7 }], 1.45, 0.32, STYLE.gilt);
    banner.position.set(0, 2.2, 0.14);
    balloons.add(banner);
    balloons.position.set(X, 0, 8.6);
    balloons.rotation.y = Math.PI;
  }
  v.group.add(balloons);
  const fan = new THREE.Group();
  {
    fan.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 10), M.brass));
    for (let i = 0; i < 4; i++) {
      const blade = boxMesh(0.08, -0.01, -0.07, 0.62, 0.01, 0.07, M.mahogany);
      const arm = new THREE.Group();
      arm.add(blade);
      arm.rotation.y = (i / 4) * Math.PI * 2;
      fan.add(arm);
    }
    fan.position.set(wx(9.6), SH - 0.3, -4.6);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 6), M.brass);
    rod.position.set(wx(9.6), SH - 0.15, -4.6);
    v.group.add(rod);
  }
  v.group.add(fan);

  view.tick = (t) => {
    for (let i = 0; i < flames.length; i++) {
      const k = 1 + Math.sin(t * 11 + i * 2.1) * 0.12 + Math.sin(t * 23 + i) * 0.08;
      flames[i].scale.set(1 / Math.sqrt(k), k, 1 / Math.sqrt(k));
    }
    balloons.position.y = Math.sin(t * 0.9) * 0.03;
    balloons.rotation.z = Math.sin(t * 0.6) * 0.012;
    fan.rotation.y = t * 1.6;
  };
  return view;
}
