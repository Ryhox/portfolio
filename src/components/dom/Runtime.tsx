'use client';

import Lenis from 'lenis';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { chapters, type ChapterId } from '@/content/sections';
import { onFrame, setLenis, startLoop, stopLoop, getLenis } from '@/lib/loop';
import { office } from '@/lib/office';
import { perf } from '@/lib/perf';
import { reel } from '@/lib/reel';
import { rig } from '@/lib/rig';
import { audio } from '@/audio/engine';
import { useApp } from '@/lib/store';
import { channelSwitch } from '@/lib/transition';

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

/**
 * The large viewport (the height with the phone's toolbar tucked away). The canvas is this tall
 * and so are the pinned sections, so the picture does not jump when the toolbar comes and goes.
 */
let probe: HTMLDivElement | null = null;
function largeViewport() {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100vh;height:100lvh;visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
  }
  return Math.max(window.innerHeight, probe.offsetHeight || 0);
}

function measure() {
  // while the channel-change squeezes the picture, nothing measures true: it is measured once it ends
  const cl = document.documentElement.classList;
  if (cl.contains('crt-off') || cl.contains('crt-on')) return;
  // the page is moved aside while the view swings to the radio, and the last screen is held behind
  // the film on the way out of the projects: they are measured where they stand
  const moved = [document.getElementById('main'), document.querySelector<HTMLElement>('[data-last]')]
    .filter((el): el is HTMLElement => !!el?.style.transform)
    .map((el) => [el, el.style.transform] as const);
  for (const [el] of moved) el.style.transform = '';
  measureAll();
  for (const [el, t] of moved) el.style.transform = t;
}

function measureAll() {
  rig.vw = document.documentElement.clientWidth || window.innerWidth;
  rig.vh = largeViewport();
  rig.dpr = Math.min(window.devicePixelRatio || 1, 2);
  rig.anchors.clear();
  const y = window.scrollY;
  document.querySelectorAll<HTMLElement>('[data-anchor]').forEach((el) => {
    const r = el.getBoundingClientRect();
    rig.anchors.set(el.dataset.anchor!, { top: r.top + y, height: r.height, left: r.left, width: r.width });
  });
  rig.stages.clear();
  document.querySelectorAll<HTMLElement>('[data-stage]').forEach((el) => {
    // a stage in the radio's room (which stands beside the page, not on it) is kept relative to the room
    const room = el.closest<HTMLElement>('[data-room]');
    if (room) {
      const r = el.getBoundingClientRect();
      const rr = room.getBoundingClientRect();
      rig.stages.set(el.dataset.stage!, { pin: '', x: r.left - rr.left, y: r.top - rr.top, w: r.width, h: r.height, flow: false, room: true });
      return;
    }
    // a stage inside a pinned container is kept relative to it; anywhere else (or where the layout
    // has unpinned it, as narrow screens do) it simply scrolls with the document
    const sticky = el.closest<HTMLElement>('[data-sticky]');
    const pinned = !!sticky && getComputedStyle(sticky).position === 'sticky';
    const r = el.getBoundingClientRect();
    if (pinned) {
      const t = sticky.getBoundingClientRect().top;
      rig.stages.set(el.dataset.stage!, { pin: el.dataset.pin ?? '', x: r.left, y: r.top - t, w: r.width, h: r.height, flow: false });
    } else rig.stages.set(el.dataset.stage!, { pin: '', x: r.left, y: r.top + y, w: r.width, h: r.height, flow: true });
  });
  // where the landing's words end, at rest (the shift they take as the camera dives, taken back out)
  const title = document.getElementById('hero-title');
  rig.copyRight = 0;
  if (title?.parentElement) {
    // the words themselves, not their boxes (the wordmark's box runs the full width)
    const range = document.createRange();
    const walk = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
    let right = 0;
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent?.trim()) continue;
      range.selectNodeContents(n);
      right = Math.max(right, range.getBoundingClientRect().right);
    }
    const t = getComputedStyle(title.parentElement).transform;
    const shift = t && t !== 'none' ? new DOMMatrixReadOnly(t).m41 : 0;
    if (right > 0) rig.copyRight = right - shift;
  }
}

