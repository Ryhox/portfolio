import { clone, read, size, type Node } from '../fs';
import { editor } from '../programs/editor';
import { pager } from '../programs/pager';
import type { Cmd, Ctx, Shell } from '../shell';
import { ln, segs, type Line, type Tone } from '../types';
import { columns, lsDate, opts } from '../util';

const denied = (sh: Shell, parts: string[]) => parts[0] === 'root' && !sh.root;
const err = (text: string): Line => ln(text, 'err');

const toneOf = (n: Node): Tone | undefined => (n.type === 'dir' ? 'hi' : n.mode?.includes('x') || n.exec?.startsWith('cmd:') ? 'ok' : undefined);
const exe = (n: Node) => n.type === 'file' && (n.mode?.includes('x') || !!n.exec?.startsWith('cmd:'));

function human(n: number) {
  if (n < 1024) return String(n);
  const k = n / 1024;
  return k < 10 ? `${k.toFixed(1)}K` : `${Math.round(k)}K`;
}

function owner(sh: Shell, parts: string[]) {
  return parts[0] === 'home' || parts[0] === 'tmp' ? 'ryhox' : 'root';
}

/** Text from the files named, or from the pipe. */
function inputs(c: Ctx, files: string[], name: string) {
  const ok: { text: string[]; label: string }[] = [];
  const errs: Line[] = [];
  if (!files.length) ok.push({ text: c.stdin ?? [], label: '' });
  for (const f of files) {
    if (f === '-') {
      ok.push({ text: c.stdin ?? [], label: '-' });
      continue;
    }
    const parts = c.sh.resolve(f);
    const n = c.sh.fs.get(parts);
    if (denied(c.sh, parts)) errs.push(err(`${name}: ${f}: Permission denied`));
    else if (!n) errs.push(err(`${name}: ${f}: No such file or directory`));
    else if (n.type === 'dir') errs.push(err(`${name}: ${f}: Is a directory`));
    else ok.push({ text: read(n).replace(/\n$/, '').split('\n'), label: f });
  }
  return { ok, errs };
}

function ls(c: Ctx): Line[] {
  const { flags, rest } = opts(c.args);
  const all = flags.has('a') || flags.has('all');
  const almost = flags.has('A');
  const long = flags.has('l');
  const one = flags.has('1');
  const classify = flags.has('F');
  const targets = rest.length ? rest : ['.'];
  const out: Line[] = [];
  const width = c.io.cols();

  const nameOf = (k: string, n: Node): [string, Tone?] => [k + (classify ? (n.type === 'dir' ? '/' : exe(n) ? '*' : '') : ''), toneOf(n)];
  const sortEntries = (entries: [string, Node][]) => {
    entries.sort((a, b) => a[0].replace(/^\./, '').localeCompare(b[0].replace(/^\./, '')));
    if (flags.has('t')) entries.sort((a, b) => b[1].mtime - a[1].mtime);
    if (flags.has('S')) entries.sort((a, b) => size(b[1]) - size(a[1]));
    if (flags.has('r')) entries.reverse();
    return entries;
  };
  const longLine = (k: string, n: Node, parts: string[]): Line => {
    const perm = n.type === 'dir' ? 'drwxr-xr-x' : exe(n) ? '-rwxr-xr-x' : '-rw-r--r--';
    const sz = flags.has('h') ? human(size(n)) : String(size(n));
    const [name, tone] = nameOf(k, n);
    return segs([`${perm} ${owner(c.sh, parts).padEnd(5)} ${sz.padStart(5)} ${lsDate(n.mtime)} `, 'dim'], [name, tone]);
  };

  const files: [string, Node, string[]][] = [];
  const dirs: [string, string[]][] = [];
  for (const t of targets) {
    const parts = c.sh.resolve(t);
    const n = c.sh.fs.get(parts);
    if (!n) out.push(err(`ls: cannot access '${t}': No such file or directory`));
    else if (denied(c.sh, parts)) out.push(err(`ls: cannot open directory '${t}': Permission denied`));
    else if (n.type === 'dir') dirs.push([t, parts]);
    else files.push([t, n, parts]);
  }
  const list = (entries: [string, Node, string[]][]) => {
    if (long) for (const [k, n, parts] of entries) out.push(longLine(k, n, parts));
    else if (one || c.piped) for (const [k, n] of entries) out.push(segs(nameOf(k, n)));
    else out.push(...columns(entries.map(([k, n]) => { const [text, tone] = nameOf(k, n); return { text, tone }; }), width));
  };
  list(files);
  const recurse = flags.has('R');
  const walk = (label: string, parts: string[], header: boolean) => {
    const d = c.sh.fs.get(parts);
    if (!d || d.type !== 'dir') return;
    if (header) {
      if (out.length) out.push(ln(''));
      out.push(ln(`${label}:`, 'hi'));
    }
    let entries = sortEntries(Object.entries(d.children).filter(([k]) => all || almost || !k.startsWith('.')));
    if (long) out.push(ln(`total ${entries.reduce((s, [, n]) => s + Math.ceil(size(n) / 1024), 0) * 4}`, 'dim'));
    const rows: [string, Node, string[]][] = entries.map(([k, n]) => [k, n, [...parts, k]]);
    if (all) rows.unshift(['.', d, parts], ['..', c.sh.fs.get(parts.slice(0, -1)) ?? d, parts.slice(0, -1)]);
    list(rows);
    if (recurse) for (const [k, n] of entries) if (n.type === 'dir') walk(`${label === '.' ? '.' : label.replace(/\/$/, '')}/${k}`, [...parts, k], true);
    entries = [];
  };
  for (const [t, parts] of dirs) walk(t, parts, targets.length > 1 || recurse);
  return out;
}

