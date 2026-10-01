import { CURVE, bendPointer } from '@/components/three/pipeline/shaders';
import { invLerp } from './math';

/**
 * Per-frame mutable state shared by the DOM layer and the WebGL layer.
 * Deliberately not React state: it is written once per frame by the master loop
 * and read synchronously by whoever needs it, so the 3D never lags the scroll.
 */
export type Anchor = { top: number; height: number; left: number; width: number };
/**
 * A box that CSS lays out and the 3D fits itself into: inside a pinned (sticky) section (y relative
 * to the pinned container), or in the flow of the page (`flow`, y in document px).
 */
export type Stage = { pin: string; x: number; y: number; w: number; h: number; flow: boolean; room?: boolean };

export const rig = {
  time: 0,
  dt: 1 / 60,
  frame: 0,

  /** Lenis-smoothed scroll in CSS px, and its velocity in px/s. */
  scroll: 0,
  velocity: 0,
  /** Native (unsmoothed) scroll limit. */
  limit: 1,

  vw: 1,
  vh: 1,
  dpr: 1,
  touch: false,
  reducedMotion: false,

  pointer: { x: 0, y: 0, nx: 0, ny: 0, sx: 0, sy: 0, down: false, moved: false },

  /** 0 = camera inside the tube (boot), 1 = pulled back to the hero framing. Time-driven. */
  intro: 0,
  /** Phosphor flash on ignition, decays to 0. */
  flash: 0,
  /** rig.time when the landing began (-1 before). */
  introStart: -1,
  /** The workshop lamp, 0 = off, 1 = full, flickering in between. */
  lamp: 0,
  /** The Lumen 64's lid: 0 = shut, 1 = open. */
  lidOpen: 0,
  lidV: 0,
  /** The Lumen 64's tube: 0 = off, 1 = on (it powers up with a line, like a real CRT). */
  power: 0,
  /** Scroll-driven dive into the tube: 0 = hero framing, 1 = inside. */
  dive: 0,
  /** Scroll-driven exit at the end of the page: 0 = inside, 1 = back out at the bench. */
  exit: 0,
  /** Terminal → works world cross-over on the tube, 0..1. */
  tune: 0,
  /** 0..1: how far the loading really is (downloads, uploads, compiles, the last unseen draw) */
  boot: 0,

  /** A jump the site itself is making (a link to a section): where to (document px), and until when (rig.time). */
  jump: { to: 0, until: 0 },
  /** The picture is off mid channel-change: whatever changes now simply is, nothing plays its way there. */
  dark: false,
  /** Where the landing's words end (CSS px from the left, at rest), for the hero framing to keep clear of; 0 = unknown. */
  copyRight: 0,
  /** Where the landing's words start (CSS px from the top, at rest), for the hero framing over them to keep clear of; 0 = unknown. */
  copyTop: 0,

  anchors: new Map<string, Anchor>(),
  stages: new Map<string, Stage>(),

  route: 'home' as 'home' | 'work' | 'page',
  /** CSS px → world units on the reference plane of the inner world. */
  unitsPerPx: 0.01,
};

export function anchor(id: string): Anchor {
  return rig.anchors.get(id) ?? { top: 0, height: 0, left: 0, width: 0 };
}

/** 0 when the element's top meets the viewport bottom, 1 when its bottom leaves the viewport top. */
export function sectionProgress(id: string) {
  const a = anchor(id);
  return invLerp(a.top - rig.vh, a.top + a.height, rig.scroll);
}

/** Progress through a pinned (sticky) section: 0 when pinned, 1 when released. */
export function pinProgress(id: string) {
  const a = anchor(id);
  return invLerp(a.top, a.top + a.height - rig.vh, rig.scroll);
}

/** Visibility of a section with a margin (in viewports) — cheap culling for 3D groups. */
export function sectionVisible(id: string, margin = 0.25) {
  const a = anchor(id);
  const m = rig.vh * margin;
  return rig.scroll + rig.vh > a.top - m && rig.scroll < a.top + a.height + m;
}

/**
 * World-space Y for something that should travel with a DOM element: returns the Y that keeps
 * `docY` (a document-space px coordinate) at the same screen position as the DOM would place it.
 */
export function docToWorldY(docY: number) {
  return -(docY - rig.vh / 2) * rig.unitsPerPx;
}

/** World X for a CSS px x-coordinate on the reference plane. */
export function pxToWorldX(x: number) {
  return (x - rig.vw / 2) * rig.unitsPerPx;
}

/** Centre of an anchor on the reference plane (world units). */
export function anchorCenter(id: string) {
  const a = anchor(id);
  return { x: pxToWorldX(a.left + a.width / 2), y: docToWorldY(a.top + a.height / 2), w: a.width * rig.unitsPerPx, h: a.height * rig.unitsPerPx };
}

/** Document Y of the viewport centre while a sticky element is pinned inside section `id`. */
export function pinnedDocCenter(id: string) {
  const a = anchor(id);
  const s = Math.min(Math.max(rig.scroll, a.top), a.top + Math.max(0, a.height - rig.vh));
  return s + rig.vh / 2;
}

/**
 * Where a stage box is right now, in world units on the reference plane: its centre and size.
 * Stages sit in sticky containers, so while the section is pinned they hold still, and before
 * and after it they travel with the page exactly as the DOM does.
 */
export function stageBox(id: string) {
  const st = rig.stages.get(id);
  if (!st) return null;
  let vy = st.y - rig.scroll;
  if (!st.flow) {
    const a = anchor(st.pin);
    const top = Math.min(Math.max(rig.scroll, a.top), a.top + Math.max(0, a.height - rig.vh));
    vy = top - rig.scroll + st.y;
  }
  const b = bentBox(st.x, vy, st.w, st.h);
  return { x: b.x, y: docToWorldY(rig.scroll + b.my), w: b.w, h: b.h, px: { x: st.x, y: vy, w: st.w, h: st.h } };
}

/**
 * A stage in the radio's room, in the radio's own world: the room stands beside the page and its
 * view does not scroll, so its reference plane is centred on the view.
 */
export function roomBox(id: string) {
  const st = rig.stages.get(id);
  if (!st) return null;
  const b = bentBox(st.x, st.y, st.w, st.h);
  return { x: b.x, y: -(b.my - rig.vh / 2) * rig.unitsPerPx, w: b.w, h: b.h };
}

/**
 * A box on screen (CSS px), found where the curved glass shows it: each edge is bent the same way
 * the lens pass bends the picture. Its centre x and size in world units, and its centre's y in px.
 */
function bentBox(x0: number, vy: number, w: number, h: number) {
  const st = { x: x0, w, h };
  const aspect = rig.vw / rig.vh;
  const bend = (px: number, py: number) => {
    const [bx, by] = bendPointer((px / rig.vw) * 2 - 1, 1 - (py / rig.vh) * 2, CURVE, aspect);
    return [((bx + 1) / 2) * rig.vw, ((1 - by) / 2) * rig.vh];
  };
  const cx = st.x + st.w / 2;
  const cy = vy + st.h / 2;
  const [l] = bend(st.x, cy);
  const [r] = bend(st.x + st.w, cy);
  const [, t] = bend(cx, vy);
  const [, b] = bend(cx, vy + st.h);
  const [mx, my] = bend(cx, cy);
  const u = rig.unitsPerPx;
  return { x: pxToWorldX(mx), my, w: (r - l) * u, h: (b - t) * u };
}
