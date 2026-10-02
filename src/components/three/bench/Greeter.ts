import * as THREE from 'three';

/** the tube's inks: lit, bright, dim, and the red of a blush */
const INK = { '#': '#ffb54c', o: '#ffe2b0', '-': '#9c6a2c', r: '#ff5a3c' } as const;
type Ink = keyof typeof INK;
const BG = '#150d06';
/** the picture moves in steps, like a sprite: this many a second */
const FPS = 12;

/**
 * The automaton, a cell to a character (# lit, - dim): its head, its trunk with the dark round of
 * a clock in the chest, its legs. What moves is drawn over this: the antenna, the face, the
 * clock's hands, the arms.
 */
const BODY = [
  '............................',
  '............................',
  '............................',
  '.........##########.........',
  '........############........',
  '........############........',
  '........############........',
  '........############........',
  '........############........',
  '........############........',
  '........############........',
  '........############........',
  '.........##########.........',
  '...........------...........',
  '.....################.......',
  '........############........',
  '........####....####........',
  '........###......###........',
  '........###......###........',
  '........###......###........',
  '........####....####........',
  '........############........',
  '.........----------.........',
  '.........##########.........',
  '..........###..###..........',
  '..........###..###..........',
  '..........###..###..........',
  '..........###..###..........',
  '.........####..####.........',
];
const COLS = BODY[0].length;
const ROWS = BODY.length;
/** the legs' first row: everything above it sinks a cell when it breathes */
const LEGS = ROWS - 5;
/** room round the sprite for what leaves it: an arm thrown up, sparks off a hand */
const PAD = 10;
const GW = COLS + PAD * 2;
const GH = ROWS + PAD * 2;

/** where the arms hang from (the top-left cell of a two-cell brush), and how they are held */
const SHOULDER = { left: [5, 14], right: [20, 14] } as const;
/** an arm: its elbow and the end of its forearm */
type Arm = [ex: number, ey: number, tx: number, ty: number];
const REST: Arm = [5, 18, 5, 20];
const FOREARM = 5;
/** how far the forearm swings either side of straight up (radians) */
const SWING = 0.62;
const raised = (side: 1 | -1, swing: number): Arm => {
  const ex = side > 0 ? 23 : 2;
  return [ex, 11, ex + side * Math.sin(swing) * FOREARM, 11 - Math.cos(swing) * FOREARM];
};

/** the eight ways a hand of the clock can point, from twelve round */
const DIRS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

const CHEVRON = ['##...##', '.##.##.', '..###..', '...#...'];
const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];

const WORDS = {
  home: { line: 'SCROLL TO BEGIN', sub: '' },
  farewell: { line: 'THANKS FOR VISITING', sub: 'SCROLL UP TO REWIND' },
};

/** Where it can be touched, and for how long (seconds) it answers. */
const ANSWERS = { antenna: 1.4, head: 1.9, five: 1.5, hand: 2.2, clock: 2, crotch: 2.6, belly: 1.6, legs: 1.5 };
export type Zone = keyof typeof ANSWERS;

type Pose = {
  /** the whole of it moved aside, or off the ground (cells) */
  dx: number;
  lift: number;
  bob: number;
  eyes: 'open' | 'shut' | 'happy' | 'wide';
  mouth: 'smile' | 'flat' | 'o' | 'grin';
  blush: boolean;
  left: Arm;
  right: Arm;
  /** the waving hand, struck: it flashes big, and sparks fly off it (how far, 0 = none) */
  slap: number;
  /** the antenna's knob, knocked aside (cells) */
  knob: number;
  /** how far round the clock's hands have run (eighths of a turn of the long one) */
  spin: number;
  /** hearts going up beside its head (how far, -1 = none) */
  hearts: number;
  say: string;
  nudge: number;
};

/**
 * What the Lumen 64's tube shows at the bench: a little clockwork automaton that waves, and under
 * it the one thing there is to do. It can be touched: its head, its antenna, the hand it waves,
 * the one at its side, the clock in its chest, its belly, its legs and between them each get an
 * answer of their own. Drawn into a canvas, only when a step of its movement changes what it
 * shows, and uploaded as a texture; it fills the machine's whole glass.
 */
export class Greeter {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  w = 1280;
  h = 798;
  /** at the bench on the way in, or back at it at the end of the page */
  mode: keyof typeof WORDS = 'home';

