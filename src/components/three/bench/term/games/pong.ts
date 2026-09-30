import type { Gfx, Host, Key, Program } from '../types';
import { isQuit } from './common';

const TO = 7;

/** Pong against the machine: W/S or the arrows move your paddle; first to 7; q quits. */
export function pong(host: Host): Program {
  // the field is 1 wide and `aspect` tall... in units of its own width
  const S = { you: 0, cpu: 0 };
  let aspect = 0.55;
  let py = 0.5;
  let cy = 0.5;
  let bx = 0.5;
  let by = 0.5;
  let vx = 0;
  let vy = 0;
  let up = false;
  let down = false;
  let wait = 1;
  let state: 'play' | 'over' = 'play';
  const PH = 0.2;
  const PW = 0.014;
  const BALL = 0.016;

  const serve = (toward: number) => {
    bx = 0.5;
    by = aspect / 2;
    const a = (Math.random() - 0.5) * 0.9;
    const sp = 0.55;
    vx = Math.cos(a) * sp * toward;
    vy = Math.sin(a) * sp;
    wait = 0.9;
  };
  serve(Math.random() < 0.5 ? -1 : 1);

  const p: Program = {
    mode: 'screen',
    done: false,
    hint: 'pong · w/s or arrows · first to 7 · q quits',
    tick(_t, dt) {
      if (state !== 'play') return false;
      const h = aspect;
      const ph = PH * h * 1.2;
      const move = 0.9 * h * dt;
      if (up) py -= move;
      if (down) py += move;
      py = Math.max(ph / 2, Math.min(h - ph / 2, py));
      if (wait > 0) {
        wait -= dt;
        return true;
      }
      // the machine follows the ball, a little late, and not too fast
      const target = vx > 0 ? by : h / 2;
      cy += Math.max(-0.62 * h * dt, Math.min(0.62 * h * dt, (target - cy) * 0.12));
      cy = Math.max(ph / 2, Math.min(h - ph / 2, cy));
      bx += vx * dt;
      by += vy * dt;
      if (by < BALL / 2) {
        by = BALL / 2;
        vy = Math.abs(vy);
      }
      if (by > h - BALL / 2) {
        by = h - BALL / 2;
        vy = -Math.abs(vy);
      }
      const hit = (px: number, pc: number, side: number) => {
        if (Math.abs(bx - px) < PW / 2 + BALL / 2 && Math.abs(by - pc) < ph / 2 + BALL / 2 && Math.sign(vx) === side) {
          const off = (by - pc) / (ph / 2);
          const sp = Math.min(1.5, Math.hypot(vx, vy) * 1.07);
          const a = off * 1.0;
          vx = -side * Math.cos(a) * sp;
          vy = Math.sin(a) * sp;
          host.blip?.('hit');
        }
      };
      hit(0.04, py, -1);
      hit(0.96, cy, 1);
      if (bx < -0.02 || bx > 1.02) {
        const you = bx > 1;
        if (you) S.you++;
        else S.cpu++;
        host.blip?.(you ? 'eat' : 'move');
        if (S.you >= TO || S.cpu >= TO) {
          state = 'over';
          host.blip?.(S.you >= TO ? 'win' : 'lose');
        } else serve(you ? -1 : 1);
      }
      return true;
    },
    key(k: Key) {
      if (isQuit(k)) {
        p.done = true;
        return true;
      }
      if (state === 'over' && (k.key === 'r' || k.key === 'Enter')) {
        S.you = 0;
        S.cpu = 0;
        state = 'play';
        serve(1);
      }
      if (k.key === 'ArrowUp' || k.key === 'w' || k.key === 'W') up = true;
      if (k.key === 'ArrowDown' || k.key === 's' || k.key === 'S') down = true;
      return true;
    },
    release(k: Key) {
      if (k.key === 'ArrowUp' || k.key === 'w' || k.key === 'W') up = false;
      if (k.key === 'ArrowDown' || k.key === 's' || k.key === 'S') down = false;
    },
    draw(g: Gfx) {
      aspect = g.H / g.W;
      const u = g.W;
      const ph = PH * aspect * 1.2 * u;
      for (let y = 0; y < g.H; y += g.H / 24) g.rect(u / 2 - 1.5, y, 3, g.H / 48, 'dim');
      g.rect(0.04 * u - (PW * u) / 2, py * u - ph / 2, PW * u, ph, 'hi');
      g.rect(0.96 * u - (PW * u) / 2, cy * u - ph / 2, PW * u, ph, 'out');
      if (state === 'play' && (wait <= 0 || Math.floor(wait * 6) % 2 === 0)) g.rect(bx * u - (BALL * u) / 2, by * u - (BALL * u) / 2, BALL * u, BALL * u, 'hi');
      const sc = 2.4;
      g.textPx(u * 0.42 - g.cw * sc, g.ch * 0.2, String(S.you), 'hi', sc);
      g.textPx(u * 0.58, g.ch * 0.2, String(S.cpu), 'out', sc);
      g.textPx(u * 0.04, g.H - g.ch * 1.1, 'you', 'dim');
      g.textPx(u * 0.96 - g.cw * 7, g.H - g.ch * 1.1, 'machine', 'dim');
      if (state === 'over') {
        const mid = Math.floor(g.rows / 2);
        g.center(mid - 1, S.you >= TO ? ' you win ' : ' the machine wins ', 'inv');
        g.center(mid + 1, ' r again · q quits ', 'inv');
      }
    },
    exit() {
      return S.you + S.cpu ? [{ text: `pong: you ${S.you}, the machine ${S.cpu}.`, tone: 'dim' }] : [];
    },
  };
  return p;
}
