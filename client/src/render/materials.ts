// Shared materials and procedural canvas textures (no asset files).
import * as THREE from 'three';
import { COUSINS, type ItemKey } from '../../../shared/constants.js';

export const ROOM_COLORS: Record<string, string> = {
  'Front hall': '#8a4a3f', // oxblood damask
  Gallery: '#3c6b6c', // dark teal
  Kitchen: '#d9bf73', // butter yellow
  Pantry: '#93a9b0', // pale duck-egg
  Outside: '#2b2522',
};

const matCache = new Map<string, THREE.MeshStandardMaterial>();

/** A cached standard material by colour (+ optional roughness/metalness/emissive). */
export function mat(color: string, opts: { rough?: number; metal?: number; emissive?: string; emissiveIntensity?: number; map?: THREE.Texture } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.rough ?? 0.8}|${opts.metal ?? 0}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? 1}|${opts.map?.uuid ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: opts.rough ?? 0.8, metalness: opts.metal ?? 0, map: opts.map ?? null,
      emissive: opts.emissive ?? '#000000', emissiveIntensity: opts.emissiveIntensity ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

let woodTex: THREE.CanvasTexture | null = null;
/** Warm wooden floorboards. One texture repeat = 2 m. */
export function wood(): THREE.CanvasTexture {
  if (woodTex) return woodTex;
  woodTex = canvasTex(256, 256, (g) => {
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      const off = (r * 97) % 256;
      for (let s = 0; s < 3; s++) {
        const shade = 120 + ((r * 31 + s * 57) % 40);
        g.fillStyle = `rgb(${shade + 40},${shade - 10},${shade - 50})`;
        g.fillRect((off + s * 110) % 256, r * 32, 110, 32);
        g.fillRect(((off + s * 110) % 256) - 256, r * 32, 110, 32);
      }
      g.fillStyle = 'rgba(40,20,10,0.6)';
      g.fillRect(0, r * 32, 256, 2);
      for (let s = 0; s < 3; s++) g.fillRect((off + s * 110) % 256, r * 32, 2, 32);
      g.strokeStyle = 'rgba(60,30,10,0.15)';
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(0, r * 32 + 6 + i * 6);
        g.bezierCurveTo(80, r * 32 + 2 + i * 7, 170, r * 32 + 10 + i * 5, 256, r * 32 + 6 + i * 6);
        g.stroke();
      }
    }
  });
  return woodTex;
}

let tileTex: THREE.CanvasTexture | null = null;
/** Kitchen chequerboard tiles. One repeat = 1 m (4 x 4 tiles). */
export function tiles(): THREE.CanvasTexture {
  if (tileTex) return tileTex;
  tileTex = canvasTex(128, 128, (g) => {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? '#2d2a2a' : '#e9e3d6';
      g.fillRect(x * 32, y * 32, 32, 32);
    }
    g.strokeStyle = 'rgba(120,110,100,0.6)';
    g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 128); g.moveTo(0, i * 32); g.lineTo(128, i * 32); g.stroke(); }
  });
  return tileTex;
}

let paperTex: THREE.CanvasTexture | null = null;
/** Pale damask wallpaper, tinted by the material colour. One repeat = 1 m. */
export function wallpaper(): THREE.CanvasTexture {
  if (paperTex) return paperTex;
  paperTex = canvasTex(128, 128, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#e2e2e2';
    for (let i = 0; i < 4; i++) g.fillRect(i * 32 + 12, 0, 8, 128);
    g.fillStyle = '#d2d2d2';
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const cx = x * 64 + 32, cy = y * 64 + 32;
      g.beginPath();
      g.moveTo(cx, cy - 14); g.lineTo(cx + 9, cy); g.lineTo(cx, cy + 14); g.lineTo(cx - 9, cy); g.closePath();
      g.fill();
    }
  });
  return paperTex;
}

