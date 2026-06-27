import { type CSSProperties, type PointerEvent as RPointerEvent, useEffect, useRef, useState } from 'react'
import { useWorld } from '../../state/useWorld'
import { IS_TOUCH } from '../../input/device'
import { INPUT, pressKey, releaseKey, tapKey } from '../../input/input'
import { BOAT } from '../../scene/boat/boatState'
import { ENTERING, returnHome } from '../../scene/core/mapTransition'
import { useT, type StringKey } from '../../i18n/index'
import { HAND } from '../theme'

// On-screen controls for phones / tablets (only when IS_TOUCH). Two things touch
// can't do through the keyboard: an analog joystick (left) writing INPUT.move, and
// a drag-to-look surface (right) writing INPUT.look.
//
// INITIATING things — sit, set sail, read the board, open About — is done by
// tapping the prompt already rendered in the world (InteractMarker / BoatPrompt).
// The only on-screen buttons are: a left cluster (Info / Map) and a single
// bottom-right button that is EXIT-only — Close / Leave / Stand up / Step ashore,
// and "Home" to leave a stargazer isle. No initiation labels live in the corner.

const JOY_R = 56 // joystick travel radius (px)
// Touch look feels sluggish at the mouse sensitivity (a finger only travels a
// screen-width), so amplify the drag delta — one comfortable swipe ≈ a big turn.
const LOOK_GAIN = 3.2

type Exit = { label: StringKey; hold: boolean; fn?: () => void }

// The bottom-right button, derived each frame. `hold` presses/holds KeyE (tap =
// step ashore, long-hold in the archipelago = sail home); the rest flip state.
// `label` is an i18n key, translated where it's rendered.
function currentExit(): Exit | null {
  const ws = useWorld.getState()
  // The projects board has its OWN ✕ on the card, and island info closes via its
  // own button turning into an ✕ — so neither shows a bottom-right button.
  if (ws.aboutOpen) return { label: 'touch.close', hold: false, fn: () => ws.setAboutOpen(false) }
  if (ws.sitting) return { label: 'touch.standUp', hold: false, fn: () => ws.setSitting(false) }
  if (BOAT.mode === 'sailing') return { label: 'touch.stepAshore', hold: true }
  if (ws.mapId === 'archipelago') return { label: 'touch.home', hold: false, fn: () => returnHome() }
  return null
}

export function TouchControls() {
  const t = useT()
  const started = useWorld((s) => s.started)
  const menuOpen = useWorld((s) => s.menuOpen)
  const mapOpen = useWorld((s) => s.mapOpen)
  const mapId = useWorld((s) => s.mapId)
  const infoOpen = useWorld((s) => s.infoOpen)

  const [exitLabel, setExitLabel] = useState<StringKey | null>(null)
  const [infoAvail, setInfoAvail] = useState(false)
  const [hint, setHint] = useState(true)

  const exitRef = useRef<Exit | null>(null)
  const heldE = useRef(false)

  const joyBase = useRef<HTMLDivElement>(null)
  const joyThumb = useRef<HTMLDivElement>(null)
  const joyId = useRef<number | null>(null)
  const joyOrigin = useRef({ x: 0, y: 0 })

  const lookId = useRef<number | null>(null)
  const lookLast = useRef({ x: 0, y: 0 })

  const active = IS_TOUCH && started && !menuOpen && !mapOpen
  const archipelago = mapId === 'archipelago'

  // Poll the exit action + info availability (cheap; writes state only on change).
  useEffect(() => {
    if (!active) return
    let raf = 0
    const tick = () => {
      const e = currentExit()
      exitRef.current = e
      const next = e?.label ?? null
      setExitLabel((prev) => (prev === next ? prev : next))
      const info = ENTERING.stats != null
      setInfoAvail((prev) => (prev === info ? prev : info))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])

  useEffect(() => {
    if (!active) return
    const id = setTimeout(() => setHint(false), 5000)
    return () => clearTimeout(id)
  }, [active])

  useEffect(() => {
    if (!active && heldE.current) { heldE.current = false; releaseKey('KeyE') }
  }, [active])

  if (!active) return null

  // ── Joystick ───────────────────────────────────────────────────────────────
  const onJoyDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (joyId.current !== null) return
    joyId.current = e.pointerId
    joyOrigin.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
    if (joyBase.current) {
      joyBase.current.style.left = `${e.clientX}px`
      joyBase.current.style.top = `${e.clientY}px`
      joyBase.current.style.opacity = '1'
    }
    moveJoy(e.clientX, e.clientY)
  }
  const onJoyMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== joyId.current) return
    moveJoy(e.clientX, e.clientY)
  }
  const moveJoy = (x: number, y: number) => {
    let dx = x - joyOrigin.current.x
    let dy = y - joyOrigin.current.y
    const d = Math.hypot(dx, dy)
    if (d > JOY_R) { dx = (dx / d) * JOY_R; dy = (dy / d) * JOY_R }
    INPUT.move.x = dx / JOY_R
    INPUT.move.y = -dy / JOY_R
    if (joyThumb.current) joyThumb.current.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
  }
  const endJoy = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== joyId.current) return
    joyId.current = null
    INPUT.move.x = 0
    INPUT.move.y = 0
    if (joyBase.current) joyBase.current.style.opacity = '0'
    if (joyThumb.current) joyThumb.current.style.transform = 'translate(-50%, -50%)'
  }

  // ── Drag-to-look ─────────────────────────────────────────────────────────────
  const onLookDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (lookId.current !== null) return
    lookId.current = e.pointerId
    lookLast.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onLookMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== lookId.current) return
    INPUT.look.dx += (e.clientX - lookLast.current.x) * LOOK_GAIN
    INPUT.look.dy += (e.clientY - lookLast.current.y) * LOOK_GAIN
    lookLast.current = { x: e.clientX, y: e.clientY }
  }
  const endLook = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== lookId.current) return
    lookId.current = null
  }

  // ── Exit button ──────────────────────────────────────────────────────────────
  const onExitDown = (e: RPointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    const a = exitRef.current
    if (!a) return
    if (a.hold) { heldE.current = true; pressKey('KeyE') }
    else a.fn?.()
  }
  const onExitUp = () => {
    if (heldE.current) { heldE.current = false; releaseKey('KeyE') }
  }

  // Lift the bottom-right button above the stargazer footer on the isles.
  const exitBottom = archipelago
    ? 'calc(env(safe-area-inset-bottom, 0px) + 92px)'
    : 'calc(env(safe-area-inset-bottom, 0px) + 26px)'

  return (
    <>
      {/* Look surface (right). Low z so in-world prompts (z100) get the tap first. */}
      <div
        style={sLookZone}
        onPointerDown={onLookDown}
        onPointerMove={onLookMove}
        onPointerUp={endLook}
        onPointerCancel={endLook}
      />
      <div
        style={sJoyZone}
        onPointerDown={onJoyDown}
        onPointerMove={onJoyMove}
        onPointerUp={endJoy}
        onPointerCancel={endJoy}
      />
      <div ref={joyBase} style={sJoyBase}>
        <div ref={joyThumb} style={sJoyThumb} />
      </div>

      {/* Left cluster: Info + Map, bottom-left at the SAME height as the exit button. */}
      <div style={{ ...sLeft, bottom: exitBottom }}>
        {infoAvail && (
          <button type="button" style={sRound} onPointerDown={(e) => { e.preventDefault(); useWorld.getState().toggleInfo() }} aria-label={infoOpen ? t('touch.closeInfoAria') : t('touch.infoAria')}>
            {infoOpen ? (
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            ) : (
              <span style={sRoundGlyph}>i</span>
            )}
          </button>
        )}
        {archipelago && (
          <button type="button" style={sRound} onPointerDown={(e) => { e.preventDefault(); tapKey('KeyM') }} aria-label={t('touch.worldMapAria')}>
            <MapGlyph />
          </button>
        )}
      </div>

      {/* Bottom-right: exit-only (Close / Leave / Stand up / Step ashore / Home). */}
      {exitLabel && (
        <button
          type="button"
          style={{ ...sExit, bottom: exitBottom }}
          onPointerDown={onExitDown}
          onPointerUp={onExitUp}
          onPointerCancel={onExitUp}
        >
          {t(exitLabel)}
        </button>
      )}

      <div style={{ ...sHint, bottom: archipelago ? 'calc(env(safe-area-inset-bottom, 0px) + 150px)' : 'calc(env(safe-area-inset-bottom, 0px) + 96px)', opacity: hint ? 0.92 : 0 }}>
        {t('touch.moveLookHint')}
      </div>
    </>
  )
}

