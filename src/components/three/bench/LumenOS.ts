import * as THREE from 'three';
import { sfx } from '@/audio/sfx';
import { site } from '@/content/site';
import { getLenis } from '@/lib/loop';
import { useApp } from '@/lib/store';
import { drawGlyph, inFont, isGlyph } from './glyphs';
import { musicCommand } from './music';
import { COMMANDS } from './term/cmd';
import { wrapLine } from './term/layout';
import { Shell } from './term/shell';
import { ln, type Gfx, type Host, type Io, type Key, type Line, type Program, type Seg, type Tone } from './term/types';

const COLOR: Record<Tone, string> = { out: '#ffb54c', dim: '#9c6a2c', hi: '#ffe2b0', ok: '#f2cf62', err: '#ff7a4a', inv: '#ffb54c' };
const BG = '#150d06';
/** lines kept in the scrollback */
const SCROLLBACK = 800;
/** programs that animate redraw the tube at most this often (a key press redraws at once) */
const FRAME = 1 / 30;

const greeting = (): Line[] => [ln('hello, traveller. this machine really works.'), ln('type help, or scroll to enter the works.', 'dim')];

type Layout = { u: number; m: number; x0: number; top: number; bottom: number; fs: number; cw: number; lh: number; cols: number; rows: number };

/**
 * RYHOX OS: the terminal on the Lumen 64's tube, drawn into a canvas only when something changed
 * and uploaded as a texture. It fills the machine's whole glass: the wordmark is the top of the
 * scrollback, and what is typed pushes it up and away, as a real terminal would. The shell behind
 * it is in ./term.
 */
export class LumenOS {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  w = 1280;
  h = 798;
  /** the line being typed, and the cursor in it */
  input = '';
  cursor = 0;
  /** Scripted text the dive types on its own, 0..1 of `script`. */
  scripted = 0;
  script = 'run works';
  mode: 'home' | 'farewell' = 'home';
  readonly shell: Shell;

  private lines: Line[] = greeting();
  /** the wordmark at the top of the scrollback; `clear` takes it away, `reset` brings it back */
  private banner = true;
  private program: Program | null = null;
  private handed: Program[] = [];
  private recall = -1;
  private draft = '';
  /** rows scrolled back through the scrollback */
  private back = 0;
  private wrapped: { cols: number; n: number; rows: Line[] } = { cols: 0, n: 0, rows: [] };
  private bannerCanvas: HTMLCanvasElement | null = null;
  private bannerKey = '';
  private L: Layout = { u: 12.8, m: 59, x0: 59, top: 120, bottom: 670, fs: 43, cw: 17, lh: 47, cols: 64, rows: 11 };
  private dirty = true;
  private urgent = true;
  private cursorOn = true;
  private lastBlink = 0;
  private lastMinute = -1;
  private lastTime = -1;
  private lastDraw = -1;
  private fonts = { crt: 'monospace', display: 'serif' };
  private fontsReady = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    const css = getComputedStyle(document.documentElement);
    const crt = css.getPropertyValue('--font-vt').trim();
    const display = css.getPropertyValue('--font-shoulders').trim();
    if (crt) this.fonts.crt = crt;
    if (display) this.fonts.display = display;
    this.setAspect(1.6);
    document.fonts?.ready.then(() => {
      this.fontsReady = true;
      this.measure();
      this.touch();
    });

    const io: Io = {
      print: (...l) => this.push(...l),
      cols: () => this.L.cols,
      rows: () => this.L.rows,
      clear: () => this.clearScreen(),
      reset: () => this.reset(),
      spawn: (p) => this.handed.push(p),
    };
    const host: Host = {
      sound: (on) => {
        const st = useApp.getState();
        const next = on ?? !st.sound;
        st.setSound(next);
        return next;
      },
      music: musicCommand,
      enter: () => {
        const target = document.getElementById('about');
        if (target) getLenis()?.scrollTo(target, { duration: 2.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
      },
      open: (url) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      },
      blip: (kind) => sfx.blip(kind),
      store: {
        get: (k) => {
          try {
            return localStorage.getItem(k);
          } catch {
            return null;
          }
        },
        set: (k, v) => {
          try {
            localStorage.setItem(k, v);
          } catch {}
        },
      },
    };
    this.shell = new Shell(COMMANDS, host, io);
  }

