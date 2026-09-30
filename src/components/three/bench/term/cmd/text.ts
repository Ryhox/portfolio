import { banner } from '../font';
import { read } from '../fs';
import { arith, show } from '../math';
import type { Cmd, Ctx } from '../shell';
import { ln, segs, type Line, type Program, type Tone } from '../types';
import { opts, pick, wrap } from '../util';
import { FORTUNES } from './words';

const err = (text: string): Line => ln(text, 'err');

/** The lines a text tool works on: its files, or what was piped into it. */
function source(c: Ctx, files: string[]): { text: string[]; errs: Line[] } {
  if (!files.length) return { text: c.stdin ?? [], errs: [] };
  const text: string[] = [];
  const errs: Line[] = [];
  for (const f of files) {
    const n = c.sh.node(f);
    if (!n) errs.push(err(`${c.name}: ${f}: No such file or directory`));
    else if (n.type === 'dir') errs.push(err(`${c.name}: ${f}: Is a directory`));
    else text.push(...read(n).replace(/\n$/, '').split('\n'));
  }
  return { text, errs };
}

const unescape = (s: string) => s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');

// ── cows ──────────────────────────────────────────────────────────────────────────────────────

const COWS: Record<string, (eyes: string, tongue: string, t: string) => string[]> = {
  default: (e, tg, t) => [`        ${t}   ^__^`, `         ${t}  (${e})\\_______`, `            (__)\\       )\\/\\`, `             ${tg} ||----w |`, `                ||     ||`],
  tux: (e, _tg, t) => [`   ${t}`, `    ${t}`, '        .--.', `       |${e[0]}_${e[1]} |`, '       |:_/ |', '      //   \\ \\', '     (|     | )', "    /'\\_   _/`\\", '    \\___)=(___/'],
  bunny: (e, _tg, t) => [`  ${t}`, `   ${t}  (\\_/)`, `      (${e[0]}.${e[1]})`, '      (> <)'],
  kitty: (e, _tg, t) => [`   ${t}`, `    ${t}  /\\_/\\`, `      ( ${e[0]}.${e[1]} )`, '       > ^ <'],
  cog: (_e, _tg, t) => [`   ${t}`, `    ${t}   _  _  _`, '       _| || || |_', '      |  .----.  |', '     _| |  ()  | |_', '      |  `----`  |', '       |_||_||_|'],
};

function cowsay(c: Ctx, think: boolean): Line[] {
  const { flags, values, rest } = opts(c.args, 'efT');
  if (flags.has('l')) return [ln('cow files in /usr/share/cows:', 'dim'), ln(Object.keys(COWS).join(' '))];
  let eyes = values.e?.slice(0, 2).padEnd(2) ?? 'oo';
  const moods: Record<string, string> = { b: '==', d: 'xx', g: '$$', p: '@@', s: '**', t: '--', w: 'OO', y: '..' };
  for (const [f, e] of Object.entries(moods)) if (flags.has(f)) eyes = e;
  const tongue = values.T?.slice(0, 2).padEnd(2) ?? (flags.has('d') || flags.has('s') ? 'U ' : '  ');
  const cow = COWS[values.f ?? 'default'];
  if (!cow) return [err(`cowsay: Could not find ${values.f} cowfile!`)];
  const said = rest.length ? rest.join(' ') : (c.stdin ?? []).join('\n') || pick(FORTUNES).split('\n')[0];
  const width = Math.max(8, Math.min(40, c.io.cols() - 6));
  const text = wrap(said, width);
  const w = Math.max(...text.map((l) => l.length));
  const out: string[] = [` ${'_'.repeat(w + 2)}`];
  if (text.length === 1) out.push(think ? `( ${text[0]} )` : `< ${text[0]} >`);
  else
    text.forEach((l, i) => {
      const [a, b] = think ? ['(', ')'] : i === 0 ? ['/', '\\'] : i === text.length - 1 ? ['\\', '/'] : ['|', '|'];
      out.push(`${a} ${l.padEnd(w)} ${b}`);
    });
  out.push(` ${'-'.repeat(w + 2)}`);
  out.push(...cow(eyes, tongue, think ? 'o' : '\\'));
  return out.map((t) => ln(t));
}

// ── calculators ───────────────────────────────────────────────────────────────────────────────

/** calc and bc with nothing to read: a little read-eval-print loop at its own prompt. */
function repl(c: Ctx, integer: boolean): Program {
  let last = 0;
  const p: Program = {
    mode: 'inline',
    done: false,
    prompt: '> ',
    hint: `${c.name} · type sums · quit or ^C leaves`,
    input(text) {
      const t = text.trim();
      c.io.print(segs(['> ', 'dim'], [text]));
      if (!t) return;
      if (/^(quit|exit|q)$/i.test(t)) {
        p.done = true;
        return;
      }
      try {
        last = arith(t.replace(/\bans\b/g, String(last)).replace(/,/g, '.'), integer);
        c.io.print(ln(show(integer ? Math.trunc(last) : last), 'hi'));
      } catch (e) {
        c.io.print(err((e as Error).message));
      }
    },
  };
  c.io.print(ln(`${c.name}: sums, powers (**), sqrt(), sin(), pi. "ans" is the last answer. quit leaves.`, 'dim'));
  return p;
}

