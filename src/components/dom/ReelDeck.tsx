'use client';

import { Fragment, useCallback, useEffect, useRef } from 'react';
import { sfx } from '@/audio/sfx';
import Link from '@/components/dom/TransitionLink';
import { hostOf, type Project } from '@/content/projects';
import { site } from '@/content/site';
import { onFrame } from '@/lib/loop';
import { PLATES, goTo, reel, wind, type Fx } from '@/lib/reel';
import { rig } from '@/lib/rig';
import ProjectActions from './ProjectActions';
import s from './ReelDeck.module.css';

/** A title, word by word, each word sliding through its own slot. */
function Words({ text }: { text: string }) {
  const words = text.split(' ');
  return (
    <>
      {words.map((w, i) => (
        <Fragment key={i}>
          <span className={s.mask}>
            <span className={s.word} style={{ '--w': i } as React.CSSProperties}>
              {w}
            </span>
          </span>
          {i < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 40 12" aria-hidden="true">
      <path d="M0 6h37M32 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/** A film-advance knob: knurled brass that turns a notch each time it winds the film on (or back). */
function Knob({ dir, onTurn }: { dir: 1 | -1; onTurn: (dir: 1 | -1) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const turns = useRef(0);
  return (
    <button
      ref={ref}
      type="button"
      className={s.knob}
      data-dir={dir > 0 ? 'next' : 'prev'}
      aria-label={dir > 0 ? 'Next project' : 'Previous project'}
      onClick={() => {
        turns.current += dir;
        ref.current?.style.setProperty('--turn', `${turns.current * 60}deg`);
        sfx.ratchet();
        onTurn(dir);
      }}
    >
      <span className={s.knurl} aria-hidden="true" />
      <svg className={s.knobArrow} viewBox="0 0 24 24" aria-hidden="true">
        <path d={dir > 0 ? 'M5 12h13M13 6l6 6-6 6' : 'M19 12H6M11 6l-6 6 6 6'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
      </svg>
    </button>
  );
}

/**
 * The page over the spiral of film: every plate is in the document (and indexable), one is shown.
 * Its title sits at the top; its buttons sit on the picture at the gate, sheared to its slope (the
 * 3D says where it is), and change the picture while the pointer is on them. The knobs and the
 * sprocket holes at the foot wind the film to a plate; so do the arrow keys.
 */
export default function ReelDeck({ projects }: { projects: Project[] }) {
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const dots = useRef<HTMLDivElement>(null);
  const stamp = useRef<HTMLParagraphElement>(null);

  // the knobs (and the arrow keys) loop: past the last plate the film winds on to the first
  const turn = useCallback((d: 1 | -1) => wind(d), []);
  const fx = useCallback((f: Fx) => {
    reel.fx = f;
  }, []);

  useEffect(() => {
    let active = -1;
    let at = 0;
    const last = { gate: '', rest: '', fx: '', fit: '' };
    const px = (v: number) => `${v.toFixed(1)}px`;
    // what a button does to the picture: a browser's bar drops over the top of it with the address
    // the button goes to (the film draws it); a plate without a demo gets stamped
    const say = (fx: Fx, plate: number) => {
      const p = projects[plate];
      const st = stamp.current;
      reel.address = !p ? (fx === 'code' ? hostOf(site.socials[0].href) : '') : fx === 'code' ? hostOf(p.links.source) : fx === 'demo' && p.links.demo ? hostOf(p.links.demo) : '';
      if (st) {
        const on = fx === 'none' && !!p;
        if (on) {
          const small = st.querySelector('small');
          if (small) small.textContent = p.links.elsewhere?.note ?? '';
        }
        st.dataset.on = on ? '1' : '0';
      }
    };
    const off = onFrame(() => {
      const el = list.current;
      const r = root.current;
      if (rig.route !== 'home' || !el || !r) return;
      // the buttons sit on the gate's picture, wherever the glass shows it
      const g = reel.gate;
      const key = g.ok ? [g.left, g.right, g.bottom, g.film, ...g.tl, ...g.tr, ...g.bl, ...g.br].map((v) => v.toFixed(1)).join(',') : '';
      if (key !== last.gate) {
        last.gate = key;
        const st = r.style;
        st.setProperty('--gate-l', px(g.left));
        st.setProperty('--gate-r', px(g.right));
        st.setProperty('--gate-b', px(g.bottom + g.film));
        st.setProperty('--gate-cx', px((g.tl[0] + g.br[0]) / 2));
        st.setProperty('--gate-cy', px((g.tl[1] + g.br[1]) / 2));
        st.setProperty('--gate-tlx', px(g.tl[0]));
        st.setProperty('--gate-tly', px(g.tl[1]));
        st.setProperty('--gate-w', px(g.tr[0] - g.tl[0]));
        st.setProperty('--gate-brx', px(g.br[0]));
        st.setProperty('--gate-bry', px(g.br[1]));
        // the slopes of the picture's bottom and top edges: what sits on them is sheared to match
        const deg = (a: number[], b: number[]) => `${((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI).toFixed(2)}deg`;
        st.setProperty('--gate-skb', deg(g.bl, g.br));
        st.setProperty('--gate-skt', deg(g.tl, g.tr));
        r.dataset.gate = g.ok ? '1' : '0';
        // the buttons go inside the picture's corner when it is wide enough for them, else under the
        // film; a short screen has no room under it, so there they sit inside, a size smaller
        const fit = g.right - g.left > 430 ? 'in' : rig.vh < 620 ? 'small' : 'under';
        if (fit !== last.fit) {
          last.fit = fit;
          r.dataset.fit = fit;
        }
      }
      const rest = reel.resting ? '1' : '0';
      if (rest !== last.rest) {
        last.rest = rest;
        r.dataset.rest = rest;
      }
      const fx = reel.resting && reel.on ? reel.fx : '';
      if (`${fx}${reel.plate}` !== last.fx) {
        last.fx = `${fx}${reel.plate}`;
        say(fx, reel.plate);
      }

      const next = reel.plate;
      if (next === active) return;
      // which way the film went (a knob looping past the end still goes on, though the plate number drops)
      const dir = active < 0 || reel.pos > at ? 'next' : 'prev';
      at = reel.pos;
      const items = Array.from(el.children) as HTMLElement[];
      // direction first, so the incoming plate comes from the side the film does, then the states
      items.forEach((it) => (it.dataset.dir = dir));
      void el.offsetWidth;
      items.forEach((it, i) => {
        it.dataset.state = i === next ? 'in' : i === active ? 'out' : 'off';
        it.inert = i !== next;
      });
      Array.from(dots.current?.children ?? []).forEach((d, i) => {
        if (i === next) d.setAttribute('aria-current', 'true');
        else d.removeAttribute('aria-current');
      });
      active = next;
      // what the pointer was doing to the last picture goes with it
      reel.fx = '';
    }, 'after');

    const onKey = (e: KeyboardEvent) => {
      if (!reel.on || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      wind(e.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      off();
      window.removeEventListener('keydown', onKey);
      reel.fx = '';
    };
  }, [projects]);

  const part = (k: number) => ({ '--k': k }) as React.CSSProperties;
  const github = site.socials[0].href;

  return (
    <div ref={root} className={s.root} data-rest="1" data-gate="0" data-fit="in">
      <ol ref={list} className={s.plates}>
        {projects.map((p, i) => (
          <li key={p.slug} className={s.plate} data-plate={i} data-state={i === 0 ? 'in' : 'off'} data-dir="next">
            <article className={s.article} aria-labelledby={`plate-${p.slug}`}>
              <h3 id={`plate-${p.slug}`} className={s.title}>
                <Link href={`/work/${p.slug}`}>
                  <Words text={p.title} />
                </Link>
              </h3>
              <p className={`${s.part} ${s.line}`} style={part(1)}>
                <span className={s.kicker}>{p.kicker}</span>
                <span className={s.dotSep} aria-hidden="true" />
                <Link href={`/work/${p.slug}`} className={s.open}>
                  <span>Case file</span>
                  <Arrow />
                </Link>
              </p>
              {/* where a project without a demo runs instead: said plainly, under what it is */}
              {!p.links.demo && p.links.elsewhere ? (
                <p className={`${s.part} ${s.where}`} style={part(2)}>
                  {p.links.elsewhere.note}.{' '}
                  <a href={p.links.elsewhere.href} target="_blank" rel="noreferrer">
                    {p.links.elsewhere.label} <span aria-hidden="true">↗</span>
                  </a>
                </p>
              ) : null}
              <p className={s.sr}>
                {p.description} Built with {p.stack.join(', ')}.
              </p>
              <ProjectActions className={s.actions} title={p.title} links={p.links} onFx={fx} noteOff />
            </article>
          </li>
        ))}
        <li className={s.plate} data-plate={projects.length} data-state="off" data-dir="next">
          <article className={s.article} aria-labelledby="plate-more">
            <h3 id="plate-more" className={s.title}>
              <a href={github} target="_blank" rel="noreferrer">
                <Words text="And much more" />
              </a>
            </h3>
            <p className={`${s.part} ${s.line}`} style={part(1)}>
              <span className={s.kicker}>Experiments, tools and half-built machines</span>
            </p>
            <p className={s.sr}>The rest of the workshop lives on GitHub, including the source of this site.</p>
            <ProjectActions
              className={s.actions}
              title="Ryhox"
              links={{ demo: null, source: github }}
              demoOff
              sourceLabel="All on GitHub"
              sourceNote="Everything else Ryhox has built, on GitHub (opens in a new tab)"
              onFx={fx}
            />
          </article>
        </li>
      </ol>

      {/* the loop of film is drawn here, in 3D */}
      <div className={s.stage} data-stage="reel" data-pin="works" aria-hidden="true" />
      <p ref={stamp} className={s.stamp} data-on="0" aria-hidden="true">
        <span>No live demo</span>
        <small />
      </p>

      <div className={s.foot}>
        <Knob dir={-1} onTurn={turn} />
        <div ref={dots} className={s.dots} role="group" aria-label="Wind the film to a project">
          {Array.from({ length: PLATES }, (_, i) => (
            <button
              key={i}
              type="button"
              className={s.dot}
              aria-label={i < projects.length ? projects[i].title : 'And much more'}
              aria-current={i === 0 ? 'true' : undefined}
              onClick={() => {
                sfx.tick();
                goTo(i);
              }}
            />
          ))}
        </div>
        <Knob dir={1} onTurn={turn} />
      </div>
    </div>
  );
}
