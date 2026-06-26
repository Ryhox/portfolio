import { type CSSProperties, useState } from 'react'
import { useWorld, type QuestId } from '../state/useWorld'
import { IS_TOUCH } from '../input/device'
import { useT, type StringKey } from '../i18n'
import { HAND } from './theme'

// The cozy bottom-left to-do list. Collapsed to a small "To-Do" button by default
// (so the corner stays clear); tap it to unfurl the torn-paper checklist, and an X
// folds it back away. Each line crosses itself off the first time you do the thing;
// "Projects" is a greyed coming-soon entry, and "Enjoy the isle" is never crossed
// off — it's the mood.
//
// No glow / glass / gradient / emoji — flat cream paper, hand ink, an inked SVG
// tick. Per-frame nothing: it only re-renders when a quest flag flips or it opens.

type Item = {
  id: QuestId | 'enjoy'
  labelKey: StringKey
  hintKey: StringKey
  soon?: boolean // greyed "coming soon" (Projects) — shown but never tickable
  always?: boolean // never crossed off (Enjoy)
}

const ITEMS: Item[] = [
  { id: 'about', labelKey: 'quest.about.label', hintKey: 'quest.about.hint' },
  { id: 'socials', labelKey: 'quest.socials.label', hintKey: 'quest.socials.hint' },
  { id: 'projects', labelKey: 'quest.projects.label', hintKey: 'quest.projects.hint' },
  { id: 'sail', labelKey: 'quest.sail.label', hintKey: 'quest.sail.hint' },
  { id: 'enjoy', labelKey: 'quest.enjoy.label', hintKey: 'quest.enjoy.hint', always: true },
]

// The tickable goals (Enjoy is the mood, not a goal) — drives the "n / 4" badge.
const GOALS = ITEMS.filter((it) => !it.always && !it.soon) as { id: QuestId }[]

export function QuestList() {
  const t = useT()
  const started = useWorld((s) => s.started)
  const menuOpen = useWorld((s) => s.menuOpen)
  const mapOpen = useWorld((s) => s.mapOpen)
  const mapId = useWorld((s) => s.mapId)
  const quests = useWorld((s) => s.quests)
  const projectsOpen = useWorld((s) => s.projectsOpen)
  const [open, setOpen] = useState(false)

  // The to-do is the home-isle journey — hide it out on the Stargazer isles, and
  // while the projects board is open (so it never crowds the card).
  const show = started && !menuOpen && !mapOpen && !projectsOpen && mapId === 'home'
  const done = GOALS.reduce((acc, g) => acc + (quests[g.id] ? 1 : 0), 0)

  const rows = ITEMS.map((it, i) => {
    const isDone = !it.always && !it.soon && quests[it.id as QuestId]
    return <Row key={it.id} item={it} done={isDone} n={i + 1} />
  })

  // Desktop: the full checklist, always open, click-through (no button, no X).
  if (!IS_TOUCH) {
    return (
      <div
        style={{
          ...sWrap,
          pointerEvents: 'none',
          opacity: show ? 1 : 0,
          transform: show ? 'translateY(0)' : 'translateY(8px)',
        }}
      >
        <div style={sPanel}>
          <div style={sTitleOnly}>{t('quest.todo')}</div>
          <div style={sList}>{rows}</div>
        </div>
      </div>
    )
  }

  // Touch: collapse to a small button so the corner stays clear; tap to unfurl.
  return (
    <div
      style={{
        ...sWrap,
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0)' : 'translateY(8px)',
        pointerEvents: show ? 'auto' : 'none',
      }}
    >
      {open ? (
        <div style={sPanel}>
          <div style={sHeader}>
            <span style={sTitle}>{t('quest.todo')}</span>
            <button type="button" aria-label={t('quest.closeAria')} onClick={() => setOpen(false)} style={sClose}>
              <XIcon />
            </button>
          </div>
          <div style={sList}>{rows}</div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} style={sPill}>
          <ListIcon />
          <span>{t('quest.todo')}</span>
          <span style={sCount}>{done}/{GOALS.length}</span>
        </button>
      )}
    </div>
  )
}

