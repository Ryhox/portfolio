import * as THREE from 'three';

export type DisplayState = {
  mode: 'off' | 'standby' | 'reading' | 'play' | 'pause' | 'stop';
  title: string;
  artist: string;
  album: string;
  cover: HTMLImageElement | null;
  /** 0..1 */
  progress: number;
  position: number;
  duration: number;
  bands: Float32Array;
  /** what the pointer is over, for a highlight */
  hover: Hit | null;
  time: number;
  /** a knob being turned: its name and where it is (0..1), shown over everything a moment */
  level?: { name: string; value: number } | null;
};

export type Hit = 'prev' | 'toggle' | 'next' | 'seek';

const AMBER = '#ffb54c';
const AMBER_HI = '#ffe2b0';
const AMBER_DIM = '#a2692c';
const INK = '#120a05';

const fmt = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * The Resonance cabinet's screen, drawn on a canvas and uploaded as a texture: the album on
 * the left, title and album on the right, a progress rule and the transport under it.
 * Hit areas are kept in canvas pixels so clicks on the glass can be routed back.
 */
export class RadioDisplay {
  canvas = document.createElement('canvas');
  ctx = this.canvas.getContext('2d')!;
  texture: THREE.CanvasTexture;
  w = 1024;
  h = 542;
  hits: Record<Hit, [number, number, number, number]> = {
    prev: [0, 0, 0, 0],
    toggle: [0, 0, 0, 0],
    next: [0, 0, 0, 0],
    seek: [0, 0, 0, 0],
  };
  private fonts = { display: 'sans-serif', crt: 'monospace', mono: 'monospace' };
  private last = '';

  constructor() {
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    const css = getComputedStyle(document.documentElement);
    this.fonts.display = css.getPropertyValue('--font-shoulders').trim() || this.fonts.display;
    this.fonts.crt = css.getPropertyValue('--font-vt').trim() || this.fonts.crt;
    this.fonts.mono = css.getPropertyValue('--font-martian').trim() || this.fonts.mono;
    document.fonts?.ready.then(() => (this.last = ''));
  }

  /** Which control a texture coordinate lands on. */
  hitAt(u: number, v: number): Hit | null {
    const x = u * this.w;
    const y = (1 - v) * this.h;
    for (const [k, [hx, hy, hw, hh]] of Object.entries(this.hits) as [Hit, number[]][]) {
      if (x >= hx && x <= hx + hw && y >= hy && y <= hy + hh) return k;
    }
    return null;
  }
  seekAt(u: number) {
    const [x, , w] = this.hits.seek;
    return Math.min(1, Math.max(0, (u * this.w - x) / w));
  }

  /** Redraws when something visible changed; returns whether the texture was updated. */
  update(st: DisplayState) {
    const live = st.mode === 'play' || st.mode === 'reading';
    const key = [
      st.mode,
      st.title,
      st.cover?.complete ? st.cover.src : '',
      Math.floor(st.position * 4),
      st.hover,
      live ? Math.floor(st.time * 24) : 0,
      st.mode === 'standby' ? Math.floor(st.time * 2) : 0,
      st.level ? `${st.level.name}${Math.round(st.level.value * 100)}` : '',
    ].join('|');
    if (key === this.last) return false;
    this.last = key;
    this.draw(st);
    this.texture.needsUpdate = true;
    return true;
  }

