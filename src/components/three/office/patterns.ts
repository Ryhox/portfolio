import * as THREE from 'three';

/**
 * The office's printed surfaces, drawn once on canvases: a Victorian damask for the walls and a
 * Persian rug for the floor. Each is laid over a photographed surface (the stained paper, the
 * carpet's weave) so it reads as a real, worn thing rather than a clean graphic.
 *
 * They are made while the page is already up and may be scrolling, so the pixel work (a million
 * and more pixels each) is done a strip at a time, with a `rest` between strips that hands the
 * frame back to the browser whenever a few milliseconds have gone.
 */

type Drawable = CanvasImageSource & { width: number; height: number };
type Rest = () => Promise<void>;

/** A canvas whose pixels are read back: kept in memory, not on the GPU, so reading them is no wait. */
const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!] as const;
};

const texture = (c: HTMLCanvasElement, repeat = true) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
};

/** Multiply a canvas by the luminance of a photo (normalised round 1), for grime and weave. */
async function grain(g: CanvasRenderingContext2D, photo: Drawable, w: number, h: number, strength: number, rest: Rest, tiles = 1) {
  const [, p] = canvas(w, h);
  for (let y = 0; y < tiles; y++) for (let x = 0; x < tiles; x++) p.drawImage(photo, (x * w) / tiles, (y * h) / tiles, w / tiles, h / tiles);
  await rest();
  const src = p.getImageData(0, 0, w, h).data;
  await rest();
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  await rest();
  let mean = 0;
  for (let i = 0; i < src.length; i += 16) mean += src[i] * 0.3 + src[i + 1] * 0.59 + src[i + 2] * 0.11;
  mean /= src.length / 16;
  await rest();
  // a strip of rows at a time
  const strip = w * 4 * 48;
  for (let from = 0; from < d.length; from += strip) {
    const to = Math.min(d.length, from + strip);
    for (let i = from; i < to; i += 4) {
      const l = (src[i] * 0.3 + src[i + 1] * 0.59 + src[i + 2] * 0.11) / mean;
      const k = 1 + (l - 1) * strength;
      d[i] = Math.min(255, d[i] * k);
      d[i + 1] = Math.min(255, d[i + 1] * k);
      d[i + 2] = Math.min(255, d[i + 2] * k);
    }
    await rest();
  }
  g.putImageData(img, 0, 0);
  await rest();
}

/** One half of a damask ornament, drawn about x = 0 (it is mirrored for the other half). */
function damaskHalf(g: CanvasRenderingContext2D, s: number) {
  g.beginPath();
  // the central flame
  g.moveTo(0, -0.46 * s);
  g.bezierCurveTo(0.1 * s, -0.34 * s, 0.2 * s, -0.2 * s, 0.13 * s, -0.04 * s);
  g.bezierCurveTo(0.08 * s, 0.06 * s, 0.16 * s, 0.14 * s, 0.1 * s, 0.26 * s);
  g.bezierCurveTo(0.06 * s, 0.34 * s, 0.03 * s, 0.4 * s, 0, 0.47 * s);
  g.lineTo(0, -0.46 * s);
  g.fill();
  // the side leaves, curling out and back
  g.beginPath();
  g.moveTo(0.1 * s, 0.02 * s);
  g.bezierCurveTo(0.3 * s, -0.08 * s, 0.42 * s, 0.04 * s, 0.38 * s, 0.18 * s);
  g.bezierCurveTo(0.34 * s, 0.3 * s, 0.22 * s, 0.28 * s, 0.24 * s, 0.2 * s);
  g.bezierCurveTo(0.27 * s, 0.12 * s, 0.33 * s, 0.14 * s, 0.3 * s, 0.08 * s);
  g.bezierCurveTo(0.24 * s, 0.02 * s, 0.16 * s, 0.1 * s, 0.1 * s, 0.1 * s);
  g.fill();
  g.beginPath();
  g.moveTo(0.08 * s, -0.22 * s);
  g.bezierCurveTo(0.24 * s, -0.36 * s, 0.4 * s, -0.3 * s, 0.36 * s, -0.16 * s);
  g.bezierCurveTo(0.32 * s, -0.06 * s, 0.22 * s, -0.1 * s, 0.25 * s, -0.16 * s);
  g.bezierCurveTo(0.28 * s, -0.22 * s, 0.2 * s, -0.26 * s, 0.1 * s, -0.16 * s);
  g.fill();
  // a bud at the tip
  g.beginPath();
  g.ellipse(0.4 * s, 0.24 * s, 0.035 * s, 0.05 * s, 0.4, 0, Math.PI * 2);
  g.fill();
}

