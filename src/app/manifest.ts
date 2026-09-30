import type { MetadataRoute } from 'next';
import { site } from '@/content/site';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.title,
    short_name: site.shortTitle,
    description: site.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#0d0a07',
    theme_color: '#0d0a07',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
