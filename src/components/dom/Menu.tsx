'use client';

import { useEffect, useRef } from 'react';
import { projects } from '@/content/projects';
import { navItems } from '@/content/sections';
import { site } from '@/content/site';
import { useApp } from '@/lib/store';
import { sfx } from '@/audio/sfx';
import TransitionLink from './TransitionLink';
import s from './Menu.module.css';

/** The phone's menu: the four parts, typeset large, with a Victorian manicule pointing at the one you mean. */
export default function Menu() {
  const open = useApp((st) => st.menuOpen);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useApp.getState().setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const first = root.current?.querySelector<HTMLElement>('a');
    first?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => useApp.getState().setMenuOpen(false);

  return (
    <div
      id="index-menu"
      ref={root}
      className={s.menu}
      data-open={open ? '1' : '0'}
      aria-hidden={!open}
      inert={!open}
      role="dialog"
      aria-label="Menu"
    >
      <div className={s.inner}>
        <nav className={s.chapters} aria-label="Sections">
          <ol>
            {navItems.map((c, i) => (
              <li key={c.id} style={{ '--i': i } as React.CSSProperties}>
                <TransitionLink href={`/#${c.id}`} className={s.row} onClick={close} onPointerEnter={() => sfx.tick()}>
                  <span className={s.hand} aria-hidden="true">
                    ☞
                  </span>
                  <span className={s.titleMask}>
                    <span className={s.title}>{c.label}</span>
                  </span>
                  <span className={s.label}>{c.note}</span>
                </TransitionLink>
              </li>
            ))}
          </ol>
        </nav>

        <aside className={s.side}>
          <div>
            <p className={s.head}>Case files</p>
            <ul className={s.files}>
              {projects.map((p, i) => (
                <li key={p.slug} style={{ '--i': i + 3 } as React.CSSProperties}>
                  <TransitionLink href={`/work/${p.slug}`} onClick={close} onPointerEnter={() => sfx.tick()}>
                    <span className={s.fileNo}>{p.index}</span>
                    {p.title}
                  </TransitionLink>
                </li>
              ))}
            </ul>
          </div>
          <div className={s.post}>
            <p className={s.head}>Write</p>
            <a href={`mailto:${site.email}`} className={s.mail}>
              {site.email}
            </a>
            <p className={s.links}>
              {site.socials.map((so) => (
                <a key={so.href} href={so.href} rel="me noopener" target="_blank">
                  {so.label} ↗
                </a>
              ))}
              <TransitionLink href="/imprint" onClick={close}>
                Imprint
              </TransitionLink>
              <TransitionLink href="/privacy" onClick={close}>
                Privacy
              </TransitionLink>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
