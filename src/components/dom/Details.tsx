'use client';

import { useEffect } from 'react';
import { GREET, IDLE, STILL, watch, type Step } from './tabIcons';

/**
 * The small things: the tab wears the automaton's face while you are here, and calls after you
 * when you leave, a pocket watch keeping the time; developers get a hello in the console.
 */
export default function Details() {
  useEffect(() => {
    // ── a hello for whoever opens the console
    console.log(
      '%c⚙ RYHOX WORKS%c\n\nHello, curious one. Everything here is hand-built: the tube, the lens, the cabinet.\nThe source lives at https://github.com/Ryhox.',
      'font: 800 22px sans-serif; color: #c99a58; letter-spacing: .08em',
      'font: 12px monospace; color: #b3a488',
    );

    // ── the tab's icon (what it was is kept, to be put back)
    const kept = new Map<HTMLLinkElement, string>();
    const show = (href: string) => {
      for (const l of document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')) {
        if (!kept.has(l)) kept.set(l, l.href);
        if (l.href !== href) l.href = href;
      }
    };
    let timer = 0;

    // here: the face, a step at a time; whatever it was doing, it goes back to idling
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const play = (steps: Step[], i = 0) => {
      if (still) return show(STILL);
      if (i >= steps.length) return play(IDLE);
      show(steps[i][0]);
      timer = window.setTimeout(play, steps[i][1], steps, i + 1);
    };

    // elsewhere: the watch, set again as each minute turns
    const tick = () => {
      show(watch(new Date()));
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };

    // ── the tab, while you are elsewhere: its words and its icon
    let title = document.title;
    let away = false;
    const onVis = () => {
      clearTimeout(timer);
      if (document.hidden) {
        away = true;
        title = document.title;
        document.title = 'Come back, it’s still ticking';
        tick();
      } else {
        away = false;
        document.title = title;
        play(GREET);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    if (document.hidden) onVis();
    else play(IDLE);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      clearTimeout(timer);
      if (away) document.title = title;
      kept.forEach((href, l) => (l.href = href));
    };
  }, []);

  return null;
}
