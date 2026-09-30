import type { Gfx, Host, Key, Program } from '../types';
import { dir, DX, DY, isQuit } from './common';

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];
type Cell = '' | 'X' | 'O';

const winner = (b: Cell[]) => {
  for (const l of LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return { who: b[l[0]], line: l };
  return b.every(Boolean) ? { who: 'draw' as const, line: [] as number[] } : null;
};

/** The machine's move: it has read every game there is (minimax), so the best you can do is draw. */
function best(b: Cell[]): number {
  let bestScore = -Infinity;
  let move = -1;
  const score = (board: Cell[], turn: 'X' | 'O', depth: number): number => {
    const w = winner(board);
    if (w) return w.who === 'O' ? 10 - depth : w.who === 'X' ? depth - 10 : 0;
    let bestV = turn === 'O' ? -Infinity : Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      board[i] = turn;
      const v = score(board, turn === 'O' ? 'X' : 'O', depth + 1);
      board[i] = '';
      bestV = turn === 'O' ? Math.max(bestV, v) : Math.min(bestV, v);
    }
    return bestV;
  };
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = 'O';
    const v = score(b, 'X', 1) + Math.random() * 0.1;
    b[i] = '';
    if (v > bestScore) {
      bestScore = v;
      move = i;
    }
  }
  return move;
}

/** Tic-tac-toe against the machine. Arrows (or 1 to 9) and space; r again; q quits. */
export function ttt(host: Host): Program {
  let board: Cell[] = Array(9).fill('');
  let cursor = 4;
  let youFirst = true;
  let think = 0;
  const tally = { you: 0, machine: 0, draw: 0 };
  let counted = false;

  const start = () => {
    board = Array(9).fill('');
    counted = false;
    think = youFirst ? 0 : 0.5;
  };
  const result = () => winner(board);
  const place = (i: number) => {
    if (board[i] || result() || think > 0) return;
    board[i] = 'X';
    host.blip?.('move');
    if (!result()) think = 0.45;
  };

  const p: Program = {
    mode: 'screen',
    done: false,
    hint: 'ttt · arrows and space, or 1 to 9 · r again · q quits',
    tick(_t, dt) {
      if (think <= 0) return false;
      think -= dt;
      if (think <= 0) {
        const m = best(board);
        if (m >= 0) board[m] = 'O';
        host.blip?.('hit');
        const w = result();
        if (w && !counted) {
          counted = true;
          if (w.who === 'O') tally.machine++;
          else if (w.who === 'draw') tally.draw++;
        }
      }
      return true;
    },
    key(k: Key) {
      if (isQuit(k)) {
        p.done = true;
        return true;
      }
      if (result() && (k.key === 'r' || k.key === 'Enter' || k.key === ' ')) {
        youFirst = !youFirst;
        start();
        return true;
      }
      const d = dir(k);
      if (d >= 0) {
        const x = (cursor % 3) + DX[d];
        const y = Math.floor(cursor / 3) + DY[d];
        cursor = ((y + 3) % 3) * 3 + ((x + 3) % 3);
      } else if (/^[1-9]$/.test(k.key)) {
        cursor = Number(k.key) - 1;
        place(cursor);
      } else if (k.key === ' ' || k.key === 'Enter') place(cursor);
      const w = result();
      if (w && !counted) {
        counted = true;
        if (w.who === 'X') tally.you++;
        else if (w.who === 'draw') tally.draw++;
        host.blip?.(w.who === 'X' ? 'win' : 'lose');
      }
      return true;
    },
    draw(g: Gfx) {
      const side = Math.floor(Math.min(g.H - g.ch * 0.5, g.W * 0.5));
      const cell = side / 3;
      const ox = Math.floor((g.W - side) / 2 - g.cw * 8);
      const oy = Math.floor((g.H - side) / 2);
      for (let i = 1; i < 3; i++) {
        g.rect(ox + cell * i - 1.5, oy, 3, side, 'dim');
        g.rect(ox, oy + cell * i - 1.5, side, 3, 'dim');
      }
      const w = result();
      board.forEach((v, i) => {
        const x = ox + (i % 3) * cell;
        const y = oy + Math.floor(i / 3) * cell;
        if (i === cursor && !w) g.frame(x + 6, y + 6, cell - 12, cell - 12, 'hi', 2);
        if (!v) {
          if (!w) g.textPx(x + 8, y + 6, String(i + 1), 'dim', 0.7);
          return;
        }
        const lit = w && w.line.includes(i);
        const sc = (cell * 0.62) / g.ch;
        g.textPx(x + cell / 2 - (g.cw * sc) / 2, y + cell / 2 - (g.ch * sc) / 2, v, lit ? 'inv' : v === 'X' ? 'hi' : 'out', sc);
      });
      const sx = ox + side + g.cw * 3;
      const rows: [string, string][] = [
        ['YOU (X)', String(tally.you)],
        ['MACHINE (O)', String(tally.machine)],
        ['DRAWN', String(tally.draw)],
      ];
      rows.forEach(([k, v], i) => {
        g.textPx(sx, oy + g.ch * i * 2.2, k, 'dim');
        g.textPx(sx, oy + g.ch * (i * 2.2 + 0.95), v, 'hi');
      });
      const note = !w ? (think > 0 ? 'the machine thinks...' : 'your move.') : w.who === 'X' ? 'you won. that should not happen.' : w.who === 'O' ? 'the machine wins.' : 'a strange game. the only';
      g.textPx(sx, oy + g.ch * 7, note, w ? 'ok' : 'dim');
      if (w && w.who === 'draw') g.textPx(sx, oy + g.ch * 8, 'winning move is not to play.', 'ok');
      if (w) g.textPx(sx, oy + g.ch * 9.4, 'r again · q quits', 'dim');
    },
    exit() {
      return tally.you + tally.machine + tally.draw ? [{ text: `ttt: you ${tally.you}, the machine ${tally.machine}, drawn ${tally.draw}.`, tone: 'dim' }] : [];
    },
  };
  return p;
}
