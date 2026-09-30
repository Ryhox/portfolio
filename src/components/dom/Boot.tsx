'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { rig } from '@/lib/rig';
import { useApp } from '@/lib/store';
import s from './Boot.module.css';

/**
 * The loader: a mechanical odometer in the bottom-left counting to 100.
 *
 * Every drum is a Web Animation on `transform`, so the compositor turns it: the count stays
 * perfectly smooth even while the main thread is busy decoding models and compiling shaders.
 * The timeline is linear, one per cent per 1/100 of it, and the main thread steers it after the
 * real work (rig.boot): it runs to where the loading actually is and waits there, and it reads
 * 100 exactly when everything is ready.
 */
const DURATION = 7000;
const EASING = 'linear';

function onesFrames() {
  return [{ transform: 'translateY(0)' }, { transform: 'translateY(-100em)' }];
}

/** Tens drum: holds each digit, rolls over while the ones drum passes 9 → 0, like a real odometer. */
function tensFrames() {
  const f: Keyframe[] = [{ transform: 'translateY(0)', offset: 0 }];
  for (let k = 0; k < 10; k++) {
    f.push({ transform: `translateY(${-k}em)`, offset: (10 * k + 9) / 100 });
    f.push({ transform: `translateY(${-(k + 1)}em)`, offset: (10 * k + 10) / 100 });
  }
  return f;
}

function hundredsFrames() {
  return [
    { transform: 'translateY(0)', offset: 0 },
    { transform: 'translateY(0)', offset: 0.99 },
    { transform: 'translateY(-1em)', offset: 1 },
  ];
}

export default function Boot() {
  const stage = useApp((st) => st.stage);
  // the counter belongs to the machine on the home page; a case file or a legal page opens straight away
  const pathname = usePathname();
  const [home] = useState(pathname === '/');
  const [gone, setGone] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLDivElement>(null);
  const drums = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (!home) {
      rig.intro = 1;
      if (useApp.getState().stage !== 'ready') useApp.setState({ stage: 'ready' });
      return;
    }
    const [h, t, o] = drums.current;
    if (!h || !t || !o) return;
    const timing: KeyframeAnimationOptions = { duration: DURATION, easing: EASING, fill: 'forwards' };
    const anims = [h.animate(hundredsFrames(), timing), t.animate(tensFrames(), timing), o.animate(onesFrames(), timing)];
    const setRate = (r: number) => anims.forEach((a) => a.updatePlaybackRate(r));

    let quick = false;
    try {
      quick = sessionStorage.getItem('ryhox:booted') === '1';
    } catch {}
    const start = performance.now();
    const minMs = quick || rig.reducedMotion ? 300 : 900;
    let finishing = false;

    const steer = () => {
      if (finishing) return;
      const now = performance.now();
      const app = useApp.getState();
      const cur = Number(anims[0].currentTime ?? 0);
      if (app.allReady && now - start > minMs) {
        finishing = true;
        // the last few per cent in a quick roll, then away
        const remaining = Math.max(1, DURATION - cur);
        setRate(Math.max(1, remaining / 280));
        anims[0].finished.then(lift);
        return;
      }
      // run to where the loading really is (a little short of 100 until it is all done), and wait
      const target = Math.min(0.99, rig.boot) * DURATION;
      const gap = target - cur;
      setRate(gap > 1 ? Math.min(8, gap / 220) : 0);
    };
    const id = setInterval(steer, 80);

    const lift = () => {
      const a = count.current?.animate(
        [
          { transform: 'none', opacity: 1, filter: 'blur(0px)' },
          { transform: 'translateY(-26px)', opacity: 0, filter: 'blur(8px)' },
        ],
        { duration: 380, delay: 60, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'forwards' },
      );
      const go = () => {
        try {
          sessionStorage.setItem('ryhox:booted', '1');
        } catch {}
        useApp.getState().setStage('intro');
        root.current?.setAttribute('data-out', '1');
        setTimeout(() => setGone(true), 700);
      };
      if (a) a.onfinish = go;
      else go();
    };

    // never hold the content hostage
    const bail = setTimeout(() => {
      if (useApp.getState().stage === 'boot') {
        rig.intro = 1;
        useApp.setState({ stage: 'ready', glReady: true, benchReady: true, allReady: true });
      }
    }, 25000);

    return () => {
      clearInterval(id);
      clearTimeout(bail);
      anims.forEach((a) => a.cancel());
    };
  }, []);

  if (!home || gone || stage === 'ready') return null;

  const strip = (chars: string[]) => chars.map((c, i) => <span key={i}>{c || ' '}</span>);
  const ones = Array.from({ length: 101 }, (_, i) => String(i % 10));
  const tens = Array.from({ length: 11 }, (_, i) => String(i % 10));

  return (
    <div ref={root} className={`boot ${s.boot}`} aria-hidden="true">
      <div ref={count} className={s.count}>
        {[strip(['', '1']), strip(tens), strip(ones)].map((content, i) => (
          <span key={i} className={s.window}>
            <span
              className={s.drum}
              ref={(el) => {
                drums.current[i] = el;
              }}
            >
              {content}
            </span>
          </span>
        ))}
        <span className={s.pct}>%</span>
      </div>
    </div>
  );
}