function cd(c: Ctx): Line[] {
  const sh = c.sh;
  let t = c.args.find((a) => !a.startsWith('-') || a === '-');
  if (c.args.length > 1 && c.args.filter((a) => !a.startsWith('-')).length > 1) return [err('bash: cd: too many arguments')];
  let echo = false;
  if (t === '-') {
    t = sh.env.OLDPWD;
    echo = true;
  }
  const next = sh.resolve(t ?? sh.env.HOME);
  const n = sh.fs.get(next);
  // the works are not a directory: they are further down the page
  if (!n && t?.toLowerCase() === 'works' && c.host.enter) {
    c.host.enter();
    return [ln('engaging the works...', 'dim')];
  }
  if (!n) return [err(`bash: cd: ${t}: No such file or directory`)];
  if (n.type !== 'dir') return [err(`bash: cd: ${t}: Not a directory`)];
  if (denied(sh, next)) return [err(`bash: cd: ${t}: Permission denied`)];
  sh.env.OLDPWD = sh.path();
  sh.cwd = next;
  return echo ? [ln(sh.path())] : [];
}

function cat(c: Ctx): Line[] {
  const { flags, rest } = opts(c.args);
  const { ok, errs } = inputs(c, rest, 'cat');
  const out: Line[] = [];
  let n = 0;
  for (const g of ok) for (const t of g.text) out.push(flags.has('n') ? segs([`${String(++n).padStart(6)}  `, 'dim'], [t]) : ln(t));
  return [...out, ...errs];
}

function headTail(c: Ctx, tail: boolean): Line[] {
  const args = c.args.map((a) => (/^-\d+$/.test(a) ? `-n${a.slice(1)}` : a));
  const { values, rest } = opts(args, 'nc');
  const n = Math.max(0, parseInt(values.n ?? '10', 10) || 0);
  const { ok: got, errs } = inputs(c, rest, c.name);
  const out: Line[] = [...errs];
  got.forEach((g, i) => {
    if (got.length > 1) {
      if (i) out.push(ln(''));
      out.push(ln(`==> ${g.label} <==`, 'hi'));
    }
    const part = tail ? g.text.slice(Math.max(0, g.text.length - n)) : g.text.slice(0, n);
    out.push(...part.map((t) => ln(t)));
  });
  return out;
}

