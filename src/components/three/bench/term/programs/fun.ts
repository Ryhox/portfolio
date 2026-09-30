import { banner, bigWidth } from '../font';
import type { Gfx, Io, Key, Line, Program, Tone } from '../types';
import { ln } from '../types';
import { strftime } from '../util';

const quits = (k: Key) => k.key === 'q' || k.key === 'Q' || k.key === 'Escape' || (k.ctrl && k.key.toLowerCase() === 'c');

// ── sl ────────────────────────────────────────────────────────────────────────────────────────

const D51 = [
  '      ====        ________                ___________ ',
  '  _D _|  |_______/        \\__I_I_____===__|_________| ',
  '   |(_)---  |   H\\________/ |   |        =|___ ___|   ',
  '   /     |  |   H  |  |     |   |         ||_| |_||   ',
  '  |      |  |   H  |__--------------------| [___] |   ',
  '  | ________|___H__/__|_____/[][]~\\_______|       |   ',
  '  |/ |   |-----------I_____I [][] []  D   |=======|__ ',
];
const D51_WHEELS = [
  ['__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__ ', ' |/-=|___|=    ||    ||    ||    |_____/~\\___/        ', '  \\_/      \\O=====O=====O=====O_/      \\_/            '],
  ['__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__ ', ' |/-=|___|=O=====O=====O=====O   |_____/~\\___/        ', '  \\_/      \\__/  \\__/  \\__/  \\__/      \\_/            '],
  ['__/ =| o |=-O=====O=====O=====O \\ ____Y___________|__ ', ' |/-=|___|=    ||    ||    ||    |_____/~\\___/        ', '  \\_/      \\__/  \\__/  \\__/  \\__/      \\_/            '],
  ['__/ =| o |=-~O=====O=====O=====O\\ ____Y___________|__ ', ' |/-=|___|=    ||    ||    ||    |_____/~\\___/        ', '  \\_/      \\__/  \\__/  \\__/  \\__/      \\_/            '],
  ['__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__ ', ' |/-=|___|=   O=====O=====O=====O|_____/~\\___/        ', '  \\_/      \\__/  \\__/  \\__/  \\__/      \\_/            '],
  ['__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__ ', ' |/-=|___|=    ||    ||    ||    |_____/~\\___/        ', '  \\_/      \\_O=====O=====O=====O/      \\_/            '],
];
const COAL = [
  '                              ',
  '                              ',
  '    _________________         ',
  '   _|                \\_____A  ',
  ' =|                        |  ',
  ' -|                        |  ',
  '__|________________________|_ ',
  '|__________________________|_ ',
  '   |_D__D__D_|  |_D__D__D_|   ',
  '    \\_/   \\_/    \\_/   \\_/    ',
];
const LITTLE = ['     ++      +------ ', '     ||      |+-+ |  ', '   /---------|| | |  ', '  + ========  +-+ |  ', ' _|--O========O~\\-+  ', '//// \\_/      \\_/    '];
const LITTLE_CARS = [
  '____                 ____________________ ',
  '|   \\@@@@@@@@@@@     |  ___ ___ ___ ___ | ',
  '|    \\@@@@@@@@@@@@@_ |  |_| |_| |_| |_| | ',
  '|                  | |__________________| ',
  '|__________________| |__________________| ',
  '   (O)       (O)        (O)        (O)    ',
];
const SMOKE = [
  ['(   )', '(    )', '(    )', '(   )', '(  )', '(  )', '( )', '( )', '()', '()', 'O', 'O', 'O', 'O', 'O', ' '],
  ['(@@@)', '(@@@@)', '(@@@@)', '(@@@)', '(@@)', '(@@)', '(@)', '(@)', '@@', '@@', '@', '@', '@', '@', '@', ' '],
];

