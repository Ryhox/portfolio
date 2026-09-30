import type { Gfx, Host, Key, Program, Tone } from '../types';
import { best, isQuit } from './common';

const W = 10;
const H = 20;

const SHAPES: Record<string, { cells: number[][]; tone: Tone }> = {
  I: { cells: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], tone: 'hi' },
  O: { cells: [[1, 1], [1, 1]], tone: 'ok' },
  T: { cells: [[0, 1, 0], [1, 1, 1], [0, 0, 0]], tone: 'out' },
  S: { cells: [[0, 1, 1], [1, 1, 0], [0, 0, 0]], tone: 'ok' },
  Z: { cells: [[1, 1, 0], [0, 1, 1], [0, 0, 0]], tone: 'err' },
  J: { cells: [[1, 0, 0], [1, 1, 1], [0, 0, 0]], tone: 'out' },
  L: { cells: [[0, 0, 1], [1, 1, 1], [0, 0, 0]], tone: 'hi' },
};
const rotate = (m: number[][]) => m[0].map((_, i) => m.map((row) => row[i]).reverse());

type Piece = { kind: string; m: number[][]; x: number; y: number };

/** Tetris: arrows move, up rotates, down drops a row, space drops it all the way; p pauses, q quits. */
export function tetris(host: Host): Program {
  let board: (Tone | null)[][] = [];
  let bag: string[] = [];
  let cur: Piece;
  let next: string;
  let score = 0;
  let lines = 0;
  let state: 'play' | 'paused' | 'over' = 'play';
  let fall = 0;
  let lock = 0;
  let locks = 0;
  let clearing: number[] = [];
  let clearT = 0;

  const level = () => 1 + Math.floor(lines / 10);
  const interval = () => Math.max(0.07, 0.8 - (level() - 1) * 0.07);
  const draw = () => {
    if (!bag.length) {
      bag = Object.keys(SHAPES);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop()!;
  };
  const fits = (m: number[][], x: number, y: number) =>
    m.every((row, j) => row.every((v, i) => !v || (x + i >= 0 && x + i < W && y + j < H && (y + j < 0 || !board[y + j][x + i]))));
  const spawn = () => {
    const kind = next;
    next = draw();
    const m = SHAPES[kind].cells.map((r) => [...r]);
    cur = { kind, m, x: Math.floor((W - m[0].length) / 2), y: kind === 'I' ? -1 : 0 };
    lock = 0;
    locks = 0;
    if (!fits(cur.m, cur.x, cur.y)) {
      state = 'over';
      best(host, 'tetris', score);
      host.blip?.('lose');
    }
  };
  const start = () => {
    board = Array.from({ length: H }, () => Array(W).fill(null));
    bag = [];
    next = draw();
    score = 0;
    lines = 0;
    state = 'play';
    clearing = [];
    spawn();
  };
  const settle = () => {
    cur.m.forEach((row, j) => row.forEach((v, i) => v && cur.y + j >= 0 && (board[cur.y + j][cur.x + i] = SHAPES[cur.kind].tone)));
    const full = board.map((r, y) => (r.every(Boolean) ? y : -1)).filter((y) => y >= 0);
    if (full.length) {
      clearing = full;
      clearT = 0.18;
      score += [0, 100, 300, 500, 800][full.length] * level();
      lines += full.length;
      host.blip?.(full.length === 4 ? 'win' : 'eat');
    } else host.blip?.('move');
    spawn();
  };
  const move = (dx: number, dy: number) => {
    if (!fits(cur.m, cur.x + dx, cur.y + dy)) return false;
    cur.x += dx;
    cur.y += dy;
    if (lock > 0 && locks < 15) {
      lock = 0;
      locks++;
    }
    return true;
  };
  const turn = (times: number) => {
    let m = cur.m;
    for (let i = 0; i < times; i++) m = rotate(m);
    for (const [kx, ky] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]]) {
      if (fits(m, cur.x + kx, cur.y + ky)) {
        cur.m = m;
        cur.x += kx;
        cur.y += ky;
        if (lock > 0 && locks < 15) {
          lock = 0;
          locks++;
        }
        return;
      }
    }
  };
  const ghost = () => {
    let y = cur.y;
    while (fits(cur.m, cur.x, y + 1)) y++;
    return y;
  };

  start();

  const p: Program = {
    mode: 'screen',
    done: false,
    hint: 'tetris · arrows · up turns · space drops · p pauses · q quits',
    tick(_t, dt) {
      if (clearing.length) {
        clearT -= dt;
        if (clearT <= 0) {
          board = board.filter((_, y) => !clearing.includes(y));
          while (board.length < H) board.unshift(Array(W).fill(null));
          clearing = [];
        }
        return true;
      }
      if (state !== 'play') return false;
      fall += dt;
      let changed = false;
      if (fall >= interval()) {
        fall = 0;
        changed = move(0, 1) || changed;
      }
      if (!fits(cur.m, cur.x, cur.y + 1)) {
        lock += dt;
        if (lock > 0.45) {
          settle();
          changed = true;
        }
      } else lock = 0;
      return changed;
    },
    key(k: Key) {
      if (isQuit(k)) {
        p.done = true;
        return true;
      }
      if (state === 'over') {
        if (k.key === 'r' || k.key === 'Enter') start();
        return true;
      }
      if (k.key === 'p' || k.key === 'P') {
        state = state === 'paused' ? 'play' : 'paused';
        return true;
      }
      if (state !== 'play' || clearing.length) return true;
      switch (k.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          move(-1, 0);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          move(1, 0);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          if (move(0, 1)) {
            score += 1;
            fall = 0;
          }
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
        case 'x':
        case 'X':
          turn(1);
          break;
        case 'z':
        case 'Z':
          turn(3);
          break;
        case ' ': {
          const y = ghost();
          score += 2 * (y - cur.y);
          cur.y = y;
          settle();
          break;
        }
      }
      return true;
    },
    draw(g: Gfx) {
      const s = Math.max(5, Math.floor((g.H - 4) / H));
      const bwPx = s * W;
      const side = Math.max(g.cw * 14, s * 5);
      const ox = Math.floor((g.W - bwPx - side) / 2);
      const oy = Math.floor((g.H - s * H) / 2);
      g.frame(ox - 3, oy - 3, bwPx + 6, s * H + 6, 'dim', 2);
      const block = (x: number, y: number, tone: Tone, alpha = 1) => {
        g.rect(x + 1, y + 1, s - 2, s - 2, tone, alpha);
        g.rect(x + 1, y + 1, s - 2, Math.max(1, s * 0.16), 'hi', 0.35 * alpha);
      };
      board.forEach((row, y) =>
        row.forEach((t, x) => {
          if (!t) return;
          const flashing = clearing.includes(y);
          block(ox + x * s, oy + y * s, flashing ? 'hi' : t, flashing ? 1 : 0.9);
        }),
      );
      if (state !== 'over' && !clearing.length) {
        const gy = ghost();
        cur.m.forEach((row, j) =>
          row.forEach((v, i) => {
            if (!v) return;
            if (gy + j >= 0) g.frame(ox + (cur.x + i) * s + 2, oy + (gy + j) * s + 2, s - 4, s - 4, 'dim', 1);
            if (cur.y + j >= 0) block(ox + (cur.x + i) * s, oy + (cur.y + j) * s, SHAPES[cur.kind].tone);
          }),
        );
      }
      // the side: what is next, and how it is going
      const sx = ox + bwPx + g.cw * 2;
      g.textPx(sx, oy, 'NEXT', 'dim');
      const nm = SHAPES[next].cells;
      const ns = Math.floor(s * 0.8);
      nm.forEach((row, j) => row.forEach((v, i) => v && g.rect(sx + i * ns + 1, oy + g.ch * 1.3 + j * ns + 1, ns - 2, ns - 2, SHAPES[next].tone)));
      const info: [string, string][] = [
        ['SCORE', String(score)],
        ['LINES', String(lines)],
        ['LEVEL', String(level())],
        ['BEST', String(Math.max(best(host, 'tetris'), score))],
      ];
      info.forEach(([k, v], i) => {
        const y = oy + g.ch * (4.2 + i * 2.1);
        if (y + g.ch * 2 > g.H) return;
        g.textPx(sx, y, k, 'dim');
        g.textPx(sx, y + g.ch * 0.95, v, 'hi');
      });
      const mid = Math.floor(g.rows / 2);
      const col = Math.floor((ox + bwPx / 2) / g.cw);
      const at = (row: number, t: string) => g.text(Math.max(0, col - Math.floor(t.length / 2)), row, t, 'inv');
      if (state === 'paused') at(mid, ' paused ');
      if (state === 'over') {
        at(mid - 1, ' game over ');
        at(mid + 1, ' r again · q quits ');
      }
    },
    exit() {
      best(host, 'tetris', score);
      return score ? [{ text: `tetris: ${score} points, ${lines} lines. best ${best(host, 'tetris')}.`, tone: 'dim' }] : [];
    },
  };
  return p;
}
