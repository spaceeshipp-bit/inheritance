// Harrowgate Manor: its look. Each room has its own materials: oxblood damask,
// black-and-white marble and mahogany in the hall; teal in the Portrait Gallery;
// duck-egg stripes, white panelling and gilt in the drawing room; white iron
// and glass in the conservatory; bottle green, leather and two storeys of
// books in the library; black and gold in the dining room (laid for a wake
// that has not happened yet); oak and tartan in Grandpa's study; green baize
// in the billiard room; white tiles in the scullery. Every solid box of the
// MapDef is drawn where it stands (furniture by its label), so what you see is
// what you bump into; the jokes live in the signage and set dressing.
//
// Textures are procedural (canvas): wallpapers, floors, rugs, book spines (one
// plane per shelf), a sign atlas and a portrait atlas (one draw call each).
import * as THREE from 'three';
import { GALLERY_Y, HALL_HEIGHT, KITCHEN_HEIGHT, type Box, type MapDef } from '../../../../shared/map.js';
import { MANOR_HEIGHTS as HT } from '../../../../shared/maps/manor.js';
import type { Vec3 } from '../../../../shared/types.js';
import { mat, tiles, wallpaper, wood } from '../materials.js';
import { ViewBuilder, boxMesh, stairs, type MapView } from './kit.js';

type Mat = THREE.Material;
/** The way a thing faces (its front's normal): S = +z, N = -z, E = +x, W = -x. */
type Face = 'N' | 'S' | 'E' | 'W';
const ROT: Record<Face, number> = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };
const SERIF = 'Georgia, "Times New Roman", "DejaVu Serif", serif';

// ═══════════════════════════ Canvas textures ═══════════════════════════

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

/** Faint paper grain over a whole canvas. */
function grain(g: CanvasRenderingContext2D, w: number, h: number, seed: number, a = 0.05): void {
  const r = rng(seed);
  for (let i = 0; i < (w * h) / 180; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * a})` : `rgba(255,255,255,${r() * a * 0.6})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 5);
  }
}

/** Damask wallpaper in its own colours (half-drop motif). One repeat = 0.8 m. */
function damask(key: string, bg: string, fg: string, line: string): THREE.CanvasTexture {
  return memo(key, () => canvasTex(256, 256, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 256);
    const motif = (cx: number, cy: number) => {
      g.save();
      g.translate(cx, cy);
      g.fillStyle = fg;
      for (const sx of [1, -1]) {
        g.save();
        g.scale(sx, 1);
        g.beginPath();
        g.moveTo(0, -62);
        g.bezierCurveTo(10, -48, 28, -42, 25, -25);
        g.bezierCurveTo(22, -12, 8, -15, 10, -4);
        g.bezierCurveTo(30, -10, 46, 4, 40, 20);
        g.bezierCurveTo(35, 33, 18, 30, 16, 41);
        g.bezierCurveTo(14, 51, 6, 55, 0, 62);
        g.closePath();
        g.fill();
        g.beginPath();
        g.arc(33, 12, 6, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(22, -34, 4, 9, -0.5, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      g.strokeStyle = line;
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, -48); g.lineTo(0, 50); g.stroke();
      g.beginPath(); g.ellipse(0, 4, 9, 18, 0, 0, Math.PI * 2); g.stroke();
      for (const sx of [1, -1]) {
        g.beginPath(); g.moveTo(0, 22); g.quadraticCurveTo(22 * sx, 12, 30 * sx, 22); g.stroke();
        g.beginPath(); g.moveTo(0, -14); g.quadraticCurveTo(18 * sx, -26, 14 * sx, -40); g.stroke();
      }
      g.restore();
    };
    for (const [x, y] of [[128, 128], [0, 0], [256, 0], [0, 256], [256, 256]]) motif(x, y);
    g.fillStyle = line;
    for (const [x, y] of [[128, 0], [0, 128], [256, 128], [128, 256]]) {
      g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 6, y); g.lineTo(x, y + 9); g.lineTo(x - 6, y); g.closePath(); g.fill();
    }
    grain(g, 256, 256, key.length * 7);
  }));
}

/** Regency stripes in their own colours. One repeat = 0.5 m. */
function stripes(key: string, a: string, b: string, line: string): THREE.CanvasTexture {
  return memo(key, () => canvasTex(128, 128, (g) => {
    g.fillStyle = a; g.fillRect(0, 0, 128, 128);
    g.fillStyle = b; g.fillRect(40, 0, 48, 128);
    g.fillStyle = line;
    g.fillRect(38, 0, 2, 128); g.fillRect(88, 0, 2, 128);
    g.fillRect(16, 0, 1, 128); g.fillRect(111, 0, 1, 128);
    for (let y = 8; y < 128; y += 32) {
      g.beginPath(); g.moveTo(64, y); g.lineTo(69, y + 8); g.lineTo(64, y + 16); g.lineTo(59, y + 8); g.closePath(); g.fill();
    }
    grain(g, 128, 128, 3, 0.04);
  }));
}

/** Library flock: a trellis of small diamonds. One repeat = 0.5 m. */
function flock(key: string, bg: string, fg: string): THREE.CanvasTexture {
  return memo(key, () => canvasTex(128, 128, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = fg; g.lineWidth = 3;
    for (let k = -128; k <= 128; k += 64) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 128, 128); g.stroke();
      g.beginPath(); g.moveTo(k + 128, 0); g.lineTo(k, 128); g.stroke();
    }
    g.fillStyle = fg;
    for (const [x, y] of [[32, 0], [96, 0], [0, 32], [64, 32], [128, 32], [32, 64], [96, 64], [0, 96], [64, 96], [128, 96], [32, 128], [96, 128]]) {
      g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
    }
    grain(g, 128, 128, 9, 0.05);
  }));
}

/** Grandpa's tartan. One repeat = 0.6 m. */
function tartan(): THREE.CanvasTexture {
  return memo('tartan', () => canvasTex(128, 128, (g) => {
    g.fillStyle = '#6e1a1c'; g.fillRect(0, 0, 128, 128);
    const band = (pos: number, w: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(pos, 0, w, 128);
      g.fillRect(0, pos, 128, w);
    };
    g.globalAlpha = 0.55;
    band(0, 30, '#1c2a22');
    band(64, 30, '#1c2a22');
    band(44, 4, '#c9a24a');
    band(108, 3, '#1a1a3a');
    g.globalAlpha = 1;
  }));
}

/** Raised wooden panels in greys (tinted by the material). One repeat = one panel. */
function panels(): THREE.CanvasTexture {
  return memo('panels', () => canvasTex(128, 128, (g) => {
    g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#e4e4e4'; g.fillRect(18, 18, 92, 92);
    g.fillStyle = '#ffffff'; g.fillRect(18, 18, 92, 5); g.fillRect(18, 18, 5, 92);
    g.fillStyle = '#9a9a9a'; g.fillRect(18, 105, 92, 5); g.fillRect(105, 18, 5, 92);
    g.fillStyle = '#ececec'; g.fillRect(30, 30, 68, 68);
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(0, 6 + i * 10); g.lineTo(128, 4 + i * 10); g.stroke(); }
  }));
}

/** Veined marble in its own colours. One repeat = 1 m. */
function marble(key: string, base: string, vein: string): THREE.CanvasTexture {
  return memo(key, () => canvasTex(256, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    const r = rng(key.length * 13 + 5);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(128,128,128,${r() * 0.06})`;
      g.beginPath(); g.arc(r() * 256, r() * 256, 10 + r() * 40, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = vein;
    for (let k = 0; k < 7; k++) {
      g.globalAlpha = 0.25 + r() * 0.4;
      g.lineWidth = 0.6 + r() * 1.6;
      let x = r() * 256, y = 0;
      g.beginPath(); g.moveTo(x, y);
      while (y < 256) { x += (r() - 0.5) * 40; y += 10 + r() * 20; g.lineTo(x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
  }));
}

/** The hall floor: black and white marble squares, 0.6 m. One repeat = 1.2 m. */
function chequer(): THREE.CanvasTexture {
  return memo('chequer', () => canvasTex(512, 512, (g) => {
    const r = rng(77);
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
      const dark = (tx + ty) % 2 === 1;
      const x0 = tx * 256, y0 = ty * 256;
      g.fillStyle = dark ? '#1d1a1b' : '#e9e4da';
      g.fillRect(x0, y0, 256, 256);
      for (let i = 0; i < 25; i++) {
        g.fillStyle = dark ? `rgba(255,255,255,${r() * 0.03})` : `rgba(120,110,100,${r() * 0.05})`;
        g.beginPath(); g.arc(x0 + r() * 256, y0 + r() * 256, 10 + r() * 50, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = dark ? 'rgba(220,210,200,0.22)' : 'rgba(90,80,75,0.35)';
      for (let k = 0; k < 4; k++) {
        g.lineWidth = 0.6 + r() * 1.4;
        let x = x0 + r() * 256, y = y0;
        g.beginPath(); g.moveTo(x, y);
        while (y < y0 + 256) { x += (r() - 0.5) * 50; y += 12 + r() * 22; g.lineTo(Math.max(x0, Math.min(x0 + 256, x)), Math.min(y, y0 + 256)); }
        g.stroke();
      }
    }
    g.fillStyle = 'rgba(60,55,50,0.7)';
    for (const p of [0, 255, 256, 511]) { g.fillRect(p, 0, 1, 512); g.fillRect(0, p, 512, 1); }
  }));
}

/** Basket-weave parquet. One repeat = 1 m. */
function parquet(key: string, a: string, b: string): THREE.CanvasTexture {
  return memo(key, () => canvasTex(256, 256, (g) => {
    const r = rng(key.length * 3 + 1);
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const horiz = (sx + sy) % 2 === 0;
      for (let k = 0; k < 4; k++) {
        g.fillStyle = (k + sx) % 2 ? a : b;
        const x = sx * 64 + (horiz ? 0 : k * 16), y = sy * 64 + (horiz ? k * 16 : 0);
        const w = horiz ? 64 : 16, h = horiz ? 16 : 64;
        g.fillRect(x, y, w, h);
        g.strokeStyle = 'rgba(40,20,10,0.18)';
        g.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          if (horiz) { const yy = y + 3 + i * 5 + r() * 2; g.moveTo(x, yy); g.lineTo(x + w, yy + r() * 2 - 1); } else { const xx = x + 3 + i * 5 + r() * 2; g.moveTo(xx, y); g.lineTo(xx + r() * 2 - 1, y + h); }
          g.stroke();
        }
        g.fillStyle = 'rgba(30,15,5,0.55)';
        g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
      }
    }
  }));
}

/** Victorian encaustic tiles: terracotta, cream and black. One repeat = 0.8 m. */
function encaustic(): THREE.CanvasTexture {
  return memo('encaustic', () => canvasTex(256, 256, (g) => {
    g.fillStyle = '#a4502e'; g.fillRect(0, 0, 256, 256);
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
      const x = tx * 64, y = ty * 64;
      g.fillStyle = '#e8dcc0';
      g.beginPath();
      g.moveTo(x + 18, y + 2); g.lineTo(x + 46, y + 2); g.lineTo(x + 62, y + 18); g.lineTo(x + 62, y + 46);
      g.lineTo(x + 46, y + 62); g.lineTo(x + 18, y + 62); g.lineTo(x + 2, y + 46); g.lineTo(x + 2, y + 18); g.closePath(); g.fill();
      g.fillStyle = (tx + ty) % 2 ? '#2a3a4a' : '#7a2a1e';
      g.beginPath(); g.moveTo(x + 32, y + 16); g.lineTo(x + 48, y + 32); g.lineTo(x + 32, y + 48); g.lineTo(x + 16, y + 32); g.closePath(); g.fill();
      g.fillStyle = '#1a1a1a';
      for (const [cx, cy] of [[0, 0], [64, 0], [0, 64], [64, 64]]) { g.save(); g.translate(x + cx, y + cy); g.rotate(Math.PI / 4); g.fillRect(-9, -9, 18, 18); g.restore(); }
    }
    grain(g, 256, 256, 41, 0.08);
  }));
}

/** Scullery flagstones. One repeat = 2 m. */
function flags(): THREE.CanvasTexture {
  return memo('flags', () => canvasTex(256, 256, (g) => {
    g.fillStyle = '#6f675d'; g.fillRect(0, 0, 256, 256);
    const r = rng(17);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 64 : 0;
      for (let k = -1; k < 3; k++) {
        const x = off + k * 128, y = row * 64, s = 150 + Math.floor(r() * 30);
        g.fillStyle = `rgb(${s},${s - 8},${s - 20})`;
        g.fillRect(x + 2, y + 2, 124, 60);
        for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(60,50,40,${r() * 0.1})`; g.fillRect(x + 4 + r() * 118, y + 4 + r() * 54, 2 + r() * 5, 2 + r() * 3); }
      }
    }
  }));
}

/** White brick tiles (greys, tinted). One repeat = 0.4 m. */
function wallTiles(): THREE.CanvasTexture {
  return memo('wallTiles', () => canvasTex(128, 128, (g) => {
    g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 8; row++) {
      const off = row % 2 ? 16 : 0;
      for (let k = -1; k < 4; k++) {
        const x = off + k * 32, y = row * 16;
        g.fillStyle = '#f4f4f4'; g.fillRect(x + 1, y + 1, 30, 14);
        g.fillStyle = '#ffffff'; g.fillRect(x + 1, y + 1, 30, 3);
      }
    }
  }));
}

/** Conservatory trellis on cream. One repeat = 0.6 m. */
function trellis(): THREE.CanvasTexture {
  return memo('trellis', () => canvasTex(128, 128, (g) => {
    g.fillStyle = '#e9e5d6'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#7f9a72'; g.lineWidth = 5;
    for (let k = -128; k <= 128; k += 64) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 128, 128); g.stroke();
      g.beginPath(); g.moveTo(k + 128, 0); g.lineTo(k, 128); g.stroke();
    }
    g.fillStyle = '#4f7a4a';
    const r = rng(5);
    for (let i = 0; i < 30; i++) { g.beginPath(); g.ellipse(r() * 128, r() * 128, 5, 2.5, r() * 3, 0, Math.PI * 2); g.fill(); }
  }));
}

/** Book spines: 8 rows of shelves (each row a band of the texture). One repeat = 1.2 m of books. */
function books(): THREE.CanvasTexture {
  return memo('books', () => canvasTex(512, 512, (g) => {
    const r = rng(1234);
    const pal = ['#5a1a1a', '#1f3a2a', '#1c2a4a', '#6a4a22', '#2a2422', '#7a2a1e', '#3a4a2a', '#4a2a3a', '#8a6a3a', '#2a3a3a', '#a08a5a', '#6a1a2a'];
    for (let row = 0; row < 8; row++) {
      const y0 = row * 64;
      g.fillStyle = '#120c08';
      g.fillRect(0, y0, 512, 64);
      let x = 0;
      while (x < 512) {
        let w = 9 + Math.floor(r() * 16);
        if (x + w > 512 - 6) w = 512 - x;
        const h = Math.floor(64 * (0.66 + r() * 0.3));
        const col = pal[Math.floor(r() * pal.length)];
        g.fillStyle = col;
        g.fillRect(x, y0 + 64 - h, w - 1, h);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, y0 + 64 - h, 2, h);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + w - 3, y0 + 64 - h, 2, h);
        if (r() < 0.75) {
          g.fillStyle = '#c9a24a';
          const bands = 1 + Math.floor(r() * 3);
          for (let k = 0; k < bands; k++) g.fillRect(x + 1, y0 + 64 - h + 4 + k * 4, w - 3, 1.5);
          g.fillRect(x + 1, y0 + 60, w - 3, 1.5);
        }
        if (r() < 0.4 && w > 12) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 3, y0 + 64 - h * 0.6, w - 7, h * 0.18); }
        x += w;
      }
    }
  }));
}

/** A Persian rug (not repeating): field, borders, medallion and corner spandrels. */
function persian(key: string, c: { field: string; border: string; ground: string; accent: string; light: string }, wpx = 512, hpx = 384): THREE.CanvasTexture {
  return memo(key, () => canvasTex(wpx, hpx, (g) => {
    const r = rng(key.length * 31 + 7);
    g.fillStyle = c.ground; g.fillRect(0, 0, wpx, hpx);
    g.fillStyle = c.border; g.fillRect(10, 10, wpx - 20, hpx - 20);
    g.fillStyle = c.ground; g.fillRect(16, 16, wpx - 32, hpx - 32);
    g.fillStyle = c.border; g.fillRect(40, 40, wpx - 80, hpx - 80);
    // Border motifs: little lozenges and dots.
    g.fillStyle = c.accent;
    for (let x = 24; x < wpx - 20; x += 18) for (const y of [28, hpx - 28]) { g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); g.fill(); }
    for (let y = 46; y < hpx - 40; y += 18) for (const x of [28, wpx - 28]) { g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); g.fill(); }
    g.fillStyle = c.field; g.fillRect(48, 48, wpx - 96, hpx - 96);
    // Field: small flowers.
    for (let i = 0; i < (wpx * hpx) / 900; i++) {
      const x = 56 + r() * (wpx - 112), y = 56 + r() * (hpx - 112);
      g.fillStyle = r() < 0.5 ? c.accent : c.light;
      g.globalAlpha = 0.5 + r() * 0.4;
      g.beginPath(); g.arc(x, y, 1.5 + r() * 2.5, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    // Medallion: nested lozenges.
    const cx = wpx / 2, cy = hpx / 2;
    const loz = (rx: number, ry: number, col: string) => { g.fillStyle = col; g.beginPath(); g.moveTo(cx, cy - ry); g.lineTo(cx + rx, cy); g.lineTo(cx, cy + ry); g.lineTo(cx - rx, cy); g.closePath(); g.fill(); };
    loz(hpx * 0.42, hpx * 0.3, c.ground);
    loz(hpx * 0.36, hpx * 0.25, c.border);
    loz(hpx * 0.26, hpx * 0.18, c.accent);
    loz(hpx * 0.16, hpx * 0.11, c.light);
    g.fillStyle = c.ground; g.beginPath(); g.arc(cx, cy, hpx * 0.05, 0, Math.PI * 2); g.fill();
    // Corner spandrels.
    g.fillStyle = c.border;
    for (const [x, y, sx, sy] of [[48, 48, 1, 1], [wpx - 48, 48, -1, 1], [48, hpx - 48, 1, -1], [wpx - 48, hpx - 48, -1, -1]]) {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + sx * hpx * 0.2, y); g.quadraticCurveTo(x + sx * hpx * 0.1, y + sy * hpx * 0.1, x, y + sy * hpx * 0.2); g.closePath(); g.fill();
    }
    grain(g, wpx, hpx, 3, 0.07);
  }, false));
}

/** Curtain folds (greys, tinted). One repeat = 0.5 m across. */
function folds(): THREE.CanvasTexture {
  return memo('folds', () => canvasTex(64, 8, (g) => {
    const grd = g.createLinearGradient(0, 0, 64, 0);
    grd.addColorStop(0, '#8a8a8a'); grd.addColorStop(0.25, '#ffffff'); grd.addColorStop(0.5, '#a0a0a0'); grd.addColorStop(0.75, '#f0f0f0'); grd.addColorStop(1, '#8a8a8a');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 8);
  }));
}

/** Flames in a grate (emissive). */
function fire(): THREE.CanvasTexture {
  return memo('fire', () => canvasTex(128, 128, (g) => {
    g.fillStyle = '#000000'; g.fillRect(0, 0, 128, 128);
    const r = rng(99);
    for (let i = 0; i < 9; i++) {
      const x = 14 + i * 12 + r() * 6, h = 50 + r() * 50;
      const grd = g.createLinearGradient(0, 128, 0, 128 - h);
      grd.addColorStop(0, '#fff2a0'); grd.addColorStop(0.35, '#ffb030'); grd.addColorStop(0.75, '#e04a10'); grd.addColorStop(1, 'rgba(120,20,0,0)');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(x - 12, 128); g.quadraticCurveTo(x - 10, 128 - h * 0.5, x + (r() - 0.5) * 8, 128 - h); g.quadraticCurveTo(x + 10, 128 - h * 0.5, x + 12, 128); g.closePath(); g.fill();
    }
    g.fillStyle = '#ff6a1a';
    for (let i = 0; i < 30; i++) { g.globalAlpha = r(); g.fillRect(r() * 128, 110 + r() * 18, 4, 3); }
    g.globalAlpha = 1;
  }, false));
}

/** Rain on the glass (the windows' glow map): faint streaks and droplets. Scrolls in the Storm. */
function rain(): THREE.CanvasTexture {
  return memo('rain', () => canvasTex(128, 256, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 256);
    const r = rng(23);
    for (let i = 0; i < 40; i++) {
      const x = r() * 128, y = r() * 256, len = 20 + r() * 70;
      g.strokeStyle = `rgba(110,130,160,${0.12 + r() * 0.2})`;
      g.lineWidth = 1 + r();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y + len); g.stroke();
    }
    for (let i = 0; i < 60; i++) {
      const x = r() * 128, y = r() * 256, s = 1 + r() * 2;
      g.fillStyle = 'rgba(90,110,150,0.3)'; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(x - s / 2, y - s / 2, 1, 1);
    }
  }));
}

/** The fanlight over the front door: a stained-glass sunburst. */
function stainedGlass(): THREE.CanvasTexture {
  return memo('stained', () => canvasTex(256, 128, (g) => {
    g.fillStyle = '#1a1410'; g.fillRect(0, 0, 256, 128);
    const cols = ['#b0202a', '#e0a030', '#2a7a4a', '#2a4a9a', '#d06020', '#7a2a8a'];
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI + (i / n) * Math.PI, a1 = Math.PI + ((i + 1) / n) * Math.PI;
      g.fillStyle = cols[i % cols.length];
      g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 124, a0, a1); g.closePath(); g.fill();
    }
    g.fillStyle = '#f0d070';
    g.beginPath(); g.arc(128, 128, 40, Math.PI, 0); g.fill();
    g.strokeStyle = '#141010'; g.lineWidth = 4;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI + (i / n) * Math.PI;
      g.beginPath(); g.moveTo(128 + Math.cos(a) * 40, 128 + Math.sin(a) * 40); g.lineTo(128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124); g.stroke();
    }
    for (const rr of [40, 82, 124]) { g.beginPath(); g.arc(128, 128, rr, Math.PI, 0); g.stroke(); }
  }, false));
}

/** A palm frond (cut out by alpha). */
function frond(): THREE.CanvasTexture {
  return memo('frond', () => canvasTex(64, 256, (g) => {
    g.clearRect(0, 0, 64, 256);
    g.strokeStyle = '#3f5a2a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(32, 256); g.lineTo(32, 4); g.stroke();
    for (let y = 16; y < 250; y += 9) {
      const len = 28 * Math.sin((y / 256) * Math.PI) + 3;
      g.strokeStyle = y % 2 ? '#4f7a32' : '#5f8a3a';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(32, y); g.lineTo(32 - len, y + 10); g.stroke();
      g.beginPath(); g.moveTo(32, y); g.lineTo(32 + len, y + 10); g.stroke();
    }
  }, false));
}

/** The globe: blue seas and blobby continents. */
function globe(): THREE.CanvasTexture {
  return memo('globe', () => canvasTex(256, 128, (g) => {
    g.fillStyle = '#c8b88a'; g.fillRect(0, 0, 256, 128);
    const r = rng(8);
    g.fillStyle = '#6a8a4a';
    for (const [x, y, s] of [[60, 40, 22], [70, 80, 16], [130, 45, 20], [140, 80, 18], [200, 40, 26], [220, 85, 12], [100, 110, 30]]) {
      for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(x + (r() - 0.5) * s, y + (r() - 0.5) * s * 0.7, s * (0.3 + r() * 0.4), 0, Math.PI * 2); g.fill(); }
    }
    g.strokeStyle = 'rgba(60,40,20,0.4)';
    for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 128); g.stroke(); }
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke(); }
  }));
}

