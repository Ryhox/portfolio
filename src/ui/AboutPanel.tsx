import { type CSSProperties } from 'react'
import { useWorld } from '../state/useWorld'
import { PORTRAIT } from '../scene/summit'

// The "About me" panel — opened by pressing E at the portrait nailed to the
// Heartwood. A flat cream-paper card (Patrick Hand ink, no glow/glass/gradient/
// emoji) that floats as a HUD over the locked first-person view, like IslandInfo.
// Close with E (re-press at the tree) or ESC. Edit ABOUT_* below to taste.

const ABOUT_NAME = 'Emanuel' 
const ABOUT_TAGLINE = "♥ committing straight to production ♥"
const ABOUT_BODY = [
  'Hey! I\'m Ryhox. I like building random stuff and seeing where it goes.',
  'Mostly working on websites, 3D stuff, plugins, and whatever sounds fun',
  'at the moment.',
  'A lot of my projects start with "this could be cool" and somehow turn',
  'into a real thing after way too many hours of debugging.',
]

export function AboutPanel() {
  const started = useWorld((s) => s.started)
  const aboutOpen = useWorld((s) => s.aboutOpen)
  const menuOpen = useWorld((s) => s.menuOpen)
  const mapOpen = useWorld((s) => s.mapOpen)

  const show = started && aboutOpen && !menuOpen && !mapOpen

  return (
    <div
      style={{
        ...sPanel,
        opacity: show ? 1 : 0,
        transform: show ? 'translate(-50%, 0)' : 'translate(-50%, 12px)',
        visibility: show ? 'visible' : 'hidden',
      }}
    >
      <div style={sRow}>
        <img
          src={PORTRAIT.textures[0]}
          alt={ABOUT_NAME}
          style={sPhoto}
          onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
        />
        <div style={sHead}>
          <div style={sTitle}>{ABOUT_NAME}</div>
          <div style={sTagline}>{ABOUT_TAGLINE}</div>
        </div>
      </div>
      <div style={sDivider} />
      <div style={sBody}>
        {ABOUT_BODY.map((line, i) => (
          <p key={i} style={sLine}>
            {line}
          </p>
        ))}
      </div>
      <div style={sHint}>Press E or ESC to close</div>
    </div>
  )
}

const HAND = "'Patrick Hand', 'Nunito', cursive"
const INK = '#6f5836'
const INK_DARK = '#5a4528'

const sPanel: CSSProperties = {
  position: 'fixed',
  bottom: 110,
  left: '50%',
  transform: 'translate(-50%, 12px)',
  zIndex: 130,
  pointerEvents: 'none',
  visibility: 'hidden',
  width: 420,
  maxWidth: '90vw',
  padding: '16px 20px 12px',
  borderRadius: 12,
  background: '#f6efda',
  border: '1px solid #d7c8a3',
  boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
  transition: 'opacity 0.25s ease, transform 0.25s ease',
}

const sRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 14 }

const sPhoto: CSSProperties = {
  width: 72,
  height: 92,
  objectFit: 'cover',
  borderRadius: 6,
  border: '2px solid #4a3322',
  flexShrink: 0,
  background: '#4a4148',
}

const sHead: CSSProperties = { display: 'flex', flexDirection: 'column' }

const sTitle: CSSProperties = {
  fontFamily: HAND,
  fontSize: 26,
  color: INK_DARK,
  lineHeight: 1.1,
}

const sTagline: CSSProperties = {
  fontFamily: HAND,
  fontSize: 17,
  color: 'rgba(111,88,54,0.75)',
  marginTop: 2,
}

const sDivider: CSSProperties = { height: 1, background: '#e2d5b4', margin: '12px 0' }

const sBody: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 }

const sLine: CSSProperties = {
  fontFamily: HAND,
  fontSize: 19,
  color: INK,
  lineHeight: 1.4,
  margin: 0,
}

const sHint: CSSProperties = {
  fontFamily: HAND,
  fontSize: 13,
  color: 'rgba(111,88,54,0.55)',
  textAlign: 'center',
  marginTop: 12,
}
