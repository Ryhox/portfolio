import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { ENTERING } from '../scene/mapTransition'
import { useWorld } from '../state/useWorld'
import { IS_TOUCH } from '../input/device'
import { useT, type StringKey } from '../i18n'
import { HAND } from './theme'
import { SIZE_TIERS } from '../scene/archipelago/biomes'

// Size tiers carry a stable id; map their English name → i18n key so we can localize
// the displayed size live. Unknown names (e.g. a Mother isle's region name, a proper
// noun) fall through untranslated.
const SIZE_KEY_BY_NAME: Record<string, StringKey> = Object.fromEntries(
  SIZE_TIERS.map((s) => [s.name, `size.${s.id}` as StringKey]),
)

// Island information HUD. While you're on (or sailing up to) an island a small
// "I — Information" prompt sits bottom-centre; pressing I toggles a flat panel.
//
//  • A stargazer island shows how lucky its roll was — the look + its chance, the
//    size + its chance, and the combined overall rarity ("1 in N").
//  • A region's Mother Isle shows the whole REGION's odds instead: the chance any
//    star lands in this group, the look odds within it, and the size-tier odds.
//
// Content is lifted into React state only when you reach a NEW island (rare), so
// there are no per-frame re-renders; a light rAF just watches ENTERING.key. Close
// with I or ESC. Flat cream paper, hand-drawn ink — no glow/glass/gradient/emoji.

const fmtPct = (p: number) => {
  if (p >= 10) return Math.round(p) + '%'
  if (p >= 1) return p.toFixed(1) + '%'
  if (p >= 0.1) return p.toFixed(2) + '%'
  return p.toFixed(3) + '%'
}

// "≈ 1 in N islands" — a tangible feel for the combined odds.
const oneIn = (pctTotal: number, t: (k: StringKey, v?: Record<string, string | number>) => string) => {
  if (pctTotal <= 0) return ''
  return t('info.oneIn', { n: Math.round(100 / pctTotal).toLocaleString() })
}

type Snap = {
  name: string
  group: string
  tier: string
  isMother: boolean
  // stargazer island
  biomeName: string
  biomePct: number
  sizeName: string
  sizePct: number
  totalPct: number
  luck: string
  // mother isle
  region?: {
    groupPct: number
    variants: { name: string; pct: number }[]
    sizes: { name: string; pct: number }[]
  }
}