function calc(c: Ctx, integer = false): Line[] | Program {
  const exprs = c.args.length ? [c.args.join(' ')] : (c.stdin ?? []).filter((l) => l.trim());
  if (!exprs.length) return c.piped ? [] : repl(c, integer);
  return exprs.map((e) => {
    try {
      return ln(show(arith(e.replace(/,/g, '.'), integer)));
    } catch (x) {
      return err(`${c.name}: ${(x as Error).message}`);
    }
  });
}

// ── the rest ──────────────────────────────────────────────────────────────────────────────────

function lolcat(text: string[]): Line[] {
  const tones: Tone[] = ['hi', 'ok', 'out', 'dim', 'out', 'ok'];
  return text.map((t, y) => segs(...[...t].map((ch, x) => [ch, tones[Math.floor((x + y * 2) / 3) % tones.length]] as const)));
}

function tr(c: Ctx): Line[] {
  const { flags, rest } = opts(c.args);
  const expand = (s: string) =>
    unescape(s).replace(/(.)-(.)/g, (_m, a: string, b: string) => {
      let out = '';
      for (let i = a.charCodeAt(0); i <= b.charCodeAt(0); i++) out += String.fromCharCode(i);
      return out;
    });
  const from = expand(rest[0] ?? '');
  const to = expand(rest[1] ?? '');
  if (!from) return [err('usage: tr [-d] set1 [set2]')];
  return (c.stdin ?? []).map((t) =>
    ln(
      [...t]
        .map((ch) => {
          const i = from.indexOf(ch);
          if (i < 0) return ch;
          if (flags.has('d')) return '';
          return to[Math.min(i, to.length - 1)] ?? ch;
        })
        .join(''),
    ),
  );
}

function printf(c: Ctx): Line[] {
  const [fmt, ...args] = c.args;
  if (fmt === undefined) return [err('printf: usage: printf format [arguments]')];
  let i = 0;
  const out = unescape(fmt).replace(/%(-?\d*)([sdfx%])/g, (_m, w: string, k: string) => {
    if (k === '%') return '%';
    const a = args[i++] ?? '';
    let v = k === 'd' ? String(Math.trunc(Number(a) || 0)) : k === 'f' ? (Number(a) || 0).toFixed(6) : k === 'x' ? (Math.trunc(Number(a)) || 0).toString(16) : a;
    const n = parseInt(w, 10);
    if (n) v = n < 0 ? v.padEnd(-n) : v.padStart(n);
    return v;
  });
  return out.replace(/\n$/, '').split('\n').map((t) => ln(t));
}

function factor(n: number) {
  const f: number[] = [];
  for (let d = 2; d * d <= n; d++) while (n % d === 0) (f.push(d), (n /= d));
  if (n > 1) f.push(n);
  return f;
}

