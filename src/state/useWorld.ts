import { create } from 'zustand'
import type { Mesh } from 'three'

// Time of day is normalized 0..1:
//   0.00 = midnight   0.25 = sunrise   0.50 = noon   0.75 = sunset
//
// High-frequency animation reads `t` imperatively via useWorld.getState() inside
// useFrame (no React re-render). UI that needs to display the time subscribes
// through the hook as usual.
export type VolKey = 'master' | 'music' | 'waves' | 'wind' | 'ambient'

export type WorldState = {
  t: number
  paused: boolean
  dayLengthSec: number
  started: boolean
  muted: boolean
  menuOpen: boolean
  volMaster: number
  volMusic: number
  volWaves: number
  volWind: number
  volAmbient: number
  // The sun billboard mesh, shared so the post-processing GodRays effect can use
  // it as its light source. Set by DayNight once mounted.
  sunMesh: Mesh | null
  setT: (t: number) => void
  setPaused: (p: boolean) => void
  togglePaused: () => void
  setDayLength: (s: number) => void
  setStarted: (s: boolean) => void
  toggleMuted: () => void
  setSunMesh: (m: Mesh | null) => void
  setMenuOpen: (open: boolean) => void
  setVol: (key: VolKey, v: number) => void
}

const wrap01 = (t: number) => ((t % 1) + 1) % 1

const VOL_KEY_MAP: Record<VolKey, keyof WorldState> = {
  master: 'volMaster', music: 'volMusic', waves: 'volWaves',
  wind: 'volWind', ambient: 'volAmbient',
}

export const useWorld = create<WorldState>((set) => ({
  t: 0.27, // begin in a gentle morning
  paused: false,
  dayLengthSec: 140,
  started: false,
  muted: false,
  menuOpen: false,
  volMaster: 1,
  volMusic: 0.5,
  volWaves: 0.5,
  volWind: 0.5,
  volAmbient: 0.5,
  sunMesh: null,
  setT: (t) => set({ t: wrap01(t) }),
  setPaused: (paused) => set({ paused }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  setDayLength: (dayLengthSec) => set({ dayLengthSec }),
  setStarted: (started) => set({ started }),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  setSunMesh: (sunMesh) => set({ sunMesh }),
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  setVol: (key, v) => set({ [VOL_KEY_MAP[key]]: v } as Partial<WorldState>),
}))

// Dev convenience: lets the screenshot harness drive time/started from JS.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { useWorld: typeof useWorld }).useWorld = useWorld
}

// Human-readable phase label for the HUD.
export function phaseLabel(t: number): string {
  if (t < 0.22 || t >= 0.96) return 'Deep Night'
  if (t < 0.3) return 'Dawn'
  if (t < 0.45) return 'Morning'
  if (t < 0.55) return 'Midday'
  if (t < 0.7) return 'Afternoon'
  if (t < 0.78) return 'Sunset'
  if (t < 0.86) return 'Dusk'
  return 'Night'
}
