import gsap from 'gsap'
import { type CSSProperties, useEffect, useRef } from 'react'
import { introActions } from './introActions'
import { useLoadStatus } from './loadStatus'
import { useT, type StringKey } from '../../i18n'
import { HAND } from '../theme'

// The Warmup component (inside the Canvas) writes free-form English phase strings;
// localize them here at display time so Warmup stays untouched. Asset phases carry a
// live "a/b" count we re-append after translating the verb.
const PHASE_KEY: Record<string, StringKey> = {
  'gathering magic': 'loading.gatheringMagic',
  assets: 'loading.assets',
  'loading models': 'loading.models',
  'loading textures': 'loading.textures',
  'loading audio': 'loading.audio',
  'loading skies': 'loading.skies',
  'summoning the island': 'loading.summoning',
  'compiling shaders': 'loading.compiling',
  'uploading textures': 'loading.uploading',
  'preparing scene': 'loading.preparing',
  ready: 'loading.ready',
}

function localizePhase(phase: string, t: (k: StringKey) => string): string {
  const m = phase.match(/^(.*?)(\s+\d+\/\d+)?$/)
  const base = m?.[1] ?? phase
  const count = m?.[2] ?? ''
  const key = PHASE_KEY[base]
  return key ? t(key) + count : phase
}

// Cozy loading card — matches the cream/ink "Patrick Hand" look of the in-world
// panels (QuestList, IslandInfo). Keeps the little ✦ star accent, twinkling, and
// softens the wait with a sad cat + an apology for the loading time.
const CREAM = '#f6efda'
const BORDER = '#d7c8a3'
const BORDER_SOFT = '#e2d5b4'
const INK = '#6f5836'
const INK_DARK = '#5a4528'
const INK_SOFT = 'rgba(111,88,54,0.55)'
const TAN = '#a8985f'
const HONEY = '#c79a52'

// Sequential dim/brighten shimmer. Pure CSS so the browser composites it off the
// main thread — it won't freeze while the loader saturates the CPU. No transform,
// no glow, opacity only.
const starCss = `
@keyframes loadStarTwinkle { 0%, 100% { opacity: 1 } 50% { opacity: 0.25 } }
.load-star { animation: loadStarTwinkle 1.4s ease-in-out infinite; }
`

export function LoadingScreen() {
  // Overall progress (asset download → GPU warm-up) and the current phase caption,
  // both fed by the Warmup component inside the Canvas.
  const t        = useT()
  const progress = useLoadStatus((s) => s.progress)
  const phase    = useLoadStatus((s) => s.phase)
  const overlayRef = useRef<HTMLDivElement>(null)
  const barFillRef = useRef<HTMLDivElement>(null)

  const pct = Math.min(100, Math.round(progress * 100))

  useEffect(() => {
    if (!barFillRef.current) return
    gsap.to(barFillRef.current, { width: `${pct}%`, duration: 0.4, ease: 'power1.out' })
  }, [pct])

  useEffect(() => {
    introActions.collapseProgress = (onDone: () => void) => {
      const el = overlayRef.current
      if (!el) { onDone(); return }
      gsap.to(el, {
        opacity: 0,
        duration: 0.55,
        ease: 'power2.inOut',
        onComplete: () => {
          el.style.display = 'none'
          onDone()
        },
      })
    }
    return () => { introActions.collapseProgress = null }
  }, [])

  return (
    <div ref={overlayRef} style={sOverlay}>
      {/* CSS (compositor) twinkle — keeps running smoothly even while the main
          thread is busy loading, unlike a JS/rAF animation. */}
      <style>{starCss}</style>
      <div style={sCard}>
        <div style={sStars}>
          <span className="load-star" style={{ ...sStarSm, animationDelay: '0s' }}>✦</span>
          <span className="load-star" style={{ ...sStarLg, animationDelay: '0.35s' }}>✦</span>
          <span className="load-star" style={{ ...sStarSm, animationDelay: '0.7s' }}>✦</span>
        </div>

        <img src="/ui/sadcat.jpg" alt="a sad little cat" style={sCat} draggable={false} />

        <div style={sSorry}>{t('loading.sorry')}</div>
        <div style={sPhase}>{localizePhase(phase, t)}…</div>

        <div style={sBarOuter}>
          <div ref={barFillRef} style={sBarFill} />
        </div>
        <div style={sPct}>{pct}%</div>
      </div>
    </div>
  )
}

const sOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: CREAM,
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
  userSelect: 'none',
}

const sCard: CSSProperties = {
  width: 'min(86vw, 300px)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
  padding: '20px 24px 22px',
}

const sStars: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  color: TAN,
  marginBottom: 2,
}

const sStarSm: CSSProperties = { fontSize: 13, display: 'inline-block' }
const sStarLg: CSSProperties = { fontSize: 19, display: 'inline-block', color: HONEY }

const sCat: CSSProperties = {
  display: 'block',
  width: 'min(58vw, 180px)',
  height: 'auto',
  borderRadius: 12,
  objectFit: 'cover',
  filter: 'drop-shadow(0 8px 16px rgba(111,88,54,0.32))',
}

const sSorry: CSSProperties = {
  fontFamily: HAND,
  fontSize: 21,
  lineHeight: 1.1,
  color: INK_DARK,
  textAlign: 'center',
  letterSpacing: 0.3,
}

const sPhase: CSSProperties = {
  fontFamily: HAND,
  fontSize: 15,
  color: INK_SOFT,
  letterSpacing: 0.4,
  marginTop: -4,
}

const sBarOuter: CSSProperties = {
  width: '100%',
  height: 9,
  marginTop: 4,
  borderRadius: 999,
  background: BORDER_SOFT,
  border: `1px solid ${BORDER}`,
  overflow: 'hidden',
}

const sBarFill: CSSProperties = {
  height: '100%',
  width: '0%',
  borderRadius: 999,
  background: HONEY,
}

const sPct: CSSProperties = {
  fontFamily: HAND,
  fontSize: 14,
  color: INK,
}