function Row({ item, done, n }: { item: Item; done: boolean; n: number }) {
  // No checkbox — a line-through is enough. The NAME turns green when done (the
  // description stays as it is).
  const t = useT()
  const nameColor = item.soon ? INK_SOFT : done ? DONE_GREEN : INK
  return (
    <div style={sRow}>
      <div style={sText}>
        <span
          style={{
            ...sLabel,
            color: nameColor,
            textDecoration: done ? 'line-through' : 'none',
            textDecorationColor: DONE_GREEN,
          }}
        >
          <span style={sNum}>{n}.</span> {t(item.labelKey)}
          {item.soon && <span style={sSoon}>{t('quest.soon')}</span>}
        </span>
        <span style={sHint}>{t(item.hintKey)}</span>
      </div>
    </div>
  )
}

function ListIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}>
      <polyline points="4 7 6 9 9.5 5.5" />
      <polyline points="4 17 6 19 9.5 15.5" />
      <line x1="13" y1="7" x2="20" y2="7" />
      <line x1="13" y1="17" x2="20" y2="17" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2.4} strokeLinecap="round" aria-hidden="true" style={{ display: 'block' }}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  )
}

const INK = '#6f5836'
const INK_DARK = '#5a4528'
const INK_SOFT = 'rgba(111,88,54,0.55)'
const DONE_GREEN = '#7a8a4a'

const sWrap: CSSProperties = {
  position: 'fixed',
  left: 'calc(env(safe-area-inset-left, 0px) + 16px)',
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
  zIndex: 70, // above the touch joystick zone so the button stays tappable
  userSelect: 'none',
  transition: 'opacity 0.5s ease, transform 0.5s ease',
}

const sPill: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 9,
  padding: '9px 14px',
  border: '1px solid #d7c8a3', borderRadius: 999,
  background: '#f6efda', color: INK_DARK,
  fontFamily: HAND, fontSize: 18, lineHeight: 1, cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(0,0,0,0.32)',
  WebkitTapHighlightColor: 'transparent',
}

const sCount: CSSProperties = {
  fontFamily: HAND, fontSize: 14, color: '#f6efda',
  background: '#a8985f', borderRadius: 999, padding: '1px 8px',
}

const sPanel: CSSProperties = {
  width: 'min(78vw, 256px)',
  padding: '10px 16px 14px',
  borderRadius: 12,
  background: '#f6efda',
  border: '1px solid #d7c8a3',
  boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
}

const sHeader: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  borderBottom: '1px solid #e2d5b4', paddingBottom: 7, marginBottom: 8,
}

const sTitle: CSSProperties = {
  fontFamily: HAND, fontSize: 23, color: INK_DARK, lineHeight: 1, letterSpacing: 0.5,
}

// Desktop header: title with the underline rule (no close button).
const sTitleOnly: CSSProperties = {
  fontFamily: HAND, fontSize: 23, color: INK_DARK, lineHeight: 1, letterSpacing: 0.5,
  borderBottom: '1px solid #e2d5b4', paddingBottom: 7, marginBottom: 8,
}

const sClose: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 30, height: 30, padding: 0, marginRight: -4,
  border: 'none', borderRadius: 8, background: 'transparent',
  color: INK, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
}

const sList: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 9 }

const sRow: CSSProperties = { display: 'flex', alignItems: 'flex-start' }

const sText: CSSProperties = { display: 'flex', flexDirection: 'column', lineHeight: 1.1 }

const sLabel: CSSProperties = {
  fontFamily: HAND,
  fontSize: 18,
  lineHeight: 1.15,
}

const sNum: CSSProperties = { color: INK_SOFT }

const sSoon: CSSProperties = {
  fontFamily: HAND,
  fontSize: 12,
  color: '#f6efda',
  background: '#bfae84',
  borderRadius: 4,
  padding: '0 6px',
  marginLeft: 7,
  verticalAlign: 'middle',
}

const sHint: CSSProperties = {
  fontFamily: HAND,
  fontSize: 13,
  color: 'rgba(111,88,54,0.6)',
  marginTop: 1,
}
