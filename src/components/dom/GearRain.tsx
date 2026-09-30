'use client';

import { useEffect, useRef } from 'react';
import { sfx } from '@/audio/sfx';
import { onFrame } from '@/lib/loop';
import { anchor, rig } from '@/lib/rig';

type Cog = { x: number; y: number; vx: number; vy: number; r: number; a: number; va: number; sprite: number; born: number; still: number };

const RADII = [7, 10, 13, 17, 22];
const METALS: [string, string, string][] = [
  ['#f3d397', '#c99a58', '#6b4a22'],
  ['#e9a57a', '#bb6c3d', '#5a2a12'],
  ['#c9c2b6', '#8c8478', '#3a352e'],
  ['#ffe6b0', '#ddb46c', '#7a5626'],
];
const MAX = 150;
const LIFE = 16;
const G = 1700;

/** One cog, drawn once into a small canvas and stamped from then on. */
function sprite(r: number, [hi, mid, lo]: [string, string, string], dpr: number) {
  const pad = 2;
  const size = Math.ceil((r + pad) * 2 * dpr);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  g.translate(r + pad, r + pad);
  const teeth = Math.max(8, Math.round(r * 0.85) + 4);
  const root = r * 0.76;
  g.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    g.lineTo(Math.cos(a0) * root, Math.sin(a0) * root);
    g.lineTo(Math.cos(a0 + step * 0.18) * r, Math.sin(a0 + step * 0.18) * r);
    g.lineTo(Math.cos(a0 + step * 0.5) * r, Math.sin(a0 + step * 0.5) * r);
    g.lineTo(Math.cos(a0 + step * 0.68) * root, Math.sin(a0 + step * 0.68) * root);
  }
  g.closePath();
  // spokes: windows cut out of the web
  const spokes = r > 12 ? 5 : 4;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + 0.3;
    const w = (Math.PI * 2) / spokes;
    g.moveTo(Math.cos(a + w * 0.18) * r * 0.36, Math.sin(a + w * 0.18) * r * 0.36);
    g.arc(0, 0, r * 0.62, a + w * 0.14, a + w * 0.86);
    g.arc(0, 0, r * 0.36, a + w * 0.82, a + w * 0.18, true);
    g.closePath();
  }
  const grad = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
  grad.addColorStop(0, hi);
  grad.addColorStop(0.55, mid);
  grad.addColorStop(1, lo);
  g.fillStyle = grad;
  g.fill('evenodd');
  g.lineWidth = 0.8;
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.stroke();
  // hub
  g.beginPath();
  g.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  g.fillStyle = lo;
  g.fill();
  return { c, half: r + pad };
}

/**
 * The finale's weather: the cursor sheds cogs. They fall, roll, pile up on the floor, knock
 * into each other and bounce off the letters of "Say hi" (which flinch when hit), then fade.
 * Plain 2D, stamped from pre-drawn sprites, and asleep whenever the section is off screen.
 */
