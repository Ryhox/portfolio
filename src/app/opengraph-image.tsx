import { ImageResponse } from 'next/og';
import { site } from '@/content/site';

export const alt = `${site.name}, web developer and Three.js engineer`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The card links unfurl into: the wordmark, the trade, and a cog turning in the corner. */
export default function OpengraphImage() {
  const teeth = Array.from({ length: 24 }, (_, i) => i * 15);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '72px 80px',
          background: 'radial-gradient(120% 90% at 78% 30%, #3a2413 0%, #140d08 55%, #0a0705 100%)',
          color: '#ebe1cb',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        <svg width="520" height="520" viewBox="-130 -130 260 260" style={{ position: 'absolute', right: -90, top: -110, opacity: 0.55 }}>
          <g fill="none" stroke="#c99a58" strokeWidth="2">
            {teeth.map((a) => (
              <rect key={a} x="-7" y="-122" width="14" height="20" rx="3" transform={`rotate(${a})`} />
            ))}
            <circle r="102" />
            <circle r="82" strokeOpacity="0.5" />
            <circle r="22" />
          </g>
        </svg>
        <div style={{ display: 'flex', fontSize: 190, fontWeight: 900, letterSpacing: 4, lineHeight: 0.85, color: '#f3e7cc' }}>RYHOX</div>
        <div style={{ display: 'flex', marginTop: 28, fontSize: 40, letterSpacing: 3, color: '#c99a58', textTransform: 'uppercase' }}>
          Web developer &amp; Three.js engineer
        </div>
        <div style={{ display: 'flex', marginTop: 22, fontSize: 26, color: '#b3a488' }}>{site.url.replace(/^https?:\/\//, '')}</div>
      </div>
    ),
    size,
  );
}
