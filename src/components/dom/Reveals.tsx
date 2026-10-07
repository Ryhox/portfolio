'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { onFrame } from '@/lib/loop';
import { rig } from '@/lib/rig';
import { useApp } from '@/lib/store';

/** how long the picture has been on before what is in view comes up: the tube is still opening (seconds) */
const SETTLE = 0.28;

/**
 * Arrivals. The page's type (marked data-rv, or gathered under a data-rvs so it arrives together)
 * comes up into its place the first time it comes into view, and stays. While the picture is off
 * (the loader, a channel change) nothing arrives: whatever is in view then comes up as the picture
 * comes on over it, so a page that was put somewhere behind the dark opens with its type arriving.
 * How each piece comes up is in globals.css; this only says when.
 */
export default function Reveals() {
  const pathname = usePathname();

  useEffect(() => {
    const html = document.documentElement;
    const show = (el: Element) => {
      el.setAttribute('data-in', '1');
      if (el.hasAttribute('data-rvs')) el.querySelectorAll('[data-rv]').forEach((n) => n.setAttribute('data-in', '1'));
    };
    // (a piece under a data-rvs arrives with it, not by itself)
    const units = Array.from(document.querySelectorAll<HTMLElement>('[data-rvs]:not([data-in]), [data-rv]:not([data-in])')).filter(
      (el) => el.hasAttribute('data-rvs') || !el.closest('[data-rvs]'),
    );
    if (!units.length) return;
    // nothing plays for someone who asked for stillness, nor for a crawler: it is simply there
    if (rig.reducedMotion || !('IntersectionObserver' in window) || /bot|crawl|spider|slurp|bingpreview|google-inspectiontool/i.test(navigator.userAgent)) {
      units.forEach(show);
      return;
    }

    const waiting = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) waiting.add(e.target);
          else waiting.delete(e.target);
        }
      },
      { rootMargin: '0px 0px -9% 0px' },
    );
    units.forEach((el) => io.observe(el));

    let on = -1;
    const off = onFrame(() => {
      const showing = useApp.getState().stage === 'ready' && !rig.dark && !html.classList.contains('crt-off');
      if (!showing) {
        on = -1;
        return;
      }
      if (on < 0) on = rig.time;
      if (!waiting.size || rig.time - on < SETTLE) return;
      waiting.forEach((el) => {
        show(el);
        io.unobserve(el);
      });
      waiting.clear();
    }, 'after');

    return () => {
      off();
      io.disconnect();
    };
  }, [pathname]);

  return null;
}
