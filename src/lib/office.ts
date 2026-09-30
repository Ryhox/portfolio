import * as THREE from 'three';
import { clamp, invLerp, smoothstep } from './math';
import { anchor, pinProgress, rig } from './rig';

/**
 * The journey through the office, written once per frame (by the master loop, before anything
 * draws) and read by the DOM and all three worlds:
 *
 *   About ends ─► the camera dives into the clock's hub, which opens onto the office (portal)
 *   Office     ─► the camera crosses the room, through the word hanging in it, to the old camera
 *                 lying on the desk, then goes into its lens until the black glass is all there is
 *   Works      ─► inside the camera: the works on a loop of film (lib/reel), wound on by the scroll
 *   Say Hi     ─► lies under the film; as the Works section ends, the shutter snaps (dark, a
 *                 flash) with the film still up, and the last screen is there
 */
export const office = {
  /** 0..1: the dive into the hub, over the last stretch of the About section */
  zoom: 0,
  /** 0..1: the flight across the room, from the About's end to the Works section's start */
  path: 0,
  /** 0..1: the end of the flight: into the black of the glass, then the first film fades up */
  view: 0,
  /** past the Works section: the shutter snaps the films away (and back, scrolling up) */
  out: false,
  /** 0..1: how much of the office shows (through the portal while it opens) */
  mix: 0,
  /** the portal in scene uv, written by the inner world's camera: centre x, y, radius (fraction of height) */
  portal: [0.5, 0.5, 0] as [number, number, number],
  /** the clock's hub in the inner world, written by the About's 3D, and its radius */
  hub: new THREE.Vector3(),
  hubR: 0.3,
  hubReady: false,
  /** written by the office scene: its sun (for the beams), the room's inside, and the camera's lens */
  sun: null as THREE.DirectionalLight | null,
  room: new THREE.Box3(),
  /** the office's models and surfaces have arrived and it is built (it loads after the page is up) */
  loaded: false,
  /** the sun's shadow map is static: redrawn only when something asks */
  shadowDirty: true,
  /** the lens glass: its middle, the way it looks, its radius, and the camera body's size (metres) */
  lens: { center: new THREE.Vector3(), normal: new THREE.Vector3(), radius: 0.02, body: new THREE.Vector2(0.34, 0.3), ready: false },
  /** the office fills the whole view: the inner world need not be drawn at all */
  get full() {
    return this.mix >= 1 && this.portal[2] > 1.2;
  },
};

/** where in the About's pinned scroll the dive begins */
export const ZOOM_FROM = 0.72;
/** where in the office flight the camera stops crossing the room and goes into the screen */
export const APPROACH = 0.68;
/** how far past the Works section's end (in viewports) the shutter snaps, and how far back undoes it */
const SNAP_AT = 0.005;
const SNAP_BACK = 0.12;

/** The scroll at which the last screen (Say Hi) shows: just past where the shutter snaps the films away. */
export function lastScreenScroll() {
  const w = anchor('works');
  return w.top + w.height - rig.vh + Math.ceil(rig.vh * SNAP_AT * 2) + 1;
}

export function updateOffice() {
  if (rig.route !== 'home') {
    office.zoom = 0;
    office.mix = 0;
    office.path = 0;
    office.view = 0;
    office.out = false;
    return;
  }
  office.zoom = smoothstep(ZOOM_FROM, 1, pinProgress('maker'));
  const o = anchor('office');
  const w = anchor('works');
  office.path = clamp(invLerp(o.top - rig.vh, w.top, rig.scroll));
  office.view = smoothstep(0.92, 1, office.path);
  // the snap is a moment, not a scrub: it fires the moment the films' section lets go
  if (rig.anchors.has('works')) {
    const past = (rig.scroll - (w.top + w.height - rig.vh)) / rig.vh;
    if (!office.out && past > SNAP_AT) office.out = true;
    else if (office.out && past < -SNAP_BACK) office.out = false;
  }
  // the office shows from the moment the hub starts to open until the films cover it
  office.mix = office.zoom > 0.001 && office.view < 1 ? 1 : 0;
}