export default function GearRain() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const sprites = RADII.flatMap((r) => METALS.map((m) => sprite(r, m, dpr)));
    const cogs: Cog[] = [];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let last = { x: 0, y: 0, t: 0, on: false };
    let carry = 0;
    let lastClink = 0;
    let drizzle = 0;
    let time = 0;
    let active = false;
    let letters: HTMLElement[] = [];
    const kicks = new Map<HTMLElement, { a: number; v: number }>();

    const spawn = (x: number, y: number, vx: number, vy: number) => {
      const ri = Math.floor(Math.random() ** 1.6 * RADII.length);
      const r = RADII[ri];
      cogs.push({
        x,
        y,
        vx: vx + (Math.random() - 0.5) * 140,
        vy: vy - Math.random() * 160,
        r,
        a: Math.random() * Math.PI * 2,
        va: (Math.random() - 0.5) * 10,
        sprite: ri * METALS.length + Math.floor(Math.random() * METALS.length),
        born: time,
        still: 0,
      });
      if (cogs.length > MAX) cogs.shift();
    };

    const onMove = (e: PointerEvent) => {
      if (!active || reduced) return;
      const x = e.clientX;
      const y = e.clientY + rig.scroll;
      const now = performance.now() / 1000;
      if (last.on) {
        const dx = x - last.x;
        const dy = y - last.y;
        const dt = Math.max(0.008, now - last.t);
        carry += Math.hypot(dx, dy);
        let n = 0;
        while (carry > 34 && n < 4) {
          carry -= 34;
          n++;
          spawn(x - dx * Math.random(), y - dy * Math.random(), (dx / dt) * 0.22, (dy / dt) * 0.22);
        }
      }
      last = { x, y, t: now, on: true };
    };
    const onDown = (e: PointerEvent) => {
      if (!active) return;
      const t = e.target as HTMLElement;
      if (t.closest('a, button')) return;
      const y = e.clientY + rig.scroll;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        spawn(e.clientX, y, Math.cos(a) * 420, Math.sin(a) * 420 - 200);
      }
      sfx.clink();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });

    const kick = (el: HTMLElement, v: number) => {
      const k = kicks.get(el) ?? { a: 0, v: 0 };
      k.v += v;
      kicks.set(el, k);
    };

    const off = onFrame((_, dtRaw) => {
      const a = anchor('contact');
      const vis = rig.route === 'home' && a.height > 0 && rig.scroll + rig.vh > a.top && rig.scroll < a.top + a.height + rig.vh * 0.2;
      if (vis !== active) {
        active = vis;
        cv.style.display = vis ? 'block' : 'none';
        last.on = false;
        if (vis) letters = Array.from(document.querySelectorAll<HTMLElement>('[data-collider]'));
      }
      if (!active) return;
      const W = rig.vw;
      const H = window.innerHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      const dt = Math.min(dtRaw, 1 / 30);
      time += dt;

      // a light drizzle, so the room is never quite still
      drizzle -= dt;
      if (!reduced && drizzle <= 0 && cogs.length < 40) {
        drizzle = 1.6 + Math.random() * 2.4;
        spawn(W * (0.15 + Math.random() * 0.7), rig.scroll - 30, 0, 200);
      }

      const floorA = anchor('floor');
      const floorY = floorA.height ? floorA.top + floorA.height - 6 : a.top + a.height;
      const rects = letters.map((el) => {
        const r = el.getBoundingClientRect();
        return { el, x0: r.left, x1: r.right, y0: r.top + rig.scroll + r.height * 0.1, y1: r.bottom + rig.scroll };
      });

      const steps = 2;
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        for (const c of cogs) {
          if (c.still > 0.6) continue;
          c.vy += G * h;
          c.vx *= 1 - 0.15 * h;
          c.x += c.vx * h;
          c.y += c.vy * h;
          c.a += c.va * h;
          // the floor
          if (c.y + c.r > floorY) {
            c.y = floorY - c.r;
            if (c.vy > 260 && time - lastClink > 0.07) {
              lastClink = time;
              sfx.clink();
            }
            c.vy *= c.vy > 60 ? -0.32 : 0;
            c.vx *= 0.94;
            c.va = c.vx / c.r;
          }
          // the walls
          if (c.x < c.r) {
            c.x = c.r;
            c.vx = Math.abs(c.vx) * 0.5;
          } else if (c.x > W - c.r) {
            c.x = W - c.r;
            c.vx = -Math.abs(c.vx) * 0.5;
          }
          // the letters
          for (const r of rects) {
            const px = Math.max(r.x0, Math.min(c.x, r.x1));
            const py = Math.max(r.y0, Math.min(c.y, r.y1));
            const dx = c.x - px;
            const dy = c.y - py;
            const d2 = dx * dx + dy * dy;
            if (d2 >= c.r * c.r) continue;
            const d = Math.sqrt(d2) || 0.001;
            const nx = d2 > 0 ? dx / d : 0;
            const ny = d2 > 0 ? dy / d : -1;
            c.x += nx * (c.r - d);
            c.y += ny * (c.r - d);
            const vn = c.vx * nx + c.vy * ny;
            if (vn < 0) {
              c.vx -= 1.4 * vn * nx;
              c.vy -= 1.4 * vn * ny;
              c.va = c.vx / c.r;
              if (-vn > 240) kick(r.el, (c.x > (r.x0 + r.x1) / 2 ? 1 : -1) * Math.min(1, -vn / 1400) * c.r * 0.12);
            }
          }
        }
        // each other
        for (let i = 0; i < cogs.length; i++) {
          const p = cogs[i];
          for (let j = i + 1; j < cogs.length; j++) {
            const q = cogs[j];
            const dx = q.x - p.x;
            const dy = q.y - p.y;
            const rr = (p.r + q.r) * 0.86;
            const d2 = dx * dx + dy * dy;
            if (d2 >= rr * rr || d2 === 0) continue;
            const d = Math.sqrt(d2);
            const nx = dx / d;
            const ny = dy / d;
            const push = (rr - d) * 0.5;
            p.x -= nx * push;
            p.y -= ny * push;
            q.x += nx * push;
            q.y += ny * push;
            const rv = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
            if (rv < 0) {
              const imp = -rv * 0.65;
              p.vx -= imp * nx;
              p.vy -= imp * ny;
              q.vx += imp * nx;
              q.vy += imp * ny;
              p.still = q.still = 0;
              // meshing teeth turn each other the other way
              q.va = -p.va * (p.r / q.r) * 0.6 + q.va * 0.4;
            }
          }
        }
      }

      // settle, age, draw
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (let i = cogs.length - 1; i >= 0; i--) {
        const c = cogs[i];
        const slow = Math.abs(c.vx) + Math.abs(c.vy) < 12 && c.y + c.r >= floorY - 1;
        c.still = slow ? c.still + dt : 0;
        const age = time - c.born;
        if (age > LIFE + 1 || c.y > floorY + 400) {
          cogs.splice(i, 1);
          continue;
        }
        const sy = c.y - rig.scroll;
        if (sy < -40 || sy > H + 40) continue;
        const sp = sprites[c.sprite];
        ctx.globalAlpha = age > LIFE ? Math.max(0, LIFE + 1 - age) : Math.min(1, age * 6);
        const cos = Math.cos(c.a) * dpr;
        const sin = Math.sin(c.a) * dpr;
        ctx.setTransform(cos, sin, -sin, cos, c.x * dpr, sy * dpr);
        ctx.drawImage(sp.c, -sp.half, -sp.half, sp.half * 2, sp.half * 2);
      }
      ctx.globalAlpha = 1;

      // the letters flinch, and spring back
      kicks.forEach((k, el) => {
        k.v += (-k.a * 180 - k.v * 12) * dt;
        k.a += k.v * dt;
        el.style.setProperty('--kick', `${k.a.toFixed(3)}deg`);
        if (Math.abs(k.a) < 0.01 && Math.abs(k.v) < 0.01) {
          el.style.setProperty('--kick', '0deg');
          kicks.delete(el);
        }
      });
    }, 'after');

    return () => {
      off();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      style={{ position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', zIndex: 5, pointerEvents: 'none', display: 'none' }}
    />
  );
}