  /** Something runs (a game, the editor, ping): the terminal has the keyboard. */
  get busy() {
    return !!this.program;
  }

  /** The canvas takes the shape of the machine's glass. */
  setAspect(aspect: number) {
    const w = aspect >= 1 ? 1280 : Math.round(1100 * aspect);
    const h = aspect >= 1 ? Math.round(1280 / aspect) : 1100;
    if (w === this.w && h === this.h && this.canvas.width === w) return;
    this.w = this.canvas.width = w;
    this.h = this.canvas.height = h;
    this.texture.dispose();
    this.measure();
    this.touch();
  }

  setScripted(v: number) {
    const q = Math.round(v * this.script.length);
    if (q !== Math.round(this.scripted * this.script.length)) this.touch();
    this.scripted = v;
  }
  setMode(m: LumenOS['mode']) {
    if (m !== this.mode) {
      this.mode = m;
      this.touch();
    }
  }

  // ── input ─────────────────────────────────────────────────────────────────────────────────

  /**
   * A key, from the keyboard or a cap clicked on the machine. True when the terminal took it
   * (the caller then keeps it from the page).
   */
  key(k: Key): boolean {
    const c = k.ctrl ? k.key.toLowerCase() : '';
    // the browser keeps its own shortcuts
    if (k.ctrl && !'clsxokuwaed'.includes(c)) return false;
    this.cursorOn = true;
    this.touch();
    const p = this.program;
    if (p) {
      if (p.mode === 'inline' && p.input) {
        if (c === 'c') {
          this.push(this.echo(p.prompt ?? '', p.secret ? '' : this.input, '^C'));
          this.clearInput();
          this.stop(true);
          return true;
        }
        if (c === 'd' && !this.input) {
          this.stop(false);
          return true;
        }
        if (k.key === 'Enter') {
          const t = this.input;
          this.clearInput();
          p.input(t);
          this.settle();
          return true;
        }
        if (this.edit(k)) return true;
        return p.key?.(k) ?? !k.ctrl;
      }
      if (p.key?.(k)) {
        this.settle();
        return true;
      }
      if (c === 'c') {
        if (p.mode === 'inline') this.push(ln('^C', 'dim'));
        this.stop(true);
        return true;
      }
      return !k.ctrl;
    }

    // the prompt
    if (c === 'c') {
      this.push(this.echo(null, this.input, '^C'));
      this.clearInput();
      return true;
    }
    if (c === 'l') {
      this.clearScreen();
      return true;
    }
    if (c === 'd') return true;
    switch (k.key) {
      case 'Enter':
        this.submit();
        return true;
      case 'Tab':
        this.complete();
        return true;
      case 'ArrowUp':
        this.history(-1);
        return true;
      case 'ArrowDown':
        this.history(1);
        return true;
      case 'PageUp':
        this.back += this.L.rows - 1;
        return true;
      case 'PageDown':
        this.back = Math.max(0, this.back - (this.L.rows - 1));
        return true;
      case 'Escape':
        return true;
    }
    return this.edit(k);
  }

  /** A key let go: only games that move while a key is held care. */
  keyup(k: Key) {
    this.program?.release?.(k);
  }

