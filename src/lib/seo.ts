import { absoluteUrl, site } from '@/content/site';
import type { Project } from '@/content/projects';

const PERSON_ID = absoluteUrl('/#ryhox');
const WEBSITE_ID = absoluteUrl('/#website');

export const personJsonLd = () => ({
  '@type': 'Person',
  '@id': PERSON_ID,
  name: site.name,
  alternateName: ['RYHOX', 'Ryhox developer', 'Ryhox creative developer'],
  url: absoluteUrl('/'),
  image: absoluteUrl('/images/ryhox-portrait.jpg'),
  jobTitle: site.jobTitle,
  description: site.description,
  disambiguatingDescription: site.disambiguation,
  email: `mailto:${site.email}`,
  knowsAbout: site.knowsAbout,
  sameAs: site.socials.map((s) => s.href),
  mainEntityOfPage: absoluteUrl('/'),
});

export const websiteJsonLd = () => ({
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  name: 'Ryhox | Official Portfolio',
  alternateName: ['Ryhox', 'Ryhox portfolio', 'Ryhox Works'],
  url: absoluteUrl('/'),
  description: site.description,
  inLanguage: site.locale,
  author: { '@id': PERSON_ID },
  publisher: { '@id': PERSON_ID },
  about: { '@id': PERSON_ID },
});

export const profilePageJsonLd = () => ({
  '@type': 'ProfilePage',
  '@id': absoluteUrl('/#profile'),
  url: absoluteUrl('/'),
  name: site.title,
  isPartOf: { '@id': WEBSITE_ID },
  mainEntity: { '@id': PERSON_ID },
  about: { '@id': PERSON_ID },
  dateModified: new Date().toISOString().slice(0, 10),
});

export const projectJsonLd = (p: Project) => ({
  '@type': 'CreativeWork',
  '@id': absoluteUrl(`/work/${p.slug}#work`),
  name: `${p.title}: ${p.kicker}`,
  headline: p.title,
  description: p.description,
  url: absoluteUrl(`/work/${p.slug}`),
  image: absoluteUrl(p.poster),
  video: { '@type': 'VideoObject', name: p.title, description: p.description, contentUrl: absoluteUrl(p.video), thumbnailUrl: absoluteUrl(p.poster) },
  ...(p.links.demo ? { sameAs: [p.links.demo, p.links.source] } : { sameAs: [p.links.source] }),
  keywords: p.stack.join(', '),
  creator: { '@id': PERSON_ID },
  author: { '@id': PERSON_ID },
  isPartOf: { '@id': WEBSITE_ID },
  inLanguage: site.locale,
});

export const breadcrumbJsonLd = (items: { name: string; path: string }[]) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: it.name,
    item: absoluteUrl(it.path),
  })),
});

export const graph = (...nodes: object[]) => ({ '@context': 'https://schema.org', '@graph': nodes });

/** Serialise for a <script type="application/ld+json"> without allowing tag injection. */
export const jsonLdString = (data: object) => JSON.stringify(data).replace(/</g, '\\u003c');
