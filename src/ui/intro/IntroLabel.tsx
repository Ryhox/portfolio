import { type CSSProperties, useEffect, useRef } from 'react'
import gsap from 'gsap'
import { useWorld } from '../../state/useWorld'
import { INTRO_PARALLAX } from '../../scene/introParallax'
import { introActions } from './introActions'
import { useT } from '../../i18n'

const isTouch =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window)

// Subtle opacity breathe on the prompt (stays prominent). No glow, no blur.
const CSS = `
@keyframes introPromptPulse {
  0%, 100% { opacity: 0.78; }
  50%      { opacity: 1;    }
}
`

export function IntroLabel() {
  const t           = useT()
  const outerRef    = useRef<HTMLDivElement>(null) // GSAP owns the entrance here
  const tiltRef     = useRef<HTMLDivElement>(null) // rAF owns the parallax transform here
  const started     = useWorld((s) => s.started)

  // Start hidden + slightly low so the entrance is a quick rise-in.
  useEffect(() => {
    if (outerRef.current) gsap.set(outerRef.current, { opacity: 0, y: 16 })
  }, [])

  useEffect(() => {
    introActions.showLabel = () => {
      if (!outerRef.current) return
      gsap.to(outerRef.current, { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out', overwrite: true })
    }
    introActions.hideLabel = () => {
      if (!outerRef.current) return
      gsap.to(outerRef.current, { opacity: 0, y: 10, duration: 0.25, ease: 'power2.in', overwrite: true })
    }
    return () => {
      introActions.showLabel = null
      introActions.hideLabel = null
    }
  }, [])

  // Parallax: lean + turn the text in lockstep with the camera (which leans with the
  // pointer on the idle screen) and add a gentle float, so it reads like a sign hung
  // in the world rather than a flat overlay. Kept on a separate node from the GSAP
  // entrance so the two transforms never fight.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const el = tiltRef.current
      if (el) {
        const px = INTRO_PARALLAX.x
        const py = INTRO_PARALLAX.y
        const bob = Math.sin(performance.now() * 0.0011) * 4
        el.style.transform =
          `translate3d(${(-px * 24).toFixed(2)}px, ${(-py * 16 + bob).toFixed(2)}px, 0) ` +
          `rotateX(${(-py * 4).toFixed(2)}deg) rotateY(${(px * 7).toFixed(2)}deg)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  if (started) return null

  return (
    <div style={sContainer}>
      <style>{CSS}</style>
      <div ref={outerRef} style={sOuter}>
        <div ref={tiltRef} style={sTilt}>
          <h1 style={sTitle}>{t('intro.welcome')}</h1>
          <div style={sDivider} />
          <div style={sPrompt}>{isTouch ? t('intro.beginTouch') : t('intro.beginDesktop')}</div>
        </div>
      </div>
    </div>
  )
}

const NUNITO = "'Nunito', 'Noto Sans KR', 'Noto Sans JP', 'Noto Sans SC', system-ui, sans-serif"
const BRIGHT  = '#fff7ea' // bright warm white — the call to action
const LEGIBLE = '0 1px 3px rgba(35,20,8,0.45)' // tight dark shadow for contrast, not a glow

const sContainer: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  zIndex: 50,
  pointerEvents: 'none', // window click-anywhere handles "start"; only the mute button opts back in
}

const sOuter: CSSProperties = {
  position: 'relative',
  perspective: 850, // lets the child's rotateX/Y read as a real 3D turn
  textAlign: 'center',
}

const sTilt: CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  willChange: 'transform',
}

const sTitle: CSSProperties = {
  margin: 0,
  fontFamily: NUNITO,
  fontWeight: 800,
  fontSize: 'clamp(52px, 11vw, 110px)',
  lineHeight: 1,
  letterSpacing: '0.02em',
  color: '#ffffff',
  textShadow: LEGIBLE,
}

const sDivider: CSSProperties = {
  width: 40,
  height: 1,
  marginTop: 22,
  background: 'rgba(255,255,255,0.35)',
}

const sPrompt: CSSProperties = {
  marginTop: 16,
  fontFamily: NUNITO,
  fontWeight: 800,
  fontSize: 'clamp(13px, 1.9vw, 17px)',
  letterSpacing: '0.22em',
  color: BRIGHT,
  textShadow: LEGIBLE,
  animation: 'introPromptPulse 2.4s ease-in-out infinite',
}
