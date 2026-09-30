'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { hasDemo, type ProjectLinks } from '@/content/projects';
import type { Fx } from '@/lib/reel';
import { sfx } from '@/audio/sfx';
import s from './ProjectActions.module.css';

/**
 * "Live demo" and "Source code". Ported from v1: a fill floods in from the exact point the pointer
 * enters and drains out where it leaves; the label is drawn twice so it changes colour precisely at
 * the fill's edge; letters roll, the arrow swaps, the brackets part.
 */
function Roll({ text }: { text: string }) {
  return (
    <span className={s.text}>
      {Array.from(text).map((c, i) => (
        <span key={i} className={s.ch} style={{ '--i': i } as CSSProperties}>
          <span>{c === ' ' ? ' ' : c}</span>
          <span>{c === ' ' ? ' ' : c}</span>
        </span>
      ))}
    </span>
  );
}

function Arrow() {
  return (
    <span className={s.arrow}>
      {[0, 1].map((k) => (
        <svg key={k} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
        </svg>
      ))}
    </span>
  );
}

function Brackets() {
  return (
    <span className={s.code} aria-hidden="true">
      <span className={s.codeL}>&lt;</span>
      <span className={s.codeS}>/</span>
      <span className={s.codeR}>&gt;</span>
    </span>
  );
}

function Row({ label, code, arrow = true, wet }: { label: string; code?: boolean; arrow?: boolean; wet?: boolean }) {
  return (
    <span className={wet ? `${s.row} ${s.wet}` : s.row} aria-hidden="true">
      {code ? <Brackets /> : null}
      <Roll text={label} />
      {arrow ? <Arrow /> : null}
    </span>
  );
}

/** The plate's fill, and what it does to the picture while the pointer (or focus) is on it. */
function useAct(fx: Fx, onFx?: (fx: Fx) => void) {
  const ref = useRef<HTMLElement>(null);
  const cb = useRef(onFx);
  useEffect(() => {
    cb.current = onFx;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const at = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--x', `${e.clientX - r.left}px`);
      el.style.setProperty('--y', `${e.clientY - r.top}px`);
    };
    const enter = (e: PointerEvent) => {
      at(e);
      el.dataset.on = '1';
      cb.current?.(fx);
      sfx.tick();
    };
    const leave = (e: PointerEvent) => {
      at(e);
      el.dataset.on = '0';
      cb.current?.('');
    };
    const focus = () => {
      if (!el.matches(':focus-visible')) return;
      el.style.setProperty('--x', '50%');
      el.style.setProperty('--y', '50%');
      el.dataset.on = '1';
      cb.current?.(fx);
    };
    const blur = () => {
      el.dataset.on = '0';
      cb.current?.('');
    };
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('focus', focus);
    el.addEventListener('blur', blur);
    return () => {
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('focus', focus);
      el.removeEventListener('blur', blur);
    };
  }, [fx]);
  return ref;
}

type Props = {
  title: string;
  links: ProjectLinks;
  /** told which button the pointer (or focus) is on, and '' when it leaves */
  onFx?: (fx: Fx) => void;
  /** the second plate's words, and whether the first is left out altogether */
  sourceLabel?: string;
  sourceNote?: string;
  demoOff?: boolean;
  /** leave out the line about where a project without a demo runs (the page says it elsewhere) */
  noteOff?: boolean;
  className?: string;
};

export default function ProjectActions({ title, links, onFx, sourceLabel = 'Source code', sourceNote, demoOff, noteOff, className }: Props) {
  const demo = hasDemo(links);
  const demoRef = useAct(demo ? 'demo' : 'none', onFx);
  const codeRef = useAct('code', onFx);
  return (
    <div className={className ? `${s.actions} ${className}` : s.actions}>
      {demoOff ? null : demo ? (
        <a
          ref={demoRef as React.RefObject<HTMLAnchorElement>}
          className={`${s.act} ${s.solid}`}
          href={links.demo!}
          target="_blank"
          rel="noreferrer"
          aria-label={`Live demo of ${title} (opens in a new tab)`}
          onClick={() => sfx.click()}
        >
          <span className={s.fill} aria-hidden="true" />
          <Row label="Live demo" />
          <Row label="Live demo" wet />
        </a>
      ) : (
        <span
          ref={demoRef as React.RefObject<HTMLSpanElement>}
          className={`${s.act} ${s.none}`}
          tabIndex={0}
          role="note"
          aria-label={`${title} has no live demo.${links.elsewhere ? ` ${links.elsewhere.note}.` : ''}`}
        >
          <Row label="No live demo" arrow={false} />
        </span>
      )}
      <a
        ref={codeRef as React.RefObject<HTMLAnchorElement>}
        className={`${s.act} ${s.line}`}
        href={links.source}
        target="_blank"
        rel="noreferrer"
        aria-label={sourceNote ?? `Source code of ${title} on GitHub (opens in a new tab)`}
        onClick={() => sfx.click()}
      >
        <span className={s.fill} aria-hidden="true" />
        <Row label={sourceLabel} code />
        <Row label={sourceLabel} code wet />
      </a>
      {!demo && !demoOff && !noteOff && links.elsewhere ? (
        <p className={s.note}>
          {links.elsewhere.note}.{' '}
          <a href={links.elsewhere.href} target="_blank" rel="noreferrer">
            {links.elsewhere.label}
          </a>
        </p>
      ) : null}
    </div>
  );
}

/**
 * One nameplate on its own (the finale's Email, GitHub and Discord): a link, or a button when it
 * does something on the page. `solid` is the polished brass plate, `line` the soot one.
 */
export function Plate({
  label,
  href,
  onClick,
  variant = 'line',
  arrow = true,
  large,
  ariaLabel,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: 'solid' | 'line';
  arrow?: boolean;
  large?: boolean;
  ariaLabel?: string;
}) {
  const ref = useAct('');
  const cls = `${s.act} ${s[variant]}${large ? ` ${s.lg}` : ''}`;
  const inner = (
    <>
      <span className={s.fill} aria-hidden="true" />
      <Row label={label} arrow={arrow} />
      <Row label={label} arrow={arrow} wet />
    </>
  );
  if (href) {
    const away = /^https?:/.test(href);
    return (
      <a
        ref={ref as React.RefObject<HTMLAnchorElement>}
        className={cls}
        href={href}
        target={away ? '_blank' : undefined}
        rel={away ? 'noreferrer' : undefined}
        aria-label={ariaLabel ?? label}
        onClick={() => {
          sfx.click();
          onClick?.();
        }}
      >
        {inner}
      </a>
    );
  }
  return (
    <button ref={ref as React.RefObject<HTMLButtonElement>} type="button" className={cls} aria-label={ariaLabel ?? label} onClick={onClick}>
      {inner}
    </button>
  );
}
