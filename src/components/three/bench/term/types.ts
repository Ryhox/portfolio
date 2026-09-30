/**
 * The terminal on the Lumen 64: what the shell prints, and what programs that take over the
 * screen (the games, sl, the editor) are made of. Nothing in here knows about three.js or the page.
 */
/** out: amber · dim: the rules' brown · hi: pale · ok: gold · err: red · inv: dark on a lit cell */
export type Tone = 'out' | 'dim' | 'hi' | 'err' | 'ok' | 'inv';
export type Seg = readonly [text: string, tone?: Tone];
/** A line of output: one tone, or several segments (`text` is then their concatenation). */
export type Line = { text: string; tone?: Tone; segs?: Seg[] };

export const ln = (text: string, tone?: Tone): Line => ({ text, tone });
export const segs = (...s: Seg[]): Line => ({ text: s.map((x) => x[0]).join(''), segs: s });
export const lines = (text: string, tone?: Tone): Line[] => text.split('\n').map((t) => ({ text: t, tone }));

export type Key = { key: string; ctrl: boolean; shift: boolean };

/** What a program that takes the whole screen draws with: the tube's region, in pixels and in cells. */
export interface Gfx {
  /** the region's size in pixels */
  W: number;
  H: number;
  /** a text cell, in pixels, and how many fit */
  cw: number;
  ch: number;
  cols: number;
  rows: number;
  /** text on the cell grid */
  text(col: number, row: number, s: string, tone?: Tone): void;
  /** text centred on a row of the grid */
  center(row: number, s: string, tone?: Tone): void;
  /** a line of output (with its segments) on the grid */
  line(col: number, row: number, l: Line): void;
  /** text in inverse video: dark on a lit bar */
  invert(col: number, row: number, s: string, tone?: Tone): void;
  /** the cursor's blink, for programs that draw their own */
  blink: boolean;
  /** text at a pixel position (left edge, top of the cell), optionally larger or smaller */
  textPx(x: number, y: number, s: string, tone?: Tone, scale?: number): void;
  /** a filled rectangle, in pixels */
  rect(x: number, y: number, w: number, h: number, tone?: Tone, alpha?: number): void;
  /** an outlined rectangle, in pixels */
  frame(x: number, y: number, w: number, h: number, tone?: Tone, width?: number): void;
}

/**
 * Something that keeps running after its command returns. `screen` programs take the whole tube
 * until they quit; `inline` ones print into the scrollback as they go (ping, sleep, a guessing game).
 */
export interface Program {
  mode: 'screen' | 'inline';
  /** screen programs: the text size, relative to the terminal's */
  scale?: number;
  /** per frame (seconds); true when the picture changed */
  tick?(t: number, dt: number): boolean;
  /** a key press; true when it was taken */
  key?(k: Key): boolean;
  /** a key let go (for games that move while a key is held) */
  release?(k: Key): void;
  draw?(g: Gfx): void;
  /** what the footer says while it runs */
  hint?: string;
  /** line-based programs read what is typed at their own prompt */
  prompt?: string;
  /** the typed line is not echoed (a password) */
  secret?: boolean;
  input?(text: string): void;
  /** set once it has ended */
  done: boolean;
  /** called once when it ends (or is interrupted); lines it leaves behind in the scrollback */
  exit?(interrupted: boolean): Line[] | void;
}

/** What the page lends the shell. Everything is optional: the shell runs headless too. */
export type Host = {
  sound?: (on?: boolean) => boolean;
  music?: (action: string) => string | null;
  /** go down the page, into the works */
  enter?: () => void;
  /** open an address in a new tab */
  open?: (url: string) => void;
  /** a short sound for games and the bell */
  blip?: (kind: 'move' | 'eat' | 'hit' | 'win' | 'lose' | 'bell') => void;
  /** remembered between visits (high scores) */
  store?: { get(k: string): string | null; set(k: string, v: string): void };
};

/** What a running command can reach while it runs. */
export type Io = {
  /** print straight into the scrollback (inline programs) */
  print: (...l: Line[]) => void;
  cols: () => number;
  rows: () => number;
  /** empty the screen (and the banner with it) */
  clear: () => void;
  /** the screen as it was on arrival: the banner and the greeting */
  reset: () => void;
  /** hand the terminal to another program once this one has ended (sudo does) */
  spawn: (p: Program) => void;
};