function damask(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.save();
  g.translate(x, y);
  damaskHalf(g, s);
  g.scale(-1, 1);
  damaskHalf(g, s);
  g.restore();
}

/**
 * The wallpaper: dark green damask, the motifs in a half-drop repeat, a faint gilt line between
 * the stripes, all under the water stains and wear of the photographed paper.
 */
export async function damaskWallpaper(stains: Drawable, rest: Rest) {
  const N = 1024;
  const [c, g] = canvas(N, N);
  g.fillStyle = '#304a3d';
  g.fillRect(0, 0, N, N);
  // four columns of motifs, every other one dropped by half
  const cols = 4;
  const cw = N / cols;
  for (let i = 0; i < cols; i++) {
    for (let j = -1; j <= cols; j++) {
      const x = cw * (i + 0.5);
      const y = cw * (j + 0.5 + (i % 2) * 0.5);
      g.fillStyle = '#466652';
      damask(g, x, y, cw * 0.92);
      g.fillStyle = 'rgba(120, 104, 60, 0.18)';
      damask(g, x, y + 2, cw * 0.92);
    }
    // a thin gilt rule between the columns
    g.fillStyle = 'rgba(150, 124, 70, 0.22)';
    g.fillRect(Math.round(cw * i) - 1, 0, 2, N);
    await rest();
  }
  await grain(g, stains, N, N, 0.9, rest);
  return texture(c);
}

/**
 * The rug: a crimson field with a lobed navy medallion and corner pieces, a wide border of rosettes
 * between ivory guard stripes, and a short fringe at the ends (alpha, for alphaTest). The weave
 * comes from the photographed carpet.
 */
