/** Shared between the About section's DOM and its 3D: which half is showing, which trade is chosen. */
export const about = {
  /** 0 = the maker (portrait), 1 = the trades (clock) */
  phase: 0,
  /** the trade the clock hands point at */
  active: 0,
  /** a trade picked by hand, which the scroll then leaves alone for a moment */
  picked: -1,
  pickedAt: -10,
};

export const TRADES = 5;

/**
 * Where each trade sits on the dial, clockwise from twelve (degrees): three down the right of the
 * clock and two up its left, which is where the page sets them out round it (the title has the
 * place at the top left). The hand points at the trade itself.
 */
const DIAL = [45, 90, 135, 225, 270];
export const tradeAngle = (i: number) => (DIAL[Math.min(TRADES - 1, Math.max(0, i))] * Math.PI) / 180;
