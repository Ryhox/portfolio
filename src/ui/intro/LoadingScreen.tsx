import gsap from 'gsap'
import { type CSSProperties, useEffect, useRef } from 'react'
import { introActions } from './introActions'
import { useLoadStatus } from './loadStatus'

export function LoadingScreen() {
  // Overall progress (asset download → GPU warm-up) and the current phase caption,
  // both fed by the Warmup component inside the Canvas.
  const progress = useLoadStatus((s) => s.progress)
  const phase    = useLoadStatus((s) => s.phase)
  const overlayRef   = useRef<HTMLDivElement>(null)
  const barFillRef   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!barFillRef.current) return
    gsap.to(barFillRef.current, { width: `${Math.min(100, Math.round(progress * 100))}%`, duration: 0.4, ease: 'power1.out' })
  }, [progress])

  useEffect(() => {
    introActions.collapseProgress = (onDone: () => void) => {
      const el = overlayRef.current
      if (!el) { onDone(); return }
      gsap.to(el, {
        opacity: 0,
        duration: 0.45,
        ease: 'power2.inOut',
        onComplete: () => {
          el.style.display = 'none'
          onDone()
        },
      })
    }
    return () => { introActions.collapseProgress = null }
  }, [])

  return (
    <div ref={overlayRef} style={sOverlay}>
      <span style={sGlyph}>✦</span>
      <div style={sText}>{phase}…</div>
      <div style={sBarOuter}>
        <div ref={barFillRef} style={sBarFill} />
      </div>
    </div>
  )
}

const sOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: '#0c0a18',
  zIndex: 100,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 18,
  pointerEvents: 'none',
  userSelect: 'none',
}

const sGlyph: CSSProperties = {
  fontSize: 15,
  color: 'rgba(232, 142, 255, 0.45)',
  letterSpacing: '0.5em',
}

const sText: CSSProperties = {
  fontWeight: 400,
  fontSize: 'clamp(13px, 1.3vw, 15px)',
  color: 'rgba(232, 142, 255, 0.55)',
  letterSpacing: '0.12em',
}

const sBarOuter: CSSProperties = {
  width: 'min(200px, 42vw)',
  height: 2,
  background: 'rgba(232, 142, 255, 0.12)',
  overflow: 'hidden',
}

const sBarFill: CSSProperties = {
  height: '100%',
  width: '0%',
  background: 'rgba(232, 142, 255, 0.65)',
}