export function IslandInfo() {
  const t = useT()
  const tSize = (name: string) => {
    const k = SIZE_KEY_BY_NAME[name]
    return k ? t(k) : name
  }
  const started = useWorld((s) => s.started)
  const menuOpen = useWorld((s) => s.menuOpen)
  const mapOpen = useWorld((s) => s.mapOpen)
  const infoOpen = useWorld((s) => s.infoOpen)
  const [snap, setSnap] = useState<Snap | null>(null)
  const snapRef = useRef<Snap | null>(null)
  const lastKey = useRef(-1)

  // I toggles the panel. ESC-to-close is owned by EscMenu (it has to be, since the
  // browser eats the ESC keydown to exit pointer lock while you're playing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyI') return
      const ws = useWorld.getState()
      if (!ws.started || ws.menuOpen || ws.mapOpen || !ENTERING.stats) return
      e.preventDefault()
      ws.toggleInfo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Watch ENTERING for a new/cleared island and snapshot its stats into state.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const s = ENTERING.stats
      if (s == null) {
        if (snapRef.current != null) {
          snapRef.current = null
          lastKey.current = -1
          setSnap(null)
          if (useWorld.getState().infoOpen) useWorld.getState().setInfoOpen(false)
        }
      } else if (ENTERING.key !== lastKey.current) {
        lastKey.current = ENTERING.key
        const next: Snap = {
          name: ENTERING.name ?? 'This Island',
          group: s.group,
          tier: s.tier,
          isMother: !!s.isMother,
          biomeName: s.biomeName,
          biomePct: s.biomePct,
          sizeName: s.sizeName,
          sizePct: s.sizePct,
          totalPct: (s.biomePct * s.sizePct) / 100,
          luck: s.luck,
          region: s.region,
        }
        snapRef.current = next
        setSnap(next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const blocked = !started || menuOpen || mapOpen
  // On touch the round "i" button (TouchControls) opens this, so hide the chip.
  const showPrompt = !!snap && !infoOpen && !blocked && !IS_TOUCH
  const showPanel = !!snap && infoOpen && !blocked
  const r = snap?.region

  return (
    <>
      {/* Bottom-centre prompt */}
      <div
        style={{
          ...sPrompt,
          opacity: showPrompt ? 1 : 0,
          transform: showPrompt ? 'translate(-50%, 0)' : 'translate(-50%, 10px)',
        }}
      >
        <span style={sCap}>I</span>
        <span style={sPromptLabel}>{t('info.information')}</span>
      </div>

      {/* Info panel */}
      <div
        style={{
          ...sPanel,
          opacity: showPanel ? 1 : 0,
          transform: showPanel ? 'translate(-50%, 0)' : 'translate(-50%, 10px)',
          visibility: showPanel ? 'visible' : 'hidden',
        }}
      >
        {snap && (
          <>
            <div style={sTitle}>{snap.name}</div>
            <div style={sRegion}>
              {t('info.region', { group: snap.group, tier: t(`tier.${snap.tier}` as StringKey) })}
            </div>
            <div style={sDivider} />

            {snap.isMother && r ? (
              <>
                <div style={sRow}>
                  <span style={sValueName}>{t('info.landInRegion')}</span>
                  <span style={sPct}>{fmtPct(r.groupPct)}</span>
                </div>
                <div style={sDivider} />
                <div style={sSection}>{t('info.typesHere')}</div>
                {r.variants.map((v) => (
                  <div key={v.name} style={sRow}>
                    <span style={sValueName}>{v.name}</span>
                    <span style={sPct}>{fmtPct(v.pct)}</span>
                  </div>
                ))}
                <div style={sDivider} />
                <div style={sSection}>{t('info.islandSizes')}</div>
                {r.sizes.map((sz) => (
                  <div key={sz.name} style={sRow}>
                    <span style={sValueName}>{tSize(sz.name)}</span>
                    <span style={sPct}>{fmtPct(sz.pct)}</span>
                  </div>
                ))}
              </>
            ) : (
              <>
                <div style={sRow}>
                  <span style={sLabel}>{t('info.look')}</span>
                  <span style={sValueName}>{snap.biomeName}</span>
                  <span style={sPct}>{fmtPct(snap.biomePct)}</span>
                </div>
                <div style={sRow}>
                  <span style={sLabel}>{t('info.size')}</span>
                  <span style={sValueName}>{tSize(snap.sizeName)}</span>
                  <span style={sPct}>{fmtPct(snap.sizePct)}</span>
                </div>
                <div style={sDivider} />
                <div style={sTotalRow}>
                  <span style={sTotalLabel}>{t('info.overallRarity')}</span>
                  <span style={sTotalPct}>{fmtPct(snap.totalPct)}</span>
                </div>
                <div style={sOneIn}>{oneIn(snap.totalPct, t)}</div>
                <div style={sLuck}>{t(snap.luck as StringKey)}</div>
              </>
            )}

            <div style={sHint}>{IS_TOUCH ? t('info.closeTouch') : t('info.closeDesktop')}</div>
          </>
        )}
      </div>
    </>
  )
}

const INK = '#6f5836'
const INK_DARK = '#5a4528'

// ── Prompt (bottom-centre) ───────────────────────────────────────────────────
const sPrompt: CSSProperties = {
  position: 'fixed',
  bottom: 150,
  left: '50%',
  transform: 'translate(-50%, 10px)',
  zIndex: 128,
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  padding: '7px 13px 7px 8px',
  borderRadius: 9,
  background: '#f6efda',
  border: '1px solid #d7c8a3',
  boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
  transition: 'opacity 0.25s ease, transform 0.25s ease',
}

const sCap: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 30,
  minWidth: 26,
  padding: '0 9px',
  borderRadius: 6,
  background: '#3a2f1c',
  color: '#fdfaf2',
  border: '1px solid #2a2114',
  fontFamily: HAND,
  fontSize: 19,
  fontWeight: 700,
  lineHeight: 1,
}

const sPromptLabel: CSSProperties = {
  fontFamily: HAND,
  fontSize: 22,
  lineHeight: 1,
  color: '#3a2f1c',
  letterSpacing: 0.3,
}

// ── Panel ────────────────────────────────────────────────────────────────────
const sPanel: CSSProperties = {
  position: 'fixed',
  bottom: 150,
  left: '50%',
  transform: 'translate(-50%, 10px)',
  zIndex: 129,
  pointerEvents: 'none',
  visibility: 'hidden',
  width: 296,
  padding: '14px 18px 12px',
  borderRadius: 12,
  background: '#f6efda',
  border: '1px solid #d7c8a3',
  boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
  transition: 'opacity 0.25s ease, transform 0.25s ease',
}

const sTitle: CSSProperties = {
  fontFamily: HAND,
  fontSize: 24,
  color: INK_DARK,
  textAlign: 'center',
  lineHeight: 1.1,
}

const sRegion: CSSProperties = {
  fontFamily: HAND,
  fontSize: 15,
  color: 'rgba(111,88,54,0.7)',
  textAlign: 'center',
  letterSpacing: 1,
  marginTop: 2,
}

const sDivider: CSSProperties = {
  height: 1,
  background: '#e2d5b4',
  margin: '10px 0',
}

const sSection: CSSProperties = {
  fontFamily: HAND,
  fontSize: 14,
  color: 'rgba(111,88,54,0.6)',
  letterSpacing: 1,
  marginBottom: 3,
}

// Rows: a fixed label column (optional), the value, then the % pinned right with
// `marginLeft: auto` so it never crowds the text.
const sRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  width: '100%',
  fontFamily: HAND,
  fontSize: 19,
  lineHeight: 1.55,
}

