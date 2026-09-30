import { boot } from '../programs/boot';
import { top } from '../programs/top';
import type { Cmd, Ctx, Group } from '../shell';
import { HOST, USER } from '../shell';
import { ln, segs, type Line, type Program, type Tone } from '../types';
import { DATE_DEFAULT, MONTHS_LONG, clampInt, columns, opts, since, strftime } from '../util';

const err = (text: string): Line => ln(text, 'err');
const SUDO_PASSWORD = 'kettle';

/** What help shows first: the commands worth trying, by kind. Everything is in `help -a`. */
const FEATURED: [string, string[]][] = [
  ['files', ['ls', 'cd', 'pwd', 'cat', 'less', 'tree', 'find', 'grep', 'mkdir', 'touch', 'rm', 'mv', 'cp', 'nano', 'vi']],
  ['system', ['neofetch', 'date', 'cal', 'uptime', 'whoami', 'uname', 'ps', 'top', 'history', 'man', 'clear', 'sudo']],
  ['fun', ['sl', 'cowsay', 'fortune', 'figlet', 'cmatrix', 'donut', 'pipes', 'clock', 'hack', 'lolcat', '8ball', 'joke']],
  ['games', ['snake', 'tetris', '2048', 'pong', 'mines', 'ttt', 'hangman', 'guess']],
  ['site', ['projects', 'contact', 'music', 'sound', 'enter']],
];
const GROUPS: Group[] = ['files', 'text', 'system', 'fun', 'games', 'site'];

function groupLines(label: string, names: string[], cols: number): Line[] {
  const indent = 8;
  const out: Line[] = [];
  let cur = '';
  for (const n of names) {
    if (cur && indent + cur.length + 1 + n.length > cols) {
      out.push(out.length ? segs([' '.repeat(indent)], [cur]) : segs([label.padEnd(indent), 'hi'], [cur]));
      cur = n;
    } else cur = cur ? `${cur} ${n}` : n;
  }
  if (cur) out.push(out.length ? segs([' '.repeat(indent)], [cur]) : segs([label.padEnd(indent), 'hi'], [cur]));
  return out;
}

function help(c: Ctx): Line[] {
  const cols = c.io.cols();
  const all = c.args.includes('-a') || c.args.includes('--all') || c.args.includes('all');
  const out: Line[] = [];
  if (all) {
    for (const g of GROUPS) {
      const names = Object.keys(c.sh.commands)
        .filter((k) => c.sh.commands[k].group === g)
        .sort();
      out.push(...groupLines(g, names, cols));
    }
  } else {
    for (const [g, names] of FEATURED) out.push(...groupLines(g, names.filter((n) => c.sh.commands[n]), cols));
  }
  out.push(segs(['more    ', 'hi'], [all ? 'man <command> explains one' : 'help -a lists all. man <command> explains one.', 'dim']));
  out.push(segs(['keys    ', 'hi'], ['tab completes · up recalls · ^C stops · ^L clears', 'dim']));
  return out;
}

const MANUAL: Record<string, string[]> = {
  man: ['an interface to the manuals.', 'man <command> shows what a command does and how to call it.', 'help lists the commands; help -a lists every one.'],
  ryhox: [
    'the person who built this machine: a web developer and three.js engineer.',
    'builds playful, tactile things for the web. try: cat ~/readme.txt',
  ],
  sudo: ['run a command as root.', 'you will be asked for the password. there is a hint in a dotfile in ~.'],
  sl: ['steam locomotive. for when you meant ls.', 'runs across the screen; any key lets it pass. -a: an accident. -F: it flies.'],
  bash: [
    'the shell. it understands quotes, $VARIABLES, $((sums)), $(commands),',
    'globs (*.txt), pipes (|), redirects (> >> < 2>), ; && || and !!.',
    'aliases live in the alias command; scripts run with ./file.sh after chmod +x.',
  ],
};

