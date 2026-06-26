import { type CSSProperties, useEffect, useRef } from 'react'
import { ENTERING } from '../scene/mapTransition'
import { IS_TOUCH } from '../input/device'

// Big centred HUD that announces the island you're sailing up to:
// "You are entering — <login>'s Island". Reads the ENTERING singleton via rAF
// (no re-renders); `key` bumps to re-pop the title when you reach a new island.
// How long the banner stays up after you reach an island before it fades on its
// own (it re-pops when you sail up to a different island).
const DURATION = 4

export function EnteringIslandBanner() {
  const wrap = useRef<HTMLDivElement>(null)
  const name = useRef<HTMLDivElement>(null)
  const lastKey = useRef(-1)
  const shownAt = useRef(0)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const el = wrap.current
      if (el) {
        if (ENTERING.key !== lastKey.current) {
          lastKey.current = ENTERING.key
          shownAt.current = performance.now()
          if (ENTERING.name && name.current) name.current.textContent = ENTERING.name
          el.style.animation = 'none'
          void el.offsetWidth // reflow so the pop retriggers
          el.style.animation = ''
        }
        // Show briefly on arrival, then fade out even if you linger on the island.
        const fresh = (performance.now() - shownAt.current) / 1000 < DURATION
        const show = ENTERING.name != null && fresh
        el.style.opacity = show ? '1' : '0'
        el.style.transform = show ? 'translate(-50%, 0)' : 'translate(-50%, -12px)'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div ref={wrap} style={sWrap}>
      <style>{CSS}</style>
      {/* On phones, drop the "You are entering" eyebrow — just the island name,
          small but still noticeable. */}
      {!IS_TOUCH && <div style={sEyebrow}>You are entering</div>}
      <div ref={name} style={sName} />
      <div style={sRule} />
    </div>
  )
}

const HAND = "'Patrick Hand', 'Nunito', cursive"

const CSS = `
@keyframes enterIslandPop {
  0%   { letter-spacing: 6px; }
  100% { letter-spacing: 1px; }
}`

const sWrap: CSSProperties = {
  position: 'fixed',
  top: '16%',
  left: '50%',
  transform: 'translate(-50%, -12px)',
  zIndex: 130,
  pointerEvents: 'none',
  textAlign: 'center',
  opacity: 0,
  transition: 'opacity 0.4s ease, transform 0.4s ease',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  animation: 'enterIslandPop 0.5s ease-out',
}

const sEyebrow: CSSProperties = {
  fontFamily: HAND,
  fontSize: 20,
  color: '#f0e6cf',
  letterSpacing: 2,
  textShadow: '0 2px 6px rgba(0,0,0,0.7)',
}

const sName: CSSProperties = {
  fontFamily: HAND,
  fontSize: IS_TOUCH ? 22 : 46,
  lineHeight: 1.05,
  color: '#ffffff',
  textShadow: '0 3px 10px rgba(0,0,0,0.75)',
}

const sRule: CSSProperties = {
  width: IS_TOUCH ? 72 : 120,
  height: 2,
  borderRadius: 2,
  background: 'rgba(245,233,207,0.85)',
  boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
}
