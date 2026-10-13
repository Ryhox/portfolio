/**
 * The Works: every project on the index wheel, its case file at /work/[slug], the sitemap and the
 * JSON-LD all come from this list. Videos and posters live in public/work/.
 *
 * links.demo = null shows the "no live demo" stamp instead (optionally with `elsewhere`).
 */
export type ProjectLinks = {
  demo: string | null;
  source: string;
  elsewhere?: { label: string; href: string; note: string };
};

export type Project = {
  slug: string;
  index: string;
  title: string;
  kicker: string;
  description: string;
  stack: string[];
  video: string;
  poster: string;
  /** object-position style focus for wide recordings, "x% y%" */
  focus?: string;
  links: ProjectLinks;
};

export const projects: Project[] = [
  {
    slug: 'stargazer-islands',
    index: 'I',
    title: 'Stargazer Islands',
    kicker: 'An island for every star',
    description: 'An explorable Three.js island world. Star the repo and you get your own island in it.',
    stack: ['Three.js', 'React Three Fiber', 'GLSL'],
    video: '/work/stargazer.mp4',
    poster: '/work/stargazer.webp',
    links: { demo: 'https://threejs.ryhox.dev', source: 'https://github.com/Ryhox/Stargazer-Islands' },
  },
  {
    slug: 'wieland-ai',
    index: 'II',
    title: 'Wieland AI',
    kicker: 'A private assistant on your own machine',
    description: 'A locally hosted AI assistant running on Ollama. Private, fast, no cloud required.',
    stack: ['JavaScript', 'Ollama'],
    video: '/work/wieland.mp4',
    poster: '/work/wieland.webp',
    focus: '18% 50%',
    links: { demo: 'https://ai.ryhox.dev', source: 'https://github.com/Ryhox/Wieland-AI' },
  },
  {
    slug: 'pokyh',
    index: 'III',
    title: 'Pokyh',
    kicker: 'WebUntis, reimagined',
    description: 'Timetable, grades and the cafeteria menu in one installable app, with push notifications that actually arrive.',
    stack: ['Next.js', 'PWA', 'Push notifications'],
    video: '/work/pokyh.mp4',
    poster: '/work/pokyh.webp',
    links: { demo: 'https://pokyh.com', source: 'https://github.com/bedchem/pokyh-frontend' },
  },
  {
    slug: 'fly-lab',
    index: 'IV',
    title: 'Fly Lab',
    kicker: 'A fruit fly with a gambling problem',
    description: 'A real fruit-fly connectome, a stubborn little gambler, and a slot machine that never pays.',
    stack: ['Connectome simulation', 'WebGL'],
    video: '/work/flylab.mp4',
    poster: '/work/flylab.webp',
    links: { demo: 'https://fly.pokyh.com', source: 'https://github.com/bedchem/fruit-fly-slot-machine' },
  },
  {
    slug: 'projectile-preview',
    index: 'V',
    title: 'Projectile Preview',
    kicker: 'See where it lands before you let go',
    description:
      'A client-side Fabric mod for Minecraft that shows where your projectiles will land before you shoot or throw.',
    stack: ['Java', 'Fabric', 'Minecraft'],
    video: '/work/projectile.mp4',
    poster: '/work/projectile.webp',
    links: {
      demo: null,
      source: 'https://github.com/Ryhox/ProjectilePreview-Mod',
      elsewhere: {
        note: 'It runs inside Minecraft',
        label: 'Get it on Modrinth',
        href: 'https://modrinth.com/mod/projectile.preview',
      },
    },
  },
  {
    slug: 'little-elsewhere',
    index: 'VI',
    title: 'Little Elsewhere',
    kicker: 'A whole world from one spring',
    description: 'A cozy pixel-art idle game about growing a tiny world from a single spring. Every sprite and sound is made in code.',
    stack: ['TypeScript', 'React', 'Canvas 2D'],
    video: '/work/elsewhere.mp4',
    poster: '/work/elsewhere.webp',
    focus: '0% 50%',
    links: { demo: 'https://elsewhere.ryhox.dev', source: 'https://github.com/Ryhox/little-elsewhere' },
  },
];

export const hasDemo = (l: ProjectLinks): l is ProjectLinks & { demo: string } => !!l.demo;

export const getProject = (slug: string) => projects.find((p) => p.slug === slug);

export const hostOf = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');
