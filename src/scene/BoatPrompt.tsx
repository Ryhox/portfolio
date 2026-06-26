import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { type CSSProperties, useRef } from 'react'
import { Group, Vector2, Vector3 } from 'three'
import { useWorld } from '../state/useWorld'
import { BOAT, BOARD_RANGE } from './boatState'
import { getHeight } from './terrain'
import { PROP_OCCLUDERS } from './occluders'
import { IS_TOUCH } from '../input/device'
import { pressKey, releaseKey } from '../input/input'

// The interact marker — Bruno Simon folio logic, isle-cozy dress.
//
// From afar it's just a small cream dot pinned over the boat. As you walk in it
// blooms into the full key-cap + "Set sail" label and the dot fades away. The
// reveal is driven continuously by the camera's distance to the hull and then
// eased over time (exponential damping), so it grows and shrinks like butter —
// same feel as the folio-2025 markers, never a snap. All per-frame work is
// written straight to the DOM via refs so it never re-renders.
//
//  - Terrain occlusion is analytic: we sample getHeight() along the line of
//    sight (a handful of cheap noise lookups — NO per-frame scene raycast, which
//    is what tanked the framerate), and fade the marker out when a hill blocks it.
//  - Prop occlusion (trees/rocks) is a single raycast against ONLY the registered
//    prop group, throttled to ~10×/sec — bounded and cheap, not the whole scene.
//  - It unmounts while a menu / map overlay is up, so it can't punch through them.
//
// Reveal window: fully a dot at FAR metres, fully open by NEAR metres.
const NEAR = BOARD_RANGE - 0.4
const FAR = BOARD_RANGE + 5.5
// The resting dot only appears as you APPROACH — it fades in by DOT_SHOW and is gone
// past DOT_HIDE, so the boat isn't permanently tagged from across the isle (matches
// the social markers, which only show their dot when you're near).
const DOT_SHOW = FAR + 2.5 // fully visible (just a dot) within here
const DOT_HIDE = FAR + 5.5 // faded entirely away beyond here

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

const _ndc = new Vector2()
const _marker = new Vector3()

