import type { Line, Seg, Tone } from './types';

/** A line as the cells it covers: each character with its tone. */
export function cells(l: Line): [string, Tone | undefined][] {
  const out: [string, Tone | undefined][] = [];
  if (l.segs) for (const [t, tone] of l.segs) for (const ch of t) out.push([ch, tone ?? l.tone]);
  else for (const ch of l.text) out.push([ch, l.tone]);
  return out;
}

/** Tabs to the next multiple of eight, as a terminal does. */
const untab = (l: Line): Line => {
  if (!l.text.includes('\t')) return l;
  let col = 0;
  const fix = (t: string) =>
    t.replace(/[^\t]*\t/g, (m) => {
      const before = m.length - 1;
      const pad = 8 - ((col + before) % 8);
      col += before + pad;
      return m.slice(0, -1) + ' '.repeat(pad);
    });
  if (!l.segs) return { ...l, text: fix(l.text) };
  const s: Seg[] = l.segs.map(([t, tone]) => [fix(t), tone] as const);
  return { ...l, text: s.map((x) => x[0]).join(''), segs: s };
};

/** A line cut into rows of at most `cols` characters, keeping its tones. */
export function wrapLine(line: Line, cols: number): Line[] {
  const l = untab(line);
  const chars = [...l.text];
  if (chars.length <= cols) return [l];
  if (!l.segs) {
    const out: Line[] = [];
    for (let i = 0; i < chars.length; i += cols) out.push({ text: chars.slice(i, i + cols).join(''), tone: l.tone });
    return out;
  }
  const c = cells(l);
  const out: Line[] = [];
  for (let i = 0; i < c.length; i += cols) {
    const part = c.slice(i, i + cols);
    const s: Seg[] = [];
    for (const [ch, tone] of part) {
      const last = s[s.length - 1];
      if (last && last[1] === tone) s[s.length - 1] = [last[0] + ch, tone];
      else s.push([ch, tone]);
    }
    out.push({ text: part.map((p) => p[0]).join(''), segs: s });
  }
  return out;
}