let rugTex: THREE.CanvasTexture | null = null;
export function rug(): THREE.CanvasTexture {
  if (rugTex) return rugTex;
  rugTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#6e1f24';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#c9a24a';
    g.lineWidth = 8;
    g.strokeRect(14, 14, 228, 228);
    g.lineWidth = 3;
    g.strokeRect(30, 30, 196, 196);
    g.fillStyle = '#243a5a';
    g.beginPath(); g.moveTo(128, 60); g.lineTo(196, 128); g.lineTo(128, 196); g.lineTo(60, 128); g.closePath(); g.fill();
    g.fillStyle = '#c9a24a';
    g.beginPath(); g.arc(128, 128, 18, 0, Math.PI * 2); g.fill();
  });
  rugTex.wrapS = rugTex.wrapT = THREE.ClampToEdgeWrapping;
  return rugTex;
}

/** A soft round shadow blob (radial gradient), used under characters and props. */
let blobTex: THREE.CanvasTexture | null = null;
export function blob(): THREE.CanvasTexture {
  if (blobTex) return blobTex;
  blobTex = canvasTex(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
  return blobTex;
}

export function blobMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map: blob(), transparent: true, depthWrite: false });
}

/** A soft white puff (radial gradient) for dust clouds; tint it with the material colour. */
let puffTex: THREE.CanvasTexture | null = null;
export function puff(): THREE.CanvasTexture {
  if (puffTex) return puffTex;
  puffTex = canvasTex(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 1, 32, 32, 31);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
  puffTex.wrapS = puffTex.wrapT = THREE.ClampToEdgeWrapping;
  return puffTex;
}

/**
 * Colour-band patterns, one per cousin slot (the order of COUSINS), so a band
 * reads by its pattern as well as its colour (colour-blind players). The HUD
 * swatches draw the same patterns in CSS (style.css, `.swatch[data-pat]`).
 */
export const BAND_PATTERNS = ['stripes', 'dots', 'diagonal', 'checks', 'zigzag', 'grid', 'bars', 'rings'] as const;

/** Pattern index for a cousin's signature item (their slot in COUSINS), or -1. */
export function bandPatternIndex(item: ItemKey | null | undefined): number {
  return item ? COUSINS.findIndex((c) => c.key === item) % BAND_PATTERNS.length : -1;
}

const patternTex = new Map<number, THREE.CanvasTexture>();
/**
 * The pattern as a tiling texture: white with dark marks, so the material
 * colour tints the white and the marks stay dark in any colour. One repeat is
 * meant to cover about 0.11 m (the sash width; see boxGeo's `tile`).
 */
export function bandPatternTexture(i: number): THREE.CanvasTexture {
  let t = patternTex.get(i);
  if (t) return t;
  const kind = BAND_PATTERNS[((i % BAND_PATTERNS.length) + BAND_PATTERNS.length) % BAND_PATTERNS.length];
  t = canvasTex(64, 64, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(20,16,14,0.85)';
    g.strokeStyle = 'rgba(20,16,14,0.85)';
    g.lineWidth = 9;
    switch (kind) {
      case 'stripes': g.fillRect(0, 8, 64, 14); g.fillRect(0, 40, 64, 14); break;
      case 'dots':
        for (const [x, y] of [[16, 16], [48, 48], [48, 16], [16, 48]]) { g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill(); }
        break;
      case 'diagonal':
        for (let k = -64; k <= 64; k += 32) { g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 64, 0); g.stroke(); }
        break;
      case 'checks': g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32); break;
      case 'zigzag':
        for (const y0 of [18, 50]) { g.beginPath(); g.moveTo(0, y0); g.lineTo(16, y0 - 12); g.lineTo(32, y0); g.lineTo(48, y0 - 12); g.lineTo(64, y0); g.stroke(); }
        break;
      case 'grid': g.lineWidth = 7; g.strokeRect(16, 16, 32, 32); g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 64); g.moveTo(0, 32); g.lineTo(64, 32); g.stroke(); break;
      case 'bars': g.fillRect(8, 0, 14, 64); g.fillRect(40, 0, 14, 64); break;
      default: g.lineWidth = 6; for (const [x, y] of [[16, 16], [48, 48]]) { g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.stroke(); } break;
    }
  });
  patternTex.set(i, t);
  return t;
}

/** Scale a BoxGeometry's UVs so one texture repeat covers `tile` metres. */
export function boxGeo(sx: number, sy: number, sz: number, tile = 1): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z; 4 vertices each.
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile);
    }
  }
  return g;
}