  /** Typing on the line: characters, deleting, moving the cursor. */
  private edit(k: Key): boolean {
    const c = k.ctrl ? k.key.toLowerCase() : '';
    const before = this.input;
    if (c === 'a' || k.key === 'Home') this.cursor = 0;
    else if (c === 'e' || k.key === 'End') this.cursor = this.input.length;
    else if (c === 'u') {
      this.input = this.input.slice(this.cursor);
      this.cursor = 0;
    } else if (c === 'k') this.input = this.input.slice(0, this.cursor);
    else if (c === 'w') {
      const cut = this.input.slice(0, this.cursor).replace(/\S+\s*$/, '');
      this.input = cut + this.input.slice(this.cursor);
      this.cursor = cut.length;
    } else if (k.key === 'Backspace') {
      if (this.cursor > 0) {
        this.input = this.input.slice(0, this.cursor - 1) + this.input.slice(this.cursor);
        this.cursor--;
      }
    } else if (k.key === 'Delete') this.input = this.input.slice(0, this.cursor) + this.input.slice(this.cursor + 1);
    else if (k.key === 'ArrowLeft') this.cursor = Math.max(0, this.cursor - 1);
    else if (k.key === 'ArrowRight') this.cursor = Math.min(this.input.length, this.cursor + 1);
    else if (k.key.length === 1 && !k.ctrl) {
      if (this.input.length >= 400) return true;
      this.input = this.input.slice(0, this.cursor) + k.key + this.input.slice(this.cursor);
      this.cursor++;
    } else return false;
    if (this.input !== before) this.recall = -1;
    this.back = 0;
    return true;
  }

  private clearInput() {
    this.input = '';
    this.cursor = 0;
    this.recall = -1;
  }

  private history(dir: number) {
    const h = this.shell.history;
    if (!h.length) return;
    if (this.recall < 0) {
      if (dir > 0) return;
      this.draft = this.input;
      this.recall = h.length;
    }
    this.recall = Math.max(0, Math.min(h.length, this.recall + dir));
    this.input = this.recall >= h.length ? this.draft : h[this.recall];
    if (this.recall >= h.length) this.recall = -1;
    this.cursor = this.input.length;
    this.back = 0;
  }

  private complete() {
    const head = this.input.slice(0, this.cursor);
    const r = this.shell.complete(head);
    if (r.next !== r.word) {
      const start = head.slice(0, head.length - r.word.length);
      this.input = start + r.next + this.input.slice(this.cursor);
      this.cursor = start.length + r.next.length;
    } else if (r.options.length) {
      // as bash does on the second tab: the choices under the line, and the line again
      this.push(this.echo(null, this.input));
      const width = Math.max(...r.options.map((o) => o.length)) + 2;
      const per = Math.max(1, Math.floor(this.L.cols / width));
      for (let i = 0; i < r.options.length; i += per)
        this.push(ln(r.options.slice(i, i + per).map((o) => o.padEnd(width)).join('').trimEnd(), 'dim'));
    } else sfx.blip('bell');
  }

  /** Enter at the prompt: the line goes to the shell. */
  submit() {
    const line = this.input;
    this.push(this.echo(null, line));
    this.clearInput();
    this.back = 0;
    if (!line.trim()) return;
    const r = this.shell.run(line);
    this.push(...r.lines);
    if (r.program) this.start(r.program);
  }

  // ── programs ──────────────────────────────────────────────────────────────────────────────

  private start(p: Program) {
    this.program = p;
    this.back = 0;
    this.clearInput();
    this.touch();
    if (p.done) this.stop(false);
  }

  /** After a program's key or line: if it has ended, the terminal is back. */
  private settle() {
    if (this.program?.done) this.stop(false);
  }

  private stop(interrupted: boolean) {
    const p = this.program;
    if (!p) return;
    this.program = null;
    const out = p.exit?.(interrupted);
    if (out) this.push(...out);
    this.touch();
    // what it handed the terminal to (sudo does), else the rest of the line it came from
    const next = this.handed.shift();
    if (next) return this.start(next);
    if (interrupted) {
      this.shell.abandon();
      return;
    }
    const r = this.shell.resume(0);
    this.push(...r.lines);
    if (r.program) this.start(r.program);
  }

  // ── the scrollback ────────────────────────────────────────────────────────────────────────

  push(...l: Line[]) {
    for (const x of l) {
      if (!x.segs && x.text.includes('\n')) for (const t of x.text.split('\n')) this.lines.push({ text: t, tone: x.tone });
      else this.lines.push(x);
    }
    if (this.lines.length > SCROLLBACK) {
      this.lines.splice(0, this.lines.length - SCROLLBACK);
      this.wrapped.cols = 0;
    }
    this.touch();
  }

