import { useEffect, useRef } from 'react'
import { SWIM } from '../../scene/ocean/swimState'

// A DOM overlay that smooths the dive/surface transition: a quick aqua water
// "sheet" + blur wipes across the screen whenever you cross the surface (either
// direction), plus a very faint persistent tint while submerged. Reads the SWIM
// singleton directly via rAF so it works in production (no canvas coupling).
export function WaterOverlay() {
  const ref = useRef<HTMLDivElement>(null)
  const wasUnder = useRef(false)
  const flash = useRef(0)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (SWIM.underwater !== wasUnder.current) {
        flash.current = 1 // crossed the surface → wipe
        wasUnder.current = SWIM.underwater
      }
      flash.current = Math.max(0, flash.current - 0.035) // ~0.5s fade

      const el = ref.current
      if (el) {
        const persistent = SWIM.underwater ? 0.06 : 0 // faint tint while submerged
        const op = Math.max(flash.current * 0.75, persistent)
        el.style.opacity = String(op)
        el.style.backdropFilter = flash.current > 0.04 ? `blur(${(flash.current * 5).toFixed(1)}px)` : 'none'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 40,
        opacity: 0,
        background:
          'radial-gradient(circle at 50% 42%, rgba(130,225,235,0.30), rgba(38,120,150,0.55) 75%, rgba(20,80,110,0.7))',
      }}
    />
  )
}
