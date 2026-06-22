/**
 * reaction-map.ts — Canonical mapping from AgentState → pet reaction config.
 *
 * Design token colors (from docs/design-guidelines.md §Color):
 *   working  #3B82F6  (blue)
 *   waiting  #F59E0B  (amber)
 *   done     #22C55E  (green)
 *   error    #EF4444  (red)
 *   idle     #94A3B8  (slate)
 *
 * petAgentState maps to AgentEventType used by pet-state-machine AGENT_EVENT.
 * particle: canvas particle effect kind (undefined = none).
 */

import type { AgentState } from "../types/agent-event.js";
import type { AgentEventType } from "../pet/pet-state-machine.js";

export interface Reaction {
  /** AgentEventType to send via petStore AGENT_EVENT */
  petAgentState: AgentEventType;
  /** Hex glow color rendered around the pet (null = no glow) */
  glowColor: string | null;
  /** Optional one-shot particle effect kind */
  particle?: "hearts" | "flash";
}

/** Lookup table — one entry per AgentState. */
const REACTION_TABLE: Record<AgentState, Reaction> = {
  working: {
    petAgentState: "working",
    glowColor: "#3B82F6",
  },
  waiting: {
    petAgentState: "idle",     // idle/walk anim; amber glow signals waiting
    glowColor: "#F59E0B",
  },
  done: {
    petAgentState: "done_success",
    glowColor: "#22C55E",
    particle: "hearts",
  },
  error: {
    petAgentState: "done_error",
    glowColor: "#EF4444",
    particle: "flash",
  },
  idle: {
    petAgentState: "idle",
    glowColor: null,
  },
};

/**
 * Get the Reaction config for a given AgentState.
 * Always returns a value (falls back to idle reaction on unknown state).
 */
export function getReaction(state: AgentState): Reaction {
  return REACTION_TABLE[state] ?? REACTION_TABLE.idle;
}