function tree(c: Ctx): Line[] {
  const { flags, values, rest } = opts(c.args, 'L');
  const t = rest[0] ?? '.';
  const parts = c.sh.resolve(t);
  const root = c.sh.fs.get(parts);
  if (!root) return [err(`${t} [error opening dir]`)];
  if (denied(c.sh, parts)) return [err(`${t} [error opening dir]`)];
  const max = parseInt(values.L ?? '64', 10) || 64;
  const out: Line[] = [ln(t, 'hi')];
  let nd = 0;
  let nf = 0;
  const walk = (n: Node, prefix: string, depth: number) => {
    if (n.type !== 'dir' || depth > max) return;
    const keys = Object.keys(n.children)
      .filter((k) => flags.has('a') || !k.startsWith('.'))
      .sort();
    keys.forEach((k, i) => {
      const last = i === keys.length - 1;
      const child = n.children[k];
      if (child.type === 'dir') nd++;
      else nf++;
      out.push(segs([`${prefix}${last ? '└── ' : '├── '}`, 'dim'], [k, toneOf(child)]));
      walk(child, prefix + (last ? '    ' : '│   '), depth + 1);
    });
  };
  walk(root, '', 1);
  out.push(ln(''), ln(`${nd} director${nd === 1 ? 'y' : 'ies'}, ${nf} file${nf === 1 ? '' : 's'}`));
  return out;
}

function find(c: Ctx): Line[] {
  const args = [...c.args];
  const paths: string[] = [];
  while (args.length && !args[0].startsWith('-')) paths.push(args.shift()!);
  let name: RegExp | null = null;
  let type = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-name' || args[i] === '-iname') {
      const p = args[++i] ?? '';
      name = new RegExp('^' + p.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', args[i - 1] === '-iname' ? 'i' : '');
    } else if (args[i] === '-type') type = args[++i] ?? '';
    else return [err(`find: unknown predicate '${args[i]}'`)];
  }
  const out: Line[] = [];
  for (const p of paths.length ? paths : ['.']) {
    const parts = c.sh.resolve(p);
    const n = c.sh.fs.get(parts);
    if (!n) {
      out.push(err(`find: '${p}': No such file or directory`));
      continue;
    }
    const walk = (node: Node, shown: string, key: string, pp: string[]) => {
      if (denied(c.sh, pp)) {
        out.push(err(`find: '${shown}': Permission denied`));
        return;
      }
      const okName = !name || name.test(key);
      const okType = !type || (type === 'd' ? node.type === 'dir' : node.type === 'file');
      if (okName && okType) out.push(ln(shown, node.type === 'dir' ? 'hi' : undefined));
      if (node.type === 'dir')
        for (const k of Object.keys(node.children).sort()) walk(node.children[k], `${shown.replace(/\/$/, '')}/${k}`, k, [...pp, k]);
      if (out.length > 800) return;
    };
    walk(n, p, parts[parts.length - 1] ?? '/', parts);
  }
  return out;
}

function grep(c: Ctx): Line[] {
  const { flags, values, rest } = opts(c.args, 'e');
  const pattern = values.e ?? rest.shift();
  if (pattern === undefined) return [err('usage: grep [-ivnclr] pattern [file...]')];
  let re: RegExp;
  try {
    re = new RegExp(pattern, flags.has('i') ? 'gi' : 'g');
  } catch {
    re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags.has('i') ? 'gi' : 'g');
  }
  const files: string[] = [];
  const errs: Line[] = [];
  const recursive = flags.has('r') || flags.has('R');
  for (const f of rest) {
    const parts = c.sh.resolve(f);
    const n = c.sh.fs.get(parts);
    if (n?.type === 'dir') {
      if (!recursive) {
        errs.push(err(`grep: ${f}: Is a directory`));
        continue;
      }
      const walk = (node: Node, shown: string) => {
        if (node.type === 'file') files.push(shown);
        else for (const k of Object.keys(node.children).sort()) if (!k.startsWith('.')) walk(node.children[k], `${shown.replace(/\/$/, '')}/${k}`);
      };
      walk(n, f);
    } else files.push(f);
  }
  if (recursive && !rest.length) files.push('.');
  const { ok: got, errs: missing } = inputs(c, files, 'grep');
  const out: Line[] = [...errs, ...missing];
  const many = got.length > 1;
  let hits = 0;
  for (const g of got) {
    let count = 0;
    g.text.forEach((t, i) => {
      re.lastIndex = 0;
      const match = re.test(t);
      if (match === flags.has('v')) return;
      count++;
      hits++;
      if (flags.has('c') || flags.has('l')) return;
      const s: [string, Tone?][] = [];
      if (many) s.push([`${g.label}:`, 'dim']);
      if (flags.has('n')) s.push([`${i + 1}:`, 'dim']);
      if (flags.has('v')) s.push([t]);
      else {
        let last = 0;
        re.lastIndex = 0;
        for (let m = re.exec(t); m; m = re.exec(t)) {
          if (!m[0]) {
            re.lastIndex++;
            continue;
          }
          s.push([t.slice(last, m.index)], [m[0], 'hi']);
          last = m.index + m[0].length;
        }
        s.push([t.slice(last)]);
      }
      out.push(segs(...s));
    });
    if (flags.has('c')) out.push(ln(many ? `${g.label}:${count}` : String(count)));
    if (flags.has('l') && count) out.push(ln(g.label));
  }
  if (!hits) c.sh.status = 1;
  return out;
}

