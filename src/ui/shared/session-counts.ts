/**
 * session-counts.ts — pure counters for the popover header ("N agents · M running").
 */

import type { SessionSnapshot } from "../../types/session-snapshot.js";

/** Number of sessions currently in the working ("running") state. */
export function countRunning(sessions: SessionSnapshot[]): number {
  return sessions.filter((s) => s.state === "working").length;
}
