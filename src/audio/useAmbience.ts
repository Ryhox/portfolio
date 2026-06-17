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
let musicSource: AudioBufferSourceNode | null = null
let musicBuffer: AudioBuffer | null = null

let dayAmt = 0.5
let nightAmt = 0.5
let morning = 0

let _volMaster = 1, _volMusic = 0.5, _volWaves = 0.5, _volWind = 0.5, _volAmbient = 0.5

export function setVol(key: 'master' | 'music' | 'waves' | 'wind' | 'ambient', v: number) {
  if (key === 'master') _volMaster = v
  else if (key === 'music') _volMusic = v
  else if (key === 'waves') _volWaves = v
  else if (key === 'wind') _volWind = v
  else if (key === 'ambient') _volAmbient = v
}

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

async function loadAndPlayMusic() {
  if (!ctx || musicBuffer) return
  try {
    const res = await fetch('/audio/music.mp3')
    const arrayBuf = await res.arrayBuffer()
    musicBuffer = await ctx.decodeAudioData(arrayBuf)
    playMusicLoop()
  } catch (e) {
    console.warn('Could not load music.mp3', e)
  }
}

function playMusicLoop() {
  if (!ctx || !musicBuffer) return
  musicSource = ctx.createBufferSource()
  musicSource.buffer = musicBuffer
  musicSource.loop = true
  musicSource.connect(gMusic)
  musicSource.start()
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
  loadAndPlayMusic()

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
  set(gWaves, clamp01(shoreAmt) * 0.50 * _volWaves)
  set(gWind, (0.018 + windStrength * 0.075) * (0.6 + 0.4 * dayAmt) * _volWind)
  const cricketWave = Math.max(0, Math.sin(ctx.currentTime * 0.42))
  set(gCrickets, nightAmt * 0.07 * cricketWave * _volAmbient)
  set(gBirds, dayAmt * (0.7 + morning * 1.1) * _volAmbient)
  set(gMusic, 0.16 * _volMusic)
  master.gain.value += ((muted ? 0 : 0.9 * _volMaster) - master.gain.value) * 0.08
}
