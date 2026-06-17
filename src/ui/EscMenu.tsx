import { type CSSProperties, useEffect, useState } from 'react'
import { type VolKey, useWorld } from '../state/useWorld'
import { requestLock } from '../scene/pointerLock'
import { setVol as setAudioVol } from '../audio/useAmbience'

const INJECTED_CSS = `
.esc-slider {
  -webkit-appearance: none; appearance: none;
  width: 100%; height: 5px; border-radius: 3px;
  outline: none; cursor: pointer;
  background: rgba(0,0,0,0.3);
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);
}
.esc-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 19px; height: 19px; border-radius: 50%;
  background: radial-gradient(circle at 38% 32%, #c8fff8, #00d8cc, #007870);
  border: 2px solid #005a54;
  box-shadow: 0 0 10px rgba(0,218,208,0.75), 0 2px 5px rgba(0,0,0,0.45);
  cursor: pointer; transition: transform 0.1s, box-shadow 0.1s;
}
.esc-slider::-webkit-slider-thumb:hover {
  transform: scale(1.22);
  box-shadow: 0 0 16px rgba(0,228,218,0.95), 0 2px 8px rgba(0,0,0,0.5);
}
.esc-slider::-moz-range-thumb {
  width: 19px; height: 19px; border-radius: 50%;
  background: radial-gradient(circle at 38% 32%, #c8fff8, #00d8cc, #007870);
  border: 2px solid #005a54;
  box-shadow: 0 0 10px rgba(0,218,208,0.75), 0 2px 5px rgba(0,0,0,0.45);
  cursor: pointer;
}
.esc-resume:hover { filter: brightness(1.12); }
.esc-resume:active { transform: translateY(4px) !important; box-shadow: 0 1px 0 #004c48 !important; }
`

type SliderDef = { label: string; icon: string; key: VolKey; val: number }

