/**
 * pet-status.ts — derive a short companion mood label from the 4 core stats.
 *
 * The lowest stat drives the mood: a clearly-low stat names the need ("Đói"…),
 * a middling lowest reads "Ổn", and all-healthy reads "No căng". Pure → testable.
 */

import type { Stats } from "../../tamagotchi/types.js";

export interface PetStatus {
  /** Short Vietnamese label shown in the companion card. */
  text: string;
  /** Tone for colouring: good (green) / warn (amber) / bad (red). */
  tone: "good" | "warn" | "bad";
}

/** Stat → the need label shown when that stat is the lowest and critical. */
const NEED_LABELS: [keyof Stats, string][] = [
  ["hunger", "Đói"],
  ["energy", "Mệt"],
  ["hygiene", "Cần tắm"],
  ["happiness", "Buồn"],
];

/** Below this a stat is "critical"; below WARN it's merely "okay". */
const CRITICAL = 30;
const WARN = 60;

export function petStatusLabel(stats: Stats): PetStatus {
  // Find the lowest stat (first listed wins ties for a stable label).
  let lowestKey = NEED_LABELS[0][0];
  for (const [key] of NEED_LABELS) {
    if (stats[key] < stats[lowestKey]) lowestKey = key;
  }
  const lowest = stats[lowestKey];

  if (lowest < CRITICAL) {
    const label = NEED_LABELS.find(([k]) => k === lowestKey)![1];
    return { text: label, tone: "bad" };
  }
  if (lowest < WARN) return { text: "Ổn", tone: "warn" };
  return { text: "No căng", tone: "good" };
}
