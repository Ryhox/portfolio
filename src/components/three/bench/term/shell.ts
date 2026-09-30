import { read, Vfs, type Node } from './fs';
import { buildFs } from './files';
import { arith } from './math';
import type { Host, Io, Line, Program, Tone } from './types';
import { ln } from './types';

/**
 * The shell behind the Lumen 64's terminal: bash, more or less. Quotes, variables, $(( )) and
 * $( ), globs, pipes, redirections, ; && ||, aliases, history (!!), tab completion, and a
 * filesystem that can really be changed (until the page is reloaded).
 */
export type Ctx = {
  sh: Shell;
  name: string;
  args: string[];
  /** piped or redirected input, as lines; null when there is none */
  stdin: string[] | null;
  /** where the output goes is a pipe or a file, not the screen */
  piped: boolean;
  io: Io;
  host: Host;
};
export type Out = Line[] | Program | void;
export type Group = 'files' | 'text' | 'system' | 'fun' | 'games' | 'site';
export type Cmd = { run: (c: Ctx) => Out; desc: string; usage?: string; group: Group; hidden?: boolean };

type Tok = { t: 'w'; v: string; glob: boolean } | { t: 'op'; v: string };
/** a command as parsed: its words and targets as typed, expanded only when it runs */
type Redir = { op: '>' | '>>' | '<' | '2>' | '&>'; target: string };
type Simple = { words: string[]; redirs: Redir[] };
type Item = { op: ';' | '&&' | '||'; pipe: Simple[] };
type Result = { lines: Line[]; program?: Program };

export const USER = 'ryhox';
export const HOST = 'lumen';

export class Shell {
  fs: Vfs;
  commands: Record<string, Cmd>;
  host: Host;
  io: Io;
  cwd: string[];
  env: Record<string, string>;
  aliases: Record<string, string> = {
    ll: 'ls -l',
    la: 'ls -a',
    l: 'ls',
    dir: 'ls -l',
    cls: 'clear',
    'cd..': 'cd ..',
    vim: 'vi',
    nvim: 'vi',
    emacs: 'nano',
    htop: 'top',
    matrix: 'cmatrix',
    python: 'calc',
    python3: 'calc',
    node: 'calc',
  };
  history: string[] = [];
  status = 0;
  started = Date.now();
  /** root, after sudo su with the right password */
  root = false;
  /** what is left of a command line while a program it started runs */
  private pending: { chain: Item[]; next: number } | null = null;
  private depth = 0;

  constructor(commands: Record<string, Cmd>, host: Host, io: Io) {
    this.commands = commands;
    this.host = host;
    this.io = io;
    this.fs = new Vfs(buildFs(this));
    this.cwd = ['home', USER];
    this.env = {
      HOME: `/home/${USER}`,
      USER,
      LOGNAME: USER,
      SHELL: '/bin/bash',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      TERM: 'lumen-64',
      LANG: 'en_GB.UTF-8',
      HOSTNAME: HOST,
      EDITOR: 'nano',
      SHLVL: '1',
      OLDPWD: `/home/${USER}`,
    };
  }

  get user() {
    return this.root ? 'root' : USER;
  }

  /** The prompt, as the tube draws it. */
  promptSegs(): [string, Tone][] {
    const p = this.path();
    const home = this.env.HOME;
    const short = p === home ? '~' : p.startsWith(home + '/') ? '~' + p.slice(home.length) : p;
    return [
      [`${this.user}@${HOST}`, 'hi'],
      [':', 'dim'],
      [short, 'ok'],
      [this.root ? '# ' : '$ ', 'out'],
    ];
  }

  path(parts = this.cwd) {
    return '/' + parts.join('/');
  }

  /** A path typed at the prompt, as parts from the root. */
  resolve(arg: string | undefined): string[] {
    if (arg === undefined || arg === '') return [...this.cwd];
    let s = arg.replace(/\\/g, '/');
    if (s === '~' || s.startsWith('~/')) s = this.env.HOME + s.slice(1);
    let parts = s.startsWith('/') ? [] : [...this.cwd];
    for (const seg of s.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') parts = parts.slice(0, -1);
      else parts.push(seg);
    }
    return this.fs.canonical(parts);
  }

  node(arg: string | undefined): Node | null {
    return this.fs.get(this.resolve(arg));
  }

