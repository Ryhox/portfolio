import type { CSSProperties } from 'react'
import { phaseLabel, useWorld } from '../state/useWorld'

function clock(t: number) {
  const total = t * 24
  const h = Math.floor(total)
  const m = Math.floor((total - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Bottom control bar: time of day, scrub/pause, mute. Only while exploring.
export function Hud() {
  const started = useWorld((s) => s.started)
  const t = useWorld((s) => s.t)
  const paused = useWorld((s) => s.paused)
  const muted = useWorld((s) => s.muted)
  if (!started) return null

  return (
    <div style={bar}>
      <div style={clockBox}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{clock(t)}</span>
        <span style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1 }}>{phaseLabel(t)}</span>
      </div>

      <button style={iconBtn} title={paused ? 'Resume time' : 'Pause time'} onClick={() => useWorld.getState().togglePaused()}>
        {paused ? '▶' : '⏸'}
      </button>

      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={t}
        onChange={(e) => useWorld.getState().setT(parseFloat(e.target.value))}
        style={slider}
        title="Scrub time of day"
      />

      <button style={iconBtn} title={muted ? 'Unmute' : 'Mute'} onClick={() => useWorld.getState().toggleMuted()}>
        {muted ? '🔇' : '🔊'}
      </button>
    </div>
  )
}

const bar: CSSProperties = {
  position: 'fixed',
  bottom: 18,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '10px 16px',
  borderRadius: 999,
  background: 'var(--glass)',
  border: '1px solid var(--glass-border)',
  backdropFilter: 'blur(10px)',
  boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
  zIndex: 15,
  color: '#fff',
}
const clockBox: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  minWidth: 78,
  lineHeight: 1.15,
}
const iconBtn: CSSProperties = {
  appearance: 'none',
  width: 38,
  height: 38,
  borderRadius: '50%',
  border: '1px solid var(--glass-border)',
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 15,
}
const slider: CSSProperties = {
  width: 'min(46vw, 320px)',
  accentColor: '#f0b873',
  cursor: 'pointer',
}
