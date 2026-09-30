'use client';

import { useEffect, useState } from 'react';
import { site } from '@/content/site';

function format(d: Date) {
  return d.toLocaleTimeString('en-GB', { timeZone: site.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** The workshop clock, in the workshop's own time zone. */
export default function LocalTime({ className }: { className?: string }) {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNow(format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <p className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      <span className="t-label" style={{ color: 'var(--bone-dim)', display: 'block', marginBottom: 8 }}>
        Time · {site.timezoneLabel}
      </span>
      <time suppressHydrationWarning dateTime={now ?? undefined} style={{ fontSize: 22, letterSpacing: '0.04em' }}>
        {now ?? '--:--:--'}
      </time>
    </p>
  );
}
