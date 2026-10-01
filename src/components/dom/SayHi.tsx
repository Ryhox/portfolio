'use client';

import { useEffect, useRef } from 'react';
import { onFrame } from '@/lib/loop';
import { clamp } from '@/lib/math';
import { reel } from '@/lib/reel';
import { anchor, rig } from '@/lib/rig';
import s from './SayHi.module.css';

const WORDS = ['Say', 'hi'];

/**
 * The finale's headline, as in v1: each letter rises and swells into place as the section scrolls
 * in. The letters are also solid: the cogs the cursor sheds in 3D land on them (data-collider).
 */
export default function SayHi({ className, id }: { className?: string; id?: string }) {
  const root = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const chars = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-char]') ?? []);
    let last = -1;
    return onFrame(() => {
      const a = anchor('contact');
      if (!a.height) return;
      // from the section's top at 85% of the viewport down to 15%
      // (seen through the last frame of the film, on the way out of the projects, it stands ready)
      const p = reel.leave > 0 ? 1 : clamp((rig.scroll + rig.vh * 0.85 - a.top) / (rig.vh * 0.7));
      if (Math.abs(p - last) < 0.0005) return;
      last = p;
      chars.forEach((c, i) => {
        const k = clamp(p * 1.6 - i * 0.08);
        const e = 1 - (1 - k) ** 3;
        c.style.transform = `translate3d(0, ${(1 - e) * 140}%, 0) rotate(${(1 - e) * 14}deg) scale(${0.6 + 0.4 * e}) rotate(var(--kick, 0deg))`;
      });
    }, 'after');
  }, []);

  let n = 0;
  return (
    <h2 ref={root} id={id} className={`${s.sayhi} ${className ?? ''}`} aria-label="Say hi">
      {WORDS.map((w) => (
        <span key={w} className={s.word} aria-hidden="true">
          {w.split('').map((ch) => (
            <span key={n} className={s.char} data-char data-collider style={{ transform: 'translate3d(0,140%,0)' }}>
              {ch}
              {void n++}
            </span>
          ))}
        </span>
      ))}
    </h2>
  );
}
