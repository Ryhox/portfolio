'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { audio } from '@/audio/engine';
import { useApp } from '@/lib/store';
import s from './MusicConsent.module.css';

/** Asked once, the first time a record is chosen: the songs are streamed from Apple. */
export default function MusicConsent() {
  const ask = useApp((st) => st.askMusic);
  const yes = useRef<HTMLButtonElement>(null);
  const open = ask >= 0;

  useEffect(() => {
    if (!open) return;
    yes.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useApp.getState().setAskMusic(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const allow = () => {
    const i = useApp.getState().askMusic;
    audio.ensure();
    audio.consent();
    useApp.getState().setAskMusic(-1);
    audio.play(i);
  };

  return (
    <div className={s.scrim} data-open={open ? '1' : '0'} aria-hidden={!open} inert={!open}>
      <div className={s.card} role="dialog" aria-modal="true" aria-labelledby="music-consent-title">
        <p className={`t-label ${s.label}`}>Resonance cabinet</p>
        <h2 id="music-consent-title" className={s.title}>
          Play music from Apple?
        </h2>
        <p className={s.body}>
          The records are 30-second previews streamed from Apple Music. Playing them sends your IP address to Apple. You only get
          asked once. <Link href="/privacy">Privacy</Link>
        </p>
        <div className={s.actions}>
          <button ref={yes} type="button" className={s.yes} onClick={allow}>
            Yes, play it
          </button>
          <button type="button" className={s.no} onClick={() => useApp.getState().setAskMusic(-1)}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