function man(c: Ctx): Line[] {
  const name = c.args[0];
  if (!name) return [ln('What manual page do you want?'), ln("For example, try 'man man'.", 'dim')];
  const cmd = c.sh.commands[name];
  const extra = MANUAL[name];
  if (!cmd && !extra) return [err(`No manual entry for ${name}`)];
  const title = `${name.toUpperCase()}(1)`;
  const cols = c.io.cols();
  const mid = 'Ryhox Manual';
  const head = title + ' '.repeat(Math.max(1, Math.floor((cols - mid.length) / 2) - title.length)) + mid;
  return [
    ln(head, 'dim'),
    ln('NAME', 'hi'),
    ln(`    ${name} - ${cmd?.desc ?? extra?.[0] ?? ''}`),
    ...(cmd ? [ln('SYNOPSIS', 'hi'), ln(`    ${cmd.usage ?? name}`)] : []),
    ...(extra ? [ln('DESCRIPTION', 'hi'), ...extra.slice(cmd ? 0 : 1).map((t) => ln(`    ${t}`))] : []),
  ];
}

/** A cog, drawn in half blocks: `w` cells across, `h` rows of cells (a cell is 0.4 wide, 1.1 tall). */
export function gear(w: number, h: number, teeth = 10, turn = 0): string[] {
  const px = 0.4;
  const py = 0.55;
  const cx = (w * px) / 2;
  const cy = (h * 2 * py) / 2;
  const R = Math.min(cx, cy);
  const on = (x: number, y: number) => {
    const dx = (x + 0.5) * px - cx;
    const dy = (y + 0.5) * py - cy;
    const d = Math.hypot(dx, dy) / R;
    const a = Math.atan2(dy, dx) + turn;
    const tooth = Math.cos(a * teeth) > -0.15;
    if (d > (tooth ? 0.98 : 0.8)) return false;
    // a ring, spokes to the hub, and the hole for the arbor
    if (d > 0.6) return true;
    if (d < 0.14) return false;
    if (d < 0.3) return true;
    return Math.abs(Math.sin(a * 3)) < 0.28;
  };
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let line = '';
    for (let x = 0; x < w; x++) {
      const t = on(x, y * 2);
      const b = on(x, y * 2 + 1);
      line += t && b ? '█' : t ? '▀' : b ? '▄' : ' ';
    }
    rows.push(line);
  }
  return rows;
}

function neofetch(c: Ctx): Line[] {
  const up = since(Date.now() - c.sh.started);
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const info: [string, string][] = [
    ['OS', 'Ryhox OS 3.14 (Brass)'],
    ['Host', 'Lumen 64 Spark'],
    ['Uptime', up],
    ['Shell', 'bash 5.2'],
    ['Resolution', `${vw}x${vh}`],
    ['CPU', 'Analytical Engine (64) @ 1 Hz'],
    ['Memory', `${41 + (Math.floor(Date.now() / 7000) % 5)}K / 64K`],
  ];
  const title = `${c.sh.user}@${HOST}`;
  const right: Line[] = [
    segs([c.sh.user, 'hi'], ['@', 'dim'], [HOST, 'hi']),
    ln('-'.repeat(title.length), 'dim'),
    ...info.map(([k, v]) => segs([`${k}: `, 'ok'], [v])),
    segs(['███', 'out'], ['███', 'hi'], ['███', 'ok'], ['███', 'dim'], ['███', 'err']),
  ];
  const logo = ['', ...gear(24, 9, 8)];
  const narrow = c.io.cols() < 64;
  if (narrow) return [...logo.map((t) => ln(t, 'ok')), ...right];
  const rows = Math.max(logo.length, right.length);
  const out: Line[] = [];
  for (let i = 0; i < rows; i++) {
    const l = logo[i] ?? '';
    const r = right[i];
    out.push(segs([l.padEnd(26), 'ok'], ...(r?.segs ?? (r ? [[r.text, r.tone] as const] : []))));
  }
  return out;
}

