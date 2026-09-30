'use client';

import { useEffect, useRef, useState } from 'react';
import { onFrame } from '@/lib/loop';
import { rig } from '@/lib/rig';
import { smoothstep } from '@/lib/math';
import s from './CrtGlass.module.css';

/**
 * The glass in front of everything once you are inside the tube: a fine, living film grain over
 * the type (the WebGL picture has its own), a faint window reflection, and the dark rim where
 * the picture meets the bezel.
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

export default function CrtGlass() {
  const glass = useRef<HTMLDivElement>(null);
  const [noise, setNoise] = useState<string | null>(null);
  useEffect(() => setNoise(noiseTile()), []);

  useEffect(
    () =>
      onFrame(() => {
        const g = glass.current;
        if (!g) return;
        const inside = rig.route === 'home' ? (rig.exit > 0 ? 1 - smoothstep(0.0, 0.25, rig.exit) : smoothstep(0.985, 1, rig.dive)) : 1;
        g.style.opacity = inside.toFixed(3);
      }, 'after'),
    [],
  );

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
