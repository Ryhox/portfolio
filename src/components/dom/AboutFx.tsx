'use client';

import { useEffect, useRef } from 'react';
import { about, TRADES } from '@/lib/about';
import { ZOOM_FROM } from '@/lib/office';
import { onFrame } from '@/lib/loop';
import { smoothstep } from '@/lib/math';
import { pinProgress, rig } from '@/lib/rig';
import { sfx } from '@/audio/sfx';

/**
 * Drives the pinned About section: the maker's half gives way to the trades' half as you scroll,
 * then the scroll steps the clock through the five trades, one shown at a time. The marks under
 * the trade point the hands at another.
 */
export default function AboutFx({ className, children }: { className?: string; children: React.ReactNode }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = el.current;
    if (!root) return;
    const buttons = root.querySelectorAll<HTMLButtonElement>('[data-skill-btn]');
    const items = root.querySelectorAll<HTMLElement>('[data-skill]');
    const onClick = (e: Event) => {
      const i = Number((e.currentTarget as HTMLElement).dataset.skillBtn);
      about.picked = i;
      about.pickedAt = rig.time;
      sfx.click();
    };
    buttons.forEach((b) => b.addEventListener('click', onClick));

    let lastPhase = -1;
    let lastActive = -1;
    const off = onFrame(() => {
      if (rig.route !== 'home') return;
      const p = pinProgress('maker');
      const phase = smoothstep(0.18, 0.26, p);
      about.phase = phase;
      // the scroll walks the hands round the dial, unless a trade was picked a moment ago
      const fromScroll = Math.min(TRADES - 1, Math.max(0, Math.floor(((p - 0.28) / 0.4) * TRADES)));
      // then the type steps aside, and the camera dives into the clock
      const out = smoothstep(ZOOM_FROM, ZOOM_FROM + 0.05, p);
      const pickedLive = about.picked >= 0 && rig.time - about.pickedAt < 6 && Math.abs(rig.velocity) < 400;
      if (!pickedLive) about.picked = -1;
      about.active = pickedLive ? about.picked : fromScroll;

      const shown = phase * (1 - out);
      if (Math.abs(shown - lastPhase) > 0.001 || (out > 0.5) !== (root.dataset.phase === 'dive')) {
        lastPhase = shown;
        root.style.setProperty('--bio', (1 - phase).toFixed(3));
        root.style.setProperty('--skills', shown.toFixed(3));
        root.dataset.phase = out > 0.5 ? 'dive' : phase > 0.5 ? 'skills' : 'bio';
      }
      if (about.active !== lastActive) {
        if (lastActive >= 0 && phase > 0.5) sfx.ratchet();
        // only the trade the hands point at is shown: direction first, so the next one comes in
        // from the side the hands are turning to, then who is in and who is on the way out
        const dir = about.active > lastActive ? 'down' : 'up';
        items.forEach((it) => (it.dataset.dir = dir));
        void root.offsetWidth;
        items.forEach((it, i) => {
          it.dataset.on = i === about.active ? '1' : '0';
          it.dataset.state = i === about.active ? 'in' : i === lastActive ? 'out' : 'off';
        });
        buttons.forEach((b, i) => {
          b.dataset.on = i === about.active ? '1' : '0';
          b.setAttribute('aria-pressed', i === about.active ? 'true' : 'false');
        });
        lastActive = about.active;
      }
    }, 'after');

    return () => {
      off();
      buttons.forEach((b) => b.removeEventListener('click', onClick));
    };
  }, []);

  return (
    <div ref={el} className={className} data-sticky>
      {children}
    </div>
  );
}