  clearScreen() {
    this.lines = [];
    this.banner = false;
    this.back = 0;
    this.wrapped.cols = 0;
    this.touch();
  }

  reset() {
    this.lines = greeting();
    this.banner = true;
    this.back = 0;
    this.wrapped.cols = 0;
    this.clearInput();
    this.touch();
  }

  /** The prompt and what was typed at it, as the scrollback keeps it. */
  private echo(prompt: string | null, text: string, tail = ''): Line {
    const s: Seg[] = prompt === null ? this.shell.promptSegs() : [[prompt, 'out']];
    return { text: s.map((x) => x[0]).join('') + text + tail, segs: [...s, [text], ...(tail ? [[tail, 'dim'] as Seg] : [])] };
  }

  private rowsAt(cols: number) {
    const w = this.wrapped;
    if (w.cols !== cols || w.n > this.lines.length) {
      w.cols = cols;
      w.n = 0;
      w.rows = [];
    }
    for (; w.n < this.lines.length; w.n++) w.rows.push(...wrapLine(this.lines[w.n], cols));
    return w.rows;
  }

  private touch() {
    this.dirty = true;
    this.urgent = true;
  }

  // ── drawing ───────────────────────────────────────────────────────────────────────────────

  /** Redraw if needed. Returns true when the texture changed. */
  update(time: number) {
    const dt = this.lastTime < 0 ? 0 : Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    const p = this.program;
    if (p) {
      if (p.tick?.(time, dt)) this.dirty = true;
      if (p.done) this.stop(false);
    }
    if (time - this.lastBlink > 0.53) {
      this.lastBlink = time;
      this.cursorOn = !this.cursorOn;
      this.dirty = true;
    }
    const minute = new Date().getMinutes();
    if (minute !== this.lastMinute) {
      this.lastMinute = minute;
      this.dirty = true;
    }
    if (!this.dirty || (!this.urgent && time - this.lastDraw < FRAME)) return false;
    this.dirty = false;
    this.urgent = false;
    this.lastDraw = time;
    this.draw();
    this.texture.needsUpdate = true;
    return true;
  }

  private measure() {
    const { ctx, w, h } = this;
    const u = Math.min(w, h * 1.6) / 100;
    const m = u * 4.6;
    const top = m + u * 3.4 + u * 1.2;
    const bottom = h - m - u * 4.2 - u * 0.8;
    const fs = u * 3.25;
    ctx.font = `${fs}px ${this.fonts.crt}`;
    const cw = ctx.measureText('M').width || fs * 0.4;
    const lh = Math.round(fs * 1.1);
    const cols = Math.max(20, Math.floor((w - m * 2) / cw));
    const rows = Math.max(4, Math.floor((bottom - top) / lh));
    // the rows are spread so the last one sits on the bottom edge
    this.L = { u, m, x0: m, top: bottom - rows * lh, bottom, fs, cw, lh, cols, rows };
  }

