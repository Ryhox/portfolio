'use client';

import { useEffect, useRef } from 'react';
import { audio } from '@/audio/engine';
import { onFrame } from '@/lib/loop';
import { useApp } from '@/lib/store';
import { sfx } from '@/audio/sfx';
import s from './SoundToggle.module.css';

/** Sound switch with a live oscilloscope trace of whatever the engine is playing. */
export default function SoundToggle() {
  const sound = useApp((st) => st.sound);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const W = (c.width = 88);
    const H = (c.height = 28);
    const buf = new Uint8Array(256);
    let t = 0;
    return onFrame((_, dt) => {
      t += dt;
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 2;
      ctx.strokeStyle = useApp.getState().sound ? '#ffb54c' : 'rgba(235,225,203,0.45)';
      ctx.beginPath();
      const live = audio.waveform(buf);
      for (let i = 0; i <= 44; i++) {
        const x = (i / 44) * W;
        let y: number;
        if (live) y = H / 2 + ((buf[Math.floor((i / 44) * 255)] - 128) / 128) * H * 0.9;
        else y = H / 2 + Math.sin(i * 0.5 + t * 2) * (useApp.getState().sound ? 2 : 0.6);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }, 'after');
  }, []);

  return (
    <button
      type="button"
      className={s.toggle}
      aria-pressed={sound}
      onClick={() => {
        const st = useApp.getState();
        st.setSound(!sound);
        if (!sound) sfx.click();
      }}
      onPointerEnter={() => sfx.tick()}
    >
      <canvas ref={canvas} className={s.scope} aria-hidden="true" />
      <span className={s.label}>
        Sound <span className={s.state}>{sound ? 'On' : 'Off'}</span>
      </span>
    </button>
  );
}
