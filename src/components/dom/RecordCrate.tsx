'use client';

import { useEffect, useRef, useState } from 'react';
import { audio } from '@/audio/engine';
import { sfx } from '@/audio/sfx';
import { labelCanvas, sleeveCanvas } from '@/components/three/resonance/sleeves';
import { records } from '@/content/records';
import { crateFx } from '@/lib/crate';
import { onFrame } from '@/lib/loop';
import { useApp } from '@/lib/store';
import s from './RecordCrate.module.css';

/** The printed sleeves and labels, drawn once the type has loaded (the covers replace them later). */
function useArt() {
  const [art, setArt] = useState<{ sleeve: string[]; label: string[] } | null>(null);
  useEffect(() => {
    let off = false;
    document.fonts.ready.then(() => {
      if (off) return;
      setArt({
        sleeve: records.map((r, i) => sleeveCanvas(r, i).toDataURL('image/webp', 0.9)),
        label: records.map((r, i) => labelCanvas(r, i).toDataURL('image/webp', 0.9)),
      });
    });
    return () => {
      off = true;
    };
  }, []);
  return art;
}

/**
 * The records beside the Resonance cabinet, two to a row: each in its sleeve with the disc showing
 * at the edge, its name beneath. Choose one and its disc comes out of the sleeve; the cabinet's mechanism takes it from there in
 * 3D (see Resonance) and brings it back when another goes in. Real buttons, so keyboards and
 * screen readers can play them too.
 */
export default function RecordCrate({ className }: { className?: string }) {
  const record = useApp((st) => st.record);
  const transport = useApp((st) => st.transport);
  const [, force] = useState(0);
  useEffect(() => audio.subscribe(() => force((n) => n + 1)), []);
  const art = useArt();
  const list = useRef<HTMLOListElement>(null);

  // where each disc is, as the mechanism says: in its sleeve, drawn out, or away in the cabinet
  useEffect(() => {
    const rows = Array.from(list.current?.children ?? []) as HTMLElement[];
    return onFrame(() => {
      rows.forEach((row, i) => {
        const at = crateFx.disc[i] ?? 'rest';
        if (row.dataset.disc !== at) row.dataset.disc = at;
      });
    }, 'after');
  }, []);

  const on = transport === 'play' || transport === 'pause';
  const t = audio.tracks[record];

  const pick = (i: number) => {
    sfx.click();
    if (record === i && transport === 'play') audio.pause();
    else audio.play(i);
  };

  return (
    <div className={`${s.crate} ${className ?? ''}`}>
      <ol ref={list} className={s.list} aria-label="Records">
        {records.map((r, i) => {
          const cur = on && record === i;
          const playing = cur && transport === 'play';
          const cover = audio.tracks[i].cover;
          const sleeve = cover ?? art?.sleeve[i];
          const label = cover ?? art?.label[i];
          return (
            <li key={r.apple} className={s.row} data-disc="rest" data-cur={cur ? '1' : '0'}>
              <button
                type="button"
                className={s.pick}
                onClick={() => pick(i)}
                onPointerEnter={() => sfx.tick()}
                aria-pressed={cur}
                aria-label={`${playing ? 'Pause' : 'Play'} ${r.title} by ${r.artist}`}
              >
                <span className={s.slot} aria-hidden="true">
                  <span className={s.disc}>
                    <i style={label ? { backgroundImage: `url(${label})` } : undefined} />
                  </span>
                  <span className={s.sleeve} style={sleeve ? { backgroundImage: `url(${sleeve})` } : undefined} />
                  {/* where the drawn-out disc sits: the 3D record takes over from exactly here */}
                  <span className={s.out} data-stage={`vinyl-${i}`} />
                </span>
                <span className={s.text} aria-hidden="true">
                  <b className={s.title}>{r.title}</b>
                  <span className={s.artist}>
                    {r.artist}
                    {playing && audio.drawer === i ? (
                      <span className={s.eq}>
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : cur && transport === 'pause' ? (
                      <span className={s.state}>Paused</span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="sr-only">
        <p aria-live="polite">{on && t ? `${transport === 'play' ? 'Playing' : 'Paused'}: ${t.title} by ${t.artist}` : 'Nothing playing'}</p>
        <button type="button" onClick={() => audio.eject()}>
          Eject the record
        </button>
      </div>
    </div>
  );
}
