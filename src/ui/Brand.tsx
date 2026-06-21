import { type CSSProperties, type ReactNode, useEffect } from 'react'
import { useWorld } from '../state/useWorld'

const HAND = "'Patrick Hand', 'Nunito', cursive"

function clock(t: number) {
  const total = t * 24
  const h = Math.floor(total)
  const m = Math.floor((total - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Persistent corner overlay: the logo (top-left, every phase), the live island
// clock (top-centre, in-game), and the player movement hints (bottom-right, shown
// the whole time you're exploring but hidden while the settings sheet is open).
// Click-through except where noted.
export function Brand() {
  const t        = useWorld(s => s.t)
  const started  = useWorld(s => s.started)
  const muted    = useWorld(s => s.muted)

  // "M" still toggles mute even though there's no on-screen button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') useWorld.getState().toggleMuted()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div style={sContainer}>
      <img src="/ui/logo.png" alt="logo" style={sLogo} />

      {started && (
        <div style={sClock}>
          <ClockIcon />
          <span>{clock(t)}</span>
        </div>
      )}

      {started && (
        <div style={sHints}>
          <Hint cap="WASD"  label="Move" />
          <Hint cap="Mouse" label="Look" />
          <Hint cap="Shift" label="Sprint" />
          <Hint cap="M"     label="Mute" indicator={<SpeakerIcon muted={muted} />} />
          <Hint cap="ESC"   label="Settings" />
        </div>
      )}
    </div>
  )
}

// A hand-drawn-feeling clock face, sized and weighted to sit beside the Patrick
// Hand digits. Slightly rounded strokes so it reads as part of the same lettering.
function ClockIcon() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ display: 'block' }}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7.5 12 12 15.5 14" />
    </svg>
  )
}

// Small speaker glyph used as the live mute/sound indicator beside the M hint.
// Sized to sit inline with the handwritten label text.
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

const sContainer: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 120,
  pointerEvents: 'none',
}

const sLogo: CSSProperties = {
  position: 'fixed', top: 16, left: 18,
  height: 42, width: 'auto',
  filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.55))',
  userSelect: 'none',
}

const sClock: CSSProperties = {
  position: 'fixed', top: 16, right: 20,
  display: 'flex', alignItems: 'center', gap: 8,
  fontFamily: HAND, fontSize: 30, color: '#fff',
  letterSpacing: 1, lineHeight: 1,
  textShadow: '0 2px 5px rgba(0,0,0,0.55)',
  filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.55))',
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
