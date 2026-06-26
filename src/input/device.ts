// Device capability + viewport helpers shared across the UI and scene.
//
// IS_TOUCH is the one source of truth for "show touch controls instead of
// keyboard hints". It's a load-time constant: a device's *input capability*
// doesn't change while the page is open (unlike its size, which we track
// reactively via useViewport). We treat anything with a coarse, hover-less
// pointer OR a positive maxTouchPoints as touch — covers phones, tablets and
// touch laptops (which then simply get both schemes available).
import { useEffect, useState } from 'react'

const hasWindow = typeof window !== 'undefined'

export const IS_TOUCH =
  hasWindow &&
  ((window.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false) ||
    (navigator.maxTouchPoints ?? 0) > 0)

// A small phone (used to thin particles / shrink HUD a touch further). Based on
// the *shorter* edge so it's orientation-independent.
export const IS_PHONE =
  IS_TOUCH && hasWindow && Math.min(window.innerWidth, window.innerHeight) < 600

export function useIsTouch() {
  return IS_TOUCH
}

export type Viewport = { w: number; h: number; short: number; portrait: boolean }

function read(): Viewport {
  const w = hasWindow ? window.innerWidth : 1280
  const h = hasWindow ? window.innerHeight : 720
  return { w, h, short: Math.min(w, h), portrait: h >= w }
}

// Reactive viewport for HUD layout. One throttled (rAF) resize/orientation
// listener; components that genuinely need to branch on size read this. Prefer
// CSS clamp()/min()/vw where a value can just scale without React re-render.
export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(read)
  useEffect(() => {
    if (!hasWindow) return
    let raf = 0
    const onResize = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        setVp(read())
      })
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
  return vp
}

// True below a width where the desktop HUD should start compacting. Derived from
// useViewport so it updates live as the window is dragged narrower.
export function useCompact(threshold = 760): boolean {
  return useViewport().w < threshold
}
