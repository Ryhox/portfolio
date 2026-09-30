'use client';

import { useEffect } from 'react';

/** While the tab is elsewhere: a pocket watch, still going, in place of the cog. */
const AWAY_ICON = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1d196"/><stop offset="1" stop-color="#9c6a33"/></linearGradient></defs>
  <rect width="64" height="64" rx="14" fill="#120d08"/>
  <rect x="28" y="5" width="8" height="7" rx="2" fill="url(#b)"/>
  <circle cx="32" cy="36" r="22" fill="url(#b)"/>
  <circle cx="32" cy="36" r="17.5" fill="#ebe1cb"/>
  <path d="M32 36V24M32 36l8 5" stroke="#120d08" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="32" cy="36" r="2.6" fill="#120d08"/>
</svg>`)}`;

/** The small things: the tab calls after you when you leave; developers get a hello in the console. */
export default function Details() {
  useEffect(() => {
    // ── a hello for whoever opens the console
    console.log(
      '%c⚙ RYHOX WORKS%c\n\nHello, curious one. Everything here is hand-built: the tube, the lens, the cabinet.\nThe source lives at https://github.com/Ryhox. Try typing in the terminal on the landing page.',
      'font: 800 22px sans-serif; color: #c99a58; letter-spacing: .08em',
      'font: 12px monospace; color: #b3a488',
    );

    // ── the tab, while you are elsewhere: its words and its icon
    let title = document.title;
    const icons = new Map<HTMLLinkElement, string>();
    const onVis = () => {
      const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
      if (document.hidden) {
        title = document.title;
        document.title = 'Come back, it’s still ticking';
        for (const l of links) {
          icons.set(l, l.href);
          l.href = AWAY_ICON;
        }
      } else {
        document.title = title;
        icons.forEach((href, l) => (l.href = href));
        icons.clear();
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      icons.forEach((href, l) => (l.href = href));
    };
  }, []);

  return null;
}
