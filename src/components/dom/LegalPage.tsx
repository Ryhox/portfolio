import type { ReactNode } from 'react';
import Flourish from './Flourish';
import { Letters } from './Rise';
import TransitionLink from './TransitionLink';
import s from './LegalPage.module.css';

/** The frame shared by Imprint and Privacy: a specification sheet pinned inside the tube. */
export default function LegalPage({
  title,
  lead,
  updated,
  children,
}: {
  title: string;
  lead: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <article className={s.sheet}>
      <header className={s.head} data-rvs>
        <h1 className={`t-display ${s.title}`} aria-label={title}>
          <Letters text={title} from={0.05} />
        </h1>
        <Flourish className={s.flourish} arrive={0.4} />
        <p className={s.lead} data-rv style={{ '--rv-d': '0.5s' } as React.CSSProperties}>
          {lead}
        </p>
      </header>
      <div className={s.body} data-rv style={{ '--rv-d': '0.65s' } as React.CSSProperties}>
        {children}
      </div>
      <footer className={s.foot}>
        <span>Last updated {updated}</span>
        <nav aria-label="Legal">
          <TransitionLink href="/imprint">Imprint</TransitionLink>
          <TransitionLink href="/privacy">Privacy</TransitionLink>
          <TransitionLink href="/">Back to the machine</TransitionLink>
        </nav>
      </footer>
    </article>
  );
}
