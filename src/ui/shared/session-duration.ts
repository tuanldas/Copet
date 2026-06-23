/**
 * session-duration.ts — format an elapsed duration (seconds) as a compact label.
 *
 * Buckets: seconds → minutes → hours → days. Negative / non-finite input is
 * clamped to "0s" so a clock-skewed `since` never renders garbage.
 */

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0s";
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
