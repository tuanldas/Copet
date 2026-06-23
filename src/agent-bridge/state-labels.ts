/**
 * state-labels.ts — theme-flavoured labels for each agent state.
 *
 * Three selectable sets map a canonical AgentState to a playful Tamagotchi
 * label + emoji. getStateLabel() is defensive: an unknown theme falls back to
 * "kitchen", an unknown state falls back to the raw state name.
 */

import type { AgentState } from "../types/agent-event.js";
import type { LabelTheme } from "../types/session-snapshot.js";

export interface StateLabel {
  text: string;
  emoji: string;
}

/** Themes in display order (used by the Settings picker). */
export const LABEL_THEMES: LabelTheme[] = ["kitchen", "mood", "garden"];

const TABLE: Record<LabelTheme, Record<AgentState, StateLabel>> = {
  kitchen: {
    working: { text: "Cooking", emoji: "🍳" },
    waiting: { text: "Hungry", emoji: "🍽️" },
    done: { text: "Full", emoji: "😋" },
    idle: { text: "Sleeping", emoji: "💤" },
    error: { text: "Burnt", emoji: "🔥" },
  },
  mood: {
    working: { text: "Playing", emoji: "⚡" },
    waiting: { text: "Curious", emoji: "👀" },
    done: { text: "Happy", emoji: "😊" },
    idle: { text: "Sleeping", emoji: "💤" },
    error: { text: "Sad", emoji: "😢" },
  },
  garden: {
    working: { text: "Growing", emoji: "🌱" },
    waiting: { text: "Thirsty", emoji: "💧" },
    done: { text: "Bloomed", emoji: "🌸" },
    idle: { text: "Dormant", emoji: "🌙" },
    error: { text: "Wilting", emoji: "🥀" },
  },
};

/**
 * Resolve the label for a (theme, state) pair. Guards both arguments so callers
 * that run before the persisted theme is loaded (theme === undefined) never throw.
 */
export function getStateLabel(theme: LabelTheme, state: AgentState): StateLabel {
  const themeTable = TABLE[theme] ?? TABLE.kitchen;
  return themeTable[state] ?? { text: String(state), emoji: "·" };
}
