import { clamp01, smoothstep } from '../scene/palette'

// Procedural ambience — no audio files, generated entirely with the Web Audio
// API and crossfaded by time of day:
//   • sea wash + soft wind   (always)
//   • crickets               (night)
//   • birdsong               (day, peaking at dawn)
//   • owl hoots              (night)
//   • a gentle generative music pad (always, mellower at night)
//
// startAmbience() must be called inside a user gesture (the Enter button).
// updateAmbience(t, muted) is called every frame to set the crossfades.

let ctx: AudioContext | null = null
let started = false

let master: GainNode
let gWaves: GainNode
let gWind: GainNode
let gCrickets: GainNode
let gBirds: GainNode
let gOwl: GainNode
let gMusic: GainNode
let musicDelay: DelayNode

let dayAmt = 0.5
let nightAmt = 0.5
let morning = 0

function noiseBuffer(seconds: number): AudioBuffer {
  const len = ctx!.sampleRate * seconds
  const buf = ctx!.createBuffer(1, len, ctx!.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function loopNoise(): AudioBufferSourceNode {
  const src = ctx!.createBufferSource()
  // A longer buffer so the loop point isn't audible as a ~2s repeating pulse.
  src.buffer = noiseBuffer(8)
  src.loop = true
  return src
}

// --- continuous beds --------------------------------------------------------
function buildSea() {
  const src = loopNoise()
  const lp = ctx!.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 480
  // slow swell
  const lfo = ctx!.createOscillator()
  lfo.frequency.value = 0.1
  const lfoGain = ctx!.createGain()
  lfoGain.gain.value = 0.22
  const swell = ctx!.createGain()
  swell.gain.value = 0.72
  lfo.connect(lfoGain).connect(swell.gain)
  src.connect(lp).connect(swell).connect(gWaves)
  src.start()
  lfo.start()
}

function buildWind() {
  // Wind, not water: the difference is movement. Static filtered noise just
  // hisses like surf — so here the lowpass cutoff and a resonant "whistle" peak
  // are continuously swept by slow LFOs, with a separate gust swell on the
  // level. A highpass keeps it out of the sea's low rumble so the two beds read
  // as distinct.
  const src = loopNoise()

  const hp = ctx!.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 240

  // airy rushing body — cutoff drifts up/down for the whoosh
  const body = ctx!.createBiquadFilter()
  body.type = 'lowpass'
  body.frequency.value = 820
  body.Q.value = 0.4

  // faint howl through the trees — a resonant band that slowly sweeps
  const whistle = ctx!.createBiquadFilter()
  whistle.type = 'bandpass'
  whistle.frequency.value = 1150
  whistle.Q.value = 4.5
  const whistleGain = ctx!.createGain()
  whistleGain.gain.value = 0.18

  // short-term gust swell on the overall level (on top of the wind-strength
  // gain driven in updateAmbience)
  const swell = ctx!.createGain()
  swell.gain.value = 0.7

  const mkLfo = (rate: number, depth: number, target: AudioParam) => {
    const o = ctx!.createOscillator()
    o.frequency.value = rate
    const g = ctx!.createGain()
    g.gain.value = depth
    o.connect(g).connect(target)
    o.start()
  }
  mkLfo(0.13, 420, body.frequency) // cutoff sweeps ~400..1240 Hz
  mkLfo(0.071, 520, whistle.frequency) // whistle wanders
  mkLfo(0.09, 0.38, swell.gain) // gusting

  src.connect(hp)
  hp.connect(body).connect(swell)
  hp.connect(whistle).connect(whistleGain).connect(swell)
  swell.connect(gWind)
  src.start()
}

function buildCrickets() {
  const src = loopNoise()
  const bp = ctx!.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 4600
  bp.Q.value = 14
  // chirp pulsing
  const lfo = ctx!.createOscillator()
  lfo.type = 'square'
  lfo.frequency.value = 7
  const lfoGain = ctx!.createGain()
  lfoGain.gain.value = 0.5
  const trem = ctx!.createGain()
  trem.gain.value = 0.5
  lfo.connect(lfoGain).connect(trem.gain)
  src.connect(bp).connect(trem).connect(gCrickets)
  src.start()
  lfo.start()
}

// --- one-shot voices --------------------------------------------------------
function chirp() {
  if (!ctx) return
  const now = ctx.currentTime
  const notes = 1 + Math.floor(Math.random() * 3)
  for (let i = 0; i < notes; i++) {
    const t0 = now + i * 0.09
    const o = ctx.createOscillator()
    o.type = 'sine'
    const f = 1900 + Math.random() * 1900
    o.frequency.setValueAtTime(f, t0)
    o.frequency.exponentialRampToValueAtTime(f * 1.35, t0 + 0.05)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(0.5, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.13)
    o.connect(g).connect(gBirds)
    o.start(t0)
    o.stop(t0 + 0.16)
  }
}

function hoot() {
  if (!ctx) return
  const now = ctx.currentTime
  for (let i = 0; i < 2; i++) {
    const t0 = now + i * 0.34
    const o = ctx.createOscillator()
    o.type = 'sine'
    const f = 420 - i * 30
    o.frequency.setValueAtTime(f, t0)
    o.frequency.linearRampToValueAtTime(f * 0.96, t0 + 0.25)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(0.5, t0 + 0.06)
    g.gain.setValueAtTime(0.5, t0 + 0.18)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.34)
    // soft vibrato body
    const v = ctx.createOscillator()
    v.frequency.value = 12
    const vg = ctx.createGain()
    vg.gain.value = 6
    v.connect(vg).connect(o.frequency)
    o.connect(g).connect(gOwl)
    o.start(t0)
    o.stop(t0 + 0.4)
    v.start(t0)
    v.stop(t0 + 0.4)
  }
}

// gentle generative music in a warm pentatonic scale
const SCALE = [0, 2, 4, 7, 9, 12, 16] // C major pentatonic across two octaves
const ROOT = 261.63 / 2 // C3
function note() {
  if (!ctx) return
  const now = ctx.currentTime
  const semis = SCALE[Math.floor(Math.random() * SCALE.length)] + (Math.random() < 0.3 ? 12 : 0)
  const freq = ROOT * Math.pow(2, semis / 12)
  const o = ctx.createOscillator()
  o.type = Math.random() < 0.5 ? 'triangle' : 'sine'
  o.frequency.value = freq
  const g = ctx.createGain()
  const peak = 0.18 * (0.7 + dayAmt * 0.3)
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(peak, now + 0.4)
  g.gain.exponentialRampToValueAtTime(0.001, now + 2.6)
  o.connect(g)
  g.connect(gMusic)
  g.connect(musicDelay) // spacious echo
  o.start(now)
  o.stop(now + 2.8)
}

function scheduleLoop(fn: () => void, min: number, max: number, gate: () => number) {
  const tick = () => {
    if (started && Math.random() < gate()) fn()
    setTimeout(tick, (min + Math.random() * (max - min)) * 1000)
  }
  setTimeout(tick, (min + Math.random() * (max - min)) * 1000)
}

export async function startAmbience(): Promise<void> {
  if (started) {
    if (ctx?.state === 'suspended') await ctx.resume()
    return
  }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  ctx = new AC()
  if (ctx.state === 'suspended') await ctx.resume()

  master = ctx.createGain()
  master.gain.value = 0.0
  const comp = ctx.createDynamicsCompressor()
  master.connect(comp).connect(ctx.destination)

  const mk = (v: number) => {
    const g = ctx!.createGain()
    g.gain.value = v
    g.connect(master)
    return g
  }
  gWaves = mk(0) // driven by shore proximity in updateAmbience
  gWind = mk(0) // driven (softer at night) in updateAmbience
  gCrickets = mk(0)
  gBirds = mk(0)
  gOwl = mk(0)
  gMusic = mk(0.0)

  // echo for the music
  musicDelay = ctx.createDelay()
  musicDelay.delayTime.value = 0.33
  const fb = ctx.createGain()
  fb.gain.value = 0.34
  const wet = ctx.createGain()
  wet.gain.value = 0.35
  musicDelay.connect(fb).connect(musicDelay)
  musicDelay.connect(wet).connect(gMusic)

  buildSea()
  buildWind()
  buildCrickets()

  scheduleLoop(chirp, 3, 7, () => dayAmt * (0.3 + morning * 0.5))
  scheduleLoop(hoot, 7, 16, () => (nightAmt > 0.45 ? 0.8 : 0))
  scheduleLoop(note, 1.8, 3.6, () => 0.8)

  started = true
  // fade in
  master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.5)
}

