import type { MetadataRoute } from 'next';
import { projects } from '@/content/projects';
import { absoluteUrl } from '@/content/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: absoluteUrl('/'), lastModified: now, changeFrequency: 'monthly', priority: 1 },
    ...projects.map((p) => ({
      url: absoluteUrl(`/work/${p.slug}`),
      lastModified: now,
      changeFrequency: 'yearly' as const,
      priority: 0.8,
      videos: [{ title: p.title, thumbnail_loc: absoluteUrl(p.poster), description: p.description, content_loc: absoluteUrl(p.video) }],
    })),
    { url: absoluteUrl('/imprint'), lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: absoluteUrl('/privacy'), lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
