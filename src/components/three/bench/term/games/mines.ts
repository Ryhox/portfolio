import type { Gfx, Host, Key, Program, Tone } from '../types';
import { best, dir, DX, DY, isQuit } from './common';

const COLS = 16;
const ROWS = 9;
const MINES = 18;

/** Minesweeper: arrows move, space opens, f flags; the first square is always safe. q quits. */
export function mines(host: Host): Program {
  let mine: boolean[] = [];
  let open: boolean[] = [];
  let flag: boolean[] = [];
  let cx = Math.floor(COLS / 2);
  let cy = Math.floor(ROWS / 2);
  let state: 'fresh' | 'play' | 'won' | 'lost' = 'fresh';
  let t0 = 0;
  let t1 = 0;
  let now = 0;
  let boom = -1;

  const at = (x: number, y: number) => y * COLS + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  const around = (x: number, y: number) => {
    const out: [number, number][] = [];
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if ((i || j) && inside(x + i, y + j)) out.push([x + i, y + j]);
    return out;
  };
  const count = (x: number, y: number) => around(x, y).filter(([a, b]) => mine[at(a, b)]).length;
  const start = () => {
    mine = Array(COLS * ROWS).fill(false);
    open = Array(COLS * ROWS).fill(false);
    flag = Array(COLS * ROWS).fill(false);
    state = 'fresh';
    boom = -1;
  };
  const lay = (sx: number, sy: number) => {
    const safe = new Set([at(sx, sy), ...around(sx, sy).map(([a, b]) => at(a, b))]);
    let n = 0;
    while (n < MINES) {
      const i = Math.floor(Math.random() * COLS * ROWS);
      if (mine[i] || safe.has(i)) continue;
      mine[i] = true;
      n++;
    }
  };
  const reveal = (x: number, y: number) => {
    const stack: [number, number][] = [[x, y]];
    while (stack.length) {
      const [a, b] = stack.pop()!;
      const i = at(a, b);
      if (open[i] || flag[i]) continue;
      open[i] = true;
      if (!mine[i] && count(a, b) === 0) stack.push(...around(a, b));
    }
  };
  const dig = () => {
    const i = at(cx, cy);
    if (flag[i]) return;
    if (state === 'fresh') {
      lay(cx, cy);
      state = 'play';
      t0 = now;
    }
    // on an open number with its flags placed: open the rest round it
    if (open[i]) {
      const n = count(cx, cy);
      const flags = around(cx, cy).filter(([a, b]) => flag[at(a, b)]).length;
      if (n && flags === n) for (const [a, b] of around(cx, cy)) if (!flag[at(a, b)]) check(a, b);
      return;
    }
    check(cx, cy);
  };
  const check = (x: number, y: number) => {
    if (state !== 'play') return;
    const i = at(x, y);
    if (mine[i]) {
      state = 'lost';
      boom = i;
      t1 = now;
      open = open.map((o, k) => o || mine[k]);
      host.blip?.('lose');
      return;
    }
    reveal(x, y);
    host.blip?.('move');
    if (open.filter((o, k) => o && !mine[k]).length === COLS * ROWS - MINES) {
      state = 'won';
      t1 = now;
      best(host, 'mines', Math.max(1, Math.round(t1 - t0)), true);
      host.blip?.('win');
    }
  };

  start();

  const tones: Tone[] = ['dim', 'out', 'ok', 'hi', 'err', 'err', 'err', 'err', 'err'];
  const p: Program = {
    mode: 'screen',
    done: false,
    hint: 'mines · arrows move · space opens · f flags · q quits',
    tick(t) {
      const sec = Math.floor(t - t0);
      const changed = state === 'play' && sec !== Math.floor(now - t0);
      now = t;
      return changed;
    },
    key(k: Key) {
      if (isQuit(k)) {
        p.done = true;
        return true;
      }
      if (state === 'won' || state === 'lost') {
        if (k.key === 'r' || k.key === 'Enter' || k.key === ' ') start();
        return true;
      }
      const d = dir(k);
      if (d >= 0 && !(k.key === 'f' || k.key === 'F')) {
        cx = (cx + DX[d] + COLS) % COLS;
        cy = (cy + DY[d] + ROWS) % ROWS;
      } else if (k.key === ' ' || k.key === 'Enter') dig();
      else if ((k.key === 'f' || k.key === 'F' || k.key === 'm') && !open[at(cx, cy)]) flag[at(cx, cy)] = !flag[at(cx, cy)];
      return true;
    },
    draw(g: Gfx) {
      const hud = g.ch * 1.3;
      const s = Math.floor(Math.min(g.W / COLS, (g.H - hud) / ROWS));
      const ox = Math.floor((g.W - s * COLS) / 2);
      const oy = Math.floor(hud + (g.H - hud - s * ROWS) / 2);
      const flags = flag.filter(Boolean).length;
      const secs = state === 'fresh' ? 0 : Math.floor((state === 'play' ? now : t1) - t0);
      g.text(0, 0, `mines ${MINES - flags}`, 'hi');
      g.center(0, state === 'won' ? ' cleared. r again ' : state === 'lost' ? ' boom. r again ' : 'MINES', state === 'play' || state === 'fresh' ? 'ok' : 'inv');
      const t = `${secs}s${best(host, 'mines') ? ` · best ${best(host, 'mines')}s` : ''}`;
      g.text(g.cols - t.length, 0, t, 'dim');
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) {
          const i = at(x, y);
          const px = ox + x * s;
          const py = oy + y * s;
          if (!open[i]) {
            g.rect(px + 1.5, py + 1.5, s - 3, s - 3, 'out', 0.28);
            g.rect(px + 1.5, py + 1.5, s - 3, Math.max(1, s * 0.12), 'hi', 0.25);
            if (flag[i]) {
              g.rect(px + s * 0.34, py + s * 0.2, s * 0.08, s * 0.6, 'hi');
              g.rect(px + s * 0.42, py + s * 0.2, s * 0.3, s * 0.22, 'err');
            }
            continue;
          }
          g.rect(px + 1.5, py + 1.5, s - 3, s - 3, 'dim', 0.12);
          if (mine[i]) {
            if (i === boom) g.rect(px + 1.5, py + 1.5, s - 3, s - 3, 'err', 0.7);
            g.rect(px + s * 0.3, py + s * 0.3, s * 0.4, s * 0.4, i === boom ? 'hi' : 'err');
            g.rect(px + s * 0.46, py + s * 0.16, s * 0.08, s * 0.68, i === boom ? 'hi' : 'err');
            g.rect(px + s * 0.16, py + s * 0.46, s * 0.68, s * 0.08, i === boom ? 'hi' : 'err');
            continue;
          }
          const n = count(x, y);
          if (n) {
            const sc = Math.min(1.6, (s * 0.7) / g.ch);
            g.textPx(px + s / 2 - (g.cw * sc) / 2, py + s / 2 - (g.ch * sc) / 2, String(n), tones[n], sc);
          }
        }
      g.frame(ox + cx * s, oy + cy * s, s, s, 'hi', 2);
    },
  };
  return p;
}