/** sl: a steam locomotive, for when you meant ls. It does not stop for anything. */
export function sl(flags: Set<string>): Program {
  const little = flags.has('l');
  const fly = flags.has('F');
  const accident = flags.has('a');
  let x = Number.NaN;
  let step = 0;
  let acc = 0;
  const puffs: { x: number; y: number; age: number; kind: number }[] = [];
  const body = () => {
    if (little) return [...LITTLE.map((l, i) => l + LITTLE_CARS[i])];
    const w = D51_WHEELS[step % 6];
    return [...D51, ...w].map((l, i) => l + COAL[i]);
  };
  const width = (little ? LITTLE[0].length + LITTLE_CARS[0].length : D51[0].length + COAL[0].length) + 2;
  let cols = 80;
  const p: Program = {
    mode: 'screen',
    scale: 0.72,
    done: false,
    hint: 'sl · you meant ls. it does not stop.',
    tick(_t, dt) {
      if (Number.isNaN(x)) return false;
      acc += dt * (little ? 34 : 26);
      let changed = false;
      while (acc >= 1) {
        acc--;
        x--;
        step++;
        changed = true;
        // the funnel puffs every few columns; the puffs rise and drift, then fade
        for (const s of puffs) {
          s.age++;
          if (s.age % 2 === 0) s.y--;
          s.x -= s.age % 3 === 0 ? 1 : 0;
        }
        if (step % 4 === 0) puffs.push({ x: x + (little ? 5 : 5), y: 0, age: 0, kind: (step / 4) % 2 });
        while (puffs.length && puffs[0].age > 15) puffs.shift();
      }
      if (x < -width) p.done = true;
      return changed;
    },
    // ^C included: the joke is that it cannot be stopped
    key: () => true,
    draw(g: Gfx) {
      cols = g.cols;
      if (Number.isNaN(x)) x = cols;
      const art = body();
      const h = art.length;
      const lift = fly ? Math.floor((cols - x) / 6) : 0;
      const base = g.rows - h - (fly ? 0 : 0) - lift;
      art.forEach((line, i) => {
        const y = base + i;
        if (y < 0 || y >= g.rows) return;
        const from = Math.max(0, -x);
        const s = line.slice(from, from + cols - Math.max(0, x));
        g.text(Math.max(0, x), y, s, i >= (little ? 4 : 7) ? 'hi' : undefined);
      });
      // people hanging off the carriage, calling for help
      if (accident && !little) {
        const cx = x + D51[0].length + 12;
        const bob = step % 4 < 2;
        const y = base + 2;
        if (y >= 1 && cx >= 0 && cx < cols - 8) {
          g.text(cx, y - 1, 'Help!', 'err');
          g.text(cx + 1, y, bob ? '\\O/' : ' O ', 'hi');
        }
      }
      for (const s of puffs) {
        const y = base + s.y - 1;
        const glyph = SMOKE[s.kind][Math.min(15, s.age)];
        const sx = s.x - Math.floor(glyph.length / 2);
        if (y >= 0 && sx < cols && sx + glyph.length > 0) g.text(Math.max(0, sx), y, glyph.slice(Math.max(0, -sx)), 'dim');
      }
    },
  };
  return p;
}

// ── cmatrix ───────────────────────────────────────────────────────────────────────────────────

const RAIN = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%&*+=<>?:;~^abcdefghijklmnopqrstuvwxyz¤±§¶þßðæø';
const rchar = () => RAIN[Math.floor(Math.random() * RAIN.length)];

/** cmatrix: code rain, in amber. q quits. */
export function matrix(): Program {
  let cols = 0;
  let rows = 0;
  let drops: { y: number; speed: number; len: number; chars: string[]; wait: number }[] = [];
  let acc = 0;
  const reset = () => {
    drops = Array.from({ length: cols }, () => ({ y: -Math.random() * rows * 2, speed: 0.5 + Math.random() * 1.2, len: 4 + Math.floor(Math.random() * rows * 0.8), chars: Array.from({ length: rows }, rchar), wait: 0 }));
  };
  const p: Program = {
    mode: 'screen',
    scale: 0.8,
    done: false,
    hint: 'cmatrix · q quits',
    tick(_t, dt) {
      if (!cols) return false;
      acc += dt * 18;
      if (acc < 1) return false;
      const n = Math.floor(acc);
      acc -= n;
      for (let k = 0; k < n; k++)
        for (const d of drops) {
          d.y += d.speed;
          if (Math.random() < 0.08) d.chars[Math.floor(Math.random() * rows)] = rchar();
          if (d.y - d.len > rows) {
            d.y = -Math.random() * rows * 0.6;
            d.speed = 0.5 + Math.random() * 1.2;
            d.len = 4 + Math.floor(Math.random() * rows * 0.8);
          }
        }
      return true;
    },
    key(k) {
      if (quits(k)) p.done = true;
      return true;
    },
    draw(g: Gfx) {
      if (g.cols !== cols || g.rows !== rows) {
        cols = g.cols;
        rows = g.rows;
        reset();
      }
      drops.forEach((d, x) => {
        const head = Math.floor(d.y);
        for (let i = 0; i < d.len; i++) {
          const y = head - i;
          if (y < 0 || y >= rows) continue;
          const tone: Tone = i === 0 ? 'hi' : i < d.len * 0.35 ? 'ok' : i < d.len * 0.7 ? 'out' : 'dim';
          g.text(x, y, d.chars[y], tone);
        }
      });
    },
  };
  return p;
}

