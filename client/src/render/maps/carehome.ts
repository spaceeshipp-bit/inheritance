// Sunny Pines Care Home: its look. Mint walls with a darker dado, pastel lino,
// a busy Day Room carpet, suspended ceilings with cool fluorescent panels, and
// warm lamps only in Nana's corner. The comedy is in the signage: every sign is
// a canvas texture drawn here (sign()), every prop chunky low-poly boxes.
import * as THREE from 'three';
import type { Box, MapDef } from '../../../../shared/map.js';
import { CAREHOME_DOORS, CAREHOME_H, CAREHOME_X } from '../../../../shared/maps/carehome.js';
import type { Vec3 } from '../../../../shared/types.js';
import { boxGeo, mat, rug } from '../materials.js';
import { ViewBuilder, boxMesh, pedestal, roomIn, roomWall, table, wallMaterials, wingChair, type MapView } from './kit.js';

const X = CAREHOME_X;
const H = CAREHOME_H;

/** Wall colour above the dado, per room. */
const UPPER: Record<string, string> = {
  'Day Room': '#b9e2cb', // mint
  'Dining Hall': '#f1e5c6', // magnolia
  'Sun Lounge': '#f5ecbd', // primrose
  "Residents' Corridor": '#d3ecd9', // pale mint
  "Nurses' Station": '#c6dde9', // hospital blue
  'Sluice Room': '#dfe8e0', // tiled
  Reception: '#f4dcc2', // peach
  Outside: '#46564d',
};
/** Below the dado. */
const LOWER: Record<string, string> = {
  'Day Room': '#6fae8e',
  'Dining Hall': '#4f8a66',
  'Sun Lounge': '#d2bf78',
  "Residents' Corridor": '#8fc0a2',
  "Nurses' Station": '#86aec4',
  'Sluice Room': '#a9c4b4',
  Reception: '#c99d78',
};

type Face = 'n' | 's' | 'e' | 'w';
const FACE_YAW: Record<Face, number> = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };

// ───────────────────────── textures ─────────────────────────

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d') as CanvasRenderingContext2D);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}

/** A tiny deterministic random (the speckle on the lino is the same every time). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const TEX = new Map<string, THREE.CanvasTexture>();
function cached(key: string, make: () => THREE.CanvasTexture): THREE.CanvasTexture {
  let t = TEX.get(key);
  if (!t) { t = make(); TEX.set(key, t); }
  return t;
}

/** The Day Room's busy institutional carpet: teal, with mauve and mustard motifs. One repeat = 1 m. */
const carpetTex = () => cached('carpet', () => canvasTex(128, 128, (g) => {
  g.fillStyle = '#2e6b6c';
  g.fillRect(0, 0, 128, 128);
  const r = rng(7);
  for (let i = 0; i < 500; i++) { g.fillStyle = r() < 0.5 ? 'rgba(20,60,60,0.5)' : 'rgba(80,140,130,0.4)'; g.fillRect(r() * 128, r() * 128, 2, 2); }
  for (const [cx, cy] of [[32, 32], [96, 96]]) {
    g.fillStyle = '#8b5a7c';
    g.beginPath(); g.moveTo(cx, cy - 22); g.lineTo(cx + 22, cy); g.lineTo(cx, cy + 22); g.lineTo(cx - 22, cy); g.closePath(); g.fill();
    g.fillStyle = '#d8b04a';
    g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); g.fill();
  }
  for (const [cx, cy] of [[96, 32], [32, 96]]) {
    g.fillStyle = '#d8b04a';
    for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; g.beginPath(); g.arc(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9, 5, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#8b5a7c';
    g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.fill();
  }
}));

/** Speckled vinyl, white so the material colour tints it. One repeat = 2 m. */
const linoTex = () => cached('lino', () => canvasTex(256, 256, (g) => {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  const r = rng(11);
  for (let i = 0; i < 2600; i++) {
    const v = 150 + Math.floor(r() * 80);
    g.fillStyle = r() < 0.15 ? `rgba(${v - 60},${v - 40},${v - 30},0.55)` : `rgba(${v},${v},${v},0.5)`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  g.strokeStyle = 'rgba(0,0,0,0.07)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256);
}));

/** Conservatory terracotta tiles. One repeat = 1 m (4 x 4 tiles). */
const terracottaTex = () => cached('terracotta', () => canvasTex(128, 128, (g) => {
  const r = rng(3);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const k = Math.floor(r() * 30);
    g.fillStyle = `rgb(${190 + k},${110 + k / 2},${78 + k / 3})`;
    g.fillRect(x * 32, y * 32, 32, 32);
  }
  g.strokeStyle = '#e8d8c0';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 128); g.moveTo(0, i * 32); g.lineTo(128, i * 32); g.stroke(); }
}));

/** Suspended ceiling tiles (60 cm), with their fissured dots. One repeat = 1.2 m. */
const ceilingTex = () => cached('ceiling', () => canvasTex(128, 128, (g) => {
  g.fillStyle = '#f4f3ee';
  g.fillRect(0, 0, 128, 128);
  const r = rng(5);
  for (let i = 0; i < 700; i++) { g.fillStyle = 'rgba(120,120,110,0.25)'; g.fillRect(r() * 128, r() * 128, 1.5, 1.5); }
  g.fillStyle = '#c9cbc6';
  g.fillRect(0, 0, 128, 3); g.fillRect(0, 63, 128, 3); g.fillRect(0, 0, 3, 128); g.fillRect(63, 0, 3, 128);
}));

/** Woodchip wallpaper, painted over many times. One repeat = 1 m. */
const woodchipTex = () => cached('woodchip', () => canvasTex(128, 128, (g) => {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  const r = rng(9);
  for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.9)'; g.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2); }
}));

/** Little square wall tiles (the sluice room). One repeat = 0.6 m. */
const wallTileTex = () => cached('walltile', () => canvasTex(128, 128, (g) => {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#c8d0ca';
  for (let i = 0; i < 4; i++) { g.fillRect(i * 32, 0, 2, 128); g.fillRect(0, i * 32, 128, 2); }
}));

// ───────────────────────── signs ─────────────────────────

/** A line of sign text: a string, or with its size (relative), colour, font, bold or struck through. */
type Line = string | { t: string; s?: number; c?: string; f?: string; b?: boolean; strike?: boolean; i?: boolean };
interface SignStyle { bg: string; fg: string; border?: string; font?: string; glow?: number; stripe?: string }

const SANS = '"Helvetica Neue", Helvetica, Arial, "DejaVu Sans", sans-serif';
const SERIF = 'Georgia, "Times New Roman", "DejaVu Serif", serif';
const HAND = '"Comic Sans MS", "Marker Felt", "Segoe Print", "DejaVu Sans", cursive';

/** NHS-ish blue, pine-fresh green, laminated white, wipe-clean whiteboard. */
const ST = {
  nhs: { bg: '#1f5fa8', fg: '#ffffff', border: '#ffffff' },
  pine: { bg: '#24704a', fg: '#ffffff', border: '#e9f5ea' },
  white: { bg: '#fbfaf5', fg: '#1d3b30', border: '#2a7a54' },
  laminate: { bg: '#fffef6', fg: '#222222', border: '#c9c9c0' },
  warn: { bg: '#ffd629', fg: '#1a1a1a', border: '#1a1a1a' },
  red: { bg: '#c8282d', fg: '#ffffff', border: '#ffffff' },
  brass: { bg: '#cdb06a', fg: '#2a2112', border: '#8a6d2c', font: SERIF },
  board: { bg: '#f7f7f3', fg: '#1b3d8f', border: '#9aa0a6', font: HAND },
  chalk: { bg: '#2d3b33', fg: '#f3f0e2', border: '#8a6a44', font: HAND },
  exit: { bg: '#1aa35a', fg: '#ffffff', glow: 0.9 },
} satisfies Record<string, SignStyle>;

function signMaterial(lines: Line[], w: number, h: number, st: SignStyle): THREE.MeshStandardMaterial {
  const ppm = Math.min(300, 1024 / Math.max(w, h));
  const cw = Math.max(48, Math.round(w * ppm)), ch = Math.max(32, Math.round(h * ppm));
  const tex = canvasTex(cw, ch, (g) => {
    g.fillStyle = st.bg;
    g.fillRect(0, 0, cw, ch);
    if (st.stripe) { g.fillStyle = st.stripe; g.fillRect(0, 0, cw, ch * 0.16); }
    if (st.border) {
      const bw = Math.max(3, Math.min(cw, ch) * 0.035);
      g.strokeStyle = st.border;
      g.lineWidth = bw;
      g.strokeRect(bw * 1.2, bw * 1.2, cw - bw * 2.4, ch - bw * 2.4);
    }
    const items = lines.map((l) => (typeof l === 'string' ? { t: l } : l));
    const pad = Math.min(cw, ch) * 0.09;
    const total = items.reduce((a, l) => a + (l.s ?? 1), 0);
    const unit = (ch - pad * 2) / (total * 1.22);
    let y = pad + (ch - pad * 2 - total * unit * 1.22) / 2;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const l of items) {
      const slot = unit * (l.s ?? 1) * 1.22;
      let size = unit * (l.s ?? 1);
      const font = (px: number) => `${l.i ? 'italic ' : ''}${l.b === false ? '' : 'bold '}${px}px ${l.f ?? st.font ?? SANS}`;
      g.font = font(size);
      const mw = g.measureText(l.t).width;
      if (mw > cw - pad * 2) { size *= (cw - pad * 2) / mw; g.font = font(size); }
      const cy = y + slot / 2;
      g.fillStyle = l.c ?? st.fg;
      g.fillText(l.t, cw / 2, cy);
      if (l.strike) {
        const tw = g.measureText(l.t).width;
        g.strokeStyle = '#d0202a';
        g.lineWidth = Math.max(2, size * 0.13);
        g.beginPath(); g.moveTo(cw / 2 - tw / 2 - 4, cy + size * 0.05); g.lineTo(cw / 2 + tw / 2 + 4, cy - size * 0.05); g.stroke();
      }
      y += slot;
    }
  }, false);
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: st.glow ?? 0.14 });
}

// ───────────────────────── the builder ─────────────────────────

