import { type CSSProperties, type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react'
import { useWorld } from '../state/useWorld'
import { NAV } from '../scene/boatState'
import { goToIsland } from '../scene/mapTransition'
import { requestLock } from '../scene/pointerLock'
import {
  archHeight,
  archipelagoExtent,
  GROUP_RING,
  groupLabels,
  useArchipelago,
  type IslandInstance,
} from '../scene/archipelago/archipelago'
import { buildMap } from './mapRender'

// The whole-archipelago map. Opened with M (in the isles) or by setting sail
// from the home isle, where it doubles as the "choose where to go" picker. Shows
// every island with its owner on hover, the group names, your position, and a
// search box — click an island (or a search hit) to travel there. Flat cozy
// colours, hand-drawn font — no glow/blur/gradient.
const CANVAS = 720 // square backing-store resolution (px)
const MAX_RESULTS = 8

export function WorldMap() {
  const mapOpen = useWorld((s) => s.mapOpen)
  const setMapOpen = useWorld((s) => s.setMapOpen)
  const islands = useArchipelago((s) => s.islands)
  const [query, setQuery] = useState('')

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rasterRef = useRef<HTMLCanvasElement | null>(null)
  const labelsRef = useRef<{ name: string; x: number; z: number }[]>([])
  const rWorldRef = useRef(GROUP_RING + 140)
  const hoverRef = useRef<IslandInstance | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const tipName = useRef<HTMLDivElement>(null)
  const tipMeta = useRef<HTMLDivElement>(null)

  const close = () => {
    setMapOpen(false)
    requestLock()
  }
  const travel = (isl: IslandInstance) => {
    goToIsland(isl)
    close()
  }

  // M opens it (in the isles); Esc closes it. Capture phase + stop-propagation so
  // Esc beats the settings menu's own Esc handler when the map is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ws = useWorld.getState()
      if (e.code === 'KeyM' && !ws.mapOpen && ws.started && !ws.menuOpen && ws.mapId === 'archipelago') {
        e.preventDefault()
        ws.setMapOpen(true)
      } else if (e.code === 'Escape' && useWorld.getState().mapOpen) {
        e.preventDefault()
        e.stopImmediatePropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Free the cursor while the map is up (Player + EscMenu both respect mapOpen).
  useEffect(() => {
    if (mapOpen) {
      useArchipelago.getState().ensureLoaded()
      if (document.pointerLockElement) document.exitPointerLock()
    }
  }, [mapOpen])

  // Build the raster + run the marker draw loop while open.
  useEffect(() => {
    if (!mapOpen) return
    const rWorld = Math.max(archipelagoExtent() + 40, GROUP_RING + 140)
    rWorldRef.current = rWorld
    rasterRef.current = buildMap(archHeight, rWorld, 512)
    labelsRef.current = groupLabels(islands)

    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = CANVAS
    canvas.height = CANVAS
    const ctx = canvas.getContext('2d')!
    let raf = 0

    const toCanvas = (wx: number, wz: number) => ({
      x: ((wx + rWorld) / (2 * rWorld)) * CANVAS,
      y: ((wz + rWorld) / (2 * rWorld)) * CANVAS,
    })
    const scale = CANVAS / (2 * rWorld)

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const raster = rasterRef.current
      if (!raster) return
      ctx.clearRect(0, 0, CANVAS, CANVAS)
      ctx.drawImage(raster, 0, 0, raster.width, raster.height, 0, 0, CANVAS, CANVAS)

      // island markers — faint footprint + a solid dot at the centre
      for (const isl of islands) {
        const c = toCanvas(isl.cx, isl.cz)
        ctx.beginPath()
        ctx.arc(c.x, c.y, Math.max(3, isl.radius * scale), 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(40,32,20,0.22)'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(c.x, c.y, 2.6, 0, Math.PI * 2)
        ctx.fillStyle = '#3a2f1c'
        ctx.fill()
      }

      // hover highlight ring
      const hv = hoverRef.current
      if (hv) {
        const c = toCanvas(hv.cx, hv.cz)
        ctx.beginPath()
        ctx.arc(c.x, c.y, Math.max(6, hv.radius * scale) + 5, 0, Math.PI * 2)
        ctx.strokeStyle = '#fffaf0'
        ctx.lineWidth = 2.5
        ctx.stroke()
      }

      // group names
      ctx.font = '600 22px "Patrick Hand", "Nunito", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 4
      ctx.lineJoin = 'round'
      for (const lb of labelsRef.current) {
        const c = toCanvas(lb.x, lb.z)
        ctx.strokeStyle = 'rgba(38,30,18,0.85)'
        ctx.strokeText(lb.name, c.x, c.y)
        ctx.fillStyle = '#fffaf0'
        ctx.fillText(lb.name, c.x, c.y)
      }

      // your position (only meaningful once you're actually in the isles)
      if (useWorld.getState().mapId === 'archipelago') {
        const p = toCanvas(NAV.px, NAV.pz)
        const ang = Math.atan2(NAV.fz, NAV.fx)
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(ang)
        ctx.beginPath()
        ctx.moveTo(10, 0)
        ctx.lineTo(-6.5, 6)
        ctx.lineTo(-3, 0)
        ctx.lineTo(-6.5, -6)
        ctx.closePath()
        ctx.fillStyle = '#f5b13f'
        ctx.strokeStyle = 'rgba(40,32,20,0.85)'
        ctx.lineWidth = 1.6
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [mapOpen, islands])

  // cursor → nearest island within a small tolerance
  const pick = (e: ReactMouseEvent): IslandInstance | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const rWorld = rWorldRef.current
    const wx = ((e.clientX - rect.left) / rect.width) * 2 * rWorld - rWorld
    const wz = ((e.clientY - rect.top) / rect.height) * 2 * rWorld - rWorld
    let best: IslandInstance | null = null
    let bestD = Infinity
    for (const isl of islands) {
      const d = Math.hypot(wx - isl.cx, wz - isl.cz) - isl.radius
      if (d < bestD) {
        bestD = d
        best = isl
      }
    }
    const tol = Math.max(7, rWorld * 0.012)
    return best && bestD < tol ? best : null
  }

  const onMove = (e: ReactMouseEvent) => {
    const isl = pick(e)
    hoverRef.current = isl
    const tip = tipRef.current
    if (tip) {
      if (isl) {
        tip.style.display = 'block'
        tip.style.left = e.clientX + 14 + 'px'
        tip.style.top = e.clientY + 14 + 'px'
        if (tipName.current) tipName.current.textContent = isl.name
        if (tipMeta.current) tipMeta.current.textContent = `${isl.groupName} · ${isl.biome.name} · ${isl.size.name}`
      } else {
        tip.style.display = 'none'
      }
    }
    if (canvasRef.current) canvasRef.current.style.cursor = isl ? 'pointer' : 'default'
  }
  const onLeave = () => {
    hoverRef.current = null
    if (tipRef.current) tipRef.current.style.display = 'none'
  }
  const onClick = (e: ReactMouseEvent) => {
    const isl = pick(e)
    if (isl) travel(isl)
  }

  if (!mapOpen) return null

  const q = query.trim().toLowerCase()
  const results = q ? islands.filter((i) => i.login.toLowerCase().includes(q)).slice(0, MAX_RESULTS) : []

  return (
    <div style={sBackdrop}>
      <div style={sPanel}>
        <div style={sHeader}>
          <span style={sTitle}>The Archipelago</span>
          <button style={sClose} onClick={close} aria-label="Close map">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5a4528" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div style={sSearchWrap}>
          <input
            style={sInput}
            placeholder="Search a stargazer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {results.length > 0 && (
            <div style={sResults}>
              {results.map((isl) => (
                <button key={isl.id} style={sResult} onClick={() => travel(isl)}>
                  <span style={sResultName}>{isl.login}</span>
                  <span style={sResultMeta}>{isl.groupName}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={sMapBox}>
          <canvas ref={canvasRef} style={sCanvas} onMouseMove={onMove} onMouseLeave={onLeave} onClick={onClick} />
        </div>

        <div style={sHint}>Hover an island for its owner · click to travel there · Esc to close</div>
      </div>

      <div ref={tipRef} style={sTip}>
        <div ref={tipName} style={sTipName} />
        <div ref={tipMeta} style={sTipMeta} />
      </div>
    </div>
  )
}

const HAND = "'Patrick Hand', 'Nunito', cursive"

const sBackdrop: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 140,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(20,16,10,0.55)',
}

const sPanel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 10,
  padding: 16,
  borderRadius: 16,
  background: '#f6efda',
  border: '1px solid #d7c8a3',
  boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
}

const sHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const sTitle: CSSProperties = {
  fontFamily: HAND,
  fontSize: 26,
  color: '#5a4528',
  letterSpacing: 1,
}

const sClose: CSSProperties = {
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  borderRadius: 8,
  background: '#efe4c6',
  border: '1px solid #d7c8a3',
  cursor: 'pointer',
}

const sSearchWrap: CSSProperties = { position: 'relative' }

const sInput: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 12px',
  borderRadius: 9,
  border: '1px solid #d7c8a3',
  background: '#fffaf0',
  color: '#5a4528',
  fontFamily: HAND,
  fontSize: 18,
  outline: 'none',
}

const sResults: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  right: 0,
  zIndex: 2,
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 9,
  overflow: 'hidden',
  background: '#fffaf0',
  border: '1px solid #d7c8a3',
  boxShadow: '0 8px 22px rgba(0,0,0,0.35)',
}

const sResult: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 12,
  padding: '8px 12px',
  border: 'none',
  borderBottom: '1px solid #ece0c2',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: HAND,
  textAlign: 'left',
}

const sResultName: CSSProperties = { color: '#5a4528', fontSize: 18 }
const sResultMeta: CSSProperties = { color: 'rgba(111,88,54,0.7)', fontSize: 15 }

const sMapBox: CSSProperties = {
  width: 'min(78vmin, 720px)',
  height: 'min(78vmin, 720px)',
  borderRadius: 12,
  overflow: 'hidden',
  border: '1px solid #d7c8a3',
  background: '#21434f',
}

const sCanvas: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'block',
}

const sHint: CSSProperties = {
  fontFamily: HAND,
  fontSize: 15,
  color: 'rgba(111,88,54,0.7)',
  textAlign: 'center',
}

const sTip: CSSProperties = {
  position: 'fixed',
  zIndex: 141,
  display: 'none',
  pointerEvents: 'none',
  padding: '6px 10px',
  borderRadius: 8,
  background: 'rgba(36,28,16,0.92)',
  border: '1px solid rgba(245,233,207,0.25)',
  maxWidth: 260,
}

const sTipName: CSSProperties = {
  fontFamily: HAND,
  fontSize: 18,
  color: '#ffffff',
  lineHeight: 1.1,
}

const sTipMeta: CSSProperties = {
  fontFamily: HAND,
  fontSize: 14,
  color: '#f0e6cf',
  lineHeight: 1.2,
  marginTop: 2,
}
