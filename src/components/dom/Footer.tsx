import Link from 'next/link';
import s from './Footer.module.css';

/** One quiet line at the very end: the copyright and the two pages the law asks for. */
export default function Footer() {
  return (
    <footer className={s.footer} data-anchor="footer">
      <p>© {new Date().getFullYear()} Ryhox</p>
      <nav aria-label="Legal" className={s.links}>
        <Link href="/imprint">Imprint &amp; credits</Link>
        <Link href="/privacy">Privacy</Link>
      </nav>
    </footer>
  );
}
