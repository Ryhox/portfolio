import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Flourish from '@/components/dom/Flourish';
import Footer from '@/components/dom/Footer';
import ProjectActions from '@/components/dom/ProjectActions';
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
        <TransitionLink href="/#projects" className={s.back}>
          <svg viewBox="0 0 40 12" aria-hidden="true">
            <path d="M40 6H3M8 1L3 6l5 5" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
          <span>All projects</span>
        </TransitionLink>

        <header className={s.head}>
          <span className={s.plateNo} aria-hidden="true">
            {p.index}
          </span>
          <h1 className={`t-display ${s.title}`}>{p.title}</h1>
          <Flourish className={s.flourish} />
          <p className={s.kicker}>{p.kicker}</p>
        </header>

        <figure className={s.plate}>
          <div className={s.frame}>
            <video className={s.video} src={p.video} poster={p.poster} autoPlay muted loop playsInline preload="metadata" style={{ objectPosition: p.focus }} />
          </div>
          <figcaption className={s.caption}>
            <span>{p.title}, recorded running</span>
            <span>{p.links.demo ? hostOf(p.links.demo) : (p.links.elsewhere?.note ?? 'No live demo')}</span>
          </figcaption>
        </figure>

        <div className={s.body}>
          <section className={s.block}>
            <h2>What it is</h2>
            <p>{p.description}</p>
          </section>
          <section className={s.block}>
            <h2>Built with</h2>
            <ul className={s.stack}>
              {p.stack.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
          <section className={s.block}>
            <h2>See it</h2>
            <div className={s.actions}>
              <ProjectActions title={p.title} links={p.links} />
            </div>
          </section>
        </div>

        <nav className={s.pager} aria-label="More projects">
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