function cal(c: Ctx): Line[] {
  const now = new Date();
  const nums = c.args.map((a) => parseInt(a, 10)).filter((n) => Number.isFinite(n));
  const month = nums.length >= 2 ? nums[0] - 1 : now.getMonth();
  const year = nums.length >= 2 ? nums[1] : nums.length === 1 && nums[0] > 12 ? nums[0] : now.getFullYear();
  if (month < 0 || month > 11) return [err(`cal: ${nums[0]} is neither a month number (1..12) nor a name`)];
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const title = `${MONTHS_LONG[month]} ${year}`;
  const out: Line[] = [ln(title.padStart(10 + Math.ceil(title.length / 2)), 'hi'), ln('Su Mo Tu We Th Fr Sa', 'dim')];
  // six weeks of cells, blank before the 1st and after the last day; today in inverse
  for (let week = 0; week * 7 < first + days; week++) {
    const row: [string, Tone?][] = [];
    for (let wd = 0; wd < 7; wd++) {
      const d = week * 7 + wd - first + 1;
      if (wd) row.push([' ']);
      const today = d === now.getDate() && month === now.getMonth() && year === now.getFullYear();
      row.push([d >= 1 && d <= days ? String(d).padStart(2) : '  ', today ? 'inv' : undefined]);
    }
    out.push(segs(...row));
  }
  return out;
}

/** The password prompt, three tries, as sudo and su ask. */
function password(c: Ctx, ask: string, ok: () => Line[] | Program | void, fail: (tries: number) => Line[]): Program {
  let tries = 0;
  const p: Program = {
    mode: 'inline',
    done: false,
    prompt: ask,
    secret: true,
    hint: `${c.name} · type the password · ^C gives up`,
    input(text) {
      c.io.print(ln(ask, 'out'));
      if (text === SUDO_PASSWORD) {
        p.done = true;
        const r = ok();
        if (!r) return;
        if (Array.isArray(r)) c.io.print(...r);
        else c.io.spawn(r);
        return;
      }
      tries++;
      const out = fail(tries);
      c.io.print(...out);
      if (tries >= 3 || c.name === 'su') p.done = true;
    },
  };
  return p;
}

/** Run a line as root, and step back down once it (and anything it started) is over. */
function asRoot(c: Ctx, line: string): Line[] | Program | void {
  const was = c.sh.root;
  c.sh.root = true;
  c.sh.fs.root_ok = true;
  const r = c.sh.exec(line);
  if (r.program) {
    const child = r.program;
    const done = child.exit;
    child.exit = (i) => {
      c.sh.root = was;
      c.sh.fs.root_ok = was;
      return done?.call(child, i);
    };
    if (r.lines.length) c.io.print(...r.lines);
    return child;
  }
  c.sh.root = was;
  c.sh.fs.root_ok = was;
  return r.lines;
}

