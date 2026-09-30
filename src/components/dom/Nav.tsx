'use client';

import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef } from 'react';
import { sfx } from '@/audio/sfx';
import { navItems } from '@/content/sections';
import { useApp } from '@/lib/store';
import Menu from './Menu';
import SoundToggle from './SoundToggle';
import TransitionLink from './TransitionLink';
import s from './Nav.module.css';

/**
 * The bar: the maker's mark, the four parts of the page, sound. A brass rule slides under
 * whichever part you are in. On a phone the parts fold into a lever-switch menu.
 */
export default function Nav() {
  const pathname = usePathname();
  const chapter = useApp((st) => st.chapter);
  const stage = useApp((st) => st.stage);
  const menuOpen = useApp((st) => st.menuOpen);
  const radioOpen = useApp((st) => st.radio);
  const links = useRef<HTMLDivElement>(null);
  const rule = useRef<HTMLSpanElement>(null);
  const home = pathname === '/';
  // (over at the radio, the page's parts are all behind you)
  const active = home && !radioOpen ? navItems.findIndex((n) => n.chapter === chapter) : -1;

  // the rule slides to the active part (and waits under the first one, hidden, until there is one)
  useLayoutEffect(() => {
    const wrap = links.current;
    const r = rule.current;
    if (!wrap || !r) return;
    const place = () => {
      const a = wrap.querySelectorAll<HTMLElement>('[data-nav]')[Math.max(0, active)];
      if (!a) return;
      r.style.transform = `translateX(${a.offsetLeft}px) scaleX(${a.offsetWidth / 100})`;
      r.style.opacity = active >= 0 ? '1' : '0';
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [active]);

  const shown = stage === 'intro' || stage === 'ready';

  return (
    <>
      <header className={s.nav} data-screen-layer data-shown={shown ? '1' : '0'}>
        <TransitionLink href="/" className={s.brand} aria-label="Ryhox, home" onPointerEnter={() => sfx.tick()}>
          <span className={s.word}>Ryhox</span>
        </TransitionLink>

        <nav className={s.links} ref={links} aria-label="Sections">
          {navItems.map((n, i) => (
            <TransitionLink key={n.id} href={`/#${n.id}`} data-nav className={s.link} aria-current={i === active ? 'true' : undefined} onPointerEnter={() => sfx.tick()}>
              <span className={s.roll}>
                <span className={s.rollInner} data-text={n.label}>
                  {n.label}
                </span>
              </span>
            </TransitionLink>
          ))}
          <span ref={rule} className={s.rule} aria-hidden="true" />
        </nav>

        <div className={s.right}>
          <SoundToggle />
          <button
            type="button"
            className={s.burger}
            aria-expanded={menuOpen}
            aria-controls="index-menu"
            aria-label={menuOpen ? 'Close the menu' : 'Open the menu'}
            data-open={menuOpen ? '1' : '0'}
            onClick={() => {
              sfx.click();
              useApp.getState().setMenuOpen(!menuOpen);
            }}
          >
            <span className={s.rod} />
            <span className={s.rod} />
          </button>
        </div>
      </header>
      <Menu />
    </>
  );
}
