import { type CSSProperties, useEffect, useState } from 'react'
import { useWorld } from '../state/useWorld'
import { requestLock, exitLock, cancelLock, isAcquiring } from '../scene/pointerLock'
import { setVol as setAudioVol } from '../audio/useAmbience'

// A faithful recreation of the Alba "torn notepad" settings sheet: cream paper
// with a punched spiral top edge, handwritten ink, tan sliders with a square
// thumb, and pill toggles. Graphics cycles Low→Medium→High; Music + Sound Fx
// drive the live audio mix. ESC (or the bottom-left back arrow) resumes play.
const HAND = "'Patrick Hand', 'Nunito', cursive"
const INK = '#6f5836'
const INK_DARK = '#5a4528'
const INK_SOFT = 'rgba(111,88,54,0.55)'
const DIVIDER = 'rgba(120,98,64,0.22)'
const TRACK = '#d7c8a3'
const HIGHLIGHT = 'rgba(255,251,236,0.7)'

const INJECTED_CSS = `
.alba-scroll { scrollbar-width: thin; scrollbar-color: #fffaf0 transparent; }
.alba-scroll::-webkit-scrollbar { width: 8px; }
.alba-scroll::-webkit-scrollbar-track { background: rgba(120,98,64,0.16); border-radius: 8px; }
.alba-scroll::-webkit-scrollbar-thumb { background: #fffaf0; border-radius: 8px; border: 1px solid #d7c8a3; }

.alba-slider {
  -webkit-appearance: none; appearance: none;
  width: 100%; height: 6px; border-radius: 4px; outline: none; cursor: pointer;
  background: ${TRACK};
  box-shadow: inset 0 1px 2px rgba(90,69,40,0.4);
}
.alba-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px; height: 26px; border-radius: 3px;
  background: #fffdf6; border: 1px solid #c9ba94;
  box-shadow: 0 2px 4px rgba(90,69,40,0.35);
  cursor: pointer;
}
.alba-slider::-moz-range-thumb {
  width: 18px; height: 26px; border-radius: 3px;
  background: #fffdf6; border: 1px solid #c9ba94;
  box-shadow: 0 2px 4px rgba(90,69,40,0.35); cursor: pointer;
}
.alba-row { transition: background 0.12s; }
.alba-row:hover { background: ${HIGHLIGHT}; }
`

type Tab = 'Settings' | 'Credits' | 'Socials'