export function updateAmbience(t: number, muted: boolean, shoreAmt = 1, windStrength = 0.4): void {
  if (!ctx || !started) return
  const sunEl = Math.sin((t - 0.25) * Math.PI * 2)
  dayAmt = smoothstep(-0.15, 0.28, sunEl)
  nightAmt = 1 - dayAmt
  morning = Math.exp(-((t - 0.27) ** 2) / (2 * 0.05 * 0.05))

  const k = 0.05 // smoothing
  const set = (g: GainNode, target: number) => {
    g.gain.value += (target - g.gain.value) * k
  }
  // sea wash only swells up as you approach the shore (silent up on the hill)
  set(gWaves, clamp01(shoreAmt) * 0.22)
  // a subtle breeze that tracks the live wind strength (heavy gusts a little
  // louder than calm spells), trimmed further at night — kept well back so it's
  // ambience, not a focus
  set(gWind, (0.006 + windStrength * 0.026) * (0.6 + 0.4 * dayAmt))
  // crickets swell in slow waves rather than chirping non-stop all night, and
  // sit well back in the mix
  const cricketWave = Math.max(0, Math.sin(ctx.currentTime * 0.42))
  set(gCrickets, nightAmt * 0.03 * cricketWave)
  set(gBirds, dayAmt * (0.5 + morning * 0.8))
  set(gMusic, 0.32)
  master.gain.value += ((muted ? 0 : 0.9) - master.gain.value) * 0.08
}
