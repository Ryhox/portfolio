import { type CSSProperties, useEffect, useRef } from 'react'
import { TRANSITION } from '../scene/mapTransition'
import { HAND } from './theme'

// Full-screen fade that hides the map swap. Solid ink veil + a handwritten label
// ("Setting sail…" / "Coming ashore…"). Reads the TRANSITION singleton via rAF —
// no React state, no glow/gradient, matching the rest of the HUD.
export function MapTransition() {
  const veil = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const a = TRANSITION.alpha
      const v = veil.current
      if (v) {
        v.style.opacity = String(a)
        v.style.visibility = a > 0.001 ? 'visible' : 'hidden'
      }
      const l = label.current
      if (l) {
        if (l.textContent !== TRANSITION.label) l.textContent = TRANSITION.label
        l.style.opacity = String(Math.max(0, (a - 0.3) / 0.7))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div ref={veil} style={sVeil}>
      <div ref={label} style={sLabel} />
    </div>
  )
}

const sVeil: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 200,
  pointerEvents: 'none',
  opacity: 0,
  visibility: 'hidden',
  background: '#0a1426',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const sLabel: CSSProperties = {
  fontFamily: HAND,
  fontSize: 34,
  letterSpacing: 1,
  color: '#f5e9cf',
  textShadow: '0 2px 6px rgba(0,0,0,0.6)',
  opacity: 0,
}
