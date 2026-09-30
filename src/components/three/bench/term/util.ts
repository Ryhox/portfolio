import type { Line, Tone } from './types';

/** `-la --all file` → flags {l, a, all} and the operands. Values for `valued` flags (-n 5) are kept. */
export function opts(args: string[], valued = '') {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  const rest: string[] = [];
  let done = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (done || a === '-' || !a.startsWith('-') || /^-\d/.test(a)) {
      rest.push(a);
      continue;
    }
    if (a === '--') {
      done = true;
      continue;
    }
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      flags.add(k);
      if (v !== undefined) values[k] = v;
      continue;
    }
    for (let j = 1; j < a.length; j++) {
      const f = a[j];
      flags.add(f);
      if (valued.includes(f)) {
        const v = a.slice(j + 1) || args[++i];
        if (v !== undefined) values[f] = v;
        break;
      }
    }
  }
  return { flags, values, rest };
}

/** Names laid out in columns across the terminal, filled top to bottom, as ls does. */
export function columns(items: { text: string; tone?: Tone }[], width: number): Line[] {
  if (!items.length) return [];
  // as many columns as fit, each as wide as its own longest name
  let rows = items.length;
  let widths = [Math.max(...items.map((i) => i.text.length))];
  for (let cols = items.length; cols > 1; cols--) {
    const r = Math.ceil(items.length / cols);
    const w = Array.from({ length: Math.ceil(items.length / r) }, (_, c) => Math.max(...items.slice(c * r, c * r + r).map((i) => i.text.length)) + 2);
    if (w.reduce((a, b) => a + b, 0) - 2 <= width) {
      rows = r;
      widths = w;
      break;
    }
  }
  const out: Line[] = [];
  for (let r = 0; r < rows; r++) {
    const segs: [string, Tone?][] = [];
    widths.forEach((w, c) => {
      const it = items[c * rows + r];
      if (!it) return;
      const last = c === widths.length - 1 || !items[(c + 1) * rows + r];
      segs.push([last ? it.text : it.text.padEnd(w), it.tone]);
    });
    out.push({ text: segs.map((s) => s[0]).join(''), segs });
  }
  return out;
}

/** Words folded onto lines no wider than `width`. */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      if (cur && cur.length + 1 + word.length > width) {
        out.push(cur);
        cur = '';
      }
      let w = word;
      while (w.length > width) {
        out.push(w.slice(0, width));
        w = w.slice(width);
      }
      cur = cur ? `${cur} ${w}` : w;
    }
    out.push(cur);
  }
  return out;
}

export const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

export const clampInt = (v: string | undefined, def: number, lo = 0, hi = 1e6) => {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export { MONTHS_LONG };

/** ls's short date: "Sep 30 19:34", or with the year for old files. */
export function lsDate(t: number) {
  const d = new Date(t);
  const old = Date.now() - t > 1000 * 60 * 60 * 24 * 180;
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${old ? String(d.getFullYear()).padStart(5) : `${p2(d.getHours())}:${p2(d.getMinutes())}`}`;
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** date's formats: the default, and the usual % codes. */
export function strftime(fmt: string, d = new Date()) {
  const tz = -d.getTimezoneOffset();
  const map: Record<string, () => string> = {
    a: () => DAYS[d.getDay()],
    A: () => DAYS_LONG[d.getDay()],
    b: () => MONTHS[d.getMonth()],
    h: () => MONTHS[d.getMonth()],
    B: () => MONTHS_LONG[d.getMonth()],
    d: () => p2(d.getDate()),
    e: () => String(d.getDate()).padStart(2),
    H: () => p2(d.getHours()),
    I: () => p2(d.getHours() % 12 || 12),
    M: () => p2(d.getMinutes()),
    S: () => p2(d.getSeconds()),
    p: () => (d.getHours() < 12 ? 'AM' : 'PM'),
    m: () => p2(d.getMonth() + 1),
    y: () => p2(d.getFullYear() % 100),
    Y: () => String(d.getFullYear()),
    j: () => String(Math.floor((+d - +new Date(d.getFullYear(), 0, 0)) / 864e5)).padStart(3, '0'),
    u: () => String(d.getDay() || 7),
    s: () => String(Math.floor(+d / 1000)),
    Z: () => Intl.DateTimeFormat('en', { timeZoneName: 'short' }).formatToParts(d).find((x) => x.type === 'timeZoneName')?.value ?? 'UTC',
    z: () => `${tz >= 0 ? '+' : '-'}${p2(Math.floor(Math.abs(tz) / 60))}${p2(Math.abs(tz) % 60)}`,
    F: () => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`,
    T: () => `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`,
    R: () => `${p2(d.getHours())}:${p2(d.getMinutes())}`,
    D: () => `${p2(d.getMonth() + 1)}/${p2(d.getDate())}/${p2(d.getFullYear() % 100)}`,
    n: () => '\n',
    t: () => '\t',
    '%': () => '%',
  };
  return fmt.replace(/%([a-zA-Z%])/g, (m, k: string) => (map[k] ? map[k]() : m));
}

export const DATE_DEFAULT = '%a %b %e %T %Z %Y';

/** "3 days, 4:05" as uptime says it. */
export function since(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}:${p2(m % 60)}` : `${m} min`;
}
