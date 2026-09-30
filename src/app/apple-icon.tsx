import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** The home-screen icon: the brass cog with the R, on soot. */
export default function AppleIcon() {
  const teeth = Array.from({ length: 10 }, (_, i) => i * 36);
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#120d08' }}>
        <svg width="150" height="150" viewBox="0 0 64 64">
          <defs>
            <linearGradient id="b" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f1d196" />
              <stop offset="1" stopColor="#9c6a33" />
            </linearGradient>
          </defs>
          <g fill="url(#b)" transform="translate(32 32)">
            {teeth.map((a) => (
              <rect key={a} x="-3.4" y="-26" width="6.8" height="9" rx="1.4" transform={`rotate(${a})`} />
            ))}
            <circle r="19.5" />
          </g>
          <path d="M25.5 44V20h8.4a6.8 6.8 0 010 13.6h-8.4M32.8 33.6l6.8 10.4" fill="none" stroke="#120d08" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size,
  );
}