export function EscMenu() {
  const started  = useWorld(s => s.started)
  const menuOpen = useWorld(s => s.menuOpen)
  const quality  = useWorld(s => s.quality)
  const volMusic = useWorld(s => s.volMusic)
  const volWaves = useWorld(s => s.volWaves) // representative of the SFX group
  const invertX  = useWorld(s => s.invertX)
  const invertY  = useWorld(s => s.invertY)
  const [tab, setTab] = useState<Tab>('Settings')
  const [applying, setApplying] = useState(false)
  const [extHref, setExtHref] = useState<string | null>(null) // pending external link → warn first

  // ── Menu / pointer-lock flow ───────────────────────────────────────────────
  // `menuOpen` is the single source of truth. ESC toggles it; pointer lock just
  // follows — locked while playing, free while the menu (or map) is up. This keeps
  // open ↔ close ↔ reopen snappy and never traps the cursor.

  // Whenever the menu is up, free the cursor and stop any re-lock polling.
  useEffect(() => {
    if (started && menuOpen) exitLock()
  }, [started, menuOpen])

  // ESC keydown. While LOCKED the browser eats this to exit pointer lock, so the
  // open-from-play case is caught by pointerlockchange below instead. While
  // UNLOCKED it fires normally — so it CLOSES the menu and, crucially, can REOPEN
  // it instantly during the browser's post-ESC re-lock cooldown (no waiting).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      const ws = useWorld.getState()
      if (!ws.started || ws.mapOpen) return // the world map owns its own ESC
      e.preventDefault()
      if (ws.menuOpen) {
        ws.setMenuOpen(false)
        requestLock()
      } else if (ws.infoOpen) {
        ws.setInfoOpen(false) // ESC closes the island info popup, then resumes play
        requestLock()
      } else {
        ws.setMenuOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Pointer-lock changes. A real loss of lock = the user pressed ESC while playing
  // → open the menu. We ignore the brief grant→revoke "bounce" the browser emits
  // while we're re-acquiring (isAcquiring), which used to flicker the menu back up.
  useEffect(() => {
    const onChange = () => {
      const ws = useWorld.getState()
      if (!ws.started) return
      if (document.pointerLockElement) {
        cancelLock() // settled into play
        if (ws.menuOpen) ws.setMenuOpen(false)
        return
      }
      if (ws.mapOpen || isAcquiring() || ws.menuOpen) return
      if (ws.infoOpen) {
        ws.setInfoOpen(false) // ESC out of an island closes the info popup, resumes
        requestLock()
        return
      }
      ws.setMenuOpen(true) // genuine ESC-out-of-play → settings
    }
    document.addEventListener('pointerlockchange', onChange)
    return () => document.removeEventListener('pointerlockchange', onChange)
  }, [])

  const closeMenu = () => {
    useWorld.getState().setMenuOpen(false)
    requestLock()
  }

  const cycleGraphics = () => {
    useWorld.getState().cycleQuality()
    setApplying(true)
    window.setTimeout(() => setApplying(false), 600)
  }

  const setMusic = (v: number) => {
    useWorld.getState().setVol('music', v)
    setAudioVol('music', v)
  }
  // One "Sound Fx" fader drives every non-music bed at once.
  const setSfx = (v: number) => {
    for (const key of ['waves', 'wind', 'ambient'] as const) {
      useWorld.getState().setVol(key, v)
      setAudioVol(key, v)
    }
  }

  if (!started || !menuOpen) return null

  return (
    <div style={sOverlay}>
      <style>{INJECTED_CSS}</style>

      {/* The notepad sheet */}
      <div style={sSheetWrap}>
        <div style={sHoleRow}>
          {Array.from({ length: 8 }).map((_, i) => <span key={i} style={sHole} />)}
        </div>

        <div className="alba-scroll" style={sSheet}>
          {/* Tabs in place of the old single title */}
          <div style={sTabRow}>
            {(['Settings', 'Credits', 'Socials'] as Tab[]).map(tb => (
              <button
                key={tb}
                style={{ ...sTab, ...(tab === tb ? sTabActive : null) }}
                onClick={() => setTab(tb)}
              >
                {tb}
              </button>
            ))}
          </div>

          <div style={sContent}>
            {tab === 'Settings' && (
              <>
                <ValueRow label="Graphics" value={quality} busy={applying} onClick={cycleGraphics} />
                <Divider />
                <ValueRow label="Language" value="English" />
                <Divider />

                <Fader label="Music" value={volMusic} onChange={setMusic} />
                <Divider />
                <Fader label="Sound Fx" value={volWaves} onChange={setSfx} />
                <Divider />

                <Toggle label="Invert X axis" on={invertX} onClick={() => useWorld.getState().toggleInvert('x')} />
                <Toggle label="Invert Y axis" on={invertY} onClick={() => useWorld.getState().toggleInvert('y')} />
              </>
            )}

            {tab === 'Credits' && <CreditsTab onExternal={setExtHref} />}
            {tab === 'Socials' && <SocialsTab onExternal={setExtHref} />}
          </div>
        </div>

        {/* X close — top-right of the sheet, same as the world map's close button */}
        <button style={sCloseX} onClick={closeMenu} aria-label="Close settings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5a4528" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      {extHref && (
        <ExternalWarning
          href={extHref}
          onCancel={() => setExtHref(null)}
          onConfirm={() => {
            window.open(extHref, '_blank', 'noopener,noreferrer')
            setExtHref(null)
          }}
        />
      )}
    </div>
  )
}

// A small confirm that pops before any link leaves for a website outside the
// island, so visitors always opt in to navigating away.
function ExternalWarning({ href, onCancel, onConfirm }: { href: string; onCancel: () => void; onConfirm: () => void }) {
  let host = href
  try {
    host = new URL(href).hostname.replace(/^www\./, '')
  } catch {
    /* keep the raw href */
  }
  return (
    <div style={sWarnBackdrop} onClick={onCancel}>
      <div style={sWarnCard} onClick={(e) => e.stopPropagation()}>
        <svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke="#a9762a"
          strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div style={sWarnTitle}>Heads up — external site</div>
        <div style={sWarnText}>This link leaves the island and opens an outside website:</div>
        <div style={sWarnUrl}>{host}</div>
        <div style={sWarnBtns}>
          <button style={sWarnCancel} onClick={onCancel}>Stay here</button>
          <button style={sWarnGo} onClick={onConfirm}>Continue</button>
        </div>
      </div>
    </div>
  )
}

function ValueRow({
  label, value, onClick, busy,
}: { label: string; value: string; onClick?: () => void; busy?: boolean }) {
  return (
    <div className="alba-row" style={{ ...sRow, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <span style={sRowText}>{label}</span>
      <span style={sValue}>{busy ? 'applying…' : value}</span>
      {busy ? <Spinner /> : onClick && <Chevron />}
    </div>
  )
}

function CreditsTab({ onExternal }: { onExternal: (href: string) => void }) {
  return (
    <div style={{ padding: '2px 4px' }}>
      <p style={sCreditLine}>A cozy island.</p>
      <p style={sCreditLine}>Design &amp; code by Emanuel Pfeifer.</p>
      <p style={sCreditLine}>Built with React Three Fiber &amp; three.js.</p>

      <div style={{ margin: '16px 0' }}><Divider /></div>

      <div style={sCreditHead}>Inspiration</div>
      <ExternalRow
        label="Bruno Simon"
        sub="bruno-simon.com"
        license="basic idea"
        href="https://bruno-simon.com/"
        onExternal={onExternal}
      />
      <ExternalRow
        label="COSMOS"
        sub="darkobyte"
        license="stargaze feature"
        href="https://github.com/darkobyte/COSMOS"
        onExternal={onExternal}
      />
      <ExternalRow
        label="Helper"
        sub="Plattnericus"
        license="for giving ideas"
        href="https://github.com/Plattnericus"
        onExternal={onExternal}
      />

      <div style={{ margin: '16px 0' }}><Divider /></div>

      <div style={sCreditHead}>Assets</div>
      <ExternalRow
        label="Minecraft Boat"
        sub="vovash"
        license="CC BY 4.0"
        href="https://sketchfab.com/3d-models/minecraft-boat-e0d9d3e6cdd1430e83c94bf4998ed391"
        onExternal={onExternal}
      />
      <ExternalRow
        label="Stylized Lamp"
        sub="Giannis97"
        license="CC BY 4.0"
        href="https://sketchfab.com/3d-models/stylized-lamp-c511b5e92d39457e96c71938aad70266"
        onExternal={onExternal}
      />
      <ExternalRow
        label="Stylized Fish Model"
        sub="RahulTambat"
        license="CC BY 4.0"
        href="https://sketchfab.com/3d-models/stylized-fish-model-730c3ca02c27453184652d1c4bbb757c"
        onExternal={onExternal}
      />
      <ExternalRow
        label="Cartoon Manta Ray"
        sub="Jungle Jim"
        license="CC BY 4.0"
        href="https://sketchfab.com/3d-models/cartoon-manta-ray-animated-3f56886ab5fe4c7b8b151ea0974bf5b3"
        onExternal={onExternal}
      />
      <ExternalRow
        label="Trout Fish Animated"
        sub="Sba Stuff"
        license="CC BY 4.0"
        href="https://sketchfab.com/3d-models/trout-fish-animated-4fa0cb7afc004d65bd49f406bffd5b2b"
        onExternal={onExternal}
      />
      <ExternalRow
        label="Stylized Nature Megakit"
        sub="Quaternius"
        license="CC0"
        href="https://quaternius.itch.io/stylized-nature-megakit"
        onExternal={onExternal}
      />
    </div>
  )
}

function SocialsTab({ onExternal }: { onExternal: (href: string) => void }) {
  return (
    <div style={{ padding: '2px 4px' }}>
      <div style={{ ...sCreditHead, marginBottom: 10 }}>{'Contact me <3'}</div>
      <ExternalRow label="Email" sub="emanuelpfeifer1@gmail.com" href="mailto:emanuelpfeifer1@gmail.com" onExternal={onExternal} />
      <Divider />
      <ExternalRow label="GitHub" sub="github.com/ryhox" href="https://github.com/ryhox" onExternal={onExternal} />
      <Divider />
      <ExternalRow label="Organisation" sub="github.com/pokyh-labs" href="https://github.com/pokyh-labs" onExternal={onExternal} />
    </div>
  )
}

function ExternalRow({
  label, sub, href, onExternal, license,
}: { label: string; sub: string; href: string; onExternal: (href: string) => void; license?: string }) {
  // Web links get the "leaving for an external site" warning first; mailto: just opens the mail client.
  const isWeb = href.startsWith('http')
  return (
    <a
      className="alba-row"
      style={{ ...sRow, textDecoration: 'none' }}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={isWeb ? (e) => { e.preventDefault(); onExternal(href) } : undefined}
    >
      <span style={sRowText}>{label}</span>
      <span style={sValueCol}>
        <span style={sValue}>{sub}</span>
        {license && <span style={sLicense}>{license}</span>}
      </span>
      <Chevron />
    </a>
  )
}

function Spinner() {
  return (
    <svg className="alba-spin" width={18} height={18} viewBox="0 0 24 24" fill="none"
      stroke={INK} strokeWidth={3} strokeLinecap="round" style={{ flexShrink: 0 }}>
      <path d="M12 3 a9 9 0 0 1 9 9" />
    </svg>
  )
}

function Fader({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ padding: '8px 4px 4px' }}>
      <div style={sRowText}>{label}</div>
      <input
        type="range" className="alba-slider" min={0} max={1} step={0.01}
        value={value} onChange={e => onChange(parseFloat(e.target.value))}
        style={{ marginTop: 10 }}
      />
      <div style={sMinMax}>
        <span>Min</span>
        <span>Max</span>
      </div>
    </div>
  )
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <div className="alba-row" style={sRow} onClick={onClick}>
      <span style={sRowText}>{label}</span>
      <div style={{ ...sToggleTrack, justifyContent: on ? 'flex-end' : 'flex-start' }}>
        <div style={sToggleKnob} />
      </div>
    </div>
  )
}