export function buildCarehome(def: MapDef): MapView {
  const v = new ViewBuilder(def);

  // ── Materials ──
  const M = {
    white: mat('#f6f5ef', { rough: 0.6 }),
    frame: mat('#eeeae0', { rough: 0.5 }), // painted door frames
    pine: mat('#c99a62', { rough: 0.6 }),
    darkPine: mat('#8a6238', { rough: 0.6 }),
    teak: mat('#6b4126', { rough: 0.55 }),
    piano: mat('#2c1a12', { rough: 0.35 }),
    chrome: mat('#c9cdd2', { rough: 0.3, metal: 0.75 }),
    steel: mat('#aeb5b8', { rough: 0.35, metal: 0.6 }),
    black: mat('#1b1b1e', { rough: 0.4 }),
    greyPlastic: mat('#8d9196', { rough: 0.6 }),
    cream: mat('#efe6d0', { rough: 0.7 }),
    plinth: mat('#f2eee3', { rough: 0.55 }),
    skirting: mat('#6d7f76', { rough: 0.5 }),
    rail: mat('#f3efe4', { rough: 0.4 }),
    handrail: mat('#b9895a', { rough: 0.45 }),
    fireDoor: mat('#d6b98a', { rough: 0.55 }),
    green: mat('#2f7a52', { rough: 0.6 }),
    leaf: mat('#3f8f4a', { rough: 0.8 }),
    pot: mat('#b5603c', { rough: 0.8 }),
    soil: mat('#3a2a1e', { rough: 1 }),
    paper: mat('#fbf9f0', { rough: 0.9 }),
    cardboard: mat('#b48a58', { rough: 0.95 }),
    baize: mat('#2f6b45', { rough: 1 }),
    gold: mat('#d4af4a', { rough: 0.35, metal: 0.7 }),
    redCross: mat('#c8282d', { rough: 0.6 }),
    oxygen: mat('#3d8f5a', { rough: 0.35, metal: 0.3 }),
    oxygenTop: mat('#f2f2f2', { rough: 0.4 }),
    tinsel: mat('#e8c04a', { rough: 0.3, metal: 0.8, emissive: '#6a4a10', emissiveIntensity: 0.4 }),
    lamp: mat('#fff1cf', { rough: 0.6, emissive: '#ffcc80', emissiveIntensity: 1.4 }),
    tube: mat('#f4fbff', { rough: 0.4, emissive: '#e6f3ff', emissiveIntensity: 1.5 }),
    chintz: mat('#b85a6f', { rough: 0.9 }),
    chintzLight: mat('#e8a7b4', { rough: 0.9 }),
    lace: mat('#fbf8f2', { rough: 1 }),
    water: new THREE.MeshStandardMaterial({ color: '#6fc3d8', transparent: true, opacity: 0.45, roughness: 0.1, emissive: '#1f6f8a', emissiveIntensity: 0.35 }),
    glass: new THREE.MeshStandardMaterial({ color: '#d8eef2', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1 }),
    vinyl: [mat('#4f8f8a', { rough: 0.45 }), mat('#9a6a8c', { rough: 0.45 }), mat('#c9a13e', { rough: 0.45 }), mat('#6f86b8', { rough: 0.45 })],
    tray: mat('#e0d6c4', { rough: 0.5 }),
  };
  const windows = new THREE.MeshStandardMaterial({ color: '#d9ecff', emissive: '#c4dcff', emissiveIntensity: 0.9, roughness: 0.15 });

  // ── Small helpers (local x: X is added here) ──
  const add = <T extends THREE.Object3D>(o: T, block = false): T => v.add(o, block);
  const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: THREE.Material | THREE.Material[], block = false, tile = 1) =>
    add(boxMesh(X + x0, y0, z0, X + x1, y1, z1, m, tile), block);
  const cyl = (x: number, y0: number, z: number, r: number, h: number, m: THREE.Material, seg = 12, r2 = r) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, seg), m);
    c.position.set(X + x, y0 + h / 2, z);
    return add(c);
  };
  const sph = (x: number, y: number, z: number, r: number, m: THREE.Material, sx = 1, sy = 1, sz = 1) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), m);
    s.position.set(X + x, y, z);
    s.scale.set(sx, sy, sz);
    return add(s);
  };
  /** A sign on a wall (or anything): its face points `face`; (x, y, z) is its centre. */
  const sign = (lines: Line[], x: number, y: number, z: number, face: Face, w: number, h: number, st: SignStyle, tilt = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), signMaterial(lines, w, h, st));
    m.position.set(X + x, y, z);
    m.rotation.set(0, FACE_YAW[face], 0);
    m.rotateZ(tilt);
    return add(m);
  };
  /** A ceiling, seen only from below (the overview camera looks through it), its texture tiled every `tile` m. */
  const ceilingPlane = (x0: number, z0: number, x1: number, z1: number, m: THREE.Material, y = H, tile = 1.2) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (x1 - x0)) / tile, (uv.getY(i) * (z1 - z0)) / tile);
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(X + (x0 + x1) / 2, y, (z0 + z1) / 2);
    return add(mesh, true);
  };
  /** A fluorescent panel in the suspended ceiling (a downward-facing glow). */
  const tubeMats: THREE.MeshStandardMaterial[] = [M.tube];
  const panel = (x: number, z: number, along: 'x' | 'z' = 'x', m: THREE.Material = M.tube) => {
    const [w, d] = along === 'x' ? [1.2, 0.6] : [0.6, 1.2];
    ceilingPlane(x - w / 2 - 0.04, z - d / 2 - 0.04, x + w / 2 + 0.04, z + d / 2 + 0.04, M.greyPlastic, H - 0.012, 2);
    ceilingPlane(x - w / 2, z - d / 2, x + w / 2, z + d / 2, m, H - 0.02, 2);
  };
  /** An object grouped and turned to face along game yaw (0 = -Z). */
  const turned = (x: number, z: number, yaw: number, build: (g: THREE.Group, b: (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: THREE.Material) => void) => void, block = false) => {
    const g = new THREE.Group();
    build(g, (x0, y0, z0, x1, y1, z1, m) => { g.add(boxMesh(x0, y0, z0, x1, y1, z1, m)); });
    g.position.set(X + x, 0, z);
    g.rotation.y = yaw;
    return add(g, block);
  };
  const yawTo = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(-(tx - fx), -(tz - fz));

  // ── Floors ──
  const floorMats: Record<string, THREE.Material> = {
    'Day Room': mat('#ffffff', { map: carpetTex(), rough: 1 }),
    'Dining Hall': mat('#f0c9ae', { map: linoTex(), rough: 0.45 }),
    'Sun Lounge': mat('#ffffff', { map: terracottaTex(), rough: 0.7 }),
    "Residents' Corridor": mat('#bccbd8', { map: linoTex(), rough: 0.4 }),
    "Nurses' Station": mat('#c9d9c4', { map: linoTex(), rough: 0.4 }),
    'Sluice Room': mat('#8fa39a', { map: linoTex(), rough: 0.6 }),
    Reception: mat('#c7b7d6', { map: linoTex(), rough: 0.45 }),
  };
  const under = mat('#3c3a36', { rough: 1 });
  for (const b of def.boxes.filter((q) => q.kind === 'floor')) {
    const c = { x: (b.min.x + b.max.x) / 2, y: 0.1, z: (b.min.z + b.max.z) / 2 };
    const room = roomIn(def, c);
    const top = floorMats[room] ?? floorMats["Residents' Corridor"];
    const tile = room === 'Day Room' || room === 'Sun Lounge' ? 1 : 2;
    v.add(boxMesh(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, [under, under, top, under, under, under], tile), true);
  }

  // ── Walls: each face in its room's colour, a darker dado below a rail, coved skirting ──
  const faceRoom = (p: Vec3): string => {
    const r = roomIn(def, p);
    if (r !== 'Outside') return r;
    for (const [dx, dz] of [[0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) {
      const q = roomIn(def, { x: p.x + dx, y: p.y, z: p.z + dz });
      if (q !== 'Outside') return q;
    }
    return 'Outside';
  };
  const wallMat = wallMaterials(UPPER, { texture: woodchipTex, rough: 0.95 });
  const lowerMat = (room: string) => room === 'Sluice Room' ? mat(LOWER[room], { map: wallTileTex(), rough: 0.3 }) : mat(LOWER[room] ?? '#777', { map: woodchipTex(), rough: 0.9 });
  const glassFrame = mat('#f1f1ec', { rough: 0.4 });
  for (const b of def.boxes) {
    if (b.kind === 'railing') {
      // A glass panel in a wall: the pane and its white uPVC frame.
      const { min: a, max: c } = b;
      add(boxMesh(a.x + 0.02, a.y, a.z + 0.02, c.x - 0.02, c.y, c.z - 0.02, M.glass), true);
      const alongX = c.x - a.x > c.z - a.z;
      const f = 0.06;
      if (alongX) {
        add(boxMesh(a.x, a.y, a.z - 0.02, c.x, a.y + f, c.z + 0.02, glassFrame));
        add(boxMesh(a.x, c.y - f, a.z - 0.02, c.x, c.y, c.z + 0.02, glassFrame));
        for (const x of [a.x, (a.x + c.x) / 2 - f / 2, c.x - f]) add(boxMesh(x, a.y, a.z - 0.02, x + f, c.y, c.z + 0.02, glassFrame));
      } else {
        add(boxMesh(a.x - 0.02, a.y, a.z, c.x + 0.02, a.y + f, c.z, glassFrame));
        add(boxMesh(a.x - 0.02, c.y - f, a.z, c.x + 0.02, c.y, c.z, glassFrame));
        for (const z of [a.z, (a.z + c.z) / 2 - f / 2, c.z - f]) add(boxMesh(a.x - 0.02, a.y, z, c.x + 0.02, c.y, z + f, glassFrame));
      }
      continue;
    }
    if (b.kind !== 'wall') continue;
    roomWall(v, b, faceRoom, wallMat, M.skirting);
    if (b.min.y > 0.1) continue;
    dado(b);
  }

  /** The two-tone dado on each face of a floor-standing wall that looks into a room (handrails in the corridor). */
  function dado(b: Box): void {
    const { min: a, max: c } = b;
    const cx = (a.x + c.x) / 2, cz = (a.z + c.z) / 2, e = 0.15, t = 0.012, top = 1.0;
    const faces: [Face, string][] = [
      ['e', faceRoom({ x: c.x + e, y: 1, z: cz })], ['w', faceRoom({ x: a.x - e, y: 1, z: cz })],
      ['s', faceRoom({ x: cx, y: 1, z: c.z + e })], ['n', faceRoom({ x: cx, y: 1, z: a.z - e })],
    ];
    for (const [f, room] of faces) {
      if (room === 'Outside') continue;
      const lm = lowerMat(room);
      const corridor = room === "Residents' Corridor";
      const long = f === 'e' || f === 'w' ? c.z - a.z : c.x - a.x;
      const slab = (o: number, th: number, y0: number, y1: number, m: THREE.Material) => {
        if (f === 'e') add(boxMesh(c.x + o, y0, a.z, c.x + o + th, y1, c.z, m));
        else if (f === 'w') add(boxMesh(a.x - o - th, y0, a.z, a.x - o, y1, c.z, m));
        else if (f === 's') add(boxMesh(a.x, y0, c.z + o, c.x, y1, c.z + o + th, m));
        else add(boxMesh(a.x, y0, a.z - o - th, c.x, y1, a.z - o, m));
      };
      slab(0, t, 0.16, top, lm);
      slab(0, 0.03, top - 0.02, top + 0.05, M.rail);
      if (corridor && long > 0.5) {
        // Handrails on brackets, both sides of the corridor.
        slab(0.06, 0.06, 0.86, 0.92, M.handrail);
      }
    }
  }

  // ── Door frames and propped-open fire doors ──
  for (const d of Object.values(CAREHOME_DOORS)) doorFrame(d.axis, d.at, d.a, d.b);
  function doorFrame(axis: 'x' | 'z', at: number, a: number, b: number): void {
    const w = 0.08, o = 0.17;
    if (axis === 'x') {
      bx(a, 0, at - o, a + w, 2.3, at + o, M.frame);
      bx(b - w, 0, at - o, b, 2.3, at + o, M.frame);
      bx(a, 2.22, at - o, b, 2.32, at + o, M.frame);
    } else {
      bx(at - o, 0, a, at + o, 2.3, a + w, M.frame);
      bx(at - o, 0, b - w, at + o, 2.3, b, M.frame);
      bx(at - o, 2.22, a, at + o, 2.32, b, M.frame);
    }
  }

  // ── Ceilings: suspended tiles, fluorescent panels; the Sun Lounge has a glazed roof ──
  const ceilTiles = mat('#ffffff', { map: ceilingTex(), rough: 0.95 });
  ceilingPlane(-8, -3.5, 6, 6, ceilTiles);
  ceilingPlane(-8, -10, 6, -3.5, ceilTiles);
  ceilingPlane(-14, 6, 8.4, 8.4, ceilTiles);
  ceilingPlane(6, -10, 8.4, 6, ceilTiles);
  ceilingPlane(8.4, -10, 13, 8.4, ceilTiles);
  // The conservatory roof: white rafters over glazing.
  ceilingPlane(-14, -10, -8, 6, windows, H, 16);
  for (let z = -10; z <= 6.01; z += 1.6) bx(-14, H - 0.12, z - 0.05, -8, H, z + 0.05, M.white);
  for (const x of [-14, -11, -8]) bx(x - 0.06, H - 0.14, -10, x + 0.06, H, 6, M.white);
  // A roof lantern over the Day Room (it flashes in the Storm).
  ceilingPlane(-3.2, 0.1, -0.2, 2.3, windows, H - 0.005, 8);
  for (const [x0, z0, x1, z1] of [[-3.3, 0.0, -0.1, 0.12], [-3.3, 2.28, -0.1, 2.4], [-3.3, 0.0, -3.18, 2.4], [-0.22, 0.0, -0.1, 2.4], [-1.76, 0.0, -1.64, 2.4]]) bx(x0, H - 0.1, z0, x1, H, z1, M.white);
  // Fluorescent panels (one in the corridor is on its way out: it flickers).
  const faulty = mat('#f4fbff', { rough: 0.4, emissive: '#e6f3ff', emissiveIntensity: 1.5, map: linoTex() });
  tubeMats.push(faulty);
  for (const [x, z] of [[2.2, -1.4], [2.2, 3.6], [-5.2, -1.6], [-1.7, 4.3], [-1.7, -1.9]] as const) panel(x, z);
  for (const [x, z] of [[-5.5, -6.8], [-1.5, -6.8], [2.5, -6.8], [-1.5, -4.6], [3.6, -4.6]] as const) panel(x, z);
  for (const x of [-12, -8.5, -5, -1.5, 2, 5.2]) panel(x, 7.2, 'x', x === -8.5 ? faulty : M.tube);
  for (const z of [-8.5, -5, -1.5, 2, 5.2]) panel(7.2, z, 'z');
  panel(10.7, -7.5); panel(10.7, -4.6); panel(10.7, -0.4); panel(10.7, 5.2);

  // ── Windows: the conservatory's west and north walls, the dining hall, the nurses' station ──
  const pane = (axis: 'x' | 'z', at: number, a: number, b: number, y0: number, y1: number, inward: 1 | -1) => {
    // `at`: the inner face of an outer wall; the pane sits just in front of it.
    const p = at + inward * 0.01;
    if (axis === 'z') {
      add(boxMesh(p - 0.01, y0, a, p + 0.01, y1, b, windows));
      add(boxMesh(p - 0.04, y0 - 0.06, a - 0.06, p + 0.04, y0, b + 0.06, M.white));
      add(boxMesh(p - 0.04, y1, a - 0.06, p + 0.04, y1 + 0.06, b + 0.06, M.white));
      for (let z = a; z <= b + 0.01; z += (b - a) / Math.max(1, Math.round((b - a) / 0.9))) add(boxMesh(p - 0.04, y0, z - 0.03, p + 0.04, y1, z + 0.03, M.white));
      add(boxMesh(p - 0.04, (y0 + y1) / 2 + 0.25, a, p + 0.04, (y0 + y1) / 2 + 0.3, b, M.white));
    } else {
      add(boxMesh(a, y0, p - 0.01, b, y1, p + 0.01, windows));
      add(boxMesh(a - 0.06, y0 - 0.06, p - 0.04, b + 0.06, y0, p + 0.04, M.white));
      add(boxMesh(a - 0.06, y1, p - 0.04, b + 0.06, y1 + 0.06, p + 0.04, M.white));
      for (let x = a; x <= b + 0.01; x += (b - a) / Math.max(1, Math.round((b - a) / 0.9))) add(boxMesh(x - 0.03, y0, p - 0.04, x + 0.03, y1, p + 0.04, M.white));
      add(boxMesh(a, (y0 + y1) / 2 + 0.25, p - 0.04, b, (y0 + y1) / 2 + 0.3, p + 0.04, M.white));
    }
  };
  pane('z', X - 14, -9.4, -1.0, 0.5, 2.6, 1);
  pane('z', X - 14, 0.2, 5.4, 0.5, 2.6, 1);
  pane('x', -10, X - 10.2, X - 8.7, 0.6, 2.5, 1);
  pane('x', -10, X - 6.5, X - 4.6, 0.9, 2.3, 1);
  pane('x', -10, X - 3.6, X - 1.7, 0.9, 2.3, 1);
  pane('z', X + 13, -5.9, -4.1, 0.9, 2.2, -1);

  // ═════════════════ The Day Room ═════════════════
  const boxes = (label: string) => def.boxes.filter((q) => q.label === label);
  const one = (label: string) => boxes(label)[0];

  // Nana's corner: her own chair, rug, lamps and photographs (the only warm light in the building).
  wingChair(v, one("Nana's wing chair"), M.chintz, M.chintzLight, -Math.PI / 2);
  {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.6), new THREE.MeshStandardMaterial({ map: rug(), roughness: 1 }));
    r.rotation.x = -Math.PI / 2;
    r.position.set(X - 6.1, 0.008, 1.2);
    add(r);
  }
  table(v, one("Nana's side table"), M.teak, M.teak);
  cyl(-7.3, 0.6, 2.5, 0.08, 0.32, M.gold, 10);
  cyl(-7.3, 0.9, 2.5, 0.22, 0.22, M.lamp, 14, 0.13);
  bx(-7.55, 0.6, 2.25, -7.38, 0.8, 2.3, M.gold); // a framed photo
  bx(-7.54, 0.62, 2.26, -7.39, 0.78, 2.305, mat('#7a8fa8'));
  // The standard lamp behind her.
  cyl(-7.62, 0, 0.38, 0.14, 0.05, M.gold, 12);
  cyl(-7.62, 0.05, 0.38, 0.025, 1.55, M.gold, 8);
  cyl(-7.62, 1.55, 0.38, 0.3, 0.32, M.lamp, 14, 0.18);
  // Photographs of the family over her chair (one turned to the wall).
  const photo = (x: number, y: number, z: number, col: string, w = 0.36, h = 0.46) => {
    bx(x, y - h / 2, z - w / 2, x + 0.04, y + h / 2, z + w / 2, M.gold);
    bx(x + 0.03, y - h / 2 + 0.05, z - w / 2 + 0.05, x + 0.045, y + h / 2 - 0.05, z + w / 2 - 0.05, mat(col, { rough: 0.9 }));
  };
  photo(-7.85, 1.75, 0.2, '#6a7fa0');
  photo(-7.85, 1.65, 1.0, '#a07a6a', 0.5, 0.36);
  photo(-7.85, 1.8, 1.8, '#7aa07a');
  bx(-7.85, 1.4, 2.35, -7.8, 1.9, 2.75, M.cardboard); // the back of a frame: someone's out of favour
  sign([{ t: 'It is THURSDAY.', s: 1.1 }, { t: 'It is AFTERNOON.', s: 1.1 }, { t: 'You are at SUNNY PINES.', s: 0.7 }], -7.84, 2.5, 1.2, 'e', 1.2, 0.5, { bg: '#ffffff', fg: '#111111', border: '#1d1d1d' });

  // Heirloom plinths with their laminated notices.
  const PLAQUE: SignStyle = { bg: '#fffef8', fg: '#2b2b2b', border: '#b23a3a' };
  const plinths: [string, Face, number, Line[]][] = [
    ["Nana's Things, north of her chair", 'e', 0.6, [{ t: "MRS ______'S THINGS", s: 1 }, { t: 'Please Do Not Touch', s: 0.8, b: false }]],
    ["Nana's Things, south of her chair", 'e', 0.6, [{ t: "MRS ______'S THINGS", s: 1 }, { t: 'Please Do Not Touch', s: 0.8, b: false }]],
    ['Day Room plinth by the glass', 'n', 0.6, [{ t: "MRS ______'S THINGS", s: 1 }, { t: '(continued)', s: 0.8, b: false }]],
    ["Nana's silver, Dining Hall", 'e', 0.6, [{ t: "MRS ______'S SILVER", s: 1 }, { t: 'Do not polish. Do not count.', s: 0.7, b: false }]],
    ['Dining Hall plinth by the hatch', 'w', 0.6, [{ t: 'NOT FOR SERVING', s: 1 }, { t: '(we tried)', s: 0.8, b: false }]],
    ['Sun Lounge plinth (north)', 's', 0.6, [{ t: "MRS ______'S THINGS", s: 1 }, { t: '(overflow)', s: 0.8, b: false }]],
    ['Sun Lounge plinth by the yoga mats', 'e', 0.6, [{ t: 'NOT A YOGA BLOCK', s: 1 }]],
    ["Nurses' Station: confiscated", 'w', 0.6, [{ t: 'CONFISCATED', s: 1, c: '#b23a3a' }, { t: 'from Mrs ______ (again)', s: 0.7, b: false }]],
    ['Reception plinth: awaiting collection', 'n', 0.6, [{ t: 'AWAITING COLLECTION', s: 1 }, { t: 'by next of kin', s: 0.8, b: false }]],
  ];
  for (const b of def.boxes.filter((q) => q.kind === 'pedestal')) {
    pedestal(v, b, M.plinth);
    const p = plinths.find((q) => q[0] === b.label);
    if (!p) continue;
    const [, face, y, lines] = p;
    const cx = (b.min.x + b.max.x) / 2 - X, cz = (b.min.z + b.max.z) / 2;
    const off = (b.max.x - b.min.x) / 2 - 0.115;
    const at = { e: [cx + off, cz], w: [cx - off, cz], s: [cx, cz + off], n: [cx, cz - off] }[face];
    sign(lines, at[0], y, at[1], face, 0.5, 0.26, PLAQUE);
  }

  // The fish tank: Lucky III.
  {
    const b = one('Fish tank cabinet');
    bx(b.min.x - X, 0, b.min.z, b.max.x - X, 0.85, b.max.z, M.teak, true);
    bx(b.min.x - X + 0.05, 0.85, b.min.z + 0.03, b.max.x - X - 0.05, 1.5, b.max.z - 0.03, M.glass);
    bx(b.min.x - X + 0.08, 0.86, b.min.z + 0.06, b.max.x - X - 0.08, 1.36, b.max.z - 0.06, M.water);
    bx(b.min.x - X + 0.08, 0.86, b.min.z + 0.06, b.max.x - X - 0.08, 0.92, b.max.z - 0.06, mat('#d8c39a', { rough: 1 }));
    bx(b.min.x - X + 0.03, 1.5, b.min.z + 0.01, b.max.x - X - 0.03, 1.56, b.max.z - 0.01, M.black);
    // A little castle and some weed.
    bx(-3.8, 0.92, -3.25, -3.5, 1.15, -3.0, mat('#b8a88a'));
    for (const x of [-3.85, -3.45]) bx(x - 0.05, 1.15, -3.25, x + 0.05, 1.22, -3.0, mat('#b8a88a'));
    for (const x of [-4.2, -3.1, -2.85]) cyl(x, 0.92, -3.1, 0.03, 0.35, M.leaf, 5, 0.01);
    sign([{ t: 'LUCKY III', s: 1 }, { t: 'Please do not tap the glass.', s: 0.55, b: false }, { t: 'The others died of fright.', s: 0.55, b: false }], -3.5, 1.95, -3.33, 's', 0.9, 0.42, ST.laminate);
  }

  // The bingo board: big, lit, eyes down at two.
  {
    const b = one('Bingo board');
    bx(b.min.x - X, 0, b.min.z, b.max.x - X, 0.12, b.max.z, M.black, true);
    bx(b.min.x - X + 0.05, 0.12, b.min.z + 0.2, b.max.x - X - 0.05, 0.5, b.min.z + 0.28, M.chrome, true);
    bx(b.min.x - X + 0.05, 0.12, b.max.z - 0.28, b.max.x - X - 0.05, 0.5, b.max.z - 0.2, M.chrome, true);
    bx(b.min.x - X, 0.5, b.min.z, b.max.x - X, H - 0.9, b.max.z, mat('#7a1f3a', { rough: 0.5 }), true);
    const called = new Set([3, 7, 11, 22, 23, 31, 39, 44, 52, 66, 69, 71, 77, 85, 88, 90]);
    const tex = canvasTex(512, 400, (g) => {
      g.fillStyle = '#5a1028'; g.fillRect(0, 0, 512, 400);
      g.fillStyle = '#ffd84a'; g.font = `bold 46px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('B I N G O', 256, 34);
      g.font = `bold 15px ${SANS}`; g.fillStyle = '#ffd0d8';
      g.fillText('EYES DOWN 2pm  ·  CASH PRIZE: A BISCUIT', 256, 70);
      for (let n = 1; n <= 90; n++) {
        const col = (n - 1) % 10, row = Math.floor((n - 1) / 10);
        const x = 36 + col * 49, y = 104 + row * 32;
        const lit = called.has(n);
        g.fillStyle = lit ? '#fff3a0' : '#3a0a1a';
        g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.fill();
        g.fillStyle = lit ? '#5a1028' : '#8a5a6a';
        g.font = `bold 15px ${SANS}`;
        g.fillText(String(n), x, y + 1);
      }
    }, false);
    const bm = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.6 });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.25), bm);
    scr.position.set(b.min.x - 0.006, 1.4, (b.min.z + b.max.z) / 2);
    scr.rotation.y = -Math.PI / 2;
    add(scr);
    sign([{ t: 'Last called: 88', s: 1 }, { t: '"Two fat ladies"', s: 0.7, b: false }, { t: '(please stop saying it, Arthur)', s: 0.55, b: false }], (b.max.x - X) + 0.006, 1.4, (b.min.z + b.max.z) / 2, 'e', 1.1, 0.55, ST.laminate);
  }

  // The piano nobody plays.
  {
    const b = one('Piano nobody plays');
    const x0 = b.min.x - X, x1 = b.max.x - X;
    bx(x0, 0, b.min.z, x1, 1.3, b.min.z + 0.36, M.piano, true);
    bx(x0, 0, b.min.z + 0.36, x1, 0.62, b.max.z - 0.05, M.piano, true);
    bx(x0 + 0.05, 0.62, b.min.z + 0.36, x1 - 0.05, 0.68, b.max.z - 0.02, M.white);
    for (let i = 0; i < 18; i++) bx(x0 + 0.1 + i * 0.075, 0.68, b.min.z + 0.37, x0 + 0.13 + i * 0.075, 0.71, b.min.z + 0.5, M.black);
    bx(x0, 0.71, b.min.z + 0.36, x1, 0.76, b.max.z, M.piano); // lid, firmly shut
    bx(x0 + 0.2, 1.3, b.min.z + 0.02, x1 - 0.2, 1.31, b.min.z + 0.34, M.lace);
    cyl(x0 + 0.35, 1.31, b.min.z + 0.18, 0.07, 0.22, mat('#7aa0c8', { rough: 0.3 }));
    for (const [dx, col] of [[-0.03, '#e05a6a'], [0.03, '#f0d050'], [0, '#ffffff']] as const) sph(x0 + 0.35 + dx, 1.6, b.min.z + 0.18 + dx, 0.06, mat(col));
    bx(x1 - 0.5, 1.31, b.min.z + 0.1, x1 - 0.28, 1.56, b.min.z + 0.13, M.gold);
    sign([{ t: 'PLEASE DO NOT PLAY', s: 1 }, { t: 'Mr Pearce is resting.', s: 0.7, b: false }, { t: '(since March)', s: 0.6, b: false }], (x0 + x1) / 2, 1.05, b.min.z + 0.365, 's', 0.7, 0.36, ST.laminate);
  }

  // The telly: enormous, and on.
  const tvTex = canvasTex(512, 288, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 288);
    grd.addColorStop(0, '#2a5fb0'); grd.addColorStop(1, '#0e2a5a');
    g.fillStyle = grd; g.fillRect(0, 0, 512, 288);
    g.fillStyle = '#d9b34a'; g.fillRect(0, 0, 512, 46);
    g.fillStyle = '#1b1b1b'; g.font = `bold 30px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('HEIRLOOM HUNTERS', 256, 24);
    g.fillStyle = '#f2ead8'; g.fillRect(170, 80, 22, 120); g.fillRect(150, 190, 62, 18);
    g.fillStyle = '#3a6ac0'; g.beginPath(); g.ellipse(181, 70, 26, 30, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.font = `bold 24px ${SANS}`; g.textAlign = 'left';
    g.fillText('Lot 7: Nana\'s vase', 240, 100);
    g.font = `20px ${SANS}`; g.fillText('Est. £4,000 – £6,000', 240, 134);
    g.fillText('"Was it a gift?"', 240, 166);
    g.fillStyle = '#4ae06a'; g.font = `bold 18px ${SANS}`; g.fillText('VOL', 24, 258);
    for (let i = 0; i < 20; i++) g.fillRect(70 + i * 12, 248, 9, 20);
    g.fillText('100', 320, 258);
    g.fillStyle = '#ffffff'; g.font = `16px ${SANS}`; g.textAlign = 'right'; g.fillText('[DRAMATIC MUSIC, TOO LOUD]', 500, 225);
  }, false);
  const tvMat = new THREE.MeshStandardMaterial({ map: tvTex, emissive: '#ffffff', emissiveMap: tvTex, emissiveIntensity: 0.95, roughness: 0.3 });
  {
    const b = one('Telly cabinet');
    bx(b.min.x - X, 0, b.min.z, b.max.x - X, 0.7, b.max.z, M.teak, true);
    for (const z of [0.15, 0.95, 1.75]) bx(b.min.x - X - 0.01, 0.12, z, b.min.x - X, 0.6, z + 0.6, M.darkPine);
    bx(5.72, 0.85, -0.55, 5.85, 2.55, 2.55, M.black, true);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.6), tvMat);
    scr.position.set(X + 5.715, 1.7, 1.0);
    scr.rotation.y = -Math.PI / 2;
    add(scr);
    bx(5.4, 0.7, 0.5, 5.6, 0.74, 0.75, M.black); // the remote, chained to the cabinet
    sign([{ t: 'VOLUME: 100', s: 1 }, { t: 'Please do not adjust', s: 0.7, b: false }, { t: '— Mrs ______', s: 0.6, b: false }], 5.84, 2.78, 1.0, 'w', 0.9, 0.36, ST.laminate);
  }

  // The residents' armchairs, in a semicircle round the telly: wipe-clean vinyl, antimacassars, one reserved.
  const armchair = (b: Box, k: number, extra?: (g: THREE.Group, put: (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: THREE.Material) => void) => void) => {
    const cx = (b.min.x + b.max.x) / 2 - X, cz = (b.min.z + b.max.z) / 2;
    const vin = M.vinyl[k % M.vinyl.length];
    turned(cx, cz, yawTo(cx, cz, 5.6, 1.0), (g, put) => {
      put(-0.36, 0.0, -0.3, 0.36, 0.08, 0.34, M.darkPine);
      for (const [x, z] of [[-0.32, -0.28], [0.28, -0.28], [-0.32, 0.28], [0.28, 0.28]]) put(x, 0, z, x + 0.05, 0.1, z + 0.05, M.darkPine);
      put(-0.3, 0.1, -0.32, 0.3, 0.46, 0.3, vin);
      put(-0.32, 0.46, 0.18, 0.32, 1.0, 0.34, vin);
      put(-0.36, 0.1, -0.32, -0.28, 0.66, 0.3, M.darkPine);
      put(0.28, 0.1, -0.32, 0.36, 0.66, 0.3, M.darkPine);
      put(-0.16, 0.78, 0.155, 0.16, 0.98, 0.18, M.lace);
      extra?.(g, put);
    }, true);
  };
  const chairs = def.boxes.filter((q) => q.label?.startsWith('Armchair'));
  chairs.forEach((b, i) => armchair(b, i, b.label?.includes('reserved') ? (g, put) => {
    // Flowers on the seat, and a card.
    put(-0.12, 0.46, -0.1, 0.12, 0.5, 0.1, mat('#f4f0e6'));
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), signMaterial([{ t: 'RESERVED', s: 1 }, { t: 'Mr Pearce', s: 0.8, b: false }], 0.4, 0.2, ST.laminate));
    card.position.set(0, 0.64, 0.175);
    card.rotation.y = Math.PI;
    g.add(card);
    for (const [dx, dz, col] of [[-0.06, 0, '#f2f2f2'], [0.05, 0.03, '#f5e050'], [0, -0.05, '#ffffff']] as const) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(col));
      s.position.set(dx, 0.56, dz);
      g.add(s);
    }
  } : b.label?.includes('centre') ? (_g, put) => {
    // A cardigan over the arm, slippers in front.
    put(-0.38, 0.5, -0.2, -0.26, 0.7, 0.25, mat('#8a6fa8', { rough: 1 }));
    put(-0.2, 0, -0.62, -0.06, 0.06, -0.36, mat('#8a3a3a', { rough: 1 }));
    put(0.04, 0, -0.62, 0.18, 0.06, -0.36, mat('#8a3a3a', { rough: 1 }));
  } : undefined));
  // A zimmer frame parked by a chair.
  {
    const zx = 1.55, zz = 2.35;
    for (const [dx, dz] of [[0, 0], [0.5, 0], [0, 0.4], [0.5, 0.4]]) cyl(zx + dx, 0, zz + dz, 0.018, 0.82, M.chrome, 6);
    bx(zx, 0.8, zz - 0.02, zx + 0.5, 0.84, zz + 0.02, M.chrome);
    bx(zx - 0.02, 0.8, zz, zx + 0.02, 0.84, zz + 0.4, M.chrome);
    bx(zx + 0.48, 0.8, zz, zx + 0.52, 0.84, zz + 0.4, M.chrome);
    for (const [dx, dz] of [[0, 0.4], [0.5, 0.4]]) sph(zx + dx, 0.03, zz + dz, 0.04, mat('#d8e04a', { rough: 0.9 })); // tennis balls
  }

  // Day Room walls: the banner, a noticeboard, sanitiser.
  {
    // "HAPPY 100th DORIS!" — one end has come unstuck.
    sign([{ t: 'HAPPY 100th DORIS!', s: 1, c: '#c8286a' }], -3.4, 2.62, -3.33, 's', 2.4, 0.34, { bg: '#fff3a8', fg: '#c8286a' });
    sign([{ t: 'x', s: 1, c: '#fff3a8' }], -1.95, 2.42, -3.32, 's', 0.6, 0.3, { bg: '#fff3a8', fg: '#fff3a8' }, -0.55);
    cyl(-4.7, 2.45, -3.25, 0.12, 0.3, mat('#e04a6a', { rough: 0.3 }), 10); // a balloon, deflating
    cyl(-4.7, 2.2, -3.25, 0.004, 0.25, M.white, 4);
    // Resident of the Month.
    bx(-6.9, 1.2, 5.8, -5.3, 2.2, 5.85, mat('#b0865a', { rough: 0.9 }));
    sign([{ t: 'RESIDENT OF THE MONTH', s: 0.8 }, { t: 'Mr A. Pearce', s: 1, f: HAND }, { t: '(posthumous)', s: 0.6, b: false }], -6.1, 1.7, 5.79, 'n', 1.4, 0.8, ST.white);
    // Sunny Pines' values.
    sign([{ t: 'SUNNY PINES', s: 0.9, c: '#24704a' }, { t: 'Our Values', s: 0.6, b: false }, { t: 'Dignity · Respect · Probate', s: 0.7 }], 3.1, 2.52, 5.83, 'n', 1.6, 0.5, { bg: '#f6fbf4', fg: '#2a2a2a', border: '#24704a', font: SERIF });
    // Hand gel by every door.
    const gel = (x: number, z: number, f: Face) => {
      const o = f === 'e' ? [0.05, 0] : f === 'w' ? [-0.05, 0] : f === 's' ? [0, 0.05] : [0, -0.05];
      bx(x - 0.08 + Math.min(0, o[0]), 1.15, z - 0.08 + Math.min(0, o[1]), x + 0.08 + Math.max(0, o[0]), 1.4, z + 0.08 + Math.max(0, o[1]), M.white);
      sign(['HAND GEL'], x + o[0] * 1.7, 1.48, z + o[1] * 1.7, f, 0.22, 0.07, ST.nhs);
    };
    gel(2.2, -3.38, 's');
    gel(-7.82, -0.7, 'e');
    gel(-2.95, 5.82, 'n');
    gel(6.18, -6.2, 'e');
    gel(8.27, 1.3, 'w');
  }

  // ═════════════════ The Dining Hall ═════════════════
  {
    const b = one('Family Dinner table');
    const { min: a, max: c } = b;
    // A long table under a wipe-clean cloth.
    const cloth = mat('#f4f1ea', { rough: 0.9 });
    add(boxMesh(a.x - 0.08, c.y - 0.03, a.z - 0.08, c.x + 0.08, c.y + 0.005, c.z + 0.08, cloth), true);
    add(boxMesh(a.x - 0.08, c.y - 0.26, a.z - 0.09, c.x + 0.08, c.y - 0.03, a.z - 0.08, cloth));
    add(boxMesh(a.x - 0.08, c.y - 0.26, c.z + 0.08, c.x + 0.08, c.y - 0.03, c.z + 0.09, cloth));
    for (const [x, z] of [[a.x + 0.1, a.z + 0.1], [c.x - 0.1, a.z + 0.1], [a.x + 0.1, c.z - 0.1], [c.x - 0.1, c.z - 0.1], [(a.x + c.x) / 2, a.z + 0.1], [(a.x + c.x) / 2, c.z - 0.1]]) {
      add(boxMesh(x - 0.04, 0, z - 0.04, x + 0.04, c.y - 0.03, z + 0.04, M.darkPine));
    }
    // Place settings: mats, beakers with lids, bibs.
    const S = def.spawns;
    const seats = [...S.dinnerCousins, S.dinnerGrandma];
    for (const s of seats) {
      const dx = Math.max(a.x, Math.min(c.x, s.x)) - s.x, dz = Math.max(a.z, Math.min(c.z, s.z)) - s.z;
      const len = Math.hypot(dx, dz) || 1;
      const px = s.x + (dx / len) * (len + 0.25), pz = s.z + (dz / len) * (len + 0.25);
      add(boxMesh(px - 0.17, c.y + 0.005, pz - 0.13, px + 0.17, c.y + 0.012, pz + 0.13, mat('#9ac0d8', { rough: 0.6 })));
      const beaker = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.11, 10), mat('#f2a0b8', { rough: 0.4 }));
      beaker.position.set(px + 0.13, c.y + 0.06, pz - 0.06);
      add(beaker);
      // A dining chair, tucked in.
      const cx = s.x + (dx / len) * (len - 0.15), cz = s.z + (dz / len) * (len - 0.15);
      const yaw = Math.atan2(-dx, -dz);
      turned(cx - X, cz, yaw, (_g, put) => {
        put(-0.22, 0.42, -0.22, 0.22, 0.48, 0.2, mat('#3f7a6a', { rough: 0.5 }));
        for (const [x, z] of [[-0.21, -0.21], [0.17, -0.21], [-0.21, 0.17], [0.17, 0.17]]) put(x, 0, z, x + 0.04, 0.42, z + 0.04, M.pine);
        put(-0.22, 0.48, 0.17, 0.22, 0.95, 0.21, M.pine);
      });
    }
    // Salt, pepper, a jelly, plastic flowers.
    const mid = { x: (a.x + c.x) / 2 - X, z: (a.z + c.z) / 2 };
    cyl(mid.x - 1.3, c.y, mid.z, 0.025, 0.09, M.white, 8);
    cyl(mid.x - 1.22, c.y, mid.z, 0.025, 0.09, M.black, 8);
    cyl(mid.x + 0.6, c.y, mid.z, 0.16, 0.18, mat('#e8303a', { rough: 0.2 }), 12, 0.11);
    cyl(mid.x - 0.4, c.y, mid.z, 0.06, 0.2, mat('#d8e8f0', { rough: 0.2 }), 10);
    for (const [dx, col] of [[-0.05, '#ffd34a'], [0.05, '#f06a8a'], [0, '#9ad06a']] as const) sph(mid.x - 0.4 + dx, c.y + 0.27, mid.z + dx, 0.05, mat(col));
    sign([{ t: 'FAMILY TABLE', s: 1 }, { t: 'Thursdays only', s: 0.7, b: false }], mid.x - 1.8, c.y + 0.1, mid.z, 's', 0.36, 0.18, { bg: '#ffffff', fg: '#2a5a4a', border: '#2a5a4a' });
  }
  // The serving hatch: steel ledge, roller shutter half up, a dark kitchen beyond.
  {
    const b = one('Serving hatch ledge');
    bx(b.min.x - X, 0, b.min.z, b.max.x - X, 0.95, b.max.z, mat('#5f8f6e', { rough: 0.6 }), true);
    bx(b.min.x - X - 0.05, 0.95, b.min.z, b.max.x - X + 0.05, 1.0, b.max.z + 0.05, M.steel, true);
    bx(b.min.x - X, 1.0, -9.99, b.max.x - X, 1.75, -9.96, mat('#2a2622', { rough: 1, emissive: '#3a2c1a', emissiveIntensity: 0.3 }));
    for (let y = 1.75; y < 2.25; y += 0.06) bx(b.min.x - X, y, -9.99, b.max.x - X, y + 0.05, -9.93, M.steel);
    bx(b.min.x - X - 0.08, 1.0, -9.99, b.min.x - X, 2.3, -9.9, M.frame);
    bx(b.max.x - X, 1.0, -9.99, b.max.x - X + 0.08, 2.3, -9.9, M.frame);
    // Steam and a pot glimpsed through the hatch.
    cyl(3.8, 1.0, -9.97, 0.15, 0.2, M.steel, 12);
    sign([{ t: 'RING FOR SERVICE', s: 0.9 }, { t: "(we won't come)", s: 0.6, b: false }], 2.0, 1.35, -9.98, 's', 0.5, 0.24, ST.laminate);
    cyl(4.4, 1.0, -9.6, 0.06, 0.05, M.chrome, 12);
    sph(4.4, 1.06, -9.6, 0.035, M.chrome);
    sign([{ t: 'KITCHEN', s: 1 }], 3.4, 2.48, -9.98, 's', 0.8, 0.22, ST.pine);
  }
  // The menu board: Soft Food Thursday.
  sign([
    { t: 'TODAY · SOFT FOOD THURSDAY', s: 0.9 }, { t: 'Soup (blended)', s: 0.75, b: false }, { t: 'Fish (blended)', s: 0.75, b: false },
    { t: 'Trifle (already blended)', s: 0.75, b: false }, { t: 'Tea (stewed, lukewarm)', s: 0.75, b: false },
  ], -0.1, 1.65, -9.98, 's', 1.7, 1.1, ST.chalk);
  // The Welsh dresser: commemorative plates of royal weddings.
  {
    const b = one('Welsh dresser');
    bx(b.min.x - X, 0, b.min.z, b.max.x - X, 0.9, b.max.z, M.teak, true);
    bx(b.min.x - X, 0.9, b.min.z, b.min.x - X + 0.2, 2.0, b.max.z, M.teak, true);
    bx(b.min.x - X, 1.95, b.min.z, b.max.x - X, 2.0, b.max.z, M.teak, true);
    for (const y of [1.25, 1.6]) {
      bx(b.min.x - X + 0.2, y - 0.03, b.min.z, b.max.x - X - 0.1, y, b.max.z, M.teak);
      for (let i = 0; i < 4; i++) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 14), mat(['#f2f2f2', '#d8e6f2', '#f2e2d0', '#e6f0e0'][(i + (y > 1.4 ? 1 : 0)) % 4], { rough: 0.3 }));
        p.rotation.z = Math.PI / 2;
        p.position.set(X + b.min.x - X + 0.24, y + 0.14, b.min.z + 0.22 + i * 0.38);
        add(p);
      }
    }
    for (let i = 0; i < 3; i++) bx(b.max.x - X, 0.15, b.min.z + 0.1 + i * 0.5, b.max.x - X + 0.01, 0.8, b.min.z + 0.55 + i * 0.5, M.darkPine);
  }
  // The tray trolley.
  {
    const b = one('Tray trolley');
    const x0 = b.min.x - X, x1 = b.max.x - X;
    for (const [x, z] of [[x0, b.min.z], [x1 - 0.04, b.min.z], [x0, b.max.z - 0.04], [x1 - 0.04, b.max.z - 0.04]]) {
      bx(x, 0.06, z, x + 0.04, 1.0, z + 0.04, M.chrome, true);
      sph(x + 0.02, 0.04, z + 0.02, 0.04, M.black);
    }
    for (const y of [0.25, 0.55, 0.96]) bx(x0, y, b.min.z, x1, y + 0.04, b.max.z, M.steel, true);
    for (const y of [0.29, 0.59]) bx(x0 + 0.05, y, b.min.z + 0.04, x1 - 0.05, y + 0.03, b.max.z - 0.04, M.tray);
    cyl(x0 + 0.25, 1.0, b.min.z + 0.3, 0.1, 0.08, mat('#e8e0c8', { rough: 0.5 }), 10);
  }
  sign([{ t: 'PLEASE DO NOT', s: 0.9 }, { t: 'FEED THE RESIDENTS', s: 1 }, { t: 'between meals', s: 0.6, b: false }], -5.0, 1.75, -3.67, 'n', 1.2, 0.55, ST.pine);
  sign([{ t: 'ALLERGIES', s: 1, c: '#b23a3a' }, { t: 'Nuts · Gluten · Shellfish', s: 0.7, b: false }, { t: "Mrs Oduya's son", s: 0.7, b: false }], 5.83, 1.6, -5.8, 'w', 0.9, 0.55, ST.laminate);
  // A clock stopped at four.
  {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 20), M.white);
    c.rotation.x = Math.PI / 2;
    c.position.set(X - 1.5, 2.45, -3.69);
    add(c);
    bx(-1.51, 2.45, -3.73, -1.49, 2.62, -3.71, M.black);
    bx(-1.5, 2.36, -3.73, -1.38, 2.38, -3.71, M.black);
  }

  // ═════════════════ The Sun Lounge ═════════════════
  // Jigsaws on card tables (both half-finished, both missing pieces).
  const jigsaw = canvasTex(256, 256, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#8ac8f0'); grd.addColorStop(0.55, '#d8f0ff'); grd.addColorStop(0.56, '#6aa84a'); grd.addColorStop(1, '#3a7a32');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#ffffff'; g.fillRect(90, 90, 80, 50); g.fillStyle = '#8a3a2a'; g.beginPath(); g.moveTo(80, 92); g.lineTo(130, 60); g.lineTo(180, 92); g.fill();
    g.fillStyle = '#2f6b45';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (x + y * 0.7 > 7.5 || (x === 3 && y === 2)) g.fillRect(x * 32, y * 32, 32, 32);
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 256); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke(); }
  }, false);
  for (const label of ['Jigsaw table (north)', 'Jigsaw table (south)']) {
    const b = one(label);
    table(v, b, M.baize, M.chrome);
    const jg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), mat('#ffffff', { map: jigsaw, rough: 0.9 }));
    jg.rotation.x = -Math.PI / 2;
    jg.position.set((b.min.x + b.max.x) / 2, b.max.y + 0.004, (b.min.z + b.max.z) / 2);
    add(jg);
    // The box lid, propped up.
    bx(b.min.x - X + 0.05, b.max.y, b.max.z - 0.12, b.min.x - X + 0.5, b.max.y + 0.3, b.max.z - 0.08, mat('#3a6a9a'));
    // Folding chairs.
    for (const [dx, dz] of [[0, -1.0], [0, 1.0], [-1.0, 0]]) {
      const cx = (b.min.x + b.max.x) / 2 - X + dx * 0.95, cz = (b.min.z + b.max.z) / 2 + dz * 0.95;
      turned(cx, cz, yawTo(cx, cz, (b.min.x + b.max.x) / 2 - X, (b.min.z + b.max.z) / 2), (_g, put) => {
        put(-0.2, 0.42, -0.2, 0.2, 0.46, 0.2, mat('#d8742a', { rough: 0.5 }));
        put(-0.2, 0.46, 0.17, 0.2, 0.85, 0.2, mat('#d8742a', { rough: 0.5 }));
        for (const [x, z] of [[-0.19, -0.19], [0.16, -0.19], [-0.19, 0.16], [0.16, 0.16]]) put(x, 0, z, x + 0.03, 0.42, z + 0.03, M.chrome);
      });
    }
  }
  sign([{ t: '1000 PIECES', s: 0.7 }, { t: '"ETERNAL REST"', s: 1 }, { t: '(3 missing)', s: 0.6, b: false }], -12.325, 0.9, -4.875, 's', 0.42, 0.26, { bg: '#3a6a9a', fg: '#ffffff' });
  // The whiteboard on wheels: today's activities.
  {
    const b = one("Whiteboard: today's activities");
    const x0 = b.min.x - X, x1 = b.max.x - X;
    for (const x of [x0, x1 - 0.05]) {
      bx(x, 0.05, b.min.z - 0.25, x + 0.05, 1.9, b.max.z + 0.25, M.chrome, true);
      sph(x + 0.025, 0.04, b.min.z - 0.2, 0.04, M.black);
      sph(x + 0.025, 0.04, b.max.z + 0.2, 0.04, M.black);
    }
    bx(x0 + 0.05, 0.75, b.min.z, x1 - 0.05, 1.9, b.max.z, M.white, true);
    sign([
      { t: 'TODAY', s: 1.1, c: '#c8282d' }, { t: 'Bingo · 2pm', s: 0.9 }, { t: 'Chair Yoga · 3pm', s: 0.9 },
      { t: 'Reading of the Will · 4pm', s: 0.9, c: '#c8282d' }, { t: 'Tea · whenever it turns up', s: 0.6, b: false },
    ], (x0 + x1) / 2, 1.32, b.max.z + 0.005, 's', 1.6, 1.05, ST.board);
    sign([
      { t: 'QUIZ ANSWERS', s: 1 }, { t: '1. 1953   2. Vera Lynn', s: 0.8, b: false }, { t: '3. No   4. Also no', s: 0.8, b: false }, { t: '5. Arthur, it was always Arthur', s: 0.7, b: false },
    ], (x0 + x1) / 2, 1.32, b.min.z - 0.005, 'n', 1.6, 1.05, ST.board);
  }
  // Chair yoga: a ring of plastic chairs on mats, foam balls, a sign.
  {
    const cx = -11.0, cz = 3.4;
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + 0.3;
      const x = cx + Math.cos(ang) * 1.45, z = cz + Math.sin(ang) * 1.3;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), mat(['#7a4ab0', '#2aa0a0', '#e05a8a'][i % 3], { rough: 1 }));
      m.rotation.set(-Math.PI / 2, 0, -ang);
      m.position.set(X + x, 0.006, z);
      add(m);
      turned(x, z, yawTo(x, z, cx, cz), (_g, put) => {
        put(-0.22, 0.42, -0.22, 0.22, 0.47, 0.2, mat('#3a8ac8', { rough: 0.45 }));
        put(-0.22, 0.47, 0.16, 0.22, 0.88, 0.2, mat('#3a8ac8', { rough: 0.45 }));
        for (const [px, pz] of [[-0.2, -0.2], [0.17, -0.2], [-0.2, 0.17], [0.17, 0.17]]) put(px, 0, pz, px + 0.03, 0.42, pz + 0.03, M.chrome);
      });
    }
    for (const [x, z, col] of [[-10.2, 4.6, '#f0d050'], [-10.0, 4.75, '#e05a6a'], [-10.25, 4.85, '#5ab0e0']] as const) sph(x, 0.1, z, 0.1, mat(col, { rough: 0.9 }));
    sign([{ t: 'CHAIR YOGA', s: 1, c: '#7a4ab0' }, { t: 'with Bev · 3pm', s: 0.7, b: false }, { t: 'Standing poses are NOT permitted', s: 0.55 }], -9.9, 1.9, 5.83, 'n', 1.0, 0.55, ST.laminate);
  }
  // Potted palms, wicker chairs by the windows, an empty birdcage.
  for (const label of ['Potted palm (north-west)', 'Potted palm (south-east)']) {
    const b = one(label);
    const cx = (b.min.x + b.max.x) / 2 - X, cz = (b.min.z + b.max.z) / 2;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.5, 12), M.pot);
    pot.position.set(X + cx, 0.25, cz);
    add(pot, true);
    cyl(cx, 0.5, cz, 0.04, 1.1, M.darkPine, 6);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 5), M.leaf);
      const ang = (i / 6) * Math.PI * 2;
      leaf.position.set(X + cx + Math.cos(ang) * 0.3, 1.6, cz + Math.sin(ang) * 0.3);
      leaf.rotation.set(Math.sin(ang) * 1.1, 0, -Math.cos(ang) * 1.1);
      add(leaf, true);
    }
    sph(cx, 1.6, cz, 0.18, M.leaf);
  }
  for (const z of [-7.0, -3.4]) {
    turned(-13.4, z, -Math.PI / 2 - 0.3, (_g, put) => {
      const wk = mat('#c8a46a', { rough: 1 });
      put(-0.32, 0, -0.3, 0.32, 0.42, 0.3, wk);
      put(-0.34, 0.42, 0.18, 0.34, 1.05, 0.32, wk);
      put(-0.36, 0.42, -0.3, -0.26, 0.65, 0.3, wk);
      put(0.26, 0.42, -0.3, 0.36, 0.65, 0.3, wk);
      put(-0.28, 0.42, -0.28, 0.28, 0.5, 0.2, mat('#e8d0a0'));
    });
  }
  {
    // Joey's cage (Joey is no longer with us).
    cyl(-9.0, 0, -9.3, 0.18, 0.04, M.gold, 10);
    cyl(-9.0, 0.04, -9.3, 0.02, 1.2, M.gold, 6);
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.5, 12, 1, true), mat('#d4af4a', { rough: 0.4, metal: 0.6 }));
    cage.position.set(X - 9.0, 1.5, -9.3);
    add(cage);
    sph(-9.0, 1.75, -9.3, 0.22, M.gold, 1, 0.4, 1);
    sign([{ t: 'JOEY', s: 1 }, { t: '1998 – 2019', s: 0.7, b: false }], -9.0, 1.12, -9.07, 's', 0.3, 0.16, ST.brass);
  }

  // ═════════════════ The Residents' Corridor ═════════════════
  // Way-finding stripe down the middle: follow the green line to Reception.
  const stripe = mat('#3a9a62', { rough: 0.5 });
  bx(-13.5, 0.003, 7.15, 7.25, 0.008, 7.25, stripe);
  bx(7.15, 0.003, -9.5, 7.25, 0.008, 7.25, stripe);
  bx(7.25, 0.003, 5.1, 11.5, 0.008, 5.2, stripe);
  // Residents' doors on the south wall, each a different pastel, each with its memory box.
  const doorCols = ['#e8a0a0', '#a0c0e8', '#e8d890', '#b0d8a8', '#d0b0e0', '#f0c098'];
  const residents: [number, string, Line[]][] = [
    [-12.6, '1', [{ t: '1', s: 1.2 }, { t: 'Mr A. Pearce', s: 0.6, b: false }]],
    [-10.6, '2', [{ t: '2', s: 1.2 }, { t: 'VACANCY', s: 0.65, c: '#b23a3a' }]],
    [-6.9, '3', [{ t: '3', s: 1.2 }, { t: 'Mrs D. Fairweather', s: 0.55, b: false }]],
    [-3.0, '4', [{ t: '4', s: 1.2 }, { t: 'Mr Okafor', s: 0.6, b: false }]],
    [0.7, '5', [{ t: '5', s: 1.2 }, { t: 'Mrs ______', s: 0.6, f: HAND, c: '#1b3d8f' }, { t: 'NEW!', s: 0.5, c: '#c8282d' }]],
    [4.4, '6', [{ t: '6', s: 1.2 }, { t: 'Miss Platt', s: 0.6, b: false }]],
  ];
  residents.forEach(([x, , lines], i) => {
    const z = 8.4;
    bx(x - 0.55, 0, z - 0.05, x + 0.55, 2.2, z, M.frame);
    bx(x - 0.48, 0, z - 0.07, x + 0.48, 2.12, z - 0.04, mat(doorCols[i % doorCols.length], { rough: 0.5 }));
    bx(x + 0.3, 1.0, z - 0.11, x + 0.4, 1.04, z - 0.07, M.chrome);
    sign(lines, x, 1.62, z - 0.075, 'n', 0.42, 0.34, { bg: '#ffffff', fg: '#222222', border: '#888888' });
    // The memory box beside the door.
    bx(x + 0.62, 1.2, z - 0.1, x + 0.98, 1.6, z, M.pine);
    bx(x + 0.66, 1.24, z - 0.102, x + 0.94, 1.56, z - 0.098, mat(['#d8c0a0', '#a0b8d0', '#c8d8a0'][i % 3], { rough: 0.9 }));
  });
  {
    // Room 2's wreath: a dark green ring with a bow.
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 8, 18), mat('#1f5a32', { rough: 0.9 }));
    w.position.set(X - 10.6, 1.15, 8.3);
    add(w);
    sph(-10.6, 0.95, 8.29, 0.06, mat('#3a2a5a'));
    // Room 5's "Welcome!" balloon, on a string from the handle.
    sph(0.7 + 0.35, 2.4, 8.1, 0.18, mat('#e0405a', { rough: 0.25 }), 1, 1.15, 1);
    cyl(0.7 + 0.35, 1.02, 8.1, 0.004, 1.2, M.white, 4);
  }
  // Lost Property: dentures, a hearing aid, a will.
  {
    const b = one('Lost Property table');
    table(v, b, M.pine, M.pine);
    bx(-8.95, 0.85, 7.9, -8.25, 1.15, 8.22, M.cardboard);
    sph(-8.7, 1.17, 8.05, 0.07, mat('#f4f0e8', { rough: 0.3 }), 1.2, 0.5, 1); // dentures
    sph(-8.7, 1.19, 8.05, 0.05, mat('#e07a8a', { rough: 0.4 }), 1.1, 0.4, 0.9);
    sph(-8.45, 1.17, 8.1, 0.035, mat('#d8b890', { rough: 0.4 }), 1, 1.3, 1); // hearing aid
    bx(-8.95, 1.15, 7.95, -8.75, 1.17, 8.2, M.paper); // a will
    sign([{ t: 'LOST PROPERTY', s: 1 }, { t: 'Teeth · Ears · One (1) Will', s: 0.6, b: false }], -8.6, 1.32, 7.88, 'n', 0.62, 0.22, ST.laminate);
  }
  // The birthday board, with the names crossed off.
  bx(2.3, 1.2, 8.37, 3.6, 2.2, 8.4, mat('#b0865a', { rough: 0.9 }));
  sign([
    { t: 'HAPPY BIRTHDAY!', s: 1, c: '#c8286a' }, { t: 'Doris · 100', s: 0.75, strike: true }, { t: 'Arthur · 94', s: 0.75, strike: true },
    { t: 'Mr Pearce · 91', s: 0.75, strike: true }, { t: 'Mrs ______ · 88', s: 0.75 },
  ], 2.95, 1.7, 8.36, 'n', 1.2, 0.9, { bg: '#fff8e0', fg: '#2a2a2a', font: HAND });
  // The tea trolley, parked.
  {
    const b = one('Tea trolley (parked)');
    const x0 = b.min.x - X, x1 = b.max.x - X;
    for (const [x, z] of [[x0, b.min.z], [x1 - 0.04, b.min.z], [x0, b.max.z - 0.04], [x1 - 0.04, b.max.z - 0.04]]) {
      bx(x, 0.05, z, x + 0.04, 0.95, z + 0.04, M.teak, true);
      sph(x + 0.02, 0.04, z + 0.02, 0.04, M.black);
    }
    for (const y of [0.3, 0.9]) bx(x0, y, b.min.z, x1, y + 0.05, b.max.z, M.teak, true);
    cyl(x0 + 0.3, 0.95, b.min.z + 0.27, 0.18, 0.4, M.steel, 12, 0.16); // the urn
    for (let i = 0; i < 3; i++) cyl(x0 + 0.62 + i * 0.12, 0.95, b.min.z + 0.15 + (i % 2) * 0.2, 0.04, 0.09, M.white, 8);
    sph(x0 + 0.75, 0.99, b.min.z + 0.4, 0.07, mat('#d8a04a'), 1, 0.4, 1); // a plate of biscuits (rich tea)
  }
  // Corridor signs.
  sign([{ t: 'DAYS SINCE', s: 0.8 }, { t: 'LAST INCIDENT', s: 0.8 }, { t: '0', s: 2.2, c: '#c8282d', f: HAND }], -6.0, 1.75, 6.17, 's', 0.7, 0.8, ST.white);
  sign([{ t: '↑ Day Room', s: 1 }, { t: '← Sun Lounge', s: 1 }, { t: '→ Reception · Dining Hall', s: 1 }], -4.4, 2.35, 6.17, 's', 1.1, 0.5, ST.pine);
  sign([{ t: 'FIRE ASSEMBLY POINT', s: 0.8 }, { t: 'The car park', s: 0.6, b: false }, { t: '(slowly)', s: 0.6, b: false }], -13.98, 1.75, 7.2, 'e', 0.8, 0.45, ST.pine);
  sign([{ t: 'FIRE DOOR', s: 1 }, { t: 'KEEP SHUT', s: 1 }], -2.95, 2.0, 6.17, 's', 0.36, 0.24, ST.nhs);
  // The corridor's north end: the fire exit and a vending machine that is out of order.
  bx(6.6, 0, -9.99, 7.9, 2.2, -9.95, mat('#d8dcd8', { rough: 0.4 }));
  bx(6.7, 0.1, -9.96, 7.8, 2.1, -9.93, windows);
  bx(6.7, 1.0, -9.94, 7.8, 1.06, -9.9, mat('#c8282d'));
  sign([{ t: 'FIRE EXIT →', s: 1 }], 7.25, 2.4, -9.9, 's', 0.7, 0.22, ST.exit);
  sign([{ t: 'ALARMED', s: 1 }, { t: "(it isn't)", s: 0.7, b: false }], 7.25, 1.55, -9.92, 's', 0.4, 0.2, ST.warn);
  {
    const b = one('Vending machine (out of order)');
    bx(b.min.x - X, 0, b.min.z, b.max.x - X, 1.6, b.max.z, mat('#2a5aa8', { rough: 0.4 }), true);
    bx(b.min.x - X + 0.1, 0.6, b.max.z, b.max.x - X - 0.35, 1.5, b.max.z + 0.01, M.glass);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) bx(b.min.x - X + 0.14 + c * 0.17, 0.66 + r * 0.28, b.max.z - 0.05, b.min.x - X + 0.26 + c * 0.17, 0.84 + r * 0.28, b.max.z - 0.01, mat(['#e8c04a', '#e05a6a', '#f2f2f2', '#6ab04a'][(r + c) % 4]));
    sign([{ t: 'OUT OF ORDER', s: 1 }, { t: 'since 2014', s: 0.6, b: false }], (b.min.x + b.max.x) / 2 - X - 0.1, 1.2, b.max.z + 0.02, 's', 0.6, 0.3, { bg: '#ffffff', fg: '#c8282d', font: HAND }, 0.12);
  }
  // Staff-only signs on the meds-room and sluice doors.
  sign([{ t: "NURSES' STATION", s: 0.9 }, { t: 'STAFF ONLY', s: 0.7 }], 8.24, 2.45, -4.9, 'w', 0.9, 0.3, ST.nhs);
  sign([{ t: 'SLUICE', s: 1 }, { t: 'STAFF ONLY · KEEP LOCKED', s: 0.55 }], 8.24, 2.45, 0, 'w', 0.8, 0.3, ST.nhs);
  sign([{ t: 'MEDICATION ROOM', s: 0.8 }, { t: 'Do not tap on the glass either', s: 0.5, b: false }], 8.24, 2.35, -8.0, 'w', 1.0, 0.26, ST.nhs);
  // A fire extinguisher wedging the sluice door open.
  cyl(8.75, 0, 1.05, 0.09, 0.55, M.redCross, 10);
  cyl(8.75, 0.55, 1.05, 0.03, 0.08, M.black, 6);
  // The east arm's west wall.
  sign([{ t: 'PLEASE KEEP', s: 0.8 }, { t: 'CORRIDORS CLEAR', s: 0.8 }, { t: '(of residents)', s: 0.55, b: false }], 6.17, 1.75, -2.5, 'e', 0.7, 0.45, ST.white);
  sign([{ t: 'DINING HALL', s: 1 }, { t: '↑', s: 1 }], 6.17, 2.45, -5.7, 'e', 0.6, 0.35, ST.pine);
  {
    // A wheelchair parked against the telly wall (on the corridor side).
    const wb = one('Wheelchair (parked)');
    const wx = (wb.min.x + wb.max.x) / 2 - X, wz = (wb.min.z + wb.max.z) / 2;
    for (const dz of [-0.28, 0.28]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 6, 16), M.black);
      wheel.position.set(X + wx, 0.3, wz + dz);
      add(wheel);
    }
    bx(wx - 0.2, 0.45, wz - 0.25, wx + 0.2, 0.5, wz + 0.25, mat('#2a4a8a'), true);
    bx(wx - 0.3, 0.5, wz - 0.25, wx - 0.26, 0.95, wz + 0.25, mat('#2a4a8a'), true);
    for (const dz of [-0.27, 0.27]) bx(wx - 0.3, 0.9, wz + dz - 0.015, wx - 0.1, 0.93, wz + dz + 0.015, M.chrome);
    bx(wx + 0.15, 0.08, wz - 0.18, wx + 0.3, 0.1, wz + 0.18, M.chrome);
  }

  // ═════════════════ The Nurses' Station ═════════════════
  {
    const b = one("Nurses' desk");
    bx(b.min.x - X, 0, b.min.z, b.max.x - X, 0.96, b.max.z, mat('#dcd6c8', { rough: 0.5 }), true);
    bx(b.min.x - X, 0.96, b.min.z, b.max.x - X + 0.04, 1.0, b.max.z, mat('#b8a888', { rough: 0.5 }), true);
    // A beige computer, a phone, the sign-in book, a mug.
    bx(8.6, 1.0, -8.9, 9.0, 1.35, -8.45, mat('#d8d0b8', { rough: 0.6 }));
    bx(8.99, 1.06, -8.85, 9.0, 1.3, -8.5, mat('#3a5a6a', { emissive: '#2a6a7a', emissiveIntensity: 0.6 }));
    bx(9.0, 1.0, -8.0, 9.1, 1.08, -7.75, M.black);
    bx(8.65, 1.0, -7.5, 9.0, 1.03, -7.1, M.paper);
    cyl(8.85, 1.0, -6.85, 0.045, 0.1, mat('#e8e0f0'), 10);
  }
  {
    const b = one('Medication cabinet');
    bx(b.min.x - X, 0, b.min.z, b.max.x - X, 2.0, b.max.z, M.white, true);
    for (let i = 0; i < 3; i++) bx(b.min.x - X + 0.04 + i * 0.64, 0.05, b.max.z, b.min.x - X + 0.62 + i * 0.64, 1.95, b.max.z + 0.01, mat('#f2f4f2', { rough: 0.4 }));
    // The fourth door ajar (the key still in it), the shelves of pills behind it.
    bx(11.96, 0.05, b.max.z - 0.4, 12.54, 1.95, b.max.z - 0.38, mat('#dfe6e2', { rough: 0.8 }));
    bx(12.5, 0.05, b.max.z + 0.01, 12.55, 1.95, b.max.z + 0.55, mat('#f2f4f2', { rough: 0.4 }));
    for (const y of [0.4, 0.8, 1.2, 1.6]) {
      bx(11.96, y - 0.02, b.min.z + 0.05, 12.54, y, b.max.z - 0.02, M.white);
      for (let i = 0; i < 5; i++) bx(11.98 + i * 0.11, y, b.max.z - 0.2, 12.06 + i * 0.11, y + 0.14, b.max.z - 0.06, mat(['#f2f2f2', '#e0a0a0', '#a0c0e0', '#f0e0a0'][(i + Math.round(y * 10)) % 4]));
    }
    bx(11.86, 1.0, b.max.z + 0.01, 11.9, 1.06, b.max.z + 0.06, M.gold);
    bx(11.0, 1.4, b.max.z + 0.012, 11.4, 1.8, b.max.z + 0.013, M.redCross);
    sign([{ t: 'MEDICATION', s: 1 }, { t: 'KEEP LOCKED AT ALL TIMES', s: 0.6 }], 10.65, 1.65, b.max.z + 0.015, 's', 0.9, 0.3, ST.red);
  }
  {
    const b = one('Drugs trolley');
    bx(b.min.x - X, 0.1, b.min.z, b.max.x - X, 0.96, b.max.z, mat('#3a7ac0', { rough: 0.4 }), true);
    bx(b.min.x - X - 0.02, 0.96, b.min.z - 0.02, b.max.x - X + 0.02, 1.0, b.max.z + 0.02, M.white, true);
    for (const [x, z] of [[b.min.x - X + 0.06, b.min.z + 0.06], [b.max.x - X - 0.06, b.min.z + 0.06], [b.min.x - X + 0.06, b.max.z - 0.06], [b.max.x - X - 0.06, b.max.z - 0.06]]) sph(x, 0.05, z, 0.05, M.black);
    for (let i = 0; i < 4; i++) bx(b.min.x - X + 0.05, 0.2 + i * 0.18, b.max.z, b.max.x - X - 0.05, 0.34 + i * 0.18, b.max.z + 0.01, mat('#5a9ad8', { rough: 0.4 }));
    // The chain that is supposed to fix it to the wall, hanging loose.
    for (let i = 0; i < 6; i++) bx(b.max.x - X + 0.01, 0.62 - i * 0.09, b.min.z + 0.3, b.max.x - X + 0.04, 0.68 - i * 0.09, b.min.z + 0.33, M.chrome);
    sign([{ t: 'DRUGS TROLLEY', s: 1 }, { t: 'MUST BE CHAINED TO WALL', s: 0.6 }], (b.min.x + b.max.x) / 2 - X, 0.55, b.min.z - 0.005, 'n', 0.7, 0.24, ST.warn);
  }
  // The staff noticeboard.
  bx(12.96, 1.1, -9.2, 13.0, 2.1, -7.6, mat('#b0865a', { rough: 0.9 }));
  sign([{ t: 'DAYS SINCE LAST INCIDENT', s: 0.6 }, { t: '0', s: 2, c: '#c8282d', f: HAND }, { t: '(it was the remote again)', s: 0.5, b: false }], 12.95, 1.6, -8.4, 'w', 0.8, 0.8, ST.white);
  sign([{ t: 'DO NOT GIVE', s: 0.9 }, { t: 'MRS ______', s: 0.9 }, { t: 'THE REMOTE', s: 0.9 }], 12.97, 1.75, -6.7, 'w', 0.55, 0.45, { bg: '#ffef8a', fg: '#222222', font: HAND });
  // A confiscated hip flask and a vape at the plinth's foot.
  bx(12.2, 0, -4.65, 12.35, 0.2, -4.55, M.chrome);
  bx(12.5, 0, -4.66, 12.53, 0.12, -4.6, M.black);

  // ═════════════════ The Sluice Room ═════════════════
  {
    const b = one('Washing machines');
    for (let i = 0; i < 3; i++) {
      const z0 = b.min.z + i * 0.86, z1 = z0 + 0.84;
      bx(b.min.x - X, 0, z0, b.max.x - X, 0.9, z1, M.white, true);
      const door = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 18), M.chrome);
      door.rotation.z = Math.PI / 2;
      door.position.set(b.min.x - 0.01, 0.42, (z0 + z1) / 2);
      add(door);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.035, 18), mat('#4a6a8a', { rough: 0.1 }));
      glass.rotation.z = Math.PI / 2;
      glass.position.set(b.min.x - 0.015, 0.42, (z0 + z1) / 2);
      add(glass);
    }
    sign([{ t: 'CARDIGANS: NAME', s: 0.8 }, { t: 'LABELS REQUIRED', s: 0.8 }, { t: 'unclaimed items are re-gifted', s: 0.55, b: false }], 12.98, 1.6, 0.3, 'w', 0.9, 0.45, ST.laminate);
  }
  {
    const b = one('Sluice sink');
    bx(b.min.x - X, 0, b.min.z, b.max.x - X, 0.9, b.max.z, M.steel, true);
    bx(b.min.x - X + 0.1, 0.86, b.min.z + 0.08, b.max.x - X - 0.1, 0.905, b.max.z - 0.08, mat('#6a7478', { rough: 0.3, metal: 0.6 }));
    cyl(9.8, 0.9, 2.15, 0.02, 0.35, M.chrome, 6);
    sign([{ t: 'SLUICE: NOT FOR', s: 0.8 }, { t: 'WASHING UP', s: 0.8 }, { t: 'or anything you love', s: 0.6, b: false }], 9.8, 1.45, 2.24, 'n', 0.8, 0.4, ST.warn);
  }
  {
    const b = one('Shelving: Absorbent Products');
    const x0 = b.min.x - X, x1 = b.max.x - X;
    for (const [x, z] of [[x0, b.min.z], [x1 - 0.04, b.min.z], [x0, b.max.z - 0.04], [x1 - 0.04, b.max.z - 0.04]]) bx(x, 0, z, x + 0.04, 1.9, z + 0.04, M.chrome, true);
    for (const y of [0.1, 0.55, 1.0, 1.45, 1.86]) bx(x0, y, b.min.z, x1, y + 0.03, b.max.z, M.steel, true);
    const packs = [mat('#7ab0e0', { rough: 0.8 }), mat('#f2f2f2', { rough: 0.8 }), mat('#a0d0a0', { rough: 0.8 })];
    for (const y of [0.13, 0.58, 1.03, 1.48]) for (let i = 0; i < 4; i++) bx(x0 + 0.03, y, b.min.z + 0.08 + i * 0.53, x1 - 0.03, y + 0.36, b.min.z + 0.5 + i * 0.53, packs[(i + Math.round(y * 3)) % 3], true);
    sign(['ABSORBENT PRODUCTS'], x0 - 0.005, 1.7, (b.min.z + b.max.z) / 2, 'w', 1.0, 0.14, ST.laminate);
    sign(['ABSORBENT PRODUCTS'], x1 + 0.005, 1.7, (b.min.z + b.max.z) / 2, 'e', 1.0, 0.14, ST.laminate);
  }
  {
    const b = one('Laundry cart');
    const x0 = b.min.x - X, x1 = b.max.x - X;
    bx(x0, 0.1, b.min.z, x1, 0.75, b.max.z, mat('#4a6a9a', { rough: 0.95 }), true);
    for (const [x, z] of [[x0, b.min.z], [x1 - 0.03, b.min.z], [x0, b.max.z - 0.03], [x1 - 0.03, b.max.z - 0.03]]) bx(x, 0.05, z, x + 0.03, 0.9, z + 0.03, M.chrome, true);
    sph(x0 + 0.25, 0.78, b.min.z + 0.3, 0.2, mat('#8a6fa8', { rough: 1 }), 1, 0.5, 1);
    sph(x1 - 0.25, 0.8, b.min.z + 0.3, 0.18, mat('#c86a5a', { rough: 1 }), 1, 0.5, 1);
  }
  sign([{ t: 'STAFF ONLY', s: 1 }, { t: 'This means you, Arthur', s: 0.55, b: false }], 9.5, 1.9, -2.83, 's', 0.7, 0.3, ST.red);

  // ═════════════════ Reception ═════════════════
  {
    const b = one('Reception desk');
    bx(b.min.x - X, 0, b.min.z, b.max.x - X, 1.05, b.max.z, M.pine, true);
    bx(b.min.x - X - 0.03, 1.05, b.min.z, b.max.x - X + 0.03, 1.1, b.max.z + 0.04, mat('#e8dcc4', { rough: 0.4 }), true);
    sign([{ t: 'RECEPTION', s: 1 }], (b.min.x + b.max.x) / 2 - X, 0.7, b.max.z + 0.005, 's', 1.4, 0.3, ST.pine);
    // The visitors' book, a bell, mints, a pen on a chain.
    bx(10.3, 1.1, 2.85, 10.8, 1.13, 3.2, M.paper);
    bx(10.3, 1.12, 2.85, 10.55, 1.135, 3.2, mat('#1f3a6a'));
    cyl(11.3, 1.1, 2.95, 0.06, 0.04, M.chrome, 12);
    sph(11.3, 1.15, 2.95, 0.04, M.chrome);
    cyl(11.0, 1.1, 3.05, 0.09, 0.05, mat('#d8e8f0', { rough: 0.2 }), 12);
    sign([{ t: 'VISITING HOURS', s: 1 }, { t: 'until someone inherits', s: 0.75, b: false }], 10.8, 1.75, 2.57, 's', 1.2, 0.42, ST.nhs);
    sign([{ t: 'Please sign in:', s: 0.8 }, { t: 'Name · Relation · Expected share', s: 0.6, b: false }], 10.55, 1.25, 3.2, 's', 0.5, 0.14, ST.laminate, 0);
  }
  // The oxygen-tank Christmas tree (up since August).
  {
    const b = one('Oxygen-tank Christmas tree');
    const cx = (b.min.x + b.max.x) / 2 - X, cz = (b.min.z + b.max.z) / 2;
    const rings: [number, number, number][] = [[0.22, 0, 6], [0.15, 0.62, 4], [0.07, 1.16, 3], [0, 1.52, 1]];
    for (const [r, y, n] of rings) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const h = y === 0 ? 0.6 : y === 0.62 ? 0.52 : y === 1.16 ? 0.36 : 0.28;
        cyl(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, 0.07, h, M.oxygen, 10);
        cyl(cx + Math.cos(a) * r, y + h, cz + Math.sin(a) * r, 0.03, 0.04, M.oxygenTop, 6);
      }
    }
    const tinsel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 6, 20), M.tinsel);
    tinsel.rotation.x = Math.PI / 2;
    tinsel.position.set(X + cx, 0.62, cz);
    add(tinsel);
    const t2 = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 6, 16), M.tinsel);
    t2.rotation.x = Math.PI / 2;
    t2.position.set(X + cx, 1.16, cz);
    add(t2);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), mat('#ffe060', { emissive: '#ffc020', emissiveIntensity: 1.2 }));
    star.position.set(X + cx, 1.9, cz);
    add(star);
    for (let i = 0; i < 7; i++) sph(cx + Math.cos(i * 1.7) * 0.25, 0.3 + (i % 3) * 0.45, cz + Math.sin(i * 1.7) * 0.25, 0.04, mat(['#e0405a', '#4a8ae0', '#f0d050'][i % 3], { rough: 0.2 }));
    sign([{ t: "SEASON'S BREATHINGS", s: 1 }], cx - 0.1, 2.3, 2.565, 's', 1.0, 0.2, { bg: '#c8282d', fg: '#fff3c0', font: SERIF });
  }
  // The front door: glazed, with a keypad.
  bx(12.9, 0, 4.4, 13.0, 2.4, 6.6, M.frame);
  bx(12.88, 0.05, 4.5, 12.95, 2.3, 5.48, windows);
  bx(12.88, 0.05, 5.52, 12.95, 2.3, 6.5, windows);
  bx(12.86, 1.0, 4.6, 12.88, 1.05, 6.4, M.chrome);
  bx(12.9, 1.2, 3.95, 12.96, 1.4, 4.15, M.greyPlastic);
  sign([{ t: 'Door code: 1234', s: 1 }, { t: 'please do not tell residents', s: 0.6, b: false }], 12.95, 1.6, 4.05, 'w', 0.42, 0.18, ST.laminate);
  sign([{ t: 'SUNNY PINES', s: 1, c: '#24704a' }, { t: 'Every day a bonus!', s: 0.6, b: false, i: true }], 12.98, 2.65, 5.5, 'w', 1.6, 0.45, { bg: '#f6fbf4', fg: '#2a2a2a', font: SERIF, border: '#24704a' });
  {
    // WELCOME mat.
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.4), signMaterial([{ t: 'WELCOME', s: 1 }], 1.0, 1.4, { bg: '#7a5a3a', fg: '#e8d0a0' }));
    m.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    m.position.set(X + 12.3, 0.006, 5.5);
    add(m);
  }
  // Leaflets by the door.
  bx(12.9, 0.9, 6.9, 13.0, 1.7, 7.8, M.pine);
  sign([{ t: 'LEAFLETS', s: 0.8 }, { t: 'So You\'ve Inherited', s: 0.6, b: false }, { t: 'Probate Made Simple', s: 0.6, b: false }, { t: 'Grief & You', s: 0.6, b: false }], 12.89, 1.3, 7.35, 'w', 0.8, 0.7, ST.laminate);
  // Mobility scooters, nose to the wall.
  const scooterCols = ['#c8282d', '#2a6ac0', '#2f8a4a'];
  def.boxes.filter((q) => q.label?.startsWith('Mobility scooter')).forEach((b, i) => {
    const x0 = b.min.x - X, x1 = b.max.x - X;
    const body = mat(scooterCols[i % 3], { rough: 0.35 });
    bx(x0 + 0.04, 0.12, b.min.z, x1 - 0.04, 0.3, b.max.z, body, true);
    for (const z of [b.min.z + 0.15, b.max.z - 0.15]) for (const x of [x0 + 0.04, x1 - 0.04]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12), M.black);
      w.rotation.z = Math.PI / 2;
      w.position.set(X + x, 0.12, z);
      add(w);
    }
    bx((x0 + x1) / 2 - 0.05, 0.3, b.min.z + 0.3, (x0 + x1) / 2 + 0.05, 0.55, b.min.z + 0.4, M.black);
    bx(x0 + 0.06, 0.55, b.min.z + 0.15, x1 - 0.06, 0.65, b.min.z + 0.6, M.black, true); // seat
    bx(x0 + 0.06, 0.65, b.min.z + 0.08, x1 - 0.06, 1.2, b.min.z + 0.18, M.black, true); // back
    bx((x0 + x1) / 2 - 0.04, 0.3, b.max.z - 0.35, (x0 + x1) / 2 + 0.04, 1.0, b.max.z - 0.27, M.chrome, true); // tiller
    bx(x0 + 0.08, 0.85, b.max.z - 0.28, x1 - 0.08, 1.05, b.max.z - 0.05, M.chrome, true); // basket
    bx(x0 + 0.1, 0.12, b.max.z - 0.02, x1 - 0.1, 0.3, b.max.z, body, true);
  });
  sign([{ t: 'MOBILITY SCOOTER PARKING', s: 0.8 }, { t: 'Max 4 mph · No racing', s: 0.7 }, { t: '(this means you, Mr Okafor)', s: 0.55, b: false }], 10.6, 1.7, 8.38, 'n', 1.5, 0.5, ST.nhs);
  {
    // A cardboard box at the awaiting-collection plinth.
    bx(12.25, 0, 6.95, 12.8, 0.4, 7.35, M.cardboard);
    sign([{ t: 'MRS ______', s: 1, f: HAND }, { t: 'personal effects', s: 0.6, b: false, f: HAND }], 12.52, 0.25, 6.945, 'n', 0.4, 0.2, { bg: '#b48a58', fg: '#1a1a1a' });
  }

  // ── Lights: cool fluorescents everywhere, the warm lamp in Nana's corner, the telly's blue glow ──
  const fluo = '#e8f3ff';
  const ref = v.point(X + 2.0, 2.7, 1.4, fluo, 26, 14); // Day Room (east)
  const REF_BASE = 26;
  v.point(X - 6.6, 1.6, 1.4, '#ffbd73', 9, 7); // Nana's lamps
  v.point(X - 1.2, 2.7, -6.8, '#eef6ff', 26, 13); // Dining Hall
  v.point(X - 11, 2.6, -2.5, '#fff1d0', 24, 14); // Sun Lounge (daylight through the roof)
  v.point(X - 4, 2.7, 7.2, fluo, 16, 12); // corridor (south)
  v.point(X + 8.6, 2.7, 3.2, fluo, 18, 12); // corridor (east) and reception
  v.point(X + 10.7, 2.7, -4.0, '#e2f0ff', 14, 9, true); // nurses' station and sluice
  const tvLight = v.point(X + 4.8, 1.7, 1.0, '#8fb6ff', 5, 6, true); // the telly

  const view = v.finish({
    windows,
    idle: { center: { x: X - 1.5, y: 2.3, z: 2.0 }, rx: 2.6, rz: 1.6, look: { x: X - 6.0, y: 1.1, z: 1.2 } },
    background: '#18201c',
    lightningFrom: { x: X - 30, y: 12, z: -2 },
  });

  // ── Things that move (kept out of the baked meshes) ──
  // Lucky III and two companions, circling the tank.
  const fishMat = mat('#ff8a2a', { rough: 0.4, emissive: '#5a2000', emissiveIntensity: 0.3 });
  const fish: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), fishMat);
    f.scale.set(1.6, 0.8, 0.6);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.06, 4), fishMat);
    tail.rotation.z = Math.PI / 2;
    tail.position.set(0.075, 0, 0);
    f.add(tail);
    view.group.add(f);
    fish.push(f);
  }
  // The middle washing machine's drum, on spin.
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.01, 12), mat('#8a6fa8', { rough: 1 }));
  drum.rotation.z = Math.PI / 2;
  drum.position.set(X + 12.22, 0.42, def.boxes.find((q) => q.label === 'Washing machines')!.min.z + 0.86 + 0.42);
  const sock = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.12), mat('#e0e0e0'));
  sock.position.set(0, 0, 0.05);
  drum.add(sock);
  view.group.add(drum);

  view.tick = (t) => {
    // The Storm's power cut reaches the tubes and the telly too.
    const level = Math.min(1, ref.intensity / REF_BASE);
    const on = level > 0.5;
    for (const m of tubeMats) m.emissiveIntensity = on ? 1.5 : 0.05;
    if (on) faulty.emissiveIntensity = Math.sin(t * 23) + Math.sin(t * 7.3) > 1.2 ? 0.15 : 1.5;
    tvMat.emissiveIntensity = on ? 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 2.3) : 0.02;
    tvLight.intensity *= on ? 0.8 + 0.2 * Math.sin(t * 9) * Math.sin(t * 2.3) : 0;
    for (let i = 0; i < fish.length; i++) {
      const p = t * (0.35 + i * 0.12) + i * 2.1;
      const x = X - 3.5 + Math.sin(p) * 0.7;
      fish[i].position.set(x, 1.05 + i * 0.09 + Math.sin(p * 2.3) * 0.03, -3.1 + Math.sin(p * 1.7 + i) * 0.1);
      fish[i].rotation.y = Math.cos(p) > 0 ? Math.PI : 0;
    }
    drum.rotation.x = on ? t * 14 : drum.rotation.x;
  };
  return view;
}
