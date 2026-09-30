'use client';

import { useEffect, useRef, useState } from 'react';
import { audio } from '@/audio/engine';
import { sfx } from '@/audio/sfx';
import { records } from '@/content/records';
import { onFrame } from '@/lib/loop';
import { radio } from '@/lib/radio';
import { rig } from '@/lib/rig';
import { useApp } from '@/lib/store';
import Flourish from './Flourish';
import RecordCrate from './RecordCrate';
import s from './Radio.module.css';

/** How long each record's label shows on the corner disc while nothing plays (ms). */
const CYCLE = 3200;

/**
 * The radio is not on the page. A record turns slowly in the corner, its label going through every
 * record there is; choose it and the view swings across to the right, where the Resonance cabinet
 * stands with the records beside it (the cabinet is 3D, see RadioView). Choose it again, press
 * Back or Escape, and the view swings back to exactly where it was.
 */
export default function Radio() {
  const open = useApp((st) => st.radio);
  const record = useApp((st) => st.record);
  const transport = useApp((st) => st.transport);
  const stage = useApp((st) => st.stage);
  const menuOpen = useApp((st) => st.menuOpen);
  const room = useRef<HTMLDivElement>(null);
  const side = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const [, force] = useState(0);
  useEffect(() => audio.subscribe(() => force((n) => n + 1)), []);


  // while nothing plays, the label goes round every record; playing, it is the record on the platter
  const [shown, setShown] = useState(0);
  const playing = transport === 'play';
  useEffect(() => {
    if (playing) return;
    const id = window.setInterval(() => setShown((n) => (n + 1) % records.length), CYCLE);
    return () => window.clearInterval(id);
  }, [playing]);
  const current = playing ? record : shown;
  // (the covers are kept with the site, so they are there from the first moment)
  const art = (i: number) => audio.tracks[i]?.cover;

  const toggle = (to = !useApp.getState().radio) => {
    sfx.whoosh();
    useApp.getState().setRadio(to);
  };

  // the swing: the page goes off to the left as the room comes in from the right (the 3D does the
  // same with its pictures), written straight onto the two elements
  useEffect(() => {
    const main = document.getElementById('main');
    let last = -1;
    return onFrame(() => {
      const r = room.current;
      const p = radio.pan;
      if (!r || !main || p === last) return;
      last = p;
      r.style.transform = `translate3d(${((1 - p) * 100).toFixed(3)}%, 0, 0)`;
      r.style.visibility = p > 0 ? 'visible' : 'hidden';
      main.style.transform = p > 0 ? `translate3d(${(-p * rig.vw).toFixed(1)}px, 0, 0)` : '';
    }, 'after');
  }, []);

  // into the room, focus goes with you; back out, it returns to the record in the corner
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => back.current?.focus({ preventScroll: true }), 600);
      return () => window.clearTimeout(id);
    }
    if (room.current?.contains(document.activeElement)) button.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && useApp.getState().radio) toggle(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // the list scrolls inside the room on small screens: where the sleeves are must be measured again
  useEffect(() => {
    const el = side.current;
    if (!el) return;
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        window.dispatchEvent(new Event('resize'));
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const t = audio.tracks[current];
  // (it keeps out of the way of the menu)
  const ready = stage === 'ready' && !menuOpen;

  return (
    <>
      <div ref={room} className={s.room} data-room role="dialog" aria-modal="false" aria-label="The radio" inert={!open} style={{ visibility: 'hidden' }}>
        <div ref={side} className={s.side} data-lenis-prevent>
          <header className={s.head}>
            <h2 className={`t-display ${s.title}`}>
              Choose a <em>record</em>
            </h2>
            <Flourish className={s.flourish} />
            <p className={s.lede}>Pick a record and it goes in the drawer. Every key and knob on the cabinet works.</p>
          </header>
          <RecordCrate className={s.crate} />
          {/* the cabinet's two knobs, for keyboards and screen readers (on screen, drag or scroll them) */}
          <div className="sr-only">
            <label>
              Volume
              <input type="range" min={0} max={100} defaultValue={80} onChange={(e) => audio.setVolume(Number(e.target.value) / 100)} />
            </label>
            <label>
              Pre-amp
              <input type="range" min={0} max={100} defaultValue={30} onChange={(e) => audio.setPreamp(Number(e.target.value) / 100)} />
            </label>
          </div>
        </div>
        {/* the cabinet is drawn here, in 3D */}
        <div className={s.cabinet} data-stage="cabinet" aria-hidden="true" />
        <button ref={back} type="button" className={s.back} onClick={() => toggle(false)} onPointerEnter={() => sfx.tick()}>
          <svg viewBox="0 0 40 12" aria-hidden="true">
            <path d="M40 6H3M8 1L3 6l5 5" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
          <span>Back to the page</span>
        </button>
      </div>

      <button
        ref={button}
        type="button"
        data-screen-layer
        className={s.vinyl}
        data-shown={ready ? '1' : '0'}
        data-open={open ? '1' : '0'}
        data-playing={playing ? '1' : '0'}
        aria-expanded={open}
        aria-label={open ? 'Back to the page' : `The radio${playing && t ? `: playing ${t.title} by ${t.artist}` : ''}`}
        onClick={() => toggle()}
        onPointerEnter={() => sfx.tick()}
      >
        <span className={s.disc} aria-hidden="true">
          {records.map((r, i) => (
            <i key={r.apple} data-on={i === current ? '1' : '0'} style={art(i) ? { backgroundImage: `url(${art(i)})` } : undefined} />
          ))}
        </span>
        <span className={s.hint} aria-hidden="true">
          {open ? 'Back' : 'Radio'}
        </span>
      </button>
    </>
  );
}