function Chevron() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={INK}
      strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function Divider() {
  return <div style={{ height: 1, background: DIVIDER, margin: '2px 4px' }} />
}

// ── Styles ─────────────────────────────────────────────────────────────────

const sOverlay: CSSProperties = {
  position: 'fixed', inset: 0,
  display: 'grid', placeItems: 'center',
  background: 'transparent',
  zIndex: 30,
}

const sSheetWrap: CSSProperties = {
  position: 'relative',
  width: 'min(90vw, 384px)',
  transform: 'rotate(-0.6deg)',
}

// X close button, pinned to the sheet's top-right corner above the spiral holes.
const sCloseX: CSSProperties = {
  position: 'absolute',
  top: -14,
  right: 6,
  width: 30,
  height: 30,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  borderRadius: 8,
  background: '#efe4c6',
  border: '1px solid #d7c8a3',
  boxShadow: '0 1px 2px rgba(90,69,40,0.25)',
  cursor: 'pointer',
  zIndex: 3,
}

const sHoleRow: CSSProperties = {
  position: 'absolute', top: 11, left: 0, right: 0, zIndex: 2,
  display: 'flex', justifyContent: 'space-evenly', padding: '0 14px',
  pointerEvents: 'none',
}

const sHole: CSSProperties = {
  width: 22, height: 22, borderRadius: '50%',
  background: 'radial-gradient(circle at 50% 38%, rgba(58,46,30,0.62), rgba(40,32,20,0.5))',
  boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.5)',
}

