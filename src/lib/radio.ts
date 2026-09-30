import { easeInOutCubic } from './math';
import { rig } from './rig';
import { useApp } from './store';

/** How long the view takes to swing across to the radio, or back (seconds). */
const SWAY = 1.1;

/**
 * The radio is not on the page: it stands to the right of wherever you are. The record in the
 * corner (or "Radio" in the bar) swings the view across to it, and back. Written once per frame
 * (by the master loop, before anything draws) and read by the page and the 3D.
 */
export const radio = {
  /** the view is (going) over at the radio */
  open: false,
  /** 0..1: how far the view has swung across (0 = the page, 1 = the radio) */
  pan: 0,
  from: 0,
  t0: -1,
};

export function updateRadio() {
  const open = useApp.getState().radio;
  if (open !== radio.open) {
    radio.open = open;
    radio.from = radio.pan;
    radio.t0 = rig.time;
  }
  const to = open ? 1 : 0;
  if (radio.t0 < 0 || rig.reducedMotion || rig.dark) {
    radio.pan = to;
    return;
  }
  // a camera swinging round on its tripod: eased in and out, the same pace both ways
  const k = Math.min(1, (rig.time - radio.t0) / (SWAY * Math.max(0.35, Math.abs(to - radio.from))));
  radio.pan = radio.from + (to - radio.from) * easeInOutCubic(k);
}
