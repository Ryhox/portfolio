/**
 * Geneva drive kinematics for a six-slot wheel.
 * One driver revolution advances the wheel by one slot; the pin is engaged for exactly a third
 * of the revolution (±60° around the line of centres), the other two thirds are locked dwell.
 */
export const SLOTS = 6;
const HALF_SLOT = Math.PI / SLOTS; // 30°
const C_OVER_A = 1 / Math.sin(Math.PI / SLOTS); // centre distance / pin radius = 2

/** f ∈ [0,1): position within one driver revolution → wheel advance 0..1 (one slot). */
export function genevaStep(f: number) {
  if (f <= 1 / 3) return 0;
  if (f >= 2 / 3) return 1;
  const alpha = (f - 0.5) * Math.PI * 2;
  const beta = Math.atan2(Math.sin(alpha), C_OVER_A - Math.cos(alpha));
  return (beta + HALF_SLOT) / (2 * HALF_SLOT);
}

/**
 * Pinned-section progress p ∈ [0,1] → { wheel position in plates (intermittent), driver angle }.
 * The first and last plates rest at the ends of the section.
 */
export function geneva(p: number, plates: number) {
  const x = Math.min(Math.max(p, 0), 1) * (plates - 1);
  const i = Math.min(Math.floor(x), plates - 2);
  const f = x - i;
  const wheel = i + genevaStep(f);
  const driver = x * Math.PI * 2; // continuous
  return { wheel, driver, engaged: f > 1 / 3 && f < 2 / 3 };
}