  /** The variable a $NAME stands for. */
  variable(k: string): string {
    switch (k) {
      case '?':
        return String(this.status);
      case '$':
        return '6400';
      case '0':
        return 'bash';
      case 'PWD':
        return this.path();
      case 'RANDOM':
        return String(Math.floor(Math.random() * 32768));
      case 'EPOCHSECONDS':
        return String(Math.floor(Date.now() / 1000));
      case 'COLUMNS':
        return String(this.io.cols());
      case 'LINES':
        return String(this.io.rows());
      case 'SECONDS':
        return String(Math.floor((Date.now() - this.started) / 1000));
      case 'USER':
        return this.user;
      default:
        return this.env[k] ?? '';
    }
  }

  // ── running a line ──────────────────────────────────────────────────────────────────────────

  run(raw: string): Result {
    let line = raw.trim();
    if (!line) return { lines: [] };
    // history expansion: !! and !n
    if (/!(!|\d+)/.test(line) && !/^'.*'$/.test(line)) {
      const last = this.history[this.history.length - 1];
      let bad = '';
      line = line.replace(/!(!|\d+)/g, (m, g: string) => {
        const h = g === '!' ? last : this.history[parseInt(g, 10) - 1];
        if (h === undefined) bad = m;
        return h ?? m;
      });
      if (bad) return { lines: [ln(`bash: ${bad}: event not found`, 'err')] };
      this.io.print(ln(line, 'dim'));
    }
    if (this.history[this.history.length - 1] !== line) this.history.push(line);
    if (this.history.length > 200) this.history.shift();
    this.pending = null;
    return this.exec(line);
  }

  /** Run a line without it entering the history (scripts, $( )). */
  exec(line: string): Result {
    const parsed = this.parse(line);
    if (typeof parsed === 'string') {
      this.status = 2;
      return { lines: [ln(`bash: ${parsed}`, 'err')] };
    }
    return this.chain(parsed, 0);
  }

  /** A program started by the line has ended: the rest of the line runs. */
  resume(status: number): Result {
    this.status = status;
    const p = this.pending;
    this.pending = null;
    return p ? this.chain(p.chain, p.next) : { lines: [] };
  }

  /** The line was interrupted (^C): what was left of it does not run. */
  abandon() {
    this.pending = null;
    this.status = 130;
  }

  /** The text a command prints (for $( ) and scripts). */
  capture(line: string): string {
    if (this.depth > 8) return '';
    this.depth++;
    try {
      const r = this.exec(line);
      r.program?.exit?.(true);
      return r.lines
        .filter((l) => l.tone !== 'err')
        .map((l) => l.text)
        .join('\n');
    } finally {
      this.depth--;
    }
  }

  private chain(items: Item[], from: number): Result {
    const out: Line[] = [];
    for (let i = from; i < items.length; i++) {
      const it = items[i];
      if (it.op === '&&' && this.status !== 0) continue;
      if (it.op === '||' && this.status === 0) continue;
      const r = this.pipeline(it.pipe);
      out.push(...r.lines);
      if (r.program) {
        this.pending = { chain: items, next: i + 1 };
        return { lines: out, program: r.program };
      }
    }
    return { lines: out };
  }