// ── donut ─────────────────────────────────────────────────────────────────────────────────────

/** donut: the spinning torus from donut.c, in amber. q quits. */
export function donut(): Program {
  let A = 1;
  let B = 1;
  let acc = 0;
  const p: Program = {
    mode: 'screen',
    scale: 0.7,
    done: false,
    hint: 'donut · q quits',
    tick(_t, dt) {
      acc += dt * 30;
      if (acc < 1) return false;
      const n = Math.floor(acc);
      acc -= n;
      A += 0.07 * n;
      B += 0.03 * n;
      return true;
    },
    key(k) {
      if (quits(k)) p.done = true;
      return true;
    },
    draw(g: Gfx) {
      const W = g.cols;
      const H = g.rows;
      const out = new Array(W * H).fill(' ');
      const lum = new Array(W * H).fill(0);
      const z = new Array(W * H).fill(0);
      const aspect = g.ch / g.cw;
      const K2 = 5;
      const Ky = (H * 0.46 * K2) / 3;
      const Kx = Math.min(Ky * aspect, (W * 0.46 * K2) / 3);
      const cA = Math.cos(A);
      const sA = Math.sin(A);
      const cB = Math.cos(B);
      const sB = Math.sin(B);
      for (let j = 0; j < 6.28; j += 0.07) {
        const ct = Math.cos(j);
        const st = Math.sin(j);
        for (let i = 0; i < 6.28; i += 0.02) {
          const sp = Math.sin(i);
          const cp = Math.cos(i);
          const h = ct + 2;
          const D = 1 / (sp * h * sA + st * cA + K2);
          const t = sp * h * cA - st * sA;
          const x = Math.floor(W / 2 + Kx * D * (cp * h * cB - t * sB));
          const y = Math.floor(H / 2 + Ky * D * (cp * h * sB + t * cB));
          const o = x + W * y;
          const N = 8 * ((st * sA - sp * ct * cA) * cB - sp * ct * sA - st * cA - cp * ct * sB);
          if (y >= 0 && y < H && x >= 0 && x < W && D > z[o]) {
            z[o] = D;
            const k = Math.max(0, Math.floor(N));
            out[o] = '.,-~:;=!*#$@'[Math.min(11, k)];
            lum[o] = k;
          }
        }
      }
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const o = x + W * y;
          if (out[o] === ' ') continue;
          const l = lum[o];
          g.text(x, y, out[o], l > 8 ? 'hi' : l > 4 ? 'out' : l > 1 ? 'ok' : 'dim');
        }
    },
  };
  return p;
}

// ── pipes ─────────────────────────────────────────────────────────────────────────────────────

/** pipes: plumbing that lays itself across the screen, then starts over. q quits. */
export function pipes(): Program {
  let cols = 0;
  let rows = 0;
  let grid: ([string, Tone] | null)[] = [];
  const tones: Tone[] = ['out', 'hi', 'ok', 'dim', 'err'];
  let heads: { x: number; y: number; d: number; tone: Tone }[] = [];
  let laid = 0;
  let acc = 0;
  // direction: 0 up, 1 right, 2 down, 3 left; corner glyph for (from, to)
  const straight = ['┃', '━', '┃', '━'];
  const corner: Record<string, string> = { '01': '┏', '03': '┓', '21': '┗', '23': '┛', '10': '┛', '12': '┓', '30': '┗', '32': '┏' };
  const start = () => {
    grid = new Array(cols * rows).fill(null);
    laid = 0;
    heads = Array.from({ length: 3 }, (_, i) => ({ x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows), d: Math.floor(Math.random() * 4), tone: tones[i % tones.length] }));
  };
  const p: Program = {
    mode: 'screen',
    scale: 0.8,
    done: false,
    hint: 'pipes · q quits',
    tick(_t, dt) {
      if (!cols) return false;
      acc += dt * 40;
      if (acc < 1) return false;
      const n = Math.floor(acc);
      acc -= n;
      for (let k = 0; k < n; k++)
        for (const h of heads) {
          let nd = h.d;
          if (Math.random() < 0.12) nd = (h.d + (Math.random() < 0.5 ? 1 : 3)) % 4;
          grid[h.x + h.y * cols] = [nd === h.d ? straight[h.d] : corner[`${h.d}${nd}`], h.tone];
          h.d = nd;
          h.x = (h.x + [0, 1, 0, -1][h.d] + cols) % cols;
          h.y = (h.y + [-1, 0, 1, 0][h.d] + rows) % rows;
          // wrapping round an edge: a new colour
          if ((h.d % 2 === 1 && (h.x === 0 || h.x === cols - 1)) || (h.d % 2 === 0 && (h.y === 0 || h.y === rows - 1))) if (Math.random() < 0.3) h.tone = tones[Math.floor(Math.random() * tones.length)];
          laid++;
        }
      if (laid > cols * rows * 1.2) start();
      return true;
    },
    key(k) {
      if (quits(k)) p.done = true;
      return true;
    },
    draw(g: Gfx) {
      if (g.cols !== cols || g.rows !== rows) {
        cols = g.cols;
        rows = g.rows;
        start();
      }
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const c = grid[x + y * cols];
          if (c) g.text(x, y, c[0], c[1]);
        }
    },
  };
  return p;
}