/** A folding screen's panel: black lacquer with a gilt branch and birds. */
function screenPanel(): THREE.CanvasTexture {
  return memo('screen', () => canvasTex(128, 256, (g) => {
    g.fillStyle = '#1a1210'; g.fillRect(0, 0, 128, 256);
    g.strokeStyle = '#c9a24a'; g.lineWidth = 4; g.strokeRect(6, 6, 116, 244);
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(10, 220); g.bezierCurveTo(50, 180, 40, 120, 100, 80); g.stroke();
    g.beginPath(); g.moveTo(52, 160); g.quadraticCurveTo(80, 150, 96, 130); g.stroke();
    g.fillStyle = '#e0a0a8';
    const r = rng(4);
    for (let i = 0; i < 16; i++) { g.beginPath(); g.arc(20 + r() * 90, 70 + r() * 150, 3 + r() * 3, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#d8c070';
    for (const [x, y] of [[40, 60], [86, 40]]) { g.beginPath(); g.ellipse(x, y, 10, 5, -0.3, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(x + 8, y - 2); g.lineTo(x + 18, y - 10); g.lineTo(x + 14, y + 2); g.fill(); }
  }));
}

/** A painted ceiling: coffers (one per repeat). */
function coffers(key: string, base: string, beam: string, edge: string, rose: string): THREE.CanvasTexture {
  return memo(key, () => canvasTex(256, 256, (g) => {
    g.fillStyle = beam; g.fillRect(0, 0, 256, 256);
    g.fillStyle = edge; g.fillRect(24, 24, 208, 208);
    g.fillStyle = base; g.fillRect(34, 34, 188, 188);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(34, 34, 188, 8); g.fillRect(34, 34, 8, 188);
    g.fillStyle = rose;
    g.beginPath(); g.arc(128, 128, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = base;
    g.beginPath(); g.arc(128, 128, 12, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.fillStyle = rose; g.beginPath(); g.arc(128 + Math.cos(a) * 34, 128 + Math.sin(a) * 34, 5, 0, Math.PI * 2); g.fill(); }
  }));
}

/** Beamed ceiling: dark beams across plaster. One repeat = 1.6 m. */
function beams(key: string, plaster: string, beam: string): THREE.CanvasTexture {
  return memo(key, () => canvasTex(256, 64, (g) => {
    g.fillStyle = plaster; g.fillRect(0, 0, 256, 64);
    g.fillStyle = beam; g.fillRect(0, 0, 40, 64);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(40, 0, 10, 64);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 0, 6, 64);
    grain(g, 256, 64, 3, 0.05);
  }));
}

/** The drawing room's ceiling: plaster with a deep border and a central rose (one texture for the whole ceiling). */
function roseCeiling(): THREE.CanvasTexture {
  return memo('roseCeiling', () => canvasTex(512, 512, (g) => {
    g.fillStyle = '#f2eee4'; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = '#c9a24a'; g.lineWidth = 3; g.strokeRect(36, 36, 440, 440);
    g.strokeStyle = '#d8d2c2'; g.lineWidth = 10; g.strokeRect(54, 54, 404, 404);
    g.fillStyle = '#e4dccb';
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.beginPath(); g.ellipse(256 + Math.cos(a) * 52, 256 + Math.sin(a) * 52, 22, 9, a, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#c9a24a'; g.beginPath(); g.arc(256, 256, 28, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d8d0bc'; g.lineWidth = 6; g.beginPath(); g.arc(256, 256, 92, 0, Math.PI * 2); g.stroke();
    for (const [x, y] of [[90, 90], [422, 90], [90, 422], [422, 422]]) { g.fillStyle = '#e4dccb'; g.beginPath(); g.arc(x, y, 18, 0, Math.PI * 2); g.fill(); }
  }, false));
}

/** The family tree, with whole branches sawn off. */
function familyTree(): THREE.CanvasTexture {
  return memo('familyTree', () => canvasTex(512, 512, (g) => {
    g.fillStyle = '#e8dcbc'; g.fillRect(0, 0, 512, 512);
    grain(g, 512, 512, 5, 0.08);
    g.fillStyle = '#2a1a10';
    g.font = `bold 30px ${SERIF}`; g.textAlign = 'center';
    g.fillText('THE HARROWGATE FAMILY TREE', 256, 44);
    g.font = `italic 20px ${SERIF}`;
    g.fillText('(pruned)', 256, 70);
    g.strokeStyle = '#4a2e1a'; g.lineCap = 'round';
    const branch = (x0: number, y0: number, x1: number, y1: number, w: number) => { g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + 20, (y0 + y1) / 2, x1, y1); g.stroke(); };
    branch(256, 480, 256, 300, 26);
    branch(256, 330, 120, 220, 14); branch(256, 330, 392, 220, 14); branch(256, 300, 256, 160, 12);
    branch(120, 220, 70, 150, 7); branch(120, 220, 170, 140, 7); branch(392, 220, 350, 140, 7);
    // Sawn-off stumps (pale cut ends).
    const stump = (x: number, y: number, a: number, len: number) => {
      const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
      g.lineWidth = 9; g.beginPath(); g.moveTo(x, y); g.lineTo(x1, y1); g.stroke();
      g.fillStyle = '#d8b880'; g.beginPath(); g.ellipse(x1, y1, 5, 6, a, 0, Math.PI * 2); g.fill();
    };
    stump(392, 220, -0.3, 40); stump(256, 160, -1.0, 34); stump(256, 400, 0.2, 60); stump(120, 220, Math.PI + 0.4, 36);
    const leaf = (x: number, y: number, name: string, out = false) => {
      g.fillStyle = '#f6efdc'; g.strokeStyle = '#4a2e1a'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(x, y, 52, 20, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#2a1a10'; g.font = `16px ${SERIF}`; g.fillText(name, x, y + 5);
      if (out) { g.strokeStyle = '#a01818'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 46, y + 10); g.lineTo(x + 46, y - 10); g.stroke(); }
    };
    leaf(256, 130, 'NANA');
    leaf(70, 135, 'Agatha'); leaf(170, 120, 'Barnaby', true); leaf(350, 120, 'Clement');
    leaf(120, 230, 'Dudley', true); leaf(256, 255, 'Edna'); leaf(400, 240, 'Fergus', true);
    g.fillStyle = '#7a1a1a'; g.font = `italic 17px ${SERIF}`;
    g.fillText('Further branches removed on legal advice', 256, 500);
  }, false));
}

// ═══════════════════════════ Atlases: signs and portraits ═══════════════════════════

interface UV { u0: number; v0: number; u1: number; v1: number }

/** One big canvas many small textures share (one material, one draw call). */
class Atlas {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly tex: THREE.CanvasTexture;
  private x = 2;
  private y = 2;
  private rowH = 0;
  constructor(readonly W: number, readonly H: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.g.fillStyle = '#20180f';
    this.g.fillRect(0, 0, W, H);
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
  }

  region(w: number, h: number, draw: (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void): UV {
    w = Math.round(w); h = Math.round(h);
    if (this.x + w + 2 > this.W) { this.x = 2; this.y += this.rowH + 4; this.rowH = 0; }
    if (this.y + h + 2 > this.H) { console.warn('manor atlas full'); return { u0: 0, v0: 0, u1: 0.001, v1: 0.001 }; }
    const x = this.x, y = this.y;
    this.x += w + 4;
    this.rowH = Math.max(this.rowH, h);
    const g = this.g;
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    draw(g, x, y, w, h);
    g.restore();
    return { u0: (x + 0.5) / this.W, u1: (x + w - 0.5) / this.W, v0: 1 - (y + h - 0.5) / this.H, v1: 1 - (y + 0.5) / this.H };
  }
}

/** A plane (facing +z) showing part of an atlas. */
function uvPlane(w: number, h: number, uv: UV): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(w, h);
  const a = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < a.count; i++) a.setXY(i, uv.u0 + a.getX(i) * (uv.u1 - uv.u0), uv.v0 + a.getY(i) * (uv.v1 - uv.v0));
  return geo;
}

/** A line of sign text, optionally sized (relative), coloured, italic or struck through. */
interface Line { t: string; s?: number; c?: string; strike?: boolean; italic?: boolean; bold?: boolean }
interface SignStyle { bg: string; bg2?: string; fg: string; border?: string; italic?: boolean; bold?: boolean }
const SIGN: Record<string, SignStyle> = {
  brass: { bg: '#e0c378', bg2: '#a8843a', fg: '#2a1d0c', border: '#6e5222', bold: true },
  card: { bg: '#f6f1e4', fg: '#1c1712', border: '#3a3028' },
  black: { bg: '#161212', fg: '#e0bc62', border: '#b08a3a', bold: true },
  enamel: { bg: '#f4f2ea', fg: '#1a2a5a', border: '#1a2a5a', bold: true },
  chalk: { bg: '#25302a', fg: '#efeadb', border: '#6a4a2a' },
  note: { bg: '#f8f2d6', fg: '#1d2f6a', italic: true },
  wood: { bg: '#5a3a22', bg2: '#3a2414', fg: '#ead8a8', border: '#2a1a0e', bold: true },
  icing: { bg: '#f6f2ec', fg: '#1a1414', italic: true },
};

function drawSign(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lines: (string | Line)[], st: SignStyle): void {
  if (st.bg2) {
    const grd = g.createLinearGradient(x, y, x, y + h);
    grd.addColorStop(0, st.bg); grd.addColorStop(1, st.bg2);
    g.fillStyle = grd;
  } else g.fillStyle = st.bg;
  g.fillRect(x, y, w, h);
  const bw = Math.max(2, Math.round(Math.min(w, h) * 0.06));
  if (st.border) { g.strokeStyle = st.border; g.lineWidth = bw; g.strokeRect(x + bw, y + bw, w - 2 * bw, h - 2 * bw); }
  const ls = lines.map((l) => (typeof l === 'string' ? { t: l } : l));
  const total = ls.reduce((a, l) => a + (l.s ?? 1), 0);
  const pad = bw * 2.5;
  const unit = (h - 2 * pad) / total;
  let cy = y + pad;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const l of ls) {
    const lh = unit * (l.s ?? 1);
    let px = lh * 0.78;
    const font = (sz: number) => `${(l.italic ?? st.italic) ? 'italic ' : ''}${(l.bold ?? st.bold) ? 'bold ' : ''}${Math.max(6, Math.round(sz))}px ${SERIF}`;
    g.font = font(px);
    const mw = g.measureText(l.t).width;
    if (mw > w - 2 * pad) { px *= (w - 2 * pad) / mw; g.font = font(px); }
    g.fillStyle = l.c ?? st.fg;
    g.fillText(l.t, x + w / 2, cy + lh / 2);
    if (l.strike) {
      const tw = g.measureText(l.t).width;
      g.strokeStyle = '#8a1414'; g.lineWidth = Math.max(2, px * 0.12);
      g.beginPath(); g.moveTo(x + w / 2 - tw / 2 - 4, cy + lh / 2 + px * 0.08); g.lineTo(x + w / 2 + tw / 2 + 4, cy + lh / 2 - px * 0.12); g.stroke();
    }
    cy += lh;
  }
}

interface PortraitSpec {
  bg: [string, string]; coat: string; skin?: string; hair?: string;
  style: 'bun' | 'bald' | 'wig' | 'tall' | 'cap' | 'tophat' | 'curls' | 'young' | 'cat' | 'baby' | 'horse' | 'house' | 'sea';
  brows?: 'glare' | 'calm' | 'up'; eyes?: 'open' | 'closed' | 'specs' | 'monocle'; mouth?: 'flat' | 'smile' | 'frown' | 'lips';
  tache?: string; beard?: string; pearls?: boolean; medal?: boolean; blur?: boolean; overpainted?: boolean;
}

function drawPortrait(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: PortraitSpec): void {
  const grd = g.createRadialGradient(x + w * 0.5, y + h * 0.4, 10, x + w * 0.5, y + h * 0.5, w * 0.75);
  grd.addColorStop(0, p.bg[0]); grd.addColorStop(1, p.bg[1]);
  g.fillStyle = grd; g.fillRect(x, y, w, h);
  const cx = x + w / 2, cy = y + h * 0.42;
  if (p.style === 'house' || p.style === 'sea') {
    // A landscape: a storm over the manor, or the yacht going down.
    g.fillStyle = '#4a5a4a'; g.fillRect(x, y + h * 0.62, w, h * 0.38);
    if (p.style === 'house') {
      g.fillStyle = '#8a7a6a'; g.fillRect(x + w * 0.22, y + h * 0.4, w * 0.56, h * 0.26);
      g.fillStyle = '#5a4a3a'; g.beginPath(); g.moveTo(x + w * 0.18, y + h * 0.41); g.lineTo(cx, y + h * 0.26); g.lineTo(x + w * 0.82, y + h * 0.41); g.fill();
      g.fillStyle = '#f0d890';
      for (let i = 0; i < 5; i++) g.fillRect(x + w * (0.27 + i * 0.1), y + h * 0.47, w * 0.05, h * 0.07);
      g.strokeStyle = '#e0e8ff'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + w * 0.8, y + h * 0.05); g.lineTo(x + w * 0.72, y + h * 0.18); g.lineTo(x + w * 0.78, y + h * 0.2); g.lineTo(x + w * 0.7, y + h * 0.33); g.stroke();
    } else {
      g.fillStyle = '#2a4a5a'; g.fillRect(x, y + h * 0.55, w, h * 0.45);
      g.fillStyle = '#e8e0d0'; g.beginPath(); g.moveTo(cx - 10, y + h * 0.58); g.lineTo(cx + 30, y + h * 0.3); g.lineTo(cx + 34, y + h * 0.58); g.fill();
      g.fillStyle = '#5a3a22'; g.save(); g.translate(cx, y + h * 0.6); g.rotate(0.4); g.fillRect(-40, -8, 80, 16); g.restore();
    }
    return;
  }
  if (p.style === 'horse') {
    g.fillStyle = '#6a4024';
    g.beginPath(); g.ellipse(cx, cy + 10, w * 0.16, h * 0.3, 0.25, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx - 6, cy - h * 0.22, w * 0.05, h * 0.07, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1a120c'; g.beginPath(); g.arc(cx + 4, cy - 14, 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8e0d0'; g.fillRect(cx - 4, cy - 40, 8, 50);
    return;
  }
  // Shoulders and coat.
  g.fillStyle = p.coat;
  g.beginPath(); g.ellipse(cx, y + h * 1.02, w * 0.42, h * 0.36, 0, 0, Math.PI * 2); g.fill();
  if (p.style === 'cat') {
    g.fillStyle = '#f4f0e6';
    for (let i = 0; i < 14; i++) { const a = Math.PI + (i / 13) * Math.PI; g.beginPath(); g.ellipse(cx + Math.cos(a) * 46, cy + 52 + Math.sin(a) * -14, 12, 8, a, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#d87a2a';
    g.beginPath(); g.ellipse(cx, cy + 8, 46, 40, 0, 0, Math.PI * 2); g.fill();
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 40, cy - 14); g.lineTo(cx + s * 30, cy - 52); g.lineTo(cx + s * 12, cy - 26); g.fill(); }
    g.fillStyle = '#7ab04a';
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 16, cy, 7, 9, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#1a1a1a';
    for (const s of [-1, 1]) g.fillRect(cx + s * 16 - 1.5, cy - 7, 3, 14);
    g.fillStyle = '#e08a9a'; g.beginPath(); g.moveTo(cx - 5, cy + 16); g.lineTo(cx + 5, cy + 16); g.lineTo(cx, cy + 22); g.fill();
    g.strokeStyle = '#f0e8d8'; g.lineWidth = 1.5;
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(cx + s * 10, cy + 20 + k * 3); g.lineTo(cx + s * 40, cy + 14 + k * 6); g.stroke(); }
    return;
  }
  const skin = p.skin ?? '#e8c4a4';
  // Collar and cravat.
  g.fillStyle = '#f2ede2';
  g.beginPath(); g.moveTo(cx - 22, y + h * 0.7); g.lineTo(cx, y + h * 0.84); g.lineTo(cx + 22, y + h * 0.7); g.closePath(); g.fill();
  g.fillStyle = skin; g.fillRect(cx - 12, cy + 30, 24, 28);
  if (p.blur) g.filter = 'blur(3px)';
  const headW = p.style === 'baby' ? 44 : 34, headH = p.style === 'baby' ? 42 : 44;
  // Hair behind the head.
  if (p.style === 'wig' || p.style === 'curls' || p.style === 'young' || p.style === 'tall') {
    g.fillStyle = p.hair ?? '#e8e4dc';
    const big = p.style === 'tall' ? 1.5 : 1;
    g.beginPath(); g.ellipse(cx, cy - 8 - (big - 1) * 30, headW + 14, (headH + 10) * big, 0, 0, Math.PI * 2); g.fill();
    if (p.style === 'wig') for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(cx + s * (headW + 10), cy + k * 16, 10, 0, Math.PI * 2); g.fill(); }
  }
  g.fillStyle = skin;
  g.beginPath(); g.ellipse(cx, cy, headW, headH, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(200,80,80,0.18)';
  for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 18, cy + 12, 8, 0, Math.PI * 2); g.fill(); }
  // Hair on top.
  g.fillStyle = p.hair ?? '#d8d8d8';
  switch (p.style) {
    case 'bun':
      g.beginPath(); g.ellipse(cx, cy - 30, headW + 2, 22, 0, Math.PI, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(cx, cy - 56, 16, 0, Math.PI * 2); g.fill();
      break;
    case 'bald':
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * (headW - 4), cy - 6, 9, 16, 0, 0, Math.PI * 2); g.fill(); }
      break;
    case 'cap':
      g.fillStyle = '#1a1414'; g.beginPath(); g.ellipse(cx, cy - 26, headW + 6, 26, 0, Math.PI, Math.PI * 2); g.fill();
      g.fillStyle = '#f0ece0'; g.fillRect(cx - headW - 4, cy - 30, (headW + 4) * 2, 6);
      break;
    case 'tophat':
      g.fillStyle = '#141212'; g.fillRect(cx - 30, cy - 104, 60, 66); g.fillRect(cx - 46, cy - 42, 92, 8);
      break;
    case 'baby':
      g.fillStyle = '#f4f0f8'; g.beginPath(); g.ellipse(cx, cy - 6, headW + 10, headH + 8, 0, Math.PI * 1.02, Math.PI * 1.98); g.lineTo(cx + headW + 8, cy + 20); g.lineTo(cx - headW - 8, cy + 20); g.fill();
      break;
    case 'young':
    case 'curls':
    case 'wig':
    case 'tall':
      g.beginPath(); g.ellipse(cx, cy - 30, headW + 4, 24, 0, Math.PI, Math.PI * 2); g.fill();
      break;
    default: break;
  }
  // Face.
  const ink = '#2a1a14';
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 3;
  const brow = p.brows ?? 'calm';
  for (const s of [-1, 1]) {
    g.beginPath();
    if (brow === 'glare') { g.moveTo(cx + s * 24, cy - 16); g.lineTo(cx + s * 7, cy - 9); } else if (brow === 'up') { g.moveTo(cx + s * 22, cy - 14); g.quadraticCurveTo(cx + s * 15, cy - 22, cx + s * 8, cy - 16); } else { g.moveTo(cx + s * 22, cy - 14); g.lineTo(cx + s * 8, cy - 14); }
    g.stroke();
  }
  const eyes = p.eyes ?? 'open';
  for (const s of [-1, 1]) {
    if (eyes === 'closed') { g.beginPath(); g.arc(cx + s * 15, cy - 4, 5, 0.1, Math.PI - 0.1); g.stroke(); } else { g.beginPath(); g.arc(cx + s * 15, cy - 4, 3.2, 0, Math.PI * 2); g.fill(); }
  }
  if (eyes === 'specs') { g.lineWidth = 2; for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 15, cy - 4, 9, 0, Math.PI * 2); g.stroke(); } g.beginPath(); g.moveTo(cx - 6, cy - 4); g.lineTo(cx + 6, cy - 4); g.stroke(); }
  if (eyes === 'monocle') { g.strokeStyle = '#c9a24a'; g.lineWidth = 2.5; g.beginPath(); g.arc(cx + 15, cy - 4, 10, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(cx + 22, cy + 3); g.lineTo(cx + 30, cy + 60); g.stroke(); g.strokeStyle = ink; }
  g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(cx, cy - 2); g.lineTo(cx - 4, cy + 12); g.lineTo(cx + 2, cy + 13); g.stroke();
  const mouth = p.mouth ?? 'flat';
  g.beginPath();
  if (mouth === 'smile') { g.arc(cx, cy + 16, 10, 0.3, Math.PI - 0.3); g.stroke(); } else if (mouth === 'frown') { g.arc(cx, cy + 30, 10, Math.PI + 0.4, -0.4); g.stroke(); } else if (mouth === 'lips') { g.fillStyle = '#b0202a'; g.ellipse(cx, cy + 22, 9, 4, 0, 0, Math.PI * 2); g.fill(); } else { g.moveTo(cx - 9, cy + 23); g.lineTo(cx + 9, cy + 23); g.stroke(); }
  if (p.tache) { g.fillStyle = p.tache; g.beginPath(); g.ellipse(cx - 11, cy + 17, 13, 5, 0.25, 0, Math.PI * 2); g.ellipse(cx + 11, cy + 17, 13, 5, -0.25, 0, Math.PI * 2); g.fill(); }
  if (p.beard) { g.fillStyle = p.beard; g.beginPath(); g.ellipse(cx, cy + 34, 26, 22, 0, 0, Math.PI); g.fill(); }
  g.filter = 'none';
  if (p.pearls) { g.fillStyle = '#f4f0e8'; for (let i = 0; i < 11; i++) { const a = 0.25 + (i / 10) * (Math.PI - 0.5); g.beginPath(); g.arc(cx + Math.cos(a) * 30, cy + 52 + Math.sin(a) * 14, 4, 0, Math.PI * 2); g.fill(); } }
  if (p.medal) { g.fillStyle = '#c9a24a'; g.beginPath(); g.arc(cx - 34, y + h * 0.86, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = '#2a4a9a'; g.fillRect(cx - 38, y + h * 0.78, 8, 10); }
  if (p.overpainted) {
    // Somebody painted over Cousin Eric: a brown smear with a new, worse face on it.
    g.globalAlpha = 0.92;
    g.fillStyle = '#5a3a22';
    for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(cx + (i - 3) * 7, cy + (i % 2) * 6, 30, 46, 0.2 * (i - 3), 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
    g.fillStyle = '#f0c8a0'; g.beginPath(); g.arc(cx + 6, cy + 4, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = ink; g.beginPath(); g.arc(cx - 2, cy, 3, 0, Math.PI * 2); g.arc(cx + 14, cy, 3, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(cx + 6, cy + 10, 9, 0.2, Math.PI - 0.2); g.stroke();
  }
  // Varnish: a warm glaze and a dark vignette.
  const v = g.createRadialGradient(cx, cy, w * 0.2, cx, y + h / 2, w * 0.8);
  v.addColorStop(0, 'rgba(255,220,150,0.05)'); v.addColorStop(1, 'rgba(10,5,0,0.55)');
  g.fillStyle = v; g.fillRect(x, y, w, h);
}

const PORTRAITS: Record<string, PortraitSpec> = {
  nana: { bg: ['#3a4a3a', '#101810'], coat: '#5a2a4a', hair: '#e2e2e6', style: 'bun', brows: 'glare', eyes: 'specs', mouth: 'frown', pearls: true },
  grandpa: { bg: ['#5a4a32', '#1a140c'], coat: '#6a5a3a', skin: '#e6b898', hair: '#f0f0f0', style: 'bald', brows: 'up', eyes: 'closed', mouth: 'smile', tache: '#f0f0f0' },
  ambrose: { bg: ['#4a3a2a', '#140e08'], coat: '#8a1a1a', skin: '#f0d4bc', hair: '#ece8e0', style: 'wig', mouth: 'flat', medal: true },
  hester: { bg: ['#2a3a4a', '#0a1018'], coat: '#2a4a7a', skin: '#f2d8c4', hair: '#5a3a1a', style: 'tall', mouth: 'smile', pearls: true },
  cuthbert: { bg: ['#4a3a2a', '#140e08'], coat: '#9a1a1a', skin: '#e8b090', hair: '#8a6a4a', style: 'bald', eyes: 'monocle', mouth: 'frown', tache: '#7a5a3a', medal: true },
  prudence: { bg: ['#3a3a3a', '#0e0e0e'], coat: '#1a1616', skin: '#e8d0c0', style: 'cap', brows: 'glare', mouth: 'frown' },
  harold: { bg: ['#4a4a3a', '#12120c'], coat: '#1c1c1c', skin: '#e8c0a0', style: 'tophat', mouth: 'flat', tache: '#3a2a1a' },
  gerald: { bg: ['#3a4a4a', '#0c1414'], coat: '#5a4030', skin: '#ecc8a8', hair: '#9a8a7a', style: 'bald', eyes: 'specs', brows: 'up', mouth: 'smile' },
  reginald: { bg: ['#4a3a4a', '#140c14'], coat: '#2a4a2a', skin: '#e4bc9c', hair: '#5a3a2a', style: 'curls', beard: '#5a3a2a', mouth: 'flat', blur: true },
  mittens: { bg: ['#5a2a2a', '#180808'], coat: '#7a1a2a', style: 'cat' },
  eric: { bg: ['#3a4a3a', '#101810'], coat: '#2a2a4a', hair: '#3a2a1a', style: 'curls', mouth: 'smile', overpainted: true },
  heir: { bg: ['#4a4a5a', '#121218'], coat: '#f0ecf4', skin: '#f6d8c8', style: 'baby', brows: 'up', mouth: 'smile' },
  dobbin: { bg: ['#5a6a4a', '#18200f'], coat: '#000000', style: 'horse' },
  manor: { bg: ['#3a4250', '#10141a'], coat: '#000000', style: 'house' },
  yacht: { bg: ['#4a5a6a', '#141a20'], coat: '#000000', style: 'sea' },
  youngNana: { bg: ['#6a2a3a', '#1a0a10'], coat: '#7a1a2a', skin: '#f4d4c0', hair: '#2a1a14', style: 'young', mouth: 'lips', brows: 'calm', pearls: true },
};

// ═══════════════════════════ The house ═══════════════════════════

/** A room's footprint, height and floor level (the gallery is the hall above y = 3). */
interface RoomRect { k: string; x0: number; x1: number; z0: number; z1: number; h: number }
const ROOMS: RoomRect[] = [
  { k: 'Pantry', x0: 13, x1: 16, z0: 3, z1: 6, h: KITCHEN_HEIGHT },
  { k: 'Kitchen', x0: 8, x1: 16, z0: -6, z1: 6, h: KITCHEN_HEIGHT },
  { k: 'Hall', x0: -8, x1: 8, z0: -12, z1: 6, h: HALL_HEIGHT },
  { k: 'Drawing', x0: -22, x1: -8.3, z0: -6, z1: 6, h: HT.drawing },
  { k: 'Conservatory', x0: -30, x1: -22.3, z0: -15, z1: 6, h: HT.conservatory },
  { k: 'Library', x0: -22, x1: -8.3, z0: -21, z1: -6.3, h: HT.library },
  { k: 'Dining', x0: -8, x1: 8, z0: -21, z1: -12.3, h: HT.dining },
  { k: 'Study', x0: 8.3, x1: 16.3, z0: -21, z1: -13.8, h: HT.study },
  { k: 'Billiard', x0: 8.3, x1: 20.3, z0: -13.5, z1: -6.3, h: HT.billiard },
  { k: 'Scullery', x0: 16.3, x1: 20.3, z0: -6, z1: 3, h: HT.scullery },
];
const ROOM_H: Record<string, number> = Object.fromEntries(ROOMS.map((r) => [r.k, r.h]));
ROOM_H.Gallery = HALL_HEIGHT;

export function buildManor(def: MapDef): MapView {
  const v = new ViewBuilder(def);
  const boxes = def.boxes;
  const byLabel = (label: string): Box => {
    const b = boxes.find((x) => x.label === label);
    if (!b) throw new Error(`manor: no box '${label}'`);
    return b;
  };

  // ───────── Materials ─────────
  const M = {
    outside: mat('#2b2522', { rough: 1 }),
    plaster: mat('#ece3d2', { rough: 1 }),
    darkWood: mat('#3a2214', { rough: 0.55 }),
    mahogany: mat('#5a2a18', { rough: 0.45 }),
    midWood: mat('#7a4a2a', { rough: 0.55 }),
    oak: mat('#9a6a3a', { rough: 0.6 }),
    walnut: mat('#4a2e1c', { rough: 0.5 }),
    blackLacquer: mat('#151112', { rough: 0.3 }),
    white: mat('#f2eee4', { rough: 0.6 }),
    cream: mat('#e8dcc0', { rough: 0.7 }),
    gilt: mat('#c9a24a', { rough: 0.35, metal: 0.75 }),
    brass: mat('#d0aa50', { rough: 0.3, metal: 0.85 }),
    silver: mat('#c8ccd0', { rough: 0.25, metal: 0.9 }),
    iron: mat('#1e1c1c', { rough: 0.6, metal: 0.4 }),
    whiteIron: mat('#f0f0ea', { rough: 0.45, metal: 0.2 }),
    velvet: mat('#6a1a26', { rough: 0.95 }),
    velvetHi: mat('#8a2a36', { rough: 0.95 }),
    leather: mat('#5a1e16', { rough: 0.5 }),
    greenLeather: mat('#1f4a32', { rough: 0.5 }),
    duckVelvet: mat('#8ab8b4', { rough: 0.95 }),
    rose: mat('#b8707a', { rough: 0.95, map: folds() }),
    crimsonCurtain: mat('#7a1424', { rough: 0.95, map: folds() }),
    blackCurtain: mat('#1a1416', { rough: 0.9, map: folds() }),
    tartanCurtain: mat('#ffffff', { rough: 0.9, map: tartan() }),
    greenCurtain: mat('#2a4a32', { rough: 0.95, map: folds() }),
    linen: mat('#f4f0e6', { rough: 0.9 }),
    china: mat('#f8f6f0', { rough: 0.25 }),
    blueChina: mat('#3a5a9a', { rough: 0.3 }),
    black: mat('#121010', { rough: 0.5 }),
    marble: mat('#ffffff', { rough: 0.3, map: marble('whiteMarble', '#ece8e0', '#8a8478') }),
    blackMarble: mat('#ffffff', { rough: 0.25, map: marble('blackMarble', '#1e1b1c', '#c9b88a') }),
    greenMarble: mat('#ffffff', { rough: 0.3, map: marble('greenMarble', '#1f3a2e', '#a8c8b0') }),
    terracotta: mat('#b05a3a', { rough: 0.9 }),
    leaf: mat('#3f6a32', { rough: 0.8 }),
    leafDark: mat('#2a4a24', { rough: 0.8 }),
    soot: mat('#0c0a0a', { rough: 1 }),
    paper: mat('#f2ead2', { rough: 0.9 }),
    copper: mat('#b8643a', { rough: 0.35, metal: 0.8 }),
    ribbon: mat('#0a0808', { rough: 0.6 }),
    baize: mat('#1f6a3a', { rough: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: '#dfeff4', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25, depthWrite: false }),
    water: mat('#3a7a7a', { rough: 0.1, emissive: '#1a4a4a', emissiveIntensity: 0.6 }),
    frondMat: new THREE.MeshStandardMaterial({ map: frond(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }),
  };
  // Glowing things: the Storm's power cut turns these down (see tick).
  const glow = {
    bulb: mat('#fff4d6', { emissive: '#ffd89a', emissiveIntensity: 2.2 }),
    shade: mat('#f6e2b8', { emissive: '#ffb860', emissiveIntensity: 0.9, rough: 0.9 }),
    greenShade: mat('#2a6a3a', { emissive: '#3a8a4a', emissiveIntensity: 0.5, rough: 0.4 }),
    candle: mat('#fff0c0', { emissive: '#ffc060', emissiveIntensity: 2.4 }),
    crystal: mat('#ffffff', { emissive: '#fff0d0', emissiveIntensity: 0.8, rough: 0.05, metal: 0.3 }),
  };
  const GLOW_BASE = new Map<THREE.MeshStandardMaterial, number>(Object.values(glow).map((m) => [m, m.emissiveIntensity]));
  const fireMat = mat('#ffffff', { map: fire(), emissive: '#ffffff', emissiveIntensity: 1.6, rough: 1 });
  fireMat.emissiveMap = fire();
  const embers = mat('#3a0a04', { emissive: '#ff4a10', emissiveIntensity: 1.2 });
  const windows = new THREE.MeshStandardMaterial({ color: '#cfe0ff', emissive: '#bcd3ff', emissiveIntensity: 0.9, roughness: 0.2, emissiveMap: rain() });
  const stained = mat('#ffffff', { map: stainedGlass(), emissive: '#ffffff', emissiveIntensity: 0.9, rough: 0.3 });
  stained.emissiveMap = stainedGlass();
  const booksMat = mat('#ffffff', { map: books(), rough: 0.85 });
  const signs = new Atlas(2048, 1024);
  const signMat = mat('#ffffff', { map: signs.tex, rough: 0.6 });
  const portraitsAtlas = new Atlas(1024, 1024);
  const portraitMat = mat('#ffffff', { map: portraitsAtlas.tex, rough: 0.7 });
  const portraitUV = new Map<string, UV>();
  for (const [k, spec] of Object.entries(PORTRAITS)) portraitUV.set(k, portraitsAtlas.region(240, 250, (g, x, y, w, h) => drawPortrait(g, x, y, w, h, spec)));

  /** Room styles: wallpaper, panelling (wainscot), dado rail, skirting, cornice. */
  interface Style { paper: Mat; paperTile: number; wainscot?: { h: number; m: Mat; rail: Mat }; skirting: Mat; cornice?: Mat }
  const panelMat = (c: string) => mat(c, { map: panels(), rough: 0.5 });
  const STYLE: Record<string, Style> = {
    Hall: { paper: mat('#ffffff', { map: damask('hallDamask', '#5e1a18', '#742822', '#9a5a3a'), rough: 0.9 }), paperTile: 0.8, wainscot: { h: 1.25, m: panelMat('#6a3220'), rail: M.mahogany }, skirting: M.darkWood, cornice: mat('#e0d0a8', { rough: 0.6 }) },
    Gallery: { paper: mat('#ffffff', { map: damask('galleryDamask', '#1f4446', '#285456', '#4a8078'), rough: 0.9 }), paperTile: 0.8, wainscot: { h: 0.9, m: panelMat('#6a3220'), rail: M.mahogany }, skirting: M.darkWood, cornice: mat('#e0d0a8', { rough: 0.6 }) },
    Drawing: { paper: mat('#ffffff', { map: stripes('drawStripes', '#a9ccc8', '#c4ddd8', '#c9a24a'), rough: 0.9 }), paperTile: 0.5, wainscot: { h: 0.95, m: panelMat('#f2eee4'), rail: M.gilt }, skirting: M.white, cornice: M.white },
    Conservatory: { paper: mat('#ffffff', { map: trellis(), rough: 0.9 }), paperTile: 0.6, wainscot: { h: 0.6, m: panelMat('#f0ece0'), rail: M.white }, skirting: M.white },
    Library: { paper: mat('#ffffff', { map: flock('libFlock', '#1c3428', '#264434'), rough: 0.9 }), paperTile: 0.5, skirting: M.darkWood, cornice: M.walnut },
    Dining: { paper: mat('#ffffff', { map: damask('diningDamask', '#141012', '#1e1a16', '#a8843a'), rough: 0.8 }), paperTile: 0.8, wainscot: { h: 1.05, m: panelMat('#2a2626'), rail: M.gilt }, skirting: M.blackLacquer, cornice: M.gilt },
    Study: { paper: mat('#ffffff', { map: tartan(), rough: 0.9 }), paperTile: 0.6, wainscot: { h: 1.7, m: panelMat('#9a6a3a'), rail: M.walnut }, skirting: M.walnut, cornice: M.walnut },
    Billiard: { paper: mat('#ffffff', { map: damask('billiardDamask', '#173426', '#1e4230', '#5a7a4a'), rough: 0.9 }), paperTile: 0.8, wainscot: { h: 1.25, m: panelMat('#4a2a18'), rail: M.darkWood }, skirting: M.darkWood, cornice: M.darkWood },
    Kitchen: { paper: mat('#d9bf73', { map: wallpaper(), rough: 0.92 }), paperTile: 1, wainscot: { h: 1.1, m: mat('#f4eed8', { map: wallTiles(), rough: 0.3 }), rail: mat('#2f4a3a') }, skirting: M.darkWood, cornice: M.cream },
    Pantry: { paper: mat('#93a9b0', { rough: 0.95 }), paperTile: 1, skirting: M.darkWood },
    Scullery: { paper: mat('#b8cbb0', { rough: 0.95 }), paperTile: 1, wainscot: { h: 1.5, m: mat('#f4f4ec', { map: wallTiles(), rough: 0.3 }), rail: mat('#2f4a3a') }, skirting: M.darkWood },
  };
  const jamb = M.darkWood;

  /** Which room a point looks into ('Jamb' inside a doorway's wall thickness, 'Outside' beyond the house). */
  const roomOf = (p: Vec3): string => {
    for (const r of ROOMS) {
      if (p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1 && p.y > -0.01 && p.y < r.h) {
        return r.k === 'Hall' && p.y > GALLERY_Y && p.z < -8 ? 'Gallery' : r.k;
      }
    }
    for (const vol of def.inside) {
      if (p.x > vol.min.x && p.x < vol.max.x && p.z > vol.min.z && p.z < vol.max.z && p.y > 0 && p.y < vol.max.y - 0.3) return 'Jamb';
    }
    return 'Outside';
  };
  const floorLevel = (room: string) => (room === 'Gallery' ? GALLERY_Y : 0);

  // ───────── Geometry helpers ─────────
  /** A box with world-aligned UVs (patterns run on across pieces): one repeat = tu by tv metres. */
  const worldBox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: Mat | Mat[], tu = 1, tv = tu): THREE.Mesh => {
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    const pos = geo.attributes.position as THREE.BufferAttribute, uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        const X = pos.getX(k) + cx, Y = pos.getY(k) + cy, Z = pos.getZ(k) + cz;
        let u: number, w: number;
        if (f === 0) { u = -Z; w = Y; } else if (f === 1) { u = Z; w = Y; } else if (f === 2) { u = X; w = -Z; } else if (f === 3) { u = X; w = Z; } else if (f === 4) { u = X; w = Y; } else { u = -X; w = Y; }
        uv.setXY(k, u / tu, w / tv);
      }
    }
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(cx, cy, cz);
    return mesh;
  };
  /** A group at (x, y, z) facing `face`: inside it, +x runs to the viewer's right and +z towards the viewer. */
  const grp = (x: number, y: number, z: number, face: Face = 'S', block = false): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ROT[face];
    v.add(g, block);
    return g;
  };
  const bx = (g: THREE.Object3D, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: Mat | Mat[], tile = 1): THREE.Mesh => {
    const mesh = boxMesh(x0, y0, z0, x1, y1, z1, m, tile);
    g.add(mesh);
    return mesh;
  };
  const cyl = (g: THREE.Object3D, x: number, y0: number, z: number, rBot: number, rTop: number, h: number, m: Mat, seg = 12): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), m);
    mesh.position.set(x, y0 + h / 2, z);
    g.add(mesh);
    return mesh;
  };
  const ball = (g: THREE.Object3D, x: number, y: number, z: number, r: number, m: Mat, sx = 1, sy = 1, sz = 1, seg = 12): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7))), m);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    g.add(mesh);
    return mesh;
  };
  const plane = (g: THREE.Object3D, geo: THREE.BufferGeometry, m: Mat, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    g.add(mesh);
    return mesh;
  };
  /** A sign (from the atlas) on a plane facing +z in `g`. */
  const signAt = (g: THREE.Object3D, lines: (string | Line)[], w: number, h: number, x: number, y: number, z: number, st: SignStyle = SIGN.brass, ry = 0, rx = 0): THREE.Mesh => {
    const ppm = Math.min(260, 900 / Math.max(w, h));
    const uv = signs.region(w * ppm, h * ppm, (gg, X, Y, W, H) => drawSign(gg, X, Y, W, H, lines, st));
    return plane(g, uvPlane(w, h, uv), signMat, x, y, z, rx, ry);
  };
  /** A sign drawn by hand into the atlas. */
  const customSign = (g: THREE.Object3D, wpx: number, hpx: number, draw: (gg: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void, w: number, h: number, x: number, y: number, z: number, rx = 0, ry = 0): THREE.Mesh => {
    const uv = signs.region(wpx, hpx, draw);
    return plane(g, uvPlane(w, h, uv), signMat, x, y, z, rx, ry);
  };
  /** A gilt-framed painting from the portrait atlas, hung at (x, y, z) on a wall facing `face`, with an optional plaque. */
  const painting = (key: string, x: number, y: number, z: number, face: Face, w = 0.9, h = 1.1, plaque?: (string | Line)[], frame: Mat = M.gilt): void => {
    const g = grp(x, y, z, face);
    const fw = 0.09;
    bx(g, -w / 2 - fw, -h / 2 - fw, 0, w / 2 + fw, h / 2 + fw, 0.05, frame);
    bx(g, -w / 2 - fw * 0.4, -h / 2 - fw * 0.4, 0.05, w / 2 + fw * 0.4, h / 2 + fw * 0.4, 0.07, M.darkWood);
    plane(g, uvPlane(w, h, portraitUV.get(key)!), portraitMat, 0, 0, 0.075);
    if (plaque) signAt(g, plaque, Math.min(0.7, w * 0.8), 0.16, 0, -h / 2 - fw - 0.12, 0.03, SIGN.brass);
  };

  // ───────── Rugs ─────────
  const rug = (x: number, z: number, w: number, d: number, tex: THREE.Texture, rotY = 0, y = 0.008): void => {
    const g = grp(x, y, z, 'S');
    g.rotation.y = rotY;
    plane(g, new THREE.PlaneGeometry(w, d), mat('#ffffff', { map: tex, rough: 1 }), 0, 0, 0, -Math.PI / 2);
  };

  // ───────── Lights ─────────
  const L = {
    hall: v.point(0, 4.5, 0.5, '#ffc98a', 55, 22),
    underGallery: v.point(0, 2.3, -10.2, '#ffbf7a', 9, 9, true),
    gallery: v.point(0, 5.1, -10.4, '#ffcf96', 18, 12, true),
    drawing: v.point(-15.2, 3.3, 0, '#ffd9a8', 30, 15),
    drawingFire: v.point(-12.5, 0.9, -4.7, '#ff8a3a', 12, 7, true),
    conservatory: v.point(-26.2, 4.2, -4.5, '#e6f6ff', 16, 16, true),
    library: v.point(-13.6, 2.3, -9.2, '#ffcf8a', 24, 12),
    libraryFire: v.point(-20.6, 1.0, -16.65, '#ff9a4a', 14, 10, true),
    dining: v.point(0, 3.0, -16.65, '#ffc98a', 34, 14),
    study: v.point(12.7, 1.9, -17.8, '#ffd27a', 16, 9),
    billiard: v.point(14.6, 2.3, -9.9, '#fff0c8', 24, 10),
    kitchen: v.point(12, 2.45, 0, '#fff0c8', 26, 12),
  };

  // ═════════ Structure: floors, walls (per room, both sides), ceilings, doorways ═════════

  const FLOOR: Record<string, { m: Mat; tile: number }> = {
    'Front hall floor': { m: mat('#ffffff', { map: chequer(), rough: 0.25 }), tile: 1.2 },
    'Kitchen floor': { m: mat('#ffffff', { map: tiles(), rough: 0.5 }), tile: 1 },
    'Drawing room floor': { m: mat('#ffffff', { map: parquet('parquetLight', '#b07a44', '#9a6434'), rough: 0.45 }), tile: 1 },
    'Conservatory floor': { m: mat('#ffffff', { map: encaustic(), rough: 0.6 }), tile: 0.8 },
    'Library floor': { m: mat('#7a4a2a', { map: wood(), rough: 0.6 }), tile: 2 },
    'Dining room floor': { m: mat('#ffffff', { map: parquet('parquetDark', '#6a3a1e', '#5a2e16'), rough: 0.4 }), tile: 1 },
    'Study floor': { m: mat('#9a6a44', { map: wood(), rough: 0.6 }), tile: 2 },
    'Billiard room floor': { m: mat('#6a4028', { map: wood(), rough: 0.6 }), tile: 2 },
    'Scullery floor': { m: mat('#ffffff', { map: flags(), rough: 0.9 }), tile: 2 },
  };

  /** Heights where wall faces change room, and lines along the walls where rooms meet. */
  const CUT_Y = [GALLERY_Y, HT.study, HT.drawing, HT.conservatory, HT.library];
  const CUT_Z = [-21, -15, -13.8, -13.5, -12.3, -12, -8, -6.3, -6, 3];
  const CUT_X = [-22.3, -22, -8.3, -8, 8, 8.3, 16, 16.3];
  const split = (b: Box, axis: 'x' | 'y' | 'z', at: number): Box[] => {
    if (!(b.min[axis] < at - 0.05 && b.max[axis] > at + 0.05)) return [b];
    return [{ ...b, min: { ...b.min }, max: { ...b.max, [axis]: at } }, { ...b, min: { ...b.min, [axis]: at }, max: { ...b.max } }];
  };

  const FURNITURE_WALLS = /^(Hall column|Grandfather clock|Kitchen dresser|Drawing room chimney|Harp|Folding screen|Curio cabinet|Bookcase|Library chimney|Stack|Dining room chimney|Silver cabinet|Suit of armour|Study bookcase)/;
  const GLASS = /^Conservatory (north|south|west) glass/;

  const drawWallPiece = (p: Box): void => {
    const cx = (p.min.x + p.max.x) / 2, cy = (p.min.y + p.max.y) / 2, cz = (p.min.z + p.max.z) / 2;
    const e = 0.15;
    const faces = [
      roomOf({ x: p.max.x + e, y: cy, z: cz }), roomOf({ x: p.min.x - e, y: cy, z: cz }),
      'Outside', p.min.y > 0.1 ? roomOf({ x: cx, y: p.min.y - e, z: cz }) : 'Outside',
      roomOf({ x: cx, y: cy, z: p.max.z + e }), roomOf({ x: cx, y: cy, z: p.min.z - e }),
    ];
    const mats = faces.map((r) => (r === 'Outside' ? M.outside : r === 'Jamb' ? jamb : STYLE[r]?.paper ?? M.outside));
    // One wallpaper scale for the whole house face (patterns run on across pieces).
    const tile = faces.map((r) => STYLE[r]?.paperTile ?? 1).find((t) => t !== 1) ?? 1;
    v.add(worldBox(p.min.x, p.min.y, p.min.z, p.max.x, p.max.y, p.max.z, mats, tile), true);
    // Panelling, dado rail, skirting and cornice on each side that faces a room.
    const sides: { room: string; axis: 'x' | 'z'; at: number; dir: 1 | -1; a0: number; a1: number }[] = [];
    if (STYLE[faces[0]]) sides.push({ room: faces[0], axis: 'x', at: p.max.x, dir: 1, a0: p.min.z, a1: p.max.z });
    if (STYLE[faces[1]]) sides.push({ room: faces[1], axis: 'x', at: p.min.x, dir: -1, a0: p.min.z, a1: p.max.z });
    if (STYLE[faces[4]]) sides.push({ room: faces[4], axis: 'z', at: p.max.z, dir: 1, a0: p.min.x, a1: p.max.x });
    if (STYLE[faces[5]]) sides.push({ room: faces[5], axis: 'z', at: p.min.z, dir: -1, a0: p.min.x, a1: p.max.x });
    for (const s of sides) {
      if (s.a1 - s.a0 < 0.06) continue;
      const st = STYLE[s.room];
      const fl = floorLevel(s.room);
      const strip = (y0: number, y1: number, depth: number, m: Mat, tu = 1, tv = 1) => {
        if (y1 <= p.min.y + 0.001 || y0 >= p.max.y - 0.001) return;
        const ya = Math.max(y0, p.min.y), yb = Math.min(y1, p.max.y);
        const d0 = s.at, d1 = s.at + s.dir * depth;
        if (s.axis === 'x') v.add(worldBox(Math.min(d0, d1), ya, s.a0, Math.max(d0, d1), yb, s.a1, m, tu, tv));
        else v.add(worldBox(s.a0, ya, Math.min(d0, d1), s.a1, yb, Math.max(d0, d1), m, tu, tv));
      };
      if (st.wainscot) {
        strip(fl, fl + st.wainscot.h, 0.025, st.wainscot.m, s.room === 'Kitchen' || s.room === 'Scullery' ? 0.4 : 0.8, s.room === 'Kitchen' || s.room === 'Scullery' ? 0.4 : st.wainscot.h);
        strip(fl + st.wainscot.h, fl + st.wainscot.h + 0.06, 0.045, st.wainscot.rail);
      }
      strip(fl, fl + 0.2, 0.04, st.skirting);
      const h = ROOM_H[s.room];
      if (st.cornice && h) {
        strip(h - 0.24, h, 0.06, st.cornice);
        strip(h - 0.12, h, 0.13, st.cornice);
      }
    }
  };

  for (const b of boxes) {
    const { min: a, max: c } = b;
    switch (b.kind) {
      case 'floor': {
        const f = FLOOR[b.label ?? ''] ?? { m: M.midWood, tile: 1 };
        v.add(worldBox(a.x, a.y, a.z, c.x, c.y, c.z, [M.darkWood, M.darkWood, f.m, M.darkWood, M.darkWood, M.darkWood], f.tile), true);
        break;
      }
      case 'wall': {
        if (FURNITURE_WALLS.test(b.label ?? '')) break; // drawn with its room
        let parts: Box[] = [b];
        for (const y of CUT_Y) parts = parts.flatMap((p) => split(p, 'y', y));
        const thinX = c.x - a.x < c.z - a.z;
        for (const at of thinX ? CUT_Z : CUT_X) parts = parts.flatMap((p) => split(p, thinX ? 'z' : 'x', at));
        for (const p of parts) drawWallPiece(p);
        break;
      }
      default: break;
    }
  }

  // Doorways: thresholds, architraves on both faces, and open doors folded back.
  interface Doorway { thinX: boolean; a0: number; a1: number; w0: number; w1: number; top: number }
  const doorways: Doorway[] = boxes.filter((b) => b.kind === 'wall' && /lintel/i.test(b.label ?? '')).map((b) => {
    const thinX = b.max.x - b.min.x < b.max.z - b.min.z;
    return { thinX, a0: thinX ? b.min.z : b.min.x, a1: thinX ? b.max.z : b.max.x, w0: thinX ? b.min.x : b.min.z, w1: thinX ? b.max.x : b.max.z, top: b.min.y };
  });
  const ARCHITRAVE: Record<string, Mat> = {
    Hall: M.mahogany, Gallery: M.mahogany, Drawing: M.white, Conservatory: M.whiteIron, Library: M.walnut, Dining: M.blackLacquer,
    Study: M.walnut, Billiard: M.darkWood, Kitchen: M.cream, Scullery: M.cream, Pantry: M.cream,
  };
  for (const d of doorways) {
    const mid = (d.a0 + d.a1) / 2, wm = (d.w0 + d.w1) / 2;
    // Threshold strip (also hides where two floors meet).
    if (d.thinX) v.add(boxMesh(d.w0 - 0.02, 0, d.a0, d.w1 + 0.02, 0.012, d.a1, M.marble));
    else v.add(boxMesh(d.a0, 0, d.w0 - 0.02, d.a1, 0.012, d.w1 + 0.02, M.marble));
    for (const side of [-1, 1] as const) {
      const wallFace = side < 0 ? d.w0 : d.w1;
      const probe = d.thinX ? { x: wallFace + side * 0.3, y: 1, z: mid } : { x: mid, y: 1, z: wallFace + side * 0.3 };
      const room = roomOf(probe);
      const am = ARCHITRAVE[room] ?? M.darkWood;
      const out = side * 0.05;
      const piece = (s0: number, s1: number, y0: number, y1: number) => {
        if (d.thinX) v.add(boxMesh(Math.min(wallFace, wallFace + out), y0, s0, Math.max(wallFace, wallFace + out), y1, s1, am));
        else v.add(boxMesh(s0, y0, Math.min(wallFace, wallFace + out), s1, y1, Math.max(wallFace, wallFace + out), am));
      };
      piece(d.a0 - 0.16, d.a0, 0, d.top + 0.16);
      piece(d.a1, d.a1 + 0.16, 0, d.top + 0.16);
      piece(d.a0 - 0.22, d.a1 + 0.22, d.top + 0.16, d.top + 0.3);
      if (room === 'Dining' || room === 'Drawing' || room === 'Hall') piece(d.a0 - 0.1, d.a1 + 0.1, d.top + 0.3, d.top + 0.36);
    }
    void wm;
  }

  /** An open door leaf folded flat against a wall face (hinged at `hinge`, lying towards `dir`). */
  const doorLeaf = (thinX: boolean, wallFace: number, side: 1 | -1, hinge: number, dir: 1 | -1, w: number, h: number, m: Mat, glazed = false): void => {
    const off = side * 0.03, t = side * 0.05;
    const s0 = Math.min(hinge, hinge + dir * w), s1 = Math.max(hinge, hinge + dir * w);
    const f0 = Math.min(wallFace + off, wallFace + off + t), f1 = Math.max(wallFace + off, wallFace + off + t);
    const B = (a0: number, a1: number, y0: number, y1: number, mm: Mat, inset = 0) => {
      if (thinX) v.add(boxMesh(f0 + (side > 0 ? inset : 0), y0, a0, f1 + (side < 0 ? -inset : 0), y1, a1, mm));
      else v.add(boxMesh(a0, y0, f0 + (side > 0 ? inset : 0), a1, y1, f1 + (side < 0 ? -inset : 0), mm));
    };
    B(s0, s1, 0.02, h, m);
    if (glazed) {
      B(s0 + 0.1, s1 - 0.1, 0.9, h - 0.12, windows, 0.012);
      const n = 3;
      for (let i = 1; i < n; i++) B(s0 + 0.08, s1 - 0.08, 0.9 + ((h - 1.02) * i) / n - 0.02, 0.9 + ((h - 1.02) * i) / n + 0.02, M.whiteIron, 0.015);
    } else {
      const pm = m === M.white ? M.gilt : M.darkWood;
      for (const [y0, y1] of [[0.15, h * 0.45], [h * 0.5, h - 0.15]]) {
        const sm = s0 + 0.1, se = s1 - 0.1;
        B(sm, se, y0, y0 + 0.025, pm, 0.012); B(sm, se, y1 - 0.025, y1, pm, 0.012);
        B(sm, sm + 0.025, y0, y1, pm, 0.012); B(se - 0.025, se, y0, y1, pm, 0.012);
      }
    }
  };
  // Hall ↔ drawing room: white and gilt double doors, folded back into the drawing room.
  doorLeaf(true, -8.3, -1, -1.2, -1, 1.15, 2.95, M.white);
  doorLeaf(true, -8.3, -1, 1.2, 1, 1.15, 2.95, M.white);
  // Drawing room ↔ conservatory: glazed French doors.
  doorLeaf(true, -22.3, -1, -1.2, -1, 1.1, 2.95, M.whiteIron, true);
  doorLeaf(true, -22.3, -1, 1.2, 1, 1.1, 2.95, M.whiteIron, true);
  // Under the gallery into the dining room (mahogany, folded into the dining room).
  doorLeaf(false, -12.3, -1, -5.4, -1, 1.0, 2.35, M.mahogany);
  doorLeaf(false, -12.3, -1, 5.4, 1, 1.0, 2.35, M.mahogany);
  // Dining room ↔ library and study; library ↔ conservatory and drawing room; the back rooms.
  doorLeaf(true, -8.3, -1, -17.65, -1, 1.0, 2.55, M.walnut);
  doorLeaf(true, 8.3, 1, -15.65, 1, 1.0, 2.55, M.walnut);
  doorLeaf(true, -22.3, -1, -9.4, -1, 1.0, 2.65, M.whiteIron, true);
  doorLeaf(false, -6, 1, -16.4, 1, 1.0, 2.65, M.white);
  doorLeaf(true, 8.3, 1, -10.9, -1, 1.0, 2.35, M.darkWood);
  doorLeaf(false, -13.5, 1, 13.3, 1, 1.0, 2.25, M.walnut);
  doorLeaf(false, -6, 1, 17.3, -1, 1.0, 2.25, M.cream);
  doorLeaf(true, 16.3, 1, -2.6, 1, 1.0, 2.25, M.cream);

  // ───────── Ceilings ─────────
  const ceilingPlane = (x0: number, z0: number, x1: number, z1: number, y: number, m: Mat, tile = 0): void => {
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    if (tile > 0) {
      const a = geo.attributes.uv as THREE.BufferAttribute, p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) a.setXY(i, (p.getX(i) + (x0 + x1) / 2) / tile, (p.getY(i) - (z0 + z1) / 2) / tile);
    }
    const mesh = new THREE.Mesh(geo, m);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    v.add(mesh, true);
  };
  const cofferHall = mat('#ffffff', { map: coffers('cofferHall', '#e8dcc4', '#c8b890', '#a8884a', '#c9a24a'), rough: 0.9 });
  ceilingPlane(-8, -8, 8, 6, HALL_HEIGHT, cofferHall, 2);
  ceilingPlane(-8, -12, 8, -8, HALL_HEIGHT, cofferHall, 2);
  ceilingPlane(8, -6, 16, 6, KITCHEN_HEIGHT, M.plaster);
  ceilingPlane(-22, -6, -8.3, 6, HT.drawing, mat('#ffffff', { map: roseCeiling(), rough: 0.95 }));
  ceilingPlane(-22, -21, -8.3, -6.3, HT.library, mat('#ffffff', { map: beams('libBeams', '#2a3a2e', '#2a1a10'), rough: 0.9 }), 1.6);
  ceilingPlane(-8, -21, 8, -12.3, HT.dining, mat('#ffffff', { map: coffers('cofferDining', '#1e1a18', '#141010', '#a8843a', '#c9a24a'), rough: 0.8 }), 1.45);
  ceilingPlane(8.3, -21, 16.3, -13.8, HT.study, mat('#ffffff', { map: beams('studyBeams', '#e4d8c0', '#4a2e1c'), rough: 0.9 }), 1.2);
  ceilingPlane(8.3, -13.5, 20.3, -6.3, HT.billiard, mat('#ffffff', { map: beams('billiardBeams', '#d8cfb8', '#2a1a10'), rough: 0.9 }), 1.4);
  ceilingPlane(16.3, -6, 20.3, 3, HT.scullery, M.plaster);
  // The conservatory roof: glass on a white iron grid.
  ceilingPlane(-30, -15, -22.3, 6, HT.conservatory, windows);

  // ═════════════════════════════ Shared furniture ═════════════════════════════

  /** A window on the inside face of an outer wall: pane, glazing bars, sill, curtains and pelmet. */
  const windowAt = (x: number, z: number, face: Face, w: number, y0: number, y1: number, curtain?: Mat, pelmet: Mat = M.gilt, frame: Mat = M.white): void => {
    const g = grp(x, 0, z, face);
    const h = y1 - y0;
    bx(g, -w / 2, y0, 0, w / 2, y1, 0.01, windows);
    bx(g, -w / 2 - 0.1, y0 - 0.06, 0, w / 2 + 0.1, y0, 0.16, frame); // sill
    bx(g, -w / 2 - 0.08, y1, 0, w / 2 + 0.08, y1 + 0.08, 0.06, frame);
    bx(g, -w / 2 - 0.08, y0, 0, -w / 2, y1, 0.06, frame);
    bx(g, w / 2, y0, 0, w / 2 + 0.08, y1, 0.06, frame);
    const cols = Math.max(2, Math.round(w / 0.45));
    for (let i = 1; i < cols; i++) bx(g, -w / 2 + (w * i) / cols - 0.018, y0, 0, -w / 2 + (w * i) / cols + 0.018, y1, 0.035, frame);
    const rows = Math.max(2, Math.round(h / 0.5));
    for (let i = 1; i < rows; i++) bx(g, -w / 2, y0 + (h * i) / rows - 0.018, 0, w / 2, y0 + (h * i) / rows + 0.018, 0.035, frame);
    if (curtain) {
      for (const s of [-1, 1]) {
        const cx = s * (w / 2 + 0.12);
        const c = boxMesh(cx - 0.26, 0.02, 0.06, cx + 0.26, y1 + 0.35, 0.2, curtain, 0.5);
        g.add(c);
        bx(g, cx - 0.28, 1.0, 0.19, cx + 0.28, 1.06, 0.23, M.gilt); // tie-back
      }
      bx(g, -w / 2 - 0.5, y1 + 0.2, 0.02, w / 2 + 0.5, y1 + 0.5, 0.26, pelmet);
      bx(g, -w / 2 - 0.52, y1 + 0.18, 0.2, w / 2 + 0.52, y1 + 0.22, 0.28, M.gilt);
    }
  };

  /** A fireplace on a chimney breast's face: surround, mantel, grate and fire, hearth, fender. */
  const fireplace = (x: number, z: number, face: Face, stone: Mat, opts: { w?: number; mantel?: number } = {}): THREE.Group => {
    const g = grp(x, 0, z, face);
    const w = opts.w ?? 1.9, mh = opts.mantel ?? 1.3;
    bx(g, -w / 2, 0, 0, -w / 2 + 0.32, mh - 0.18, 0.18, stone);
    bx(g, w / 2 - 0.32, 0, 0, w / 2, mh - 0.18, 0.18, stone);
    bx(g, -w / 2, mh - 0.42, 0, w / 2, mh - 0.1, 0.16, stone);
    bx(g, -w / 2 - 0.12, mh - 0.1, 0, w / 2 + 0.12, mh, 0.3, stone); // mantel shelf
    bx(g, -w / 2 + 0.32, 0, -0.02, w / 2 - 0.32, mh - 0.42, 0.005, M.soot); // the opening
    bx(g, -w / 2 - 0.1, 0, 0, w / 2 + 0.1, 0.05, 0.6, stone); // hearth
    bx(g, -0.42, 0.08, 0.02, 0.42, 0.14, 0.32, M.iron); // grate
    for (let i = 0; i < 5; i++) ball(g, -0.3 + i * 0.15, 0.17, 0.18, 0.07, embers, 1, 0.6, 1, 6);
    plane(g, new THREE.PlaneGeometry(0.8, 0.55), fireMat, 0, 0.42, 0.1);
    bx(g, -w / 2 + 0.05, 0.05, 0.55, w / 2 - 0.05, 0.14, 0.58, M.brass); // fender
    return g;
  };

  /** A chandelier: arms of candle bulbs in tiers, crystal drops. */
  const chandelier = (x: number, y: number, z: number, r: number, arms: number, ceilingY: number, metal: Mat = M.brass): void => {
    const g = grp(x, y, z);
    cyl(g, 0, 0.3, 0, 0.015, 0.015, ceilingY - y - 0.3, metal, 6);
    ball(g, 0, ceilingY - y - 0.04, 0, 0.12, metal, 1, 0.4, 1);
    cyl(g, 0, -0.2, 0, 0.05, 0.08, 0.5, metal, 10);
    ball(g, 0, -0.25, 0, 0.1, metal);
    for (const [ry, rr, n, lift] of [[0, r, arms, 0], [0.3, r * 0.55, Math.max(4, Math.round(arms / 2)), 0.35]] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.02, 6, 28), metal);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, ry, 0);
      g.add(ring);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + lift;
        const ax = Math.cos(a) * rr, az = Math.sin(a) * rr;
        cyl(g, ax, ry, az, 0.035, 0.03, 0.04, metal, 8);
        cyl(g, ax, ry + 0.04, az, 0.016, 0.016, 0.1, M.white, 6);
        ball(g, ax, ry + 0.17, az, 0.03, glow.bulb, 1, 1.5, 1, 6);
        if (ry === 0) {
          const drop = new THREE.Mesh(new THREE.OctahedronGeometry(0.035), glow.crystal);
          drop.position.set(ax, ry - 0.09, az);
          drop.scale.set(1, 1.8, 1);
          g.add(drop);
        }
      }
    }
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), glow.crystal);
    tip.position.set(0, -0.45, 0);
    tip.scale.set(1, 1.6, 1);
    g.add(tip);
  };

  /** A wall sconce: brass back plate, two candle bulbs and a little shade. */
  const sconce = (x: number, y: number, z: number, face: Face): void => {
    const g = grp(x, y, z, face);
    bx(g, -0.06, -0.12, 0, 0.06, 0.12, 0.03, M.brass);
    for (const s of [-1, 1]) {
      cyl(g, s * 0.11, -0.02, 0.12, 0.03, 0.025, 0.04, M.brass, 8);
      cyl(g, s * 0.11, 0.02, 0.12, 0.014, 0.014, 0.08, M.white, 6);
      ball(g, s * 0.11, 0.13, 0.12, 0.028, glow.bulb, 1, 1.5, 1, 6);
    }
    bx(g, -0.13, -0.04, 0.02, 0.13, -0.02, 0.14, M.brass);
  };

  /** A marble pedestal for an heirloom (its box). */
  const pedestalAt = (b: Box, m: Mat = M.marble): void => {
    const { min: a, max: c } = b;
    const cx = (a.x + c.x) / 2, cz = (a.z + c.z) / 2, h = c.y - a.y, w = c.x - a.x, d = c.z - a.z;
    v.add(boxMesh(a.x, a.y, a.z, c.x, a.y + 0.14, c.z, m), true);
    v.add(boxMesh(a.x + 0.05, a.y + 0.14, a.z + 0.05, c.x - 0.05, a.y + 0.2, c.z - 0.05, m), true);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, d) * 0.28, Math.min(w, d) * 0.32, h - 0.32, 12), m);
    shaft.position.set(cx, a.y + 0.2 + (h - 0.32) / 2, cz);
    v.add(shaft, true);
    v.add(boxMesh(a.x + 0.04, c.y - 0.12, a.z + 0.04, c.x - 0.04, c.y - 0.07, c.z - 0.04, m));
    v.add(boxMesh(a.x - 0.03, c.y - 0.07, a.z - 0.03, c.x + 0.03, c.y, c.z + 0.03, m));
  };

  /** A bookcase run: a carcass with shelves of books, facing `face` from its box. */
  const bookcase = (b: Box, face: Face, opts: { top?: number; storeys?: boolean } = {}): void => {
    const { min: a, max: c } = b;
    const alongX = face === 'N' || face === 'S';
    const len = alongX ? c.x - a.x : c.z - a.z;
    const depth = alongX ? c.z - a.z : c.x - a.x;
    const fx = face === 'S' ? (a.x + c.x) / 2 : face === 'N' ? (a.x + c.x) / 2 : face === 'E' ? c.x : a.x;
    const fz = face === 'S' ? c.z : face === 'N' ? a.z : (a.z + c.z) / 2;
    const g = grp(fx, 0, fz, face, true);
    const top = opts.top ?? c.y;
    const L2 = len / 2;
    bx(g, -L2, 0, -depth, L2, top, -depth + 0.04, M.walnut); // back
    bx(g, -L2, 0, -depth, L2, 0.14, 0, M.walnut); // plinth
    bx(g, -L2 - 0.02, top - 0.14, -depth, L2 + 0.02, top, 0.04, M.walnut); // cornice
    const rows: number[] = [];
    if (opts.storeys) {
      for (let y = 0.16; y < 2.45; y += 0.4) rows.push(y);
      for (let y = 2.86; y < top - 0.45; y += 0.4) rows.push(y);
    } else {
      for (let y = 0.16; y < top - 0.45; y += 0.4) rows.push(y);
    }
    const n = Math.max(1, Math.round(len / 1.0));
    for (let i = 0; i <= n; i++) bx(g, -L2 + (len * i) / n - 0.025, 0, -depth, -L2 + (len * i) / n + 0.025, top, 0.015, M.walnut);
    rows.forEach((y, k) => {
      bx(g, -L2, y - 0.025, -depth, L2, y, 0.02, M.walnut);
      const u0 = (k * 0.37 + a.x * 0.11 + a.z * 0.07) % 1;
      const band = (k + Math.round(a.x + a.z)) % 8;
      const uv: UV = { u0, u1: u0 + len / 1.2, v0: 1 - (band + 1) / 8, v1: 1 - band / 8 };
      plane(g, uvPlane(len - 0.02, 0.36, uv), booksMat, 0, y + 0.18, -0.08);
    });
    if (opts.storeys) {
      // The upper storey's walkway and its iron rail (two storeys of books; nobody is allowed up there).
      bx(g, -L2, 2.56, -0.05, L2, 2.66, 0.42, M.walnut);
      bx(g, -L2, 3.5, 0.38, L2, 3.54, 0.42, M.iron);
      bx(g, -L2, 2.7, 0.39, L2, 2.73, 0.41, M.iron);
      for (let x = -L2 + 0.15; x < L2; x += 0.3) bx(g, x - 0.012, 2.66, 0.388, x + 0.012, 3.5, 0.412, M.iron);
      bx(g, -L2, 2.4, 0.03, L2, 2.42, 0.06, M.brass); // the ladder's rail
    }
  };

  /** A double-sided stack (its box, long along z): books both sides, end panels, a label on each end. */
  const stack = (b: Box, labels: [(string | Line)[], (string | Line)[]], bust?: { key: string; plaque: string }): void => {
    const { min: a, max: c } = b;
    const cx = (a.x + c.x) / 2;
    const half = { ...b, min: { ...a }, max: { ...c, x: cx } };
    bookcase(half, 'W', { top: c.y });
    bookcase({ ...b, min: { ...a, x: cx }, max: { ...c } }, 'E', { top: c.y });
    for (const [z, face, lab] of [[c.z, 'S', labels[0]], [a.z, 'N', labels[1]]] as const) {
      const g = grp(cx, 0, z, face, true);
      bx(g, -(c.x - a.x) / 2 - 0.02, 0, -0.04, (c.x - a.x) / 2 + 0.02, c.y, 0.02, M.walnut);
      signAt(g, lab, 0.5, 0.2, 0, 1.6, 0.025, SIGN.brass);
    }
    if (bust) {
      const g = grp(cx, c.y, (a.z + c.z) / 2, 'S');
      bx(g, -0.18, 0, -0.18, 0.18, 0.22, 0.18, M.marble);
      ball(g, 0, 0.36, 0, 0.17, M.marble, 1.2, 0.6, 0.8);
      ball(g, 0, 0.6, 0.02, 0.13, M.marble, 1, 1.15, 1);
      ball(g, 0, 0.62, 0.11, 0.035, M.marble);
      signAt(g, [bust.plaque], 0.34, 0.1, 0, 0.11, 0.185, SIGN.brass);
    }
  };

  /** A plain chair: four legs, seat and a back (facing `face`). */
  const chair = (x: number, z: number, face: Face, wood: Mat, seat: Mat, backH = 1.0, ribbon?: Mat): void => {
    const g = grp(x, 0, z, face);
    for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) bx(g, lx - 0.025, 0, lz - 0.025, lx + 0.025, 0.45, lz + 0.025, wood);
    bx(g, -0.24, 0.45, -0.24, 0.24, 0.52, 0.24, seat);
    bx(g, -0.24, 0.52, -0.25, 0.24, backH, -0.2, wood);
    bx(g, -0.2, 0.6, -0.21, 0.2, backH - 0.08, -0.19, seat);
    if (ribbon) { bx(g, -0.08, backH - 0.12, -0.27, 0.08, backH - 0.02, -0.25, ribbon); bx(g, -0.03, backH - 0.3, -0.27, 0.03, backH - 0.12, -0.26, ribbon); }
  };

  /** A club or wing chair with rolled arms (its footprint centred at x, z). */
  const armchair = (x: number, z: number, face: Face, m: Mat, w = 0.85, wings = false): THREE.Group => {
    const g = grp(x, 0, z, face);
    const d = 0.8;
    bx(g, -w / 2, 0.1, -d / 2, w / 2, 0.45, d / 2, m);
    bx(g, -w / 2 + 0.12, 0.45, -d / 2 + 0.2, w / 2 - 0.12, 0.55, d / 2, m);
    bx(g, -w / 2, 0.45, -d / 2, w / 2, wings ? 1.25 : 0.95, -d / 2 + 0.2, m);
    for (const s of [-1, 1]) {
      bx(g, s * (w / 2) - (s > 0 ? 0.14 : 0), 0.1, -d / 2, s * (w / 2) + (s > 0 ? 0 : 0.14), 0.7, d / 2, m);
      cyl(g, s * (w / 2 - 0.07), 0.7, d / 2 - 0.4, 0.08, 0.08, 0.001, m);
      if (wings) bx(g, s * (w / 2) - (s > 0 ? 0.1 : 0), 0.7, -d / 2, s * (w / 2) + (s > 0 ? 0 : 0.1), 1.2, -d / 2 + 0.35, m);
    }
    for (const [lx, lz] of [[-w / 2 + 0.06, -d / 2 + 0.06], [w / 2 - 0.06, -d / 2 + 0.06], [-w / 2 + 0.06, d / 2 - 0.06], [w / 2 - 0.06, d / 2 - 0.06]]) cyl(g, lx, 0, lz, 0.03, 0.035, 0.1, M.darkWood, 6);
    return g;
  };

  /** A standard lamp with a glowing shade. */
  const standardLamp = (x: number, z: number, h = 1.6): void => {
    const g = grp(x, 0, z);
    cyl(g, 0, 0, 0, 0.18, 0.12, 0.04, M.brass);
    cyl(g, 0, 0.04, 0, 0.018, 0.018, h - 0.3, M.brass, 6);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.3, 14, 1, true), glow.shade);
    shade.position.set(0, h - 0.1, 0);
    g.add(shade);
    ball(g, 0, h - 0.18, 0, 0.05, glow.bulb);
  };

  /** A green banker's lamp on a desk. */
  const bankersLamp = (g: THREE.Object3D, x: number, y: number, z: number): void => {
    cyl(g, x, y, z, 0.08, 0.07, 0.03, M.brass);
    cyl(g, x, y + 0.03, z, 0.012, 0.012, 0.26, M.brass, 6);
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.28, 12, 1, false, 0, Math.PI), glow.greenShade);
    sh.rotation.z = Math.PI / 2;
    sh.position.set(x, y + 0.3, z);
    g.add(sh);
    ball(g, x, y + 0.28, z, 0.025, glow.bulb);
  };

  /** A teacup and saucer. */
  const teacup = (g: THREE.Object3D, x: number, y: number, z: number, m: Mat = M.china): void => {
    cyl(g, x, y, z, 0.06, 0.06, 0.008, m, 10);
    cyl(g, x, y + 0.008, z, 0.028, 0.04, 0.05, m, 10);
  };
  const teapot = (g: THREE.Object3D, x: number, y: number, z: number, m: Mat = M.china): void => {
    ball(g, x, y + 0.09, z, 0.1, m, 1, 0.85, 1);
    cyl(g, x + 0.13, y + 0.06, z, 0.02, 0.012, 0.1, m, 6).rotation.z = -0.8;
    ball(g, x, y + 0.18, z, 0.03, m);
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 10, Math.PI), m);
    h.position.set(x - 0.1, y + 0.1, z);
    h.rotation.z = Math.PI / 2;
    g.add(h);
  };
  /** A candlestick with a lit candle. */
  const candlestick = (g: THREE.Object3D, x: number, y: number, z: number, m: Mat = M.brass, h = 0.22): void => {
    cyl(g, x, y, z, 0.05, 0.03, 0.02, m, 8);
    cyl(g, x, y + 0.02, z, 0.015, 0.015, h - 0.06, m, 6);
    cyl(g, x, y + h - 0.04, z, 0.03, 0.035, 0.03, m, 8);
    cyl(g, x, y + h - 0.01, z, 0.014, 0.014, 0.12, M.white, 6);
    ball(g, x, y + h + 0.13, z, 0.014, glow.candle, 1, 1.8, 1, 6);
  };
  /** A potted palm: pot, trunk, fronds. */
  const palm = (x: number, z: number, h: number, potR = 0.32, potM: Mat = M.terracotta): void => {
    const g = grp(x, 0, z);
    cyl(g, 0, 0, 0, potR * 0.75, potR, 0.6, potM, 14);
    cyl(g, 0, 0.6, 0, potR + 0.03, potR + 0.03, 0.06, potM, 14);
    cyl(g, 0, 0.56, 0, potR - 0.02, potR - 0.02, 0.06, M.soot, 12);
    const segs = Math.round(h / 0.35);
    for (let i = 0; i < segs; i++) cyl(g, 0, 0.6 + i * 0.35, 0, 0.07 - i * 0.004, 0.06 - i * 0.004, 0.36, i % 2 ? M.walnut : M.midWood, 7);
    const top = 0.6 + segs * 0.35;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const fr = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.5), M.frondMat);
      const piv = new THREE.Group();
      piv.position.set(0, top, 0);
      piv.rotation.y = (i / n) * Math.PI * 2 + (i % 2) * 0.3;
      fr.position.set(0, 0.55, 0.3);
      fr.rotation.x = 0.9 + (i % 3) * 0.2;
      piv.add(fr);
      g.add(piv);
    }
  };

  // ═════════════════════════════ The front hall ═════════════════════════════

  // Grand staircase: oak treads, crimson runner with brass rods.
  for (const r of def.ramps) stairs(v, r, { step: M.oak, side: M.mahogany, carpet: mat('#7a1424', { rough: 0.95 }), rod: M.brass, banister: M.mahogany, knob: M.brass });
  {
    const r = def.ramps[0];
    // The warning on the first riser, and again on the newel post.
    const g = grp(0, 0, r.zStart + 0.005, 'S');
    signAt(g, [{ t: 'MIND THE STEP — ESPECIALLY YOU, BARNABY', bold: true }], 2.0, 0.15, 0, 0.1, 0, SIGN.black);
    const n = grp(r.minX - 0.05, 0, r.zStart + 0.085, 'S');
    signAt(n, ['MIND THE STEP', { t: '(Barnaby)', italic: true, s: 0.8 }], 0.15, 0.12, 0, 0.92, 0, SIGN.brass);
    // Stringers dressing the stair sides.
    for (const x of [r.minX - 0.02, r.maxX + 0.02]) {
      const len = Math.hypot(r.zEnd - r.zStart, r.yEnd - r.yStart);
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, len), M.mahogany);
      s.position.set(x, (r.yStart + r.yEnd) / 2 + 0.05, (r.zStart + r.zEnd) / 2);
      s.rotation.x = Math.atan2(r.yEnd - r.yStart, -(r.zEnd - r.zStart));
      v.add(s);
    }
  }

  // The gallery: oak floor, coffered underside, a carved fascia, and a balustrade.
  {
    const s = byLabel('Heirloom gallery');
    const cofferLow = mat('#ffffff', { map: coffers('cofferLow', '#e4d6bc', '#5a2a18', '#3a1a0e', '#c9a24a'), rough: 0.9 });
    v.add(worldBox(s.min.x, s.min.y, s.min.z, s.max.x, s.max.y, s.max.z, [M.mahogany, M.mahogany, mat('#8a5a34', { map: wood(), rough: 0.6 }), cofferLow, M.mahogany, M.mahogany], 1.3), true);
    v.add(boxMesh(-8, GALLERY_Y - 0.36, -8.05, -1.5, GALLERY_Y - 0.2, -7.92, M.mahogany));
    v.add(boxMesh(1.5, GALLERY_Y - 0.36, -8.05, 8, GALLERY_Y - 0.2, -7.92, M.mahogany));
    v.add(boxMesh(-8, GALLERY_Y - 0.12, -7.95, -1.5, GALLERY_Y - 0.08, -7.9, M.gilt));
    v.add(boxMesh(1.5, GALLERY_Y - 0.12, -7.95, 8, GALLERY_Y - 0.08, -7.9, M.gilt));
    // A runner along the gallery.
    rug(0, -10.8, 14, 1.1, persian('galleryRunner', { field: '#6a1a22', border: '#1c2a3a', ground: '#14100c', accent: '#c9a24a', light: '#e8d8b0' }, 1024, 96), 0, GALLERY_Y + 0.008);
  }
  for (const b of boxes.filter((x) => x.kind === 'railing' && x.solid)) {
    const { min: a, max: c } = b;
    v.add(boxMesh(a.x, c.y - 0.08, a.z - 0.04, c.x, c.y, c.z + 0.04, M.mahogany));
    v.add(boxMesh(a.x, a.y, a.z - 0.02, c.x, a.y + 0.07, c.z + 0.02, M.mahogany));
    for (let x = a.x + 0.11; x < c.x - 0.05; x += 0.22) {
      cyl(v.group, x, a.y + 0.07, (a.z + c.z) / 2, 0.028, 0.022, 0.85, M.mahogany, 8);
      ball(v.group, x, a.y + 0.32, (a.z + c.z) / 2, 0.042, M.mahogany, 1, 1, 1, 8);
    }
    for (const x of [a.x + 0.06, c.x - 0.06]) {
      v.add(boxMesh(x - 0.07, a.y, a.z - 0.06, x + 0.07, c.y + 0.12, c.z + 0.06, M.mahogany));
      ball(v.group, x, c.y + 0.2, (a.z + c.z) / 2, 0.08, M.brass);
    }
  }

  // Columns under the gallery's edge.
  for (const label of ['Hall column west', 'Hall column east']) {
    const b = byLabel(label);
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, top = b.max.y;
    const g = grp(cx, 0, cz, 'S', true);
    bx(g, -0.3, 0, -0.3, 0.3, 0.22, 0.3, M.marble);
    cyl(g, 0, 0.22, 0, 0.25, 0.25, 0.08, M.marble, 16);
    cyl(g, 0, 0.3, 0, 0.21, 0.18, top - 0.62, M.marble, 16);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      bx(g, Math.cos(a) * 0.19 - 0.012, 0.36, Math.sin(a) * 0.19 - 0.012, Math.cos(a) * 0.19 + 0.012, top - 0.4, Math.sin(a) * 0.19 + 0.012, M.marble);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 16), M.gilt);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, top - 0.33, 0);
    g.add(ring);
    bx(g, -0.27, top - 0.32, -0.27, 0.27, top - 0.14, 0.27, M.marble);
    bx(g, -0.32, top - 0.14, -0.32, 0.32, top, 0.32, M.gilt);
  }

  // Pilasters with sconces on the hall's walls, flanking its doors and windows.
  const pilaster = (x: number, z: number, face: Face, h = 5.6, lamp = true): void => {
    const g = grp(x, 0, z, face);
    bx(g, -0.28, 0, 0, 0.28, 0.4, 0.12, M.mahogany);
    bx(g, -0.22, 0.4, 0, 0.22, h - 0.4, 0.08, mat('#ffffff', { map: marble('pilasterMarble', '#d8ccb4', '#9a8a6a'), rough: 0.35 }));
    for (const s of [-0.12, 0, 0.12]) bx(g, s - 0.02, 0.55, 0.08, s + 0.02, h - 0.55, 0.095, mat('#c4b494', { rough: 0.4 }));
    bx(g, -0.3, h - 0.4, 0, 0.3, h - 0.25, 0.14, M.gilt);
    bx(g, -0.26, h - 0.25, 0, 0.26, h, 0.1, mat('#e0d0a8', { rough: 0.6 }));
    if (lamp) sconce(x + (face === 'E' ? 0.1 : face === 'W' ? -0.1 : 0), 2.5, z + (face === 'S' ? 0.1 : face === 'N' ? -0.1 : 0), face);
  };
  pilaster(-1.75, 6, 'N'); pilaster(1.75, 6, 'N');
  pilaster(-7.2, 6, 'N', 5.6, false); pilaster(7.2, 6, 'N', 5.6, false);
  pilaster(-8, -1.75, 'E'); pilaster(-8, 1.75, 'E');
  pilaster(8, -2.05, 'W'); pilaster(8, 2.05, 'W');
  pilaster(-8, -7.6, 'E', 5.6, false); pilaster(8, -7.6, 'W', 5.6, false);

  // The front door: double doors, a stained-glass fanlight, a doormat with opinions.
  {
    const g = grp(0, 0, 6, 'N');
    bx(g, -1.25, 0, 0, 1.25, 3.0, 0.03, M.mahogany);
    for (const s of [-1, 1]) {
      bx(g, s * 0.5 - 0.48, 0.02, 0.03, s * 0.5 + 0.48, 2.9, 0.09, mat('#2e1a10', { rough: 0.45 }));
      for (const [y0, y1] of [[0.2, 1.2], [1.4, 2.7]]) bx(g, s * 0.5 - 0.34, y0, 0.09, s * 0.5 + 0.34, y1, 0.11, panelMat('#3a2214'));
      ball(g, s * 0.1, 1.15, 0.13, 0.04, M.brass);
    }
    const knock = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 6, 14), M.brass);
    knock.position.set(0.5, 1.75, 0.13);
    g.add(knock);
    bx(g, -0.04, 0.02, 0.09, 0.04, 2.9, 0.11, M.brass);
    // Architrave with a broken pediment.
    bx(g, -1.45, 0, 0, -1.2, 4.1, 0.16, M.mahogany);
    bx(g, 1.2, 0, 0, 1.45, 4.1, 0.16, M.mahogany);
    bx(g, -1.6, 4.1, 0, 1.6, 4.35, 0.22, M.mahogany);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.22), M.mahogany);
      p.position.set(s * 0.95, 4.55, 0.11);
      p.rotation.z = -s * 0.38;
      g.add(p);
    }
    ball(g, 0, 4.6, 0.1, 0.12, M.gilt);
    // Fanlight.
    const fan = new THREE.Mesh(new THREE.CircleGeometry(1.0, 24, 0, Math.PI), stained);
    fan.position.set(0, 3.0, 0.02);
    g.add(fan);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1.03, 0.06, 6, 24, Math.PI), M.mahogany);
    arc.position.set(0, 3.0, 0.05);
    g.add(arc);
    bx(g, -1.1, 2.95, 0.02, 1.1, 3.05, 0.1, M.mahogany);
    // Doormat.
    customSign(v.group, 300, 150, (gg, x, y, w, h) => {
      gg.fillStyle = '#8a6a3a'; gg.fillRect(x, y, w, h);
      const r = rng(3);
      for (let i = 0; i < 900; i++) { gg.fillStyle = `rgba(40,25,10,${r() * 0.3})`; gg.fillRect(x + r() * w, y + r() * h, 1, 3); }
      gg.fillStyle = '#2a1a0c'; gg.textAlign = 'center'; gg.textBaseline = 'middle';
      gg.font = `bold 40px ${SERIF}`; gg.fillText('WELCOME', x + w / 2, y + h * 0.38);
      gg.font = `italic 24px ${SERIF}`; gg.fillText('(conditions apply)', x + w / 2, y + h * 0.72);
    }, 1.4, 0.7, 0, 0.01, 5.35, -Math.PI / 2, 0);
  }
  // Tall windows either side of the front door; clerestory windows above the side wings' roofs.
  for (const x of [-4.8, 4.8]) windowAt(x, 6, 'N', 1.6, 0.9, 4.4, M.crimsonCurtain);
  for (const z of [-4.6, 3.6]) windowAt(-8, z, 'E', 1.2, 4.5, 5.6);
  for (const z of [-4.6, 3.6]) windowAt(8, z, 'W', 1.2, 4.2, 5.5);

  // The great chandelier.
  chandelier(0, 4.55, 0.5, 0.95, 12, HALL_HEIGHT);
  // Sconces under the gallery, by the dining room doors.
  for (const x of [-6.7, -2.1, 2.1, 6.7]) sconce(x, 1.9, -12, 'S');

  // Grandma's wing chair and her side table.
  {
    const b = byLabel("Grandma's chair");
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    const g = armchair(cx, cz, 'N', M.velvet, 1.2, true);
    v.blockers.push(g);
    bx(g, -0.3, 0.98, -0.42, 0.3, 1.2, -0.39, mat('#f4efe4', { rough: 1 })); // antimacassar
    bx(g, 0.36, 0.55, -0.25, 0.62, 0.72, 0.32, mat('#8a6a9a', { rough: 1 })); // knitted blanket over an arm
    bx(g, -0.42, 0.45, -0.2, 0.42, 0.53, 0.38, M.velvetHi);
    const t = byLabel('Side table');
    const tx = (t.min.x + t.max.x) / 2, tz = (t.min.z + t.max.z) / 2;
    const s = grp(tx, 0, tz, 'S', true);
    cyl(s, 0, 0, 0, 0.3, 0.2, 0.06, M.mahogany);
    cyl(s, 0, 0.06, 0, 0.06, 0.05, 0.48, M.mahogany, 8);
    cyl(s, 0, 0.54, 0, 0.56, 0.56, 0.06, M.mahogany, 20);
    cyl(s, 0, 0.6, 0, 0.5, 0.5, 0.005, mat('#f4efe4', { rough: 1 }), 20);
    // Nana's lamp, hearing trumpet, a photograph of the cat, and her knitting.
    cyl(s, 0.25, 0.6, -0.2, 0.08, 0.06, 0.05, M.brass);
    cyl(s, 0.25, 0.65, -0.2, 0.015, 0.015, 0.32, M.brass, 6);
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 0.18, 12, 1, true), glow.shade);
    sh.position.set(0.25, 1.02, -0.2);
    s.add(sh);
    const trumpet = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 12, 1, true), M.brass);
    trumpet.position.set(-0.2, 0.65, 0.15);
    trumpet.rotation.z = Math.PI / 2;
    s.add(trumpet);
    bx(s, -0.08, 0.6, -0.3, 0.12, 0.76, -0.28, M.gilt);
    ball(s, 0.1, 0.65, 0.25, 0.06, mat('#5a7aa0', { rough: 1 }));
  }

  // The grandfather clock (its pendulum swings: see tick).
  let pendulumAt: Vec3 | null = null;
  {
    const b = byLabel('Grandfather clock');
    const g = grp(b.max.x, 0, (b.min.z + b.max.z) / 2, 'E', true);
    bx(g, -0.36, 0, -0.55, 0.36, 0.35, 0, M.mahogany);
    bx(g, -0.28, 0.35, -0.5, 0.28, 1.55, -0.02, M.mahogany);
    bx(g, -0.2, 0.55, -0.02, 0.2, 1.45, 0.005, M.soot);
    bx(g, -0.34, 1.55, -0.55, 0.34, 2.15, 0, M.mahogany);
    bx(g, -0.38, 2.15, -0.55, 0.38, 2.3, 0.04, M.mahogany);
    ball(g, 0, 2.36, -0.25, 0.07, M.gilt);
    customSign(g, 160, 160, (gg, x, y, w, h) => {
      gg.fillStyle = '#1a120a'; gg.fillRect(x, y, w, h);
      gg.fillStyle = '#f2ead2'; gg.beginPath(); gg.arc(x + w / 2, y + h / 2, w * 0.46, 0, Math.PI * 2); gg.fill();
      gg.strokeStyle = '#c9a24a'; gg.lineWidth = 5; gg.stroke();
      gg.fillStyle = '#1a120a'; gg.font = `bold 16px ${SERIF}`; gg.textAlign = 'center'; gg.textBaseline = 'middle';
      const nums = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
      nums.forEach((n, i) => { const a = (i / 12) * Math.PI * 2 - Math.PI / 2; gg.fillText(n, x + w / 2 + Math.cos(a) * w * 0.36, y + h / 2 + Math.sin(a) * h * 0.36); });
      gg.lineWidth = 4; gg.beginPath(); gg.moveTo(x + w / 2, y + h / 2); gg.lineTo(x + w / 2 + 2, y + h * 0.22); gg.stroke();
      gg.lineWidth = 3; gg.beginPath(); gg.moveTo(x + w / 2, y + h / 2); gg.lineTo(x + w * 0.75, y + h * 0.6); gg.stroke();
      gg.font = `italic 11px ${SERIF}`; gg.fillText('tempus fugit', x + w / 2, y + h * 0.72);
    }, 0.5, 0.5, 0, 1.85, 0.005);
    pendulumAt = { x: b.max.x + 0.015, y: 1.42, z: (b.min.z + b.max.z) / 2 };
  }

  // Family tree, sampler, barometer, coat stand and umbrellas.
  {
    const g = grp(7.99, 0, 3.75, 'W');
    bx(g, -1.3, 1.35, 0, 1.3, 3.95, 0.05, M.gilt);
    plane(g, new THREE.PlaneGeometry(2.4, 2.4), mat('#ffffff', { map: familyTree(), rough: 0.9 }), 0, 2.65, 0.055);
    const s = grp(-7.99, 0, 3.5, 'E');
    bx(s, -0.42, 1.45, 0, 0.42, 2.15, 0.04, M.walnut);
    customSign(s, 320, 260, (gg, x, y, w, h) => {
      gg.fillStyle = '#efe6cc'; gg.fillRect(x, y, w, h);
      gg.strokeStyle = '#7a2a2a'; gg.lineWidth = 6; gg.setLineDash([6, 6]); gg.strokeRect(x + 12, y + 12, w - 24, h - 24); gg.setLineDash([]);
      gg.fillStyle = '#7a2a2a'; gg.textAlign = 'center'; gg.textBaseline = 'middle';
      gg.font = `bold 34px ${SERIF}`; gg.fillText('HOME IS', x + w / 2, y + 70); gg.fillText('WHERE THE', x + w / 2, y + 115);
      gg.fillStyle = '#2a4a6a'; gg.font = `bold 44px ${SERIF}`; gg.fillText('WILL IS', x + w / 2, y + 168);
      gg.fillStyle = '#4a7a3a'; for (let i = 0; i < 9; i++) { gg.beginPath(); gg.arc(x + 50 + i * 28, y + 215, 6, 0, Math.PI * 2); gg.fill(); }
    }, 0.76, 0.62, 0, 1.8, 0.045);
    const bar = grp(7.99, 0, -6.3, 'W');
    bx(bar, -0.16, 1.2, 0, 0.16, 2.1, 0.05, M.walnut);
    customSign(bar, 160, 160, (gg, x, y, w, h) => {
      gg.fillStyle = '#efe6cc'; gg.beginPath(); gg.arc(x + w / 2, y + h / 2, w / 2 - 2, 0, Math.PI * 2); gg.fill();
      gg.fillStyle = '#2a1a10'; gg.textAlign = 'center'; gg.textBaseline = 'middle';
      gg.font = `bold 14px ${SERIF}`;
      gg.fillText('FAIR', x + w * 0.72, y + h * 0.36); gg.fillText('RAIN', x + w * 0.28, y + h * 0.36);
      gg.fillStyle = '#8a1414'; gg.font = `bold 13px ${SERIF}`; gg.fillText('STORMY', x + w / 2, y + h * 0.7);
      gg.font = `italic 10px ${SERIF}`; gg.fillText('(for some)', x + w / 2, y + h * 0.82);
      gg.strokeStyle = '#1a1a1a'; gg.lineWidth = 3; gg.beginPath(); gg.moveTo(x + w / 2, y + h / 2); gg.lineTo(x + w * 0.5, y + h * 0.82); gg.stroke();
    }, 0.28, 0.28, 0, 1.75, 0.055);
    // Coat stand with Grandpa's hat (labelled), and an umbrella stand.
    const cs = grp(-2.3, 0, 5.55);
    cyl(cs, 0, 0, 0, 0.22, 0.05, 0.05, M.walnut);
    cyl(cs, 0, 0.05, 0, 0.03, 0.03, 1.8, M.walnut, 8);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; bx(cs, Math.cos(a) * 0.12 - 0.015, 1.7, Math.sin(a) * 0.12 - 0.015, Math.cos(a) * 0.12 + 0.015, 1.74, Math.sin(a) * 0.12 + 0.015, M.walnut); }
    cyl(cs, 0.12, 1.74, 0, 0.17, 0.17, 0.02, M.black, 14);
    cyl(cs, 0.12, 1.76, 0, 0.1, 0.1, 0.12, M.black, 14);
    bx(cs, -0.18, 1.1, 0.08, 0.18, 1.65, 0.12, mat('#4a3a2a', { rough: 1 }));
    signAt(cs, ["GRANDPA'S HAT", { t: "he won't be needing it", italic: true, s: 0.8 }], 0.26, 0.1, 0.12, 1.62, 0.1, SIGN.card, 0, -0.4);
    const us = grp(2.3, 0, 5.65);
    cyl(us, 0, 0, 0, 0.16, 0.16, 0.5, M.brass, 12);
    for (const [ux, uz, c] of [[-0.05, 0.03, '#1a1a1a'], [0.06, -0.02, '#2a3a5a'], [0, 0.07, '#5a1a1a']] as const) {
      const u = cyl(us, ux, 0.3, uz, 0.02, 0.02, 0.6, mat(c), 6);
      u.rotation.z = ux * 2;
    }
    bx(us, -0.04, 0.4, -0.08, 0.04, 1.05, -0.04, M.oak); // a cricket bat
  }

  // Under the gallery: a console table with funeral lilies, sent early.
  {
    const g = grp(0, 0, -12, 'S');
    bx(g, -0.9, 0.82, 0, 0.9, 0.88, 0.45, M.mahogany);
    for (const s of [-1, 1]) bx(g, s * 0.8 - 0.04, 0, 0.05, s * 0.8 + 0.04, 0.82, 0.4, M.mahogany);
    cyl(g, 0, 0.88, 0.22, 0.1, 0.14, 0.35, M.blueChina, 12);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; cyl(g, Math.cos(a) * 0.06, 1.15, 0.22 + Math.sin(a) * 0.06, 0.01, 0.01, 0.35, M.leafDark, 4); ball(g, Math.cos(a) * 0.14, 1.52, 0.22 + Math.sin(a) * 0.14, 0.06, M.linen, 1, 0.6, 1, 8); }
    signAt(g, ['WITH DEEPEST SYMPATHY', { t: '(sent early, to beat the rush)', italic: true, s: 0.8 }], 0.42, 0.14, 0.45, 0.95, 0.3, SIGN.card, 0, -0.5);
  }

  // Portraits: the Portrait Gallery's ancestors (names struck out and re-painted), Nana glaring down at the front door.
  painting('nana', 0, 4.55, -11.97, 'S', 1.3, 1.6, ['LADY HARROWGATE', { t: 'still with us', italic: true, s: 0.8 }]);
  painting('ambrose', -2.55, 4.6, -11.97, 'S', 0.85, 1.05, ['SIR AMBROSE HARROWGATE', { t: 'Founder · Hoarder', italic: true, s: 0.8 }]);
  painting('hester', 2.55, 4.6, -11.97, 'S', 0.85, 1.05, [{ t: 'LADY HESTER', strike: true }, { t: 'Cousin Beryl (acting)', italic: true, c: '#7a1414' }]);
  painting('cuthbert', -4.65, 4.6, -11.97, 'S', 0.85, 1.05, [{ t: 'SIR CUTHBERT', strike: true }, { t: 'no relation', italic: true, c: '#7a1414' }]);
  painting('prudence', 4.65, 4.6, -11.97, 'S', 0.85, 1.05, [{ t: 'GREAT-AUNT PRUDENCE', strike: true }, { t: 'written out, 1952', italic: true, c: '#7a1414' }]);
  painting('eric', -6.75, 4.6, -11.97, 'S', 0.8, 1.0, [{ t: 'COUSIN ERIC', strike: true }, { t: 'painted over', italic: true, c: '#7a1414' }]);
  painting('heir', 6.75, 4.6, -11.97, 'S', 0.8, 1.0, ['THE HEIR', { t: 'disinherited aged four', italic: true, s: 0.8 }]);
  painting('youngNana', -7.97, 4.6, -10.0, 'E', 0.85, 1.05, ['NANA, 1958', { t: 'before all this', italic: true, s: 0.8 }]);
  painting('dobbin', 7.97, 4.6, -10.0, 'W', 1.0, 0.8, ['DOBBIN', { t: 'never once asked for money', italic: true, s: 0.8 }]);
  painting('manor', -7.97, 3.9, -5.8, 'E', 1.4, 1.0, ['HARROWGATE MANOR', { t: 'as it will be (sold)', italic: true, s: 0.8 }]);
  for (const x of [-5.6, 5.6, -1.3, 1.3]) sconce(x, 5.0, -11.97, 'S');

  // The hall's great rug (under the cousins) and a semicircle at the stair foot.
  rug(0, 2.2, 6.4, 4.6, persian('hallRug', { field: '#7a1a22', border: '#1c2a4a', ground: '#140e0a', accent: '#c9a24a', light: '#e8d8b0' }));
  for (const label of ['Pedestal hall NW', 'Pedestal hall NE', 'Pedestal hall SW', 'Pedestal hall SE', 'Pedestal stair foot W', 'Pedestal stair foot E', 'Gallery pedestal 1', 'Gallery pedestal 2', 'Gallery pedestal 3', 'Gallery pedestal 4', 'Gallery pedestal by the rail W', 'Gallery pedestal by the rail E']) pedestalAt(byLabel(label));

  // ═════════════════════════════ The drawing room ═════════════════════════════
  {
    const breast = byLabel('Drawing room chimney breast');
    const fx = (breast.min.x + breast.max.x) / 2;
    v.add(worldBox(breast.min.x, 0, breast.min.z, breast.max.x, breast.max.y, breast.max.z, [STYLE.Drawing.paper, STYLE.Drawing.paper, M.outside, M.outside, STYLE.Drawing.paper, M.outside], 0.5), true);
    v.add(worldBox(breast.min.x, 0, breast.max.z, breast.max.x, 0.2, breast.max.z + 0.04, M.white));
    const fg = fireplace(fx, breast.max.z, 'S', M.marble);
    // On the mantel: the clock, a pair of china dogs, candlesticks, Gerald's photograph (face down).
    const g = grp(fx, 1.3, breast.max.z, 'S');
    bx(g, -0.18, 0, 0.08, 0.18, 0.32, 0.24, M.gilt);
    cyl(g, 0, 0.12, 0.245, 0.1, 0.1, 0.005, M.linen, 16).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) {
      ball(g, s * 0.62, 0.08, 0.15, 0.07, M.china, 1, 1, 1.3);
      ball(g, s * 0.62, 0.2, 0.2, 0.05, M.china);
      candlestick(g, s * 0.36, 0, 0.15);
    }
    bx(g, 0.85, 0, 0.08, 1.05, 0.02, 0.24, M.gilt);
    // Overmantel mirror.
    bx(g, -0.75, 0.45, 0, 0.75, 2.45, 0.05, M.gilt);
    bx(g, -0.65, 0.55, 0.05, 0.65, 2.35, 0.06, mat('#9aa8a8', { rough: 0.08, metal: 0.9 }));
    ball(g, 0, 2.55, 0.03, 0.12, M.gilt, 1.6, 1, 0.5);
    void fg;
    for (const s of [-1, 1]) sconce(fx + s * 1.25, 2.6, breast.max.z, 'S');
  }
  // Settees facing across the fire, the tea table, the tea trolley.
  const settee = (b: Box, face: Face): void => {
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    const len = face === 'E' || face === 'W' ? b.max.z - b.min.z : b.max.x - b.min.x;
    const g = grp(cx, 0, cz, face, true);
    const d = 0.85, L2 = len / 2;
    bx(g, -L2, 0.14, -d / 2, L2, 0.42, d / 2, M.duckVelvet);
    bx(g, -L2 + 0.15, 0.42, -d / 2 + 0.2, L2 - 0.15, 0.55, d / 2 - 0.02, mat('#9ac8c4', { rough: 0.95 }));
    bx(g, -L2, 0.42, -d / 2, L2, 0.95, -d / 2 + 0.18, M.duckVelvet);
    bx(g, -L2, 0.92, -d / 2 - 0.01, L2, 0.96, -d / 2 + 0.06, M.gilt);
    for (const s of [-1, 1]) cyl(g, s * (L2 - 0.08), 0.42, 0, 0.09, 0.09, 0.3, M.duckVelvet).rotation.x = Math.PI / 2;
    for (const [lx, lz] of [[-L2 + 0.08, -d / 2 + 0.08], [L2 - 0.08, -d / 2 + 0.08], [-L2 + 0.08, d / 2 - 0.08], [L2 - 0.08, d / 2 - 0.08]]) cyl(g, lx, 0, lz, 0.025, 0.04, 0.14, M.gilt, 6);
    ball(g, -L2 + 0.45, 0.65, -0.1, 0.17, mat('#e8c4c8', { rough: 1 }), 1, 1, 0.5);
  };
  settee(byLabel('Settee west'), 'E');
  settee(byLabel('Settee east'), 'W');
  {
    const card = byLabel('Settee west');
    const g = grp((card.min.x + card.max.x) / 2 + 0.1, 0.55, card.min.z + 0.6, 'E');
    signAt(g, ['RESERVED FOR NANA', { t: '(they all are)', italic: true, s: 0.8 }], 0.3, 0.12, 0, 0.06, 0, SIGN.card, 0, -0.3);
    const t = byLabel('Tea table');
    const tg = grp((t.min.x + t.max.x) / 2, 0, (t.min.z + t.max.z) / 2, 'S', true);
    bx(tg, -0.8, 0.42, -0.6, 0.8, 0.48, 0.6, M.walnut);
    for (const [lx, lz] of [[-0.72, -0.52], [0.72, -0.52], [-0.72, 0.52], [0.72, 0.52]]) cyl(tg, lx, 0, lz, 0.03, 0.04, 0.42, M.gilt, 6);
    teapot(tg, 0, 0.48, 0);
    for (const [x, z] of [[-0.45, -0.3], [0.45, -0.3], [-0.45, 0.3], [0.45, 0.3]]) teacup(tg, x, 0.48, z);
    cyl(tg, 0.4, 0.48, 0, 0.12, 0.12, 0.01, M.china, 14);
    for (let i = 0; i < 3; i++) cyl(tg, 0.4, 0.49 + i * 0.12, 0, 0.012, 0.012, 0.12, M.silver, 6);
    for (const [y, r] of [[0.6, 0.12], [0.72, 0.09]]) { cyl(tg, 0.4, y, 0, r, r, 0.008, M.china, 14); ball(tg, 0.4, y + 0.03, 0.03, 0.03, mat('#e8a0b0', { rough: 0.8 })); }
    const tr = byLabel('Tea trolley');
    const trg = grp((tr.min.x + tr.max.x) / 2, 0, (tr.min.z + tr.max.z) / 2, 'E', true);
    for (const y of [0.3, 0.82]) bx(trg, -0.35, y - 0.03, -0.32, 0.35, y, 0.32, M.walnut);
    for (const [lx, lz] of [[-0.32, -0.29], [0.32, -0.29], [-0.32, 0.29], [0.32, 0.29]]) { bx(trg, lx - 0.015, 0.06, lz - 0.015, lx + 0.015, 0.85, lz + 0.015, M.brass); ball(trg, lx, 0.05, lz, 0.05, M.black, 1, 1, 0.5); }
    cyl(trg, 0, 0.82, 0.08, 0.15, 0.15, 0.09, mat('#5a2a18', { rough: 0.8 }), 16);
    cyl(trg, 0, 0.91, 0.08, 0.15, 0.15, 0.02, M.linen, 16);
    teapot(trg, 0, 0.27, 0, M.silver);
  }
  // The grand piano (open), its stool and the music; the harp; the folding screen; the curio cabinet; a palm.
  {
    const b = byLabel('Grand piano');
    const g = grp(b.max.x, 0, (b.min.z + b.max.z) / 2, 'E', true);
    const lac = mat('#0e0c0c', { rough: 0.12 });
    bx(g, -0.78, 0.68, -1.4, 0.78, 0.98, -0.6, lac);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.3, 20, 1, false, Math.PI / 2, Math.PI), lac);
    tail.position.set(0, 0.83, -1.4);
    tail.scale.set(1, 1, 0.9);
    g.add(tail);
    bx(g, -0.78, 0.68, -0.6, 0.78, 0.98, -0.05, lac);
    bx(g, -0.74, 0.86, -0.05, 0.74, 0.9, 0.12, M.white);
    for (let i = 0; i < 14; i++) bx(g, -0.7 + i * 0.105, 0.9, 0.02, -0.66 + i * 0.105, 0.92, 0.1, M.black);
    bx(g, -0.78, 0.82, 0.12, 0.78, 0.96, 0.16, lac);
    for (const [lx, lz] of [[-0.66, 0.0], [0.66, 0.0], [0, -1.95]]) cyl(g, lx, 0, lz, 0.05, 0.07, 0.68, lac, 8);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.03, 1.9), lac);
    lid.position.set(-0.35, 1.4, -1.0);
    lid.rotation.z = 0.62;
    g.add(lid);
    cyl(g, 0.55, 0.98, -1.0, 0.012, 0.012, 0.55, M.brass, 4).rotation.z = 0.2;
    bx(g, -0.3, 0.98, -0.12, 0.3, 1.3, -0.08, lac);
    signAt(g, [{ t: 'FUNERAL MARCH', bold: true }, { t: 'for four hands', italic: true, s: 0.8 }, { t: '— practise daily —', s: 0.7 }], 0.34, 0.24, 0, 1.15, -0.075, SIGN.card, 0, -0.15);
    candlestick(g, -0.55, 0.98, -0.3, M.silver, 0.3);
    bx(g, -0.3, 0, 0.45, 0.3, 0.48, 0.8, lac);
    bx(g, -0.32, 0.48, 0.43, 0.32, 0.54, 0.82, M.velvet);
    const h = byLabel('Harp');
    const hg = grp((h.min.x + h.max.x) / 2, 0, (h.min.z + h.max.z) / 2, 'E', true);
    bx(hg, -0.25, 0, -0.3, 0.25, 0.12, 0.3, M.gilt);
    const col = cyl(hg, 0, 0.12, 0.22, 0.04, 0.035, 1.65, M.gilt, 8);
    void col;
    const neck = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 6, 12, Math.PI * 0.8), M.gilt);
    neck.position.set(0, 1.55, 0.0);
    neck.rotation.y = Math.PI / 2;
    hg.add(neck);
    const sb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.16), M.gilt);
    sb.position.set(0, 0.95, -0.15);
    sb.rotation.x = -0.28;
    hg.add(sb);
    for (let i = 0; i < 8; i++) bx(hg, -0.004, 0.35 + i * 0.03, -0.18 + i * 0.05, 0.004, 1.5 - i * 0.04, -0.17 + i * 0.05, M.linen);
    const sc = byLabel('Folding screen');
    const sg = grp((sc.min.x + sc.max.x) / 2, 0, (sc.min.z + sc.max.z) / 2, 'S', true);
    const pw = (sc.max.x - sc.min.x) / 4;
    const panelM = mat('#ffffff', { map: screenPanel(), rough: 0.4 });
    for (let i = 0; i < 4; i++) {
      const x0 = -2 * pw + i * pw;
      bx(sg, x0, 0.05, -0.04 + (i % 2) * 0.08, x0 + pw - 0.02, 1.88, 0.04 + (i % 2) * 0.08, [M.gilt, M.gilt, M.gilt, M.gilt, panelM, panelM]);
    }
    const cc = byLabel('Curio cabinet');
    const cg = grp(cc.max.x, 0, (cc.min.z + cc.max.z) / 2, 'E', true);
    const cw = (cc.max.z - cc.min.z) / 2, cd = cc.max.x - cc.min.x;
    bx(cg, -cw, 0, -cd, cw, 0.6, 0, M.walnut);
    bx(cg, -cw, 0.6, -cd, cw, 2.3, -cd + 0.04, M.walnut);
    for (const s of [-1, 1]) bx(cg, s * cw - 0.04, 0.6, -cd, s * cw + 0.04, 2.3, 0, M.walnut);
    bx(cg, -cw, 2.3, -cd, cw, 2.4, 0.03, M.gilt);
    for (const y of [1.05, 1.55, 2.0]) {
      bx(cg, -cw, y - 0.02, -cd, cw, y, -0.02, M.walnut);
      for (let i = 0; i < 5; i++) ball(cg, -cw + 0.25 + i * ((2 * cw - 0.5) / 4), y + 0.08, -cd / 2, 0.06, i % 2 ? M.blueChina : M.china, 1, 1.4, 1, 8);
    }
    bx(cg, -cw, 0.6, -0.01, cw, 2.3, 0.0, M.glass);
    const p = byLabel('Drawing room palm');
    palm((p.min.x + p.max.x) / 2, (p.min.z + p.max.z) / 2, 1.8, 0.28, M.blueChina);
  }
  // Windows on the south front, the chandelier, rugs, paintings.
  for (const x of [-18.3, -12.6]) windowAt(x, 6, 'N', 1.7, 0.75, 3.35, M.rose);
  chandelier(-15.2, 3.35, 0, 0.6, 8, HT.drawing, M.gilt);
  rug(-12.5, -2.3, 6.6, 4.6, persian('drawingRug', { field: '#e6d8c2', border: '#a86a72', ground: '#6a8a8a', accent: '#b8707a', light: '#9ac8c4' }));
  rug(-19.6, 3.0, 3.6, 2.8, persian('pianoRug', { field: '#3a5a6a', border: '#c9a24a', ground: '#1a2a32', accent: '#e8c4c8', light: '#9ac8c4' }, 384, 288));
  painting('mittens', -8.3 - 0.03, 2.3, -3.6, 'W', 0.8, 0.95, ['MITTENS', { t: 'beloved (more than some)', italic: true, s: 0.8 }]);
  painting('yacht', -8.3 - 0.03, 2.6, 4.4, 'W', 1.1, 0.8, ["UNCLE'S YACHT", { t: 'uninsured', italic: true, s: 0.8 }]);
  pedestalAt(byLabel('Pedestal drawing room window'));
  pedestalAt(byLabel('Pedestal behind the screen'));

  // ═════════════════════════════ The conservatory ═════════════════════════════
  {
    // Glass walls: a white stone plinth, glass in a white iron grid.
    for (const b of boxes.filter((x) => GLASS.test(x.label ?? ''))) {
      v.add(boxMesh(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, M.outside), true);
      const thinX = b.max.x - b.min.x < b.max.z - b.min.z;
      const face: Face = thinX ? 'E' : b.min.z < -10 ? 'S' : 'N';
      const inner = thinX ? b.max.x : face === 'S' ? b.max.z : b.min.z;
      const a0 = thinX ? Math.max(b.min.z, -15) : Math.max(b.min.x, -30), a1 = thinX ? Math.min(b.max.z, 6) : Math.min(b.max.x, -22.3);
      const len = a1 - a0, mid = (a0 + a1) / 2;
      const g = thinX ? grp(inner, 0, mid, face) : grp(mid, 0, inner, face);
      const L2 = len / 2;
      bx(g, -L2, 0, 0, L2, 0.6, 0.12, mat('#e8e4da', { rough: 0.8 }));
      bx(g, -L2, 0.6, 0, L2, 0.66, 0.16, M.white);
      bx(g, -L2, 0.66, 0, L2, HT.conservatory, 0.01, windows);
      const n = Math.round(len / 1.0);
      for (let i = 0; i <= n; i++) bx(g, -L2 + (len * i) / n - 0.035, 0.66, 0, -L2 + (len * i) / n + 0.035, HT.conservatory, 0.07, M.whiteIron);
      for (const y of [2.2, 3.7]) bx(g, -L2, y - 0.03, 0, L2, y + 0.03, 0.06, M.whiteIron);
      for (let i = 0; i < n; i++) {
        const xm = -L2 + (len * (i + 0.5)) / n;
        const arch = new THREE.Mesh(new THREE.TorusGeometry(len / n / 2 - 0.04, 0.02, 4, 12, Math.PI), M.whiteIron);
        arch.position.set(xm, 3.7, 0.04);
        g.add(arch);
      }
    }
    // Roof ribs and a ridge.
    for (let z = -14; z <= 5; z += 1.9) {
      v.add(boxMesh(-30, HT.conservatory - 0.12, z - 0.04, -22.3, HT.conservatory, z + 0.04, M.whiteIron));
      const arc = new THREE.Mesh(new THREE.TorusGeometry(3.85, 0.035, 4, 24, Math.PI), M.whiteIron);
      arc.position.set(-26.15, HT.conservatory - 3.85 - 0.12, z);
      arc.scale.set(1, 0.18, 1);
      v.add(arc);
    }
    v.add(boxMesh(-26.2, HT.conservatory - 0.16, -15, -26.1, HT.conservatory, 6, M.whiteIron));
    // The fountain: basin, water, a cherub with an urn.
    const f = byLabel('Fountain');
    const fx = (f.min.x + f.max.x) / 2, fz = (f.min.z + f.max.z) / 2;
    const g = grp(fx, 0, fz, 'S', true);
    const stone = mat('#e4e0d4', { rough: 0.7 });
    cyl(g, 0, 0, 0, 1.0, 1.0, 0.5, stone, 24);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.06, 6, 28), stone);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.52;
    g.add(rim);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.92, 28), M.water);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.46;
    g.add(water);
    cyl(g, 0, 0.46, 0, 0.16, 0.1, 0.55, stone, 12);
    cyl(g, 0, 1.0, 0, 0.12, 0.45, 0.14, stone, 18);
    ball(g, 0, 1.3, 0, 0.13, stone, 1, 1.1, 0.9);
    ball(g, 0, 1.5, 0, 0.09, stone);
    for (const s of [-1, 1]) ball(g, s * 0.13, 1.38, -0.06, 0.09, stone, 0.5, 1, 0.25);
    cyl(g, 0.12, 1.35, 0.12, 0.06, 0.05, 0.12, stone, 8).rotation.x = 0.9;
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.85, 6), mat('#cfe8ee', { rough: 0.1, emissive: '#6a9aa0', emissiveIntensity: 0.6 }));
    jet.position.set(0.2, 0.95, 0.3);
    jet.rotation.x = 0.35;
    g.add(jet);
    for (let i = 0; i < 5; i++) { const a = i * 1.3; const pad = new THREE.Mesh(new THREE.CircleGeometry(0.11, 10, 0.3, Math.PI * 1.8), M.leaf); pad.rotation.x = -Math.PI / 2; pad.position.set(Math.cos(a) * 0.6, 0.47, Math.sin(a) * 0.6); g.add(pad); }
    // Palms in the corners, more in pots by the doors.
    for (const label of ['Palm pot south-west', 'Palm pot north-west', 'Palm pot north-east', 'Palm pot south-east']) {
      const b = byLabel(label);
      palm((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2, 2.6 + (label.length % 3) * 0.5);
    }
    // The potting bench: seedlings, a watering can, and some very specific labels.
    const pb = byLabel('Potting bench');
    const pg = grp(pb.max.x, 0, (pb.min.z + pb.max.z) / 2, 'E', true);
    const pl = (pb.max.z - pb.min.z) / 2;
    bx(pg, -pl, 0.84, -0.7, pl, 0.9, 0, M.oak);
    for (const s of [-1, 1]) bx(pg, s * (pl - 0.1) - 0.04, 0, -0.6, s * (pl - 0.1) + 0.04, 0.84, -0.05, M.oak);
    bx(pg, -pl, 0.2, -0.6, pl, 0.24, -0.05, M.oak);
    const labels = [['DEADLY NIGHTSHADE', '(decorative)'], ['FOXGLOVE', 'not for tea'], ['BELLADONNA', 'hands off, Clement'], ['HEMLOCK', "Nana's"]];
    labels.forEach(([a, b], i) => {
      const x = -pl + 0.6 + i * ((2 * pl - 1.2) / 3);
      cyl(pg, x, 0.9, -0.35, 0.09, 0.12, 0.16, M.terracotta, 10);
      for (let k = 0; k < 4; k++) ball(pg, x + (k - 1.5) * 0.04, 1.12 + (k % 2) * 0.06, -0.35, 0.07, k % 2 ? M.leaf : M.leafDark, 1, 1.4, 1, 6);
      signAt(pg, [a, { t: b, italic: true, s: 0.85 }], 0.3, 0.12, x, 0.97, -0.2, SIGN.card, 0, -0.4);
    });
    cyl(pg, pl - 0.3, 0.9, -0.4, 0.1, 0.1, 0.2, mat('#4a6a4a', { rough: 0.4, metal: 0.5 }), 10);
    pedestalAt(byLabel('Pedestal conservatory'));
    // Wicker chairs and table: tea for one.
    const wicker = mat('#c8a46a', { rough: 0.9 });
    const wt = byLabel('Wicker table');
    const wg = grp((wt.min.x + wt.max.x) / 2, 0, (wt.min.z + wt.max.z) / 2, 'S', true);
    cyl(wg, 0, 0, 0, 0.2, 0.08, 0.64, wicker, 10);
    cyl(wg, 0, 0.64, 0, 0.42, 0.42, 0.06, wicker, 16);
    teacup(wg, 0.1, 0.7, 0.05);
    teapot(wg, -0.15, 0.7, -0.1);
    for (const [x, z, face] of [[-29.3, 2.4, 'E'], [-27.0, 3.3, 'W']] as const) {
      const c = grp(x, 0, z, face);
      cyl(c, 0, 0, 0, 0.32, 0.3, 0.42, wicker, 14);
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.32, 0.75, 14, 1, true, Math.PI * 0.75, Math.PI * 1.5), wicker);
      back.position.set(0, 0.8, 0);
      back.material = wicker;
      c.add(back);
      cyl(c, 0, 0.42, 0, 0.28, 0.28, 0.06, mat('#8aa87a', { rough: 1 }), 14);
    }
    // The gramophone.
    const gr = byLabel('Gramophone');
    const gg = grp((gr.min.x + gr.max.x) / 2, 0, (gr.min.z + gr.max.z) / 2, 'W', true);
    for (const [lx, lz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) bx(gg, lx - 0.02, 0, lz - 0.02, lx + 0.02, 0.72, lz + 0.02, M.walnut);
    bx(gg, -0.3, 0.72, -0.3, 0.3, 0.98, 0.3, M.walnut);
    cyl(gg, 0, 0.98, 0, 0.2, 0.2, 0.02, M.black, 20);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 16, 1, true), M.brass);
    horn.position.set(0.05, 1.45, 0.2);
    horn.rotation.x = -2.2;
    gg.add(horn);
    // A stuffed parrot in a cage, hanging from the roof; Gerald the Third, a carnivorous plant.
    const cage = grp(-24.6, 0, -11.4);
    cyl(cage, 0, 3.0, 0, 0.005, 0.005, HT.conservatory - 3.0, M.whiteIron, 4);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; bx(cage, Math.cos(a) * 0.22 - 0.006, 2.2, Math.sin(a) * 0.22 - 0.006, Math.cos(a) * 0.22 + 0.006, 2.85, Math.sin(a) * 0.22 + 0.006, M.brass); }
    cyl(cage, 0, 2.15, 0, 0.24, 0.24, 0.05, M.brass, 14);
    ball(cage, 0, 2.95, 0, 0.24, M.brass, 1, 0.45, 1, 10);
    ball(cage, 0, 2.42, 0, 0.08, mat('#2a9a4a'), 0.8, 1.2, 0.8);
    ball(cage, 0, 2.55, 0.03, 0.05, mat('#d83a2a'));
    signAt(cage, ['POLLY', { t: 'stuffed · still knows too much', italic: true, s: 0.8 }], 0.36, 0.12, 0, 2.08, 0.26, SIGN.card);
    const gp = grp(-23.6, 0, -12.8, 'W');
    cyl(gp, 0, 0, 0, 0.2, 0.15, 0.75, M.oak, 10);
    cyl(gp, 0, 0.75, 0, 0.16, 0.2, 0.25, M.terracotta, 12);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const trap = ball(gp, Math.cos(a) * 0.16, 1.2, Math.sin(a) * 0.16, 0.09, mat('#7a9a3a'), 1, 0.5, 0.6, 8);
      trap.rotation.y = a;
      ball(gp, Math.cos(a) * 0.16, 1.2, Math.sin(a) * 0.16, 0.07, mat('#a82a2a'), 0.9, 0.35, 0.5, 8);
    }
    signAt(gp, ['GERALD III', { t: 'do not feed', italic: true, s: 0.85 }], 0.3, 0.12, 0, 0.6, 0.21, SIGN.card);
    // Hanging ferns.
    for (const [x, z] of [[-28.6, -1.5], [-23.8, -6.5], [-28.6, -9.5], [-23.8, 1.8]]) {
      const hf = grp(x, 0, z);
      cyl(hf, 0, 3.4, 0, 0.004, 0.004, HT.conservatory - 3.4, M.iron, 4);
      cyl(hf, 0, 3.05, 0, 0.12, 0.2, 0.22, M.terracotta, 10);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ball(hf, Math.cos(a) * 0.22, 2.95, Math.sin(a) * 0.22, 0.12, i % 2 ? M.leaf : M.leafDark, 1, 1.6, 1, 6); }
    }
  }
  rug(-26.2, -0.9, 3.4, 2.2, persian('consRug', { field: '#c8b080', border: '#5a7a4a', ground: '#3a4a2a', accent: '#a4502e', light: '#e8dcc0' }, 384, 256));

  // ═════════════════════════════ The library ═════════════════════════════
  bookcase(byLabel('Bookcase north 1'), 'S', { storeys: true });
  bookcase(byLabel('Bookcase north 2'), 'S', { storeys: true });
  bookcase(byLabel('Bookcase west 1'), 'E', { storeys: true });
  bookcase(byLabel('Bookcase west 2'), 'E', { storeys: true });
  bookcase(byLabel('Bookcase west 3'), 'E', { storeys: true });
  bookcase(byLabel('Bookcase east 1'), 'W', { storeys: true });
  bookcase(byLabel('Bookcase east 2'), 'W', { storeys: true });
  bookcase(byLabel('Bookcase south 1'), 'N', { storeys: true });
  bookcase(byLabel('Bookcase south 2'), 'N', { storeys: true });
  stack(byLabel('Stack north 1'), [['HOW TO BE GRATEFUL', { t: '(unread)', italic: true }], ['—']], { key: '', plaque: 'GRANDPA (likeness disputed)' });
  stack(byLabel('Stack north 2'), [['FAMILY HISTORY', { t: '(abridged)', italic: true }], ['—']], { key: '', plaque: 'SHAKESPEARE (no relation)' });
  stack(byLabel('Stack north 3'), [['UNCLAIMED ESTATES'], ['—']], { key: '', plaque: 'NANA AGED 30 (allegedly)' });
  stack(byLabel('Stack south 1'), [['INHERITANCE LAW'], ['WILLS A – M']]);
  stack(byLabel('Stack south 2'), [['SILENCE', { t: 'Nana is listening (badly)', italic: true }], ['WILLS N – Z']]);
  stack(byLabel('Stack south 3'), [['POISONS', { t: '(botanical)', italic: true }], ['ETIQUETTE FOR MOURNERS']]);
  // The window at the end of the long aisle, and the fireplace at the end of the other.
  windowAt(-17.4, -21, 'S', 1.3, 0.9, 4.4, M.greenCurtain, M.walnut, M.walnut);
  {
    const breast = byLabel('Library chimney breast');
    const bz = (breast.min.z + breast.max.z) / 2;
    v.add(worldBox(breast.min.x, 0, breast.min.z, breast.max.x, breast.max.y, breast.max.z, [STYLE.Library.paper, M.outside, M.outside, M.outside, STYLE.Library.paper, STYLE.Library.paper], 0.5), true);
    fireplace(breast.max.x, bz, 'E', M.greenMarble, { w: 2.0, mantel: 1.4 });
    const g = grp(breast.max.x, 1.4, bz, 'E');
    // A stuffed owl, an hourglass, the family motto, and a portrait of Sir Ambrose above.
    ball(g, -0.6, 0.18, 0.15, 0.12, mat('#8a6a4a'), 1, 1.4, 1);
    ball(g, -0.6, 0.38, 0.17, 0.09, mat('#8a6a4a'));
    for (const s of [-1, 1]) ball(g, -0.6 + s * 0.04, 0.4, 0.25, 0.025, mat('#e0b030', { emissive: '#604000', emissiveIntensity: 0.5 }));
    cyl(g, 0.6, 0, 0.15, 0.06, 0.06, 0.02, M.brass, 8);
    ball(g, 0.6, 0.08, 0.15, 0.05, M.glass, 1, 1.2, 1);
    ball(g, 0.6, 0.18, 0.15, 0.05, M.glass, 1, 1.2, 1);
    cyl(g, 0.6, 0.24, 0.15, 0.06, 0.06, 0.02, M.brass, 8);
    signAt(g, [{ t: 'QUOD HABEMUS TENEMUS', bold: true }, { t: 'what we have, we hold', italic: true, s: 0.75 }], 1.4, 0.26, 0, 0.42, 0.02, SIGN.wood);
    painting('ambrose', breast.max.x + 0.01, 3.4, bz, 'E', 1.2, 1.5);
  }
  {
    // The rolling ladder, leaning on the north shelves.
    const g = grp(-11.4, 0, -20.6 + 0.02, 'S');
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.75, 0.05), M.oak);
      rail.position.set(s * 0.25, 1.32, 0.42);
      rail.rotation.x = -0.16;
      g.add(rail);
      ball(g, s * 0.25, 0.04, 0.62, 0.04, M.brass);
    }
    for (let i = 0; i < 8; i++) bx(g, -0.25, 0.2 + i * 0.32, 0.6 - i * 0.052 - 0.02, 0.25, 0.23 + i * 0.32, 0.6 - i * 0.052 + 0.02, M.oak);
    // The writing desk: the half-burnt will, a quill, a candle, a lamp.
    const d = byLabel('Writing desk');
    const dg = grp((d.min.x + d.max.x) / 2, 0, (d.min.z + d.max.z) / 2, 'S', true);
    const dw = (d.max.x - d.min.x) / 2, dd = (d.max.z - d.min.z) / 2;
    bx(dg, -dw, 0.72, -dd, dw, 0.78, dd, M.walnut);
    bx(dg, -dw + 0.05, 0.78, -dd + 0.05, dw - 0.05, 0.785, dd - 0.05, M.greenLeather);
    for (const s of [-1, 1]) bx(dg, s * dw - (s > 0 ? 0.45 : -0.45) - 0.0, 0, -dd + 0.03, s * dw, 0.72, dd - 0.03, M.walnut);
    customSign(dg, 300, 380, (gg, x, y, w, h) => {
      gg.fillStyle = '#20180f'; gg.fillRect(x, y, w, h);
      gg.fillStyle = '#efe2bc';
      gg.beginPath(); gg.moveTo(x + 10, y + 10); gg.lineTo(x + w - 10, y + 10);
      const r = rng(11);
      for (let k = 0; k <= 10; k++) gg.lineTo(x + w - 10 - k * ((w - 20) / 10), y + h * (0.55 + r() * 0.2));
      gg.closePath(); gg.fill();
      gg.strokeStyle = '#3a1a08'; gg.lineWidth = 6; gg.stroke();
      gg.fillStyle = '#2a1a10'; gg.textAlign = 'center';
      gg.font = `bold 26px ${SERIF}`; gg.fillText('LAST WILL', x + w / 2, y + 48);
      gg.fillText('& TESTAMENT', x + w / 2, y + 78);
      gg.font = `italic 17px ${SERIF}`;
      gg.fillText('I leave everything', x + w / 2, y + 116);
      gg.fillText('to my dear, darling', x + w / 2, y + 140);
      gg.fillText('grandchild', x + w / 2, y + 164);
    }, 0.36, 0.46, 0.1, 0.79, 0.0, -Math.PI / 2, 0.2);
    cyl(dg, -0.6, 0.78, -0.15, 0.03, 0.03, 0.05, M.black, 8);
    const quill = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.28, 6), M.linen);
    quill.position.set(-0.55, 0.92, -0.12);
    quill.rotation.z = -0.5;
    dg.add(quill);
    candlestick(dg, 0.65, 0.78, -0.2, M.brass, 0.18);
    bankersLamp(dg, -0.25, 0.78, -0.25);
    for (let i = 0; i < 4; i++) bx(dg, 0.3 + i * 0.01, 0.785 + i * 0.012, 0.0, 0.55 + i * 0.01, 0.795 + i * 0.012, 0.3, M.paper);
    chair(-10.7, -8.05, 'N', M.walnut, M.greenLeather, 1.0);
    // The reading table with its lamps and an open atlas.
    const t = byLabel('Library table');
    const tg = grp((t.min.x + t.max.x) / 2, 0, (t.min.z + t.max.z) / 2, 'E', true);
    const tl = (t.max.z - t.min.z) / 2, tw = (t.max.x - t.min.x) / 2;
    bx(tg, -tl, 0.72, -tw, tl, 0.78, tw, M.walnut);
    for (const s of [-1, 1]) { bx(tg, s * (tl - 0.15) - 0.06, 0, -tw + 0.1, s * (tl - 0.15) + 0.06, 0.72, tw - 0.1, M.walnut); bx(tg, s * (tl - 0.15) - 0.12, 0, -tw + 0.05, s * (tl - 0.15) + 0.12, 0.08, tw - 0.05, M.walnut); }
    bx(tg, -tl + 0.2, 0.3, -0.03, tl - 0.2, 0.36, 0.03, M.walnut);
    bankersLamp(tg, -0.7, 0.78, 0);
    bankersLamp(tg, 0.7, 0.78, 0);
    bx(tg, -0.2, 0.78, -0.25, 0.25, 0.8, 0.1, M.paper);
    bx(tg, -0.2, 0.8, -0.25, 0.02, 0.81, 0.1, mat('#c8b890'));
    // The globe.
    const gl = byLabel('Globe');
    const gg = grp((gl.min.x + gl.max.x) / 2, 0, (gl.min.z + gl.max.z) / 2, 'S', true);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const leg = cyl(gg, Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22, 0.025, 0.03, 0.62, M.walnut, 6); leg.rotation.z = Math.cos(a) * 0.25; leg.rotation.x = -Math.sin(a) * 0.25; }
    const ringStand = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 24), M.walnut);
    ringStand.rotation.x = Math.PI / 2;
    ringStand.position.y = 0.62;
    gg.add(ringStand);
    const sphere = ball(gg, 0, 0.72, 0, 0.34, mat('#ffffff', { map: globe(), rough: 0.5 }), 1, 1, 1, 20);
    sphere.rotation.z = 0.4;
    const mer = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.012, 4, 24), M.brass);
    mer.position.y = 0.72;
    mer.rotation.z = 0.4;
    gg.add(mer);
    // Reading chairs and a standard lamp between them.
    for (const [label, face] of [['Reading chair west', 'E'], ['Reading chair east', 'W']] as const) {
      const b = byLabel(label);
      v.blockers.push(armchair((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2, face, M.leather, 0.8));
    }
    standardLamp(-13.6, -8.0, 1.55);
    cyl(v.group, -13.6, 0, -8.5, 0.18, 0.18, 0.55, M.walnut, 12);
  }
  rug(-16.6, -8.7, 8.5, 3.6, persian('libRug', { field: '#1f3a2a', border: '#7a2a1e', ground: '#14100a', accent: '#c9a24a', light: '#d8c8a0' }));
  rug(-15.2, -16.65, 11.8, 1.3, persian('libRunner', { field: '#5a1a1a', border: '#1f3a2a', ground: '#140e08', accent: '#c9a24a', light: '#d8c8a0' }, 1024, 112));
  pedestalAt(byLabel('Pedestal library bay'));
  pedestalAt(byLabel('Pedestal library corner'));

  // ═════════════════════════════ The dining room (laid for the wake) ═════════════════════════════
  {
    const t = byLabel('Dining table');
    const tz = (t.min.z + t.max.z) / 2, tl = (t.max.x - t.min.x) / 2, tw = (t.max.z - t.min.z) / 2;
    const g = grp(0, 0, tz, 'S', true);
    const cloth = mat('#141012', { rough: 0.9 });
    bx(g, -tl, 0.74, -tw, tl, 0.78, tw, cloth);
    bx(g, -tl - 0.04, 0.46, -tw - 0.04, tl + 0.04, 0.78, -tw, cloth);
    bx(g, -tl - 0.04, 0.46, tw, tl + 0.04, 0.78, tw + 0.04, cloth);
    for (const s of [-1, 1]) bx(g, s * tl - (s > 0 ? 0 : 0.04), 0.46, -tw, s * tl + (s > 0 ? 0.04 : 0), 0.78, tw, cloth);
    bx(g, -tl - 0.05, 0.44, -tw - 0.05, tl + 0.05, 0.47, tw + 0.05, M.gilt);
    bx(g, -tl + 0.3, 0.781, -0.18, tl - 0.3, 0.784, 0.18, mat('#c9a24a', { rough: 0.6 })); // gold runner
    for (const [lx, lz] of [[-tl + 0.2, -tw + 0.15], [tl - 0.2, -tw + 0.15], [-tl + 0.2, tw - 0.15], [tl - 0.2, tw - 0.15], [0, -tw + 0.15], [0, tw - 0.15]]) cyl(g, lx, 0, lz, 0.06, 0.08, 0.46, M.blackLacquer, 8);
    // Candelabra, lilies, the RESERVED card.
    for (const x of [-2.6, 2.6]) {
      cyl(g, x, 0.78, 0, 0.1, 0.06, 0.04, M.silver, 10);
      cyl(g, x, 0.82, 0, 0.025, 0.025, 0.35, M.silver, 8);
      for (const s of [-1, 0, 1]) { bx(g, x + s * 0.18 - 0.01, 1.16, -0.01, x + s * 0.18 + 0.01, 1.18, 0.01, M.silver); candlestick(g, x + s * 0.18, 1.14, 0, M.silver, 0.08); }
      bx(g, x - 0.2, 1.15, -0.012, x + 0.2, 1.17, 0.012, M.silver);
    }
    cyl(g, 0, 0.78, 0, 0.14, 0.18, 0.22, M.silver, 14);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; ball(g, Math.cos(a) * 0.16, 1.08 + (i % 3) * 0.05, Math.sin(a) * 0.12, 0.07, M.linen, 1, 0.6, 1, 8); ball(g, Math.cos(a) * 0.2, 1.0, Math.sin(a) * 0.15, 0.06, M.leafDark, 1.4, 0.4, 1, 6); }
    const tent = new THREE.Group();
    tent.position.set(-1.2, 0.78, 0);
    g.add(tent);
    for (const s of [-1, 1]) signAt(tent, [{ t: 'RESERVED', bold: true }, { t: 'FOR THE WAKE', s: 0.8 }], 0.42, 0.22, 0, 0.1, s * 0.04, SIGN.black, s > 0 ? 0 : Math.PI, s * -0.35);
    // Eight places a side: plates, glasses, cutlery, place cards; black ribbons on the chairs.
    const names = ['AGATHA', 'BARNABY', 'CLEMENT', 'DUDLEY', 'EDNA', 'FERGUS', 'GWENDOLINE', 'HORACE', 'THE SOLICITOR', 'COUSIN NIGEL', 'MITTENS', 'THE VICAR', 'THE OTHER WOMAN', 'UNCLE (TBC)', 'A NEW FRIEND', 'THE TAXMAN'];
    for (let i = 0; i < 8; i++) {
      const x = -3.75 + i * (7.5 / 7);
      for (const s of [-1, 1] as const) {
        const z = s * (tw - 0.22);
        cyl(g, x, 0.785, z, 0.13, 0.13, 0.012, M.china, 16);
        cyl(g, x, 0.797, z, 0.09, 0.09, 0.006, M.blueChina, 14);
        cyl(g, x + 0.17, 0.785, z - s * 0.1, 0.025, 0.03, 0.12, M.glass, 8);
        for (const dx of [-0.17, -0.2, 0.2]) bx(g, x + dx - 0.006, 0.785, z - 0.09, x + dx + 0.006, 0.79, z + 0.09, M.silver);
        const nm = names[(i * 2 + (s > 0 ? 1 : 0)) % names.length];
        signAt(g, [nm], 0.16, 0.06, x, 0.83, z - s * 0.17, SIGN.card, s > 0 ? Math.PI : 0, s * 0.5);
        chair(x, s * (tw + 0.32), s > 0 ? 'N' : 'S', M.blackLacquer, mat('#5a1a22', { rough: 0.9 }), 1.15, M.ribbon);
      }
    }
    for (const s of [-1, 1]) {
      const cg = grp(s * 5.0, 0, tz, s > 0 ? 'W' : 'E');
      bx(cg, -0.28, 0, -0.26, 0.28, 0.5, 0.26, M.blackLacquer);
      bx(cg, -0.3, 0.5, -0.3, 0.3, 1.35, -0.22, M.blackLacquer);
      bx(cg, -0.3, 1.3, -0.32, 0.3, 1.38, -0.2, M.gilt);
      for (const a of [-1, 1]) bx(cg, a * 0.28 - 0.03, 0.5, -0.26, a * 0.28 + 0.03, 0.75, 0.24, M.blackLacquer);
      bx(cg, -0.08, 1.2, -0.33, 0.08, 1.3, -0.31, M.ribbon);
    }
    signAt(v.group, [{ t: 'NANA', bold: true }, { t: '(in spirit)', italic: true, s: 0.8 }], 0.2, 0.09, -4.35, 0.86, tz, SIGN.card, Math.PI / 2, 0);
  }
  {
    // The fireplace and the late husbands on the mantel.
    const breast = byLabel('Dining room chimney breast');
    v.add(worldBox(breast.min.x, 0, breast.min.z, breast.max.x, breast.max.y, breast.max.z, [STYLE.Dining.paper, STYLE.Dining.paper, M.outside, M.outside, STYLE.Dining.paper, M.outside], 0.8), true);
    fireplace(0, breast.max.z, 'S', M.blackMarble);
    const g = grp(0, 1.3, breast.max.z, 'S');
    const urns: [string, string][] = [['HAROLD', '#2a3a4a'], ['GERALD', '#4a2a2a'], ['REGINALD', '#2a4a3a'], ['RESERVED', '#1a1a1a']];
    urns.forEach(([name, c], i) => {
      const x = -0.75 + i * 0.5;
      const um = mat(c, { rough: 0.3, metal: 0.4 });
      cyl(g, x, 0, 0.15, 0.07, 0.05, 0.04, um, 10);
      ball(g, x, 0.14, 0.15, 0.1, um, 1, 1.25, 1, 12);
      cyl(g, x, 0.25, 0.15, 0.05, 0.06, 0.05, um, 10);
      ball(g, x, 0.31, 0.15, 0.035, M.gilt);
      signAt(g, [{ t: name, bold: true }, ...(name === 'REGINALD' ? [{ t: '(probably)', italic: true, s: 0.8 }] : name === 'RESERVED' ? [{ t: '(no rush)', italic: true, s: 0.8 }] : [])], 0.17, 0.07, x, 0.12, 0.255, SIGN.brass);
    });
    candlestick(g, -1.05, 0, 0.15, M.gilt);
    candlestick(g, 1.05, 0, 0.15, M.gilt);
    bx(g, -0.85, 0.45, 0, 0.85, 2.3, 0.05, M.gilt);
    bx(g, -0.75, 0.55, 0.05, 0.75, 2.2, 0.06, mat('#5a6262', { rough: 0.08, metal: 0.9 }));
    // The silver, counted daily.
    const sc = byLabel('Silver cabinet');
    const sg = grp((sc.min.x + sc.max.x) / 2, 0, sc.max.z, 'S', true);
    const sw = (sc.max.x - sc.min.x) / 2, sd = sc.max.z - sc.min.z;
    bx(sg, -sw, 0, -sd, sw, 0.85, 0, M.blackLacquer);
    bx(sg, -sw, 0.85, -sd, sw, 2.2, -sd + 0.04, mat('#5a1a22', { rough: 1 }));
    for (const s of [-1, 1]) bx(sg, s * sw - 0.04, 0.85, -sd, s * sw + 0.04, 2.2, 0, M.blackLacquer);
    bx(sg, -sw - 0.04, 2.2, -sd, sw + 0.04, 2.32, 0.04, M.gilt);
    for (const y of [1.3, 1.75]) {
      bx(sg, -sw, y - 0.02, -sd, sw, y, -0.02, M.blackLacquer);
      for (let i = 0; i < 6; i++) {
        const x = -sw + 0.18 + i * ((2 * sw - 0.36) / 5);
        if (i % 2) cyl(sg, x, y, -sd / 2, 0.06, 0.05, 0.22, M.silver, 10); else bx(sg, x - 0.01, y, -sd / 2 - 0.05, x + 0.01, y + 0.24, -sd / 2 + 0.05, M.silver);
      }
    }
    teapot(sg, -0.4, 0.85 + 0.03, -0.2, M.silver);
    bx(sg, -sw, 0.85, -0.01, sw, 2.2, 0, M.glass);
    signAt(sg, [{ t: 'THE FAMILY SILVER', bold: true }, { t: 'COUNTED DAILY', bold: true, c: '#8a1414' }], 0.9, 0.3, 0, 2.5, 0.03, SIGN.card);
    signAt(sg, ['Mon ✓  Tue ✓  Wed ✓', { t: 'Thu — one spoon short', c: '#8a1414' }, { t: 'Fri — BARNABY?', c: '#8a1414' }], 0.42, 0.3, 0.3, 0.55, 0.005, SIGN.note);
    // The suit of armour, wearing Cousin Nigel's sash.
    const ar = byLabel('Suit of armour');
    const ag = grp((ar.min.x + ar.max.x) / 2, 0, (ar.min.z + ar.max.z) / 2, 'S', true);
    bx(ag, -0.32, 0, -0.32, 0.32, 0.12, 0.32, M.blackLacquer);
    const steel = mat('#a8acb0', { rough: 0.3, metal: 0.85 });
    for (const s of [-1, 1]) { cyl(ag, s * 0.1, 0.12, 0, 0.07, 0.06, 0.75, steel, 8); ball(ag, s * 0.1, 0.5, 0.02, 0.07, steel); bx(ag, s * 0.1 - 0.07, 0.12, -0.02, s * 0.1 + 0.07, 0.2, 0.16, steel); }
    cyl(ag, 0, 0.85, 0, 0.17, 0.2, 0.25, steel, 10);
    cyl(ag, 0, 1.1, 0, 0.2, 0.22, 0.4, steel, 12);
    for (const s of [-1, 1]) { ball(ag, s * 0.27, 1.45, 0, 0.11, steel, 1, 0.8, 1); cyl(ag, s * 0.3, 0.95, 0.05, 0.05, 0.06, 0.5, steel, 8); ball(ag, s * 0.3, 0.93, 0.07, 0.06, steel); }
    ball(ag, 0, 1.68, 0, 0.14, steel, 1, 1.15, 1);
    bx(ag, -0.1, 1.64, 0.1, 0.1, 1.7, 0.14, M.black);
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 8), mat('#8a1424'));
    plume.position.set(0, 1.95, -0.05);
    plume.rotation.x = -0.4;
    ag.add(plume);
    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.75, 0.03), mat('#c41e3a', { rough: 0.8 }));
    sash.position.set(0, 1.28, 0.21);
    sash.rotation.z = 0.75;
    ag.add(sash);
    signAt(ag, ['RUNNER-UP'], 0.16, 0.05, 0.02, 1.27, 0.23, SIGN.brass, 0, 0);
    cyl(ag, 0.38, 0.12, 0.05, 0.02, 0.02, 2.0, M.walnut, 6);
    const axe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.25, 0.2), steel);
    axe.position.set(0.38, 1.95, 0.12);
    ag.add(axe);
    signAt(ag, ["COUSIN NIGEL'S SASH", { t: '(he is not a Sir)', italic: true, s: 0.8 }], 0.4, 0.13, 0, 0.06, 0.33, SIGN.brass, 0, -0.3);
    // The sideboard: the cake under its dome, decanters, the gong, a photograph.
    const sb = byLabel('Sideboard');
    const bg = grp((sb.min.x + sb.max.x) / 2, 0, sb.min.z, 'N', true);
    const bw = (sb.max.x - sb.min.x) / 2;
    bx(bg, -bw, 0.1, 0, bw, 0.9, 0.55, M.blackLacquer);
    bx(bg, -bw - 0.03, 0.9, -0.02, bw + 0.03, 0.95, 0.57, M.gilt);
    for (let i = 0; i < 4; i++) bx(bg, -bw + 0.1 + i * ((2 * bw - 0.2) / 4), 0.2, -0.01, -bw + 0.05 + (i + 1) * ((2 * bw - 0.2) / 4), 0.8, 0.0, panelMat('#2a2626'));
    for (const s of [-1, 1]) cyl(bg, s * (bw - 0.1), 0, 0.27, 0.05, 0.05, 0.1, M.gilt, 6);
    const cake = grp((sb.min.x + sb.max.x) / 2 - 0.9, 0.95, (sb.min.z + sb.max.z) / 2, 'N');
    cyl(cake, 0, 0, 0, 0.26, 0.26, 0.02, M.silver, 18);
    cyl(cake, 0, 0.02, 0, 0.2, 0.2, 0.14, M.linen, 18);
    cyl(cake, 0, 0.16, 0, 0.14, 0.14, 0.11, M.linen, 18);
    cyl(cake, 0, 0.27, 0, 0.09, 0.09, 0.08, M.linen, 16);
    for (const [y, r] of [[0.1, 0.2], [0.21, 0.14], [0.31, 0.09]]) { const rb = new THREE.Mesh(new THREE.TorusGeometry(r + 0.003, 0.012, 4, 20), M.ribbon); rb.rotation.x = Math.PI / 2; rb.position.y = y; cake.add(rb); }
    signAt(cake, [{ t: 'SORRY FOR', bold: true }, { t: 'YOUR LOSS', bold: true }], 0.14, 0.07, 0, 0.351, 0, SIGN.icing, 0, -Math.PI / 2);
    ball(cake, 0, 0.02, 0, 0.3, M.glass, 1, 1.45, 1, 16);
    ball(cake, 0, 0.47, 0, 0.03, M.silver);
    for (const x of [0.5, 0.75]) { cyl(bg, x, 0.95, 0.3, 0.06, 0.06, 0.18, M.glass, 10); ball(bg, x, 1.18, 0.3, 0.04, M.glass); cyl(bg, x, 0.97, 0.3, 0.05, 0.05, 0.1, mat('#6a1a0e', { rough: 0.2 }), 10); }
    const ph = grp(1.3, 0.95, -12.55, 'N');
    bx(ph, -0.14, 0, -0.03, 0.14, 0.34, 0.0, M.gilt);
    plane(ph, uvPlane(0.22, 0.27, portraitUV.get('nana')!), portraitMat, 0, 0.17, 0.005);
    bx(ph, -0.15, 0.25, 0.0, 0.15, 0.28, 0.01, M.ribbon);
    signAt(ph, ['IN LOVING MEMORY', { t: 'of Nana (pending)', italic: true, s: 0.85 }], 0.3, 0.09, 0, -0.06, 0.05, SIGN.card, 0, -0.5);
    const gong = grp(2.75, 0, -12.75, 'N');
    for (const s of [-1, 1]) bx(gong, s * 0.35 - 0.03, 0, -0.03, s * 0.35 + 0.03, 1.3, 0.03, M.blackLacquer);
    bx(gong, -0.4, 1.25, -0.04, 0.4, 1.32, 0.04, M.blackLacquer);
    cyl(gong, 0, 0.62, 0, 0.27, 0.27, 0.03, M.brass, 20).rotation.x = Math.PI / 2;
    signAt(gong, ['STRIKE ONCE', { t: '(not at Grandpa)', italic: true, s: 0.8 }], 0.34, 0.12, 0, 0.18, 0.02, SIGN.brass);
  }
  // The late husbands above the sideboard (their urns face them across the room).
  painting('harold', -2.1, 2.45, -12.33, 'N', 0.75, 0.95, ['HAROLD', { t: '1st', italic: true, s: 0.8 }]);
  painting('gerald', 0, 2.45, -12.33, 'N', 0.75, 0.95, ['GERALD', { t: '2nd', italic: true, s: 0.8 }]);
  painting('reginald', 2.1, 2.45, -12.33, 'N', 0.75, 0.95, ['REGINALD', { t: '3rd (probably)', italic: true, s: 0.8 }]);
  for (const x of [-3.5, 3.5]) windowAt(x, -21, 'S', 1.3, 0.9, 3.4, M.blackCurtain, M.blackLacquer, M.blackLacquer);
  chandelier(-2.3, 3.3, -16.65, 0.55, 8, HT.dining, M.gilt);
  chandelier(2.3, 3.3, -16.65, 0.55, 8, HT.dining, M.gilt);
  rug(0, -16.65, 11.5, 3.6, persian('diningRug', { field: '#1a1414', border: '#a8843a', ground: '#0c0a0a', accent: '#c9a24a', light: '#6a1a22' }, 640, 200));
  painting('ambrose', -7.98, 2.6, -13.9, 'E', 0.75, 0.95);
  painting('cuthbert', 7.98, 2.6, -13.9, 'W', 0.75, 0.95);
  pedestalAt(byLabel('Pedestal dining room'));

  // ═════════════════════════════ Grandpa's study ═════════════════════════════
  {
    const d = byLabel('Study desk');
    const g = grp((d.min.x + d.max.x) / 2, 0, (d.min.z + d.max.z) / 2, 'S', true);
    const dw = (d.max.x - d.min.x) / 2, dd = (d.max.z - d.min.z) / 2;
    bx(g, -dw, 0.72, -dd, dw, 0.78, dd, M.mahogany);
    bx(g, -dw + 0.08, 0.78, -dd + 0.08, dw - 0.08, 0.785, dd - 0.08, M.greenLeather);
    for (const s of [-1, 1]) {
      bx(g, s * dw - (s > 0 ? 0.6 : -0.6), 0, -dd, s * dw, 0.72, dd, M.mahogany);
      for (let i = 0; i < 3; i++) { bx(g, s * (dw - 0.3) - 0.25, 0.08 + i * 0.21, dd, s * (dw - 0.3) + 0.25, 0.26 + i * 0.21, dd + 0.01, panelMat('#6a3220')); ball(g, s * (dw - 0.3), 0.17 + i * 0.21, dd + 0.025, 0.02, M.brass); }
    }
    bankersLamp(g, -0.7, 0.785, -0.2);
    signAt(g, [{ t: 'WILL — DRAFT 47', bold: true }, { t: 'do not show Mother', italic: true, s: 0.8 }], 0.3, 0.36, 0.15, 0.79, 0.05, SIGN.card, 0, -Math.PI / 2);
    cyl(g, 0.7, 0.785, 0.1, 0.07, 0.07, 0.02, M.brass, 10);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.06, 8), M.walnut);
    pipe.position.set(0.7, 0.83, 0.1);
    g.add(pipe);
    bx(g, 0.62, 0.81, 0.07, 0.8, 0.82, 0.09, M.walnut);
    bx(g, 0.35, 0.785, -0.3, 0.55, 0.86, -0.15, M.black);
    v.blockers.push(armchair(12.7, -19.6, 'S', M.leather, 0.75));
    const sf = byLabel('Safe');
    const sg = grp((sf.min.x + sf.max.x) / 2, 0, sf.max.z, 'S', true);
    const sw = (sf.max.x - sf.min.x) / 2, sd = sf.max.z - sf.min.z;
    bx(sg, -sw, 0, -sd, sw, 1.1, 0, mat('#1a1e1a', { rough: 0.4, metal: 0.6 }));
    bx(sg, -sw + 0.06, 0.08, 0, sw - 0.06, 1.02, 0.02, mat('#22281f', { rough: 0.4, metal: 0.6 }));
    cyl(sg, 0, 0.6, 0.03, 0.08, 0.08, 0.04, M.brass, 16).rotation.x = Math.PI / 2;
    bx(sg, 0.12, 0.45, 0.02, 0.26, 0.48, 0.07, M.brass);
    bx(sg, -sw + 0.1, 0.9, 0.025, sw - 0.1, 0.96, 0.03, M.gilt);
    signAt(sg, ['COMBINATION:', "GRANDPA'S BIRTHDAY", { t: '(nobody remembers it)', italic: true, s: 0.85 }], 0.34, 0.22, -0.12, 0.28, 0.025, SIGN.note, 0.08);
    const bk = byLabel('Study bookcase');
    bookcase(bk, 'W');
    const ch = byLabel('Chesterfield');
    const cg = grp((ch.min.x + ch.max.x) / 2, 0, ch.min.z, 'N', true);
    const cl = (ch.max.x - ch.min.x) / 2;
    bx(cg, -cl, 0.1, 0, cl, 0.45, 0.8, M.leather);
    bx(cg, -cl, 0.45, 0.55, cl, 0.85, 0.8, M.leather);
    for (const s of [-1, 1]) cyl(cg, s * (cl - 0.1), 0.55, 0.4, 0.13, 0.13, 0.8, M.leather, 10).rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) ball(cg, -cl + 0.25 + i * ((2 * cl - 0.5) / 5), 0.6 + j * 0.15, 0.545, 0.012, M.walnut);
    // Trophies (none of them shot), Grandpa at peace, the window.
    const stag = grp(10.4, 2.35, -21, 'S');
    bx(stag, -0.28, -0.35, 0, 0.28, 0.35, 0.04, M.walnut);
    ball(stag, 0, 0, 0.18, 0.13, mat('#7a5232'), 1, 1.2, 1.4);
    ball(stag, 0, -0.08, 0.36, 0.07, mat('#6a4428'), 1, 0.9, 1.4);
    ball(stag, 0, -0.08, 0.44, 0.025, M.black);
    for (const s of [-1, 1]) {
      ball(stag, s * 0.11, 0.1, 0.2, 0.04, M.black, 1, 1, 0.6);
      const ant = cyl(stag, s * 0.12, 0.12, 0.15, 0.02, 0.015, 0.45, mat('#e8d8b8'), 5);
      ant.rotation.z = -s * 0.5;
      for (let k = 0; k < 2; k++) { const t2 = cyl(stag, s * (0.2 + k * 0.08), 0.3 + k * 0.1, 0.15, 0.012, 0.01, 0.16, mat('#e8d8b8'), 4); t2.rotation.z = s * 0.4; }
    }
    signAt(stag, ['PURCHASED, NOT SHOT'], 0.36, 0.08, 0, -0.42, 0.045, SIGN.brass);
    const fish = grp(14.9, 2.3, -21, 'S');
    bx(fish, -0.45, -0.18, 0, 0.45, 0.18, 0.03, M.walnut);
    ball(fish, -0.03, 0, 0.08, 0.3, mat('#8aa06a', { rough: 0.3, metal: 0.3 }), 1, 0.3, 0.2);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 4), mat('#7a905a', { rough: 0.3, metal: 0.3 }));
    tail.position.set(0.32, 0, 0.08);
    tail.rotation.z = Math.PI / 2;
    fish.add(tail);
    signAt(fish, ['THE ONE THAT GOT AWAY', { t: '(bought later)', italic: true, s: 0.85 }], 0.42, 0.1, 0, -0.25, 0.035, SIGN.brass);
    windowAt(12.7, -21, 'S', 1.3, 1.05, 2.8, M.tartanCurtain, M.walnut, M.walnut);
    painting('grandpa', 15.0, 2.25, -13.82, 'N', 0.85, 1.05, ['GRANDPA', { t: 'at peace at last', italic: true, s: 0.8 }]);
    const gs = grp(8.32, 0, -16.65, 'E');
    signAt(gs, ['GONE FISHING.', { t: 'Indefinitely.', italic: true, s: 0.85 }], 0.5, 0.2, 0, 2.95, 0, SIGN.wood);
    // Golf clubs and a fishing rod in the corner.
    const gb = grp(8.8, 0, -14.4);
    cyl(gb, 0, 0, 0, 0.13, 0.15, 0.85, mat('#3a4a2a', { rough: 0.8 }), 10);
    for (let i = 0; i < 4; i++) { const c = cyl(gb, (i - 1.5) * 0.05, 0.85, (i % 2) * 0.04, 0.008, 0.008, 0.25, M.silver, 4); c.rotation.z = (i - 1.5) * 0.12; ball(gb, (i - 1.5) * 0.08, 1.12, (i % 2) * 0.04, 0.04, i % 2 ? M.walnut : M.silver, 1.4, 0.7, 1); }
    const rod = cyl(v.group, 8.5, 0, -14.9, 0.012, 0.006, 2.6, M.oak, 5);
    rod.rotation.z = -0.12;
    rug(12.6, -17.0, 4.2, 3.0, persian('studyRug', { field: '#7a1a1c', border: '#1c2a22', ground: '#140c08', accent: '#c9a24a', light: '#e8d8b0' }, 448, 320));
    pedestalAt(byLabel('Pedestal study'));
  }

  // ═════════════════════════════ The billiard room ═════════════════════════════
  {
    const t = byLabel('Billiard table');
    const tx = (t.min.x + t.max.x) / 2, tz = (t.min.z + t.max.z) / 2;
    const g = grp(tx, 0, tz, 'S', true);
    const tl = (t.max.x - t.min.x) / 2, tw = (t.max.z - t.min.z) / 2;
    bx(g, -tl, 0.62, -tw, tl, 0.8, tw, M.mahogany);
    bx(g, -tl + 0.12, 0.8, -tw + 0.12, tl - 0.12, 0.81, tw - 0.12, M.baize);
    for (const s of [-1, 1]) { bx(g, -tl, 0.8, s * tw - (s > 0 ? 0.12 : -0.12), tl, 0.85, s * tw, M.mahogany); bx(g, s * tl - (s > 0 ? 0.12 : -0.12), 0.8, -tw, s * tl, 0.85, tw, M.mahogany); }
    for (const x of [-tl + 0.12, 0, tl - 0.12]) for (const s of [-1, 1]) cyl(g, x, 0.8, s * (tw - 0.12), 0.06, 0.06, 0.06, M.black, 10);
    for (const x of [-tl + 0.25, -0.4, 0.4, tl - 0.25]) for (const s of [-1, 1]) { cyl(g, x, 0, s * (tw - 0.25), 0.08, 0.1, 0.62, M.mahogany, 10); ball(g, x, 0.36, s * (tw - 0.25), 0.12, M.mahogany, 1, 1, 1, 10); }
    const cols = ['#f4f0e0', '#d82a1a', '#d82a1a', '#d82a1a', '#d82a1a', '#1a1a1a', '#e0c020', '#2a6a2a', '#7a4a2a', '#2a4ad0', '#e07ab0'];
    cols.forEach((c, i) => ball(g, -0.9 + ((i * 37) % 17) * 0.11, 0.84, -0.4 + ((i * 23) % 9) * 0.1, 0.028, mat(c, { rough: 0.2 }), 1, 1, 1, 10));
    const cue = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.016, 1.45, 6), M.oak);
    cue.position.set(0.3, 0.84, 0.2);
    cue.rotation.z = Math.PI / 2;
    cue.rotation.y = 0.3;
    g.add(cue);
    // The lamp over the table.
    const lamp = grp(tx, HT.billiard, tz);
    for (const s of [-1, 1]) cyl(lamp, s * 0.9, -0.75, 0, 0.006, 0.006, 0.75, M.brass, 4);
    bx(lamp, -1.1, -0.95, -0.25, 1.1, -0.75, 0.25, glow.greenShade);
    for (const x of [-0.7, 0, 0.7]) ball(lamp, x, -0.98, 0, 0.06, glow.bulb);
    // The bar, the cue rack, the scoreboard, Reynard in his case, the rules.
    const br = byLabel('Bar cabinet');
    const bg = grp((br.min.x + br.max.x) / 2, 0, br.max.z, 'S', true);
    const bw = (br.max.x - br.min.x) / 2, bd = br.max.z - br.min.z;
    bx(bg, -bw, 0, -bd, bw, 1.05, 0, M.mahogany);
    bx(bg, -bw - 0.02, 1.05, -bd, bw + 0.02, 1.1, 0.03, M.brass);
    for (let i = 0; i < 3; i++) bx(bg, -bw + 0.1 + i * ((2 * bw - 0.2) / 3), 0.1, 0, -bw + 0.05 + (i + 1) * ((2 * bw - 0.2) / 3), 0.95, 0.01, panelMat('#5a2a18'));
    for (const [x, c] of [[-0.7, '#8a4a10'], [-0.45, '#c8a040'], [-0.2, '#3a1a08']] as const) { cyl(bg, x, 1.1, -0.3, 0.06, 0.06, 0.2, M.glass, 10); cyl(bg, x, 1.11, -0.3, 0.055, 0.055, 0.12, mat(c, { rough: 0.2 }), 10); ball(bg, x, 1.34, -0.3, 0.03, M.glass); }
    const box = grp(19.3, 1.1, -13.2, 'S');
    bx(box, -0.45, 0, -0.25, 0.45, 0.06, 0.25, M.mahogany);
    ball(box, 0, 0.2, 0, 0.1, mat('#b8582a'), 2, 0.9, 0.9);
    ball(box, 0.24, 0.26, 0, 0.07, mat('#b8582a'), 1.2, 1, 1);
    ball(box, 0.32, 0.26, 0, 0.025, M.black);
    for (const [lx, lz] of [[-0.1, 0.05], [0.1, 0.05], [-0.1, -0.05], [0.1, -0.05]]) cyl(box, lx, 0.06, lz, 0.02, 0.02, 0.1, mat('#b8582a'), 5);
    ball(box, -0.3, 0.17, 0, 0.05, mat('#f0e8e0'), 2.5, 0.8, 0.8);
    bx(box, -0.45, 0.06, -0.25, 0.45, 0.55, 0.25, M.glass);
    signAt(box, ['REYNARD', { t: 'died peacefully in his sleep', italic: true, s: 0.8 }], 0.4, 0.09, 0, 0.03, 0.255, SIGN.brass);
    const rack = grp(20.3, 0, -9.9, 'W');
    bx(rack, -0.4, 0.75, 0, 0.4, 0.85, 0.08, M.mahogany);
    bx(rack, -0.4, 1.65, 0, 0.4, 1.75, 0.08, M.mahogany);
    for (let i = 0; i < 6; i++) cyl(rack, -0.3 + i * 0.12, 0.6, 0.05, 0.012, 0.008, 1.35, M.oak, 6);
    customSign(v.group, 360, 160, (gg, x, y, w, h) => {
      gg.fillStyle = '#1e1a16'; gg.fillRect(x, y, w, h);
      gg.strokeStyle = '#6a4a2a'; gg.lineWidth = 10; gg.strokeRect(x + 5, y + 5, w - 10, h - 10);
      gg.fillStyle = '#efeadb'; gg.textAlign = 'center'; gg.textBaseline = 'middle';
      gg.font = `bold 36px ${SERIF}`; gg.fillText('NANA   147', x + w / 2, y + 55);
      gg.fillText('GRANDPA   0', x + w / 2, y + 105);
      gg.font = `italic 18px ${SERIF}`; gg.fillText('(every game since 1961)', x + w / 2, y + 138);
    }, 0.8, 0.36, 16.0, 1.85, -13.48);
    signAt(v.group, [{ t: 'BILLIARD ROOM RULES', bold: true }, 'No jump shots', 'No shoving', { t: 'No witnesses', c: '#8a1414' }], 0.55, 0.5, 8.32, 1.75, -12.3, SIGN.card, Math.PI / 2);
    // Card table with a game of patience, club chairs, windows.
    const ct = byLabel('Card table');
    const cg = grp((ct.min.x + ct.max.x) / 2, 0, (ct.min.z + ct.max.z) / 2, 'S', true);
    bx(cg, -0.5, 0.69, -0.5, 0.5, 0.75, 0.5, M.mahogany);
    bx(cg, -0.44, 0.75, -0.44, 0.44, 0.752, 0.44, M.baize);
    for (const [lx, lz] of [[-0.44, -0.44], [0.44, -0.44], [-0.44, 0.44], [0.44, 0.44]]) bx(cg, lx - 0.03, 0, lz - 0.03, lx + 0.03, 0.69, lz + 0.03, M.mahogany);
    for (let i = 0; i < 7; i++) for (let k = 0; k <= i % 3; k++) bx(cg, -0.36 + i * 0.11, 0.753 + k * 0.002, -0.2 + k * 0.05, -0.29 + i * 0.11, 0.756 + k * 0.002, -0.1 + k * 0.05, k === (i % 3) ? M.linen : mat('#8a1a2a'));
    chair(10.7, -11.0, 'N', M.mahogany, M.leather, 0.95);
    armchair(9.0, -7.15, 'E', M.leather, 0.8);
    armchair(9.0, -12.85, 'E', M.leather, 0.8);
    for (const z of [-11.6, -8.1]) windowAt(20.3, z, 'W', 1.1, 1.0, 2.7, M.greenCurtain, M.darkWood, M.darkWood);
    rug(14.6, -9.9, 5.0, 3.2, persian('billiardRug', { field: '#6a1a1a', border: '#c9a24a', ground: '#1a120a', accent: '#1f4a32', light: '#e8d8b0' }, 448, 288));
    painting('dobbin', 8.32, 2.2, -8.0, 'E', 0.7, 0.55);
    pedestalAt(byLabel('Pedestal billiard room'));
  }

  // ═════════════════════════════ The kitchen, pantry and scullery ═════════════════════════════
  {
    const c = byLabel('Kitchen counter');
    const { min: a, max: b } = c;
    const green = mat('#4f6e52', { rough: 0.6 });
    v.add(boxMesh(a.x, a.y, a.z + 0.04, b.x, b.y - 0.06, b.z, green), true);
    v.add(boxMesh(a.x - 0.02, b.y - 0.06, a.z, b.x + 0.02, b.y, b.z + 0.03, mat('#d8d2c4', { rough: 0.3 })));
    for (let x = a.x + 0.6; x < b.x - 0.3; x += 1.1) {
      v.add(boxMesh(x - 0.45, 0.12, b.z, x + 0.45, b.y - 0.16, b.z + 0.02, mat('#5d7a5a', { rough: 0.6 })));
      v.add(boxMesh(x + 0.3, 0.6, b.z + 0.02, x + 0.36, 0.66, b.z + 0.05, M.brass));
    }
    // The range, copper pans, a splashback of tiles.
    v.add(boxMesh(13.1, b.y, a.z + 0.1, 14.3, b.y + 0.06, b.z - 0.1, M.iron));
    for (const x of [13.4, 14.0]) cyl(v.group, x, b.y + 0.06, (a.z + b.z) / 2, 0.12, 0.12, 0.02, M.black, 12);
    teapot(v.group, 13.4, b.y + 0.08, (a.z + b.z) / 2, mat('#2a4a6a', { rough: 0.3 }));
    v.add(boxMesh(9.2, 1.9, -5.98, 15.2, 1.94, -5.9, M.brass));
    for (let i = 0; i < 7; i++) {
      const x = 9.6 + i * 0.85;
      cyl(v.group, x, 1.6, -5.86, 0.008, 0.008, 0.3, M.copper, 4);
      const pan = cyl(v.group, x, 1.35, -5.8, 0.12 + (i % 3) * 0.03, 0.12 + (i % 3) * 0.03, 0.08, M.copper, 14);
      pan.rotation.x = Math.PI / 2;
    }
    // The dresser with blue-and-white plates.
    const d = byLabel('Kitchen dresser');
    const dg = grp((d.min.x + d.max.x) / 2, 0, d.min.z, 'N', true);
    const dw = (d.max.x - d.min.x) / 2;
    bx(dg, -dw, 0, 0, dw, 0.9, 0.5, mat('#6a8a9a', { rough: 0.6 }));
    bx(dg, -dw - 0.03, 0.9, -0.03, dw + 0.03, 0.95, 0.53, M.oak);
    bx(dg, -dw, 0.95, 0.3, dw, 2.1, 0.5, mat('#6a8a9a', { rough: 0.6 }));
    for (const y of [1.3, 1.7]) {
      bx(dg, -dw, y - 0.02, 0.1, dw, y, 0.3, M.oak);
      for (let i = 0; i < 7; i++) { const p = cyl(dg, -dw + 0.25 + i * ((2 * dw - 0.5) / 6), y + 0.15, 0.27, 0.14, 0.14, 0.015, i % 2 ? M.blueChina : M.china, 14); p.rotation.x = Math.PI / 2 - 0.2; }
    }
    for (let i = 0; i < 6; i++) teacup(dg, -dw + 0.3 + i * 0.45, 0.95, 0.2, M.blueChina);
    windowAt(12.2, 6, 'N', 1.0, 1.1, 2.4, mat('#e8d8a0', { rough: 0.95, map: folds() }), M.cream, M.cream);
    // The kitchen table and its lamp.
    const kt = byLabel('Kitchen table');
    const kg = grp((kt.min.x + kt.max.x) / 2, 0, (kt.min.z + kt.max.z) / 2, 'S', true);
    const kl = (kt.max.x - kt.min.x) / 2, kw = (kt.max.z - kt.min.z) / 2;
    bx(kg, -kl, 0.74, -kw, kl, 0.8, kw, mat('#c8a070', { rough: 0.7 }));
    for (const [lx, lz] of [[-kl + 0.1, -kw + 0.1], [kl - 0.1, -kw + 0.1], [-kl + 0.1, kw - 0.1], [kl - 0.1, kw - 0.1]]) bx(kg, lx - 0.05, 0, lz - 0.05, lx + 0.05, 0.74, lz + 0.05, mat('#8a6040', { rough: 0.7 }));
    bx(kg, -kl + 0.1, 0.801, -0.25, kl - 0.1, 0.803, 0.25, mat('#e8e0f0', { rough: 1 }));
    teapot(kg, 0.4, 0.8, 0, mat('#c84a3a', { rough: 0.3 }));
    const kl2 = grp(12, KITCHEN_HEIGHT, 0);
    cyl(kl2, 0, -0.35, 0, 0.006, 0.006, 0.35, M.iron, 4);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.3, 16, 1, true), mat('#2f4a3a', { rough: 0.6 }));
    shade.position.y = -0.45;
    kl2.add(shade);
    ball(kl2, 0, -0.58, 0, 0.09, glow.bulb);
    // A chalkboard menu and the calendar, with the date circled.
    signAt(v.group, [{ t: "TODAY'S MENU", bold: true }, 'Tea', 'More tea', { t: 'The Will', c: '#ffd860' }], 0.7, 0.6, 8.32, 1.6, 3.9, SIGN.chalk, Math.PI / 2);
    customSign(v.group, 280, 340, (gg, x, y, w, h) => {
      gg.fillStyle = '#f6f2e8'; gg.fillRect(x, y, w, h);
      gg.fillStyle = '#7a1a1a'; gg.fillRect(x, y, w, 70);
      gg.fillStyle = '#ffffff'; gg.textAlign = 'center'; gg.textBaseline = 'middle';
      gg.font = `bold 34px ${SERIF}`; gg.fillText('NOVEMBER', x + w / 2, y + 36);
      gg.fillStyle = '#2a2a2a'; gg.font = `15px ${SERIF}`;
      for (let d2 = 1; d2 <= 30; d2++) { const c2 = (d2 + 2) % 7, r2 = Math.floor((d2 + 2) / 7); gg.fillText(String(d2), x + 22 + c2 * 39, y + 98 + r2 * 44); }
      const c3 = (26 + 2) % 7, r3 = Math.floor((26 + 2) / 7);
      gg.strokeStyle = '#c01818'; gg.lineWidth = 4; gg.beginPath(); gg.ellipse(x + 22 + c3 * 39, y + 98 + r3 * 44, 19, 16, 0, 0, Math.PI * 2); gg.stroke();
      gg.fillStyle = '#c01818'; gg.font = `bold italic 22px ${SERIF}`; gg.fillText('WILL READING!!', x + w / 2 - 20, y + h - 22);
    }, 0.42, 0.52, 8.32, 1.55, -3.4, 0, Math.PI / 2);
    // Pantry shelves with jars.
    const shelf = mat('#8a6a48');
    for (const y of [0.6, 1.2, 1.8]) {
      v.add(boxMesh(15.55, y - 0.03, 3.3, 15.98, y, 5.95, shelf));
      for (let i = 0; i < 5; i++) {
        const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 10), mat(['#c86a3a', '#e0c060', '#7a9a4a', '#a04a6a', '#d8d0c0'][(i + y * 10) % 5], { rough: 0.4 }));
        jar.position.set(15.75, y + 0.11, 3.6 + i * 0.5);
        v.add(jar);
      }
    }
    ball(v.group, 14.5, 2.75, 4.5, 0.06, glow.bulb);
  }
  {
    // The scullery: sink, mangle, copper, dumbwaiter, the washing, the bells, the cat's things.
    const sk = byLabel('Belfast sink');
    const sg = grp(sk.min.x, 0, (sk.min.z + sk.max.z) / 2, 'W', true);
    const sl = (sk.max.z - sk.min.z) / 2;
    bx(sg, -sl + 0.6, 0.55, 0, sl, 0.9, 0.7, M.china);
    bx(sg, -sl + 0.7, 0.75, 0.05, sl - 0.1, 0.9, 0.6, mat('#c8ccc8', { rough: 0.3 }));
    for (const x of [-sl + 0.65, sl - 0.05]) bx(sg, x - 0.05, 0, 0.1, x + 0.05, 0.55, 0.6, mat('#9a4a2a', { rough: 0.9 }));
    bx(sg, -sl, 0.86, 0, -sl + 0.6, 0.9, 0.7, M.oak);
    for (const s of [-0.15, 0.15]) { cyl(sg, s + 0.3, 0.9, 0.65, 0.015, 0.015, 0.3, M.brass, 6); ball(sg, s + 0.3, 1.22, 0.62, 0.035, M.brass); }
    windowAt(20.3, -0.9, 'W', 0.9, 1.25, 2.4, undefined, M.cream, M.cream);
    const mg = byLabel('Mangle');
    const mm = grp(mg.min.x, 0, (mg.min.z + mg.max.z) / 2, 'W', true);
    for (const s of [-1, 1]) bx(mm, s * 0.42 - 0.04, 0, 0.1, s * 0.42 + 0.04, 1.2, 0.7, M.iron);
    for (const y of [0.85, 1.0]) cyl(mm, 0, y, 0.4, 0.07, 0.07, 0.8, mat('#d8cfb8'), 10).rotation.z = Math.PI / 2;
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 18), M.iron);
    wheel.position.set(0.5, 0.95, 0.4);
    wheel.rotation.y = Math.PI / 2;
    mm.add(wheel);
    const cp = byLabel('Copper');
    const cpg = grp((cp.min.x + cp.max.x) / 2, 0, (cp.min.z + cp.max.z) / 2, 'S', true);
    bx(cpg, -0.45, 0, -0.5, 0.45, 0.7, 0.5, mat('#8a4a32', { rough: 0.9 }));
    cyl(cpg, 0, 0.7, 0, 0.36, 0.38, 0.28, M.copper, 16);
    cyl(cpg, 0, 0.98, 0, 0.36, 0.36, 0.03, M.oak, 16);
    bx(cpg, -0.15, 0.15, 0.5, 0.15, 0.4, 0.51, M.iron);
    const dw = byLabel('Dumbwaiter');
    const dg = grp((dw.min.x + dw.max.x) / 2, 0, dw.min.z, 'N', true);
    bx(dg, -0.55, 0, 0, 0.55, 0.9, 0.5, M.oak);
    bx(dg, -0.6, 0.9, 0.0, 0.6, 1.95, 0.02, M.oak);
    bx(dg, -0.48, 0.95, 0.02, 0.48, 1.85, 0.03, M.soot);
    bx(dg, -0.45, 0.95, 0.03, 0.45, 1.0, 0.5, M.walnut);
    cyl(dg, 0.52, 0.9, 0.05, 0.01, 0.01, 1.05, mat('#c8b890', { rough: 1 }), 4);
    signAt(dg, [{ t: 'DUMBWAITER', bold: true }, { t: 'NOT FOR COUSINS', c: '#8a1414' }], 0.6, 0.2, 0, 2.12, 0.02, SIGN.enamel);
    // The washing line: Grandpa's long johns, socks, a nightie.
    v.add(boxMesh(16.4, 2.38, -1.52, 20.2, 2.39, -1.5, mat('#e8e0d0', { rough: 1 })));
    const flannel = mat('#e8d0c0', { rough: 1 });
    const wg = grp(17.4, 2.38, -1.51, 'S');
    bx(wg, -0.3, -0.5, -0.02, 0.3, 0, 0.02, flannel);
    for (const s of [-1, 1]) bx(wg, s * 0.15 - 0.12, -1.2, -0.02, s * 0.15 + 0.12, -0.5, 0.02, flannel);
    for (let i = 0; i < 3; i++) bx(wg, -0.05 - 0.02 + i * 0.05, -0.2, 0.02, -0.05 + 0.02 + i * 0.05, -0.19, 0.03, M.white);
    for (const [x, c] of [[18.4, '#7a2a2a'], [18.65, '#2a3a6a']] as const) bx(v.group, x - 0.06, 2.0, -1.53, x + 0.06, 2.38, -1.49, mat(c, { rough: 1 }));
    bx(v.group, 19.0, 1.4, -1.53, 19.7, 2.38, -1.49, mat('#f0e0e8', { rough: 1 }));
    // The bell board.
    const bb = grp(16.32, 0, 0.5, 'E');
    bx(bb, -0.9, 1.8, 0, 0.9, 2.6, 0.04, M.walnut);
    signAt(bb, [{ t: "SERVANTS' BELLS", bold: true }], 1.0, 0.14, 0, 2.48, 0.045, SIGN.brass);
    const bells = ['DRAWING RM', 'LIBRARY', 'DINING RM', 'STUDY', 'BILLIARDS', 'NANA', 'NANA', 'NANA'];
    bells.forEach((name, i) => {
      const x = -0.78 + i * 0.22;
      const bell = ball(bb, x, 2.15, 0.1, 0.06, M.brass, 1, 1.1, 1, 10);
      if (i === 7) bell.rotation.z = 0.6;
      signAt(bb, [name], 0.2, 0.06, x, 1.95, 0.045, SIGN.enamel);
    });
    // Mittens' basket, bowl, and instructions.
    const cb = grp(17.0, 0, -0.6);
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.34, 0.22, 16, 1, true), mat('#a8804a', { rough: 1 }));
    basket.position.y = 0.11;
    basket.material.side = THREE.DoubleSide;
    cb.add(basket);
    cyl(cb, 0, 0.0, 0, 0.36, 0.36, 0.1, mat('#8a2a3a', { rough: 1 }), 16);
    cyl(cb, 0.1, 0, 0.62, 0.11, 0.09, 0.06, M.china, 12);
    signAt(v.group, ['MITTENS'], 0.18, 0.05, 17.1, 0.03, 0.02, SIGN.card, -0.4, -1.1);
    signAt(v.group, [{ t: 'DO NOT RESUSCITATE', bold: true }, { t: 'THE CAT', bold: true }, { t: '— by order, Nana', italic: true, s: 0.7 }], 0.5, 0.34, 16.32, 1.3, -0.6, SIGN.note, Math.PI / 2);
    // Wellies, a mop and bucket.
    for (const z of [-5.4, -5.1]) { bx(v.group, 19.6, 0, z - 0.06, 19.9, 0.08, z + 0.06, mat('#2a4a2a')); bx(v.group, 19.62, 0.08, z - 0.06, 19.74, 0.42, z + 0.06, mat('#2a4a2a')); }
    cyl(v.group, 17.0, 0, -5.4, 0.16, 0.19, 0.3, mat('#8a9a9a', { metal: 0.6, rough: 0.4 }), 12);
    const mop = cyl(v.group, 17.1, 0.1, -5.4, 0.015, 0.015, 1.4, M.oak, 5);
    mop.rotation.z = 0.15;
    ball(v.group, 16.9, 0.25, -5.4, 0.14, mat('#d8d0b8', { rough: 1 }), 1, 1.4, 1);
    ball(v.group, 18.2, 2.75, 0.0, 0.06, glow.bulb);
    cyl(v.group, 18.2, 2.81, 0.0, 0.005, 0.005, HT.scullery - 2.81, M.black, 4);
  }

  // ───────── Finish ─────────
  signs.tex.needsUpdate = true;
  portraitsAtlas.tex.needsUpdate = true;
  let meshes = 0;
  v.group.traverse((o) => { if (o instanceof THREE.Mesh) meshes++; });
  v.group.userData.preMergeMeshes = meshes;
  v.group.userData.pointLights = v.lights.length;

  const view = v.finish({
    windows,
    idle: { center: { x: -0.5, y: 2.9, z: 1.8 }, rx: 5.2, rz: 2.6, look: { x: -1.5, y: 2.3, z: -6 } },
    background: '#120d0a',
    lightningFrom: { x: -45, y: 16, z: -8 },
  });

  // Live pieces (kept out of the baked meshes): the clock's pendulum.
  const pendulum = new THREE.Group();
  if (pendulumAt) {
    pendulum.position.set(pendulumAt.x, pendulumAt.y, pendulumAt.z);
    const rodM = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.62, 0.02), M.brass);
    rodM.position.y = -0.31;
    pendulum.add(rodM);
    const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.015, 16), M.brass);
    bob.rotation.z = Math.PI / 2;
    bob.position.y = -0.62;
    pendulum.add(bob);
    view.group.add(pendulum);
  }
  // The fires' lights flicker around whatever the scene set them to this frame (it does not always reset them).
  const fireLights = [L.drawingFire, L.libraryFire].map((l) => ({ l, raw: l.intensity, set: -1 }));
  const rainMap = windows.emissiveMap as THREE.Texture;
  view.tick = (t, dt, sky) => {
    const stormy = sky.dark || sky.flash;
    // The power is out in the Storm: lamps and chandeliers go down to a glimmer; the fires keep burning.
    for (const [m, base] of GLOW_BASE) m.emissiveIntensity = base * (sky.dark ? 0.06 : 1);
    const flick = 1 + 0.18 * Math.sin(t * 7.3) + 0.12 * Math.sin(t * 13.1 + 1.3) + 0.06 * Math.sin(t * 23.7);
    fireMat.emissiveIntensity = 1.5 * flick;
    embers.emissiveIntensity = 1.1 * flick;
    for (const f of fireLights) {
      if (f.l.intensity !== f.set) f.raw = f.l.intensity;
      f.set = f.raw * flick;
      f.l.intensity = f.set;
    }
    if (stormy) rainMap.offset.y += dt * 0.45;
    pendulum.rotation.x = 0.16 * Math.sin(t * Math.PI);
  };
  return view;
}
