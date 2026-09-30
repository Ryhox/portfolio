'use client';

import { useEffect, useRef, useState } from 'react';
import { onFrame } from '@/lib/loop';
import { fpsStats, hasGpuTimer, perf, type Phase } from '@/lib/perf';
import { rig } from '@/lib/rig';

const PHASES: [Phase, string][] = [
  ['scroll', '#7fa596'],
  ['before', '#c99a58'],
  ['render', '#e0955a'],
  ['after', '#b58fd6'],
];
const W = 240;
const H = 64;

/**
 * The instrument panel for performance. Open it with ?debug in the address, or by typing "debug"
 * anywhere on the page. Frame times per phase (stacked), GPU time where the browser can measure
 * it, what the renderer is drawing, and switches to hold the quality still while you look.
 */
export default function PerfOverlay() {
  const [on, setOn] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLPreElement>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    if (new URLSearchParams(location.search).has('debug')) setOn(true);
    let typed = '';
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /INPUT|TEXTAREA/.test(t.tagName))) return;
      typed = (typed + e.key.toLowerCase()).slice(-5);
      if (typed === 'debug') setOn((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    perf.gpuTiming = on;
    if (!on) return;
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    cv.width = W * 2;
    cv.height = H * 2;
    let tick = 0;
    return onFrame(() => {
      tick++;
      if (tick % 3) return;
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const scale = H / 50; // 50 ms tall
      // the budget lines: 60 fps and 30 fps
      for (const [ms, c] of [
        [16.7, 'rgba(127,165,150,.5)'],
        [33.3, 'rgba(212,73,46,.5)'],
      ] as const) {
        ctx.fillStyle = c;
        ctx.fillRect(0, H - ms * scale, W, 1);
      }
      for (let k = 0; k < W; k++) {
        const i = (perf.i - (W - 1 - k) + 2400) % 240;
        if (k >= 240) break;
        let y = H;
        for (const [ph, col] of PHASES) {
          const h = perf.phases[ph][i] * scale;
          ctx.fillStyle = col;
          ctx.fillRect(k, y - h, 1, h);
          y -= h;
        }
        // the whole interval, as a faint cap: anything above the stack is time the browser spent elsewhere
        const iv = perf.interval[i] * scale;
        ctx.fillStyle = perf.interval[i] > 33.3 ? '#d4492e' : 'rgba(235,225,203,.55)';
        ctx.fillRect(k, H - iv, 1, 1);
        if (perf.gpu[i] > 0) {
          ctx.fillStyle = '#8fd3e3';
          ctx.fillRect(k, H - perf.gpu[i] * scale, 1, 1);
        }
      }
      if (tick % 15) return;
      const st = fpsStats();
      const info = perf.gl?.info;
      const avg = (a: Float32Array) => (Array.from(a).reduce((x, y) => x + y, 0) / a.length).toFixed(2);
      const gpu = Array.from(perf.gpu).filter((v) => v > 0);
      if (text.current)
        text.current.textContent = [
          `${st.fps.toFixed(0).padStart(3)} fps   1% low ${st.low.toFixed(0)}   worst ${st.worst.toFixed(1)} ms`,
          `cpu ms  scroll ${avg(perf.phases.scroll)}  dom ${avg(perf.phases.before)}  gl ${avg(perf.phases.render)}  after ${avg(perf.phases.after)}`,
          `gpu ms  ${hasGpuTimer() && gpu.length ? (gpu.reduce((a, b) => a + b, 0) / gpu.length).toFixed(2) : 'not measurable here'}`,
          `draws ${info?.render.calls ?? 0}   tris ${((info?.render.triangles ?? 0) / 1000).toFixed(0)}k   programs ${info?.programs?.length ?? 0}   tex ${info?.memory.textures ?? 0}   geo ${info?.memory.geometries ?? 0}`,
          `dpr ${perf.dpr.toFixed(2)}   tier ${perf.tier}${perf.locked ? ' (held)' : ''}   ${rig.vw}×${rig.vh}   ${document.documentElement.dataset.chapter ?? ''}   long tasks ${perf.longTasks}`,
        ].join('\n');
    }, 'after');
  }, [on]);

  if (!on) return null;
  const btn = (label: string, act: () => void) => (
    <button
      type="button"
      onClick={() => {
        act();
        bump((n) => n + 1);
      }}
      style={{ font: 'inherit', color: '#ebe1cb', background: '#2a1f14', border: '1px solid #6a5134', borderRadius: 3, padding: '2px 7px', cursor: 'pointer' }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        bottom: 12,
        zIndex: 200,
        padding: 10,
        background: 'rgba(12,9,6,.92)',
        border: '1px solid #4a3a27',
        borderRadius: 6,
        font: '10px/1.45 ui-monospace, monospace',
        color: '#ebe1cb',
        pointerEvents: 'auto',
      }}
    >
      <canvas ref={canvas} style={{ display: 'block', width: W, height: H, marginBottom: 6 }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 6, color: '#b3a488' }}>
        {PHASES.map(([ph, c]) => (
          <span key={ph}>
            <i style={{ display: 'inline-block', width: 7, height: 7, background: c, marginRight: 4 }} />
            {ph}
          </span>
        ))}
        <span>
          <i style={{ display: 'inline-block', width: 7, height: 7, background: '#8fd3e3', marginRight: 4 }} />
          gpu
        </span>
      </div>
      <pre ref={text} style={{ margin: 0, whiteSpace: 'pre' }} />
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {btn(perf.locked ? 'release quality' : 'hold quality', () => (perf.locked = !perf.locked))}
        {btn(`tier ${perf.tier} → ${(perf.tier + 1) % 3}`, () => {
          perf.locked = true;
          perf.tier = (perf.tier + 1) % 3;
        })}
        {[0.75, 1, 1.5].map((d) =>
          btn(`dpr ${d}`, () => {
            perf.locked = true;
            perf.setDpr?.(d);
          }),
        )}
      </div>
    </div>
  );
}
