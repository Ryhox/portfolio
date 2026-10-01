import type { Metadata } from 'next';
import AboutFx from '@/components/dom/AboutFx';
import ContactPlates from '@/components/dom/ContactPlates';
import Flourish from '@/components/dom/Flourish';
import Footer from '@/components/dom/Footer';
import LocalTime from '@/components/dom/LocalTime';
import ReelDeck from '@/components/dom/ReelDeck';
import SayHi from '@/components/dom/SayHi';
import { capabilities } from '@/content/capabilities';
import { projects } from '@/content/projects';
import { PLATES } from '@/lib/reel';
import { graph, jsonLdString, profilePageJsonLd } from '@/lib/seo';
import s from './page.module.css';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { url: '/' },
};

const d = (v: string) => ({ '--d': v }) as React.CSSProperties;

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(graph(profilePageJsonLd())) }} />

      {/* Ignition: the Lumen 64 on the bench. With WebGL its words are drawn in the scene,
          hanging in front of the camera, which flies past them on its way into the tube */}
      <section id="top" data-anchor="top" className={s.hero} aria-labelledby="hero-title">
        <div className={s.heroFx}>
          <div className={s.heroCopy} data-words>
            <h1 id="hero-title" className={s.heroTitle}>
              <span className={`t-display ${s.wordmark}`} aria-label="Ryhox" data-clip>
                {'Ryhox'.split('').map((ch, i) => (
                  <span key={i} className={s.letter} style={d(`${0.1 + i * 0.07}s`)} aria-hidden="true" data-rise="letter">
                    {ch}
                  </span>
                ))}
              </span>
              <span className={`${s.heroRole} ${s.reveal}`} style={d('0.5s')} data-rise="reveal">
                Web developer <span className={s.amp}>&amp;</span> Three.js engineer
              </span>
            </h1>
          </div>
          <div className={s.heroFoot} data-words>
            <div className={`${s.heroFootIn} ${s.reveal}`} style={d('0.95s')} data-rise="reveal">
              <p className={`t-label ${s.cue}`}>
                <span className={s.cueNeedle} aria-hidden="true" data-deco="needle" />
                Scroll to enter the machine
              </p>
              <p className={`t-label ${s.cue} ${s.cueRight}`}>
                <kbd className={s.kbd} data-deco="key">
                  A
                </kbd>
                Type something. It listens.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* the camera's runway into the tube */}
      <div data-anchor="dive" className={s.dive} aria-hidden="true" />

      {/* About: who, then what */}
      <section id="about" data-anchor="maker" className={s.about} aria-labelledby="maker-title">
        <AboutFx className={s.sticky}>
          <div className={s.aboutArt}>
            <div className={s.stageFill} data-stage="about-art" data-pin="maker" aria-hidden="true" />
          </div>
          <div className={s.aboutBio} data-about="bio">
            <h2 id="maker-title" className={`t-display ${s.h2} ${s.h2Small}`}>
              I build <em>playful, tactile</em> things for the web.
            </h2>
            <Flourish className={s.flourish} />
            <p className={`t-text ${s.statement}`}>
              Ryhox is a web developer and Three.js engineer. Real-time 3D worlds, everyday apps, private AI and Minecraft mods,
              all built by hand.
            </p>
            <p className={`t-label ${s.hint}`}>Hover the portrait. A loupe finds what is under the paint.</p>
          </div>

          {/* the trades: the clock in the middle and the five set out round it, each with its tools
              on plates, at the place on the dial the hand points to. Each comes in as the hand
              comes round to it, and stays; the one it is on is lit */}
          <div className={s.trades} data-about="skills">
            <header className={s.tradesHead}>
              <h2 className={`t-display ${s.h2} ${s.tradesTitle}`}>
                Five trades, <em>one clock</em>
              </h2>
              <Flourish className={s.flourish} />
            </header>
            <div className={s.clockStage} data-stage="about-clock" data-pin="maker" aria-hidden="true" />
            {/* a line from each trade's place on the dial out to its name (drawn by AboutFx) */}
            <svg className={s.leads} data-leads aria-hidden="true">
              {capabilities.map((c, i) => (
                <g key={c.name} data-lead={i} data-on={i === 0 ? '1' : '0'}>
                  <path />
                  <path pathLength={1} />
                  <circle r="2.5" />
                </g>
              ))}
            </svg>
            <ol className={s.tradeList} role="list">
              {capabilities.map((c, i) => (
                <li key={c.name} className={s.tradeItem} data-skill={i} data-on={i === 0 ? '1' : '0'}>
                  <h3 className={s.tradeName}>
                    <button type="button" data-skill-btn={i} aria-pressed={i === 0}>
                      {c.name}
                    </button>
                  </h3>
                  <ul className={s.tradeTools} aria-label={`${c.name}: tools`}>
                    {c.items.map((t, k) => (
                      <li key={t} style={{ '--k': k } as React.CSSProperties}>
                        {t}
                      </li>
                    ))}
                  </ul>
                  <p className={s.tradeLine}>{c.line}</p>
                </li>
              ))}
            </ol>
          </div>
        </AboutFx>
      </section>

      {/* the office behind the clock: the view crosses it, through the word hanging in the middle of
          the room, to the old camera on the desk and goes into its lens (all in 3D) */}
      <div data-anchor="office" className={s.office} aria-hidden="true" />

      {/* Projects: inside the old camera, the works on a loop of film that the scroll winds on */}
      <section
        id="projects"
        data-anchor="works"
        className={s.works}
        style={{ '--plates': PLATES } as React.CSSProperties}
        aria-labelledby="works-title"
      >
        <div className={s.sticky} data-sticky>
          {/* the office's lettering is the visible title */}
          <h2 id="works-title" className={s.srOnly}>
            Projects
          </h2>
          <div className={s.worksText}>
            <ReelDeck projects={projects} />
          </div>
        </div>
        {/* the way out: past the last plate, the view goes into the frame at the gate and through it */}
        <div data-anchor="leave" className={s.leave} aria-hidden="true" />
      </section>

      {/* (the radio is not on the page: it stands beside it, see components/dom/Radio) */}

      {/* the last screen: it stands behind the film, and is seen through the last frame on the way out */}
      <div className={s.last} data-last>
        {/* Contact: say hi */}
        <section id="contact" data-anchor="contact" className={s.finale} aria-labelledby="contact-title">
          <SayHi className={s.sayhi} id="contact-title" />
          <p className={s.finaleLede}>Open for freelance, collabs and weird ideas.</p>
          <ContactPlates />
          <LocalTime className={s.local} />
          <div className={s.floor} data-anchor="floor" aria-hidden="true" />
        </section>

        <Footer />
      </div>
    </>
  );
}
