/**
 * agent-badge.ts — short display name for each agent/CLI, used as a row badge.
 */

import type { AgentId } from "../../types/agent-event.js";

const BADGE: Record<AgentId, string> = {
  "claude-code": "Claude",
  codex: "Codex",
  gemini: "Gemini",
  wrapper: "run",
};

/** Short badge label for an agent (empty string when unknown/null). */
export function agentBadge(agent: AgentId | null): string {
  return agent ? (BADGE[agent] ?? agent) : "";
}
