import { type CSSProperties, useEffect, useRef } from 'react'
import { ENTERING } from '../scene/mapTransition'

// Small flat card under the "you are entering" banner that tells you how lucky
// the island's roll was: the look (variant) + its overall chance, the size tier
// + its chance, and a luck verdict. Reads the ENTERING singleton via rAF (no
// re-renders); `key` bumps to re-pop it, and it auto-fades after a few seconds.
const DURATION = 6 // s the card stays up after you reach an island

const fmt = (p: number) => (p >= 10 ? Math.round(p).toString() : p.toFixed(1))

export function IslandLuckCard() {
  const wrap = useRef<HTMLDivElement>(null)
  const group = useRef<HTMLDivElement>(null)
  const biomeName = useRef<HTMLSpanElement>(null)
  const biomePct = useRef<HTMLSpanElement>(null)
  const sizeName = useRef<HTMLSpanElement>(null)
  const sizePct = useRef<HTMLSpanElement>(null)
  const luck = useRef<HTMLDivElement>(null)
  const lastKey = useRef(-1)
  const shownAt = useRef(0)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const el = wrap.current
      if (el) {
        const s = ENTERING.stats
        if (ENTERING.key !== lastKey.current) {
          lastKey.current = ENTERING.key
          shownAt.current = performance.now()
          if (s) {
            // Mother islands aren't a luck roll, so their odds are left blank.
            const pct = (v: number) => (s.isMother ? '' : fmt(v) + '%')
            if (group.current) group.current.textContent = s.group
            if (biomeName.current) biomeName.current.textContent = s.biomeName
            if (biomePct.current) biomePct.current.textContent = pct(s.biomePct)
            if (sizeName.current) sizeName.current.textContent = s.sizeName
            if (sizePct.current) sizePct.current.textContent = pct(s.sizePct)
            if (luck.current) luck.current.textContent = s.luck
          }
          el.style.animation = 'none'
          void el.offsetWidth // reflow so the pop retriggers
          el.style.animation = ''
        }
        const fresh = (performance.now() - shownAt.current) / 1000 < DURATION
        const show = s != null && fresh
        el.style.opacity = show ? '1' : '0'
        el.style.transform = show ? 'translate(-50%, 0)' : 'translate(-50%, 8px)'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div ref={wrap} style={sWrap}>
      <style>{CSS}</style>
      <div ref={group} style={sGroup} />
      <div style={sRow}>
        <span ref={biomeName} style={sLabel} />
        <span ref={biomePct} style={sPct} />
      </div>
      <div style={sRow}>
        <span ref={sizeName} style={sLabel} />
        <span ref={sizePct} style={sPct} />
      </div>
      <div ref={luck} style={sLuck} />
    </div>
  )
}

const HAND = "'Patrick Hand', 'Nunito', cursive"

const CSS = `
@keyframes luckCardPop {
  0%   { transform: translate(-50%, 8px) scale(0.96); }
  100% { transform: translate(-50%, 0) scale(1); }
}`

const sWrap: CSSProperties = {
  position: 'fixed',
  top: '31%',
  left: '50%',
  transform: 'translate(-50%, 8px)',
  zIndex: 129,
  pointerEvents: 'none',
  width: 256,
  padding: '12px 16px 10px',
  borderRadius: 12,
  background: '#f6efda',
  border: '1px solid #d7c8a3',
  boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
  opacity: 0,
  transition: 'opacity 0.4s ease, transform 0.4s ease',
  animation: 'luckCardPop 0.45s ease-out',
}

const sGroup: CSSProperties = {
  fontFamily: HAND,
  fontSize: 15,
  color: 'rgba(111,88,54,0.7)',
  textAlign: 'center',
  letterSpacing: 1,
  marginBottom: 8,
}

const sRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  fontFamily: HAND,
  fontSize: 19,
  color: '#5a4528',
  lineHeight: 1.4,
}

const sLabel: CSSProperties = { color: '#6f5836' }
const sPct: CSSProperties = { color: '#a8895a', fontSize: 17 }

const sLuck: CSSProperties = {
  fontFamily: HAND,
  fontSize: 17,
  color: '#6f5836',
  textAlign: 'center',
  marginTop: 8,
  paddingTop: 7,
  borderTop: '1px solid #e2d5b4',
}
