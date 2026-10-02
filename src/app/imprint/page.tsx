import type { Metadata } from 'next';
import LegalPage from '@/components/dom/LegalPage';
import { site } from '@/content/site';

export const metadata: Metadata = {
  title: 'Imprint',
  description: 'Who runs ryhox.dev, and the credits for everything on it that isn’t Ryhox’s own work.',
  alternates: { canonical: '/imprint' },
  openGraph: { url: '/imprint' },
};

const CC_BY = 'https://creativecommons.org/licenses/by/4.0/';

const models = [
  { title: 'Lumen 64 Spark || Computer', author: 'dark_igorek', href: 'https://sketchfab.com/3d-models/lumen-64-spark-computer-b4c0d44924d3408593878bdc2ae353a2', changed: 'the pictured screen replaced by a live one, textures compressed' },
  { title: 'Steampunk Camera', author: 'lumoize', href: 'https://sketchfab.com/3d-models/steampunk-camera-a2210a0ba6834141af3bf83ee1e03f07', changed: 'geometry simplified, textures compressed' },
  { title: 'Lumen Resonance || Audio System', author: 'dark_igorek', href: 'https://sketchfab.com/3d-models/lumen-resonance-audio-system-11b9575fd0fd4c01be2cd3d79421524d', changed: 'controls and display made to work, its vinyl copied into a crate, textures compressed' },
  { title: 'Broken Steampunk Clock', author: 'VassKacsoHunor', href: 'https://sketchfab.com/3d-models/broken-steampunk-clock-c440d78639b74e77ba6ae375f9cbf5b7', changed: 'a second one hung in the office, geometry simplified, textures compressed' },
  { title: 'Free lowpoly steampunk gears pack', author: 'KapetS', href: 'https://sketchfab.com/3d-models/free-lowpoly-steampunk-gears-pack-01b1f0838d00401cae0c276005925140', changed: 'gears rescaled so they mesh, textures compressed' },
  { title: 'Steampunk-Style Clock', author: 'sandeep Vaghela', href: 'https://sketchfab.com/3d-models/steampunk-style-clock-1637fd58c4b441b4b1ed44c5448406e1', changed: 'hands set to the real time, textures compressed' },
  { title: 'Fancy Victorian Square Picture Frame', author: 'Jamie McFarlane', href: 'https://sketchfab.com/3d-models/fancy-victorian-square-picture-frame-772e7ca1bdc64a2ea537c2d191ab8918', changed: 'the photograph replaced by a portrait, textures compressed' },
  { title: 'Antique Office Desk', author: 'Mkky', href: 'https://sketchfab.com/3d-models/antique-office-desk-536ee7c5cfb94775ae3eff608bd9fecf', changed: 'geometry simplified, textures compressed' },
  { title: 'Old Office Window', author: 'sudreyskr', href: 'https://sketchfab.com/3d-models/old-office-window-6851ada65b23464da79eb5468c1cee3d', changed: 'textures compressed' },
];

/** Legal notice and credits. A personal site run from Italy: no company details to list. */
export default function Imprint() {
  return (
    <LegalPage title="Imprint" lead="Who runs this site, and the credits for everything on it that isn’t mine." updated="September 2026">
      <section>
        <h2>Who runs this site</h2>
        <p>
          Ryhox, a personal portfolio. Contact: <a href={`mailto:${site.email}`}>{site.email}</a>
        </p>
        <p>
          This is a personal, non-commercial website: it doesn’t sell anything or provide paid services online, so it isn’t an
          information society service under Italian law (D.Lgs. 70/2003) and has no company details to list.
        </p>
      </section>

      <section id="credits">
        <h2>Credits &amp; licences</h2>
        <ul>
          {models.map((m) => (
            <li key={m.href}>
              3D model{' '}
              <a href={m.href} target="_blank" rel="noreferrer">
                “{m.title}”
              </a>{' '}
              by {m.author},{' '}
              <a href={CC_BY} target="_blank" rel="noreferrer">
                CC BY 4.0
              </a>
              . Changed: {m.changed}.
            </li>
          ))}
          <li>
            Songs on the Resonance cabinet: 30-second previews from Apple Music, each linking to the full song. Music and covers
            belong to the artists and their labels.
          </li>
          <li>
            The office’s furniture (grandfather clock, bookshelf, encyclopaedia, oil lamp, magnifying glass, chairs) and its
            wallpaper, panelling, parquet, carpet and plaster surfaces:{' '}
            <a href="https://polyhaven.com" target="_blank" rel="noreferrer">
              Poly Haven
            </a>
            , CC0. The damask and the rug’s pattern are drawn over them by the site.
          </li>
          <li>Fonts: Big Shoulders, Special Gothic, Martian Mono and VT323, SIL Open Font License 1.1.</li>
          <li>Everything else (design, code, the portrait, project videos and pictures) is my own work.</li>
        </ul>
      </section>

      <section>
        <h2>Trademarks</h2>
        <p>
          Apple Music is a trademark of Apple Inc. This site is not affiliated with or endorsed by Apple. Ryhox is a person and
          has nothing to do with the RYHOX mutual fund ticker.
        </p>
      </section>

      <section>
        <h2>Liability</h2>
        <p>
          I keep this site accurate as best I can, but can’t promise it’s complete or up to date. Links to other sites are checked
          when added; what’s on them is up to whoever runs them.
        </p>
      </section>
    </LegalPage>
  );
}
