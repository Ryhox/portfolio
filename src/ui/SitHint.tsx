import { type CSSProperties } from 'react'
import { useWorld } from '../state/useWorld'
import { IS_TOUCH } from '../input/device'

// A small bottom-centre paper hint shown while resting on the bench, telling the
// player how to get back up. Matches the cozy cream-paper HUD (no glow/gradient).
// On touch the on-screen "Stand up" button owns this, so the hint is hidden.

export function SitHint() {
  const started = useWorld((s) => s.started)
  const sitting = useWorld((s) => s.sitting)
  const menuOpen = useWorld((s) => s.menuOpen)
  const mapOpen = useWorld((s) => s.mapOpen)
  const show = started && sitting && !menuOpen && !mapOpen

  if (IS_TOUCH) return null

  return (
    <div
      style={{
        ...sHint,
        opacity: show ? 1 : 0,
        transform: show ? 'translate(-50%, 0)' : 'translate(-50%, 8px)',
        visibility: show ? 'visible' : 'hidden',
      }}
    >
      Press <b style={sKey}>E</b> or <b style={sKey}>ESC</b> to stand up
    </div>
  )
}

const HAND = "'Patrick Hand', 'Nunito', cursive"

const sHint: CSSProperties = {
  position: 'fixed',
  bottom: 40,
  left: '50%',
  transform: 'translate(-50%, 0)',
  zIndex: 130,
  visibility: 'hidden',
  padding: '8px 18px',
  borderRadius: 11,
  background: '#f6efda',
  border: '1px solid #d7c8a3',
  boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
  fontFamily: HAND,
  fontSize: 19,
  color: '#5a4528',
  userSelect: 'none',
  pointerEvents: 'none',
  transition: 'opacity 0.2s ease, transform 0.2s ease',
}

const sKey: CSSProperties = { color: '#6b7a3f', fontWeight: 400 }
