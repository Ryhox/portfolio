import { useProgress } from '@react-three/drei'
import { gsap } from 'gsap'
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import { startAmbience, setVol as setAudioVol } from '../audio/useAmbience'
import { requestLock } from '../scene/pointerLock'
import { FLY, useWorld } from '../state/useWorld'
import { EntryScene } from './EntryScene'

export function IntroOverlay() {
  const started        = useWorld((s) => s.started)
  const { progress }   = useProgress()

  const [ready,         setReady]         = useState(false)
  const [transitioning, setTransitioning] = useState(false)

  const wrapRef     = useRef<HTMLDivElement>(null)
  const flashRef    = useRef<HTMLDivElement>(null)
  const entryBgRef  = useRef<HTMLDivElement>(null)
  const loadAreaRef = useRef<HTMLDivElement>(null)
  const barFillRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (progress >= 100) {
      const id = setTimeout(() => setReady(true), 800)
      return () => clearTimeout(id)
    }
  }, [progress])

  useEffect(() => {
    if (!barFillRef.current) return
    gsap.to(barFillRef.current, { width: `${progress}%`, duration: 0.4, ease: 'power1.out' })
  }, [progress])

  useEffect(() => {
    if (!ready) return
    gsap.to(loadAreaRef.current, { opacity: 0, y: -10, duration: 0.5, ease: 'power2.in' })
    gsap.to(entryBgRef.current,  { opacity: 1, duration: 1.4, ease: 'power2.out', delay: 0.2 })
  }, [ready])

  const handleEnter = useCallback(() => {
    if (!ready || transitioning) return
    setTransitioning(true)

    void startAmbience()
    setAudioVol('master', 0)

    FLY.startPos = { x: 2, y: 38, z: 92 }

    const tl = gsap.timeline()

    tl.to(flashRef.current, { opacity: 0.88, duration: 0.22, ease: 'power2.in' })
    tl.to(flashRef.current, { opacity: 0,    duration: 0.38, ease: 'power1.out' }, '>-0.05')
    tl.to(FLY,              { progress: 1,   duration: 1.5,  ease: 'power2.out' }, 0.15)
    tl.to(wrapRef.current,  { opacity: 0,    duration: 0.9,  ease: 'power2.out' }, 0.22)
    tl.call(() => {
      if (wrapRef.current) wrapRef.current.style.pointerEvents = 'none'
    }, [], 0.5)

    const proxy = { v: 0 }
    tl.to(proxy, {
      v: useWorld.getState().volMaster,
      duration: 1.4,
      ease: 'power1.out',
      onUpdate: () => setAudioVol('master', proxy.v),
    }, 0.30)

    tl.call(() => {
      requestLock()
      useWorld.getState().setPaused(false)
      useWorld.getState().setStarted(true)
    }, [], 1.8)
  }, [ready, transitioning])

  // Keyboard shortcut
  useEffect(() => {
    if (!ready || transitioning) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') handleEnter()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ready, transitioning, handleEnter])

  if (started) return null

  return (
    <>
      <style>{CSS}</style>
      <div id="iw" ref={wrapRef} style={sWrap}>

        <div style={sDarkBg} />

        <div id="iw-scene" ref={entryBgRef} style={{ ...sEntryBg, opacity: 0 }}>
          <EntryScene onEnter={handleEnter} />
        </div>

        <div ref={loadAreaRef} style={sLoadArea}>
          <span style={sGlyph}>✦</span>
          <div style={sLoadText}>gathering magic...</div>
          <div style={sBarOuter}>
            <div ref={barFillRef} style={sBarFill} />
          </div>
        </div>

        <div ref={flashRef} style={sFlash} />

      </div>
    </>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const CSS = `
  #iw { pointer-events: auto; }
  #iw * { pointer-events: none; }
  #iw-scene { pointer-events: auto; cursor: default; }
`

const FONT = "'Nunito', sans-serif"
const DARK = '#0a0806'

const sWrap: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10,
  fontFamily: FONT,
}

const sDarkBg: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: DARK,
  pointerEvents: 'none',
}

const sEntryBg: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'auto',
  cursor: 'default',
}

const sLoadArea: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 18,
  pointerEvents: 'none',
  userSelect: 'none',
}

const sGlyph: CSSProperties = {
  fontSize: 15,
  color: 'rgba(212, 196, 160, 0.38)',
  letterSpacing: '0.5em',
}

const sLoadText: CSSProperties = {
  fontFamily: FONT,
  fontWeight: 400,
  fontSize: 'clamp(13px, 1.3vw, 15px)',
  color: 'rgba(212, 196, 160, 0.5)',
  letterSpacing: '0.1em',
}

const sBarOuter: CSSProperties = {
  width: 'min(200px, 42vw)',
  height: 2,
  background: 'rgba(212, 196, 160, 0.12)',
  overflow: 'hidden',
}

const sBarFill: CSSProperties = {
  height: '100%',
  width: '0%',
  background: 'rgba(212, 196, 160, 0.6)',
}

const sFlash: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: '#fff8e7',
  opacity: 0,
  pointerEvents: 'none',
}