const sLabel: CSSProperties = {
  // Was a fixed 50px box, which longer translations (e.g. German "Aussehen")
  // overflowed, colliding with the value. Auto-size with a floor so short labels
  // still line up, and never wrap onto the value.
  minWidth: 50,
  flexShrink: 0,
  whiteSpace: 'nowrap',
  marginRight: 10,
  color: 'rgba(111,88,54,0.6)',
}

const sValueName: CSSProperties = {
  color: INK,
  marginRight: 10,
}

const sPct: CSSProperties = {
  marginLeft: 'auto',
  flexShrink: 0,
  color: '#a8895a',
  fontSize: 17,
  fontVariantNumeric: 'tabular-nums',
}

const sTotalRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  width: '100%',
  fontFamily: HAND,
  fontSize: 21,
  color: INK_DARK,
}

const sTotalLabel: CSSProperties = { color: INK_DARK, marginRight: 10 }

const sTotalPct: CSSProperties = {
  marginLeft: 'auto',
  flexShrink: 0,
  color: '#8a6d3b',
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
}

const sOneIn: CSSProperties = {
  fontFamily: HAND,
  fontSize: 15,
  color: 'rgba(111,88,54,0.7)',
  textAlign: 'right',
  marginTop: 1,
}

const sLuck: CSSProperties = {
  fontFamily: HAND,
  fontSize: 18,
  color: INK,
  textAlign: 'center',
  marginTop: 10,
  paddingTop: 8,
  borderTop: '1px solid #e2d5b4',
}

const sHint: CSSProperties = {
  fontFamily: HAND,
  fontSize: 13,
  color: 'rgba(111,88,54,0.55)',
  textAlign: 'center',
  marginTop: 10,
}
