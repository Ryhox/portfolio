import type { Gfx, Host, Key, Program } from '../types';
import { best, dir, isQuit } from './common';

const N = 4;

/** 2048: slide the tiles, equal ones merge. Arrows or WASD; u undoes once; r restarts; q quits. */
export function g2048(host: Host): Program {
  let grid: number[][] = [];
  let score = 0;
  let won = false;
  let over = false;
  let undo: { grid: number[][]; score: number } | null = null;
  let born: [number, number, number][] = [];
  let now = 0;

  const empty = () => {
    const out: [number, number][] = [];
    grid.forEach((row, y) => row.forEach((v, x) => !v && out.push([x, y])));
    return out;
  };
  const add = () => {
    const e = empty();
    if (!e.length) return;
    const [x, y] = e[Math.floor(Math.random() * e.length)];
    grid[y][x] = Math.random() < 0.9 ? 2 : 4;
    born.push([x, y, now]);
  };
  const start = () => {
    grid = Array.from({ length: N }, () => Array(N).fill(0));
    score = 0;
    won = false;
    over = false;
    undo = null;
    born = [];
    add();
    add();
  };
  /** Slide one row to the left; the score it made. */
  const slide = (row: number[]): [number[], number, number[]] => {
    const vals = row.filter(Boolean);
    const out: number[] = [];
    const merged: number[] = [];
    let gain = 0;
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] === vals[i + 1]) {
        out.push(vals[i] * 2);
        merged.push(out.length - 1);
        gain += vals[i] * 2;
        i++;
      } else out.push(vals[i]);
    }
    while (out.length < N) out.push(0);
    return [out, gain, merged];
  };
  const canMove = () => {
    if (empty().length) return true;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (grid[y][x] === grid[y][x + 1] || grid[y][x] === grid[y + 1]?.[x]) return true;
    return false;
  };
  const move = (d: number) => {
    const before = grid.map((r) => [...r]);
    const beforeScore = score;
    const get = (i: number, j: number) => (d === 3 ? grid[i][j] : d === 1 ? grid[i][N - 1 - j] : d === 0 ? grid[j][i] : grid[N - 1 - j][i]);
    const set = (i: number, j: number, v: number) => {
      if (d === 3) grid[i][j] = v;
      else if (d === 1) grid[i][N - 1 - j] = v;
      else if (d === 0) grid[j][i] = v;
      else grid[N - 1 - j][i] = v;
    };
    const merges: [number, number][] = [];
    for (let i = 0; i < N; i++) {
      const [row, gain, merged] = slide(Array.from({ length: N }, (_, j) => get(i, j)));
      row.forEach((v, j) => set(i, j, v));
      score += gain;
      for (const j of merged) merges.push([i, j]);
    }
    const changed = grid.some((r, y) => r.some((v, x) => v !== before[y][x]));
    if (!changed) return;
    undo = { grid: before, score: beforeScore };
    born = [];
    for (const [i, j] of merges) {
      const [x, y] = d === 3 ? [j, i] : d === 1 ? [N - 1 - j, i] : d === 0 ? [i, j] : [i, N - 1 - j];
      born.push([x, y, now]);
    }
    add();
    host.blip?.(merges.length ? 'eat' : 'move');
    if (!won && grid.some((r) => r.includes(2048))) {
      won = true;
      host.blip?.('win');
    }
    if (!canMove()) {
      over = true;
      best(host, '2048', score);
      host.blip?.('lose');
    }
  };

  start();

  const p: Program = {
    mode: 'screen',
    done: false,
    hint: '2048 · arrows or wasd · u undoes · r restarts · q quits',
    tick(t) {
      now = t;
      return born.some((b) => t - b[2] < 0.2);
    },
    key(k: Key) {
      if (isQuit(k)) {
        p.done = true;
        return true;
      }
      if (k.key === 'r' || k.key === 'R') {
        best(host, '2048', score);
        start();
        return true;
      }
      if ((k.key === 'u' || k.key === 'U') && undo) {
        grid = undo.grid;
        score = undo.score;
        undo = null;
        over = false;
        return true;
      }
      const d = dir(k);
      if (d >= 0 && !over) move(d);
      return true;
    },
    draw(g: Gfx) {
      const side = Math.floor(Math.min(g.W * 0.6, g.H - g.ch * 0.4));
      const cell = side / N;
      const ox = Math.floor((g.W - side) / 2 - g.cw * 6);
      const oy = Math.floor((g.H - side) / 2);
      g.frame(ox - 3, oy - 3, side + 6, side + 6, 'dim', 2);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const v = grid[y][x];
          const cx = ox + x * cell;
          const cy = oy + y * cell;
          g.rect(cx + 3, cy + 3, cell - 6, cell - 6, 'dim', 0.18);
          if (!v) continue;
          const b = born.find((q) => q[0] === x && q[1] === y);
          const pop = b ? Math.min(1, (now - b[2]) / 0.16) : 1;
          const grow = b ? 0.75 + 0.25 * pop : 1;
          const inset = 3 + ((cell - 6) * (1 - grow)) / 2;
          const lvl = Math.log2(v);
          const big = v >= 128;
          g.rect(cx + inset, cy + inset, cell - inset * 2, cell - inset * 2, big ? 'hi' : 'out', Math.min(1, 0.22 + lvl * 0.1));
          const label = String(v);
          const scale = Math.min(2.2, (cell * 0.72) / (label.length * g.cw), (cell * 0.5) / g.ch);
          g.textPx(cx + cell / 2 - (label.length * g.cw * scale) / 2, cy + cell / 2 - (g.ch * scale) / 2, label, lvl >= 5 ? 'inv' : 'hi', scale);
        }
      const sx = ox + side + g.cw * 3;
      const info: [string, string][] = [
        ['SCORE', String(score)],
        ['BEST', String(Math.max(best(host, '2048'), score))],
      ];
      info.forEach(([k, v], i) => {
        g.textPx(sx, oy + g.ch * i * 2.4, k, 'dim');
        g.textPx(sx, oy + g.ch * (i * 2.4 + 0.95), v, 'hi', 1.2);
      });
      const msg = over ? ['no moves left.', 'r again · u undo'] : won ? ['2048!', 'keep going'] : [];
      msg.forEach((m, i) => g.textPx(sx, oy + g.ch * (5.4 + i * 1.2), m, i ? 'dim' : 'ok'));
    },
    exit() {
      best(host, '2048', score);
      const top = Math.max(0, ...grid.flat());
      return score ? [{ text: `2048: ${score} points, biggest tile ${top}.`, tone: 'dim' }] : [];
    },
  };
  return p;
}
