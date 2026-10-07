import { getLenis } from './loop';
import { lastScreenScroll, plateScroll, reel, settleReel } from './reel';
import { rig } from './rig';
import { useApp } from './store';
import { sfx } from '@/audio/sfx';
import { projects } from '@/content/projects';

const OFF_MS = 560;
const ON_MS = 720;
/** the least the tube stays dark between the two: long enough for the spot it leaves behind to be seen going out */
const DARK_MS = 170;

let pending: ((path: string) => void) | null = null;
/** the path the site is on (to know, on arriving, where it came from) */
let at = typeof location === 'undefined' ? '/' : location.pathname;

/**
 * Where the home page was left for a case file: the exact scroll, and where the film's loop was.
 * Coming back (the case file's "All projects", the bar's "Projects", or the browser's back) lands
 * on that very spot; if another case file was paged to in between, on that project's frame.
 */
type Spot = { scroll: number; offset: number; plate: number };
const SPOT = 'ryhox:spot';
let spot: Spot | null = null;

function remember() {
  spot = { scroll: getLenis()?.scroll ?? window.scrollY, offset: reel.offset, plate: reel.plate };
  try {
    sessionStorage.setItem(SPOT, JSON.stringify(spot));
  } catch {}
}

function restore(from: string) {
  if (!spot) {
    try {
      const v = sessionStorage.getItem(SPOT);
      if (v) spot = JSON.parse(v) as Spot;
    } catch {}
  }
  const lenis = getLenis();
  if (!spot || !lenis) return false;
  const i = projects.findIndex((p) => `/work/${p.slug}` === from);
  reel.offset = spot.offset;
  lenis.scrollTo(i >= 0 && i !== spot.plate ? plateScroll(i) : spot.scroll, { immediate: true, force: true });
  // the film is simply there, not wound to it
  settleReel();
  return true;
}

function layers() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-screen-layer]'));
}

function setOrigin() {
  const main = document.getElementById('main');
  if (main) main.style.transformOrigin = `50% ${window.scrollY + window.innerHeight / 2}px`;
}

function play(cls: 'crt-off' | 'crt-on', ms: number) {
  const html = document.documentElement;
  html.classList.remove('crt-off', 'crt-on', 'crt-dark');
  void html.offsetWidth;
  html.classList.add(cls);
  return new Promise<void>((res) => setTimeout(res, ms));
}

function pulseTune(ms: number, peak: number) {
  const start = performance.now();
  const step = () => {
    const k = (performance.now() - start) / ms;
    rig.tune = k >= 1 ? 0 : Math.sin(Math.min(1, k) * Math.PI) * peak;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const frames = (n: number) =>
  new Promise<void>((res) => {
    const step = () => (--n <= 0 ? res() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

const wait = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

/**
 * What a tube leaves behind when it is switched off: the spot in the middle of the glass, still
 * lit for a moment after the picture has gone, shrinking as it fades (the element is CrtGlass's).
 */
function afterglow() {
  if (rig.reducedMotion) return;
  document.querySelector<HTMLElement>('[data-crt-spot]')?.animate(
    [
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0.55, transform: 'scale(0.7)', offset: 0.3 },
      { opacity: 0, transform: 'scale(0.25)' },
    ],
    { duration: 520, easing: 'cubic-bezier(0.2, 0.5, 0.3, 1)' },
  );
}

/** The tube collapses to a line, then a point, and is dark. */
async function powerOff() {
  const st = useApp.getState();
  st.setSwitching(true);
  st.setMenuOpen(false);
  sfx.powerOff();
  setOrigin();
  pulseTune(OFF_MS, 0.6);
  await play('crt-off', OFF_MS);
  // collapsed to nothing: now simply off, and no longer squeezed, so the page behind measures true
  document.documentElement.classList.replace('crt-off', 'crt-dark');
  rig.dark = true;
  afterglow();
}

/** The picture comes back on wherever the page now is. */
async function powerOn() {
  rig.dark = false;
  setOrigin();
  sfx.powerOn();
  pulseTune(ON_MS, 0.45);
  await play('crt-on', ON_MS);
  document.documentElement.classList.remove('crt-on');
  for (const l of layers()) l.style.removeProperty('transform-origin');
  // anything that asked to be measured while the picture was squeezed is measured now
  window.dispatchEvent(new Event('resize'));
  useApp.getState().setSwitching(false);
}

/** Where a part of the home page is, as a scroll. */
function placeOf(target: string) {
  const el = document.querySelector<HTMLElement>(target);
  const top = el ? el.getBoundingClientRect().top + window.scrollY : 0;
  // Say Hi stands behind the film: it is where the way out through the last frame ends
  if (target === '#contact' && rig.anchors.has('works')) return Math.min(getLenis()?.limit ?? top, Math.max(top, lastScreenScroll()));
  return top;
}

export const channelSwitch = {
  async go(url: string, navigate: (url: string) => void) {
    if (useApp.getState().switching) return;
    const from = at;
    if (rig.route === 'home') remember();
    await powerOff();
    const dark = wait(DARK_MS);

    const arrived = new Promise<void>((res) => {
      pending = () => res();
      setTimeout(res, 4000);
    });
    navigate(url);
    await arrived;
    pending = null;

    const [path, hash] = url.split('#');
    const lenis = getLenis();
    window.scrollTo(0, 0);
    lenis?.scrollTo(0, { immediate: true, force: true });
    await frames(2);
    // back from a case file to the projects: exactly where the page was left
    const back = (path || '/') === '/' && hash === 'projects' && from.startsWith('/work/') && restore(from);
    if (hash && !back && lenis && document.getElementById(hash)) {
      settleReel();
      lenis.scrollTo(placeOf(`#${hash}`), { immediate: true, force: true });
      await frames(2);
    }
    await dark;
    await powerOn();
  },

  /**
   * Somewhere on this same page (the bar's parts, the maker's mark): the tube switches off, the
   * page is simply there behind the dark, and the picture comes back on. Nothing scrolls its way.
   */
  async cut(target: string | null) {
    const lenis = getLenis();
    if (useApp.getState().switching || !lenis) return;
    if (target && !document.querySelector(target)) return;
    await powerOff();
    const top = target ? placeOf(target) : 0;
    rig.jump.to = top;
    rig.jump.until = rig.time + 0.5;
    lenis.scrollTo(top, { immediate: true, force: true });
    // the film is simply at its frame, and whatever eases toward the scroll gets there unseen
    settleReel();
    await Promise.all([frames(4), wait(DARK_MS)]);
    await powerOn();
  },

  /** Called by the route watcher once the new page is in the DOM (and measured). */
  arrived(path: string) {
    const from = at;
    at = path;
    if (pending) {
      pending(path);
      return;
    }
    // the browser's own back (or forward) to the home page: no channel change ran, so the spot
    // the page was left at is put back here
    if (path === '/' && from.startsWith('/work/')) restore(from);
  },
};
