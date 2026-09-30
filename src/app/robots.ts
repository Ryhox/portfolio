import type { MetadataRoute } from 'next';
import { absoluteUrl, site } from '@/content/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: site.url,
  };
}
