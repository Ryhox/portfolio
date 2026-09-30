import { HANGMAN_WORDS } from '../cmd/words';
import { ln, segs, type Gfx, type Host, type Io, type Key, type Program } from '../types';
import { best } from './common';

const GALLOWS = [
  ['  ┌────┐  ', '  │       ', '  │       ', '  │       ', '  │       ', '──┴────── '],
  ['  ┌────┐  ', '  │    O  ', '  │       ', '  │       ', '  │       ', '──┴────── '],
  ['  ┌────┐  ', '  │    O  ', '  │    │  ', '  │       ', '  │       ', '──┴────── '],
  ['  ┌────┐  ', '  │    O  ', '  │   /│  ', '  │       ', '  │       ', '──┴────── '],
  ['  ┌────┐  ', '  │    O  ', '  │   /│\\ ', '  │       ', '  │       ', '──┴────── '],
  ['  ┌────┐  ', '  │    O  ', '  │   /│\\ ', '  │   /   ', '  │       ', '──┴────── '],
  ['  ┌────┐  ', '  │    O  ', '  │   /│\\ ', '  │   / \\ ', '  │       ', '──┴────── '],
];

/** Hangman: type letters to find the word before the drawing is done. Esc quits. */
export function hangman(host: Host): Program {
  let word = '';
  let guessed = new Set<string>();
  let misses = 0;
  let state: 'play' | 'won' | 'lost' = 'play';
  let wins = 0;
  const start = () => {
    word = HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
    guessed = new Set();
    misses = 0;
    state = 'play';
  };
  start();
  const p: Program = {
    mode: 'screen',
    done: false,
    hint: 'hangman · type letters · esc quits',
    key(k: Key) {
      if (k.key === 'Escape' || (state !== 'play' && (k.key === 'q' || k.key === 'Q'))) {
        p.done = true;
        return true;
      }
      if (state !== 'play') {
        if (k.key === 'Enter' || k.key === ' ' || k.key === 'r') start();
        return true;
      }
      const ch = k.key.toLowerCase();
      if (!/^[a-z]$/.test(ch) || k.ctrl || guessed.has(ch)) return true;
      guessed.add(ch);
      if (!word.includes(ch)) {
        misses++;
        host.blip?.('hit');
        if (misses >= 6) {
          state = 'lost';
          host.blip?.('lose');
        }
      } else {
        host.blip?.('eat');
        if ([...word].every((c) => guessed.has(c))) {
          state = 'won';
          wins++;
          best(host, 'hangman', wins);
          host.blip?.('win');
        }
      }
      return true;
    },
    draw(g: Gfx) {
      const art = GALLOWS[misses];
      const y0 = Math.max(0, Math.floor((g.rows - 8) / 2));
      const x0 = Math.max(0, Math.floor(g.cols / 2) - 22);
      art.forEach((l, i) => g.text(x0, y0 + i, l, misses >= 6 ? 'err' : 'out'));
      const shown = [...word].map((c) => (guessed.has(c) || state === 'lost' ? c : '_')).join(' ');
      const wx = x0 + 14;
      g.text(wx, y0 + 1, shown, state === 'won' ? 'ok' : state === 'lost' ? 'err' : 'hi');
      const wrong = [...guessed].filter((c) => !word.includes(c)).join(' ');
      g.text(wx, y0 + 3, `misses  ${wrong || '-'}`, 'dim');
      g.text(wx, y0 + 4, `left    ${6 - misses}`, 'dim');
      const msg = state === 'won' ? 'got it. enter for another.' : state === 'lost' ? `it was "${word}". enter for another.` : 'type a letter.';
      g.text(wx, y0 + 6, msg, state === 'play' ? 'dim' : 'ok');
    },
    exit() {
      return wins ? [ln(`hangman: ${wins} word${wins === 1 ? '' : 's'} found.`, 'dim')] : [];
    },
  };
  return p;
}

/** Guess the number, at its own prompt. */
export function guess(io: Io, host: Host): Program {
  const n = 1 + Math.floor(Math.random() * 100);
  let tries = 0;
  io.print(ln("i picked a number from 1 to 100. guess it. (q gives up)", 'hi'));
  const p: Program = {
    mode: 'inline',
    done: false,
    prompt: 'guess> ',
    hint: 'guess · type a number · q gives up',
    input(text) {
      io.print(segs(['guess> ', 'dim'], [text]));
      const t = text.trim();
      if (/^(q|quit|exit)$/i.test(t)) {
        io.print(ln(`it was ${n}.`, 'dim'));
        p.done = true;
        return;
      }
      const g = parseInt(t, 10);
      if (!Number.isFinite(g)) {
        io.print(ln('a number, from 1 to 100.', 'dim'));
        return;
      }
      tries++;
      if (g === n) {
        const b = best(host, 'guess', tries, true);
        io.print(ln(`${n}. got it in ${tries} ${tries === 1 ? 'try' : 'tries'}.${b === tries ? ' a new best.' : ` best: ${b}.`}`, 'ok'));
        host.blip?.('win');
        p.done = true;
      } else io.print(ln(g < n ? 'higher.' : 'lower.', 'out'));
    },
  };
  return p;
}
