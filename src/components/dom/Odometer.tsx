'use client';

import { useEffect, useRef } from 'react';
import s from './Odometer.module.css';

const GLYPHS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789§·—-.&’';

/**
 * A mechanical counter: every character is a drum of glyphs that rolls to its next value,
 * each drum a few milliseconds behind its neighbour, like a real odometer catching up.
 */
export default function Odometer({ text, width, className }: { text: string; width: number; className?: string }) {
  const root = useRef<HTMLSpanElement>(null);
  const shown = useRef<string>(text.toUpperCase().padEnd(width, ' '));

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const next = text.toUpperCase().padEnd(width, ' ').slice(0, width);
    const drums = el.querySelectorAll<HTMLElement>('[data-drum]');
    drums.forEach((d, i) => {
      const from = GLYPHS.indexOf(shown.current[i]);
      const to = GLYPHS.indexOf(next[i]);
      if (from === to) return;
      // longer travel takes a little longer, as a real drum would
      const steps = Math.abs(to - from);
      d.style.setProperty('--dur', `${420 + Math.min(steps, 18) * 22}ms`);
      d.style.setProperty('--delay', `${i * 18}ms`);
      d.style.setProperty('--i', String(to < 0 ? 0 : to));
    });
    shown.current = next;
  }, [text, width]);

  const initial = text.toUpperCase().padEnd(width, ' ').slice(0, width);
  return (
    <span ref={root} className={`${s.odo} ${className ?? ''}`} aria-label={text}>
      {Array.from({ length: width }, (_, i) => {
        const idx = Math.max(0, GLYPHS.indexOf(initial[i]));
        return (
          <span key={i} className={s.cell} aria-hidden="true">
            <span data-drum className={s.drum} style={{ '--i': idx } as React.CSSProperties}>
              {GLYPHS.split('').map((g, k) => (
                <span key={k} className={s.glyph}>
                  {g === ' ' ? ' ' : g}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