const sSheet: CSSProperties = {
  position: 'relative',
  // Fixed height so every tab is the same size; short tabs centre their content,
  // long ones scroll.
  height: 'min(80vh, 520px)',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  padding: '48px 26px 26px',
  borderRadius: '5px 5px 7px 7px',
  background: 'linear-gradient(176deg, #f6efda 0%, #efe5cb 60%, #e8ddbf 100%)',
  boxShadow: [
    'inset 0 2px 0 rgba(255,255,255,0.55)',
    'inset 0 -10px 26px rgba(120,98,64,0.14)',
    '0 24px 60px rgba(0,0,0,0.45)',
  ].join(', '),
}

const sTabRow: CSSProperties = {
  display: 'flex', justifyContent: 'center', gap: 4, flexWrap: 'wrap',
  marginBottom: 16, flexShrink: 0,
}

const sContent: CSSProperties = {
  flex: 1, display: 'flex', flexDirection: 'column',
}

const sTab: CSSProperties = {
  appearance: 'none', background: 'none', border: 'none', cursor: 'pointer',
  fontFamily: HAND, fontSize: 26, color: INK_SOFT, padding: '2px 10px',
  borderBottom: '2px solid transparent', lineHeight: 1.1, letterSpacing: 0.5,
}

const sTabActive: CSSProperties = {
  color: INK_DARK, borderBottom: `2px solid ${INK_DARK}`,
}

