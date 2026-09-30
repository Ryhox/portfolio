import type { Gfx, Key, Program, Tone } from '../types';

type Save = (name: string, text: string) => string | null;

/**
 * A text editor for the filesystem, in two flavours: nano (^S saves, ^X quits) and vi (modal:
 * i to type, Esc, then :w, :q, :wq, :q!). Enough of each to write a script and run it.
 */
export function editor(flavour: 'nano' | 'vi', fileName: string, text: string, save: Save): Program {
  let name = fileName;
  const buf = text.replace(/\n$/, '').split('\n');
  let r = 0;
  let c = 0;
  let top = 0;
  let view = 8;
  let dirty = false;
  let msg = name ? (text ? `read ${buf.length} line${buf.length === 1 ? '' : 's'}` : 'new file') : '';
  let msgTone: Tone = 'dim';
  let clip: string[] = [];
  // nano's questions, vi's modes
  let ask: null | 'save?' | 'name' = null;
  let answer = '';
  let exitAfterSave = false;
  let mode: 'normal' | 'insert' | 'cmd' = 'normal';
  let cmd = '';
  let pending = '';

  const say = (s: string, tone: Tone = 'dim') => {
    msg = s;
    msgTone = tone;
  };
  const clampCursor = () => {
    r = Math.max(0, Math.min(buf.length - 1, r));
    const max = buf[r].length - (flavour === 'vi' && mode === 'normal' && buf[r].length ? 1 : 0);
    c = Math.max(0, Math.min(max, c));
  };
  const write = (as = name) => {
    if (!as) return 'no file name';
    const e = save(as, buf.join('\n') + '\n');
    if (e) {
      say(flavour === 'vi' ? `E212: Can't open file for writing: ${e}` : `[ Error writing ${as}: ${e} ]`, 'err');
      return e;
    }
    name = as;
    dirty = false;
    const bytes = buf.join('\n').length + 1;
    say(flavour === 'vi' ? `"${as}" ${buf.length}L, ${bytes}B written` : `[ Wrote ${buf.length} line${buf.length === 1 ? '' : 's'} ]`, 'ok');
    return null;
  };
  const insert = (s: string) => {
    buf[r] = buf[r].slice(0, c) + s + buf[r].slice(c);
    c += s.length;
    dirty = true;
  };
  const newline = () => {
    const rest = buf[r].slice(c);
    buf[r] = buf[r].slice(0, c);
    const indent = /^\s*/.exec(buf[r])![0];
    buf.splice(r + 1, 0, indent + rest);
    r++;
    c = indent.length;
    dirty = true;
  };
  const backspace = () => {
    if (c > 0) {
      buf[r] = buf[r].slice(0, c - 1) + buf[r].slice(c);
      c--;
    } else if (r > 0) {
      c = buf[r - 1].length;
      buf[r - 1] += buf[r];
      buf.splice(r, 1);
      r--;
    } else return;
    dirty = true;
  };
  const del = () => {
    if (c < buf[r].length) buf[r] = buf[r].slice(0, c) + buf[r].slice(c + 1);
    else if (r < buf.length - 1) {
      buf[r] += buf[r + 1];
      buf.splice(r + 1, 1);
    } else return;
    dirty = true;
  };
  const move = (k: string) => {
    if (k === 'ArrowLeft') c--;
    else if (k === 'ArrowRight') c++;
    else if (k === 'ArrowUp') r--;
    else if (k === 'ArrowDown') r++;
    else if (k === 'Home') c = 0;
    else if (k === 'End') c = buf[r].length;
    else if (k === 'PageUp') r -= view - 1;
    else if (k === 'PageDown') r += view - 1;
    else return false;
    return true;
  };

  const p: Program = {
    mode: 'screen',
    done: false,
    hint: flavour === 'nano' ? 'nano · ^S saves · ^X quits' : 'vi · i types · esc :wq saves and quits · :q! quits',
    key(k: Key) {
      if (flavour === 'nano') nanoKey(k);
      else viKey(k);
      clampCursor();
      return true;
    },
    draw(g: Gfx) {
      if (flavour === 'nano') drawNano(g);
      else drawVi(g);
    },
  };

  function nanoKey(k: Key) {
    if (ask === 'save?') {
      const y = k.key.toLowerCase();
      if (y === 'y') {
        ask = null;
        if (!name) {
          ask = 'name';
          exitAfterSave = true;
          answer = '';
        } else if (!write()) p.done = true;
      } else if (y === 'n') p.done = true;
      else if ((k.ctrl && y === 'c') || k.key === 'Escape') {
        ask = null;
        say('[ Cancelled ]');
      }
      return;
    }
    if (ask === 'name') {
      if (k.key === 'Enter') {
        ask = null;
        if (answer && !write(answer.trim()) && exitAfterSave) p.done = true;
      } else if (k.key === 'Backspace') answer = answer.slice(0, -1);
      else if ((k.ctrl && k.key.toLowerCase() === 'c') || k.key === 'Escape') {
        ask = null;
        say('[ Cancelled ]');
      } else if (k.key.length === 1 && !k.ctrl) answer += k.key;
      return;
    }
    if (k.ctrl) {
      const ch = k.key.toLowerCase();
      if (ch === 's' || ch === 'o') {
        if (name) write();
        else {
          ask = 'name';
          answer = '';
          exitAfterSave = false;
        }
      } else if (ch === 'x') {
        if (dirty) ask = 'save?';
        else p.done = true;
      } else if (ch === 'k') {
        clip = [buf[r]];
        if (buf.length > 1) buf.splice(r, 1);
        else buf[0] = '';
        dirty = true;
      } else if (ch === 'u') {
        buf.splice(r, 0, ...clip);
        dirty = dirty || clip.length > 0;
      } else if (ch === 'c') say(`[ line ${r + 1}/${buf.length}, col ${c + 1}/${buf[r].length + 1} ]`);
      return;
    }
    if (move(k.key)) return;
    if (k.key === 'Enter') newline();
    else if (k.key === 'Backspace') backspace();
    else if (k.key === 'Delete') del();
    else if (k.key === 'Tab') insert('  ');
    else if (k.key === 'Escape') {
      if (!dirty) p.done = true;
      else say('^X to leave (it will ask to save)');
    } else if (k.key.length === 1) insert(k.key);
  }

  function viKey(k: Key) {
    if (k.ctrl && k.key.toLowerCase() === 'c') {
      mode = 'normal';
      cmd = '';
      say('Type  :qa!  and press <Enter> to abandon all changes and exit Vim');
      return;
    }
    if (mode === 'cmd') {
      if (k.key === 'Enter') runCmd(cmd.trim());
      else if (k.key === 'Escape') mode = 'normal';
      else if (k.key === 'Backspace') {
        if (!cmd) mode = 'normal';
        cmd = cmd.slice(0, -1);
      } else if (k.key.length === 1) cmd += k.key;
      if (mode !== 'cmd') cmd = '';
      return;
    }
    if (mode === 'insert') {
      if (k.key === 'Escape') {
        mode = 'normal';
        c--;
        say('');
      } else if (move(k.key)) return;
      else if (k.key === 'Enter') newline();
      else if (k.key === 'Backspace') backspace();
      else if (k.key === 'Delete') del();
      else if (k.key === 'Tab') insert('  ');
      else if (k.key.length === 1) insert(k.key);
      return;
    }
    // normal
    const key = k.key;
    const was = pending;
    pending = '';
    if (move(key)) return;
    switch (key) {
      case 'h':
        c--;
        break;
      case 'l':
      case ' ':
        c++;
        break;
      case 'j':
      case 'Enter':
        r++;
        break;
      case 'k':
        r--;
        break;
      case '0':
        c = 0;
        break;
      case '$':
        c = buf[r].length;
        break;
      case 'w': {
        const m = /\s+\S|$/.exec(buf[r].slice(c + 1));
        c += 1 + (m ? m.index + (m[0].length ? m[0].length - 1 : 0) : 0);
        break;
      }
      case 'i':
        mode = 'insert';
        say('-- INSERT --', 'hi');
        break;
      case 'a':
        mode = 'insert';
        c++;
        say('-- INSERT --', 'hi');
        break;
      case 'A':
        mode = 'insert';
        c = buf[r].length;
        say('-- INSERT --', 'hi');
        break;
      case 'I':
        mode = 'insert';
        c = 0;
        say('-- INSERT --', 'hi');
        break;
      case 'o':
      case 'O':
        buf.splice(key === 'o' ? r + 1 : r, 0, '');
        if (key === 'o') r++;
        c = 0;
        mode = 'insert';
        dirty = true;
        say('-- INSERT --', 'hi');
        break;
      case 'x':
        if (buf[r].length) {
          buf[r] = buf[r].slice(0, c) + buf[r].slice(c + 1);
          dirty = true;
        }
        break;
      case 'd':
        if (was === 'd') {
          clip = [buf[r]];
          if (buf.length > 1) buf.splice(r, 1);
          else buf[0] = '';
          dirty = true;
        } else pending = 'd';
        break;
      case 'y':
        if (was === 'y') {
          clip = [buf[r]];
          say('1 line yanked');
        } else pending = 'y';
        break;
      case 'p':
        if (clip.length) {
          buf.splice(r + 1, 0, ...clip);
          r++;
          dirty = true;
        }
        break;
      case 'g':
        if (was === 'g') r = 0;
        else pending = 'g';
        break;
      case 'G':
        r = buf.length - 1;
        break;
      case 'Z':
        if (was === 'Z') {
          if (!dirty || !write()) p.done = true;
        } else pending = 'Z';
        break;
      case 'u':
        say('undo went missing in the escapement. :q! starts over.');
        break;
      case ':':
        mode = 'cmd';
        cmd = '';
        say('');
        break;
    }
  }

  function runCmd(s: string) {
    mode = 'normal';
    const [head, ...rest] = s.split(/\s+/);
    const arg = rest.join(' ');
    if (/^\d+$/.test(head)) {
      r = parseInt(head, 10) - 1;
      return;
    }
    switch (head) {
      case 'w':
        write(arg || name);
        break;
      case 'wq':
      case 'x':
      case 'wq!':
        if (!write(arg || name)) p.done = true;
        break;
      case 'q':
      case 'qa':
        if (dirty) say('E37: No write since last change (add ! to override)', 'err');
        else p.done = true;
        break;
      case 'q!':
      case 'qa!':
      case 'cq':
        p.done = true;
        break;
      case '':
        break;
      case 'help':
      case 'h':
        say('i types, esc stops, :w saves, :q quits, :q! gives up');
        break;
      default:
        say(`E492: Not an editor command: ${s}`, 'err');
    }
  }

  function scrollTo(rows: number) {
    view = rows;
    if (r < top) top = r;
    if (r >= top + rows) top = r - rows + 1;
    top = Math.max(0, top);
  }

  function drawText(g: Gfx, y0: number, rows: number, tilde: boolean) {
    scrollTo(rows);
    const left = Math.max(0, c - g.cols + 2);
    for (let i = 0; i < rows; i++) {
      const line = buf[top + i];
      if (line === undefined) {
        if (tilde) g.text(0, y0 + i, '~', 'dim');
        continue;
      }
      g.text(0, y0 + i, line.slice(left, left + g.cols));
    }
    // the cursor
    const cx = c - left;
    const cy = y0 + r - top;
    const under = buf[r][c] ?? ' ';
    if (flavour === 'vi' && mode === 'insert') g.rect(cx * g.cw, cy * g.ch + g.ch * 0.08, Math.max(2, g.cw * 0.18), g.ch * 0.84, 'hi');
    else if (g.blink || mode !== 'insert') {
      g.rect(cx * g.cw, cy * g.ch + g.ch * 0.08, g.cw, g.ch * 0.84, 'out');
      g.invert(cx, cy, under === ' ' ? '' : under, 'out');
    }
  }

  function drawNano(g: Gfx) {
    const title = name || 'New Buffer';
    const bar = ` nano 3.14`.padEnd(Math.max(0, Math.floor((g.cols - title.length) / 2))) + title;
    g.invert(0, 0, (bar + ' '.repeat(g.cols)).slice(0, g.cols - (dirty ? 9 : 0)) + (dirty ? 'Modified ' : ''), 'out');
    drawText(g, 1, g.rows - 3, false);
    const status = g.rows - 2;
    if (ask === 'save?') g.invert(0, status, 'Save modified buffer?  Y Yes  N No  ^C Cancel'.slice(0, g.cols), 'hi');
    else if (ask === 'name') g.invert(0, status, `File Name to Write: ${answer}_`.slice(-g.cols), 'hi');
    else if (msg) g.center(status, msg, msgTone);
    const keys: [string, string][] = [
      ['^S', 'Save'],
      ['^X', 'Exit'],
      ['^K', 'Cut'],
      ['^U', 'Paste'],
      ['^C', 'Where'],
    ];
    let x = 0;
    for (const [k, label] of keys) {
      if (x + k.length + label.length + 1 > g.cols) break;
      g.invert(x, g.rows - 1, k, 'out');
      g.text(x + k.length + 1, g.rows - 1, label, 'dim');
      x += k.length + label.length + 3;
    }
  }

  function drawVi(g: Gfx) {
    drawText(g, 0, g.rows - 1, true);
    const last = g.rows - 1;
    if (mode === 'cmd') g.text(0, last, `:${cmd}${g.blink ? '█' : ' '}`);
    else if (msg) g.text(0, last, msg.slice(0, g.cols - 12), msgTone);
    else if (!name && !dirty && buf.length === 1 && !buf[0]) g.text(0, last, 'i to type, :q to quit', 'dim');
    const pos = `${r + 1},${c + 1}`;
    g.text(g.cols - pos.length - 1, last, pos, 'dim');
  }

  return p;
}
