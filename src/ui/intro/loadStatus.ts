import { create } from 'zustand'

// Shared loading + GPU warm-up status that feeds the LoadingScreen caption and
// bar, and tells the intro when it's safe to reveal the world. Kept in its own
// tiny store (not useWorld) so the per-frame warm-up updates never touch game
// state. The Warmup component (inside the Canvas) is the sole writer; the DOM
// overlays (LoadingScreen, IntroController) are readers.
export type LoadStatus = {
  phase: string      // human caption shown under the bar
  progress: number   // 0..1 overall: asset download THEN GPU warm-up
  warmReady: boolean // true once the GPU warm-up has finished → intro may reveal
  set: (p: Partial<LoadStatus>) => void
}

export const useLoadStatus = create<LoadStatus>((set) => ({
  phase: 'gathering magic',
  progress: 0,
  warmReady: false,
  set: (p) => set(p),
}))
