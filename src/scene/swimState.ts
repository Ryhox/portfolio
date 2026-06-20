// ---------------------------------------------------------------------------
// Shared swim/dive state. The Player writes it every frame; DayNight (fog swap),
// Underwater (murk dome / caustics / bubbles), Postfx (underwater grade) and the
// audio muffle all read it. Same mutable-singleton pattern as WIND / FLY.
// ---------------------------------------------------------------------------

export const SWIM = {
  wadeAmt: 0, // 0 = on land, 1 = fully swimming (smoothed)
  inWater: false, // standing in / over water deep enough to swim
  underwater: false, // eye is below the surface (diving)
  depth: 0, // metres the eye is below the waterline (>= 0)
  surfaceY: 0, // water surface height at the player (for spray / audio)
}

// Dev convenience: lets the screenshot harness force an underwater view.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { SWIM: typeof SWIM }).SWIM = SWIM
}
