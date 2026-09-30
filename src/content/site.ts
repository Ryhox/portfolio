/**
 * Single source of truth for identity, SEO and contact details.
 * Change the values here; everything else (metadata, JSON-LD, sitemap, UI) reads from this file.
 */
export const site = {
  name: 'Ryhox',
  /** Production origin, no trailing slash. Set NEXT_PUBLIC_SITE_URL in your hosting env. */
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ryhox.dev').replace(/\/$/, ''),
  title: 'Ryhox | Web Developer & Three.js Engineer',
  shortTitle: 'Ryhox',
  jobTitle: 'Web Developer & Three.js Engineer',
  description:
    'Ryhox is a web developer and Three.js engineer who builds interactive, mechanical web experiences with WebGL and Next.js. This is the official Ryhox portfolio.',
  /** Used by schema.org to separate the person from the unrelated fund ticker of the same letters. */
  disambiguation:
    'Ryhox is a web developer, creative developer and Three.js engineer. Not the RYHOX mutual fund ticker (Rydex NASDAQ-100 Fund, Class H).',
  email: 'contact@ryhox.dev',
  /** Discord has no public profile URL, so the handle is copied to the clipboard. */
  discord: 'ryhox',
  timezone: 'Europe/Berlin',
  timezoneLabel: 'CET',
  locale: 'en',
  socials: [
    { label: 'GitHub', href: 'https://github.com/Ryhox', handle: '@Ryhox' },
    { label: 'Modrinth', href: 'https://modrinth.com/user/Ryhox', handle: '@Ryhox' },
  ],
  knowsAbout: [
    'Creative development',
    'Three.js',
    'React Three Fiber',
    'WebGL',
    'GLSL shaders',
    'Next.js',
    'React',
    'TypeScript',
    'Flutter',
    'Node.js',
    'PostgreSQL',
    'MySQL',
    'Ollama',
    'Java',
    'Kotlin',
    'C#',
    'Arduino',
    'Minecraft modding',
    'GSAP',
    'Web Audio',
  ],
} as const;

export type Site = typeof site;

export const absoluteUrl = (path = '/') => `${site.url}${path.startsWith('/') ? path : `/${path}`}`;