function wc(c: Ctx): Line[] {
  const { flags, rest } = opts(c.args);
  const { ok: got, errs } = inputs(c, rest, 'wc');
  if (!got.length) return errs;
  const any = flags.has('l') || flags.has('w') || flags.has('c') || flags.has('m');
  const rows: number[][] = [];
  const labels: string[] = [];
  for (const g of got) {
    const text = g.text.join('\n');
    const n = [g.text.length, text.split(/\s+/).filter(Boolean).length, text.length + (g.text.length ? 1 : 0)];
    rows.push(n);
    labels.push(g.label);
  }
  if (got.length > 1) {
    rows.push(rows.reduce((a, r) => a.map((v, i) => v + r[i]), [0, 0, 0]));
    labels.push('total');
  }
  const out = rows.map((r, i) => {
    const pick = any ? r.filter((_, j) => (j === 0 && flags.has('l')) || (j === 1 && flags.has('w')) || (j === 2 && (flags.has('c') || flags.has('m')))) : r;
    return ln(`${pick.map((v) => String(v).padStart(pick.length === 1 && !labels[i] ? 1 : 7)).join('')}${labels[i] ? ` ${labels[i]}` : ''}`.trimStart());
  });
  return [...out, ...errs];
}

function mutate(c: Ctx, verb: string, each: (parts: string[], shown: string) => string | null, need = 1): Line[] {
  const { rest } = opts(c.args);
  if (rest.length < need) return [err(`${c.name}: missing operand`)];
  const out: Line[] = [];
  for (const f of rest) {
    const e = each(c.sh.resolve(f), f);
    if (e) out.push(err(`${c.name}: ${verb} '${f}': ${e}`));
  }
  return out;
}

function rm(c: Ctx): Line[] {
  const { flags, rest } = opts(c.args);
  const rec = flags.has('r') || flags.has('R') || flags.has('recursive');
  const force = flags.has('f') || flags.has('force');
  if (!rest.length) return force ? [] : [err('rm: missing operand')];
  const out: Line[] = [];
  for (const f of rest) {
    const parts = c.sh.resolve(f);
    if (!parts.length) {
      if (!rec) {
        out.push(err("rm: cannot remove '/': Is a directory"));
        continue;
      }
      if (!flags.has('no-preserve-root')) {
        out.push(err("rm: it is dangerous to operate recursively on '/'"), err('rm: use --no-preserve-root to override this failsafe'));
        continue;
      }
      // as asked. whatever the visitor may delete, goes
      const root = c.sh.fs.root;
      for (const k of Object.keys(root.children)) {
        if (c.sh.root) delete root.children[k];
        else {
          const e = c.sh.fs.remove([k], true);
          if (e) out.push(err(`rm: cannot remove '/${k}': ${e}`));
        }
      }
      const home = c.sh.fs.get(['home', 'ryhox']);
      if (home && home.type === 'dir') home.children = {};
      const tmp = c.sh.fs.get(['tmp']);
      if (tmp && tmp.type === 'dir') tmp.children = {};
      out.push(ln('the cogs keep turning. they always do.', 'dim'));
      continue;
    }
    if (denied(c.sh, parts)) {
      out.push(err(`rm: cannot remove '${f}': Permission denied`));
      continue;
    }
    const e = c.sh.fs.remove(parts, rec);
    if (e && !(force && e === 'No such file or directory')) out.push(err(`rm: cannot remove '${f}': ${e}`));
  }
  return out;
}

