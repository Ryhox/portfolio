'use client';

import dynamic from 'next/dynamic';

/** WebGL never renders on the server; the DOM carries all content without it. */
const Experience = dynamic(() => import('./Experience'), { ssr: false });

export default function ExperienceLoader() {
  return <Experience />;
}
