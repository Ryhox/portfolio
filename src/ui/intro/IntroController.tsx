/**
 * Cinematic intro sequence:
 *
 * Step 0 (loading complete, +200ms):
 *   1. worldVisible=true — water is solid at once; sky/horizon fade in fast (~1.2s)
 *   2. Progress overlay fades out (0.45s)
 *   3. +150ms: label rises in, ready=true, click-anywhere enabled
 *
 * handleEnter (click anywhere / Enter / Space):
 *   1. Hide label + reset cursor
 *   2. Expand reveal: white shockwave (0→3, 0.35s) then ring sweeps to 50 (3.5s)
 *   3. [reveal done +400ms] → camera flies into character (2s power2.out)
 *   4. Audio fades in simultaneously
 *   5. At camera-arrival+0.3s: pointer lock + game active
 */
import { useProgress } from '@react-three/drei'
import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { startAmbience, setVol as setAudioVol } from '../../audio/useAmbience'
import { requestLock } from '../../scene/pointerLock'
import { FLY, useWorld } from '../../state/useWorld'
import { introActions } from './introActions'

export function IntroController() {
  const started      = useWorld((s) => s.started)
  const { progress } = useProgress()
  const [ready,         setReady]         = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const step0Fired = useRef(false)

  useEffect(() => {
    useWorld.getState().setIntroProgress(progress / 100)
  }, [progress])

  useEffect(() => {
    if (progress < 100 || step0Fired.current) return
    step0Fired.current = true

    const id = setTimeout(() => {
      // Start world fade as the iris begins closing — scene fades in while overlay shrinks
      useWorld.getState().setWorldVisible(true)

      // Iris-close: overlay fades out, then the label rises in right behind it
      introActions.collapseProgress?.(() => {
        const labelId = setTimeout(() => {
          introActions.showLabel?.()
          setReady(true)
          introActions.ready = true
        }, 150)

        return () => clearTimeout(labelId)
      })
    }, 200)

    return () => {
      clearTimeout(id)
      // Reset flag so StrictMode's unmount/remount cycle can re-fire correctly
      step0Fired.current = false
    }
  }, [progress])

  // Cursor: pointer while ready and waiting for click
  useEffect(() => {
    if (ready && !transitioning) {
      document.body.style.cursor = 'pointer'
    } else {
      document.body.style.cursor = 'default'
    }
    return () => { document.body.style.cursor = 'default' }
  }, [ready, transitioning])

  const handleEnter = useCallback(() => {
    if (!ready || transitioning) return
    setTransitioning(true)

    document.body.style.cursor = 'default'
    introActions.hideLabel?.()
    introActions.onHoverLeave?.()

    void startAmbience()
    setAudioVol('master', 0)

    // Ring expands independently — no callback needed, cleanup is internal
    introActions.expandReveal?.()

    // Fly-in runs in parallel; game goes live the moment camera arrives
    FLY.startPos = null
    const tl = gsap.timeline()
    tl.to(FLY, { progress: 1, duration: 3.0, ease: 'power2.out' }, 0)

    // Audio fades in alongside
    const proxy = { v: 0 }
    tl.to(proxy, {
      v: useWorld.getState().volMaster,
      duration: 2.5,
      ease: 'power1.out',
      onUpdate: () => setAudioVol('master', proxy.v),
    }, 0.3)

    // Game goes live exactly when camera arrives at spawn
    tl.call(() => {
      requestLock()
      useWorld.getState().setPaused(false)
      useWorld.getState().setStarted(true)
    }, [], 3.0)
  }, [ready, transitioning])

  useEffect(() => {
    introActions.handleEnter = handleEnter
    return () => { introActions.handleEnter = null }
  }, [handleEnter])

  useEffect(() => {
    if (!ready || transitioning) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') handleEnter()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ready, transitioning, handleEnter])

  // Click anywhere on screen to start (not just the label or hover zone)
  useEffect(() => {
    if (!ready || transitioning) return
    const onClick = () => handleEnter()
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [ready, transitioning, handleEnter])

  if (started) return null
  return null
}
