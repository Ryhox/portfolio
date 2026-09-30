import * as THREE from 'three';
import type { Record } from '@/content/records';

const INKS = ['#3b1f12', '#2c2417', '#40231a', '#1f2a24', '#35281a', '#2b1a14', '#322414'];
const ACCENTS = ['#d98b52', '#c99a58', '#e0a36a', '#7fa596', '#ecc98a', '#bb6c3d', '#d4a24c'];

function fonts() {
  const css = getComputedStyle(document.documentElement);
  return {
    display: css.getPropertyValue('--font-shoulders').trim() || 'sans-serif',
    mono: css.getPropertyValue('--font-martian').trim() || 'monospace',
  };
}

const tex = (canvas: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

/**
 * A plain sleeve for before the covers are allowed (they come from Apple, like the music):
 * letterpress type on dyed card, one colour per record.
 */
export function sleeveCanvas(r: Record, i: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const f = fonts();
  g.fillStyle = INKS[i % INKS.length];
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = ACCENTS[i % ACCENTS.length];
  g.globalAlpha = 0.5;
  g.lineWidth = 2;
  for (let k = 0; k < 9; k++) {
    g.beginPath();
    g.arc(196, 196, 24 + k * 16, Math.PI, Math.PI * 1.5);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = ACCENTS[i % ACCENTS.length];
  g.font = `800 34px ${f.display}`;
  g.textBaseline = 'top';
  const words = r.title.toUpperCase().split(' ');
  let line = '';
  let y = 22;
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > 210 && line) {
      g.fillText(line, 22, y);
      y += 32;
      line = w;
    } else line = t;
  }
  g.fillText(line, 22, y);
  g.font = `500 13px ${f.mono}`;
  g.globalAlpha = 0.75;
  g.fillText(r.artist.toUpperCase(), 22, 222);
  return c;
}

/** An album cover from Apple as a texture (CORS is allowed on their image CDN). */
export function coverTexture(url: string, onLoad: (t: THREE.Texture, img: HTMLImageElement) => void) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.onload = () => {
    const t = new THREE.Texture(img);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
    onLoad(t, img);
  };
  img.src = url;
  return img;
}

/**
 * A printed record label, for before the covers are allowed: the title set round the spindle,
 * on the record's own colour. Once Apple's artwork arrives the cover takes its place.
 */
export function labelCanvas(r: Record, i: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const f = fonts();
  const ink = INKS[i % INKS.length];
  const accent = ACCENTS[i % ACCENTS.length];
  g.fillStyle = ink;
  g.beginPath();
  g.arc(128, 128, 128, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = accent;
  g.globalAlpha = 0.55;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(128, 128, 116, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 1;
  g.beginPath();
  g.arc(128, 128, 108, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = accent;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 34;
  const title = r.title.toUpperCase();
  const words = title.split(' ');
  let lines: string[] = [];
  for (; size >= 18; size -= 2) {
    g.font = `800 ${size}px ${f.display}`;
    lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (g.measureText(t).width > 150 && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    lines.push(line);
    if (lines.length <= 3) break;
  }
  const lh = size * 0.95;
  const y0 = 80 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, k) => g.fillText(l, 128, y0 + k * lh));
  g.font = `500 13px ${f.mono}`;
  g.globalAlpha = 0.8;
  g.fillText(r.artist.toUpperCase(), 128, 176);
  g.globalAlpha = 1;
  // the spindle hole
  g.fillStyle = '#0a0705';
  g.beginPath();
  g.arc(128, 128, 9, 0, Math.PI * 2);
  g.fill();
  return c;
}

export const vinylLabel = (r: Record, i: number) => tex(labelCanvas(r, i));
