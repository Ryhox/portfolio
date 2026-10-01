import { projects } from '@/content/projects';
import { getLenis } from './loop';
import { clamp, smoothstep } from './math';
import { anchor, rig } from './rig';

/** The plates on the film: every project, then "And much more". */
export const PLATES = projects.length + 1;

/** What a button under the picture does to it while the pointer is on it. */
export type Fx = '' | 'demo' | 'code' | 'none';

/** How quickly the film eases to the frame it is sent to (per second). */
const EASE = 5.5;

/**
 * Inside the old camera: the works on an endless spiral of film. Written once per frame (by the
 * master loop, before anything draws) and read by the DOM and the 3D.
 *
 * The scroll only says which frame belongs at the gate; the film then eases there by itself, all
 * the way, so it never stops between two frames. The knobs loop (past the last plate the film
 * winds on to the first) though the scroll does not: the page jumps back to the first plate, and
 * the film is carried on by a whole turn of the plates instead (`offset`).
 *
 * Past the last plate the scroll takes the view out: into the frame at the gate, as into the
 * Lumen's tube at the start, and through it onto the last screen, which stands behind the film
 * (`leave`; the 3D does the flying and says where the page's last screen shows, see `hole`, `last`).
 */
export const reel = {
  /** the film is what the view shows: the 3D draws it instead of the office or the inner world (written by the lens view) */
  on: false,
  /** the loop is built (it loads with the office, after the page is up) */
  loaded: false,
  /** the plate at the gate */
  plate: 0,
  /** whole turns of the plates the knobs have carried the film on (or back) past the ends */
  offset: 0,
  /** where the film is going (plate + offset), and where it is drawn, easing toward it */
  pos: 0,
  display: 0,
  /** the film stands still at the gate */
  resting: true,
  /** the button the pointer is on: it changes the picture at the gate; and the address it goes to */
  fx: '' as Fx,
  address: '',
  /**
   * the frame at the gate, on screen in CSS px, as the curved glass shows it (written by the 3D):
   * the picture's box, its corners (the strip climbs, so its top and bottom slope while its sides
   * stay upright), and the bottom of the film under it
   */
  gate: { left: 0, top: 0, right: 0, bottom: 0, tl: [0, 0], tr: [0, 0], bl: [0, 0], br: [0, 0], film: 0, ok: false },
  /** 0..1: the way out, over the section's last stretch: into the frame at the gate and through it; 1 = on the last screen */
  leave: 0,
  /** under way: the page's type has let go of the film, and the last screen shows behind it */
  leaving: false,
  /** 0..1, once through the frame: the dark inside of the camera gives way to the inner world the last screen lies on */
  world: 0,
  /**
   * the picture at the gate as the opening the last screen is seen through while leaving (written
   * by the 3D): its outline on screen in CSS px (x, y, x, y, …), as the curved glass shows it;
   * `open` once it is wider than the whole view
   */
  hole: { pts: [] as number[], open: false },
  /**
   * the last screen, standing behind the film, as the leaving view sees it (written by the 3D): how
   * big (1 = arrived), where its middle is (CSS px from the view's middle), and how much of it
   * shows through the picture as that clears
   */
  last: { scale: 1, x: 0, y: 0, show: 0 },
};

let primed = false;

/**
 * The Works section's pinned scroll (document px): the plates' stretch from `top`, then the way
 * out, `run` long, up to `end`, where the last screen is.
 */
function stretch() {
  const a = anchor('works');
  // (a phone's toolbar can leave the page a little short of the section's own end)
  const end = Math.min(a.top + a.height - rig.vh, rig.limit > a.top ? rig.limit : Infinity);
  const run = Math.min(anchor('leave').height, Math.max(0, end - a.top - 1));
  return { top: a.top, plates: end - run - a.top, run, end };
}

/** The scroll at which the last screen (Say Hi) shows: the end of the way out. */
export function lastScreenScroll() {
  return stretch().end;
}

export function updateReel() {
  if (rig.route !== 'home' || !rig.anchors.has('works')) {
    primed = false;
    reel.leave = 0;
    reel.leaving = false;
    reel.world = 0;
    return;
  }
  const st = stretch();
  // the scroll picks the plate: each has an equal stretch of the section, changing half-way
  const x = clamp((rig.scroll - st.top) / st.plates) * (PLATES - 1);
  // and past the last one, how far out the view is (with no way out laid, it is simply out at the end)
  const out = st.run > 0 ? clamp((rig.scroll - (st.end - st.run)) / st.run) : rig.scroll >= st.end ? 1 : 0;
  reel.leave = out > 0.998 ? 1 : out;
  reel.leaving = reel.leave > 0.02 && reel.leave < 1;
  reel.world = smoothstep(0.64, 0.96, reel.leave);
  reel.plate = Math.min(PLATES - 1, Math.max(0, Math.round(x)));
  reel.pos = reel.plate + reel.offset;
  if (!primed) {
    primed = true;
    reel.display = reel.pos;
  }
  const gap = reel.pos - reel.display;
  reel.display = Math.abs(gap) < 1e-4 ? reel.pos : reel.display + gap * (1 - Math.exp(-rig.dt * EASE));
  reel.resting = Math.abs(reel.pos - reel.display) < 0.02;
}

/** Put the film straight at the gate's plate on the next frame, with no easing (a page coming back). */
export function settleReel() {
  primed = false;
}

/**
 * Wind the film on (or back) by some frames, as the knobs, the arrow keys and a click on a frame
 * do. The page goes straight to the plate's place (it is pinned, so only the film shows the
 * change) and the film eases there. Past either end it loops: the page goes to the plate at the
 * other end, and the film simply turns on to it.
 */
export function wind(delta: number) {
  if (!delta) return;
  const target = reel.plate + delta;
  const to = ((target % PLATES) + PLATES) % PLATES;
  reel.offset += target - to;
  goTo(to);
}

/** Send the film straight to a plate (the page jumps to its place; the film eases there). */
export function goTo(i: number) {
  const lenis = getLenis();
  if (!lenis) return;
  const n = Math.max(0, Math.min(PLATES - 1, i));
  lenis.scrollTo(plateScroll(n), { immediate: true, force: true });
}

/** The scroll (document px) in the middle of a plate's stretch of the section. */
export function plateScroll(i: number) {
  const st = stretch();
  const n = PLATES - 1;
  const x = i <= 0 ? 0.2 : i >= n ? n - 0.2 : i;
  return st.top + (x / n) * st.plates;
}
