import type Lenis from 'lenis';
import { rig } from './rig';
import { invLerp } from './math';
import { updateOffice } from './office';
import { updateRadio } from './radio';
import { updateReel } from './reel';
import { frameCpu, frameStart, gpuBegin, gpuEnd, perf, phaseEnd } from './perf';

/**
 * The master clock. One requestAnimationFrame drives, in order:
 *   1. Lenis (scroll integration)
 *   2. rig bookkeeping (dive/exit progress, pointer smoothing)
 *   3. "before" subscribers (DOM reads)
 *   4. the WebGL frame
 *   5. "after" subscribers (DOM writes that mirror 3D state)
 * Everything visual therefore agrees on the same scroll value within a frame.
 */
type Tick = (time: number, dt: number) => void;

const before = new Set<Tick>();
const after = new Set<Tick>();
let render: ((timestampMs: number) => void) | null = null;
let lenis: Lenis | null = null;
let raf = 0;
let last = 0;
let running = false;

export const setLenis = (l: Lenis | null) => {
  lenis = l;
};
export const getLenis = () => lenis;

export const setRender = (fn: ((timestampMs: number) => void) | null) => {
  render = fn;
};

export function onFrame(fn: Tick, phase: 'before' | 'after' = 'before') {
  const set = phase === 'before' ? before : after;
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

function updateJourney() {
  const dive = rig.anchors.get('dive');
  if (dive) rig.dive = invLerp(0, dive.top + dive.height - rig.vh, rig.scroll);
  else if (rig.route !== 'home') rig.dive = 1;

  const exit = rig.anchors.get('exit');
  rig.exit = exit ? invLerp(exit.top - rig.vh, exit.top + exit.height - rig.vh, rig.scroll) : 0;
  updateOffice();
  updateReel();
  updateRadio();
}

function frame(now: number) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0.0001, (now - (last || now)) / 1000));
  frameStart(now, last ? now - last : 16.7);
  last = now;
  rig.time = now / 1000;
  rig.dt = dt;
  rig.frame++;

  if (lenis) {
    lenis.raf(now);
    rig.scroll = lenis.animatedScroll;
    rig.velocity = lenis.velocity * 60;
    rig.limit = lenis.limit;
  } else {
    rig.scroll = window.scrollY;
    rig.velocity = 0;
  }

  const p = rig.pointer;
  const k = 1 - Math.exp(-6 * dt);
  p.sx += (p.nx - p.sx) * k;
  p.sy += (p.ny - p.sy) * k;

  updateJourney();
  phaseEnd('scroll');

  before.forEach((fn) => fn(rig.time, dt));
  phaseEnd('before');
  gpuBegin();
  render?.(now);
  gpuEnd();
  phaseEnd('render');
  after.forEach((fn) => fn(rig.time, dt));
  phaseEnd('after');
  if (perf.record) {
    const i = perf.i;
    perf.record.push({
      t: now,
      ms: perf.interval[i],
      cpu: frameCpu(),
      gpu: perf.gpu[i],
      scroll: rig.scroll,
      chapter: document.documentElement.dataset.chapter ?? '',
      ph: [perf.phases.scroll[i], perf.phases.before[i], perf.phases.render[i], perf.phases.after[i]],
    });
  }
}

export function startLoop() {
  if (running) return;
  running = true;
  last = 0;
  raf = requestAnimationFrame(frame);
}

export function stopLoop() {
  running = false;
  cancelAnimationFrame(raf);
}
