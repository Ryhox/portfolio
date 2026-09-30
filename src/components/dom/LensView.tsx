'use client';

import { useEffect, useRef } from 'react';
import { sfx } from '@/audio/sfx';
import { getLenis, onFrame } from '@/lib/loop';
import { smoothstep } from '@/lib/math';
import { office } from '@/lib/office';
import { reel } from '@/lib/reel';
import { anchor, rig } from '@/lib/rig';
import s from './LensView.module.css';

/** The beats of a snap (seconds): the shutter falls, holds dark, then the flash fades onto what is next. */
const SHUT = 0.07;
const HOLD = 0.06;
const FLASH = 0.55;

/**
 * The way into the old camera and out of it. The office camera goes into the black of the lens,
 * the screen is black, and behind the black the view changes to the loop of film inside (the 3D
 * reel), which fades up. The moment the Works section ends, with the film still up, the shutter
 * snaps (dark, a flash) onto the last screen lying underneath; the page holds still while it does.
 * Scrolling back snaps back.
 */
export default function LensView() {
  const black = useRef<HTMLDivElement>(null);
  const shutter = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    // the film is in (not snapped away); unknown until the first frame, which never snaps
    let shown: boolean | null = null;
    let snap: { t0: number; to: boolean; swapped: boolean } | null = null;
    // the page is held still for a snap
    let locked = false;
    let shutA = 0;
    let flashA = 0;
    const release = () => {
      if (!locked) return;
      locked = false;
      getLenis()?.start();
    };
    const last = { black: '', shut: '', flash: '', vis: false };
    const set = (el: HTMLElement | null, key: 'black' | 'shut' | 'flash', v: string) => {
      if (!el || last[key] === v) return;
      last[key] = v;
      el.style.opacity = v;
    };

    // what the view shows, decided before anything draws
    const offState = onFrame(() => {
      const home = rig.route === 'home';
      const now = rig.time;
      const want = !office.out;
      if (shown === null || !home) {
        shown = want;
        snap = null;
        release();
      }
      if (!snap && shown !== want) {
        // (with the picture off for a channel change, the other side is simply there)
        if (rig.reducedMotion || rig.dark) shown = want;
        else {
          snap = { t0: now, to: want, swapped: false };
          sfx.shutter();
          // a snap is a moment: the page holds still for it (unless the page is only passing
          // through, on its way somewhere further off, like a link to another section)
          const l = getLenis();
          const w = anchor('works');
          const passing = rig.time < rig.jump.until && Math.abs(rig.jump.to - (w.top + w.height - rig.vh)) > rig.vh;
          if (l && !passing) {
            l.stop();
            locked = true;
          }
        }
      }

      // the snap: the shutter falls, what is behind it changes, and the flash fades onto it
      shutA = 0;
      flashA = 0;
      if (snap) {
        const e = now - snap.t0;
        const o = e - SHUT - HOLD;
        if (!snap.swapped && e >= SHUT) {
          shown = snap.to;
          snap.swapped = true;
          // behind the shutter, the last screen is set exactly in place
          if (locked && !snap.to) {
            const w = anchor('works');
            getLenis()?.scrollTo(w.top + w.height - rig.vh + 1, { immediate: true, force: true });
          }
        }
        shutA = o < 0 ? smoothstep(0, SHUT, e) : 0;
        flashA = o < 0 ? 0 : 0.9 * (1 - smoothstep(0, FLASH, o));
        if (o > FLASH) {
          snap = null;
          release();
        }
      }
      // halfway into the glass the screen is black: from there on the view is the film
      reel.on = home && !!shown && office.view >= 0.5;
    });

    // the page around it
    const offDom = onFrame(() => {
      const home = rig.route === 'home';
      const v = home ? office.view : 0;
      // the way in: the black of the glass becomes the whole screen, then the film fades up out of it
      const b = !home || !shown ? 0 : v < 0.5 ? smoothstep(0, 0.45, v) : 1 - smoothstep(0.55, 1, v);
      const vis = b > 0.001;
      if (vis !== last.vis && black.current) {
        last.vis = vis;
        black.current.style.visibility = vis ? 'visible' : 'hidden';
      }
      set(black.current, 'black', b.toFixed(3));
      // the type waits for the film, and the last screen for the snap
      const mode = !home || office.path <= 0 ? '' : !shown ? 'out' : v > 0.6 ? 'full' : 'pre';
      if ((html.dataset.lens ?? '') !== mode) {
        if (mode) html.dataset.lens = mode;
        else delete html.dataset.lens;
      }
      set(shutter.current, 'shut', shutA.toFixed(3));
      set(flash.current, 'flash', flashA.toFixed(3));
    }, 'after');

    return () => {
      offState();
      offDom();
      release();
      delete html.dataset.lens;
      reel.on = false;
    };
  }, []);

  return (
    <>
      <div ref={black} className={s.black} aria-hidden="true" />
      <div ref={shutter} className={s.shutter} aria-hidden="true" />
      <div ref={flash} className={s.flash} aria-hidden="true" />
    </>
  );
}
