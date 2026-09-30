import type { ReactNode } from 'react';
import Flourish from './Flourish';
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
      <header className={s.head}>
        <h1 className={`t-display ${s.title}`}>{title}</h1>
        <Flourish className={s.flourish} />
        <p className={s.lead}>{lead}</p>
      </header>
      <div className={s.body}>{children}</div>
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
