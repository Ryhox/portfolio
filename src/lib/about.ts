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

/** Where each trade sits on the dial, clockwise from twelve (radians). */
export const tradeAngle = (i: number) => (i / TRADES) * Math.PI * 2;
