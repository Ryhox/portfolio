'use client';

import { useEffect, useRef, useState } from 'react';
import { onFrame } from '@/lib/loop';
import { rig } from '@/lib/rig';
import { smoothstep } from '@/lib/math';
import s from './CrtGlass.module.css';

/**
 * The glass in front of everything once you are inside the tube: a fine, living film grain over
 * the type (the WebGL picture has its own), a faint window reflection, and the dark rim where
 * the picture meets the bezel. On the way in it is there as soon as the inner world shows on the
 * machine's screen, laid on that screen (and growing with it), so the world does not stand on
 * plain black until the view is through the glass.
 * Also hosts the beam used when the channel changes.
 */
/** A small tile of monochrome noise, made once. */
function noiseTile() {
  const c = document.createElement('canvas');
  c.width = c.height = 180;
  const g = c.getContext('2d')!;
  const img = g.createImageData(180, 180);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = v;
    img.data[i + 1] = v * 0.94;
    img.data[i + 2] = v * 0.84;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

type M3 = number[];
const adj = (m: M3): M3 => [
  m[4] * m[8] - m[5] * m[7],
  m[2] * m[7] - m[1] * m[8],
  m[1] * m[5] - m[2] * m[4],
  m[5] * m[6] - m[3] * m[8],
  m[0] * m[8] - m[2] * m[6],
  m[2] * m[3] - m[0] * m[5],
  m[3] * m[7] - m[4] * m[6],
  m[1] * m[6] - m[0] * m[7],
  m[0] * m[4] - m[1] * m[3],
];
const mul = (a: M3, b: M3): M3 => {
  const c: M3 = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return c;
};
/** The projection that takes the unit square's corners to four points (the last one fixes its scale). */
function basis(p: number[]): M3 {
  const m = [p[0], p[2], p[4], p[1], p[3], p[5], 1, 1, 1];
  const a = adj(m);
  const v = [0, 1, 2].map((i) => a[i * 3] * p[6] + a[i * 3 + 1] * p[7] + a[i * 3 + 2]);
  return mul(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}
/**
 * The CSS transform (about the top-left corner) that lays a w × h box on four points: its top-left,
 * top-right, bottom-right and bottom-left corners, as the screen of the machine is seen in perspective.
 */
function onto(w: number, h: number, pts: number[]) {
  const t = mul(basis(pts), adj(basis([0, 0, w, 0, w, h, 0, h])));
  if (!t[8]) return '';
  const n = (i: number) => (t[i] / t[8]).toFixed(8);
  return `matrix3d(${n(0)},${n(3)},0,${n(6)},${n(1)},${n(4)},0,${n(7)},0,0,1,0,${n(2)},${n(5)},0,1)`;
}

export default function CrtGlass() {
  const glass = useRef<HTMLDivElement>(null);
  const [noise, setNoise] = useState<string | null>(null);
  useEffect(() => setNoise(noiseTile()), []);

  useEffect(() => {
    const last = { opacity: '', transform: '', round: '' };
    return onFrame(() => {
      const g = glass.current;
      if (!g) return;
      // on the way in: from the moment the inner world tunes in on the machine's screen
      const inside = rig.route === 'home' ? (rig.exit > 0 ? 1 - smoothstep(0.0, 0.25, rig.exit) : smoothstep(0.2, 0.3, rig.dive)) : 1;
      const opacity = inside.toFixed(3);
      if (opacity !== last.opacity) g.style.opacity = last.opacity = opacity;
      // seen from outside, the glass is the machine's screen: it lies where that shows
      const on = rig.glass.on && inside > 0;
      // (its own box is the viewport's: taken from there, not measured, so nothing is laid out for it)
      const transform = on ? onto(rig.vw, window.innerHeight, rig.glass.pts) : '';
      const round = on && rig.glass.round > 0.5 ? `${rig.glass.round.toFixed(1)}px` : '';
      if (transform !== last.transform) g.style.transform = last.transform = transform;
      if (round !== last.round) g.style.borderRadius = last.round = round;
    }, 'after');
  }, []);

  return (
    <>
      <div ref={glass} className={s.glass} aria-hidden="true" style={{ opacity: 0 }}>
        <div className={s.grain} style={noise ? { backgroundImage: `url(${noise})` } : undefined} />
        <div className={s.sheen} />
      </div>
      <div className={s.beam} aria-hidden="true" />
    </>
  );
}
