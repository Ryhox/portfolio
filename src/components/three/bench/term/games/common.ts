import type { Host, Key } from '../types';

/** The best score kept for a game (in the browser, when it lets us), raised if `score` beats it. */
export function best(host: Host, game: string, score?: number, lower = false): number {
  const k = `ryhox:best:${game}`;
  let b = Number(host.store?.get(k) ?? NaN);
  if (score !== undefined && score > 0 && (!Number.isFinite(b) || (lower ? score < b : score > b))) {
    b = score;
    host.store?.set(k, String(score));
  }
  return Number.isFinite(b) ? b : 0;
}

/** Arrows, WASD and HJKL, as a direction: 0 up, 1 right, 2 down, 3 left; -1 for anything else. */
export function dir(k: Key): number {
  switch (k.key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
    case 'k':
      return 0;
    case 'ArrowRight':
    case 'd':
    case 'D':
    case 'l':
      return 1;
    case 'ArrowDown':
    case 's':
    case 'S':
    case 'j':
      return 2;
    case 'ArrowLeft':
    case 'a':
    case 'A':
    case 'h':
      return 3;
    default:
      return -1;
  }
}

export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

export const isQuit = (k: Key) => k.key === 'q' || k.key === 'Q' || k.key === 'Escape';
export const isGo = (k: Key) => k.key === 'Enter' || k.key === ' ' || k.key === 'r' || k.key === 'R';