export async function persianRug(weave: Drawable, rest: Rest) {
  const W = 1024;
  const H = 1536;
  const FR = 40; // fringe
  const [c, g] = canvas(W, H);
  const ivory = '#d8c7a0';
  const navy = '#1b2440';
  const crimson = '#6e1a17';
  const gold = '#b98b3c';
  const rust = '#9b4a22';

  // fringe
  g.clearRect(0, 0, W, H);
  g.strokeStyle = '#cdbb94';
  g.lineWidth = 3;
  for (let x = 24; x < W - 20; x += 7) {
    const wob = (Math.sin(x * 0.37) + Math.sin(x * 0.13)) * 3;
    g.beginPath();
    g.moveTo(x, FR);
    g.lineTo(x + wob, 4 + Math.abs(Math.sin(x)) * 8);
    g.moveTo(x, H - FR);
    g.lineTo(x - wob, H - 4 - Math.abs(Math.cos(x)) * 8);
    g.stroke();
  }

  const top = FR;
  const bottom = H - FR;
  const h = bottom - top;
  const rect = (inset: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(inset, top + inset, W - inset * 2, h - inset * 2);
  };
  rect(0, navy);
  rect(14, ivory);
  rect(22, navy);
  // the main border: rosettes on navy
  const B = 110;
  rect(B, ivory);
  rect(B + 8, gold);
  rect(B + 14, crimson);
  const rosette = (x: number, y: number, r: number, petals: number, a: string, b: string) => {
    g.fillStyle = a;
    for (let k = 0; k < petals; k++) {
      const t = (k / petals) * Math.PI * 2;
      g.beginPath();
      g.ellipse(x + Math.cos(t) * r * 0.55, y + Math.sin(t) * r * 0.55, r * 0.42, r * 0.2, t, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = b;
    g.beginPath();
    g.arc(x, y, r * 0.28, 0, Math.PI * 2);
    g.fill();
  };
  const band = (22 + B) / 2;
  for (let x = band; x < W - band / 2; x += 88) {
    rosette(x, top + band, 26, 8, rust, ivory);
    rosette(x, bottom - band, 26, 8, rust, ivory);
  }
  for (let y = top + band + 88; y < bottom - band; y += 88) {
    rosette(band, y, 26, 8, rust, ivory);
    rosette(W - band, y, 26, 8, rust, ivory);
  }
  await rest();
  // the field: a small lattice of flowers on crimson
  const fx0 = B + 14;
  const fy0 = top + B + 14;
  const fw = W - (B + 14) * 2;
  const fh = h - (B + 14) * 2;
  g.save();
  g.beginPath();
  g.rect(fx0, fy0, fw, fh);
  g.clip();
  g.strokeStyle = 'rgba(185, 139, 60, 0.35)';
  g.lineWidth = 2;
  for (let d = -fh; d < fw + fh; d += 64) {
    g.beginPath();
    g.moveTo(fx0 + d, fy0);
    g.lineTo(fx0 + d + fh, fy0 + fh);
    g.moveTo(fx0 + d + fh, fy0);
    g.lineTo(fx0 + d, fy0 + fh);
    g.stroke();
  }
  for (let y = fy0 + 32; y < fy0 + fh; y += 64) for (let x = fx0 + 32; x < fx0 + fw; x += 64) rosette(x, y, 9, 6, 'rgba(216, 199, 160, 0.55)', navy);
  // (the clip is kept across the rest: the canvas is this function's own)
  await rest();
  // corner pieces: quarter medallions
  const corner = (cx: number, cy: number) => {
    for (const [r, col] of [
      [230, ivory],
      [218, navy],
      [150, gold],
      [140, navy],
    ] as const) {
      g.fillStyle = col;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
    }
  };
  corner(fx0, fy0);
  corner(fx0 + fw, fy0);
  corner(fx0, fy0 + fh);
  corner(fx0 + fw, fy0 + fh);
  g.restore();
  // the medallion: a lobed diamond, in rings
  const mx = W / 2;
  const my = top + h / 2;
  const lobed = (rx: number, ry: number, col: string) => {
    g.fillStyle = col;
    g.beginPath();
    const n = 16;
    for (let k = 0; k <= n * 8; k++) {
      const t = (k / (n * 8)) * Math.PI * 2;
      const dia = 1 / (Math.abs(Math.cos(t)) + Math.abs(Math.sin(t))); // a diamond
      const lobe = 1 + 0.07 * Math.cos(t * n);
      const x = mx + Math.cos(t) * rx * dia * lobe;
      const y = my + Math.sin(t) * ry * dia * lobe;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.fill();
  };
  lobed(330, 480, ivory);
  lobed(312, 458, navy);
  lobed(230, 340, gold);
  lobed(218, 326, crimson);
  lobed(140, 210, navy);
  rosette(mx, my, 70, 12, gold, ivory);
  rosette(mx, my, 34, 8, rust, navy);
  for (const [dx, dy] of [
    [0, -270],
    [0, 270],
    [-190, 0],
    [190, 0],
  ])
    rosette(mx + dx, my + dy, 30, 8, ivory, rust);

  // wear: the weave, and a lighter path down the middle where feet have gone
  g.save();
  g.beginPath();
  g.rect(0, top, W, h);
  g.clip();
  const wear = g.createRadialGradient(mx, my + 120, 60, mx, my + 120, 620);
  wear.addColorStop(0, 'rgba(230, 200, 160, 0.14)');
  wear.addColorStop(1, 'rgba(230, 200, 160, 0)');
  g.fillStyle = wear;
  g.fillRect(0, top, W, h);
  g.restore();
  await rest();
  await grain(g, weave, W, H, 0.75, rest, 3);
  const t = texture(c, false);
  return t;
}
