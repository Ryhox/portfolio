import { type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import { useWorld } from '../../state/useWorld'
import { IS_TOUCH } from '../../input/device'
import { NAV } from '../../scene/boat/boatState'
import { goToIsland } from '../../scene/core/mapTransition'
import { requestLock } from '../../scene/core/pointerLock'
import {
  archDominantIsland,
  archHeight,
  archipelagoExtent,
  GROUP_RING,
  groupLabels,
  useArchipelago,
  type IslandInstance,
} from '../../scene/archipelago/archipelago'
import { nextRefreshAt } from '../../scene/archipelago/stargazers'
import { buildMap, hexToRgb, landRamp, seaRamp } from './mapRender'
import { useT } from '../../i18n/index'
import { HAND } from '../theme'

// Paint each archipelago map pixel with the biome palette of the island beneath
// it (grey Bleakshoal, white Frostfell, sandy desert, …); open sea uses the ramp.
function archMapColor(x: number, z: number, h: number): number[] {
  if (h < 0.4) return seaRamp(h)
  const p = archDominantIsland(x, z)?.biome.palette
  return p ? landRamp(h, hexToRgb(p.sand), hexToRgb(p.grassLo), hexToRgb(p.grassHi)) : landRamp(h)
}

// The whole-archipelago map. Opened with M (in the isles) or by setting sail
// from the home isle, where it doubles as the "choose where to go" picker. Shows
// every island with its owner on hover, the group names, your position, and a
// search box — click an island (or a search hit) to travel there. Flat cozy
// colours, hand-drawn font — no glow/blur/gradient.
const CANVAS = 720 // square backing-store resolution (px)
const MAX_RESULTS = 8
const REPO_URL = 'https://github.com/Ryhox/portfolio'
const ZOOM_MIN = 1
const ZOOM_MAX = 4
const ZOOM_STEP = 1.4 // per button press / wheel notch (wheel uses 1.2)

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

// The countdown shares the archipelago's UTC-aligned 5-min refresh clock
// (nextRefreshAt), so it lands on zero exactly when the stargazer list re-pulls —
// and reads the same for every visitor.
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${m}:${pad(s)}`
}

export function WorldMap() {
  const t = useT()
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
  const tipWho = useRef<HTMLSpanElement>(null)
  const tipMeta = useRef<HTMLDivElement>(null)
  const countdownRef = useRef<HTMLSpanElement>(null)
  // Pan/zoom of the map view: zoom 1 = whole archipelago; (cx,cz) is the world
  // point at the centre of the view. Read by the rAF draw loop, so it's a ref.
  const viewRef = useRef({ zoom: 1, cx: 0, cz: 0 })

  // Clamp the pan so the zoomed window never leaves the built map bounds.
  const clampPan = () => {
    const v = viewRef.current
    const lim = rWorldRef.current - rWorldRef.current / v.zoom
    v.cx = clamp(v.cx, -lim, lim)
    v.cz = clamp(v.cz, -lim, lim)
  }
  const zoomBy = (factor: number) => {
    const v = viewRef.current
    v.zoom = clamp(v.zoom * factor, ZOOM_MIN, ZOOM_MAX)
    clampPan()
  }
  // Drag-to-pan: remember where the grab started; once the pointer moves past a
  // few px it becomes a pan (and the release is NOT treated as a travel click).
  const dragRef = useRef<{ x: number; y: number; cx: number; cz: number } | null>(null)
  const draggedRef = useRef(false)

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

  // Tick the synced countdown once a second while the map is open.
  useEffect(() => {
    if (!mapOpen) return
    const update = () => {
      const el = countdownRef.current
      if (el) el.textContent = formatCountdown(nextRefreshAt(Date.now()) - Date.now())
    }
    update()
    const id = window.setInterval(update, 1000)
    return () => window.clearInterval(id)
  }, [mapOpen])

  // Free the cursor while the map is up (Player + EscMenu both respect mapOpen).
  // Also clear the search box so every open starts fresh.
  useEffect(() => {
    if (mapOpen) {
      setQuery('')
      viewRef.current = { zoom: 1, cx: 0, cz: 0 } // every open starts fully zoomed out
      useArchipelago.getState().ensureLoaded()
      if (document.pointerLockElement) document.exitPointerLock()
    }
  }, [mapOpen])

  // Scroll-wheel zoom, anchored on the cursor (zooms toward whatever's under it).
  // Native listener so we can preventDefault (React's onWheel is passive).
  useEffect(() => {
    if (!mapOpen) return
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const v = viewRef.current
      const rWorld = rWorldRef.current
      const fx = (e.clientX - rect.left) / rect.width
      const fy = (e.clientY - rect.top) / rect.height
      const rOld = rWorld / v.zoom
      const ux = fx * 2 * rOld - rOld + v.cx // world point under the cursor
      const uz = fy * 2 * rOld - rOld + v.cz
      v.zoom = clamp(v.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2), ZOOM_MIN, ZOOM_MAX)
      const rNew = rWorld / v.zoom
      v.cx = ux - (fx * 2 * rNew - rNew) // keep that point under the cursor
      v.cz = uz - (fy * 2 * rNew - rNew)
      clampPan()
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapOpen])

  // Build the raster + run the marker draw loop while open.
  useEffect(() => {
    if (!mapOpen) return
    const rWorld = Math.max(archipelagoExtent() + 40, GROUP_RING + 140)
    rWorldRef.current = rWorld
    rasterRef.current = buildMap(archHeight, rWorld, 512, archMapColor)
    labelsRef.current = groupLabels(islands)

    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = CANVAS
    canvas.height = CANVAS
    const ctx = canvas.getContext('2d')!
    let raf = 0

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const raster = rasterRef.current
      if (!raster) return
      // Current zoom/pan window → world-to-canvas mapping for this frame.
      const { zoom, cx, cz } = viewRef.current
      const rView = rWorld / zoom
      const toCanvas = (wx: number, wz: number) => ({
        x: ((wx - cx + rView) / (2 * rView)) * CANVAS,
        y: ((wz - cz + rView) / (2 * rView)) * CANVAS,
      })
      const scale = CANVAS / (2 * rView)

      ctx.clearRect(0, 0, CANVAS, CANVAS)
      // Blit the matching crop of the full-extent raster into the canvas.
      const pxPerWorld = raster.width / (2 * rWorld)
      const sw = 2 * rView * pxPerWorld
      const sx = (cx - rView + rWorld) * pxPerWorld
      const sy = (cz - rView + rWorld) * pxPerWorld
      ctx.drawImage(raster, sx, sy, sw, sw, 0, 0, CANVAS, CANVAS)

      // The islands themselves are drawn by the biome-coloured raster — no outline
      // ring around each isle (the dark footprint border read as a hard grey edge and
      // muddied the island colours; removed at the user's request).

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
    const { zoom, cx, cz } = viewRef.current
    const rView = rWorldRef.current / zoom
    const wx = ((e.clientX - rect.left) / rect.width) * 2 * rView - rView + cx
    const wz = ((e.clientY - rect.top) / rect.height) * 2 * rView - rView + cz
    let best: IslandInstance | null = null
    let bestD = Infinity
    for (const isl of islands) {
      const d = Math.hypot(wx - isl.cx, wz - isl.cz) - isl.radius
      if (d < bestD) {
        bestD = d
        best = isl
      }
    }
    const tol = Math.max(4, rView * 0.02)
    return best && bestD < tol ? best : null
  }

  const onDown = (e: ReactMouseEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, cx: viewRef.current.cx, cz: viewRef.current.cz }
    draggedRef.current = false
  }
  const onMove = (e: ReactMouseEvent) => {
    const canvas = canvasRef.current
    const drag = dragRef.current
    if (drag && canvas) {
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      if (!draggedRef.current && Math.hypot(dx, dy) < 4) return // still just a click
      draggedRef.current = true
      const rect = canvas.getBoundingClientRect()
      const rView = rWorldRef.current / viewRef.current.zoom
      // Drag the world with the cursor → the view centre moves the opposite way.
      viewRef.current.cx = drag.cx - (dx / rect.width) * 2 * rView
      viewRef.current.cz = drag.cz - (dy / rect.height) * 2 * rView
      clampPan()
      hoverRef.current = null
      if (tipRef.current) tipRef.current.style.display = 'none'
      canvas.style.cursor = 'grabbing'
      return
    }
    const isl = pick(e)
    hoverRef.current = isl
    const tip = tipRef.current
    if (tip) {
      if (isl) {
        tip.style.display = 'block'
        tip.style.left = e.clientX + 14 + 'px'
        tip.style.top = e.clientY + 14 + 'px'
        const who = isl.isMother ? isl.groupName : isl.login
        if (tipWho.current) {
          tipWho.current.textContent = who
          // Tint the name with its island type's signature land colour.
          tipWho.current.style.color = '#' + isl.biome.palette.grassHi.toString(16).padStart(6, '0')
        }
        if (tipMeta.current) tipMeta.current.textContent = isl.isMother ? t('map.motherIsle') : isl.biome.name
      } else {
        tip.style.display = 'none'
      }
    }
    if (canvas) canvas.style.cursor = isl ? 'pointer' : 'grab'
  }
  const onUp = () => {
    dragRef.current = null
  }
  const onLeave = () => {
    dragRef.current = null
    hoverRef.current = null
    if (tipRef.current) tipRef.current.style.display = 'none'
  }
  const onClick = (e: ReactMouseEvent) => {
    if (draggedRef.current) {
      draggedRef.current = false // it was a pan, not a pick — don't travel
      return
    }
    const isl = pick(e)
    if (isl) travel(isl)
  }

  // Touch: pointer events drive the same pan as the mouse, plus two-finger pinch
  // to zoom. (Mouse keeps working — pointer events cover it too.)
  const ptrs = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)
  const onPointerDown = (e: ReactPointerEvent) => {
    canvasRef.current?.setPointerCapture(e.pointerId)
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: viewRef.current.zoom }
      dragRef.current = null
      draggedRef.current = true
    } else {
      onDown(e)
    }
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    if (ptrs.current.has(e.pointerId)) ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      viewRef.current.zoom = clamp(pinch.current.zoom * (dist / pinch.current.dist), ZOOM_MIN, ZOOM_MAX)
      clampPan()
      draggedRef.current = true
      return
    }
    onMove(e)
  }
  const onPointerEnd = (e: ReactPointerEvent) => {
    ptrs.current.delete(e.pointerId)
    if (ptrs.current.size < 2) pinch.current = null
    if (ptrs.current.size === 0) onUp()
  }
  const onPointerLeaveCanvas = () => {
    ptrs.current.clear()
    pinch.current = null
    onLeave()
  }

  if (!mapOpen) return null

  const q = query.trim().toLowerCase()
  // Mother islands are region landmarks, not stargazers — keep them out of search.
  const results = q
    ? islands.filter((i) => !i.isMother && i.login.toLowerCase().includes(q)).slice(0, MAX_RESULTS)
    : []

  return (
    <div style={sBackdrop}>
      <div style={sPanel}>
        <div style={sHeader}>
          <span style={sTitle}>{t('map.title')}</span>
          <button style={sClose} onClick={close} aria-label={t('map.closeAria')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5a4528" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div style={sCta}>
          <div style={sCtaLeft}>
            <span style={sCtaText}>{t('map.cta')}</span>
            <a style={sCtaLink} href={REPO_URL} target="_blank" rel="noopener noreferrer">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                <path d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.57L12 17.56 6.1 20.66l1.13-6.57-4.78-4.66 6.6-.96z" />
              </svg>
              {t('map.star')}
            </a>
          </div>
          <div style={sCountdown}>
            <span style={sCountdownLabel}>{t('map.nextUpdate')}</span>
            <span ref={countdownRef} style={sCountdownTime}>--:--:--</span>
          </div>
        </div>

        <div style={sSearchWrap}>
          <input
            style={sInput}
            placeholder={t('map.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
          <canvas
            ref={canvasRef}
            style={sCanvas}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onPointerLeave={onPointerLeaveCanvas}
            onClick={onClick}
          />
          <div style={sZoomCtrls}>
            <button style={sZoomBtn} onClick={() => zoomBy(ZOOM_STEP)} aria-label={t('map.zoomIn')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5a4528" strokeWidth="2.6" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button style={sZoomBtn} onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label={t('map.zoomOut')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5a4528" strokeWidth="2.6" strokeLinecap="round">
                <path d="M5 12h14" />
              </svg>
            </button>
          </div>
        </div>

        <div style={sHint}>{IS_TOUCH ? t('map.hintTouch') : t('map.hintDesktop')}</div>
      </div>

      <div ref={tipRef} style={sTip}>
        <div style={sTipName}>
          <span style={sTipTeleport}>{t('map.teleport')}</span>{' '}
          <span style={sTipTo}>{t('map.to')}</span>{' '}
          <span ref={tipWho} style={sTipWho} />
        </div>
        <div ref={tipMeta} style={sTipMeta} />
      </div>
    </div>
  )
}


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
  width: 'min(560px, 94vw)',
  maxHeight: '92vh',
  overflowY: 'auto',
  boxSizing: 'border-box',
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

const sCta: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  padding: '9px 12px',
  borderRadius: 10,
  background: '#efe4c6',
  border: '1px solid #d7c8a3',
}

const sCtaLeft: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
}

const sCtaText: CSSProperties = {
  fontFamily: HAND,
  fontSize: 17,
  color: '#5a4528',
}

const sCtaLink: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '4px 10px',
  borderRadius: 7,
  background: '#5a4528',
  color: '#f6efda',
  fontFamily: HAND,
  fontSize: 16,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}

const sCountdown: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  lineHeight: 1.1,
}

const sCountdownLabel: CSSProperties = {
  fontFamily: HAND,
  fontSize: 13,
  color: 'rgba(111,88,54,0.7)',
}

const sCountdownTime: CSSProperties = {
  fontFamily: HAND,
  fontSize: 20,
  color: '#5a4528',
  letterSpacing: 1,
  fontVariantNumeric: 'tabular-nums',
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
  position: 'relative',
  alignSelf: 'center', // keep the square map centred when the panel is wider than it
  width: 'min(520px, 84vw, 64vh)',
  height: 'min(520px, 84vw, 64vh)',
  borderRadius: 12,
  overflow: 'hidden',
  border: '1px solid #d7c8a3',
  background: '#21434f',
}

const sZoomCtrls: CSSProperties = {
  position: 'absolute',
  right: 10,
  bottom: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  zIndex: 2,
}

const sZoomBtn: CSSProperties = {
  width: 34,
  height: 34,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  borderRadius: 8,
  background: '#f6efda',
  border: '1px solid #d7c8a3',
  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
  cursor: 'pointer',
  pointerEvents: 'auto',
}

const sCanvas: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'block',
  cursor: 'grab',
  touchAction: 'none', // we handle pan + pinch ourselves; stop the browser hijacking touch
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
  fontSize: 20,
  lineHeight: 1.15,
}

// "Teleport" pops in gold; "To" is a lighter, faded gold; the name is tinted to
// its island type's land colour (set per-island in onMove).
const sTipTeleport: CSSProperties = {
  color: '#f5b13f',
}

const sTipTo: CSSProperties = {
  color: 'rgba(245,177,63,0.55)',
}

const sTipWho: CSSProperties = {
  color: '#ffffff',
  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
}

const sTipMeta: CSSProperties = {
  fontFamily: HAND,
  fontSize: 14,
  color: '#f0e6cf',
  lineHeight: 1.2,
  marginTop: 2,
}