function MapGlyph() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  )
}

const sLookZone: CSSProperties = {
  position: 'fixed', top: 0, right: 0, width: '52%', height: '100%',
  zIndex: 40, touchAction: 'none',
}

const sJoyZone: CSSProperties = {
  position: 'fixed', top: 0, left: 0, width: '48%', height: '100%',
  zIndex: 40, touchAction: 'none',
}

const sJoyBase: CSSProperties = {
  position: 'fixed', left: 0, top: 0, zIndex: 45,
  width: JOY_R * 2, height: JOY_R * 2,
  marginLeft: -JOY_R, marginTop: -JOY_R,
  borderRadius: '50%',
  background: 'rgba(20,16,10,0.22)',
  border: '2px solid rgba(246,239,218,0.5)',
  opacity: 0, transition: 'opacity 0.12s ease',
  pointerEvents: 'none',
}

const sJoyThumb: CSSProperties = {
  position: 'absolute', left: '50%', top: '50%',
  width: 54, height: 54, borderRadius: '50%',
  transform: 'translate(-50%, -50%)',
  background: 'rgba(246,239,218,0.92)',
  border: '1px solid #d7c8a3',
  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
}

const sLeft: CSSProperties = {
  position: 'fixed', zIndex: 110,
  left: 'calc(env(safe-area-inset-left, 0px) + 18px)',
  display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12,
}

const sExit: CSSProperties = {
  position: 'fixed', zIndex: 110,
  right: 'calc(env(safe-area-inset-right, 0px) + 18px)',
  minWidth: 96, minHeight: 56, padding: '0 22px',
  borderRadius: 16,
  background: '#f6efda', color: '#5a4528',
  border: '1px solid #d7c8a3',
  fontFamily: HAND, fontSize: 21, lineHeight: 1, cursor: 'pointer',
  boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
  WebkitTapHighlightColor: 'transparent', touchAction: 'none',
}

const sRound: CSSProperties = {
  width: 50, height: 50, padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: '50%',
  background: 'rgba(20,16,10,0.34)', color: '#fff',
  border: '1px solid rgba(246,239,218,0.4)', cursor: 'pointer',
  boxShadow: '0 3px 10px rgba(0,0,0,0.4)',
  WebkitTapHighlightColor: 'transparent', touchAction: 'none',
}

const sRoundGlyph: CSSProperties = {
  fontFamily: HAND, fontSize: 26, fontWeight: 700, lineHeight: 1,
}

const sHint: CSSProperties = {
  position: 'fixed', zIndex: 110,
  left: '50%', transform: 'translateX(-50%)',
  padding: '7px 16px', borderRadius: 999,
  background: 'rgba(20,16,10,0.4)', color: '#f6efda',
  fontFamily: HAND, fontSize: 16, whiteSpace: 'nowrap',
  pointerEvents: 'none', transition: 'opacity 0.6s ease',
}