  private pipeline(cmds: Simple[]): Result {
    let stdin: string[] | null = null;
    const screen: Line[] = [];
    for (let j = 0; j < cmds.length; j++) {
      const c = cmds[j];
      const last = j === cmds.length - 1;
      let outFile: { parts: string[]; append: boolean; name: string } | null = null;
      let errFile: string[] | null = null;
      let failed = false;
      const argv = this.expand(c.words);
      if (typeof argv === 'string') {
        screen.push(ln(`bash: ${argv}`, 'err'));
        this.status = 1;
        stdin = [];
        continue;
      }
      for (const raw of c.redirs) {
        const t = this.expand([raw.target]);
        const r = { op: raw.op, target: typeof t === 'string' ? raw.target : (t[0] ?? raw.target) };
        if (r.op === '<') {
          const n = this.node(r.target);
          if (!n || n.type !== 'file') {
            screen.push(ln(`bash: ${r.target}: ${n ? 'Is a directory' : 'No such file or directory'}`, 'err'));
            failed = true;
          } else stdin = read(n).replace(/\n$/, '').split('\n');
        } else if (r.op === '2>') errFile = this.resolve(r.target);
        else {
          outFile = { parts: this.resolve(r.target), append: r.op === '>>', name: r.target };
          if (r.op === '&>') errFile = outFile.parts;
        }
      }
      if (failed) {
        this.status = 1;
        stdin = [];
        continue;
      }
      const piped = !last || !!outFile;
      const r = this.invoke(argv, stdin, piped);
      if (r.program) {
        if (piped) r.program.exit?.(true);
        else return { lines: screen.concat(r.lines), program: r.program };
      }
      let all = r.lines;
      this.status = all.some((l) => l.tone === 'err') ? Math.max(1, this.status) : this.status;
      if (errFile) {
        const errs = all.filter((l) => l.tone === 'err');
        all = all.filter((l) => l.tone !== 'err');
        if (errs.length && errFile.join('/') !== 'dev/null') this.fs.write(errFile, errs.map((l) => l.text).join('\n') + '\n', true);
      }
      if (outFile) {
        const text = all.filter((l) => l.tone !== 'err').map((l) => l.text);
        if (!outFile.parts.join('/').startsWith('dev/')) {
          const e = this.fs.write(outFile.parts, text.length ? text.join('\n') + '\n' : '', outFile.append);
          if (e) screen.push(ln(`bash: ${outFile.name}: ${e}`, 'err'));
        }
        screen.push(...all.filter((l) => l.tone === 'err'));
        stdin = [];
      } else if (!last) {
        screen.push(...all.filter((l) => l.tone === 'err'));
        stdin = all.filter((l) => l.tone !== 'err').flatMap((l) => l.text.split('\n'));
      } else screen.push(...all);
    }
    return { lines: screen };
  }

  /** One command, its words already expanded. */
  private invoke(words: string[], stdin: string[] | null, piped: boolean): Result {
    let argv = [...words];
    // leading NAME=value words set variables
    while (argv.length && /^[A-Za-z_]\w*=/.test(argv[0])) {
      const [k, ...v] = argv.shift()!.split('=');
      this.env[k] = v.join('=');
    }
    if (!argv.length) {
      this.status = 0;
      return { lines: [] };
    }
    // aliases (not recursively, as bash)
    const alias = this.aliases[argv[0]];
    if (alias !== undefined) argv = [...alias.split(/\s+/).filter(Boolean), ...argv.slice(1)];
    const [name, ...args] = argv;
    const cmd = this.commands[name] ?? this.commands[name.toLowerCase()];
    this.status = 0;
    if (cmd) return this.call(cmd, name.toLowerCase(), args, stdin, piped);

    // a file run by its path: ./script.sh, /bin/ls, ~/games/snake
    if (name.includes('/')) {
      const n = this.node(name);
      if (!n) return this.fail(`bash: ${name}: No such file or directory`, 127);
      if (n.type === 'dir') return this.fail(`bash: ${name}: Is a directory`, 126);
      return this.runFile(n, name, args, stdin, piped);
    }
    return this.fail(this.notFound(name), 127);
  }

  call(cmd: Cmd, name: string, args: string[], stdin: string[] | null, piped: boolean): Result {
    try {
      const out = cmd.run({ sh: this, name, args, stdin, piped, io: this.io, host: this.host });
      if (!out) return { lines: [] };
      if (Array.isArray(out)) {
        if (out.some((l) => l.tone === 'err')) this.status = Math.max(this.status, 1);
        return { lines: out };
      }
      return { lines: [], program: out };
    } catch (e) {
      this.status = 1;
      return { lines: [ln(`${name}: ${(e as Error).message ?? 'something slipped a cog'}`, 'err')] };
    }
  }

  runFile(n: Node, name: string, args: string[], stdin: string[] | null, piped: boolean): Result {
    if (n.type !== 'file') return this.fail(`bash: ${name}: Is a directory`, 126);
    if (n.exec?.startsWith('cmd:')) {
      const c = this.commands[n.exec.slice(4)];
      if (c) return this.call(c, n.exec.slice(4), args, stdin, piped);
    }
    if (n.exec?.startsWith('run:')) return this.exec(n.exec.slice(4) + (args.length ? ' ' + args.join(' ') : ''));
    if (n.exec) return { lines: this.opener(n.exec) };
    if (n.mode?.includes('x')) return this.script(read(n), args);
    return this.fail(`bash: ${name}: Permission denied`, 126);
  }

