import { type CSSProperties, useState } from 'react'
import { useWorld } from '../state/useWorld'
import { IS_TOUCH } from '../input/device'

// A short, dismissible note on phones/tablets: the world is richest on desktop.
// Shown on the idle "tap to begin" screen and gone once you enter (or dismiss it).
// Stops its own taps from bubbling so it never triggers the click-to-start.
export function TouchDisclaimer() {
  const started = useWorld((s) => s.started)
  const [dismissed, setDismissed] = useState(false)

  if (!IS_TOUCH) return null
  const show = !started && !dismissed

  return (
    <div
      style={{ ...sWrap, opacity: show ? 1 : 0, pointerEvents: show ? 'auto' : 'none' }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <MonitorIcon />
      <span style={sText}>Best experienced on desktop</span>
      <button
        type="button"
        aria-label="Dismiss"
        style={sClose}
        onClick={(e) => { e.stopPropagation(); setDismissed(true) }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
    </div>
  )
}

function MonitorIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#5a4528" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="16" x2="12" y2="20" />
    </svg>
  )
}

const HAND = "'Patrick Hand', 'Nunito', cursive"

const sWrap: CSSProperties = {
  position: 'fixed', zIndex: 130,
  left: '50%',
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 26px)',
  transform: 'translateX(-50%)',
  display: 'flex', alignItems: 'center', gap: 9,
  padding: '8px 8px 8px 14px',
  borderRadius: 999,
  background: '#f6efda', color: '#5a4528',
  border: '1px solid #d7c8a3',
  boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
  fontFamily: HAND, whiteSpace: 'nowrap',
  transition: 'opacity 0.5s ease',
}

const sText: CSSProperties = { fontFamily: HAND, fontSize: 17, lineHeight: 1 }

const sClose: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, padding: 0,
  border: 'none', borderRadius: '50%',
  background: '#efe4c6', color: '#5a4528', cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
}
