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
.alba-back:hover { opacity: 1; transform: translateX(-2px); }
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

            {tab === 'Credits' && <CreditsTab />}
            {tab === 'Socials' && <SocialsTab />}
          </div>
        </div>
      </div>

      {/* Back arrow — bottom-left, resumes play */}
      <button className="alba-back" style={sBack} onClick={closeMenu} aria-label="Back">
        <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span style={sBackLabel}>Back</span>
      </button>
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

function CreditsTab() {
  return (
    <div style={{ padding: '2px 4px' }}>
      <p style={sCreditLine}>A cozy island.</p>
      <p style={sCreditLine}>Design &amp; code by Emanuel Pfeifer.</p>
      <p style={sCreditLine}>Built with React Three Fiber &amp; three.js.</p>

      <div style={{ margin: '16px 0' }}><Divider /></div>

      <div style={sCreditHead}>Inspiration</div>
      <ExternalRow label="Bruno Simon" sub="bruno-simon.com" href="https://bruno-simon.com/" />
      <ExternalRow
        label="COSMOS"
        sub="darkobyte · stargaze feature"
        href="https://github.com/darkobyte/COSMOS"
      />

      <div style={{ margin: '16px 0' }}><Divider /></div>

      <div style={sCreditHead}>Assets</div>
      <ExternalRow
        label="Minecraft Boat"
        sub="vovash · CC BY 4.0"
        href="https://sketchfab.com/3d-models/minecraft-boat-e0d9d3e6cdd1430e83c94bf4998ed391"
      />
      <ExternalRow
        label="Stylized Lamp"
        sub="Sketchfab"
        href="https://sketchfab.com/3d-models/stylized-lamp-c511b5e92d39457e96c71938aad70266"
      />
      <ExternalRow
        label="Stylized Nature Megakit"
        sub="Quaternius"
        href="https://quaternius.itch.io/stylized-nature-megakit"
      />
    </div>
  )
}

function SocialsTab() {
  // TODO: drop in your real profile URLs — email below is wired up already.
  return (
    <div style={{ padding: '2px 4px' }}>
      <div style={{ ...sCreditHead, marginBottom: 10 }}>{'Contact me <3'}</div>
      <ExternalRow label="Email" sub="emanuelpfeifer1@gmail.com" href="mailto:emanuelpfeifer1@gmail.com" />
      <Divider />
      <ExternalRow label="GitHub" sub="github.com/ryhox" href="https://github.com/ryhox" />
      <Divider />
      <ExternalRow label="Organisation" sub="github.com/pokyh-labs" href="https://github.com/pokyh-labs" />
    </div>
  )
}

function ExternalRow({ label, sub, href }: { label: string; sub: string; href: string }) {
  return (
    <a className="alba-row" style={{ ...sRow, textDecoration: 'none' }} href={href} target="_blank" rel="noopener noreferrer">
      <span style={sRowText}>{label}</span>
      <span style={sValue}>{sub}</span>
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

const sBack: CSSProperties = {
  position: 'fixed', bottom: 26, left: 24,
  display: 'flex', alignItems: 'center', gap: 6,
  appearance: 'none', background: 'none', border: 'none', padding: 6,
  color: '#fff', cursor: 'pointer', opacity: 0.88, lineHeight: 0,
  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
  transition: 'opacity 0.12s, transform 0.12s',
}

const sBackLabel: CSSProperties = {
  fontFamily: HAND, fontSize: 20, lineHeight: 1,
  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
}

const sSheetWrap: CSSProperties = {
  position: 'relative',
  width: 'min(90vw, 384px)',
  transform: 'rotate(-0.6deg)',
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
