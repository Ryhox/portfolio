import { GAMES } from '../files';
import { g2048 } from '../games/g2048';
import { mines } from '../games/mines';
import { pong } from '../games/pong';
import { snake } from '../games/snake';
import { tetris } from '../games/tetris';
import { ttt } from '../games/ttt';
import { guess, hangman } from '../games/words';
import { clock, donut, hack, matrix, pipes, sl } from '../programs/fun';
import type { Cmd, Ctx } from '../shell';
import { ln, segs, type Line, type Program } from '../types';
import { opts, pick } from '../util';
import { EIGHT_BALL, JOKES } from './words';

const err = (text: string): Line => ln(text, 'err');
/** Programs that take the screen cannot run into a pipe. */
const screen = (c: Ctx, make: () => Program): Line[] | Program => (c.piped ? [err(`${c.name}: the output is not a terminal`)] : make());

function roll(c: Ctx): Line[] {
  const spec = (c.args[0] ?? '1d6').toLowerCase();
  const m = /^(\d*)d(\d+)$/.exec(spec);
  if (!m) return [err('usage: roll [NdM], like 2d6')];
  const n = Math.min(20, Math.max(1, parseInt(m[1] || '1', 10)));
  const sides = Math.min(1000, Math.max(2, parseInt(m[2], 10)));
  const dice = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
  const total = dice.reduce((a, b) => a + b, 0);
  if (sides === 6 && n <= 6) {
    // the faces, drawn
    const pips: Record<number, string[]> = {
      1: ['     ', '  o  ', '     '],
      2: ['o    ', '     ', '    o'],
      3: ['o    ', '  o  ', '    o'],
      4: ['o   o', '     ', 'o   o'],
      5: ['o   o', '  o  ', 'o   o'],
      6: ['o   o', 'o   o', 'o   o'],
    };
    const rows = ['┌───────┐', '│ A │', '│ B │', '│ C │', '└───────┘'];
    const out = rows.map((r, i) =>
      ln(
        dice
          .map((d) => (i === 0 || i === 4 ? r : `│ ${pips[d][i - 1]} │`))
          .join(' '),
        'hi',
      ),
    );
    return [...out, ln(n > 1 ? `total ${total}` : `${total}`, 'dim')];
  }
  return [ln(`${dice.join(' + ')}${n > 1 ? ` = ${total}` : ''}`)];
}

