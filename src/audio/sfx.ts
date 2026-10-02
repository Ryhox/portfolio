import { useApp } from '@/lib/store';
import { audio } from './engine';

/**
 * The interface sounds, synthesised on the spot: no files. Everything is quiet, short and
 * mechanical, and nothing plays unless the visitor switched sound on.
 */
function ready() {
  if (!useApp.getState().sound) return null;
  const ctx = audio.ensure();
  if (!ctx || !audio.fx) return null;
  return { ctx, out: audio.fx };
}

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: AudioContext) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

function burst(freq: number, q: number, dur: number, gain: number, type: BiquadFilterType = 'bandpass', delay = 0) {
  const r = ready();
  if (!r) return;
  const { ctx, out } = r;
  const t = ctx.currentTime + delay;
  const src = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.3);
  src.stop(t + dur + 0.02);
}

function tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', slideTo?: number, delay = 0) {
  const r = ready();
  if (!r) return;
  const { ctx, out } = r;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let lastTick = 0;

export const sfx = {
  /** hover: the lightest escapement tick */
  tick() {
    const now = performance.now();
    if (now - lastTick < 45) return;
    lastTick = now;
    burst(4200 + Math.random() * 800, 6, 0.018, 0.12);
  },
  /** press: a latch closing */
  click() {
    burst(2400, 3, 0.03, 0.25);
    tone(190, 0.06, 0.18, 'sine', 90);
  },
  /** a key on the Lumen 64 */
  key(heavy = false) {
    burst(1800 + Math.random() * 600, 2.5, heavy ? 0.06 : 0.035, heavy ? 0.35 : 0.22);
    tone(heavy ? 120 : 160, heavy ? 0.08 : 0.05, heavy ? 0.22 : 0.12, 'triangle', 70);
  },
  ignite() {
    tone(55, 0.6, 0.3, 'sine', 40);
  },
  /** the pocket watch thrown past the lens */
  whoosh() {
    const r = ready();
    if (!r) return;
    const { ctx, out } = r;
    const t = ctx.currentTime;
    const src = noise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(250, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.55);
    f.frequency.exponentialRampToValueAtTime(400, t + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + 1.3);
  },
  /** gold on glass: a few inharmonic partials ringing out */
  clink() {
    for (const [ratio, gain] of [
      [1, 0.16],
      [2.76, 0.09],
      [5.4, 0.05],
      [8.93, 0.03],
    ] as const) {
      tone(1320 * ratio, 0.9 / Math.sqrt(ratio), gain);
    }
  },
  /** the tube collapsing to a dot */
  powerOff() {
    tone(80, 0.35, 0.3, 'sine', 30);
    tone(9000, 0.4, 0.02, 'sine', 3000);
  },
  powerOn() {
    burst(300, 0.7, 0.25, 0.25, 'lowpass');
    tone(40, 0.5, 0.3, 'sine', 70);
  },
  /** a gear tooth passing a pawl */
  ratchet() {
    burst(3000 + Math.random() * 1500, 4, 0.02, 0.18);
  },
};