function mvcp(c: Ctx, move: boolean): Line[] {
  const { flags, rest } = opts(c.args);
  if (rest.length < 2) return [err(`${c.name}: missing destination file operand after '${rest[0] ?? ''}'`)];
  const dest = rest.pop()!;
  const destParts = c.sh.resolve(dest);
  const destNode = c.sh.fs.get(destParts);
  if (rest.length > 1 && destNode?.type !== 'dir') return [err(`${c.name}: target '${dest}' is not a directory`)];
  const out: Line[] = [];
  for (const src of rest) {
    const parts = c.sh.resolve(src);
    const n = c.sh.fs.get(parts);
    if (!n) {
      out.push(err(`${c.name}: cannot stat '${src}': No such file or directory`));
      continue;
    }
    if (!move && n.type === 'dir' && !flags.has('r') && !flags.has('R')) {
      out.push(err(`cp: -r not specified; omitting directory '${src}'`));
      continue;
    }
    if (destParts.join('/').startsWith(parts.join('/') + '/') || destParts.join('/') === parts.join('/')) {
      out.push(err(`${c.name}: cannot ${move ? 'move' : 'copy'} '${src}' into itself`));
      continue;
    }
    const e = c.sh.fs.place(destParts, move ? n : clone(n), parts[parts.length - 1]);
    if (e) {
      out.push(err(`${c.name}: cannot ${move ? 'move' : 'create'} '${dest}': ${e}`));
      continue;
    }
    if (move) {
      const r = c.sh.fs.remove(parts, true);
      if (r) {
        // could not take it from where it was: undo the copy
        const t = c.sh.fs.get(destParts);
        if (t?.type === 'dir' && t.children[parts[parts.length - 1]] === n) delete t.children[parts[parts.length - 1]];
        out.push(err(`mv: cannot move '${src}': ${r}`));
      }
    }
  }
  return out;
}

function describe(n: Node, name: string) {
  if (n.type === 'dir') return 'directory';
  if (n.exec?.startsWith('cmd:')) return 'ELF 64-bit LSB executable, brass, dynamically linked, stripped';
  if (n.exec?.startsWith('link:')) return 'internet shortcut, ASCII text';
  if (n.exec?.startsWith('music:')) return 'audio record, 33 1/3 rpm';
  const t = read(n);
  if (!t) return 'empty';
  if (t.startsWith('#!')) return `Bourne-Again shell script, ASCII text${n.mode?.includes('x') ? ' executable' : ''}`;
  if (name.endsWith('.md')) return 'Markdown text, ASCII text';
  if (name.endsWith('.css')) return 'CSS source, ASCII text';
  if (name.endsWith('.zip')) return 'Zip archive data (recycled)';
  if (name.endsWith('.psd')) return 'Adobe Photoshop Image, regrettably';
  return 'ASCII text';
}

