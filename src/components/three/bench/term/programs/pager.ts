import { wrapLine } from '../layout';
import type { Gfx, Key, Line, Program } from '../types';

/** less: the text a screen at a time. Arrows, j/k, space, b, g/G; q quits. */
export function pager(text: Line[], name: string): Program {
  let top = 0;
  let page = 10;
  let rows: Line[] = [];
  let cols = 0;
  const max = () => Math.max(0, rows.length - page);
  const p: Program = {
    mode: 'screen',
    done: false,
    hint: `${name} · arrows scroll · q quits`,
    key(k: Key) {
      switch (k.key) {
        case 'ArrowDown':
        case 'j':
        case 'Enter':
          top++;
          break;
        case 'ArrowUp':
        case 'k':
          top--;
          break;
        case ' ':
        case 'PageDown':
        case 'f':
          top += page - 1;
          break;
        case 'PageUp':
        case 'b':
          top -= page - 1;
          break;
        case 'g':
        case 'Home':
          top = 0;
          break;
        case 'G':
        case 'End':
          top = max();
          break;
        case 'q':
        case 'Q':
        case 'Escape':
          p.done = true;
          return true;
        default:
          return !k.ctrl;
      }
      top = Math.max(0, Math.min(max(), top));
      return true;
    },
    draw(g: Gfx) {
      if (g.cols !== cols) {
        cols = g.cols;
        rows = text.flatMap((l) => wrapLine(l, cols));
      }
      page = g.rows - 1;
      top = Math.max(0, Math.min(max(), top));
      for (let i = 0; i < page; i++) {
        const l = rows[top + i];
        if (l) g.line(0, i, l);
        else g.text(0, i, '~', 'dim');
      }
      const end = top >= max();
      const pct = rows.length ? Math.round(((top + page) / rows.length) * 100) : 100;
      g.invert(0, g.rows - 1, end ? ' (END) ' : ` ${name} ${Math.min(100, pct)}% `, 'out');
    },
  };
  return p;
}
