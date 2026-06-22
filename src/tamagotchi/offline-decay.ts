/**
 * offline-decay.ts — Offline gap decay handler (Phase 04).
 *
 * When the app resumes after being closed, compute how long it was offline
 * and apply capped decay. This prevents punishing users who close the app
 * for extended periods — cap is 2 hours (120 minutes).
 *
 * Rules:
 *   decayMinutes = min(offlineMinutes, 120)   — cap at 2h
 *   decayMinutes = max(decayMinutes, 0)        — clamp >= 0 (clock skew guard)
 *   newStats = applyDecay(stats, decayMinutes) — standard decay applied
 *   XP is NOT deducted for offline time
 *
 * Returns an OfflineToastPayload so P06 can show "your pet waited X minutes".
 */

import { applyDecay } from "./stats.js";
import type { Stats, OfflineToastPayload } from "./types.js";

/** Maximum offline minutes that count toward decay (2 hours). */
const OFFLINE_DECAY_CAP_MINUTES = 120;

/**
 * Apply offline decay based on the gap between lastSavedMs and nowMs.
 *
 * @param lastSavedMs - Unix timestamp (ms) of last save.
 * @param nowMs       - Current Unix timestamp (ms).
 * @param stats       - Current stats before offline decay.
 * @returns { newStats, waitedMinutes } for state update and toast display.
 */
export function applyOfflineDecay(
  lastSavedMs: number,
  nowMs: number,
  stats: Stats
): OfflineToastPayload {
  // Raw offline duration in minutes; clamp >= 0 for clock-skew safety.
  const rawMinutes = Math.max(0, (nowMs - lastSavedMs) / 60_000);

  // Cap decay at 2 hours — users shouldn't be punished for long absences.
  const decayMinutes = Math.min(rawMinutes, OFFLINE_DECAY_CAP_MINUTES);

  const newStats = applyDecay(stats, decayMinutes);

  return {
    waitedMinutes: Math.round(rawMinutes),
    newStats,
  };
}
