import type * as THREE from 'three';

/**
 * Frame accounting, for the debug overlay and the benchmark. Always on (it is a handful of
 * performance.now() calls a frame); the ring buffers hold the last few seconds.
 */
const N = 240;

export type Phase = 'scroll' | 'before' | 'render' | 'after';

export const perf = {
  /** frame-to-frame interval, ms */
  interval: new Float32Array(N),
  /** CPU ms spent in each phase of the master loop */
  phases: { scroll: new Float32Array(N), before: new Float32Array(N), render: new Float32Array(N), after: new Float32Array(N) } as Record<Phase, Float32Array>,
  /** GPU ms for the WebGL work, when the browser can time it (lags a few frames) */
  gpu: new Float32Array(N),
  i: 0,
  frames: 0,
  gl: null as THREE.WebGLRenderer | null,
  dpr: 1,
  /** quality tier: 0 full · 1 no bloom · 2 no multisampling, lower resolution · 3 lite (half the 3D frames) */
  tier: 0,
  /** the benchmark (or the overlay) can hold the quality still, to measure one setting honestly */
  locked: false,
  /** GPU timer queries cost a round trip to the GPU process each frame: only while someone is looking */
  gpuTiming: false,
  /** the canvas's resolution control, lent by the Director */
  setDpr: null as null | ((d: number) => void),
  /** the two worlds, for the diagnostics */
  scenes: [] as THREE.Scene[],
  longTasks: 0,
  /** set by the benchmark: every frame's numbers, tagged with where the page was */
  record: null as null | { t: number; ms: number; cpu: number; gpu: number; scroll: number; chapter: string; ph: number[] }[],
};

let t0 = 0;
let mark = 0;

export function frameStart(now: number, interval: number) {
  perf.i = (perf.i + 1) % N;
  perf.frames++;
  perf.interval[perf.i] = interval;
  t0 = mark = performance.now();
  void now;
}

export function phaseEnd(phase: Phase) {
  const t = performance.now();
  perf.phases[phase][perf.i] = t - mark;
  mark = t;
}

export function frameCpu() {
  return performance.now() - t0;
}

/** fps over the buffer, and the 1% low (the fps of the slowest 1% of frames) */
export function fpsStats() {
  const count = Math.min(N, perf.frames);
  if (count < 2) return { fps: 0, low: 0, worst: 0 };
  const xs = Array.from(perf.interval.slice(0, count)).filter((v) => v > 0);
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sorted = xs.sort((a, b) => b - a);
  const slow = sorted.slice(0, Math.max(1, Math.floor(xs.length / 100)));
  const slowAvg = slow.reduce((a, b) => a + b, 0) / slow.length;
  return { fps: 1000 / avg, low: 1000 / slowAvg, worst: sorted[0] };
}

// GPU timing through EXT_disjoint_timer_query_webgl2, one query in flight per frame
type TimerExt = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
let ext: TimerExt | null | undefined;
const pending: { q: WebGLQuery; i: number }[] = [];
let open: WebGLQuery | null = null;

export function gpuBegin() {
  const r = perf.gl;
  if (!r || !perf.gpuTiming) return;
  const gl = r.getContext() as WebGL2RenderingContext;
  if (ext === undefined) ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
  if (!ext || open || pending.length > 4) return;
  const q = gl.createQuery();
  if (!q) return;
  gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
  open = q;
}

export function gpuEnd() {
  const r = perf.gl;
  if (!r || !ext || !open) return;
  const gl = r.getContext() as WebGL2RenderingContext;
  gl.endQuery(ext.TIME_ELAPSED_EXT);
  pending.push({ q: open, i: perf.i });
  open = null;
  // collect finished ones
  while (pending.length) {
    const p = pending[0];
    if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) break;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    const ns = gl.getQueryParameter(p.q, gl.QUERY_RESULT) as number;
    if (!disjoint) perf.gpu[p.i] = ns / 1e6;
    gl.deleteQuery(p.q);
    pending.shift();
  }
}

export const hasGpuTimer = () => !!ext;

if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
  try {
    new PerformanceObserver((list) => {
      perf.longTasks += list.getEntries().length;
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
}

/** The renderer's name, when the browser tells: software rasterisers get the lite tier from the start. */
export function startingTier(gl: WebGL2RenderingContext) {
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
    if (/swiftshader|llvmpipe|softpipe|basic render|software/.test(name)) return 3;
    const nav = navigator as Navigator & { deviceMemory?: number };
    if ((nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 2) return 2;
  } catch {}
  return 0;
}
