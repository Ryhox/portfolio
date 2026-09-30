import { records, type Record } from '@/content/records';
import { useApp } from '@/lib/store';

/**
 * One AudioContext for the whole site: the record player (Apple Music previews in an <audio>
 * element, routed through Web Audio so the hi-fi can read its spectrum) and the synthesised
 * interface sounds. Nothing is created until the visitor asks for sound.
 */
export type Track = Record & { preview?: string; cover?: string; link?: string };

const CONSENT_KEY = 'ryhox-music-ok';
const LEVELS_KEY = 'ryhox-levels';

/** The cabinet's two knobs, as last left: volume, and the pre-amp's warmth (0..1 each). */
function levels() {
  try {
    const v = JSON.parse(localStorage.getItem(LEVELS_KEY) ?? '') as { volume?: number; preamp?: number };
    return { volume: v.volume ?? 0.8, preamp: v.preamp ?? 0.3 };
  } catch {
    return { volume: 0.8, preamp: 0.3 };
  }
}
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

class Engine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  music: GainNode | null = null;
  fx: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  el: HTMLAudioElement | null = null;
  /** every record, its cover kept with the site (public/covers, see scripts/fetch-covers), so it shows at once */
  tracks: Track[] = records.map((r) => ({ ...r, cover: `/covers/${r.apple}.webp` }));
  index = 0;
  /**
   * The cabinet is on screen and puts each record in by hand: a new record is not heard until its
   * drawer has closed on it (see hold / release). `drawer` is the record in the closed drawer.
   */
  mechanical = false;
  drawer = -1;
  private held = false;
  private looked: Promise<void> | null = null;
  private freq: Uint8Array<ArrayBuffer> | null = null;
  /** the knobs: volume, and the pre-amp (a warm lift in the bass, a little off the top) */
  volume = 0.8;
  preamp = 0.3;
  private bass: BiquadFilterNode | null = null;
  private treble: BiquadFilterNode | null = null;
  private levelsRead = false;
  private listeners = new Set<() => void>();

  /** Create the graph. Must run inside a user gesture. */
  ensure() {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = useApp.getState().sound ? 1 : 0;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.78;
      this.readLevels();
      this.music = ctx.createGain();
      this.music.gain.value = this.held ? 0 : this.level();
      this.bass = ctx.createBiquadFilter();
      this.bass.type = 'lowshelf';
      this.bass.frequency.value = 180;
      this.treble = ctx.createBiquadFilter();
      this.treble.type = 'highshelf';
      this.treble.frequency.value = 3800;
      this.applyPreamp();
      this.fx = ctx.createGain();
      this.fx.gain.value = 0.5;
      this.music.connect(this.bass);
      this.bass.connect(this.treble);
      this.treble.connect(this.analyser);
      this.analyser.connect(this.master);
      this.fx.connect(this.master);
      this.master.connect(ctx.destination);
      this.freq = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  private audio() {
    if (!this.el) {
      const el = new Audio();
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      el.addEventListener('ended', () => this.next(true));
      for (const e of ['playing', 'pause', 'waiting', 'loadedmetadata']) el.addEventListener(e, () => this.emit());
      this.el = el;
      const ctx = this.ensure();
      if (ctx && this.music) ctx.createMediaElementSource(el).connect(this.music);
    }
    return this.el;
  }

  /** The music's gain for the volume knob (0.8, where it starts, is the level it always had). */
  private level() {
    return 1.06 * this.volume * this.volume * 1.25;
  }
  readLevels() {
    if (this.levelsRead || typeof window === 'undefined') return;
    this.levelsRead = true;
    const l = levels();
    this.volume = l.volume;
    this.preamp = l.preamp;
  }
  private saveLevels() {
    try {
      localStorage.setItem(LEVELS_KEY, JSON.stringify({ volume: this.volume, preamp: this.preamp }));
    } catch {}
  }
  private applyPreamp() {
    if (!this.bass || !this.treble || !this.ctx) return;
    this.bass.gain.setTargetAtTime(this.preamp * 11, this.ctx.currentTime, 0.04);
    this.treble.gain.setTargetAtTime(-this.preamp * 4, this.ctx.currentTime, 0.04);
  }
  setVolume(v: number) {
    this.readLevels();
    this.volume = Math.min(1, Math.max(0, v));
    if (this.music && this.ctx && !this.held) this.music.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.03);
    this.saveLevels();
  }
  setPreamp(v: number) {
    this.readLevels();
    this.preamp = Math.min(1, Math.max(0, v));
    this.applyPreamp();
    this.saveLevels();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }

  get consented() {
    try {
      return localStorage.getItem(CONSENT_KEY) === '1';
    } catch {
      return false;
    }
  }
  consent() {
    try {
      localStorage.setItem(CONSENT_KEY, '1');
    } catch {}
    this.emit();
  }

  /** Previews and links from Apple, once (only after consent). */
  lookup() {
    if (!this.consented) return Promise.resolve();
    this.looked ??= fetch(`https://itunes.apple.com/lookup?id=${this.tracks.map((t) => t.apple).join(',')}&country=us`)
      .then((r) => r.json())
      .then((j: { results: { trackId: number; previewUrl?: string; artworkUrl100?: string; trackViewUrl?: string }[] }) => {
        for (const r of j.results) {
          const t = this.tracks.find((x) => x.apple === r.trackId);
          if (!t) continue;
          t.preview = r.previewUrl;
          t.cover ??= r.artworkUrl100?.replace('100x100bb', '600x600bb');
          t.link = r.trackViewUrl;
        }
        this.emit();
      })
      .catch(() => {
        this.looked = null;
      });
    return this.looked;
  }

  get current() {
    return this.tracks[this.index];
  }
  get playing() {
    return !!this.el && !this.el.paused && !this.el.ended;
  }
  get position() {
    return this.el?.currentTime ?? 0;
  }
  get duration() {
    const d = this.el?.duration ?? 0;
    return Number.isFinite(d) ? d : 30;
  }

  async play(index = this.index) {
    if (!this.consented) {
      // ask first: nothing is requested from Apple before the visitor says yes
      useApp.getState().setAskMusic(index);
      return;
    }
    this.index = ((index % this.tracks.length) + this.tracks.length) % this.tracks.length;
    if (this.mechanical && this.index !== this.drawer) this.hold();
    const st = useApp.getState();
    st.setRecord(this.index);
    st.setTransport('play');
    if (!st.sound) st.setSound(true);
    const el = this.audio();
    const t = this.current;
    if (!t.preview) {
      // keep the element unlocked while the address arrives
      el.src = SILENT;
      el.play().catch(() => {});
      await this.lookup();
    }
    if (this.current !== t) return;
    if (!t.preview) {
      st.setTransport('stop');
      return;
    }
    if (el.src !== t.preview) el.src = t.preview;
    el.play().catch(() => useApp.getState().setTransport('pause'));
    this.emit();
  }

  /** The record is still on its way into the drawer: the preview may load and start, silently. */
  hold() {
    this.held = true;
    if (this.music && this.ctx) {
      const g = this.music.gain;
      g.cancelScheduledValues(this.ctx.currentTime);
      g.setValueAtTime(0, this.ctx.currentTime);
    }
  }

  /** The drawer has closed on it: from the top, and up comes the sound. */
  release() {
    if (!this.held) return;
    this.held = false;
    if (this.el && Number.isFinite(this.el.duration) && this.el.src !== SILENT) this.el.currentTime = 0;
    if (this.music && this.ctx) {
      const g = this.music.gain;
      g.cancelScheduledValues(this.ctx.currentTime);
      g.setTargetAtTime(this.level(), this.ctx.currentTime, 0.06);
    }
    this.emit();
  }

  pause() {
    this.el?.pause();
    useApp.getState().setTransport('pause');
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  stop() {
    if (this.el) {
      this.el.pause();
      this.el.currentTime = 0;
    }
    useApp.getState().setTransport('stop');
    this.emit();
  }

  /** The record comes out of the drawer: silence, and the cabinet goes back to standby. */
  eject() {
    if (this.el) {
      this.el.pause();
      this.el.currentTime = 0;
    }
    useApp.getState().setTransport('standby');
    this.emit();
  }

  /** Jump to a point in the preview, 0..1. */
  seek(f: number) {
    if (!this.el || !Number.isFinite(this.el.duration)) return;
    this.el.currentTime = Math.min(Math.max(f, 0), 0.999) * this.el.duration;
    this.emit();
  }

  next(auto = false) {
    const wasPlaying = auto || this.playing;
    this.index = (this.index + 1) % this.tracks.length;
    useApp.getState().setRecord(this.index);
    if (wasPlaying) this.play();
    else this.emit();
  }

  prev() {
    if (this.position > 3 && this.el) {
      this.el.currentTime = 0;
      return;
    }
    const wasPlaying = this.playing;
    this.index = (this.index - 1 + this.tracks.length) % this.tracks.length;
    useApp.getState().setRecord(this.index);
    if (wasPlaying) this.play();
    else this.emit();
  }

  /** Master on/off, with a short ramp so nothing clicks. */
  setEnabled(on: boolean) {
    if (on) this.ensure();
    if (this.master && this.ctx) {
      const g = this.master.gain;
      g.cancelScheduledValues(this.ctx.currentTime);
      g.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.08);
    }
    if (!on && this.playing) this.pause();
  }

  /** Oscilloscope trace; false when nothing is running. */
  waveform(buf: Uint8Array<ArrayBuffer>) {
    if (!this.analyser || !this.ctx || this.ctx.state !== 'running' || !useApp.getState().sound) return false;
    this.analyser.getByteTimeDomainData(buf);
    return true;
  }

  /** Five display bands (0..1), low to high, for the Resonance cabinet's meter. */
  bands(out: Float32Array) {
    out.fill(0);
    if (!this.analyser || !this.freq || !this.playing) return out;
    this.analyser.getByteFrequencyData(this.freq);
    const edges = [1, 4, 10, 24, 60, 160];
    for (let b = 0; b < 5; b++) {
      let sum = 0;
      for (let i = edges[b]; i < edges[b + 1]; i++) sum += this.freq[i];
      out[b] = Math.min(1, sum / (edges[b + 1] - edges[b]) / 200);
    }
    return out;
  }
}

export const audio = new Engine();
