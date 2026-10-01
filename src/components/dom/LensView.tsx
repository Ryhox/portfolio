'use client';

import { useEffect, useRef } from 'react';
import { onFrame } from '@/lib/loop';
import { smoothstep } from '@/lib/math';
import { office } from '@/lib/office';
import { lastScreenScroll, reel } from '@/lib/reel';
import { anchor, rig } from '@/lib/rig';
import s from './LensView.module.css';

/**
 * The way into the old camera and out of it. The office camera goes into the black of the lens,
 * the screen is black, and behind the black the view changes to the loop of film inside (the 3D
 * reel), which fades up. Past the last plate the view goes out through the frame at the gate, as
 * it came into the Lumen's tube at the start: the picture there clears, and the last screen stands
 * behind the film, seen through it, until the view is through and it is the page. The 3D does the
 * flying and says where the last screen shows (lib/reel); here the page's own last screen is put
 * there: at the size its distance makes it, and only inside the picture's outline.
 */
export default function LensView() {
  const black = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    const last = { black: '', vis: false };
    // the last screen, while it is held behind the film
    let held: HTMLElement | null = null;
    const letGo = () => {
      if (!held) return;
      const st = held.style;
      st.transform = st.transformOrigin = st.clipPath = st.opacity = '';
      held = null;
    };

    // what the view shows, decided before anything draws
    const offState = onFrame(() => {
      // halfway into the glass the screen is black: from there on the view is the film, until the way out ends
      reel.on = rig.route === 'home' && office.view >= 0.5 && reel.leave < 1;
    });

    // the page around it
    const offDom = onFrame(() => {
      const home = rig.route === 'home';
      const out = home && reel.leave >= 1;
      const v = home ? office.view : 0;
      // the way in: the black of the glass becomes the whole screen, then the film fades up out of it
      const b = !home || out ? 0 : v < 0.5 ? smoothstep(0, 0.45, v) : 1 - smoothstep(0.55, 1, v);
      const vis = b > 0.001;
      if (vis !== last.vis && black.current) {
        last.vis = vis;
        black.current.style.visibility = vis ? 'visible' : 'hidden';
      }
      const op = b.toFixed(3);
      if (black.current && last.black !== op) {
        last.black = op;
        black.current.style.opacity = op;
      }
      // the type waits for the film, and lets go of it on the way out; the last screen waits behind it
      const mode = !home || office.path <= 0 ? '' : out ? 'out' : reel.leaving ? 'zoom' : v > 0.6 ? 'full' : 'pre';
      if ((html.dataset.lens ?? '') !== mode) {
        if (mode) html.dataset.lens = mode;
        else delete html.dataset.lens;
      }

      if (mode !== 'zoom') {
        letGo();
        return;
      }
      if (!held?.isConnected) held = document.querySelector<HTMLElement>('[data-last]');
      if (!held) return;
      // the last screen where it will be at the end of the way out, seen from as far off as the
      // view still is: scaled about the view's own middle (a flat thing square to the view, so
      // this is exactly how the camera sees it)
      const at = reel.last;
      const a = anchor('contact');
      const ox = rig.vw / 2 - a.left;
      const oy = rig.vh / 2 - (a.top - lastScreenScroll());
      const st = held.style;
      st.transformOrigin = `${ox.toFixed(1)}px ${oy.toFixed(1)}px`;
      st.transform = `translate3d(${at.x.toFixed(2)}px, ${(at.y + window.scrollY - lastScreenScroll()).toFixed(2)}px, 0) scale(${at.scale.toFixed(5)})`;
      st.opacity = at.show.toFixed(3);
      // and only what the picture at the gate leaves open of it (the outline, in the screen's own px)
      const pts = reel.hole.pts;
      if (reel.hole.open) st.clipPath = 'none';
      else if (!pts.length) st.clipPath = 'inset(50%)';
      else {
        let poly = '';
        for (let i = 0; i < pts.length; i += 2) {
          const x = ox + (pts[i] - rig.vw / 2 - at.x) / at.scale;
          const y = oy + (pts[i + 1] - rig.vh / 2 - at.y) / at.scale;
          poly += `${i ? ',' : ''}${x.toFixed(1)}px ${y.toFixed(1)}px`;
        }
        st.clipPath = `polygon(${poly})`;
      }
    }, 'after');

    return () => {
      offState();
      offDom();
      letGo();
      delete html.dataset.lens;
      reel.on = false;
    };
  }, []);

  return <div ref={black} className={s.black} aria-hidden="true" />;
}