/** Owns Lenis, the master loop, pointer tracking and DOM anchor measurement. */
export default function Runtime() {
  const pathname = usePathname();

  useEffect(() => {
    history.scrollRestoration = 'manual';
    rig.touch = matchMedia('(hover: none), (pointer: coarse)').matches;
    rig.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Crawlers and machines without WebGL get the content straight away — no boot sequence.
    const html = document.documentElement;
    const bot = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|google-inspectiontool/i.test(
      navigator.userAgent,
    );
    const webgl = hasWebGL();
    if (!webgl) html.dataset.nogl = '1';
    if (bot || !webgl) {
      rig.intro = 1;
      useApp.setState({ stage: 'ready', glReady: true, benchReady: true, allReady: true, progress: 1 });
    }
    html.dataset.stage = useApp.getState().stage;
    const unsubStage = useApp.subscribe((st, prev) => {
      if (html.dataset.stage !== st.stage) html.dataset.stage = st.stage;
      // the camera normally releases the page; if WebGL never took over, release it anyway
      if (st.stage === 'intro' && prev.stage !== 'intro') {
        setTimeout(() => {
          if (useApp.getState().stage === 'intro') {
            rig.intro = 1;
            useApp.getState().setStage('ready');
          }
        }, 4500);
      }
    });

    const lenis = new Lenis({
      autoRaf: false,
      lerp: rig.reducedMotion ? 1 : 0.085,
      wheelMultiplier: 0.95,
      touchMultiplier: 1,
      smoothWheel: true,
      syncTouch: false,
    });
    setLenis(lenis);
    if (useApp.getState().stage !== 'ready') lenis.stop();
    if (process.env.NODE_ENV !== 'production' || location.search.includes('qa')) {
      Object.assign(window, { __lenis: lenis, __app: useApp, __rig: rig, __perf: perf, __office: office });
    }

    const onPointer = (e: PointerEvent) => {
      const p = rig.pointer;
      p.x = e.clientX;
      p.y = e.clientY;
      p.nx = (e.clientX / rig.vw) * 2 - 1;
      p.ny = -((e.clientY / Math.min(rig.vh, window.innerHeight)) * 2 - 1);
      p.moved = true;
    };
    const onDown = () => (rig.pointer.down = true);
    const onUp = () => (rig.pointer.down = false);
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });

    let queued = false;
    const remeasure = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        measure();
        getLenis()?.resize();
      });
    };
    const ro = new ResizeObserver(remeasure);
    ro.observe(document.body);
    window.addEventListener('resize', remeasure);
    document.fonts?.ready.then(remeasure);
    measure();

    // Chapter tracking: which chapter owns the middle of the viewport.
    let current: ChapterId = useApp.getState().chapter;
    const off = onFrame(() => {
      if (rig.route !== 'home') return;
      const probe = rig.scroll + rig.vh * 0.5;
      let found: ChapterId = 'top';
      for (const c of chapters) {
        const a = rig.anchors.get(c.id);
        // the last screen lies under the Works section's film: it is only reached once that lets go
        if (a && probe >= a.top + (c.id === 'contact' ? rig.vh * 0.5 : 0)) found = c.id;
      }
      // (or once the view is through the last frame, on its way to it)
      if (reel.world > 0.5 && rig.anchors.has('contact')) found = 'contact';
      if (rig.dive < 0.98 && found !== 'top' && rig.exit === 0) found = 'top';
      if (found !== current) {
        current = found;
        useApp.getState().setChapter(found);
        document.documentElement.dataset.chapter = found;
      }
    });

    const unsub = useApp.subscribe((s, prev) => {
      if (s.sound !== prev.sound) audio.setEnabled(s.sound);
      const l = getLenis();
      if (!l) return;
      const locked = s.stage !== 'ready' || s.menuOpen || s.switching || s.radio;
      const wasLocked = prev.stage !== 'ready' || prev.menuOpen || prev.switching || prev.radio;
      if (locked && !wasLocked) l.stop();
      if (!locked && wasLocked) l.start();
    });

    startLoop();
    return () => {
      off();
      unsub();
      unsubStage();
      ro.disconnect();
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('resize', remeasure);
      stopLoop();
      lenis.destroy();
      setLenis(null);
    };
  }, []);

  useEffect(() => {
    rig.route = pathname === '/' ? 'home' : pathname.startsWith('/work/') ? 'work' : 'page';
    requestAnimationFrame(() => {
      measure();
      getLenis()?.resize();
      channelSwitch.arrived(pathname);
    });
  }, [pathname]);

  return null;
}
