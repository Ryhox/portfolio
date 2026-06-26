import { type CSSProperties, useEffect, useRef } from 'react'
import { EHOLD } from '../scene/mapTransition'
import { IS_TOUCH } from '../input/device'
import { useT } from '../i18n'
import { HAND } from './theme'

const R = 26
const C = 2 * Math.PI * R

// Radial "hold E for 3s to sail home" indicator. The ring fills as you hold E in
// the archipelago; reads the EHOLD singleton via rAF. Flat cream-on-ink, no glow.
export function HoldReturnIndicator() {
  const t = useT()
  const wrap = useRef<HTMLDivElement>(null)
  const ring = useRef<SVGCircleElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const p = Math.max(0, Math.min(1, EHOLD.progress))
      if (wrap.current) wrap.current.style.opacity = p > 0.02 ? '1' : '0'
      if (ring.current) ring.current.style.strokeDashoffset = String(C * (1 - p))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div ref={wrap} style={sWrap}>
      <div style={sRingBox}>
        <svg width={68} height={68} viewBox="0 0 68 68" style={{ transform: 'rotate(-90deg)', display: 'block' }}>
          <circle cx="34" cy="34" r={R} fill="none" stroke="rgba(18,16,10,0.5)" strokeWidth={5} />
          <circle
            ref={ring}
            cx="34"
            cy="34"
            r={R}
            fill="none"
            stroke="#f5e3bf"
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C}
          />
        </svg>
        {!IS_TOUCH && <span style={sKey}>E</span>}
      </div>
      <div style={sLabel}>{t('hold.sailHome')}</div>
    </div>
  )
}

const sWrap: CSSProperties = {
  position: 'fixed',
  left: '50%',
  top: '60%',
  transform: 'translate(-50%, -50%)',
  zIndex: 130,
  pointerEvents: 'none',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  opacity: 0,
  transition: 'opacity 0.15s ease',
}

const sRingBox: CSSProperties = {
  position: 'relative',
  width: 68,
  height: 68,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const sKey: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: HAND,
  fontSize: 24,
  color: '#f5e3bf',
  textShadow: '0 2px 5px rgba(0,0,0,0.7)',
}

const sLabel: CSSProperties = {
  fontFamily: HAND,
  fontSize: 18,
  color: '#fff',
  textShadow: '0 1px 4px rgba(0,0,0,0.7)',
}