export function BoatPrompt() {
  const anchor = useRef<Group>(null)
  const stage = useRef<HTMLDivElement>(null)
  const dot = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const p = useRef(0) // eased reveal progress 0..1, persists across frames
  const propTimer = useRef(0) // throttle accumulator for the prop raycast
  const propBlocked = useRef(false) // last prop-occlusion result (sticky between checks)
  const started = useWorld((s) => s.started)
  const boatMode = useWorld((s) => s.boatMode)
  const menuOpen = useWorld((s) => s.menuOpen)
  const mapOpen = useWorld((s) => s.mapOpen)

  // Track the hull (which may be left bobbing out at sea) and drive the bloom
  // from the live camera→boat distance, eased over time, all without re-render.
  useFrame((state, dt) => {
    const a = anchor.current
    if (!a) return
    const my = BOAT.y + 1.35
    a.position.set(BOAT.x, my, BOAT.z)

    const cam = state.camera.position
    const d = Math.hypot(cam.x - BOAT.x, cam.z - BOAT.z)
    const target = 1 - smoothstep(NEAR, FAR, d) // 1 = open, 0 = just a dot

    // Analytic terrain occlusion: walk the line of sight and hide the marker if
    // any ground sample pokes above it. Cheap (a few noise lookups), no raycast.
    let blocked = false
    for (let i = 1; i < 7; i++) {
      const f = i / 7
      const sx = cam.x + (BOAT.x - cam.x) * f
      const sz = cam.z + (BOAT.z - cam.z) * f
      const sy = cam.y + (my - cam.y) * f
      if (getHeight(sx, sz) > sy + 0.25) {
        blocked = true
        break
      }
    }

    // Prop occlusion: throttled single raycast against just the prop group. Cast
    // a ray from the camera through the marker's screen point and see if a tree /
    // rock sits in front of it. Only re-checked ~10×/sec; result held in between.
    propTimer.current -= dt
    if (propTimer.current <= 0 && PROP_OCCLUDERS.length) {
      propTimer.current = 0.1
      _marker.set(BOAT.x, my, BOAT.z)
      const markDist = state.camera.position.distanceTo(_marker)
      _marker.project(state.camera)
      _ndc.set(_marker.x, _marker.y)
      const rc = state.raycaster
      rc.setFromCamera(_ndc, state.camera)
      const hits = rc.intersectObjects(PROP_OCCLUDERS, true)
      propBlocked.current = hits.length > 0 && hits[0].distance < markDist - 0.3
    }
    if (propBlocked.current) blocked = true

    // Fade the whole marker in only as you near the boat (and out when terrain/props
    // hide it), so the dot isn't shown at all from afar.
    const show = 1 - smoothstep(DOT_SHOW, DOT_HIDE, d)
    if (stage.current) stage.current.style.opacity = blocked ? '0' : String(show)

    // Critically-damped follow: frame-rate independent, springy-smooth.
    const k = 1 - Math.exp(-9 * Math.min(dt, 0.1))
    p.current += (target - p.current) * k
    const v = p.current

    if (dot.current) {
      dot.current.style.opacity = String(1 - v)
      dot.current.style.transform = `translate(-50%,-50%) scale(${1 - 0.35 * v})`
    }
    if (card.current) {
      card.current.style.opacity = String(v)
      card.current.style.transform = `translate(-50%,-50%) scale(${0.55 + 0.45 * v})`
      // On touch the bloomed "Set sail" card IS the button — tappable when open.
      if (IS_TOUCH) card.current.style.pointerEvents = v > 0.5 && stage.current?.style.opacity !== '0' ? 'auto' : 'none'
    }
  })

  if (!started || boatMode === 'sailing' || menuOpen || mapOpen) return null

  return (
    <group ref={anchor}>
      <Html center pointerEvents="none" zIndexRange={IS_TOUCH ? [100, 100] : [40, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={stage} style={sStage}>
          <style>{CSS}</style>
          <div ref={dot} style={sDot} />
          <div
            ref={card}
            style={sCard}
            onPointerDown={IS_TOUCH ? (e) => { e.stopPropagation(); pressKey('KeyE') } : undefined}
            onPointerUp={IS_TOUCH ? (e) => { e.stopPropagation(); releaseKey('KeyE') } : undefined}
            onPointerCancel={IS_TOUCH ? () => releaseKey('KeyE') : undefined}
          >
            {!IS_TOUCH && <span style={sCap}>E</span>}
            <span style={sLabel}>Set sail</span>
          </div>
        </div>
      </Html>
    </group>
  )
}

const HAND = "'Patrick Hand', 'Nunito', cursive"

// A breathing pulse on the resting dot, so it catches the eye from a distance.
const CSS = `
@keyframes boatDotPulse {
  0%, 100% { box-shadow: 0 2px 7px rgba(0,0,0,0.45), 0 0 0 0 rgba(246,239,218,0.55); }
  50%      { box-shadow: 0 2px 7px rgba(0,0,0,0.45), 0 0 0 7px rgba(246,239,218,0); }
}`

// Both states sit centred on the same point and crossfade; the stage is a
// zero-size anchor so <Html center> keeps that point glued over the boat.
const sStage: CSSProperties = {
  position: 'relative',
  width: 0,
  height: 0,
  transition: 'opacity 0.18s ease-out', // soft fade when terrain hides it
}

const sDot: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%,-50%)',
  width: 14,
  height: 14,
  borderRadius: '50%',
  background: '#f6efda',
  border: '1px solid #d7c8a3',
  animation: 'boatDotPulse 2.4s ease-in-out infinite',
  willChange: 'opacity, transform',
}

const sCard: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transformOrigin: 'center',
  opacity: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  padding: '7px 13px 7px 8px',
  borderRadius: 9,
  background: '#f6efda',
  border: '1px solid #d7c8a3',
  boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  willChange: 'opacity, transform',
}

const sCap: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 28,
  minWidth: 28,
  padding: '0 8px',
  borderRadius: 5,
  background: '#fdfaf2',
  color: '#4a3c26',
  fontFamily: HAND,
  fontSize: 18,
  lineHeight: 1,
  boxShadow: '0 2px 0 rgba(0,0,0,0.35)',
}

const sLabel: CSSProperties = {
  fontFamily: HAND,
  fontSize: 21,
  lineHeight: 1,
  color: '#5a4528',
}
