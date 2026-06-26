import { type CSSProperties, useEffect, useRef } from 'react'
import { useWorld } from '../state/useWorld'
import { IS_TOUCH } from '../input/device'
import { getHeight } from '../scene/terrain'
import { NAV } from '../scene/boatState'
import { buildMapProps, type MapProp } from '../scene/placement'
import {
  archDominantIsland,
  archHeight,
  archipelagoExtent,
  buildArchMapProps,
  groupLabels,
  useArchipelago,
} from '../scene/archipelago/archipelago'
import { nextRefreshAt } from '../scene/archipelago/stargazers'
import { buildMap, hexToRgb, landRamp, seaRamp } from './mapRender'

// Same UTC-aligned 5-min refresh clock the big World map counts down to, so both
// readouts hit zero together when the stargazer list re-pulls. Mirrors WorldMap's
// formatCountdown.
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${m}:${pad(s)}`
}

// Colours an archipelago map pixel with the biome palette of the island under it
// (grey Bleakshoal, white Frostfell, sandy desert, …); open sea uses the shared ramp.
function archMapColor(x: number, z: number, h: number): number[] {
  if (h < 0.4) return seaRamp(h)
  const p = archDominantIsland(x, z)?.biome.palette
  return p ? landRamp(h, hexToRgb(p.sand), hexToRgb(p.grassLo), hexToRgb(p.grassHi)) : landRamp(h)
}

// Bottom-left minimap — shown while sailing, and the whole time you're in the
// archipelago. The sea + land are rendered ONCE into an offscreen canvas; every
// frame we blit a player-centred crop and stamp the live heading marker, the .glb
// landmarks, and (in the archipelago) the island-group names. North is up. Flat
// cozy colours — no glow/blur/gradient.

const R_WORLD_HOME = 230 // home offscreen covers world [-R, R]
const VIEW = 135 // world radius shown in the minimap window
const MM = 148 // on-screen size (css px)

const PROP_COLOR = { tree: '#2f5e2a', rock: '#8b8b92', lamp: '#f3c969' } as const

export function Minimap() {
  const mapId = useWorld((s) => s.mapId)
  const sailing = useWorld((s) => s.boatMode === 'sailing')
  const islands = useArchipelago((s) => s.islands)
  const visible = sailing || mapId === 'archipelago'

  // Mother isles are region landmarks, not stargazers — exclude them from the tally.
  const stargazerCount = islands.reduce((n, i) => (i.isMother ? n : n + 1), 0)

  const countdownRef = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const islandRef = useRef<HTMLCanvasElement | null>(null)
  const propsRef = useRef<MapProp[] | null>(null)
  const labelsRef = useRef<{ name: string; x: number; z: number }[]>([])
  const rWorldRef = useRef(R_WORLD_HOME)

  useEffect(() => {
    if (!visible) return
    const isArch = mapId === 'archipelago'
    const rWorld = isArch ? Math.max(R_WORLD_HOME, archipelagoExtent() + 30) : R_WORLD_HOME
    rWorldRef.current = rWorld
    islandRef.current = buildMap(isArch ? archHeight : getHeight, rWorld, 320, isArch ? archMapColor : undefined)
    propsRef.current = isArch ? buildArchMapProps(islands) : buildMapProps()
    labelsRef.current = isArch ? groupLabels(islands) : []

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = MM * dpr
    canvas.height = MM * dpr

    const half = MM / 2
    const sc = half / VIEW // world units → minimap px
    let raf = 0
    // The whole minimap is a function of the player pose (NAV) over a static baked
    // map + markers, so when you're holding still the next frame is pixel-identical
    // — track the last-drawn pose and skip the redraw until it actually moves.
    let lpx = NaN
    let lpz = NaN
    let lfx = NaN
    let lfz = NaN

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const island = islandRef.current
      if (!island) return
      if (NAV.px === lpx && NAV.pz === lpz && NAV.fx === lfx && NAV.fz === lfz) return
      lpx = NAV.px
      lpz = NAV.pz
      lfx = NAV.fx
      lfz = NAV.fz
      const rW = rWorldRef.current
      const pxPerWorld = island.width / (2 * rW)
      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, MM, MM)
      ctx.beginPath()
      ctx.roundRect(0, 0, MM, MM, 12)
      ctx.clip()

      // Fill with the map's deep-sea colour first, so when you're near the world
      // edge the area beyond the built map reads as open ocean instead of a hard
      // dark void (it used to show the scene behind the transparent canvas).
      ctx.fillStyle = '#214350' // == C_DEEP in mapRender
      ctx.fillRect(0, 0, MM, MM)

      // land/sea crop, centred on the boat
      const ox = (NAV.px + rW) * pxPerWorld
      const oy = (NAV.pz + rW) * pxPerWorld
      const sW = 2 * VIEW * pxPerWorld
      ctx.drawImage(island, ox - sW / 2, oy - sW / 2, sW, sW, 0, 0, MM, MM)

      // .glb landmarks within view
      const props = propsRef.current
      if (props) {
        for (const p of props) {
          const dx = p.x - NAV.px
          const dz = p.z - NAV.pz
          if (Math.abs(dx) > VIEW || Math.abs(dz) > VIEW) continue
          const mx = half + dx * sc
          const my = half + dz * sc
          ctx.fillStyle = p.color ?? PROP_COLOR[p.kind]
          ctx.beginPath()
          ctx.arc(mx, my, p.kind === 'tree' ? 2.1 : 1.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // island-group names (archipelago only)
      const labels = labelsRef.current
      if (labels.length) {
        ctx.font = '600 11px "Patrick Hand", "Nunito", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineWidth = 2.5
        ctx.lineJoin = 'round'
        for (const lb of labels) {
          const dx = lb.x - NAV.px
          const dz = lb.z - NAV.pz
          if (Math.abs(dx) > VIEW * 1.25 || Math.abs(dz) > VIEW * 1.25) continue
          const mx = half + dx * sc
          const my = half + dz * sc
          ctx.strokeStyle = 'rgba(38,30,18,0.85)'
          ctx.strokeText(lb.name, mx, my)
          ctx.fillStyle = '#fffaf0'
          ctx.fillText(lb.name, mx, my)
        }
      }

      // the boat — heading arrow, always centred
      const ang = Math.atan2(NAV.fz, NAV.fx)
      ctx.save()
      ctx.translate(half, half)
      ctx.rotate(ang)
      ctx.beginPath()
      ctx.moveTo(8.5, 0)
      ctx.lineTo(-5.5, 5)
      ctx.lineTo(-2.5, 0)
      ctx.lineTo(-5.5, -5)
      ctx.closePath()
      ctx.fillStyle = '#f5e3bf'
      ctx.strokeStyle = 'rgba(40,32,20,0.75)'
      ctx.lineWidth = 1.2
      ctx.fill()
      ctx.stroke()
      ctx.restore()

      ctx.restore()
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [visible, mapId, islands])

  // Tick the synced "next update" countdown once a second while in the isles.
  useEffect(() => {
    if (mapId !== 'archipelago') return
    const update = () => {
      const el = countdownRef.current
      if (el) el.textContent = formatCountdown(nextRefreshAt(Date.now()) - Date.now())
    }
    update()
    const id = window.setInterval(update, 1000)
    return () => window.clearInterval(id)
  }, [mapId])

  if (!visible) return null

  return (
    <>
      {/* The square minimap is desktop-only — on touch it crowds the joystick, and
          the world-map button covers navigation. The stargazer tally stays. */}
      {!IS_TOUCH && (
        <div style={sWrap}>
          <canvas ref={canvasRef} style={sCanvas} />
        </div>
      )}
      {/* Right-of-minimap column (archipelago only): the stargazer tally + the
          synced "next update" countdown pinned to the top, the control-hint chips
          to the bottom — both aligned to the minimap's height. */}
      {mapId === 'archipelago' && (
        <>
          {/* Stargazer tally + synced "next update" countdown — one line, pinned to
              the bottom-centre of the screen. */}
          <div style={sStarCard}>
            <span style={sStarCount}>
              <span style={sStarNum}>{stargazerCount}</span>{' '}
              {stargazerCount === 1 ? 'Stargazer' : 'Stargazers'} {'<3'}
            </span>
            <span style={sStarDot}>·</span>
            <span style={sStarLabel}>Next possible update in</span>
            <span ref={countdownRef} style={sStarTime}>
              --:--
            </span>
          </div>
          {/* Control hints to the right of the minimap — keys are desktop-only; on
              touch the on-screen action + map buttons cover these. */}
          {!IS_TOUCH && (
            <div style={sHintStack}>
              <div style={sHintRow}>
                <span style={sHintCap}>Hold E</span>
                <span style={sHintLabel}>Sail home</span>
              </div>
              <div style={sHintRow}>
                <span style={sHintCap}>M</span>
                <span style={sHintLabel}>World map</span>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}

const HAND = "'Patrick Hand', 'Nunito', cursive"

const sWrap: CSSProperties = {
  position: 'fixed',
  left: 22,
  bottom: 22,
  width: MM,
  height: MM,
  zIndex: 120,
  borderRadius: 12,
  boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
  pointerEvents: 'none',
}

const sCanvas: CSSProperties = {
  width: MM,
  height: MM,
  borderRadius: 12,
  display: 'block',
  boxSizing: 'border-box',
  border: '5px solid #f7f1e1', // thick whitish-cream frame around the map
}

// Solid cream chip — same paper + ink palette as the Hold E / M key chips, so it
// reads as part of the same HUD family. Sits just above the minimap (left-aligned
// to it) as its little header, with a comfortable gap so nothing feels cramped.
const sStarCard: CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: 22,
  transform: 'translateX(-50%)', // pinned to the bottom-centre of the screen
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '5px 13px',
  borderRadius: 9,
  background: '#241c10', // solid dark paper, just kept small/quiet
  border: '1px solid rgba(245,233,207,0.18)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  whiteSpace: 'nowrap',
  zIndex: 120,
  pointerEvents: 'none',
  userSelect: 'none',
}

const sStarCount: CSSProperties = {
  fontFamily: HAND,
  fontSize: 15,
  lineHeight: 1,
  color: 'rgba(240,230,207,0.9)', // soft cream
}

// The count number stays light green, just a touch dimmer.
const sStarNum: CSSProperties = {
  color: '#88c97e',
  fontWeight: 700,
}

// Dot separator between the tally and the countdown.
const sStarDot: CSSProperties = {
  fontFamily: HAND,
  fontSize: 15,
  color: 'rgba(240,230,207,0.35)',
}

const sStarLabel: CSSProperties = {
  fontFamily: HAND,
  fontSize: 13,
  lineHeight: 1,
  color: 'rgba(240,230,207,0.6)',
}

const sStarTime: CSSProperties = {
  fontFamily: HAND,
  fontSize: 15,
  lineHeight: 1,
  color: 'rgba(245,177,63,0.9)', // gold, slightly softened
  letterSpacing: 1,
  fontVariantNumeric: 'tabular-nums',
}

// Hint chips beside the minimap — mirror Brand's corner hint design.
const sHintStack: CSSProperties = {
  position: 'fixed',
  left: 22 + MM + 12, // just to the right of the minimap
  bottom: 30,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  zIndex: 120,
  pointerEvents: 'none',
  userSelect: 'none',
}

const sHintRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
}

const sHintCap: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 28,
  minWidth: 28,
  padding: '0 9px',
  borderRadius: 5,
  background: '#fdfaf2',
  color: '#4a3c26',
  fontFamily: HAND,
  fontSize: 16,
  boxShadow: '0 2px 0 rgba(0,0,0,0.35)',
}

const sHintLabel: CSSProperties = {
  fontFamily: HAND,
  color: '#fff',
  fontSize: 18,
  lineHeight: 1,
  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
}