export const funCommands: Record<string, Cmd> = {
  sl: {
    group: 'fun',
    desc: 'a steam locomotive (for when you meant ls)',
    usage: 'sl [-l] [-F] [-a]',
    run: (c) => screen(c, () => sl(opts(c.args).flags)),
  },
  cmatrix: { group: 'fun', desc: 'code rain (q quits)', run: (c) => screen(c, matrix) },
  donut: { group: 'fun', desc: 'a spinning donut (q quits)', run: (c) => screen(c, donut) },
  pipes: { group: 'fun', desc: 'plumbing (q quits)', run: (c) => screen(c, pipes) },
  clock: { group: 'fun', desc: 'a big clock (q quits)', run: (c) => screen(c, clock) },
  hack: { group: 'fun', desc: 'hack the mainframe', run: (c) => (c.piped ? [err('hack: needs a terminal')] : hack(c.io)) },
  '8ball': {
    group: 'fun',
    desc: 'ask the magic 8-ball',
    usage: '8ball <question>',
    run: (c) => (c.args.length ? [ln(pick(EIGHT_BALL), 'hi')] : [ln('ask it something. 8ball will i ship today?', 'dim')]),
  },
  roll: { group: 'fun', desc: 'roll dice', usage: 'roll [NdM]', run: roll },
  flip: { group: 'fun', desc: 'toss a coin', run: () => [ln(Math.random() < 0.5 ? 'heads.' : 'tails.', 'hi')] },
  joke: {
    group: 'fun',
    desc: 'a programmer joke',
    run: () =>
      pick(JOKES)
        .split('\n')
        .map((t, i) => ln(t, i ? 'hi' : undefined)),
  },
  weather: {
    group: 'fun',
    desc: 'the weather at the bench',
    run: () => {
      const t = 18 + Math.floor(Math.random() * 6);
      return [
        segs(['    .-.     ', 'ok'], ['lumen, at the bench']),
        segs(['   (   ).   ', 'ok'], [`${t}°C, overcast with a chance of sparks`]),
        segs(['  (___(__)  ', 'ok'], ['wind: a draught from the radio', 'dim']),
        segs(['   ‚‘‚‘‚‘   ', 'dim'], ['steam: rising', 'dim']),
      ];
    },
  },
  coffee: { group: 'fun', desc: 'brew', hidden: true, run: () => [err('418: I\'m a teapot. the kettle is always on, though.')] },
  tea: { group: 'fun', desc: 'brew', hidden: true, run: () => [ln('the kettle is always on. pouring.', 'ok')] },
  hello: { group: 'fun', desc: 'say hello', hidden: true, run: () => [ln('hello. the kettle is on.')] },
  hi: { group: 'fun', desc: 'say hi', hidden: true, run: () => [ln('hi. type help to see what this machine can do.')] },
  xyzzy: { group: 'fun', desc: 'a magic word', hidden: true, run: () => [ln('Nothing happens.')] },
  make: {
    group: 'fun',
    desc: 'build something',
    hidden: true,
    run: (c) => {
      const t = c.args.join(' ');
      if (t === 'me a sandwich') return [err('What? Make it yourself.')];
      if (!t) return [err('make: *** No targets specified and no makefile found.  Stop.')];
      return [err(`make: *** No rule to make target '${c.args[0]}'.  Stop.`)];
    },
  },
  '42': { group: 'fun', desc: 'the answer', hidden: true, run: () => [ln('the answer. now, what was the question?', 'dim')] },
  games: {
    group: 'games',
    desc: 'what there is to play',
    run: () => [
      ln('games in ~/games. type a name to play:', 'dim'),
      segs(['snake    ', 'hi'], ['eat the cogs, do not bite yourself']),
      segs(['tetris   ', 'hi'], ['the blocks. space drops them']),
      segs(['2048     ', 'hi'], ['slide the tiles, match the numbers']),
      segs(['pong     ', 'hi'], ['against the machine, first to 7']),
      segs(['mines    ', 'hi'], ['minesweeper. f flags']),
      segs(['ttt      ', 'hi'], ['tic-tac-toe. it has read every game']),
      segs(['hangman  ', 'hi'], ['find the word']),
      segs(['guess    ', 'hi'], ['a number from 1 to 100']),
    ],
  },
  snake: { group: 'games', desc: 'eat the cogs, do not bite yourself', run: (c) => screen(c, () => snake(c.host)) },
  tetris: { group: 'games', desc: 'the falling blocks', run: (c) => screen(c, () => tetris(c.host)) },
  '2048': { group: 'games', desc: 'slide and merge the tiles', run: (c) => screen(c, () => g2048(c.host)) },
  pong: { group: 'games', desc: 'pong against the machine', run: (c) => screen(c, () => pong(c.host)) },
  mines: { group: 'games', desc: 'minesweeper', run: (c) => screen(c, () => mines(c.host)) },
  minesweeper: { group: 'games', desc: 'minesweeper', hidden: true, run: (c) => screen(c, () => mines(c.host)) },
  ttt: { group: 'games', desc: 'tic-tac-toe', run: (c) => screen(c, () => ttt(c.host)) },
  tictactoe: { group: 'games', desc: 'tic-tac-toe', hidden: true, run: (c) => screen(c, () => ttt(c.host)) },
  hangman: { group: 'games', desc: 'find the word', run: (c) => screen(c, () => hangman(c.host)) },
  guess: { group: 'games', desc: 'guess the number', run: (c) => (c.piped ? [err('guess: needs a terminal')] : guess(c.io, c.host)) },
};

// every game in ~/games has its command
for (const g of GAMES) if (!funCommands[g]) throw new Error(`no command for the game ${g}`);
