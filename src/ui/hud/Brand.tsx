import { type CSSProperties, type ReactNode, useEffect } from 'react'
import { useWorld } from '../../state/useWorld'
import { IS_TOUCH } from '../../input/device'
import { useT } from '../../i18n/index'
import { HAND } from '../theme'

function clock(t: number) {
  const total = t * 24
  const h = Math.floor(total)
  const m = Math.floor((total - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Persistent corner overlay: the logo (top-left, every phase), a top-right cluster
// with the live island clock (+ a menu button on touch), and the keyboard legend
// (bottom-right) on desktop. Touch hides the legend (keys are meaningless there)
// and uses the on-screen buttons instead. Click-through except the gear button.
// The live clock readout subscribes to the DERIVED "HH:MM" string rather than the
// raw `t` (which the day/night driver mutates every frame), so zustand only
// re-renders this tiny node when the displayed minute actually changes.
function Clock() {
  const label = useWorld((s) => clock(s.t))
  return (
    <div style={sClock}>
      <ClockIcon />
      <span>{label}</span>
    </div>
  )
}

export function Brand() {
  const t = useT()
  const started = useWorld((s) => s.started)
  const muted = useWorld((s) => s.muted)
  const boatMode = useWorld((s) => s.boatMode)
  const mapId = useWorld((s) => s.mapId)

  // "N" toggles mute (M opens the world map — handled by WorldMap).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyN') useWorld.getState().toggleMuted()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const openMenu = () => useWorld.getState().setMenuOpen(true)

  return (
    <div style={sContainer}>
      <img src="/ui/logo.png" alt="logo" style={sLogo} />

      {/* Menu + clock FADE in once the intro fly-in lands (started). Always mounted
          so the opacity transition runs; the logo stays through every phase. */}
      <div style={{ ...sTopRight, opacity: started ? 1 : 0, transition: 'opacity 0.7s ease' }}>
        <Clock />
        {/* The on-screen menu button is for touch only — on desktop, Esc opens
            settings (keyboard-driven), so no button clutters the corner. It sits to
            the RIGHT of the clock, cream like the rest of the HUD. */}
        {IS_TOUCH && (
          <button
            type="button"
            aria-label={t('brand.openMenuAria')}
            onClick={openMenu}
            style={{ ...sGear, pointerEvents: started ? 'auto' : 'none' }}
          >
            <MenuIcon />
          </button>
        )}
      </div>

      {/* Desktop keyboard legend (bottom-right). Hidden on touch — there the
          on-screen buttons replace it. */}
      {!IS_TOUCH && (
        <div style={{ ...sHints, opacity: started ? 1 : 0, transition: 'opacity 0.7s ease' }}>
          {boatMode === 'sailing' ? (
            <>
              <Hint cap="WASD" label={t('hint.steer')} />
              <Hint cap="Mouse" label={t('hint.look')} />
              <Hint cap="E" label={t('hint.stepAshore')} />
              {mapId !== 'archipelago' && <Hint cap="Horizon" label={t('hint.newIsles')} />}
              <Hint cap="N" label={t('hint.mute')} indicator={<SpeakerIcon muted={muted} />} />
              <Hint cap="ESC" label={t('hint.settings')} />
            </>
          ) : (
            <>
              <Hint cap="WASD" label={t('hint.move')} />
              <Hint cap="Mouse" label={t('hint.look')} />
              <Hint cap="Shift" label={t('hint.sprint')} />
              <Hint cap="N" label={t('hint.mute')} indicator={<SpeakerIcon muted={muted} />} />
              <Hint cap="ESC" label={t('hint.settings')} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Small speaker glyph used as the live mute/sound indicator beside the N hint.
function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ flexShrink: 0, display: 'block' }}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
      {muted ? (
        <>
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </>
      )}
    </svg>
  )
}

function Hint({ cap, label, indicator }: { cap: string; label: string; indicator?: ReactNode }) {
  return (
    <div style={sHintRow}>
      <span style={sCap}>{cap}</span>
      <span style={sHintLabel}>
        <span>{label}</span>
        {indicator}
      </span>
    </div>
  )
}

// A hand-drawn-feeling clock face, sized and weighted to sit beside the Patrick
// Hand digits. Slightly rounded strokes so it reads as part of the same lettering.
function ClockIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ display: 'block' }}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7.5 12 12 15.5 14" />
    </svg>
  )
}

// Menu glyph (three lines + a settings dot) for the top-right button that opens
// the settings sheet — the on-screen replacement for "ESC".
function MenuIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ display: 'block' }}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  )
}

const sContainer: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 120,
  pointerEvents: 'none',
}

const sLogo: CSSProperties = {
  position: 'fixed',
  top: 'calc(env(safe-area-inset-top, 0px) + 14px)',
  left: 'calc(env(safe-area-inset-left, 0px) + 16px)',
  height: 'clamp(32px, 4.6vw, 42px)', width: 'auto',
  filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.55))',
  userSelect: 'none',
}

const sTopRight: CSSProperties = {
  position: 'fixed',
  top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
  right: 'calc(env(safe-area-inset-right, 0px) + 16px)',
  display: 'flex', alignItems: 'center', gap: 12,
}

const sClock: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontFamily: HAND, fontSize: 'clamp(22px, 2.6vw, 30px)', color: '#fff',
  letterSpacing: 1, lineHeight: 1,
  textShadow: '0 2px 5px rgba(0,0,0,0.55)',
  filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.55))',
}

const sGear: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 44, height: 44, padding: 0,
  borderRadius: 12,
  background: '#f6efda', color: '#5a4528',
  border: '1px solid #d7c8a3', cursor: 'pointer',
  boxShadow: '0 3px 10px rgba(0,0,0,0.4)',
  WebkitTapHighlightColor: 'transparent',
}

const sHints: CSSProperties = {
  position: 'fixed', right: 26, bottom: 24,
  display: 'flex', flexDirection: 'column', gap: 8,
}

const sHintRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end',
}

const sCap: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  height: 28, minWidth: 28, padding: '0 9px', borderRadius: 5,
  background: '#fdfaf2', color: '#4a3c26',
  fontFamily: HAND, fontSize: 16,
  boxShadow: '0 2px 0 rgba(0,0,0,0.35)',
}

const sHintLabel: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1,
  fontFamily: HAND, color: '#fff', fontSize: 18,
  minWidth: 58, textAlign: 'left',
  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
}