  /** What opening a file with a special use does (a project's address, a record). */
  opener(what: string): Line[] {
    const i = what.indexOf(':');
    const kind = what.slice(0, i);
    const arg = what.slice(i + 1);
    if (kind === 'link') {
      this.host.open?.(arg);
      return [ln(`opening ${arg}`, 'dim')];
    }
    if (kind === 'music') return [ln(this.host.music?.(`play ${arg}`) ?? 'the radio is the record turning in the corner.', 'dim')];
    return [];
  }

  /** A shell script: its lines, run one after another ($1.. are its arguments). */
  script(text: string, args: string[]): Result {
    if (this.depth > 8) return this.fail('bash: maximum nesting reached', 1);
    this.depth++;
    const saved = { ...this.env };
    args.forEach((a, i) => (this.env[String(i + 1)] = a));
    this.env['#'] = String(args.length);
    this.env['@'] = args.join(' ');
    const out: Line[] = [];
    try {
      for (const l of text.split('\n')) {
        const t = l.trim();
        if (!t || t.startsWith('#')) continue;
        const r = this.exec(t);
        out.push(...r.lines);
        if (r.program) {
          r.program.exit?.(true);
          out.push(ln(`${t.split(' ')[0]}: interactive programs cannot run from a script`, 'err'));
        }
        if (out.length > 2000) break;
      }
    } finally {
      this.depth--;
      for (const k of ['#', '@', ...args.map((_, i) => String(i + 1))]) {
        if (k in saved) this.env[k] = saved[k];
        else delete this.env[k];
      }
    }
    return { lines: out };
  }

  fail(text: string, status = 1): Result {
    this.status = status;
    return { lines: [ln(text, 'err')] };
  }

  private notFound(name: string) {
    const near = Object.keys(this.commands)
      .filter((c) => !this.commands[c].hidden)
      .map((c) => [c, distance(c, name.toLowerCase())] as const)
      .filter(([c, d]) => d <= (name.length > 4 ? 2 : 1) && c !== name)
      .sort((a, b) => a[1] - b[1]);
    return near.length ? `${name}: command not found. did you mean ${near[0][0]}?` : `${name}: command not found`;
  }