function sudo(c: Ctx): Line[] | Program {
  const args = c.args.filter((a) => a !== '-S');
  if (!args.length) return [ln('usage: sudo <command>', 'dim')];
  if (args.join(' ') === 'make me a sandwich') return [ln('okay.', 'ok')];
  const line = args.map((a) => (/[\s'"$]/.test(a) ? `'${a.replace(/'/g, "'\\''")}'` : a)).join(' ');
  const shell = ['su', '-i', '-s', 'bash', 'sh'].includes(args[0]);
  const run = () => {
    if (shell) {
      c.sh.root = true;
      c.sh.fs.root_ok = true;
      return [ln('# with great power comes great responsibility. exit to step down.', 'dim')];
    }
    return asRoot(c, line);
  };
  if (c.sh.root) {
    const r = run();
    return r ?? [];
  }
  return password(c, `[sudo] password for ${USER}: `, run, (t) => (t >= 3 ? [err('sudo: 3 incorrect password attempts')] : [ln('Sorry, try again.', 'err')]));
}

function ping(c: Ctx): Line[] | Program {
  const { values, rest } = opts(c.args, 'c');
  const host = rest[0] ?? '';
  if (!host) return [err('ping: usage error: Destination address required')];
  const count = values.c ? clampInt(values.c, 4, 1, 100) : Infinity;
  const ip = host === 'localhost' || host === HOST ? '127.0.0.1' : `10.64.${host.length % 200}.${(host.charCodeAt(0) * 7) % 250}`;
  c.io.print(ln(`PING ${host} (${ip}) 56(84) bytes of data.`));
  let sent = 0;
  let next = 0;
  const times: number[] = [];
  const p: Program = {
    mode: 'inline',
    done: false,
    hint: 'ping · ^C stops',
    tick(t) {
      if (!next) next = t;
      if (t < next) return false;
      next = t + 1;
      const ms = host === 'localhost' ? 0.04 + Math.random() * 0.03 : 12 + Math.random() * 14;
      times.push(ms);
      c.io.print(ln(`64 bytes from ${ip}: icmp_seq=${++sent} ttl=64 time=${ms.toFixed(ms < 1 ? 3 : 1)} ms`));
      if (sent >= count) p.done = true;
      return true;
    },
    exit() {
      const avg = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
      return [
        ln(`--- ${host} ping statistics ---`),
        ln(`${sent} packets transmitted, ${times.length} received, 0% packet loss`),
        ...(times.length ? [ln(`rtt min/avg/max = ${Math.min(...times).toFixed(1)}/${avg.toFixed(1)}/${Math.max(...times).toFixed(1)} ms`, 'dim')] : []),
      ];
    },
  };
  return p;
}

function sleepFor(seconds: number): Program {
  let left = seconds;
  const p: Program = {
    mode: 'inline',
    done: false,
    hint: 'sleep · ^C wakes it',
    tick(_t, dt) {
      left -= dt;
      if (left <= 0) p.done = true;
      return false;
    },
  };
  return p;
}

const PROCS = [
  [1, '?', 'escapement'],
  [64, 'tty1', 'bash'],
  [314, '?', 'lumen-tube'],
  [418, '?', 'kettle'],
  [512, '?', 'resonance'],
] as const;

function pkg(c: Ctx): Line[] {
  const [verb, ...what] = c.args;
  const thing = what.join(' ') || 'nothing';
  switch (c.name) {
    case 'apt':
    case 'apt-get':
      if (!verb) return [ln('apt 2.7.14 (brass)'), ln('usage: apt [options] command', 'dim')];
      if (!c.sh.root) return [err('E: Could not open lock file /var/lib/dpkg/lock-frontend (13: Permission denied)'), err('E: Unable to acquire the dpkg frontend lock, are you root?')];
      if (verb === 'update') return [ln('Hit:1 http://archive.ryhox.dev brass InRelease'), ln('Reading package lists... Done'), ln('All packages are up to date.', 'ok')];
      return [ln('Reading package lists... Done'), err(`E: Unable to locate package ${thing}`)];
    case 'npm':
      if (verb === 'install' || verb === 'i')
        return [ln('npm WARN deprecated everything@1.0.0: it was fine yesterday', 'dim'), ln(''), ln('added 1,284 packages in 3.14s'), ln(''), ln('216 packages are looking for funding', 'dim')];
      return [ln('npm 10.9.0'), ln('usage: npm install <package>', 'dim')];
    case 'pip':
    case 'pip3':
      return [err('error: externally-managed-environment'), ln('this environment is managed by the escapement.', 'dim')];
    case 'brew':
      return [err('brew: this is not a mac. it is a lumen 64.')];
    case 'pacman':
      return c.sh.root ? [ln(':: Synchronizing package databases...'), ln(' brass is up to date', 'ok')] : [err('error: you cannot perform this operation unless you are root.')];
    default:
      return [];
  }
}

export const systemCommands: Record<string, Cmd> = {
  help: { group: 'system', desc: 'the commands, by kind', usage: 'help [-a]', run: help },
  man: { group: 'system', desc: 'what a command does', usage: 'man <command>', run: man },
  whoami: { group: 'system', desc: 'who you are', run: (c) => [ln(c.sh.user)] },
  id: {
    group: 'system',
    desc: 'user and groups',
    run: (c) => [ln(c.sh.root ? 'uid=0(root) gid=0(root) groups=0(root)' : 'uid=1000(ryhox) gid=1000(ryhox) groups=1000(ryhox),418(kettle)')],
  },
  groups: { group: 'system', desc: 'your groups', hidden: true, run: (c) => [ln(c.sh.root ? 'root' : 'ryhox kettle')] },
  hostname: { group: 'system', desc: 'the machine name', run: () => [ln(HOST)] },
  uname: {
    group: 'system',
    desc: 'the system',
    usage: 'uname [-asnrm]',
    run: (c) => {
      const { flags } = opts(c.args);
      const parts: [string, string][] = [
        ['s', 'RyhoxOS'],
        ['n', HOST],
        ['r', '3.14.1864-brass'],
        ['v', '#1 SMP Mar 14 2026'],
        ['m', 'analytical-engine'],
      ];
      if (flags.has('a')) return [ln(parts.map((p) => p[1]).join(' ') + ' GNU/Linux')];
      const chosen = parts.filter(([f]) => flags.has(f));
      return [ln((chosen.length ? chosen : [parts[0]]).map((p) => p[1]).join(' '))];
    },
  },
  neofetch: { group: 'system', desc: 'the machine, at a glance', run: neofetch },
  fastfetch: { group: 'system', desc: 'the machine, at a glance', hidden: true, run: neofetch },
  screenfetch: { group: 'system', desc: 'the machine, at a glance', hidden: true, run: neofetch },
  date: {
    group: 'system',
    desc: 'the date and time',
    usage: 'date [-u] [+FORMAT]',
    run: (c) => {
      const f = c.args.find((a) => a.startsWith('+'));
      const d = new Date();
      if (c.args.includes('-u')) {
        const u = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
        return [ln(strftime(f ? f.slice(1) : DATE_DEFAULT, u).replace(/ [A-Z]{2,5}[+-]?\d* (\d{4})$/, ' UTC $1'))];
      }
      return strftime(f ? f.slice(1) : DATE_DEFAULT, d)
        .split('\n')
        .map((t) => ln(t));
    },
  },
  cal: { group: 'system', desc: 'a calendar', usage: 'cal [month year]', run: cal },
  uptime: {
    group: 'system',
    desc: 'how long the tube has been on',
    run: (c) => [ln(` ${strftime('%T')} up ${since(Date.now() - c.sh.started)},  1 user,  load average: 0.64, 0.64, 0.64`)],
  },
  who: { group: 'system', desc: 'who is logged in', run: (c) => [ln(`${c.sh.user.padEnd(9)}tty1         ${strftime('%F %R', new Date(c.sh.started))} (${HOST})`)] },
  w: { group: 'system', desc: 'who is logged in', hidden: true, run: (c) => systemCommands.who.run(c) },
  ps: {
    group: 'system',
    desc: 'processes',
    run: () => [
      ln('  PID TTY          TIME CMD', 'hi'),
      ...PROCS.map(([pid, tty, name], i) => ln(`${String(pid).padStart(5)} ${tty.padEnd(8)} 00:00:0${i} ${name}`)),
      ln(`${String(6400 + (Date.now() % 97)).padStart(5)} tty1     00:00:00 ps`),
    ],
  },
  top: { group: 'system', desc: 'processes, live (q quits)', run: (c) => (c.piped ? systemCommands.ps.run(c) : top(PROCS.map(([pid, , name]) => [pid, name]))) },
  kill: {
    group: 'system',
    desc: 'stop a process',
    usage: 'kill <pid>',
    run: (c) => {
      const pid = c.args.filter((a) => !a.startsWith('-'))[0];
      if (!pid) return [err('kill: usage: kill [-s sigspec] pid')];
      if (pid === '1') return [err('kill: (1) - Operation not permitted')];
      if (pid === '418') return [ln('kill: (418) - the kettle is always on.', 'err')];
      if (pid === '64') return [ln('bash: that is you. carry on.', 'dim')];
      if (pid === '314') return [ln('kill: (314) - the tube you are reading this on would go dark. no.', 'err')];
      if (pid === '512') return [ln(c.host.music?.('stop') ?? 'resonance stopped.', 'dim')];
      return [err(`kill: (${pid}) - No such process`)];
    },
  },
  killall: {
    group: 'system',
    desc: 'stop processes by name',
    hidden: true,
    run: (c) => {
      const p = PROCS.find((x) => x[2] === c.args[0]);
      return p ? systemCommands.kill.run({ ...c, args: [String(p[0])] }) as Line[] : [err(`${c.args[0] ?? ''}: no process found`)];
    },
  },
  free: {
    group: 'system',
    desc: 'memory',
    run: () => {
      const used = 41 + (Math.floor(Date.now() / 7000) % 5);
      return [ln('         total    used    free', 'hi'), ln(`Mem:       64K     ${used}K     ${64 - used}K`), ln('Punch:   1200    1200       0')];
    },
  },
  history: {
    group: 'system',
    desc: 'what you typed',
    usage: 'history [-c] [n]',
    run: (c) => {
      if (c.args[0] === '-c') {
        c.sh.history.length = 0;
        return [];
      }
      const n = clampInt(c.args[0], c.sh.history.length, 0, c.sh.history.length);
      const start = c.sh.history.length - n;
      return c.sh.history.slice(start).map((h, i) => segs([`${String(start + i + 1).padStart(5)}  `, 'dim'], [h]));
    },
  },
  env: {
    group: 'system',
    desc: 'the environment',
    run: (c) => {
      const keys = [...new Set([...Object.keys(c.sh.env), 'PWD', 'USER'])].filter((k) => /^[A-Z_]/.test(k)).sort();
      return keys.map((k) => segs([k, 'hi'], ['=', 'dim'], [c.sh.variable(k)]));
    },
  },
  printenv: {
    group: 'system',
    desc: 'the environment',
    hidden: true,
    run: (c) => (c.args.length ? c.args.map((k) => ln(c.sh.variable(k))) : systemCommands.env.run(c)) as Line[],
  },
  export: {
    group: 'system',
    desc: 'set a variable',
    usage: 'export NAME=value',
    run: (c) => {
      if (!c.args.length) return Object.keys(c.sh.env).sort().map((k) => ln(`declare -x ${k}="${c.sh.env[k]}"`, 'dim'));
      for (const a of c.args) {
        const i = a.indexOf('=');
        if (i > 0) c.sh.env[a.slice(0, i)] = a.slice(i + 1);
        else if (!/^[A-Za-z_]\w*$/.test(a)) return [err(`bash: export: \`${a}': not a valid identifier`)];
      }
      return [];
    },
  },
  unset: {
    group: 'system',
    desc: 'forget a variable',
    hidden: true,
    run: (c) => {
      for (const k of c.args) delete c.sh.env[k];
      return [];
    },
  },
  alias: {
    group: 'system',
    desc: 'name a command line',
    usage: "alias name='command'",
    run: (c) => {
      if (!c.args.length)
        return Object.keys(c.sh.aliases)
          .sort()
          .map((k) => ln(`alias ${k}='${c.sh.aliases[k]}'`));
      const out: Line[] = [];
      for (const a of c.args) {
        const i = a.indexOf('=');
        if (i > 0) c.sh.aliases[a.slice(0, i)] = a.slice(i + 1);
        else if (c.sh.aliases[a] !== undefined) out.push(ln(`alias ${a}='${c.sh.aliases[a]}'`));
        else out.push(err(`bash: alias: ${a}: not found`));
      }
      return out;
    },
  },
  unalias: {
    group: 'system',
    desc: 'drop an alias',
    hidden: true,
    run: (c) => c.args.flatMap((a) => (a in c.sh.aliases ? (delete c.sh.aliases[a], []) : [err(`bash: unalias: ${a}: not found`)])),
  },
  which: {
    group: 'system',
    desc: 'where a command lives',
    usage: 'which <command>',
    run: (c) =>
      c.args.map((a) => (c.sh.aliases[a] !== undefined ? ln(`${a}: aliased to ${c.sh.aliases[a]}`) : c.sh.commands[a] ? ln(`/bin/${a}`) : err(`which: no ${a} in (${c.sh.env.PATH})`))),
  },
  type: {
    group: 'system',
    desc: 'what a name is',
    hidden: true,
    run: (c) =>
      c.args.map((a) =>
        c.sh.aliases[a] !== undefined
          ? ln(`${a} is aliased to \`${c.sh.aliases[a]}'`)
          : ['cd', 'echo', 'export', 'alias', 'history', 'exit', 'type', 'source'].includes(a)
            ? ln(`${a} is a shell builtin`)
            : c.sh.commands[a]
              ? ln(`${a} is /bin/${a}`)
              : err(`bash: type: ${a}: not found`),
      ),
  },
  compgen: {
    group: 'system',
    desc: 'every command name',
    hidden: true,
    run: (c) => columns(Object.keys(c.sh.commands).sort().map((text) => ({ text })), c.io.cols()),
  },
  clear: {
    group: 'system',
    desc: 'clear the screen',
    run: (c) => {
      c.io.clear();
    },
  },
  reset: {
    group: 'system',
    desc: 'the screen as it was on arrival',
    run: (c) => {
      c.io.reset();
    },
  },
  exit: {
    group: 'system',
    desc: 'leave (as far as you can)',
    run: (c) => {
      if (c.sh.root) {
        c.sh.root = false;
        c.sh.fs.root_ok = false;
        return [ln('logout', 'dim')];
      }
      return [ln('logout', 'dim'), ln('there is no exit. only the works. scroll down, or type enter.', 'dim')];
    },
  },
  logout: { group: 'system', desc: 'leave', hidden: true, run: (c) => systemCommands.exit.run(c) },
  sudo: { group: 'system', desc: 'run a command as root', usage: 'sudo <command>', run: sudo },
  su: {
    group: 'system',
    desc: 'become root',
    run: (c) => {
      if (c.sh.root) return [];
      return password(
        c,
        'Password: ',
        () => {
          c.sh.root = true;
          c.sh.fs.root_ok = true;
        },
        () => [err('su: Authentication failure')],
      );
    },
  },
  passwd: { group: 'system', desc: 'change your password', hidden: true, run: () => [ln('Changing password for ryhox.'), err('passwd: the kettle keeps the password. it is not telling.')] },
  sleep: {
    group: 'system',
    desc: 'wait',
    usage: 'sleep <seconds>',
    run: (c) => {
      const s = parseFloat(c.args[0] ?? '');
      if (!Number.isFinite(s) || s < 0) return [err("sleep: missing operand")];
      return sleepFor(Math.min(s, 120));
    },
  },
  true: { group: 'system', desc: 'succeed', hidden: true, run: (c) => void (c.sh.status = 0) },
  false: {
    group: 'system',
    desc: 'fail',
    hidden: true,
    run: (c) => {
      c.sh.status = 1;
    },
  },
  source: {
    group: 'system',
    desc: 'run a script',
    usage: 'source <file>',
    run: (c) => {
      const [f, ...args] = c.args;
      if (!f) return [err('bash: source: filename argument required')];
      const n = c.sh.node(f);
      if (!n || n.type !== 'file') return [err(`bash: ${f}: No such file or directory`)];
      const r = c.sh.script(typeof n.content === 'function' ? n.content() : n.content, args);
      return r.lines;
    },
  },
  bash: {
    group: 'system',
    desc: 'the shell',
    hidden: true,
    run: (c) => {
      if (c.args[0] === '-c') return c.sh.exec(c.args.slice(1).join(' ')).lines;
      if (c.args.length) return systemCommands.source.run(c);
      return [ln('you are already in bash. it is bash all the way down.', 'dim')];
    },
  },
  sh: { group: 'system', desc: 'the shell', hidden: true, run: (c) => systemCommands.bash.run(c) },
  ping: { group: 'system', desc: 'is it there? (^C stops)', usage: 'ping [-c N] <host>', run: ping },
  curl: {
    group: 'system',
    desc: 'fetch an address',
    usage: 'curl <url>',
    run: (c) => {
      const url = c.args.filter((a) => !a.startsWith('-'))[0];
      if (!url) return [err('curl: try \'curl --help\' for more information')];
      const host = url.replace(/^https?:\/\//, '').split('/')[0];
      if (/ryhox\.dev$/.test(host))
        return [ln('<!doctype html>'), ln('<title>Ryhox | Web Developer & Three.js Engineer</title>'), ln('<!-- you are already here. look around. -->', 'dim')];
      return [err(`curl: (7) Failed to connect to ${host} port 443: the lumen 64 has no modem`)];
    },
  },
  wget: { group: 'system', desc: 'fetch an address', hidden: true, run: (c) => systemCommands.curl.run(c) },
  ssh: { group: 'system', desc: 'another machine', hidden: true, run: (c) => [err(`ssh: connect to host ${c.args[0] ?? '?'} port 22: the lumen 64 has no modem`)] },
  ifconfig: {
    group: 'system',
    desc: 'the network',
    run: () => [ln('tube0: flags=4163<UP,RUNNING,PNEUMATIC>  mtu 64'), ln('        inet 10.64.0.1  netmask 255.255.255.0', 'dim'), ln('        pressure 2.4 bar  valves 16', 'dim')],
  },
  ip: { group: 'system', desc: 'the network', hidden: true, run: (c) => systemCommands.ifconfig.run(c) },
  reboot: {
    group: 'system',
    desc: 'restart the machine',
    run: (c) => (c.sh.root ? boot(c.io, c.sh, 'reboot') : [err('Failed to reboot: Access denied. (try sudo)')]),
  },
  shutdown: {
    group: 'system',
    desc: 'switch the machine off',
    run: (c) => (c.sh.root ? boot(c.io, c.sh, 'halt') : [err('Failed to power off: Access denied. (try sudo)')]),
  },
  poweroff: { group: 'system', desc: 'switch the machine off', hidden: true, run: (c) => systemCommands.shutdown.run(c) },
  halt: { group: 'system', desc: 'switch the machine off', hidden: true, run: (c) => systemCommands.shutdown.run(c) },
  apt: { group: 'system', desc: 'packages', hidden: true, run: pkg },
  'apt-get': { group: 'system', desc: 'packages', hidden: true, run: pkg },
  npm: { group: 'system', desc: 'packages', hidden: true, run: pkg },
  pip: { group: 'system', desc: 'packages', hidden: true, run: pkg },
  pip3: { group: 'system', desc: 'packages', hidden: true, run: pkg },
  brew: { group: 'system', desc: 'packages', hidden: true, run: pkg },
  pacman: { group: 'system', desc: 'packages', hidden: true, run: pkg },
  git: {
    group: 'system',
    desc: 'version control',
    hidden: true,
    run: (c) =>
      c.args[0] === '--version'
        ? [ln('git version 2.46.0')]
        : c.args[0] === 'blame'
          ? [ln('ryhox. it is always ryhox.', 'dim')]
          : [err('fatal: not a git repository (or any of the parent directories): .git')],
  },
};

export { USER };
