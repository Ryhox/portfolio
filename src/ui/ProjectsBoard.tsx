import { type CSSProperties, useEffect } from 'react'
import { useWorld } from '../state/useWorld'
import { PROJECTS } from '../scene/projects'
import { IS_TOUCH } from '../input/device'
import { useT } from '../i18n'
import { HAND } from './theme'

// Control bar for the projects board. The project text + image live on the
// fluttering PAPER pinned to the board itself (scene/MessageBoard.tsx) — this bar
// is the ◀ ▶ controls that flip which sheet is shown, plus the current project's
// Source / Live-preview links and the leave hint. Browse with the buttons or the
// arrow keys; leave with E or ESC.

export function ProjectsBoard() {
  const t = useT()
  const started = useWorld((s) => s.started)
  const projectsOpen = useWorld((s) => s.projectsOpen)
  const menuOpen = useWorld((s) => s.menuOpen)
  const mapOpen = useWorld((s) => s.mapOpen)
  const i = useWorld((s) => s.projectIndex)

  const n = PROJECTS.length
  const show = started && projectsOpen && !menuOpen && !mapOpen
  const p = PROJECTS[i]

  const go = (d: number) => useWorld.getState().setProjectIndex((i + d + n) % n)
  const open = (href: string) => window.open(href, '_blank', 'noopener,noreferrer')

  // Arrow keys browse while the board is open (player input is frozen meanwhile).
  useEffect(() => {
    if (!show) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft') { e.preventDefault(); go(-1) }
      else if (e.code === 'ArrowRight') { e.preventDefault(); go(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, i, n])

  return (
    <div
      style={{
        ...sBar,
        bottom: IS_TOUCH ? 'calc(env(safe-area-inset-bottom, 0px) + 40px)' : 38,
        opacity: show ? 1 : 0,
        transform: show ? 'translate(-50%, 0)' : 'translate(-50%, 10px)',
        visibility: show ? 'visible' : 'hidden',
        pointerEvents: show ? 'auto' : 'none',
      }}
    >
      {/* Touch: a close X right on the card (no separate corner button). */}
      {IS_TOUCH && (
        <button aria-label={t('board.closeAria')} style={sCardClose} onClick={() => useWorld.getState().setProjectsOpen(false)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5a4528" strokeWidth="2.6" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}

      <button aria-label={t('board.prevAria')} style={sArrow} onClick={() => go(-1)}>
        <Chevron dir="left" />
      </button>

      <div style={sMid}>
        <div style={sLinks}>
          {p?.source && (
            <button style={sSource} onClick={() => open(p.source!)}>
              <GitIcon color={CREAM} /> {t('board.source')}
            </button>
          )}
          {p?.live && (
            <button style={sLive} onClick={() => open(p.live!)}>
              <PlayIcon color={CREAM} /> {IS_TOUCH ? t('board.preview') : t('board.livePreview')}
            </button>
          )}
          {!p?.source && !p?.live && <span style={sNoLink}>{t('board.noLinks')}</span>}
        </div>
        <div style={sFoot}>
          <span style={sCount}>{i + 1} / {n}</span>
          <span style={sDot}>·</span>
          <span style={sHint}>{IS_TOUCH ? t('board.leaveTouch') : t('board.leaveDesktop')}</span>
        </div>
      </div>

      <button aria-label={t('board.nextAria')} style={sArrow} onClick={() => go(1)}>
        <Chevron dir="right" />
      </button>
    </div>
  )
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={INK_DARK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      {dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
    </svg>
  )
}

function GitIcon({ color = INK_DARK }: { color?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.5v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.3.8 1 .8 2.1v3.1c0 .3.2.7.8.5 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5Z" />
    </svg>
  )
}

function PlayIcon({ color = INK_DARK }: { color?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

const INK = '#6f5836'
const INK_DARK = '#5a4528'
const CREAM = '#f6efda'

const sBar: CSSProperties = {
  position: 'fixed',
  bottom: 38,
  left: '50%',
  transform: 'translate(-50%, 0)',
  zIndex: 130,
  visibility: 'hidden',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '10px 14px',
  borderRadius: 12,
  background: '#f6efda',
  border: '1px solid #d7c8a3',
  boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
  transition: 'opacity 0.22s ease, transform 0.22s ease',
  userSelect: 'none',
}

// Touch close button, pinned to the bar's top-right corner.
const sCardClose: CSSProperties = {
  position: 'absolute',
  top: -14,
  right: -10,
  width: 34,
  height: 34,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  borderRadius: '50%',
  background: '#efe4c6',
  border: '1px solid #d7c8a3',
  boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
}

const sArrow: CSSProperties = {
  flexShrink: 0,
  width: 42,
  height: 42,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 9,
  background: '#fdfaf2',
  border: '1px solid #d7c8a3',
  boxShadow: '0 2px 0 rgba(0,0,0,0.18)',
  cursor: 'pointer',
}

const sMid: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 7,
  minWidth: 200,
}

const sLinks: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' }

const sLinkBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  borderRadius: 8,
  boxShadow: '0 2px 0 rgba(0,0,0,0.22)',
  fontFamily: HAND,
  fontSize: 16,
  color: CREAM,
  cursor: 'pointer',
}

// Source → soft olive (the same accent as the quest tick); Live → warm clay. Both
// filled with cream text so they pop against the paper bar without clashing.
const sSource: CSSProperties = { ...sLinkBase, background: '#7a8a4a', border: '1px solid #67763d' }
const sLive: CSSProperties = { ...sLinkBase, background: '#bb6b46', border: '1px solid #9f5736' }

const sNoLink: CSSProperties = { fontFamily: HAND, fontSize: 15, color: 'rgba(111,88,54,0.5)' }

const sFoot: CSSProperties = { display: 'flex', alignItems: 'center', gap: 7 }

const sCount: CSSProperties = { fontFamily: HAND, fontSize: 16, color: INK }

const sDot: CSSProperties = { color: 'rgba(111,88,54,0.5)' }

const sHint: CSSProperties = { fontFamily: HAND, fontSize: 13, color: 'rgba(111,88,54,0.6)' }
