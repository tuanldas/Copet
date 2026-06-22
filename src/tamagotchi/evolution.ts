/**
 * evolution.ts — Stage evolution logic for Tamagotchi Core (Phase 04).
 *
 * 5 stages gated by BOTH level threshold AND 7-day rolling care score:
 *   Egg       level 0-4    (always accessible, no care gate)
 *   Hatchling level 5-19   care >= 60 required
 *   Juvenile  level 20-49  care >= 60 required
 *   Adult     level 50-99  care >= 60 required
 *   Legend    level 100+   care >= 60 required
 *
 * careScore7d = rolling 7-day average of daily (hunger+energy+happiness)/3.
 * Buffer stores up to 7 daily averages; average of all entries is careScore7d.
 *
 * IMPORTANT: evolution ONLY triggers when level crosses a threshold AND
 * careScore7d >= CARE_SCORE_GATE. Neglected pets stay at lower stage.
 */

import { Stage } from "./types.js";
import type { CareScoreBuffer } from "./types.js";

/** Care score required (>=) to unlock evolution at each threshold. */
const CARE_SCORE_GATE = 60;

/** Maximum days retained in the rolling care score buffer. */
const CARE_BUFFER_DAYS = 7;

/**
 * Level → minimum stage achievable at that level (ignoring care score).
 * Checked in descending order to find the highest eligible stage.
 */
const STAGE_LEVELS: Array<{ minLevel: number; stage: Stage }> = [
  { minLevel: 100, stage: Stage.Legend },
  { minLevel: 50, stage: Stage.Adult },
  { minLevel: 20, stage: Stage.Juvenile },
  { minLevel: 5, stage: Stage.Hatchling },
  { minLevel: 0, stage: Stage.Egg },
];

/**
 * Determine which stage a pet should be in based on level alone.
 * Does NOT apply the care score gate (use checkEvolution for gated logic).
 */
export function stageFromLevel(level: number): Stage {
  for (const { minLevel, stage } of STAGE_LEVELS) {
    if (level >= minLevel) return stage;
  }
  return Stage.Egg;
}

/**
 * Compute the 7-day rolling average care score from the buffer.
 * Returns 0 if buffer is empty.
 */
export function computeCareScore7d(buffer: CareScoreBuffer): number {
  if (buffer.length === 0) return 0;
  const sum = buffer.reduce((acc, v) => acc + v, 0);
  return sum / buffer.length;
}

/**
 * Append today's care score to the rolling buffer, trimming to 7 days.
 * Returns a new buffer (does not mutate input).
 *
 * @param buffer      - Existing buffer (oldest entry first).
 * @param dailyScore  - Today's computed care score (0-100).
 */
export function updateCareBuffer(
  buffer: CareScoreBuffer,
  dailyScore: number
): CareScoreBuffer {
  const updated = [...buffer, dailyScore];
  // Keep only the most recent CARE_BUFFER_DAYS entries.
  return updated.slice(-CARE_BUFFER_DAYS);
}

/**
 * Determine the correct stage for a pet given its level and care score buffer.
 *
 * Gate rule: the pet may only advance to a stage above Egg if careScore7d >= 60.
 * If care score is below the gate, the pet stays at its CURRENT stage (passed in)
 * so it cannot regress either — regression is handled only by explicit reset.
 *
 * @param level         - Current level.
 * @param careBuffer    - Rolling 7-day care score buffer.
 * @param currentStage  - The pet's current stage (prevents regression).
 * @returns The stage the pet should be in after checking evolution gate.
 */
export function checkEvolution(
  level: number,
  careBuffer: CareScoreBuffer,
  currentStage: Stage
): Stage {
  const targetStage = stageFromLevel(level);

  // Already at or below target — no change needed.
  if (targetStage === currentStage) return currentStage;

  // Egg is always accessible regardless of care.
  if (targetStage === Stage.Egg) return Stage.Egg;

  // Care gate: must have careScore7d >= 60 to evolve beyond Egg.
  const careScore = computeCareScore7d(careBuffer);
  if (careScore < CARE_SCORE_GATE) {
    // Not enough care — stay at current stage.
    return currentStage;
  }

  return targetStage;
}