const sCreditLine: CSSProperties = {
  fontFamily: HAND, color: INK, fontSize: 19, lineHeight: 1.45, margin: '3px 0',
}

const sCreditHead: CSSProperties = {
  fontFamily: HAND, color: INK_DARK, fontSize: 21, margin: '6px 0 2px',
}

const sRow: CSSProperties = {
  position: 'relative',
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '11px 4px', borderRadius: 5, cursor: 'pointer',
}

const sRowText: CSSProperties = {
  flex: 1,
  fontFamily: HAND, color: INK,
  fontSize: 22, lineHeight: 1.1, letterSpacing: 0.5,
}

const sValue: CSSProperties = {
  fontFamily: HAND, color: INK_SOFT, fontSize: 20, flexShrink: 0,
}

// Author name + (optional) licence stacked, right-aligned, in the asset credits.
const sValueCol: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
  flexShrink: 0, lineHeight: 1.15,
}

const sLicense: CSSProperties = {
  fontFamily: HAND, color: 'rgba(111,88,54,0.6)', fontSize: 15,
}

const sMinMax: CSSProperties = {
  display: 'flex', justifyContent: 'space-between',
  marginTop: 6,
  fontFamily: HAND, color: INK_SOFT, fontSize: 16,
}

const sToggleTrack: CSSProperties = {
  display: 'flex', alignItems: 'center',
  width: 52, height: 26, padding: 3, borderRadius: 5,
  background: TRACK, boxShadow: 'inset 0 1px 3px rgba(90,69,40,0.45)',
  flexShrink: 0,
}

const sToggleKnob: CSSProperties = {
  width: 22, height: 20, borderRadius: 3,
  background: '#fffdf6', border: '1px solid #c9ba94',
  boxShadow: '0 1px 3px rgba(90,69,40,0.4)',
}

// ── External-link warning ────────────────────────────────────────────────────
const sWarnBackdrop: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 60,
  display: 'grid', placeItems: 'center',
  background: 'rgba(20,16,10,0.55)',
}

const sWarnCard: CSSProperties = {
  width: 'min(86vw, 320px)',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  gap: 8, padding: '22px 22px 18px', borderRadius: 12,
  background: '#f6efda', border: '1px solid #d7c8a3',
  boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
  textAlign: 'center',
}

const sWarnTitle: CSSProperties = {
  fontFamily: HAND, fontSize: 23, color: INK_DARK, lineHeight: 1.1,
}

const sWarnText: CSSProperties = {
  fontFamily: HAND, fontSize: 16, color: INK, lineHeight: 1.3, marginTop: 2,
}

const sWarnUrl: CSSProperties = {
  fontFamily: HAND, fontSize: 18, color: '#8a6d3b',
  wordBreak: 'break-all', margin: '2px 0 6px',
}

const sWarnBtns: CSSProperties = {
  display: 'flex', gap: 10, marginTop: 6, width: '100%',
}

const sWarnCancel: CSSProperties = {
  flex: 1, padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
  fontFamily: HAND, fontSize: 18, color: INK_DARK,
  background: '#efe4c6', border: '1px solid #d7c8a3',
}

const sWarnGo: CSSProperties = {
  flex: 1, padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
  fontFamily: HAND, fontSize: 18, color: '#f6efda',
  background: '#5a4528', border: '1px solid #4a3c26',
}
