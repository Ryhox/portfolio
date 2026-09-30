import type { Gfx, Key, Program } from '../types';
import { strftime } from '../util';

/** top: the processes, their share of the 64 cogs moving about once a second. q quits. */
export function top(procs: [number, string][]): Program {
  const rows = procs.map(([pid, name]) => ({ pid, name, cpu: 2 + Math.random() * 20, mem: 2 + Math.random() * 18, time: Math.random() * 90 }));
  rows.push({ pid: 6401, name: 'top', cpu: 1, mem: 1.2, time: 0 });
  let next = 0;
  const p: Program = {
    mode: 'screen',
    done: false,
    hint: 'top · q quits',
    tick(t, dt) {
      for (const r of rows) r.time += (dt * r.cpu) / 100;
      if (t < next) return false;
      next = t + 1;
      for (const r of rows) {
        r.cpu = Math.max(0.1, Math.min(60, r.cpu + (Math.random() - 0.5) * 8));
        r.mem = Math.max(0.5, Math.min(30, r.mem + (Math.random() - 0.5) * 0.6));
      }
      // the tube always works hardest
      rows.find((r) => r.name === 'lumen-tube')!.cpu = 30 + Math.random() * 10;
      rows.sort((a, b) => b.cpu - a.cpu);
      return true;
    },
    key(k: Key) {
      if (k.key === 'q' || k.key === 'Escape' || (k.ctrl && k.key === 'c')) p.done = true;
      return true;
    },
    draw(g: Gfx) {
      const cpu = rows.reduce((s, r) => s + r.cpu, 0) / 4;
      const mem = rows.reduce((s, r) => s + r.mem, 0);
      g.text(0, 0, `top - ${strftime('%T')} up, 1 user, load average: 0.64, 0.64, 0.64`.slice(0, g.cols));
      g.text(0, 1, `Tasks: ${rows.length} total,   1 running, ${rows.length - 1} sleeping`);
      g.text(0, 2, `%Cpu(s): ${cpu.toFixed(1).padStart(5)} us, ${(cpu / 6).toFixed(1).padStart(4)} sy, ${Math.max(0, 100 - cpu * 1.2).toFixed(1).padStart(5)} id`);
      g.text(0, 3, `KiB Mem:  64 total, ${(64 - (mem * 64) / 100).toFixed(0).padStart(3)} free, ${((mem * 64) / 100).toFixed(0).padStart(3)} used`);
      const head = '  PID USER      %CPU  %MEM     TIME+ COMMAND';
      g.invert(0, 5, head.padEnd(g.cols).slice(0, g.cols), 'out');
      rows.slice(0, Math.max(0, g.rows - 6)).forEach((r, i) => {
        const m = Math.floor(r.time / 60);
        const s = (r.time % 60).toFixed(2).padStart(5, '0');
        const user = r.name === 'bash' || r.name === 'top' ? 'ryhox' : 'root';
        g.text(0, 6 + i, `${String(r.pid).padStart(5)} ${user.padEnd(8)} ${r.cpu.toFixed(1).padStart(5)} ${r.mem.toFixed(1).padStart(5)} ${`${m}:${s}`.padStart(9)} ${r.name}`, i === 0 ? 'hi' : undefined);
      });
    },
  };
  return p;
}