  private font = 'monospace';
  /** what the canvas shows now (a new step of the wave, a blink, the other words: a redraw) */
  private shown = '';
  private now = 0;
  private answer: { zone: Zone; at: number } | null = null;
  private grid = new Array<Ink | ''>(GW * GH).fill('');
  /** the middle of the waving hand, where it was last drawn (cells) */
  private palm = [24, 5];

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    const crt = getComputedStyle(document.documentElement).getPropertyValue('--font-vt').trim();
    if (crt) this.font = crt;
    this.setAspect(1.6);
    document.fonts?.ready.then(() => (this.shown = ''));
  }

  /** The canvas takes the shape of the machine's glass. */
  setAspect(aspect: number) {
    const w = aspect >= 1 ? 1280 : Math.round(1100 * aspect);
    const h = aspect >= 1 ? Math.round(1280 / aspect) : 1100;
    if (w === this.w && h === this.h && this.canvas.width === w) return;
    this.w = this.canvas.width = w;
    this.h = this.canvas.height = h;
    this.texture.dispose();
    this.shown = '';
  }

  setMode(m: Greeter['mode']) {
    this.mode = m;
  }

  // ── touching it ───────────────────────────────────────────────────────────────────────────

  /** Which part of it lies at a point of the picture (0..1 across, 0..1 down), if any. */
  zoneAt(u: number, v: number): Zone | null {
    const { px, x0, y0 } = this.layout();
    const c = (u * this.w - x0) / px;
    const r = (v * this.h - y0) / px;
    const within = (c0: number, c1: number, r0: number, r1: number) => c >= c0 && c < c1 && r >= r0 && r < r1;
    if (Math.hypot(c - this.palm[0], r - this.palm[1]) < 3.2) return 'five';
    if (within(11, 17, -1, 3)) return 'antenna';
    if (within(8, 20, 3, 13)) return 'head';
    if (Math.hypot(c - 14, r - 18.5) < 3.3) return 'clock';
    if (within(9, 19, 22, 25)) return 'crotch';
    if (within(8, 20, 13, 22)) return 'belly';
    if (within(8.5, 19.5, 25, 30)) return 'legs';
    if (within(3, 8, 14, 25)) return 'hand';
    // (the hand that waves is never where it was: all of the room it sweeps counts as it)
    if (within(20, 30, 1, 16)) return 'five';
    return null;
  }

  /** A touch at a point of the picture: the part of it there answers. Returns which, if any. */
  poke(u: number, v: number): Zone | null {
    const zone = this.zoneAt(u, v);
    if (zone) this.answer = { zone, at: this.now };
    return zone;
  }

  // ── what it is doing ──────────────────────────────────────────────────────────────────────

  /** `still`: it does not move of its own accord (it still answers a touch). */
  private pose(still: boolean): Pose {
    const t = still ? 0 : Math.floor(this.now * FPS) / FPS;
    // the forearm swings from side to side; the body breathes; now and then it blinks
    const swing = (Math.round(Math.sin(t * Math.PI * 2 * 1.5) * 4) / 4) * SWING;
    const p: Pose = {
      dx: 0,
      lift: 0,
      bob: Math.floor(t / 0.75) % 2,
      eyes: t % 3.6 < 0.17 && !still ? 'shut' : 'open',
      mouth: 'smile',
      blush: false,
      left: REST,
      right: raised(1, swing),
      slap: 0,
      knob: 0,
      spin: 0,
      hearts: -1,
      say: '',
      nudge: Math.floor(t / 0.5) % 2,
    };
    const a = this.answer;
    if (!a) return p;
    const e = this.now - a.at;
    if (e < 0 || e >= ANSWERS[a.zone]) {
      this.answer = null;
      return p;
    }
    // (the steps since it was touched)
    const k = Math.floor(e * FPS);
    switch (a.zone) {
      case 'crotch':
        // a start, then both hands down over it, eyes shut tight, red in the face
        if (e < 0.25) {
          p.eyes = 'wide';
          p.mouth = 'o';
          p.say = '!?';
          break;
        }
        p.left = [6, 19, 10, 22];
        p.right = [20, 19, 15, 22];
        p.eyes = 'shut';
        p.mouth = 'flat';
        p.blush = true;
        p.bob = 0;
        p.dx = e < 1.2 ? k % 2 : 0;
        p.say = 'HEY!!';
        break;
      case 'head':
        // patted: it beams, nodding, and hearts go up
        p.eyes = 'happy';
        p.mouth = 'grin';
        p.bob = k % 4 < 2 ? 1 : 0;
        p.hearts = k;
        p.say = 'HEHE';
        break;
      case 'antenna':
        // flicked: the knob swings back and forth and comes to rest
        p.knob = Math.round(3 * Math.cos(e * 20) * (1 - e / ANSWERS.antenna));
        if (e < 0.5) {
          p.eyes = 'wide';
          p.mouth = 'o';
        }
        p.say = 'BOING';
        break;
      case 'five':
        // the waving hand met: a high five
        p.right = [23, 11, 25, 7];
        p.slap = k < 5 ? k + 1 : 0;
        p.dx = k < 2 ? -1 : 0;
        p.eyes = 'happy';
        p.mouth = 'grin';
        p.say = 'HIGH FIVE!';
        break;
      case 'hand': {
        // the other hand taken: it waves with both
        const s = (Math.round(Math.sin(e * Math.PI * 2 * 2.5) * 4) / 4) * SWING;
        p.left = raised(-1, s);
        p.right = raised(1, s);
        p.eyes = 'happy';
        p.mouth = 'grin';
        p.say = 'HI HI!';
        break;
      }
      case 'clock':
        // wound up: the hands run round
        p.spin = k + 1;
        p.eyes = 'wide';
        p.mouth = 'o';
        p.say = 'TICK TOCK';
        break;
      case 'belly':
        // tickled
        p.dx = e < 1.2 ? k % 2 : 0;
        p.bob = k % 2;
        p.eyes = 'happy';
        p.mouth = 'grin';
        p.say = 'HAHA';
        break;
      case 'legs':
        // two hops, arms in the air
        p.lift = e < 1.1 ? Math.round(4 * Math.abs(Math.sin((Math.PI * e) / 0.55))) : 0;
        p.left = raised(-1, 0);
        p.right = raised(1, 0);
        p.bob = 0;
        p.eyes = 'happy';
        p.mouth = 'grin';
        p.say = 'HOP!';
        break;
    }
    return p;
  }

  /** Redraw if needed. Returns true when the texture changed. */
  update(time: number, still = false) {
    this.now = time;
    const pose = this.pose(still);
    const key = `${this.mode}:${JSON.stringify(pose)}`;
    if (key === this.shown) return false;
    this.shown = key;
    this.draw(pose);
    this.texture.needsUpdate = true;
    return true;
  }

  // ── drawing ───────────────────────────────────────────────────────────────────────────────

  /** The size of a cell, and where the sprite's top-left one is: its middle on the glass's. */
  private layout() {
    const { w, h } = this;
    const px = Math.max(4, Math.floor(Math.min((h * 0.55) / ROWS, (w * 0.42) / COLS)));
    return { px, x0: Math.round(w / 2 - (COLS / 2) * px), y0: Math.round(h * 0.085) };
  }

  private put(c: number, r: number, ink: Ink | '') {
    const x = c + PAD;
    const y = r + PAD;
    if (x >= 0 && x < GW && y >= 0 && y < GH) this.grid[y * GW + x] = ink;
  }

  private draw(p: Pose) {
    const { ctx, w, h } = this;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
    g.addColorStop(0, 'rgba(255,170,80,0.07)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const { px, x0, y0 } = this.layout();
    const put = (c: number, r: number, ink: Ink | '') => this.put(c, r, ink);
    const b = p.bob;
    this.grid.fill('');

    // ── the body (it breathes: everything above the legs sinks a cell onto them and comes back)
    BODY.forEach((row, r) => {
      const dy = r < LEGS ? b : 0;
      for (let c = 0; c < row.length; c++) if (row[c] !== '.') put(c, r + dy, row[c] as Ink);
    });

    // the antenna: a knob on a stalk, which leans after it
    const lean = Math.round(p.knob / 2);
    put(13 + lean, 2 + b, '-');
    put(14 + lean, 2 + b, '-');
    for (let r = 0; r < 2; r++) for (let c = 13; c < 15; c++) put(c + p.knob, r + b, 'o');

    // the face: eyes and mouth are holes in it
    const holes: number[][] = [];
    for (const x of [10, 16]) {
      if (p.eyes === 'happy') holes.push([x, 6], [x + 1, 6], [x - 1, 7], [x + 2, 7]);
      else for (let r = p.eyes === 'wide' ? 5 : p.eyes === 'shut' ? 7 : 6; r <= 7; r++) holes.push([x, r], [x + 1, r]);
    }
    if (p.mouth === 'smile') holes.push([11, 9], [16, 9], [12, 10], [13, 10], [14, 10], [15, 10]);
    else if (p.mouth === 'flat') holes.push([12, 10], [13, 10], [14, 10], [15, 10]);
    else if (p.mouth === 'o') holes.push([13, 9], [14, 9], [13, 10], [14, 10]);
    else for (let c = 12; c <= 15; c++) holes.push([c, 9], [c, 10]);
    for (const [c, r] of holes) put(c, r + b, '');
    if (p.blush) for (const c of [9, 10, 17, 18]) for (const r of [8, 9]) put(c, r + b, 'r');

    // the clock: a short hand and a long one, from the middle
    const long = DIRS[(2 + p.spin) % 8];
    const short = DIRS[Math.floor(p.spin / 4) % 8];
    put(13, 18 + b, 'o');
    put(13 + short[0], 18 + short[1] + b, 'o');
    put(13 + long[0], 18 + long[1] + b, 'o');
    if (!long[0] || !long[1]) put(13 + long[0] * 2, 18 + long[1] * 2 + b, 'o');

    // the arms: two cells thick, a hand at the end of each (the hands last, over everything)
    const limb = (ax: number, ay: number, bx: number, by: number) => {
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2));
      for (let i = 0; i <= n; i++) {
        const c = Math.round(ax + ((bx - ax) * i) / n);
        const r = Math.round(ay + ((by - ay) * i) / n) + b;
        put(c, r, '#');
        put(c + 1, r, '#');
        put(c, r + 1, '#');
        put(c + 1, r + 1, '#');
      }
    };
    const arm = (from: readonly [number, number], [ex, ey, tx, ty]: Arm) => {
      limb(from[0], from[1], ex, ey);
      limb(ex, ey, tx, ty);
      const d = Math.hypot(tx - ex, ty - ey) || 1;
      return [Math.round(tx + ((tx - ex) / d) * 1.5), Math.round(ty + ((ty - ey) / d) * 1.5) + b];
    };
    const hands = [arm(SHOULDER.left, p.left), arm(SHOULDER.right, p.right)];
    hands.forEach(([hc, hr], i) => {
      const big = i === 1 && p.slap > 0 && p.slap < 4 ? 1 : 0;
      for (let r = -1 - big; r <= 1 + big; r++) for (let c = -1 - big; c <= 2 + big; c++) put(hc + c, hr + r, 'o');
    });
    this.palm = [hands[1][0] + 1, hands[1][1] + 0.5];
    // (struck, the hand throws sparks: eight of them, flying off)
    if (p.slap > 0)
      for (const [dc, dr] of DIRS) {
        const far = (dc && dr ? 0.72 : 1) * (3.5 + p.slap * 1.2);
        put(Math.round(this.palm[0] + dc * far), Math.round(this.palm[1] + dr * far), p.slap < 4 ? 'o' : '-');
      }

    // ── onto the glass, standing on a line
    ctx.fillStyle = INK['-'];
    ctx.fillRect(x0 + 5 * px, y0 + ROWS * px + Math.round(px * 0.6), (COLS - 10) * px, Math.max(2, Math.round(px * 0.3)));
    const ox = x0 + (p.dx - PAD) * px;
    const oy = y0 - (p.lift + PAD) * px;
    let ink: Ink | '' = '';
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        const cell = this.grid[y * GW + x];
        if (!cell) continue;
        if (cell !== ink) ctx.fillStyle = INK[(ink = cell)];
        ctx.fillRect(ox + x * px, oy + y * px, px, px);
      }

    // hearts, going up on the side it is not waving on
    if (p.hearts >= 0) {
      const q = Math.max(2, Math.round(px * 0.5));
      [0, 5].forEach((late, i) => {
        const k = p.hearts - late;
        if (k < 0 || k > 16) return;
        const hx = x0 + (i ? 1 : 4.5) * px + (k % 4 < 2 ? 0 : q);
        const hy = y0 + (i ? 9 : 6) * px - k * q * 1.2;
        ctx.fillStyle = k < 11 ? INK.r : INK['-'];
        HEART.forEach((row, r) => {
          for (let c = 0; c < row.length; c++) if (row[c] === '#') ctx.fillRect(hx + c * q, Math.round(hy) + r * q, q, q);
        });
      });
    }

    // ── the words under it (or what it has to say for itself)
    const words = WORDS[this.mode];
    const u = Math.min(w, h * 1.6) / 100;
    const fs = u * 7.4;
    const base = y0 + ROWS * px + px * 0.9 + fs * 1.18;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `${fs}px ${this.font}`;
    ctx.fillStyle = p.say ? INK.o : INK['#'];
    ctx.fillText(p.say || words.line, w / 2, base);
    if (p.say) return;
    if (words.sub) {
      ctx.font = `${u * 4}px ${this.font}`;
      ctx.fillStyle = INK['-'];
      ctx.fillText(words.sub, w / 2, base + u * 5.4);
      return;
    }
    // (and the way to go, nodding)
    const q = Math.max(2, Math.round(px * 0.5));
    const cx = Math.round(w / 2 - (CHEVRON[0].length / 2) * q);
    const cy = Math.round(base + u * 2.2) + p.nudge * q;
    ctx.fillStyle = p.nudge ? INK['#'] : INK['-'];
    CHEVRON.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] === '#') ctx.fillRect(cx + c * q, cy + r * q, q, q);
    });
  }
}