// ── clock ─────────────────────────────────────────────────────────────────────────────────────

/** clock: the time in big dot letters. q quits. */
export function clock(): Program {
  let last = '';
  const p: Program = {
    mode: 'screen',
    done: false,
    hint: 'clock · q quits',
    tick() {
      const now = strftime('%T');
      if (now === last) return false;
      last = now;
      return true;
    },
    key(k) {
      if (quits(k)) p.done = true;
      return true;
    },
    draw(g: Gfx) {
      const full = strftime('%T');
      const text = bigWidth(full) <= g.cols ? full : strftime('%R');
      const big = banner(text, g.cols);
      const y0 = Math.max(0, Math.floor((g.rows - big.length - 2) / 2));
      const x0 = Math.max(0, Math.floor((g.cols - Math.max(...big.map((b) => b.length))) / 2));
      big.forEach((l, i) => g.text(x0, y0 + i, l, 'hi'));
      g.center(y0 + big.length + 1, strftime('%A, %e %B %Y').replace(/\s+/g, ' '), 'dim');
    },
  };
  return p;
}

// ── hack ──────────────────────────────────────────────────────────────────────────────────────

const HACK = [
  'initialising neural uplink',
  'bypassing firewall on port 443',
  'injecting shellcode into the kettle',
  'decrypting RSA-4096 private key',
  'tracing the escapement',
  'brute-forcing the mainframe',
  'rerouting power through the flux capacitor',
  'downloading more RAM',
  'compiling the gibson',
  'enhancing. enhance. ENHANCE.',
];

/** hack: hacker-film output for a few seconds, then access granted. Any key hurries it along. */
export function hack(io: Io): Program {
  let t0 = -1;
  let next = 0;
  let i = 0;
  const p: Program = {
    mode: 'inline',
    done: false,
    hint: 'hack · ^C aborts',
    tick(t) {
      if (t0 < 0) t0 = t;
      if (t < next) return false;
      next = t + 0.12 + Math.random() * 0.12;
      if (i >= HACK.length) {
        p.done = true;
        return false;
      }
      const r = Math.random();
      if (r < 0.35) {
        const hex = Array.from({ length: 8 }, () => Math.floor(Math.random() * 65536).toString(16).padStart(4, '0')).join(' ');
        io.print(ln(`0x${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}  ${hex}`, 'dim'));
      } else {
        const pct = Math.min(100, Math.floor(((i + 1) / HACK.length) * 100));
        const bar = '#'.repeat(Math.round(pct / 10)).padEnd(10, '.');
        io.print(ln(`${HACK[i++]}... [${bar}] ${pct}%`, i === HACK.length ? 'hi' : undefined));
      }
      return true;
    },
    key(k) {
      if (!k.ctrl) next = 0;
      return !k.ctrl;
    },
    exit(interrupted) {
      if (interrupted) return [ln('connection reset by peer.', 'err')];
      const out: Line[] = banner('ACCESS GRANTED', io.cols()).map((l) => ln(l, 'ok'));
      out.push(ln('just kidding. it is a portfolio. but thanks for trying.', 'dim'));
      return out;
    },
  };
  return p;
}
