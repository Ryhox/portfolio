import { type CSSProperties } from 'react'
import { useWorld, type QuestId } from '../state/useWorld'

// The cozy bottom-left to-do list. A torn-paper checklist (matching the ESC
// notepad / About card) that tracks the little journey across the isle. Each line
// crosses itself off the first time you do the thing; "Projects" is a greyed
// coming-soon entry, and "Enjoy the isle" is never crossed off — it's the mood.
//
// No glow / glass / gradient / emoji — flat cream paper, hand ink, an inked SVG
// tick. Per-frame nothing: it only re-renders when a quest flag flips.

type Item = {
  id: QuestId | 'enjoy'
  label: string
  hint: string
  soon?: boolean // greyed "coming soon" (Projects) — shown but never tickable
  always?: boolean // never crossed off (Enjoy)
}

const ITEMS: Item[] = [
  { id: 'about', label: 'Who am I?', hint: 'Find the cat keeping watch on the hilltop' },
  { id: 'socials', label: 'Socials', hint: 'Catch me out there in the world' },
  { id: 'projects', label: 'Projects', hint: 'Read the board at the end of the west path' },
  { id: 'sail', label: 'Set Sail', hint: "Drift out to other wanderers' isles" },
  { id: 'enjoy', label: 'Enjoy the isle!', hint: 'Wander, sit a while, breathe', always: true },
]

export function QuestList() {
  const started = useWorld((s) => s.started)
  const menuOpen = useWorld((s) => s.menuOpen)
  const mapOpen = useWorld((s) => s.mapOpen)
  const mapId = useWorld((s) => s.mapId)
  const quests = useWorld((s) => s.quests)

  // The to-do is the home-isle journey — hide it out on the Stargazer isles.
  const show = started && !menuOpen && !mapOpen && mapId === 'home'

  return (
    <div
      style={{
        ...sPanel,
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0)' : 'translateY(8px)',
      }}
    >
      <div style={sTitle}>To-Do</div>
      <div style={sList}>
        {ITEMS.map((it, i) => {
          const done = !it.always && !it.soon && quests[it.id as QuestId]
          return <Row key={it.id} item={it} done={done} n={i + 1} />
        })}
      </div>
    </div>
  )
}

function Row({ item, done, n }: { item: Item; done: boolean; n: number }) {
  // No checkbox — a line-through is enough. The NAME turns green when done (the
  // description stays as it is).
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
          <span style={sNum}>{n}.</span> {item.label}
          {item.soon && <span style={sSoon}>soon</span>}
        </span>
        <span style={sHint}>{item.hint}</span>
      </div>
    </div>
  )
}

const HAND = "'Patrick Hand', 'Nunito', cursive"
const INK = '#6f5836'
const INK_DARK = '#5a4528'
const INK_SOFT = 'rgba(111,88,54,0.55)'
const DONE_GREEN = '#7a8a4a'

const sPanel: CSSProperties = {
  position: 'fixed',
  left: 18,
  bottom: 18,
  zIndex: 25,
  width: 250,
  maxWidth: '70vw',
  padding: '12px 16px 14px',
  borderRadius: 10,
  background: '#f6efda',
  border: '1px solid #d7c8a3',
  boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
  pointerEvents: 'none',
  userSelect: 'none',
  transition: 'opacity 0.3s ease, transform 0.3s ease',
}

const sTitle: CSSProperties = {
  fontFamily: HAND,
  fontSize: 23,
  color: INK_DARK,
  lineHeight: 1,
  letterSpacing: 0.5,
  borderBottom: '1px solid #e2d5b4',
  paddingBottom: 7,
  marginBottom: 8,
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
