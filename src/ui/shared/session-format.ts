/**
 * session-format.ts — small display formatters for transcript enrichment,
 * shared by the HUD SessionList and the pet tooltip so both render identically.
 */

/** Compact token count: 523 → "523", 1219 → "1.2k", 248000 → "248k", 1.5M. */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** Strip the "claude-" prefix for a compact model label ("opus-4-8"). */
export function shortModel(model: string): string {
  return model.replace(/^claude-/, "");
}
