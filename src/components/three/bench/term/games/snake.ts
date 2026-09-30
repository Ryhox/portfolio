import type { Gfx, Host, Key, Program } from '../types';
import { best, dir, DX, DY, isGo, isQuit } from './common';

/** Snake: eat the cogs, do not bite yourself. Arrows or WASD; p pauses; q quits. */
export function snake(host: Host): Program {
  let bw = 0;
  let bh = 0;
  let body: [number, number][] = [];
  let heading = 1;
  const turns: number[] = [];
  let food: [number, number] = [0, 0];
  let score = 0;
  let state: 'ready' | 'play' | 'paused' | 'over' = 'ready';
  let acc = 0;
  let flash = 0;

  const place = () => {
    const free: [number, number][] = [];
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (!body.some(([a, b]) => a === x && b === y)) free.push([x, y]);
    food = free[Math.floor(Math.random() * free.length)] ?? [0, 0];
  };
  const start = () => {
    const y = Math.floor(bh / 2);
    const x = Math.floor(bw / 3);
    body = [
      [x, y],
      [x - 1, y],
      [x - 2, y],
      [x - 3, y],
    ];
    heading = 1;
    turns.length = 0;
    score = 0;
    acc = 0;
    place();
  };
  const speed = () => Math.min(16, 7 + body.length * 0.18);

  const p: Program = {
    mode: 'screen',
    done: false,
    hint: 'snake · arrows or wasd · p pauses · q quits',
    tick(_t, dt) {
      if (flash > 0) flash = Math.max(0, flash - dt);
      if (state !== 'play') return flash > 0;
      acc += dt * speed();
      let moved = false;
      while (acc >= 1 && state === 'play') {
        acc--;
        moved = true;
        const next = turns.shift();
        if (next !== undefined) heading = next;
        const [hx, hy] = body[0];
        const nx = (hx + DX[heading] + bw) % bw;
        const ny = (hy + DY[heading] + bh) % bh;
        const eat = nx === food[0] && ny === food[1];
        if (!eat) body.pop();
        if (body.some(([a, b]) => a === nx && b === ny)) {
          state = 'over';
          flash = 0.4;
          best(host, 'snake', score);
          host.blip?.('lose');
          break;
        }
        body.unshift([nx, ny]);
        if (eat) {
          score += 10;
          host.blip?.('eat');
          place();
        }
      }
      return moved || flash > 0;
    },
    key(k: Key) {
      if (isQuit(k)) {
        p.done = true;
        return true;
      }
      if (state === 'over') {
        if (isGo(k)) {
          start();
          state = 'play';
        }
        return true;
      }
      if (k.key === 'p' || k.key === 'P') {
        if (state === 'play') state = 'paused';
        else if (state === 'paused') state = 'play';
        return true;
      }
      const d = dir(k);
      if (d < 0) return true;
      if (state === 'ready' || state === 'paused') state = 'play';
      const last = turns.length ? turns[turns.length - 1] : heading;
      if (d !== last && (d + 2) % 4 !== last && turns.length < 3) turns.push(d);
      return true;
    },
    draw(g: Gfx) {
      const hud = g.ch * 1.3;
      const s = Math.max(6, Math.floor(Math.min(g.W / 30, (g.H - hud) / 13)));
      const nw = Math.floor(g.W / s);
      const nh = Math.floor((g.H - hud) / s);
      if (nw !== bw || nh !== bh) {
        bw = nw;
        bh = nh;
        start();
      }
      const ox = Math.floor((g.W - bw * s) / 2);
      const oy = Math.floor(hud + (g.H - hud - bh * s) / 2);
      g.text(0, 0, `score ${score}`, 'hi');
      g.center(0, 'SNAKE', 'ok');
      const b = `best ${Math.max(best(host, 'snake'), score)}`;
      g.text(g.cols - b.length, 0, b, 'dim');
      g.frame(ox - 3, oy - 3, bw * s + 6, bh * s + 6, flash > 0 ? 'err' : 'dim', 2);
      // the cog to eat
      const fx = ox + food[0] * s;
      const fy = oy + food[1] * s;
      g.rect(fx + s * 0.2, fy + s * 0.2, s * 0.6, s * 0.6, 'err');
      g.rect(fx + s * 0.38, fy + s * 0.02, s * 0.24, s * 0.96, 'err');
      g.rect(fx + s * 0.02, fy + s * 0.38, s * 0.96, s * 0.24, 'err');
      body.forEach(([x, y], i) => {
        const inset = i === 0 ? 0.5 : 1.5;
        g.rect(ox + x * s + inset, oy + y * s + inset, s - inset * 2, s - inset * 2, i === 0 ? 'hi' : 'out', i === 0 ? 1 : Math.max(0.45, 1 - i * 0.02));
      });
      const mid = Math.floor(g.rows / 2);
      if (state === 'ready') g.center(mid, ' arrows or wasd to start ', 'inv');
      if (state === 'paused') g.center(mid, ' paused · p goes on ', 'inv');
      if (state === 'over') {
        g.center(mid - 1, ` game over · ${score} `, 'inv');
        g.center(mid + 1, ' r plays again · q quits ', 'inv');
      }
    },
    exit() {
      best(host, 'snake', score);
      return score ? [{ text: `snake: ${score} points. best ${best(host, 'snake')}.`, tone: 'dim' }] : [];
    },
  };
  return p;
}
