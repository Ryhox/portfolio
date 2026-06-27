import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { type CSSProperties, useRef } from 'react'
import { Group } from 'three'
import { useWorld } from '../../state/useWorld'
import { getHeight } from '../terrain/terrain'
import { ACTIVE, activateNearest } from './interact'
import { IS_TOUCH } from '../../input/device'
import { HAND } from '../../ui/theme'

// A cozy "press E" interact marker. A small resting dot appears when you're near;
// it blooms into the key-cap + label ONLY when this is the armed entry — i.e. the
// one you're both close to AND looking at (interact.ts decides, one at a time).
// Terrain occlusion is analytic (a few getHeight samples — no scene raycast). All
// per-frame work is written straight to the DOM via refs, never re-rendering.

export function InteractMarker({
  id,
  x,
  y,
  z,
  label,
  hint,
  showDist = 7,
}: {
  id: string
  x: number
  y: number
  z: number
  label: string
  hint?: string
  showDist?: number // a resting dot appears within this distance
}) {
  const dot = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const p = useRef(0)
  const started = useWorld((s) => s.started)
  const menuOpen = useWorld((s) => s.menuOpen)
  const mapOpen = useWorld((s) => s.mapOpen)
  const projectsOpen = useWorld((s) => s.projectsOpen)
  const sitting = useWorld((s) => s.sitting)
  const boatMode = useWorld((s) => s.boatMode)
  const groupRef = useRef<Group>(null)

  useFrame((state, dt) => {
    const cam = state.camera.position
    const d = Math.hypot(cam.x - x, cam.z - z)
    const armed = ACTIVE.id === id
    const near = d < showDist
    const target = armed ? 1 : 0

    // Analytic terrain occlusion along the sight line (cheap noise lookups).
    let blocked = false
    for (let i = 1; i < 7; i++) {
      const f = i / 7
      const sx = cam.x + (x - cam.x) * f
      const sz = cam.z + (z - cam.z) * f
      const sy = cam.y + (y - cam.y) * f
      if (getHeight(sx, sz) > sy + 0.25) {
        blocked = true
        break
      }
    }
    // Visible if armed (always show the prompt) or just nearby (resting dot).
    const visible = !blocked && (armed || near)
    if (stage.current) stage.current.style.opacity = visible ? '1' : '0'

    const k = 1 - Math.exp(-12 * Math.min(dt, 0.1))
    p.current += (target - p.current) * k
    const v = p.current
    if (dot.current) {
      dot.current.style.opacity = String(1 - v)
      dot.current.style.transform = `translate(-50%,-50%) scale(${1 - 0.35 * v})`
    }
    if (card.current) {
      card.current.style.opacity = String(v)
      card.current.style.transform = `translate(-50%,-50%) scale(${0.55 + 0.45 * v})`
      // On touch the bloomed card IS the button — only tappable while armed & shown.
      if (IS_TOUCH) card.current.style.pointerEvents = armed && visible ? 'auto' : 'none'
    }
  })

  if (!started || boatMode === 'sailing' || menuOpen || mapOpen || projectsOpen || sitting) return null

  // Callers pass an already touch-aware, localized hint.
  const shownHint = hint

  return (
    <group ref={groupRef} position={[x, y, z]}>
      <Html center pointerEvents="none" zIndexRange={IS_TOUCH ? [100, 100] : [40, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={stage} style={sStage}>
          <style>{CSS}</style>
          <div ref={dot} style={sDot} />
          <div
            ref={card}
            style={sCard}
            onPointerDown={IS_TOUCH ? (e) => { e.stopPropagation(); activateNearest() } : undefined}
          >
            {!IS_TOUCH && <span style={sCap}>E</span>}
            <span style={sCol}>
              <span style={sLabel}>{label}</span>
              {shownHint && <span style={sHint}>{shownHint}</span>}
            </span>
          </div>
        </div>
      </Html>
    </group>
  )
}

const CSS = `
@keyframes interactDotPulse {
  0%, 100% { box-shadow: 0 2px 7px rgba(0,0,0,0.45), 0 0 0 0 rgba(246,239,218,0.55); }
  50%      { box-shadow: 0 2px 7px rgba(0,0,0,0.45), 0 0 0 7px rgba(246,239,218,0); }
}`

const sStage: CSSProperties = {
  position: 'relative',
  width: 0,
  height: 0,
  transition: 'opacity 0.18s ease-out',
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
  animation: 'interactDotPulse 2.4s ease-in-out infinite',
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

const sCol: CSSProperties = { display: 'flex', flexDirection: 'column', lineHeight: 1.05 }

const sLabel: CSSProperties = {
  fontFamily: HAND,
  fontSize: 21,
  color: '#5a4528',
}

const sHint: CSSProperties = {
  fontFamily: HAND,
  fontSize: 14,
  color: 'rgba(90,69,40,0.7)',
}
