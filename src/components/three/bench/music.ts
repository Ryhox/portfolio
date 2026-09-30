import { audio } from '@/audio/engine';
import { records } from '@/content/records';

/** What the shell's `music` command does to the Resonance cabinet. */
export function musicCommand(action: string): string {
  const [verb, arg] = action.trim().toLowerCase().split(/\s+/);
  const now = () => {
    const r = records[audio.index] ?? records[0];
    return `${r.title} · ${r.artist}`;
  };
  if (verb === 'pause' || verb === 'stop') {
    if (verb === 'pause') audio.pause();
    else audio.stop();
    return verb === 'pause' ? 'paused.' : 'stopped.';
  }
  if (verb === 'next') {
    audio.next();
    return `next: ${now()}`;
  }
  if (verb === 'prev' || verb === 'previous') {
    audio.prev();
    return `back: ${now()}`;
  }
  if (verb === 'list' || verb === 'ls') return records.map((r, i) => `${i + 1}. ${r.title} · ${r.artist}`).join('\n');
  const n = arg ? parseInt(arg, 10) : NaN;
  const i = Number.isFinite(n) ? Math.min(records.length - 1, Math.max(0, n - 1)) : audio.index;
  const asked = !audio.consented;
  audio.play(i);
  return asked ? 'the previews come from apple music: allow it in the popup and it plays.' : `playing: ${now()}`;
}
