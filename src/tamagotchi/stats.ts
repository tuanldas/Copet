/**
 * stats.ts — Pure stat decay logic for Tamagotchi Core (Phase 04).
 *
 * All functions are pure (no side effects) so they are trivially testable.
 * Decay rates (per minute):
 *   hunger    -0.5
 *   energy    -0.3
 *   happiness -0.4  (×1.5 multiplier when hunger < 30)
 *   hygiene   -0.2
 *
 * All values are clamped to [0, 100] after each application.
 */

import type { Stats } from "./types.js";

/** Decay rates per minute for each stat. */
const DECAY_RATES = {
  hunger: 0.5,
  energy: 0.3,
  happiness: 0.4,
  hygiene: 0.2,
} as const;

/** Happiness decay multiplier when hunger is critically low. */
const HUNGER_LOW_THRESHOLD = 30;
const HUNGER_LOW_MULTIPLIER = 1.5;

/**
 * Clamp a number to [0, 100].
 */
function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Apply stat decay for the given number of minutes (pure function).
 *
 * @param stats  - Current stat values (not mutated).
 * @param minutes - Minutes elapsed; must be >= 0 (negative values treated as 0).
 * @returns New Stats object with decayed + clamped values.
 */
export function applyDecay(stats: Stats, minutes: number): Stats {
  // Guard: negative time (clock skew) treated as no decay.
  const t = Math.max(0, minutes);

  // Happiness multiplier when hunger is critically low.
  const happinessMultiplier =
    stats.hunger < HUNGER_LOW_THRESHOLD ? HUNGER_LOW_MULTIPLIER : 1;

  return {
    hunger: clamp(stats.hunger - DECAY_RATES.hunger * t),
    energy: clamp(stats.energy - DECAY_RATES.energy * t),
    happiness: clamp(
      stats.happiness - DECAY_RATES.happiness * happinessMultiplier * t
    ),
    hygiene: clamp(stats.hygiene - DECAY_RATES.hygiene * t),
  };
}

/**
 * Check if a stat is at zero (faint condition).
 * Called after applying decay to detect forced-sleep trigger.
 */
export function hasStatAtZero(stats: Stats): boolean {
  return (
    stats.hunger === 0 ||
    stats.energy === 0 ||
    stats.happiness === 0 ||
    stats.hygiene === 0
  );
}

/**
 * Compute the daily care score for the given stats.
 * care = (hunger + energy + happiness) / 3
 * hygiene is excluded per spec (affects happiness indirectly via decay).
 */
export function computeDailyCareScore(stats: Stats): number {
  return (stats.hunger + stats.energy + stats.happiness) / 3;
}
