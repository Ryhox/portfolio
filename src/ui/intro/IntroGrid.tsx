import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import { useWorld } from '../../state/useWorld'
import { introActions } from './introActions'
import { RING_X, RING_Z, RING_EDGE_Y } from '../../scene/core/spawnConstants'
import { REVEAL_DIST, REVEAL_COLOR_U, REVEAL_INTENSITY, REVEAL_THICKNESS } from '../../scene/terrain/revealUniforms'

const RING_RADIUS = 5.0

export function IntroGrid() {
  const hoverZoneRef  = useRef<THREE.Mesh>(null)
  // Hover-preview was disabled (onHoverEnter/Leave are null'd below); the zone
  // stays hidden until the reveal runs.
  const hoverActive   = false
  const started       = useWorld((s) => s.started)

  useEffect(() => {
    // Island stays fully hidden until click — no preview ring
    introActions.startReveal = () => {}

    introActions.expandReveal = (onComplete?: () => void) => {
      // Reset to pristine start state
      REVEAL_DIST.value      = 0
      REVEAL_INTENSITY.value = 5.5
      REVEAL_THICKNESS.value = 0.05
      const col    = REVEAL_COLOR_U.value as THREE.Color
      const target = new THREE.Color('#e88eff')
      col.setRGB(1, 1, 1)  // start: white burst

      const tl = gsap.timeline({
        onComplete: () => { REVEAL_DIST.value = 99999; col.copy(target); onComplete?.() },
      })

      // A — Shockwave: tiny ring ignites (0.35 s)
      tl.to(REVEAL_DIST,      { value: 3,    duration: 0.35, ease: 'power4.in' },  0)
      tl.to(REVEAL_INTENSITY, { value: 22,   duration: 0.20, ease: 'power3.in' },  0)
      tl.to(REVEAL_THICKNESS, { value: 0.22, duration: 0.20, ease: 'power3.in' },  0)

      // B — Main sweep: ring blasts outward (3.5 s) — target past island radius (68)
      tl.to(REVEAL_DIST,      { value: 90,   duration: 3.50, ease: 'power2.out' }, 0.35)
      tl.to(REVEAL_INTENSITY, { value: 5.5,  duration: 3.00, ease: 'power1.out' }, 0.50)
      tl.to(REVEAL_THICKNESS, { value: 0.04, duration: 3.00, ease: 'power1.out' }, 0.50)

      // C — Color: white → magenta
      tl.to(col, { r: target.r, g: target.g, b: target.b,
                   duration: 2.80, ease: 'power1.inOut' }, 0.55)
    }

    introActions.onHoverEnter = null
    introActions.onHoverLeave = null

    return () => {
      introActions.startReveal  = null
      introActions.expandReveal = null
      introActions.onHoverEnter = null
      introActions.onHoverLeave = null
    }
  }, [])

  if (started) return null

  return (
    <mesh
      ref={hoverZoneRef}
      renderOrder={200}
      position={[RING_X, RING_EDGE_Y + 0.01, RING_Z]}
      rotation={[-Math.PI / 2, 0, 0]}
      visible={hoverActive}
      onClick={() => introActions.handleEnter?.()}
      onPointerEnter={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
        introActions.onHoverEnter?.()
      }}
      onPointerLeave={() => {
        document.body.style.cursor = 'default'
        introActions.onHoverLeave?.()
      }}
    >
      <circleGeometry args={[RING_RADIUS, 64]} />
      {/* __revealPatched blocks RevealPatcher so this invisible disk gets no ring glow */}
      <meshBasicMaterial
        ref={(m) => { if (m) (m as any).__revealPatched = true }}
        transparent={true} opacity={0} depthWrite={false} side={THREE.DoubleSide}
      />
    </mesh>
  )
}