export const fileCommands: Record<string, Cmd> = {
  ls: { group: 'files', desc: 'list a directory', usage: 'ls [-laR1hFtrS] [path...]', run: ls },
  cd: { group: 'files', desc: 'change directory', usage: 'cd [dir | - | ~]', run: cd },
  pwd: { group: 'files', desc: 'print the working directory', run: (c) => [ln(c.sh.path())] },
  cat: { group: 'files', desc: 'print files', usage: 'cat [-n] [file...]', run: cat },
  less: {
    group: 'files',
    desc: 'page through a file (q quits)',
    usage: 'less <file>',
    run: (c) => {
      const out = cat(c);
      if (c.piped || out.some((l) => l.tone === 'err') || out.length < c.io.rows() - 1) return out;
      return pager(out, c.args.filter((a) => !a.startsWith('-'))[0] ?? 'stdin');
    },
  },
  more: { group: 'files', desc: 'page through a file', hidden: true, run: (c) => fileCommands.less.run(c) },
  head: { group: 'text', desc: 'the first lines', usage: 'head [-n N] [file...]', run: (c) => headTail(c, false) },
  tail: { group: 'text', desc: 'the last lines', usage: 'tail [-n N] [file...]', run: (c) => headTail(c, true) },
  tree: { group: 'files', desc: 'the filesystem, drawn', usage: 'tree [-a] [-L depth] [dir]', run: tree },
  find: { group: 'files', desc: 'search for files', usage: 'find [path] [-name pattern] [-type f|d]', run: find },
  grep: { group: 'text', desc: 'search inside files', usage: 'grep [-ivnclr] pattern [file...]', run: grep },
  wc: { group: 'text', desc: 'count lines, words, bytes', usage: 'wc [-lwc] [file...]', run: wc },
  touch: { group: 'files', desc: 'make an empty file', usage: 'touch <file...>', run: (c) => mutate(c, 'cannot touch', (p) => c.sh.fs.touch(p)) },
  mkdir: {
    group: 'files',
    desc: 'make a directory',
    usage: 'mkdir [-p] <dir...>',
    run: (c) => mutate(c, 'cannot create directory', (p) => c.sh.fs.mkdir(p, c.args.includes('-p'))),
  },
  rmdir: { group: 'files', desc: 'remove an empty directory', usage: 'rmdir <dir...>', run: (c) => mutate(c, 'failed to remove', (p) => c.sh.fs.remove(p, false, true)) },
  rm: { group: 'files', desc: 'remove files', usage: 'rm [-rf] <path...>', run: rm },
  mv: { group: 'files', desc: 'move or rename', usage: 'mv <src...> <dest>', run: (c) => mvcp(c, true) },
  cp: { group: 'files', desc: 'copy', usage: 'cp [-r] <src...> <dest>', run: (c) => mvcp(c, false) },
  file: {
    group: 'files',
    desc: 'what kind of file',
    usage: 'file <path...>',
    run: (c) =>
      c.args.length
        ? c.args.map((a) => {
            const n = c.sh.node(a);
            return n ? segs([`${a}: `, 'hi'], [describe(n, a)]) : ln(`${a}: cannot open '${a}' (No such file or directory)`, 'err');
          })
        : [err('usage: file <path...>')],
  },
  stat: {
    group: 'files',
    desc: 'details of a file',
    usage: 'stat <path>',
    run: (c) => {
      if (!c.args[0]) return [err('stat: missing operand')];
      const parts = c.sh.resolve(c.args[0]);
      const n = c.sh.fs.get(parts);
      if (!n) return [err(`stat: cannot statx '${c.args[0]}': No such file or directory`)];
      const d = new Date(n.mtime).toISOString().replace('T', ' ').replace('Z', '');
      return [
        ln(`  File: ${c.args[0]}`),
        ln(`  Size: ${String(size(n)).padEnd(10)} Blocks: ${Math.ceil(size(n) / 512) * 8}   ${n.type === 'dir' ? 'directory' : 'regular file'}`),
        ln(`Access: (${n.type === 'dir' || exe(n) ? '0755' : '0644'})  Uid: ${owner(c.sh, parts)}`),
        ln(`Modify: ${d}`),
      ];
    },
  },
  du: {
    group: 'files',
    desc: 'disk usage',
    usage: 'du [-sh] [path]',
    run: (c) => {
      const { flags, rest } = opts(c.args);
      const t = rest[0] ?? '.';
      const n = c.sh.node(t);
      if (!n) return [err(`du: cannot access '${t}': No such file or directory`)];
      const total = (x: Node): number => (x.type === 'file' ? size(x) : 4096 + Object.values(x.children).reduce((s, k) => s + total(k), 0));
      const fmt = (b: number) => (flags.has('h') ? human(b) : String(Math.ceil(b / 1024)));
      if (flags.has('s') || n.type === 'file') return [ln(`${fmt(total(n)).padEnd(6)}${t}`)];
      return [
        ...Object.entries(n.children)
          .filter(([, v]) => v.type === 'dir')
          .map(([k, v]) => ln(`${fmt(total(v)).padEnd(6)}${t.replace(/\/$/, '')}/${k}`)),
        ln(`${fmt(total(n)).padEnd(6)}${t}`),
      ];
    },
  },
  df: {
    group: 'system',
    desc: 'free space',
    run: () => [
      ln('Filesystem   Size  Used Avail Use% Mounted on', 'hi'),
      ln('/dev/brass    64K   41K   23K  64% /'),
      ln('punchcards   1.2K  1.2K     0 100% /proc'),
      ln('tmpfs         16K    0K   16K   0% /tmp'),
    ],
  },
  chmod: {
    group: 'files',
    desc: 'change who may run a file',
    usage: 'chmod +x|-x|755 <file...>',
    run: (c) => {
      const [mode, ...files] = c.args;
      if (!mode || !files.length) return [err('usage: chmod +x|-x|755 <file...>')];
      const x = /^\d+$/.test(mode) ? parseInt(mode[0], 10) % 2 === 1 : mode.includes('+x') ? true : mode.includes('-x') ? false : null;
      if (x === null) return [err(`chmod: invalid mode: '${mode}'`)];
      const out: Line[] = [];
      for (const f of files) {
        const n = c.sh.node(f);
        if (!n) out.push(err(`chmod: cannot access '${f}': No such file or directory`));
        else if (n.type === 'file') n.mode = x ? 'x' : '';
      }
      return out;
    },
  },
  basename: { group: 'files', desc: 'the last part of a path', hidden: true, run: (c) => [ln((c.args[0] ?? '').replace(/\/+$/, '').split('/').pop() ?? '')] },
  dirname: {
    group: 'files',
    desc: 'all but the last part of a path',
    hidden: true,
    run: (c) => {
      const p = (c.args[0] ?? '').replace(/\/+$/, '');
      const i = p.lastIndexOf('/');
      return [ln(i < 0 ? '.' : i === 0 ? '/' : p.slice(0, i))];
    },
  },
  open: {
    group: 'files',
    desc: 'open a file or an address',
    usage: 'open <file | url>',
    run: (c) => {
      const t = c.args.join(' ');
      if (!t) return [err('usage: open <file | url>')];
      const n = c.sh.node(t);
      if (n && n.type === 'file' && n.exec) {
        if (n.exec.startsWith('cmd:')) {
          const r = c.sh.runFile(n, t, [], null, false);
          return r.program ?? r.lines;
        }
        return c.sh.opener(n.exec);
      }
      if (n && n.type === 'file') return cat({ ...c, args: [t] });
      if (n) return [err(`open: ${t}: is a directory. try: cd ${t}`)];
      if (/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(t)) return c.sh.opener(`link:${/^https?:\/\//.test(t) ? t : `https://${t}`}`);
      return [err(`open: ${t}: No such file or directory`)];
    },
  },
  'xdg-open': { group: 'files', desc: 'open a file or an address', hidden: true, run: (c) => fileCommands.open.run(c) },
  nano: { group: 'files', desc: 'edit a file (^S saves, ^X quits)', usage: 'nano <file>', run: (c) => edit(c, 'nano') },
  vi: { group: 'files', desc: 'edit a file, the hard way (:wq)', usage: 'vi <file>', run: (c) => edit(c, 'vi') },
};

function edit(c: Ctx, flavour: 'nano' | 'vi') {
  const f = c.args[0];
  if (c.piped) return [err(`${c.name}: the output is not a terminal`)];
  const parts = f ? c.sh.resolve(f) : null;
  const n = parts ? c.sh.fs.get(parts) : null;
  if (n?.type === 'dir') return [err(`${c.name}: ${f}: is a directory`)];
  if (parts && denied(c.sh, parts)) return [err(`${c.name}: ${f}: Permission denied`)];
  const text = n && n.type === 'file' ? read(n) : '';
  return editor(flavour, f ?? '', text, (name, t) => {
    const to = c.sh.resolve(name);
    return denied(c.sh, to) ? 'Permission denied' : c.sh.fs.write(to, t);
  });
}
