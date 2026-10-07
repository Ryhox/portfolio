import type { CSSProperties } from 'react';

const turn = (delay: number) => ({ '--rv-d': `${delay.toFixed(2)}s` }) as CSSProperties;

/**
 * Display type that arrives a word at a time, each word coming up from under its own line (see
 * Reveals, and the arrivals in globals.css). `from`: when the first word starts (seconds), `step`:
 * how long after it each next one does. The words stay words: they wrap, and read, as plain text.
 */
export function Words({ text, from = 0, step = 0.07 }: { text: string; from?: number; step?: number }) {
  const words = text.split(' ');
  return (
    <>
      {words.map((w, i) => (
        <span key={i}>
          <span data-rv="word" style={turn(from + i * step)}>
            <span>{w}</span>
          </span>
          {i < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </>
  );
}

/**
 * A short title that arrives a letter at a time, like the landing's wordmark: the letters of each
 * word come up from under its line, one after another. (The heading it stands in says the title
 * for readers, with an aria-label, as the landing's does.)
 */
export function Letters({ text, from = 0 }: { text: string; from?: number }) {
  const words = text.split(' ');
  let n = 0;
  return (
    <span aria-hidden="true">
      {words.map((w, i) => (
        <span key={i}>
          <span data-rv="letters" style={turn(from)}>
            {w.split('').map((ch, k) => (
              <span key={k} style={{ '--i': n++ } as CSSProperties}>
                {ch}
              </span>
            ))}
          </span>
          {i < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </span>
  );
}
