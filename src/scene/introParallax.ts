// Smoothed, normalized (~-1..1) camera lean for the idle "click to start" screen.
// CinematicCamera writes it each frame; the DOM intro title reads it via rAF so the
// cozy text leans/turns in lockstep with the camera (which itself leans with the
// pointer), making the title feel like a sign floating in the world. Decays to 0
// during the fly-in. Plain mutable singleton — no React coupling, works in prod.
export const INTRO_PARALLAX = { x: 0, y: 0 }
