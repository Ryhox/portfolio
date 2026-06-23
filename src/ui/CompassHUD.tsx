import { type CSSProperties, useEffect, useRef } from 'react'
import { useWorld } from '../state/useWorld'
import { NAV } from '../scene/boatState'

// Top-centre compass strip. Shows the eight compass points (N, NE, E, SE, S, SW,
// W, NW) on a band that scrolls as you turn — the heading you're facing sits under
// the centre marker — and fades out toward the left and right edges (CSS mask).
// North = world −Z (the way you spawn facing). Reads NAV directly via rAF so it
// works while walking AND sailing, with no re-renders. Flat cozy ink, no glow.

const DIRS: { label: string; deg: number; cardinal?: boolean }[] = [
  { label: 'N', deg: 0, cardinal: true },
  { label: 'NE', deg: 45 },
  { label: 'E', deg: 90, cardinal: true },
  { label: 'SE', deg: 135 },
  { label: 'S', deg: 180, cardinal: true },
  { label: 'SW', deg: 225 },
  { label: 'W', deg: 270, cardinal: true },
  { label: 'NW', deg: 315 },
]

const W = 520 // canvas backing-store width (px)
const H = 50
const SPAN = 170 // degrees of arc visible across the full strip
const PXPERDEG = W / SPAN

export function CompassHUD() {
  const started = useWorld((s) => s.started)
  const menuOpen = useWorld((s) => s.menuOpen)
  const mapOpen = useWorld((s) => s.mapOpen)
  const visible = started && !menuOpen && !mapOpen
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!visible) return
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')!
    const norm = (d: number) => ((d + 540) % 360) - 180 // wrap to −180..180
    let raf = 0

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const bearing = (Math.atan2(NAV.fx, -NAV.fz) * 180) / Math.PI
      const cx = W / 2
      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, W, H)

      // Tick marks every 15° (longer/brighter on the 45° points).
      for (let deg = 0; deg < 360; deg += 15) {
        const x = cx + norm(deg - bearing) * PXPERDEG
        if (x < -20 || x > W + 20) continue
        const major = deg % 45 === 0
        ctx.strokeStyle = major ? 'rgba(255,250,240,0.75)' : 'rgba(255,250,240,0.35)'
        ctx.lineWidth = major ? 2 : 1
        ctx.beginPath()
        ctx.moveTo(x, 8)
        ctx.lineTo(x, major ? 18 : 14)
        ctx.stroke()
      }

      // Direction labels.
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      for (const dir of DIRS) {
        const x = cx + norm(dir.deg - bearing) * PXPERDEG
        if (x < -30 || x > W + 30) continue
        const big = !!dir.cardinal
        ctx.font = `${big ? 700 : 600} ${big ? 25 : 18}px "Patrick Hand", "Nunito", sans-serif`
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(20,16,10,0.55)'
        ctx.strokeText(dir.label, x, 35)
        ctx.fillStyle = dir.label === 'N' ? '#f5b13f' : big ? '#fffaf0' : 'rgba(245,233,207,0.85)'
        ctx.fillText(dir.label, x, 35)
      }

      // Centre marker — a small gold triangle pointing down at the current heading.
      ctx.fillStyle = '#f5b13f'
      ctx.strokeStyle = 'rgba(20,16,10,0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx - 6, 0)
      ctx.lineTo(cx + 6, 0)
      ctx.lineTo(cx, 9)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      ctx.restore()
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [visible])

  if (!visible) return null

  return (
    <div style={sWrap}>
      <canvas ref={canvasRef} style={sCanvas} />
    </div>
  )
}

const sWrap: CSSProperties = {
  position: 'fixed',
  top: 14,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 119,
  pointerEvents: 'none',
}

// Fade the band out at both ends so it reads as an open horizon, not a boxed bar.
const FADE = 'linear-gradient(to right, transparent 0%, #000 22%, #000 78%, transparent 100%)'

const sCanvas: CSSProperties = {
  width: 420,
  height: 40,
  display: 'block',
  maskImage: FADE,
  WebkitMaskImage: FADE,
}