  /** Expand * ? [..] in the last part of a path. */
  glob(pattern: string): string[] {
    const cut = pattern.lastIndexOf('/');
    const base = cut >= 0 ? pattern.slice(0, cut + 1) : '';
    const stem = pattern.slice(cut + 1);
    if (/[*?[]/.test(base)) return [];
    const d = this.node(base || '.');
    if (!d || d.type !== 'dir') return [];
    const re = new RegExp(
      '^' +
        stem
          .replace(/[.+^${}()|\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.') +
        '$',
    );
    return Object.keys(d.children)
      .filter((k) => re.test(k) && (stem.startsWith('.') || !k.startsWith('.')))
      .sort()
      .map((k) => base + k);
  }

  // ── parsing ───────────────────────────────────────────────────────────────────────────────

  parse(src: string): Item[] | string {
    const toks = this.lex(src, false);
    if (typeof toks === 'string') return toks;
    const items: Item[] = [];
    let op: Item['op'] = ';';
    let pipe: Simple[] = [];
    let cur: Simple = { words: [], redirs: [] };
    const endSimple = () => {
      if (!cur.words.length && !cur.redirs.length) return false;
      pipe.push(cur);
      cur = { words: [], redirs: [] };
      return true;
    };
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.t === 'w') {
        cur.words.push(t.v);
        continue;
      }
      if (t.v === '|') {
        if (!endSimple()) return "syntax error near unexpected token `|'";
        continue;
      }
      if (t.v === '>' || t.v === '>>' || t.v === '<' || t.v === '2>' || t.v === '&>') {
        const next = toks[i + 1];
        if (!next || next.t !== 'w') return 'syntax error near unexpected token `newline\'';
        cur.redirs.push({ op: t.v, target: next.v });
        i++;
        continue;
      }
      if (t.v === '2>&1') continue;
      // ; && ||
      const had = endSimple();
      if (!had && !pipe.length) {
        if (t.v === ';' && !items.length) return "syntax error near unexpected token `;'";
        if (t.v !== ';') return `syntax error near unexpected token \`${t.v}'`;
        continue;
      }
      if (!had && pipe.length) return `syntax error near unexpected token \`${t.v}'`;
      items.push({ op, pipe });
      pipe = [];
      op = t.v as Item['op'];
    }
    const had = endSimple();
    if (!had && pipe.length) return 'syntax error: unexpected end of line';
    if (pipe.length) items.push({ op, pipe });
    else if (op !== ';') return 'syntax error: unexpected end of line';
    return items;
  }

  /**
   * Split a line into words and operators. With `evaluate` off (parsing) each word is kept as
   * typed, quotes and all; with it on (running a command) a word's quotes, escapes, $VARIABLES,
   * $(( )) and $( ) are worked out, the moment that command runs, as bash does.
   */
  private lex(src: string, evaluate: boolean): Tok[] | string {
    const toks: Tok[] = [];
    let cur = '';
    let has = false;
    let glob = false;
    const end = () => {
      if (has) toks.push({ t: 'w', v: cur, glob });
      cur = '';
      has = false;
      glob = false;
    };
    /** The end of a $ construct starting at i: [its value (or its source), index of its last char]. */
    const dollar = (i: number): [string, number] | string => {
      const rest = src.slice(i + 1);
      if (rest.startsWith('((')) {
        const close = matching(src, i + 2, '(', ')');
        if (close < 0 || src[close + 1] !== ')') return "unexpected EOF while looking for matching `))'";
        if (!evaluate) return [src.slice(i, close + 2), close + 1];
        const expr = src.slice(i + 3, close).replace(/\$?([A-Za-z_]\w*)/g, (_m, k: string) => this.variable(k) || '0');
        try {
          return [String(Math.trunc(arith(expr, true))), close + 1];
        } catch (e) {
          return `${expr.trim()}: ${(e as Error).message}`;
        }
      }
      if (rest.startsWith('(')) {
        const close = matching(src, i + 1, '(', ')');
        if (close < 0) return "unexpected EOF while looking for matching `)'";
        if (!evaluate) return [src.slice(i, close + 1), close];
        return [this.capture(src.slice(i + 2, close)).replace(/\n+$/, '').replace(/\n/g, ' '), close];
      }
      if (rest.startsWith('{')) {
        const close = src.indexOf('}', i);
        if (close < 0) return "unexpected EOF while looking for matching `}'";
        return [evaluate ? this.variable(src.slice(i + 2, close)) : src.slice(i, close + 1), close];
      }
      const m = /^([A-Za-z_]\w*|[?$#@0-9])/.exec(rest);
      if (!m) return ['$', i];
      return [evaluate ? this.variable(m[1]) : '$' + m[1], i + m[1].length];
    };
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (c === ' ' || c === '\t') {
        end();
        continue;
      }
      if (c === '#' && !has) break;
      if (c === '\\') {
        if (i + 1 < src.length) cur += evaluate ? src[++i] : c + src[++i];
        has = true;
        continue;
      }
      if (c === "'") {
        const close = src.indexOf("'", i + 1);
        if (close < 0) return "unexpected EOF while looking for matching `''";
        cur += evaluate ? src.slice(i + 1, close) : src.slice(i, close + 1);
        has = true;
        i = close;
        continue;
      }
      if (c === '"') {
        has = true;
        if (!evaluate) cur += c;
        let j = i + 1;
        for (; j < src.length && src[j] !== '"'; j++) {
          const d = src[j];
          if (d === '\\' && /["\\$`]/.test(src[j + 1] ?? '')) cur += evaluate ? src[++j] : d + src[++j];
          else if (d === '$') {
            const r = dollar(j);
            if (typeof r === 'string') return r;
            cur += r[0];
            j = r[1];
          } else cur += d;
        }
        if (j >= src.length) return 'unexpected EOF while looking for matching `"\'';
        if (!evaluate) cur += '"';
        i = j;
        continue;
      }
      if (c === '$') {
        const r = dollar(i);
        if (typeof r === 'string') return r;
        cur += r[0];
        // an unquoted expansion to nothing is no word at all
        if (r[0] || !evaluate) has = true;
        i = r[1];
        continue;
      }
      if (c === '~' && evaluate && !has && (src[i + 1] === undefined || src[i + 1] === '/')) {
        cur += this.env.HOME;
        has = true;
        continue;
      }
      if (!evaluate && (c === '|' || c === ';' || c === '&' || c === '>' || c === '<')) {
        const two = src.slice(i, i + 2);
        if (c === '>' && has && cur === '2') {
          cur = '';
          has = false;
          if (src.slice(i, i + 3) === '>&1') {
            toks.push({ t: 'op', v: '2>&1' });
            i += 2;
          } else toks.push({ t: 'op', v: '2>' });
          continue;
        }
        end();
        if (two === '||' || two === '&&' || two === '>>' || two === '&>') {
          toks.push({ t: 'op', v: two });
          i++;
        } else toks.push({ t: 'op', v: c === '&' ? ';' : c });
        continue;
      }
      if (c === '*' || c === '?' || c === '[') glob = true;
      cur += c;
      has = true;
    }
    end();
    return toks;
  }

  /** A command's words as it runs them: expanded, globs matched against the filesystem. */
  private expand(raw: string[]): string[] | string {
    const out: string[] = [];
    for (const r of raw) {
      const toks = this.lex(r, true);
      if (typeof toks === 'string') return toks;
      for (const t of toks) {
        if (t.t !== 'w') continue;
        const hits = t.glob ? this.glob(t.v) : [];
        if (hits.length) out.push(...hits);
        else out.push(t.v);
      }
    }
    return out;
  }

  // ── completion ────────────────────────────────────────────────────────────────────────────

  /**
   * Tab: the last word of the line (`word`) and what it becomes (`next`); when it cannot
   * become anything longer, `options` are what it could be.
   */
  complete(input: string): { word: string; next: string; options: string[] } {
    const m = /(^|[\s|;&]+)([^\s|;&]*)$/.exec(input);
    const word = m ? m[2] : '';
    const before = input.slice(0, input.length - word.length);
    const first = !before.trim() || /[|;&]\s*$/.test(before);
    let cands: string[];
    if (first && !word.includes('/')) {
      cands = [...Object.keys(this.commands).filter((c) => !this.commands[c].hidden), ...Object.keys(this.aliases)]
        .filter((c, i, a) => c.startsWith(word) && a.indexOf(c) === i)
        .sort()
        .map((c) => c + ' ');
    } else {
      const expanded = word.startsWith('~') ? this.env.HOME + word.slice(1) : word;
      const cut = expanded.lastIndexOf('/');
      const base = cut >= 0 ? expanded.slice(0, cut + 1) : '';
      const stem = expanded.slice(cut + 1);
      const d = this.node(base || '.');
      if (!d || d.type !== 'dir') return { word, next: word, options: [] };
      let names = Object.keys(d.children).filter((k) => k.startsWith(stem));
      // nothing as typed: the same letters in another case
      if (!names.length) names = Object.keys(d.children).filter((k) => k.toLowerCase().startsWith(stem.toLowerCase()));
      if (!stem.startsWith('.')) names = names.filter((k) => !k.startsWith('.'));
      const shownBase = word.slice(0, word.length - stem.length);
      cands = names.sort().map((k) => shownBase + k + (d.children[k].type === 'dir' ? '/' : ' '));
    }
    if (!cands.length) return { word, next: word, options: [] };
    if (cands.length === 1) return { word, next: cands[0], options: [] };
    let pre = cands[0];
    for (const c of cands) while (!c.toLowerCase().startsWith(pre.toLowerCase())) pre = pre.slice(0, -1);
    pre = pre.replace(/ $/, '');
    if (pre.length > word.length) return { word, next: pre, options: [] };
    const options = cands.map((c) => {
      const t = c.replace(/ $/, '');
      const name = t.replace(/\/$/, '').split('/').pop()!;
      return name + (t.endsWith('/') ? '/' : '');
    });
    return { word, next: word, options };
  }
}

/** Index of the bracket closing the one at `open`. */
function matching(s: string, open: number, a: string, b: string) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === a) depth++;
    else if (s[i] === b && --depth === 0) return i;
  }
  return -1;
}

export function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
