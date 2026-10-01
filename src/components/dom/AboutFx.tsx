'use client';

import { useEffect, useRef } from 'react';
import { about, tradeAngle, TRADES } from '@/lib/about';
import { ZOOM_FROM } from '@/lib/office';
import { onFrame } from '@/lib/loop';
import { clamp, smoothstep } from '@/lib/math';
import { pinProgress, rig } from '@/lib/rig';
import { sfx } from '@/audio/sfx';

/**
 * Drives the pinned About section: the maker's half gives way to the trades' half as you scroll,
 * then the scroll steps the clock's hand through the five trades. They are set out round the
 * clock: each comes in when the hand first comes round to it and stays, so by the end all five
 * (and their tools) are there to be read; the one the hand points at is lit. A trade's name points
 * the hand at it.
 */
export default function AboutFx({ className, children }: { className?: string; children: React.ReactNode }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = el.current;
    if (!root) return;
    const buttons = root.querySelectorAll<HTMLButtonElement>('[data-skill-btn]');
    const items = root.querySelectorAll<HTMLElement>('[data-skill]');
    const leads = root.querySelectorAll<SVGGElement>('[data-lead]');
    const onClick = (e: Event) => {
      const i = Number((e.currentTarget as HTMLElement).dataset.skillBtn);
      about.picked = i;
      about.pickedAt = rig.time;
      sfx.click();
    };
    buttons.forEach((b) => b.addEventListener('click', onClick));

    // the lines from the dial to the names: from just off the clock's rim, at the trade's place on
    // the dial, out to the first line of its name, with a short level run into it
    const svg = root.querySelector<SVGSVGElement>('[data-leads]');
    const stage = root.querySelector<HTMLElement>('[data-stage="about-clock"]');
    const draw = () => {
      if (!svg || !stage || getComputedStyle(svg).display === 'none') return;
      // (measured with the trades at rest, not part-way through sliding in)
      const shown = root.style.getPropertyValue('--skills');
      root.style.setProperty('--skills', '1');
      items.forEach((it) => (it.style.translate = 'none'));
      const o = svg.getBoundingClientRect();
      const c = stage.getBoundingClientRect();
      const cx = c.left + c.width / 2 - o.left;
      const cy = c.top + c.height / 2 - o.top;
      // (the clock fills its box to 0.96, see the 3D)
      const r = (Math.min(c.width, c.height) * 0.96) / 2 + 12;
      items.forEach((it, i) => {
        const name = it.querySelector<HTMLElement>('h3');
        const g = leads[i];
        if (!name || !g) return;
        const a = tradeAngle(i);
        const side = Math.sin(a) >= 0 ? 1 : -1;
        const n = name.getBoundingClientRect();
        const x0 = cx + Math.sin(a) * r;
        const y0 = cy - Math.cos(a) * r;
        const x1 = (side > 0 ? n.left : n.right) - o.left - side * 14;
        const y1 = n.top - o.top + (parseFloat(getComputedStyle(name).lineHeight) || n.height) / 2;
        const run = clamp((x1 - x0) * side * 0.45, 0, 28);
        const d = `M${x0.toFixed(1)} ${y0.toFixed(1)}L${(x1 - side * run).toFixed(1)} ${y1.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`;
        g.querySelectorAll('path').forEach((p) => p.setAttribute('d', d));
        const dot = g.querySelector('circle');
        dot?.setAttribute('cx', x0.toFixed(1));
        dot?.setAttribute('cy', y0.toFixed(1));
      });
      items.forEach((it) => (it.style.translate = ''));
      if (shown) root.style.setProperty('--skills', shown);
      else root.style.removeProperty('--skills');
    };
    let queued = 0;
    const redraw = () => {
      cancelAnimationFrame(queued);
      queued = requestAnimationFrame(draw);
    };
    const ro = new ResizeObserver(redraw);
    ro.observe(root);
    document.fonts?.ready.then(redraw);

    let lastPhase = -1;
    let lastActive = -1;
    let lastSeen = -1;
    const off = onFrame(() => {
      if (rig.route !== 'home') return;
      const p = pinProgress('maker');
      const phase = smoothstep(0.18, 0.26, p);
      about.phase = phase;
      // the scroll walks the hand round the dial, unless a trade was picked a moment ago
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
      // not all at once: a trade comes in when the hand first comes round to it, and then stays
      if (fromScroll !== lastSeen) {
        lastSeen = fromScroll;
        items.forEach((it, i) => (it.dataset.seen = i <= fromScroll ? '1' : '0'));
        leads.forEach((g, i) => (g.dataset.seen = i <= fromScroll ? '1' : '0'));
      }
      if (about.active !== lastActive) {
        if (lastActive >= 0 && phase > 0.5) sfx.ratchet();
        // the trade the hand points at is lit, its plates and the line out to it
        const on = (i: number) => (i === about.active ? '1' : '0');
        items.forEach((it, i) => (it.dataset.on = on(i)));
        leads.forEach((g, i) => (g.dataset.on = on(i)));
        buttons.forEach((b, i) => b.setAttribute('aria-pressed', i === about.active ? 'true' : 'false'));
        lastActive = about.active;
      }
    }, 'after');

    return () => {
      off();
      ro.disconnect();
      cancelAnimationFrame(queued);
      buttons.forEach((b) => b.removeEventListener('click', onClick));
    };
  }, []);

  return (
    <div ref={el} className={className} data-sticky>
      {children}
    </div>
  );
}
