/**
 * xp-level.ts — XP accumulation and level-up logic (Phase 04).
 *
 * Formula: xpPerLevel(n) = Math.round(100 * 1.5^n)
 *   n=0 → 100, n=1 → 150, n=5 → 759
 *
 * XP sources (applied via addXp):
 *   task done   +10  (each agent task completion)
 *   tool_call   +1   (each tool invocation during agent work)
 *   feed        +2   (feed action when hunger < 80)
 *   pet/interact +1  (manual pet action)
 *   faint penalty -5 (stat hit zero → forced sleep)
 *
 * Multi-level-up is supported: a single addXp call may cross multiple thresholds.
 */

import type { PetData } from "./types.js";

/** XP needed to reach level n+1 (i.e., to hold level n you need this much total). */
export function xpPerLevel(n: number): number {
  return Math.round(100 * Math.pow(1.5, n));
}

/**
 * Compute the level corresponding to a given total XP.
 * Level n requires sum of xpPerLevel(0..n-1) total XP.
 * Iterates until total XP budget is exhausted.
 */
export function levelFromXp(totalXp: number): number {
  let level = 0;
  let remaining = totalXp;
  while (remaining >= xpPerLevel(level)) {
    remaining -= xpPerLevel(level);
    level++;
  }
  return level;
}

/**
 * XP remaining within the current level (0-based within level).
 */
export function xpWithinLevel(totalXp: number): number {
  let remaining = totalXp;
  let level = 0;
  while (remaining >= xpPerLevel(level)) {
    remaining -= xpPerLevel(level);
    level++;
  }
  return remaining;
}

/**
 * Add XP to the pet's data, handling multi-level-ups.
 * Does NOT mutate the input — returns a new PetData object.
 *
 * @param data   - Current pet data (not mutated).
 * @param amount - XP delta; can be negative (penalty). XP floor is 0.
 * @returns Updated PetData with new xp and level.
 */
export function addXp(data: PetData, amount: number): PetData {
  const newXp = Math.max(0, data.xp + amount);
  const newLevel = levelFromXp(newXp);
  return { ...data, xp: newXp, level: newLevel };
}

/** XP needed to complete the current level (progress bar denominator). */
export function xpForCurrentLevel(totalXp: number): number {
  return xpPerLevel(levelFromXp(totalXp));
}
