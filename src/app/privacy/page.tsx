import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage from '@/components/dom/LegalPage';
import { site } from '@/content/site';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What ryhox.dev does with your data: very little. No cookies, no tracking, no analytics.',
  alternates: { canonical: '/privacy' },
  openGraph: { url: '/privacy' },
};

/** Privacy policy (GDPR). The bracketed line is yours to fill in: where the site is hosted. */
export default function Privacy() {
  return (
    <LegalPage title="Privacy" lead="No cookies, no tracking, no analytics. Here’s the little that does happen." updated="September 2026">
      <section>
        <h2>Who’s responsible</h2>
        <p>
          Ryhox, who runs this site (see <Link href="/imprint">Imprint</Link>). Questions about your data:{' '}
          <a href={`mailto:${site.email}`}>{site.email}</a>
        </p>
      </section>

      <section>
        <h2>Visiting the site</h2>
        <p>
          The site is hosted by Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA. Like every web server, it logs
          technical data about each request (IP address, time, page, browser) to deliver the site and keep it secure. Legal basis:
          legitimate interest, Art. 6 (1)(f) GDPR. The logs are deleted after a short time. Vercel may process this data outside
          the EU; it does so under the safeguards of its data processing agreement.{' '}
          <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noreferrer">
            Vercel’s privacy policy
          </a>
        </p>
        <p>Fonts, 3D models and videos are all served from this site itself. Nothing is loaded from Google.</p>
      </section>

      <section>
        <h2>Stored in your browser</h2>
        <p>No cookies. A few small notes in your browser’s storage, which never leave your device:</p>
        <ul>
          <li>
            <code>ryhox-music-ok</code> (local storage) remembers that you allowed song previews from Apple.
          </li>
          <li>
            <code>ryhox:booted</code> (session storage) shortens the loading screen for the rest of your visit, and is gone when you
            close the tab.
          </li>
        </ul>
        <p>Clearing this site’s data in your browser removes them.</p>
      </section>

      <section>
        <h2>Music previews (Apple)</h2>
        <p>
          The records on the Resonance cabinet are previews from Apple Music. Nothing is loaded from Apple until you pick a record
          and confirm. After that, your browser fetches previews and song details from Apple’s servers (the album covers are kept on this site), so Apple receives
          your IP address and browser details.
        </p>
        <p>
          Provider: Apple Distribution International Ltd., Hollyhill Industrial Estate, Hollyhill, Cork, Ireland ·{' '}
          <a href="https://www.apple.com/legal/privacy/" target="_blank" rel="noreferrer">
            Apple’s privacy policy
          </a>
        </p>
        <p>
          Legal basis: your consent, Art. 6 (1)(a) GDPR. Withdraw it any time by clearing this site’s data; the cabinet then asks
          again.
        </p>
      </section>

      <section>
        <h2>Links and contact</h2>
        <p>
          Links to other sites (GitHub, project demos, Apple Music, Modrinth, Sketchfab) only take you there when you click them,
          where their own privacy policies apply. If you email me, your address and message are used only to reply. The Discord
          button just copies my username.
        </p>
      </section>

      <section>
        <h2>Your rights</h2>
        <p>
          You can ask for access to your data, have it corrected or deleted, restrict or object to its processing, take it with you,
          and withdraw consent (Art. 15 to 21 GDPR). You can also complain to the{' '}
          <a href="https://www.garanteprivacy.it" target="_blank" rel="noreferrer">
            Garante per la protezione dei dati personali
          </a>
          .
        </p>
      </section>
    </LegalPage>
  );
}