  private draw(st: DisplayState) {
    const { ctx, w, h } = this;
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, w, h);
    if (st.mode === 'off') return;
    const glow = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, w * 0.62);
    glow.addColorStop(0, 'rgba(255,160,70,0.1)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.textBaseline = 'alphabetic';

    if (st.mode === 'standby') this.standby(st);
    else this.playing(st);
    if (st.level) this.levelBox(st.level);

    // scanlines, so it reads as the same phosphor as every other tube on the site
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1.5);
  }

  /** A knob's reading, over the rest: its name, a row of segments, and the figure. */
  private levelBox(l: { name: string; value: number }) {
    const { ctx, w, h } = this;
    const bw = w * 0.74;
    const bh = h * 0.36;
    const x = (w - bw) / 2;
    const y = (h - bh) / 2;
    ctx.fillStyle = 'rgba(18,10,5,0.94)';
    ctx.fillRect(x, y, bw, bh);
    ctx.strokeStyle = AMBER_DIM;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = AMBER;
    ctx.font = `46px ${this.fonts.crt}`;
    ctx.fillText(l.name, x + 28, y + 62);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(l.value * 100)}%`, x + bw - 28, y + 62);
    const n = 20;
    const gap = 6;
    const sw = (bw - 56 - gap * (n - 1)) / n;
    const on = Math.round(l.value * n);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i < on ? (i >= n * 0.8 ? AMBER_HI : AMBER) : 'rgba(162,105,44,0.25)';
      ctx.fillRect(x + 28 + i * (sw + gap), y + 90, sw, bh - 120);
    }
  }

  private standby(st: DisplayState) {
    const { ctx, w, h } = this;
    ctx.textAlign = 'center';
    ctx.fillStyle = AMBER;
    ctx.font = `800 118px ${this.fonts.display}`;
    ctx.fillText('RESONANCE', w / 2, h * 0.47);
    ctx.font = `44px ${this.fonts.crt}`;
    ctx.fillStyle = AMBER_DIM;
    const clock = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const blink = Math.floor(st.time * 2) % 2 === 0;
    ctx.fillText(`STANDBY   ${blink ? clock : clock.replace(':', ' ')}`, w / 2, h * 0.64);
    ctx.font = `30px ${this.fonts.crt}`;
    ctx.fillText('CHOOSE A RECORD FROM THE CRATE', w / 2, h * 0.84);
    ctx.textAlign = 'left';
    for (const k of Object.keys(this.hits) as Hit[]) this.hits[k] = [0, 0, 0, 0];
  }

  private playing(st: DisplayState) {
    const { ctx, w, h } = this;
    const pad = 34;
    const size = h - pad * 2;

    // the sleeve
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(pad, pad, size, size, 10);
    ctx.clip();
    if (st.cover?.complete && st.cover.naturalWidth) {
      ctx.drawImage(st.cover, pad, pad, size, size);
      // a little of the phosphor tint so the colours sit on the tube
      ctx.fillStyle = 'rgba(255,150,60,0.12)';
      ctx.fillRect(pad, pad, size, size);
    } else {
      ctx.fillStyle = '#2a1a0d';
      ctx.fillRect(pad, pad, size, size);
      ctx.strokeStyle = AMBER_DIM;
      ctx.lineWidth = 3;
      for (let r = size * 0.12; r < size * 0.46; r += 14) {
        ctx.beginPath();
        ctx.arc(pad + size / 2, pad + size / 2, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,181,76,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(pad + 1, pad + 1, size - 2, size - 2);

    const x = pad * 2 + size;
    const right = w - pad;
    const col = right - x;

    // state
    ctx.font = `36px ${this.fonts.crt}`;
    ctx.fillStyle = st.mode === 'play' ? AMBER : AMBER_DIM;
    const label = { reading: 'READING…', play: 'NOW PLAYING', pause: 'PAUSED', stop: 'STOPPED' }[st.mode as 'play'] ?? '';
    ctx.fillText(label, x, pad + 30);

    // title (shrinks to fit, up to two lines)
    ctx.fillStyle = AMBER_HI;
    let fs = 78;
    const words = st.title.toUpperCase().split(' ');
    let lines: string[] = [];
    for (; fs >= 40; fs -= 4) {
      ctx.font = `800 ${fs}px ${this.fonts.display}`;
      lines = [];
      let cur = '';
      for (const wd of words) {
        const t = cur ? `${cur} ${wd}` : wd;
        if (ctx.measureText(t).width > col && cur) {
          lines.push(cur);
          cur = wd;
        } else cur = t;
      }
      lines.push(cur);
      if (lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= col)) break;
    }
    let y = pad + 30 + fs * 1.02;
    for (const l of lines.slice(0, 2)) {
      ctx.fillText(l, x, y);
      y += fs * 0.92;
    }

    ctx.font = `26px ${this.fonts.mono}`;
    ctx.fillStyle = AMBER;
    ctx.fillText(this.clip(st.artist, col), x, y + 6);
    ctx.fillStyle = AMBER_DIM;
    ctx.fillText(this.clip(st.album, col), x, y + 42);

    const baseY = h - pad;

    // a small level meter beside the transport, five bands mirrored into twelve bars
    const bars = 12;
    const mx = x + 290;
    const bw = (right - mx) / bars;
    for (let i = 0; i < bars; i++) {
      const b = st.bands[Math.min(4, Math.floor((Math.abs(i - (bars - 1) / 2) / (bars / 2)) * 5))] ?? 0;
      const wob = st.mode === 'play' ? 0.7 + 0.3 * Math.sin(st.time * 9 + i * 1.7) : 0;
      const v = Math.max(0.05, b * wob);
      const segs = Math.round(v * 6);
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = k < segs ? (k > 4 ? AMBER_HI : AMBER) : 'rgba(255,181,76,0.1)';
        ctx.fillRect(mx + i * bw + 2, baseY - 24 - k * 11, bw - 4, 7);
      }
    }

    // progress
    const py = baseY - 110;
    const times = `${fmt(st.position)} / ${fmt(st.duration)}`;
    ctx.font = `30px ${this.fonts.crt}`;
    ctx.fillStyle = AMBER_DIM;
    ctx.textAlign = 'right';
    ctx.fillText(times, right, py + 10);
    ctx.textAlign = 'left';
    const barW = col - ctx.measureText(times).width - 28;
    ctx.fillStyle = 'rgba(255,181,76,0.22)';
    ctx.fillRect(x, py, barW, 4);
    ctx.fillStyle = AMBER;
    ctx.fillRect(x, py, barW * st.progress, 4);
    ctx.beginPath();
    ctx.arc(x + barW * st.progress, py + 2, st.hover === 'seek' ? 11 : 8, 0, Math.PI * 2);
    ctx.fill();
    this.hits.seek = [x - 10, py - 22, barW + 20, 48];

    // transport
    const cy = baseY - 58;
    const s = 26;
    const icon = (k: Hit, cx: number, draw: () => void) => {
      const on = st.hover === k;
      ctx.fillStyle = on ? AMBER_HI : AMBER;
      if (on) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,181,76,0.14)';
        ctx.beginPath();
        ctx.arc(cx, cy, s * 1.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = AMBER_HI;
      }
      draw();
      this.hits[k] = [cx - s * 1.5, cy - s * 1.5, s * 3, s * 3];
    };
    const c0 = x + s * 1.4;
    icon('prev', c0, () => {
      ctx.fillRect(c0 - s * 0.8, cy - s * 0.7, 6, s * 1.4);
      this.tri(c0 + s * 0.7, cy, -s * 1.3, s * 0.7);
    });
    const c1 = c0 + s * 3.6;
    icon('toggle', c1, () => {
      if (st.mode === 'play' || st.mode === 'reading') {
        ctx.fillRect(c1 - s * 0.55, cy - s * 0.75, s * 0.38, s * 1.5);
        ctx.fillRect(c1 + s * 0.17, cy - s * 0.75, s * 0.38, s * 1.5);
      } else this.tri(c1 - s * 0.5, cy, s * 1.3, s * 0.8);
    });
    const c2 = c1 + s * 3.6;
    icon('next', c2, () => {
      this.tri(c2 - s * 0.7, cy, s * 1.3, s * 0.7);
      ctx.fillRect(c2 + s * 0.8 - 6, cy - s * 0.7, 6, s * 1.4);
    });
  }

  private tri(x: number, y: number, len: number, half: number) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x, y - half);
    ctx.lineTo(x + len, y);
    ctx.lineTo(x, y + half);
    ctx.closePath();
    ctx.fill();
  }

  private clip(t: string, max: number) {
    const { ctx } = this;
    if (ctx.measureText(t).width <= max) return t;
    let s = t;
    while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
    return `${s}…`;
  }

  dispose() {
    this.texture.dispose();
  }
}
