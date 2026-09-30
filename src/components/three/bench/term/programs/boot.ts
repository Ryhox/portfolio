import type { Shell } from '../shell';
import type { Gfx, Io, Key, Program, Tone } from '../types';

const STOPS = ['kettle', 'resonance cabinet', 'film transport', 'escapement watchdog', 'lumen tube'];
const STARTS = [
  ['escapement', 'Started Escapement Regulator.'],
  ['brass', 'Mounted /dev/brass on /.'],
  ['tube', 'Started Lumen Tube Phosphor Service.'],
  ['kettle', 'Started Kettle (always on).'],
  ['cogs', 'Reached target 64 Cogs.'],
  ['resonance', 'Started Resonance Cabinet.'],
  ['tty', 'Started Getty on tty1.'],
  ['login', 'Reached target Multi-User System.'],
];

/**
 * reboot and shutdown, as root: the services stop one by one, the machine goes dark (shutdown
 * waits there for a key), then the boot messages run and the terminal is back as it was.
 */
export function boot(io: Io, sh: Shell, kind: 'reboot' | 'halt'): Program {
  const lines: [string, Tone?, string?][] = [];
  let phase: 'stopping' | 'dark' | 'booting' = 'stopping';
  let t0 = -1;
  let shown = 0;
  const stopping: [string, Tone?, string?][] = [
    ...STOPS.map((s) => ['Stopped ' + s + '.', undefined, '  OK  '] as [string, Tone?, string?]),
    [kind === 'reboot' ? 'reboot: Restarting system' : 'reboot: Power down', 'dim'],
  ];
  const booting: [string, Tone?, string?][] = [
    ['Ryhox OS 3.14.1864-brass (tty1)', 'hi'],
    ['', undefined],
    ...STARTS.map(([, s]) => [s, undefined, '  OK  '] as [string, Tone?, string?]),
  ];

  const p: Program = {
    mode: 'screen',
    done: false,
    hint: 'the machine',
    tick(t) {
      if (t0 < 0) t0 = t;
      const e = t - t0;
      if (phase === 'stopping') {
        const n = Math.min(stopping.length, Math.floor(e / 0.18));
        if (n !== shown) {
          while (lines.length < n) lines.push(stopping[lines.length]);
          shown = n;
          return true;
        }
        if (e > stopping.length * 0.18 + 0.5) {
          lines.length = 0;
          shown = 0;
          t0 = t;
          phase = kind === 'halt' ? 'dark' : 'booting';
          p.hint = kind === 'halt' ? 'any key switches it back on' : 'the machine';
          return true;
        }
        return false;
      }
      if (phase === 'booting') {
        const n = Math.min(booting.length, Math.floor(e / 0.22));
        if (n !== shown) {
          while (lines.length < n) lines.push(booting[lines.length]);
          shown = n;
          return true;
        }
        if (e > booting.length * 0.22 + 0.7) p.done = true;
      }
      return false;
    },
    key(k: Key) {
      if (phase === 'dark' && !k.ctrl) {
        phase = 'booting';
        t0 = -1;
        shown = 0;
        lines.length = 0;
      }
      return true;
    },
    draw(g: Gfx) {
      if (phase === 'dark') {
        g.center(Math.floor(g.rows / 2) - 1, 'System halted.', 'dim');
        g.center(Math.floor(g.rows / 2) + 1, 'it is now safe to switch off your lumen 64.', 'dim');
        if (g.blink) g.center(g.rows - 1, 'press any key', 'dim');
        return;
      }
      const from = Math.max(0, lines.length - g.rows);
      lines.slice(from).forEach(([text, tone, badge], i) => {
        if (badge) {
          g.text(0, i, '[', 'dim');
          g.text(1, i, badge, 'ok');
          g.text(1 + badge.length, i, ']', 'dim');
          g.text(badge.length + 3, i, text, tone);
        } else g.text(0, i, text, tone);
      });
    },
    exit() {
      sh.root = false;
      sh.fs.root_ok = false;
      sh.started = Date.now();
      io.reset();
    },
  };
  return p;
}
