'use client';

import { useEffect } from 'react';

/** what a copy keeps of the page's own marks: only what its styles go by */
const STYLED = new Set(['data-on', 'data-seen', 'data-state', 'data-dir', 'data-gate', 'data-rest', 'data-fit']);

let painted = false;

/**
 * The page's type over the 3D (the trades round the clock, the film's titles and buttons, the last
 * screen) is first painted in the middle of a scroll, as it comes into view: at that moment the
 * browser has to build what it draws it with (the glyphs at that size, the programs for its
 * gradients, shadows and clipped plates), and the GPU, which is also drawing the 3D, holds a few
 * frames for it. Here each of those pieces (marked data-prepaint) is painted once under the loader
 * instead: a copy of it, in every state it has, laid over the page at next to no opacity for a
 * moment and taken away again. The copies are inert and carry none of the page's own marks.
 */
export default function Prepaint() {
  useEffect(() => {
    if (painted) return;
    let host: HTMLDivElement | null = null;
    let timer = 0;
    const run = () => {
      const pieces = document.querySelectorAll<HTMLElement>('[data-prepaint]');
      if (painted || !pieces.length) return;
      painted = true;
      host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      host.inert = true;
      // (it lies over the loader, so it must not show there: the copies are painted as they are,
      // then put on the screen in black, at the least opacity there is. On the dark of the loader
      // that changes nothing; in their own bone colour the big letters of the last screen showed)
      host.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100lvh;z-index:2147483000;opacity:0.004;filter:brightness(0);pointer-events:none;overflow:hidden;contain:strict';
      // each piece twice: once laid out at rest, and once playing its way in the way it will on
      // the page (what it is drawn with on the way, part faded and moving, is not what it is drawn
      // with at rest)
      const arrive: (() => void)[] = [];
      const lay = (piece: HTMLElement, arriving: boolean) => {
        const copy = piece.cloneNode(true) as HTMLElement;
        const all = [copy, ...Array.from(copy.querySelectorAll<HTMLElement>('*'))];
        const set = (on: boolean) =>
          all.forEach((el, i) => {
            // lit and unlit plates, a trade in and its line out to it, a plate of the film in
            if (el.hasAttribute('data-seen')) el.setAttribute('data-seen', on ? '1' : '0');
            if (el.hasAttribute('data-on')) el.setAttribute('data-on', on && i % 2 ? '1' : '0');
            if (el.hasAttribute('data-state')) el.setAttribute('data-state', on ? 'in' : 'off');
            if (el.hasAttribute('data-gate')) el.setAttribute('data-gate', on ? '1' : '0');
          });
        all.forEach((el) => {
          if (el.hasAttribute('data-char')) el.style.transform = 'none';
          for (const name of el.getAttributeNames()) if ((name.startsWith('data-') && !STYLED.has(name)) || name === 'id') el.removeAttribute(name);
        });
        const cell = document.createElement('div');
        cell.style.cssText = 'position:absolute;inset:0;display:grid';
        copy.style.setProperty('--skills', '1');
        if (!arriving) set(true);
        else {
          set(false);
          // (cut to a shape, small and part faded at first, the way the last screen is seen
          // through the film's last frame; then it comes up to its place)
          cell.style.cssText += ';opacity:0.3;transform:translate3d(6px,4px,0) scale(0.6);clip-path:polygon(18% 19%,81% 21%,83% 80%,20% 78%);transition:opacity 0.7s,transform 0.7s,clip-path 0.7s';
          arrive.push(() => {
            set(true);
            cell.style.opacity = '1';
            cell.style.transform = 'none';
            cell.style.clipPath = 'polygon(0% 0%,100% 0%,100% 100%,0% 100%)';
          });
        }
        cell.append(copy);
        host!.append(cell);
      };
      pieces.forEach((piece) => {
        lay(piece, false);
        lay(piece, true);
      });
      document.body.append(host);
      // two frames on, the second copies start on their way in; then all of it is gone again
      requestAnimationFrame(() => requestAnimationFrame(() => arrive.forEach((go) => go())));
      timer = window.setTimeout(() => host?.remove(), 1600);
    };
    const fonts = document.fonts?.ready ?? Promise.resolve();
    fonts.then(() => requestAnimationFrame(run));
    return () => {
      window.clearTimeout(timer);
      host?.remove();
    };
  }, []);
  return null;
}
