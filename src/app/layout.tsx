import type { Metadata, Viewport } from 'next';
import { Big_Shoulders, Big_Shoulders_Inline, Martian_Mono, Special_Gothic, VT323 } from 'next/font/google';
import Boot from '@/components/dom/Boot';
import CrtGlass from '@/components/dom/CrtGlass';
import Details from '@/components/dom/Details';
import LensView from '@/components/dom/LensView';
import MusicConsent from '@/components/dom/MusicConsent';
import Nav from '@/components/dom/Nav';
import PerfOverlay from '@/components/dom/PerfOverlay';
import Radio from '@/components/dom/Radio';
import Runtime from '@/components/dom/Runtime';
import ExperienceLoader from '@/components/three/ExperienceLoader';
import { site } from '@/content/site';
import { graph, jsonLdString, personJsonLd, websiteJsonLd } from '@/lib/seo';
import './globals.css';

const shoulders = Big_Shoulders({
  subsets: ['latin'],
  axes: ['opsz'],
  variable: '--font-shoulders',
  display: 'swap',
});

const inline = Big_Shoulders_Inline({
  subsets: ['latin'],
  axes: ['opsz'],
  variable: '--font-inline',
  display: 'swap',
});

const gothic = Special_Gothic({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-gothic',
  display: 'swap',
});

const martian = Martian_Mono({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-martian',
  display: 'swap',
});

const vt = VT323({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-vt',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: site.title, template: '%s | Ryhox' },
  description: site.description,
  applicationName: 'Ryhox',
  authors: [{ name: site.name, url: site.url }],
  creator: site.name,
  publisher: site.name,
  keywords: [
    'Ryhox',
    'Ryhox developer',
    'Ryhox portfolio',
    'Ryhox creative developer',
    'Ryhox web developer',
    'Ryhox software developer',
    'Ryhox Three.js',
    'creative developer',
    'Three.js developer',
    'WebGL developer',
  ],
  openGraph: {
    type: 'website',
    siteName: 'Ryhox',
    locale: 'en_US',
    title: site.title,
    description: site.description,
  },
  twitter: {
    card: 'summary_large_image',
    title: site.title,
    description: site.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  category: 'technology',
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: '#0d0a07',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  // under the notch and the home bar, and a phone keyboard overlays instead of squeezing the page
  viewportFit: 'cover',
  interactiveWidget: 'resizes-visual',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${shoulders.variable} ${inline.variable} ${gothic.variable} ${martian.variable} ${vt.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(graph(personJsonLd(), websiteJsonLd())) }}
        />
        <noscript>
          <style>{`.boot{display:none!important}`}</style>
        </noscript>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Runtime />
        <ExperienceLoader />
        <Nav />
        <main id="main">{children}</main>
        <LensView />
        <Radio />
        <CrtGlass />
        <MusicConsent />
        <Boot />
        <Details />
        <PerfOverlay />
      </body>
    </html>
  );
}
