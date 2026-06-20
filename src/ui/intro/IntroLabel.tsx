import { type CSSProperties, useEffect, useRef } from 'react'
import gsap from 'gsap'
import { useWorld } from '../../state/useWorld'
import { INTRO_PARALLAX } from '../../scene/introParallax'
import { introActions } from './introActions'

const isTouch =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window)

// Subtle opacity breathe on the prompt (stays prominent) + a hover lift on the
// mute icon. No glow, no blur.
const CSS = `
@keyframes introPromptPulse {
  0%, 100% { opacity: 0.78; }
  50%      { opacity: 1;    }
}
.intro-mute { transition: opacity 0.15s ease, transform 0.15s ease; }
.intro-mute:hover { opacity: 0.95 !important; transform: scale(1.08); }
`

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
      {muted ? (
        <>
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </>
      )}
    </svg>
  )
}

export function IntroLabel() {
  const outerRef    = useRef<HTMLDivElement>(null) // GSAP owns the entrance here
  const tiltRef     = useRef<HTMLDivElement>(null) // rAF owns the parallax transform here
  const muted       = useWorld((s) => s.muted)
  const started     = useWorld((s) => s.started)
  const toggleMuted = useWorld((s) => s.toggleMuted)

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
          <h1 style={sTitle}>WELCOME</h1>
          <div style={sDivider} />
          <div style={sPrompt}>{isTouch ? 'TAP ANYWHERE TO BEGIN' : 'CLICK ANYWHERE TO BEGIN'}</div>

          <button
            className="intro-mute"
            style={sMute}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            onClick={(e) => {
              e.stopPropagation()
              toggleMuted()
            }}
          >
            <SpeakerIcon muted={muted} />
          </button>
        </div>
      </div>
    </div>
  )
}

const NUNITO = "'Nunito', system-ui, sans-serif"
const WARM    = '#f5e3bf' // warm gold — used for the mute icon
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

const sMute: CSSProperties = {
  appearance: 'none',
  background: 'none',
  border: 'none',
  marginTop: 20,
  padding: 6,
  lineHeight: 0,
  color: WARM,
  opacity: 0.6,
  cursor: 'pointer',
  pointerEvents: 'auto', // opt back in over the click-through container
}