export const textCommands: Record<string, Cmd> = {
  echo: {
    group: 'text',
    desc: 'print its arguments',
    usage: 'echo [-e] [text...]',
    run: (c) => {
      const e = c.args[0] === '-e' || c.args[0] === '-ne';
      const args = c.args.filter((a, i) => !(i === 0 && /^-[ne]+$/.test(a)));
      const t = args.join(' ');
      return (e ? unescape(t) : t).split('\n').map((x) => ln(x));
    },
  },
  printf: { group: 'text', desc: 'print, formatted', usage: 'printf format [args...]', run: printf, hidden: true },
  sort: {
    group: 'text',
    desc: 'sort lines',
    usage: 'sort [-rnu] [file...]',
    run: (c) => {
      const { flags, rest } = opts(c.args);
      const { text, errs } = source(c, rest);
      let out = [...text];
      if (flags.has('n')) out.sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
      else out.sort((a, b) => a.localeCompare(b));
      if (flags.has('r')) out.reverse();
      if (flags.has('u')) out = out.filter((l, i) => out.indexOf(l) === i);
      return [...errs, ...out.map((t) => ln(t))];
    },
  },
  uniq: {
    group: 'text',
    desc: 'drop repeated lines',
    usage: 'uniq [-c] [file]',
    run: (c) => {
      const { flags, rest } = opts(c.args);
      const { text, errs } = source(c, rest);
      const out: [string, number][] = [];
      for (const t of text) {
        const last = out[out.length - 1];
        if (last && last[0] === t) last[1]++;
        else out.push([t, 1]);
      }
      return [...errs, ...out.map(([t, n]) => ln(flags.has('c') ? `${String(n).padStart(7)} ${t}` : t))];
    },
  },
  rev: { group: 'text', desc: 'reverse each line', run: (c) => source(c, c.args).text.map((t) => ln([...t].reverse().join(''))) },
  tr: { group: 'text', desc: 'swap or delete characters', usage: 'tr [-d] set1 [set2]', run: tr },
  tee: {
    group: 'text',
    desc: 'copy the input into files as well',
    usage: 'tee [-a] <file...>',
    run: (c) => {
      const { flags, rest } = opts(c.args);
      const text = c.stdin ?? [];
      const out: Line[] = text.map((t) => ln(t));
      for (const f of rest) {
        const e = c.sh.fs.write(c.sh.resolve(f), text.join('\n') + '\n', flags.has('a'));
        if (e) out.push(err(`tee: ${f}: ${e}`));
      }
      return out;
    },
  },
  base64: {
    group: 'text',
    desc: 'encode or decode base64',
    usage: 'base64 [-d] [text]',
    run: (c) => {
      const { flags, rest } = opts(c.args);
      const input = rest.length ? rest.join(' ') : (c.stdin ?? []).join('\n');
      try {
        if (flags.has('d')) return [ln(new TextDecoder().decode(Uint8Array.from(atob(input.trim()), (ch) => ch.charCodeAt(0))))];
        return [ln(btoa(String.fromCharCode(...new TextEncoder().encode(input))))];
      } catch {
        return [err('base64: invalid input')];
      }
    },
  },
  seq: {
    group: 'text',
    desc: 'count',
    usage: 'seq [first [step]] last',
    run: (c) => {
      const n = c.args.map(Number);
      if (!n.length || n.some((x) => !Number.isFinite(x))) return [err('usage: seq [first [step]] last')];
      const [first, step, last] = n.length === 1 ? [1, 1, n[0]] : n.length === 2 ? [n[0], 1, n[1]] : n;
      if (!step) return [err('seq: step cannot be zero')];
      const out: Line[] = [];
      for (let x = first; step > 0 ? x <= last : x >= last; x += step) {
        out.push(ln(show(x)));
        if (out.length >= 5000) break;
      }
      return out;
    },
  },
  shuf: {
    group: 'text',
    desc: 'shuffle lines',
    usage: 'shuf [-n N] [file]',
    run: (c) => {
      const { values, rest } = opts(c.args, 'n');
      const t = [...source(c, rest).text];
      for (let i = t.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [t[i], t[j]] = [t[j], t[i]];
      }
      return t.slice(0, values.n ? parseInt(values.n, 10) : undefined).map((x) => ln(x));
    },
  },
  yes: {
    group: 'text',
    desc: 'y, forever (^C stops it)',
    run: (c) => {
      const word = c.args.join(' ') || 'y';
      if (c.piped) return Array.from({ length: 200 }, () => ln(word));
      let acc = 0;
      const p: Program = {
        mode: 'inline',
        done: false,
        hint: 'yes · ^C stops it',
        tick(_t, dt) {
          acc += dt * 40;
          const n = Math.floor(acc);
          acc -= n;
          for (let i = 0; i < n; i++) c.io.print(ln(word));
          return n > 0;
        },
      };
      return p;
    },
  },
  calc: { group: 'text', desc: 'a calculator', usage: 'calc [expression]', run: (c) => calc(c) },
  bc: { group: 'text', desc: 'a calculator', hidden: true, run: (c) => calc(c) },
  expr: {
    group: 'text',
    desc: 'integer sums',
    hidden: true,
    run: (c) => {
      try {
        return [ln(show(arith(c.args.join(' ').replace(/\\\*/g, '*'), true)))];
      } catch (e) {
        return [err(`expr: ${(e as Error).message}`)];
      }
    },
  },
  factor: {
    group: 'text',
    desc: 'prime factors',
    usage: 'factor <number...>',
    run: (c) =>
      (c.args.length ? c.args : c.stdin ?? []).map((a) => {
        const n = Number(a);
        if (!Number.isInteger(n) || n < 1 || n > 1e15) return err(`factor: '${a}' is not a valid positive integer`);
        return ln(`${n}: ${factor(n).join(' ')}`);
      }),
  },
  lolcat: {
    group: 'fun',
    desc: 'shimmer, in amber',
    usage: 'command | lolcat',
    run: (c) => lolcat(c.args.length && !c.stdin ? source(c, c.args).text : c.stdin ?? ['meow. pipe something into me.']),
  },
  figlet: {
    group: 'fun',
    desc: 'big letters',
    usage: 'figlet <text>',
    run: (c) => {
      const t = c.args.length ? c.args.join(' ') : (c.stdin ?? []).join(' ');
      if (!t.trim()) return [err('usage: figlet <text>')];
      return banner(t, c.io.cols()).map((x) => ln(x, 'hi'));
    },
  },
  banner: { group: 'fun', desc: 'big letters', hidden: true, run: (c) => textCommands.figlet.run(c) },
  toilet: { group: 'fun', desc: 'big letters', hidden: true, run: (c) => textCommands.figlet.run(c) },
  cowsay: { group: 'fun', desc: 'a cow says it', usage: 'cowsay [-f tux|bunny|kitty|cog] [-d] <text>', run: (c) => cowsay(c, false) },
  cowthink: { group: 'fun', desc: 'a cow thinks it', hidden: true, run: (c) => cowsay(c, true) },
  fortune: {
    group: 'fun',
    desc: 'a fortune cookie',
    run: () =>
      pick(FORTUNES)
        .split('\n')
        .map((t, i) => ln(t, i ? 'dim' : undefined)),
  },
};
