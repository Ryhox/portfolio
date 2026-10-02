const svg = (size: number, body: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${body}</svg>`)}`;

// ── here: the automaton ─────────────────────────────────────────────────────────────────────

/**
 * The automaton of the bench's tube (Greeter.ts) from the hips up, cell for cell, in the colours
 * it has on the glass: # lit, o bright, - dim, k the dark behind it (painted in where it shows
 * through him, so he reads on a pale tab too). What moves is drawn over this: the face, and the
 * arm that waves.
 */
const FIGURE = [
  '.........oo.............',
  '.........oo.............',
  '.........--.............',
  '.....##########.........',
  '....############........',
  '....############........',
  '....############........',
  '....############........',
  '....############........',
  '....############........',
  '....############........',
  '....############........',
  '.....##########.........',
  '.......------...........',
  '.################.......',
  '.##.############........',
  '.##.####kkkk####........',
  '.##.###kkokkk###........',
  '.##.###kkoook###........',
  '.##.###kkkkkk###........',
  '.##.####kkkk####........',
  'oooo############........',
  'oooo.----------.........',
  'oooo.##########.........',
];
const CELLS = FIGURE.length;
/** what is painted, bottom to top: a colour, and the cells it goes under */
const LAYERS = [
  ['#f1d688', '#k'],
  ['#c58e38', '-'],
  ['#1e1005', 'k'],
  ['#ece5d4', 'o'],
];
/** the arm that waves: from its shoulder to its elbow, and a forearm on from there */
const SHOULDER = [16, 14];
const ELBOW = [19, 11];
const FOREARM = 5;
/** how far the forearm leans either side of straight up (radians): out, and in towards the head */
const LEAN = 0.31;

type Mood = 'calm' | 'blink' | 'glad';

function automaton(swing: number, mood: Mood = 'calm') {
  const grid = FIGURE.map((row) => row.split(''));
  const put = (c: number, r: number, ink: string) => {
    if (r >= 0 && r < CELLS && c >= 0 && c < CELLS) grid[r][c] = ink;
  };

  // the face: eyes and mouth are holes in it
  for (const x of [6, 12]) {
    if (mood === 'glad') for (const [c, r] of [[x, 6], [x + 1, 6], [x - 1, 7], [x + 2, 7]]) put(c, r, 'k');
    else for (let r = mood === 'blink' ? 7 : 6; r <= 7; r++) for (const c of [x, x + 1]) put(c, r, 'k');
  }
  for (let c = 8; c <= 11; c++) put(c, 10, 'k');
  if (mood === 'glad') for (let c = 8; c <= 11; c++) put(c, 9, 'k');
  else for (const c of [7, 12]) put(c, 9, 'k');

  // the arm: two cells thick, its hand at the end
  const limb = (ax: number, ay: number, bx: number, by: number) => {
    const n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2);
    for (let i = 0; i <= n; i++) {
      const c = Math.round(ax + ((bx - ax) * i) / n);
      const r = Math.round(ay + ((by - ay) * i) / n);
      for (const [dc, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(c + dc, r + dr, '#');
    }
  };
  const tx = ELBOW[0] + Math.sin(swing) * FOREARM;
  const ty = ELBOW[1] - Math.cos(swing) * FOREARM;
  limb(SHOULDER[0], SHOULDER[1], ELBOW[0], ELBOW[1]);
  limb(ELBOW[0], ELBOW[1], tx, ty);
  const hc = Math.round(tx + Math.sin(swing) * 1.5);
  const hr = Math.round(ty - Math.cos(swing) * 1.5);
  for (let r = -1; r <= 1; r++) for (let c = -1; c <= 2; c++) put(hc + c, hr + r, 'o');

  // a path to a layer, a run of cells at a time
  return svg(
    CELLS,
    LAYERS.map(([fill, inks]) => {
      let d = '';
      grid.forEach((row, r) => {
        for (let c = 0, n = 1; c < CELLS; c += n, n = 1) {
          if (!inks.includes(row[c])) continue;
          while (c + n < CELLS && inks.includes(row[c + n])) n++;
          d += `M${c} ${r}h${n}v1h-${n}z`;
        }
      });
      return `<path fill="${fill}" d="${d}"/>`;
    }).join(''),
  );
}

/** a picture, and how long it is shown (ms) */
export type Step = [href: string, ms: number];

/** a wave: the hand in to the head and out again, twice */
const wave = (mood: Mood): Step[] =>
  [0, -LEAN, 0, LEAN, 0, -LEAN, 0].map((swing) => [automaton(swing, mood), swing ? 150 : 110]);

/** It at rest, its hand up (the same picture as `app/icon.svg`, which the tab has before any of this runs). */
export const STILL = automaton(LEAN);

/** What it does of its own accord: it blinks, and now and then it waves. */
export const IDLE: Step[] = [[STILL, 3200], [automaton(LEAN, 'blink'), 170], [STILL, 2400], ...wave('calm')];

/** And when you come back to it: it beams, waving. */
export const GREET: Step[] = [...wave('glad'), [automaton(LEAN, 'glad'), 600]];

// ── elsewhere: a pocket watch ───────────────────────────────────────────────────────────────

/** The watch, its hands at the time given (as the clock on the wall of whoever is looking has it). */
export function watch(d: Date) {
  const m = d.getMinutes();
  const tip = (turn: number, len: number) => {
    const a = turn * Math.PI * 2;
    return `${(32 + Math.sin(a) * len).toFixed(1)} ${(37 - Math.cos(a) * len).toFixed(1)}`;
  };
  return svg(
    64,
    `<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1d196"/><stop offset="1" stop-color="#9c6a33"/></linearGradient></defs>` +
      `<rect x="27" y="2" width="10" height="9" rx="2" fill="url(#b)"/>` +
      `<circle cx="32" cy="37" r="25" fill="url(#b)"/>` +
      `<circle cx="32" cy="37" r="20" fill="#ebe1cb"/>` +
      `<path d="M${tip(m / 60, 15)}L32 37L${tip(((d.getHours() % 12) + m / 60) / 12, 9.5)}" fill="none" stroke="#120d08" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<circle cx="32" cy="37" r="3" fill="#120d08"/>`,
  );
}
