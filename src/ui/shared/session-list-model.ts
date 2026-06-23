/**
 * session-list-model.ts — pure helpers for rendering the session list.
 *
 * Sorting reuses the tracker's canonical comparator so the list order matches
 * the pet-reaction priority (single source of truth, no drift).
 */

import type { SessionSnapshot } from "../../types/session-snapshot.js";
import type { AgentState } from "../../types/agent-event.js";
import { compareByPriorityThenTs } from "../../agent-bridge/session-tracker.js";

/** Return a sorted copy (priority first, then most-recent). Does not mutate input. */
export function sortSessions(list: SessionSnapshot[]): SessionSnapshot[] {
  return [...list].sort(compareByPriorityThenTs);
}

/** done/idle render dimmed (recently finished / inactive). */
export function isFaded(state: AgentState): boolean {
  return state === "done" || state === "idle";
}

/** Row label: project name when present, else a shortened session id. */
export function displayName(s: SessionSnapshot): string {
  if (s.project && s.project.trim().length > 0) return s.project;
  return s.sessionId ? s.sessionId.slice(0, 6) : "session";
}
