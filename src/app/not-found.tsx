import type { Metadata } from 'next';
import Flourish from '@/components/dom/Flourish';
import Lost from '@/components/dom/Lost';
import TransitionLink from '@/components/dom/TransitionLink';
import s from './not-found.module.css';

export const metadata: Metadata = {
  title: 'Stopped at 4:04',
  robots: { index: false, follow: true },
};

/** A clock face with a crack through it, stopped at four minutes past four. */
function Stopped() {
  const hour = ((4 + 4 / 60) / 12) * 360;
  const minute = (4 / 60) * 360;
  return (
    <svg className={s.face} viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="100" cy="100" r="84" fill="none" stroke="currentColor" strokeWidth="1" opacity=".45" />
      {Array.from({ length: 60 }, (_, i) => (
        <path
          key={i}
          d={`M100 ${i % 5 ? 20 : 16}V${i % 5 ? 24 : 30}`}
          stroke="currentColor"
          strokeWidth={i % 5 ? 1 : 2.5}
          opacity={i % 5 ? 0.5 : 1}
          transform={`rotate(${i * 6} 100 100)`}
        />
      ))}
      <path d={`M100 100L100 52`} stroke="currentColor" strokeWidth="5" strokeLinecap="round" transform={`rotate(${hour} 100 100)`} />
      <path d={`M100 100L100 30`} stroke="currentColor" strokeWidth="3" strokeLinecap="round" transform={`rotate(${minute} 100 100)`} />
      <circle cx="100" cy="100" r="6" fill="currentColor" />
      {/* the crack */}
      <path d="M150 22l-18 40 14 12-26 38 10 8-22 52" fill="none" stroke="var(--ink)" strokeWidth="5" strokeLinejoin="round" />
      <path d="M150 22l-18 40 14 12-26 38 10 8-22 52" fill="none" stroke="var(--brass-hi)" strokeWidth="1" strokeLinejoin="round" opacity=".7" />
    </svg>
  );
}

export default function NotFound() {
  return (
    <section className={s.page}>
      <Lost />
      <h1 className={`t-display ${s.code}`} aria-label="404">
        <span>4</span>
        <Stopped />
        <span>4</span>
      </h1>
      <Flourish className={s.flourish} />
      <p className={s.lead}>This page stopped at 4:04 and nobody wound it. Whatever was here has come loose from the mechanism.</p>
      <div className={s.links}>
        <TransitionLink href="/" className={s.home}>
          Back to the machine
        </TransitionLink>
        <TransitionLink href="/#projects">Projects</TransitionLink>
        <TransitionLink href="/#contact">Contact</TransitionLink>
      </div>
    </section>
  );
}
