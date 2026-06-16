import type { CSSProperties } from 'react'
import { useWorld } from '../state/useWorld'
import { startAmbience } from '../audio/useAmbience'
import { requestLock } from '../scene/pointerLock'

// Cozy title screen. The Enter button is the single user gesture that unlocks
// audio (browser autoplay policy) and drops the visitor into first person.
export function StartOverlay() {
  const started = useWorld((s) => s.started)
  if (started) return null

  // Everything here must stay synchronous so the browser still counts this as
  // the user gesture that unlocks audio + pointer lock.
  const enter = () => {
    requestLock()
    void startAmbience()
    useWorld.getState().setStarted(true)
  }

  return (
    <div id="start-overlay" style={wrap}>
      <div style={card}>
        <div style={kicker}>✦ a cozy little place ✦</div>
        <h1 style={title}>Witchwood Isle</h1>
        <p style={sub}>
          A tiny enchanted island that breathes with the day. Wander the path, find the witch&apos;s
          nook, and stay for the fireflies.
        </p>
        <button style={btn} onClick={enter} onMouseDown={(e) => e.preventDefault()}>
          Enter the Isle
        </button>
        <div style={hint}>
          <span>🖱 drag to look</span>
          <span>⌨ WASD to wander</span>
          <span>⎋ Esc to pause</span>
        </div>
        <div style={credit}>headphones recommended · sound on 🔊</div>
      </div>
    </div>
  )
}

const wrap: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: 'radial-gradient(120% 120% at 50% 30%, rgba(20,16,34,0.25), rgba(8,7,18,0.78))',
  backdropFilter: 'blur(2px)',
  zIndex: 20,
}
const card: CSSProperties = {
  width: 'min(92vw, 560px)',
  padding: '38px 40px 30px',
  textAlign: 'center',
  borderRadius: 26,
  background: 'linear-gradient(165deg, rgba(44,34,66,0.66), rgba(24,20,42,0.72))',
  border: '1px solid var(--glass-border)',
  boxShadow: '0 30px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
}
const kicker: CSSProperties = {
  letterSpacing: 4,
  fontSize: 12,
  textTransform: 'uppercase',
  color: 'var(--warm)',
  opacity: 0.85,
}
const title: CSSProperties = {
  margin: '10px 0 6px',
  fontSize: 'clamp(34px, 6vw, 52px)',
  fontWeight: 800,
  letterSpacing: 0.5,
  color: '#fff',
  textShadow: '0 2px 20px rgba(255,200,130,0.35)',
}
const sub: CSSProperties = {
  margin: '0 auto 24px',
  maxWidth: 420,
  lineHeight: 1.6,
  color: 'rgba(255,255,255,0.78)',
  fontSize: 15,
}
const btn: CSSProperties = {
  appearance: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '14px 34px',
  borderRadius: 999,
  fontSize: 17,
  fontWeight: 700,
  color: '#3a2410',
  background: 'linear-gradient(180deg, #ffe2ab, #f0b873)',
  boxShadow: '0 10px 26px rgba(240,184,115,0.4), inset 0 1px 0 rgba(255,255,255,0.6)',
  transition: 'transform 0.15s ease',
}
const hint: CSSProperties = {
  display: 'flex',
  gap: 18,
  justifyContent: 'center',
  flexWrap: 'wrap',
  marginTop: 22,
  fontSize: 13,
  color: 'rgba(255,255,255,0.6)',
}
const credit: CSSProperties = {
  marginTop: 14,
  fontSize: 12,
  color: 'rgba(255,255,255,0.4)',
}
