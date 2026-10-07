/**
 * The mark under a section title: a small cog on an engraved rule that tapers away. It stands in
 * for the little labels sites usually put above their headings.
 * `arrive`: it is drawn out from its cog when it comes into view, this long after the piece it
 * arrives with (seconds; see components/dom/Reveals). Left out, it is simply there.
 */
export default function Flourish({ className, arrive }: { className?: string; arrive?: number }) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 16"
      fill="none"
      aria-hidden="true"
      data-rv={arrive === undefined ? undefined : 'rule'}
      style={arrive ? ({ '--rv-d': `${arrive}s` } as React.CSSProperties) : undefined}
    >
      <g transform="translate(8 8)">
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x="-1.3" y="-7.6" width="2.6" height="3" rx=".5" fill="currentColor" transform={`rotate(${i * 45})`} />
        ))}
        <circle r="5" fill="currentColor" />
        <circle r="1.8" fill="var(--ink)" />
      </g>
      <path d="M19 8h150" stroke="currentColor" strokeWidth="1.2" />
      <path d="M19 10.5h96" stroke="currentColor" strokeWidth=".6" opacity=".55" />
      <path d="M169 8h60" stroke="currentColor" strokeWidth="1" strokeDasharray="1 5" opacity=".7" />
    </svg>
  );
}
