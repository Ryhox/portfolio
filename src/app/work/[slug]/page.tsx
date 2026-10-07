import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Flourish from '@/components/dom/Flourish';
import Footer from '@/components/dom/Footer';
import ProjectActions from '@/components/dom/ProjectActions';
import { Letters } from '@/components/dom/Rise';
import TransitionLink from '@/components/dom/TransitionLink';
import { getProject, hostOf, projects } from '@/content/projects';
import { site } from '@/content/site';
import { breadcrumbJsonLd, graph, jsonLdString, projectJsonLd } from '@/lib/seo';
import s from './case.module.css';

export const dynamicParams = false;

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = getProject(slug);
  if (!p) return {};
  const title = `${p.title}: ${p.kicker}`;
  return {
    title,
    description: `${p.description} A project by ${site.name}.`,
    alternates: { canonical: `/work/${p.slug}` },
    openGraph: {
      type: 'article',
      url: `/work/${p.slug}`,
      title: `${title} | ${site.name}`,
      description: p.description,
      images: [{ url: p.poster }],
    },
    twitter: { card: 'summary_large_image', title: `${title} | ${site.name}`, description: p.description, images: [p.poster] },
  };
}

/** (a piece's turn among those that arrive with it: see components/dom/Reveals) */
const turn = (v: number) => ({ '--rv-d': `${v}s` }) as React.CSSProperties;

/** A case file: one project, its recording, what it is and what it is made of. */
export default async function CaseFile({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const i = projects.findIndex((p) => p.slug === slug);
  const p = projects[i];
  if (!p) notFound();
  const prev = projects[(i - 1 + projects.length) % projects.length];
  const next = projects[(i + 1) % projects.length];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            graph(
              projectJsonLd(p),
              breadcrumbJsonLd([
                { name: site.name, path: '/' },
                { name: 'Projects', path: '/#projects' },
                { name: p.title, path: `/work/${p.slug}` },
              ]),
            ),
          ),
        }}
      />
      <article className={s.case}>
        <TransitionLink href="/#projects" className={s.back} data-rv>
          <svg viewBox="0 0 40 12" aria-hidden="true">
            <path d="M40 6H3M8 1L3 6l5 5" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
          <span>All projects</span>
        </TransitionLink>

        {/* the title comes up a letter at a time as the picture comes on, and the rest after it */}
        <header className={s.head} data-rvs>
          <span className={s.plateNo} aria-hidden="true" data-rv style={turn(0.3)}>
            {p.index}
          </span>
          <h1 className={`t-display ${s.title}`} aria-label={p.title}>
            <Letters text={p.title} from={0.05} />
          </h1>
          <Flourish className={s.flourish} arrive={0.45} />
          <p className={s.kicker} data-rv style={turn(0.55)}>
            {p.kicker}
          </p>
        </header>

        {/* (the figure is what is watched for: its frame is still covered, and so not in view by itself) */}
        <figure className={s.plate} data-rvs>
          <div className={s.frame} data-rv="plate" style={turn(0.35)}>
            <div className={s.screen}>
              <video className={s.video} src={p.video} poster={p.poster} autoPlay muted loop playsInline preload="metadata" style={{ objectPosition: p.focus }} data-rv-in />
            </div>
          </div>
          <figcaption className={s.caption} data-rv style={turn(0.9)}>
            <span>{p.title}, recorded running</span>
            <span>{p.links.demo ? hostOf(p.links.demo) : (p.links.elsewhere?.note ?? 'No live demo')}</span>
          </figcaption>
        </figure>

        <div className={s.body}>
          <section className={s.block} data-rv>
            <h2>What it is</h2>
            <p>{p.description}</p>
          </section>
          <section className={s.block} data-rv>
            <h2>Built with</h2>
            <ul className={s.stack}>
              {p.stack.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
          <section className={s.block} data-rv>
            <h2>See it</h2>
            <div className={s.actions}>
              <ProjectActions title={p.title} links={p.links} />
            </div>
          </section>
        </div>

        <nav className={s.pager} aria-label="More projects" data-rv>
          <TransitionLink href={`/work/${prev.slug}`} className={s.pageLink}>
            <small>Previous</small>
            <b>{prev.title}</b>
          </TransitionLink>
          <TransitionLink href={`/work/${next.slug}`} className={`${s.pageLink} ${s.pageNext}`}>
            <small>Next</small>
            <b>{next.title}</b>
          </TransitionLink>
        </nav>
      </article>
      <Footer />
    </>
  );
}