export function EscMenu() {
  const started  = useWorld(s => s.started)
  const menuOpen = useWorld(s => s.menuOpen)
  const volMaster  = useWorld(s => s.volMaster)
  const volMusic   = useWorld(s => s.volMusic)
  const volWaves   = useWorld(s => s.volWaves)
  const volWind    = useWorld(s => s.volWind)
  const volAmbient = useWorld(s => s.volAmbient)

  // Show menu whenever pointer lock is released (browser ESC exits lock automatically)
  useEffect(() => {
    const onChange = () => {
      if (!useWorld.getState().started) return
      useWorld.getState().setMenuOpen(!document.pointerLockElement)
    }
    document.addEventListener('pointerlockchange', onChange)
    return () => document.removeEventListener('pointerlockchange', onChange)
  }, [])

  const handleVol = (key: VolKey, v: number) => {
    useWorld.getState().setVol(key, v)
    setAudioVol(key, v)
  }

  if (!started || !menuOpen) return null

  const sliders: SliderDef[] = [
    { label: 'Master', icon: '🔊', key: 'master',  val: volMaster  },
    { label: 'Music',  icon: '🎵', key: 'music',   val: volMusic   },
    { label: 'Ocean',  icon: '🌊', key: 'waves',   val: volWaves   },
    { label: 'Wind',   icon: '🍃', key: 'wind',    val: volWind    },
    { label: 'Nature', icon: '🐦', key: 'ambient', val: volAmbient },
  ]

  return (
    <div style={sOverlay}>
      <style>{INJECTED_CSS}</style>

      <div style={{ position: 'relative', width: 'min(90vw, 440px)', marginTop: 28 }}>

        {/* ── Wooden title bar ── */}
        <div style={sTitleWrap}>
          <div style={sTitleBar}>
            <Gem />
            <span style={sTitleText}>SETTINGS</span>
            <Gem />
          </div>
        </div>

        {/* ── Stone panel ── */}
        <div style={sPanel}>
          {/* Stone crater marks */}
          <div style={{ ...sCrater, top: '16%', left:  '6%', width:  9, height:  7 }} />
          <div style={{ ...sCrater, top: '50%', left: '88%', width: 13, height: 10 }} />
          <div style={{ ...sCrater, top: '74%', left: '12%', width:  6, height:  6 }} />
          <div style={{ ...sCrater, top: '34%', left: '93%', width:  5, height:  8 }} />

          {/* Tab row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <div style={sTab}>🔊 SOUND</div>
          </div>

          <Divider />

          {/* Volume sliders */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15, padding: '4px 0 6px' }}>
            {sliders.map(({ label, icon, key, val }) => (
              <div key={key} style={sSliderRow}>
                <span style={sSliderIcon}>{icon}</span>
                <span style={sSliderLabel}>{label}</span>
                <input
                  type="range"
                  className="esc-slider"
                  min={0} max={1} step={0.01}
                  value={val}
                  onChange={e => handleVol(key, parseFloat(e.target.value))}
                  style={{ accentColor: '#00d8cc', flex: 1 }}
                />
                <span style={sSliderVal}>{Math.round(val * 100)}</span>
              </div>
            ))}
          </div>

          <Divider />

          {/* Resume button */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
            <button
              className="esc-resume"
              style={sBtnResume}
              onClick={requestLock}
            >
              ▶ RESUME
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Gem() {
  return (
    <div style={{
      width: 15, height: 15, borderRadius: '50%', flexShrink: 0,
      background: 'radial-gradient(circle at 36% 30%, #c8fff8, #00d8cc, #006868)',
      boxShadow: '0 0 9px #00e8d8, inset 0 1px 2px rgba(255,255,255,0.55)',
    }} />
  )
}

function Divider() {
  return (
    <div style={{
      height: 1, margin: '12px 0',
      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.13) 20%, rgba(255,255,255,0.13) 80%, transparent)',
    }} />
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sOverlay: CSSProperties = {
  position: 'fixed', inset: 0,
  display: 'grid', placeItems: 'center',
  background: 'rgba(6,5,14,0.8)',
  zIndex: 30,
}

const sTitleWrap: CSSProperties = {
  position: 'absolute', top: -26, left: 0, right: 0, zIndex: 1,
  display: 'flex', justifyContent: 'center',
}

const sTitleBar: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14,
  padding: '10px 32px',
  borderRadius: 999,
  background: 'linear-gradient(180deg, #d07e32 0%, #9e5018 44%, #7c3e12 100%)',
  border: '3px solid #542408',
  boxShadow: [
    '0 6px 0 #431c06',
    'inset 0 2px 0 rgba(255,215,130,0.42)',
    'inset 0 -3px 8px rgba(0,0,0,0.48)',
    '0 12px 28px rgba(0,0,0,0.6)',
  ].join(', '),
}

const sTitleText: CSSProperties = {
  color: '#fff',
  fontSize: 17, fontWeight: 900, letterSpacing: 4,
  textShadow: '0 2px 8px rgba(0,0,0,0.7), 0 0 20px rgba(255,200,120,0.1)',
}

const sPanel: CSSProperties = {
  position: 'relative',
  padding: '46px 30px 26px',
  borderRadius: 10,
  overflow: 'hidden',
  background: [
    'radial-gradient(ellipse 10px 7px at 18% 22%, rgba(0,0,0,0.2) 100%, transparent 100%)',
    'radial-gradient(ellipse  8px 5px at 76% 13%, rgba(255,255,255,0.055) 100%, transparent 100%)',
    'radial-gradient(ellipse 12px 9px at 58% 74%, rgba(0,0,0,0.16) 100%, transparent 100%)',
    'radial-gradient(ellipse  5px 6px at 90% 52%, rgba(255,255,255,0.045) 100%, transparent 100%)',
    'linear-gradient(158deg, #7c7c90 0%, #5c5c70 50%, #484860 100%)',
  ].join(', '),
  border: '3px solid #303050',
  boxShadow: [
    'inset 0 4px 18px rgba(255,255,255,0.07)',
    'inset 0 -8px 26px rgba(0,0,0,0.38)',
    '0 30px 75px rgba(0,0,0,0.72)',
    '0 0 0 1px rgba(255,255,255,0.035)',
  ].join(', '),
}

const sCrater: CSSProperties = {
  position: 'absolute',
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(0,0,0,0.22) 35%, transparent 68%)',
  pointerEvents: 'none',
}

const sTab: CSSProperties = {
  padding: '7px 22px',
  borderRadius: 6,
  background: 'linear-gradient(180deg, #32ead8 0%, #00c8ba 50%, #009e94 100%)',
  border: '2px solid #007a72',
  boxShadow: '0 4px 0 #005e58, 0 5px 14px rgba(0,180,170,0.38)',
  color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: 2,
  userSelect: 'none',
}

const sSliderRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
}

const sSliderIcon: CSSProperties = {
  fontSize: 15, width: 22, textAlign: 'center', flexShrink: 0,
  lineHeight: 1,
}

const sSliderLabel: CSSProperties = {
  width: 54, flexShrink: 0,
  color: 'rgba(255,255,255,0.88)',
  fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
  textTransform: 'uppercase',
  textShadow: '0 1px 4px rgba(0,0,0,0.55)',
}

const sSliderVal: CSSProperties = {
  width: 28, textAlign: 'right',
  color: 'rgba(255,255,255,0.62)',
  fontSize: 12, fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
}

const sBtnResume: CSSProperties = {
  appearance: 'none',
  border: '2px solid #007a72',
  cursor: 'pointer',
  padding: '11px 44px',
  borderRadius: 8,
  fontSize: 13, fontWeight: 900, letterSpacing: 2.5,
  color: '#fff',
  background: 'linear-gradient(180deg, #32ead8 0%, #00c8ba 50%, #009e94 100%)',
  boxShadow: '0 5px 0 #005e58, 0 7px 18px rgba(0,180,170,0.42)',
  textShadow: '0 1px 4px rgba(0,0,0,0.45)',
  transition: 'filter 0.1s',
}