  private draw() {
    const { ctx, w, h, L } = this;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
    g.addColorStop(0, 'rgba(255,170,80,0.07)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.textBaseline = 'alphabetic';
    const { u, m } = L;

    // header
    ctx.font = `${u * 3.3}px ${this.fonts.crt}`;
    ctx.fillStyle = COLOR.out;
    ctx.fillText(this.shell.root ? 'RYHOX OS 3.14 · ROOT' : 'RYHOX OS 3.14', m, m + u * 2);
    ctx.textAlign = 'right';
    const clock = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    ctx.fillText(`LUMEN 64 SPARK  ${clock}`, w - m, m + u * 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR.dim;
    ctx.fillRect(m, m + u * 3.4, w - m * 2, Math.max(1, u * 0.28));

    if (this.mode === 'farewell') {
      this.drawWordmark(ctx, m - u * 0.4, h * 0.52, u * 17);
      ctx.font = `${u * 4}px ${this.fonts.crt}`;
      ctx.fillStyle = COLOR.out;
      ctx.fillText('THANK YOU FOR VISITING THE WORKS.', m, h * 0.52 + u * 9);
      ctx.fillStyle = COLOR.dim;
      ctx.fillText(`WRITE: ${site.email.toUpperCase()}`, m, h * 0.52 + u * 14);
      this.drawFooter('END OF TAPE · SCROLL UP TO REWIND');
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(m - u, L.top - u * 0.6, w - m * 2 + u * 2, L.bottom - L.top + u * 1.2);
    ctx.clip();
    const p = this.program;
    if (p && p.mode === 'screen') this.drawProgram(p);
    else this.drawTerminal();
    ctx.restore();

    const hint = p?.hint ?? (this.back > 0 ? 'SCROLLED BACK · PAGE DOWN RETURNS' : 'TYPE HELP · SCROLL TO ENTER');
    this.drawFooter(hint.toUpperCase());
  }

  private drawFooter(text: string) {
    const { ctx, w, h, L } = this;
    const { u, m } = L;
    ctx.fillStyle = COLOR.dim;
    ctx.fillRect(m, h - m - u * 4.2, w - m * 2, Math.max(1, u * 0.28));
    const fs = u * 3;
    ctx.font = `${fs}px ${this.fonts.crt}`;
    const cw = ctx.measureText('M').width;
    const top = h - m - fs * 0.8;
    const right = 'MEM 64K ▮▮▮▯';
    const room = Math.floor((w - m * 2) / cw) - right.length - 2;
    this.run(m, top, text.length > room ? text.slice(0, room - 1) + '…' : text, 'dim', cw, fs, fs);
    this.run(w - m - right.length * cw, top, right, 'dim', cw, fs, fs);
  }

  /** The scrollback, the banner above it, and the prompt under it. */
  private drawTerminal() {
    const L = this.L;
    const rows = this.rowsAt(L.cols);
    const prompt = this.promptRows();
    const bannerRows = this.banner ? this.bannerRows() : 0;
    const content = rows.length + prompt.rows.length;
    const total = bannerRows + content;
    this.back = Math.max(0, Math.min(this.back, total - L.rows));
    let bannerAt = 0;
    let start = 0;
    if (total <= L.rows) {
      // everything fits: the wordmark at the top, the lines settled at the bottom (or, with
      // the screen cleared, running down from the top as a terminal does)
      start = this.banner ? L.rows - content : 0;
    } else {
      bannerAt = L.rows - total + this.back;
      start = bannerAt + bannerRows;
    }
    if (this.banner && bannerAt + bannerRows > 0) this.drawBanner(L.top + bannerAt * L.lh);
    rows.forEach((l, i) => {
      const r = start + i;
      if (r >= 0 && r < L.rows) this.line(L.x0, L.top + r * L.lh, l);
    });
    const pr = start + rows.length;
    prompt.rows.forEach((l, i) => {
      const r = pr + i;
      if (r >= 0 && r < L.rows) this.line(L.x0, L.top + r * L.lh, l);
    });
    const cr = pr + prompt.cy;
    const scripting = this.scripted > 0;
    if (prompt.cursor && cr >= 0 && cr < L.rows && (this.cursorOn || scripting)) {
      const x = L.x0 + prompt.cx * L.cw;
      const y = L.top + cr * L.lh;
      this.ctx.fillStyle = COLOR.out;
      this.ctx.fillRect(x, y + L.lh * 0.08, L.cw, L.lh * 0.84);
      if (prompt.under && prompt.under !== ' ') this.run(x, y, prompt.under, undefined, L.cw, L.lh, L.fs, BG);
    }
  }

  /** The prompt line (it may wrap onto more rows), and where the cursor is on it. */
  private promptRows(): { rows: Line[]; cx: number; cy: number; cursor: boolean; under: string } {
    const cols = this.L.cols;
    const p = this.program;
    // a program runs without a prompt: the cursor waits on an empty line
    if (p && !p.input) return { rows: [ln('')], cx: 0, cy: 0, cursor: true, under: '' };
    const scripting = this.scripted > 0 && !p;
    const text = scripting ? this.script.slice(0, Math.round(this.scripted * this.script.length)) : p?.secret ? '' : this.input;
    const segs: Seg[] = p ? [[p.prompt ?? '', 'out']] : this.shell.promptSegs();
    const promptLen = segs.reduce((n, s) => n + s[0].length, 0);
    const line: Line = { text: segs.map((s) => s[0]).join('') + text, segs: [...segs, [text, 'hi']] };
    const rows = wrapLine(line, cols);
    const at = promptLen + (scripting || p?.secret ? text.length : this.cursor);
    const cy = Math.floor(at / cols);
    if (cy >= rows.length) rows.push(ln(''));
    return { rows, cx: at % cols, cy, cursor: true, under: scripting || p?.secret ? '' : (this.input[this.cursor] ?? '') };
  }

  /** A full-screen program, on its own grid (its text may be smaller than the terminal's). */
  private drawProgram(p: Program) {
    const { ctx, L } = this;
    const s = p.scale ?? 1;
    const fs = L.fs * s;
    const cw = L.cw * s;
    const lh = L.lh * s;
    const W = this.w - L.m * 2;
    const H = L.bottom - L.top;
    const cols = Math.floor(W / cw);
    const rows = Math.floor(H / lh);
    const x0 = L.x0;
    const y0 = L.bottom - rows * lh;
    const gfx: Gfx = {
      W,
      H: rows * lh,
      cw,
      ch: lh,
      cols,
      rows,
      blink: this.cursorOn,
      text: (col, row, str, tone) => this.run(x0 + col * cw, y0 + row * lh, str, tone, cw, lh, fs),
      center: (row, str, tone) => this.run(x0 + Math.max(0, Math.floor((cols - [...str].length) / 2)) * cw, y0 + row * lh, str, tone, cw, lh, fs),
      line: (col, row, l) => this.line(x0 + col * cw, y0 + row * lh, l, cw, lh, fs),
      invert: (col, row, str, tone = 'out') => {
        const n = [...str].length;
        ctx.fillStyle = COLOR[tone];
        ctx.fillRect(x0 + col * cw, y0 + row * lh + lh * 0.06, n * cw, lh * 0.88);
        this.run(x0 + col * cw, y0 + row * lh, str, undefined, cw, lh, fs, BG);
      },
      textPx: (x, y, str, tone, scale = 1) => this.run(x0 + x, y0 + y, str, tone, cw * scale, lh * scale, fs * scale),
      rect: (x, y, rw, rh, tone = 'out', alpha = 1) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = COLOR[tone];
        ctx.fillRect(x0 + x, y0 + y, rw, rh);
        ctx.globalAlpha = 1;
      },
      frame: (x, y, fw, fh, tone = 'out', width = 1.5) => {
        ctx.strokeStyle = COLOR[tone];
        ctx.lineWidth = width;
        ctx.strokeRect(x0 + x, y0 + y, fw, fh);
      },
    };
    p.draw?.(gfx);
    ctx.globalAlpha = 1;
  }

  /** A line of output at (x, top of its row). */
  private line(x: number, top: number, l: Line, cw = this.L.cw, lh = this.L.lh, fs = this.L.fs) {
    if (!l.segs) {
      this.run(x, top, l.text, l.tone, cw, lh, fs);
      return;
    }
    let col = 0;
    for (const [t, tone] of l.segs) {
      this.run(x + col * cw, top, t, tone ?? l.tone, cw, lh, fs);
      col += [...t].length;
    }
  }

  /**
   * Text on the cell grid: runs of ordinary letters in one fillText each, the characters the
   * typeface lacks drawn by hand (or centred in their cell), so every column stays in line.
   */
  private run(x: number, top: number, text: string, tone: Tone | undefined, cw: number, lh: number, fs: number, color?: string) {
    if (!text) return;
    const { ctx } = this;
    const chars = [...text];
    if (tone === 'inv' && !color) {
      ctx.fillStyle = COLOR.out;
      ctx.fillRect(x, top + lh * 0.06, chars.length * cw, lh * 0.88);
      color = BG;
    }
    ctx.font = `${fs}px ${this.fonts.crt}`;
    ctx.fillStyle = color ?? COLOR[tone ?? 'out'];
    const base = top + lh * 0.5 + fs * 0.3;
    let runText = '';
    let runX = x;
    const flush = () => {
      if (runText.trim()) ctx.fillText(runText, runX, base);
      runText = '';
    };
    chars.forEach((ch, i) => {
      const cx = x + i * cw;
      if (isGlyph(ch)) {
        flush();
        drawGlyph(ctx, ch, cx, top, cw, lh);
      } else if (!inFont(ch)) {
        flush();
        const mw = ctx.measureText(ch).width;
        const sc = mw > cw * 1.05 ? (cw * 1.05) / mw : 1;
        ctx.save();
        ctx.translate(cx + (cw - mw * sc) / 2, base);
        ctx.scale(sc, 1);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
      } else {
        if (!runText) runX = cx;
        runText += ch;
      }
    });
    flush();
  }

  // ── the banner ────────────────────────────────────────────────────────────────────────────

  private wordmarkSize() {
    const { u } = this.L;
    return u * (this.h / this.w > 0.75 ? 14 : 17);
  }

  private bannerRows() {
    const { u, lh } = this.L;
    return Math.ceil((this.wordmarkSize() * 0.86 + u * 7.4) / lh);
  }

  /** The wordmark and the line under it, drawn once into their own canvas and stamped. */
  private drawBanner(y: number) {
    const { L } = this;
    const { u } = L;
    const width = this.w - L.m * 2 + u * 2;
    const height = this.bannerRows() * L.lh;
    const key = `${width}x${height}:${this.fontsReady}`;
    if (!this.bannerCanvas || this.bannerKey !== key) {
      const c = this.bannerCanvas ?? document.createElement('canvas');
      c.width = Math.ceil(width);
      c.height = Math.ceil(height);
      const g = c.getContext('2d')!;
      g.clearRect(0, 0, c.width, c.height);
      const size = this.wordmarkSize();
      const base = u * 0.6 + size * 0.86;
      this.drawWordmark(g, u * 0.6, base, size);
      g.font = `${u * 3.2}px ${this.fonts.crt}`;
      g.fillStyle = COLOR.dim;
      g.textBaseline = 'alphabetic';
      g.fillText('WEB DEVELOPER · THREE.JS ENGINEER', u, base + u * 5.2);
      this.bannerCanvas = c;
      this.bannerKey = key;
    }
    this.ctx.drawImage(this.bannerCanvas, L.x0 - u, y);
  }

  /** The wordmark as the tube draws it: heavy industrial capitals cut into bands. */
  private drawWordmark(g: CanvasRenderingContext2D, x: number, baseline: number, size: number) {
    g.save();
    g.textBaseline = 'alphabetic';
    const width = g.canvas.width;
    if (g !== this.ctx) {
      g.font = `900 ${size}px ${this.fonts.display}`;
      g.fillStyle = COLOR.out;
      g.fillText('RYHOX', x, baseline);
      g.globalCompositeOperation = 'destination-out';
      const pitch = Math.max(3, size * 0.078);
      for (let y = baseline - size * 0.82; y < baseline + size * 0.28; y += pitch) g.fillRect(0, y + pitch * 0.62, width, pitch * 0.38);
      g.restore();
      return;
    }
    // straight onto the tube (the farewell): the bands are cut, then the dark put back behind
    g.font = `900 ${size}px ${this.fonts.display}`;
    g.fillStyle = COLOR.out;
    g.fillText('RYHOX', x, baseline);
    g.globalCompositeOperation = 'destination-out';
    const pitch = Math.max(3, size * 0.078);
    for (let y = baseline - size * 0.82; y < baseline + size * 0.28; y += pitch) g.fillRect(x, y + pitch * 0.62, width, pitch * 0.38);
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = BG;
    g.fillRect(0, 0, width, this.h);
    g.restore();
  }
}
