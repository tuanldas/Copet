/**
 * session-snapshot.ts — shared shapes for the running-sessions list feature.
 *
 * SessionSnapshot is the per-session view broadcast by the pet window (owner)
 * over the `sessions-snapshot` Tauri event and rendered by every surface
 * (HUD, tray popover, pet tooltip). LabelTheme selects the status-label set.
 */

import type { AgentId, AgentState } from "./agent-event.js";

/** One tracked session, flattened for list/broadcast consumers. */
export interface SessionSnapshot {
  /** Unique session id (key of the tracker map). */
  sessionId: string;
  /** Which agent produced the session (null when unknown). */
  agent: AgentId | null;
  /** cwd basename shown as the row label (null when unknown). */
  project: string | null;
  /** Current agent state. */
  state: AgentState;
  /** Epoch seconds when the current active streak started (see SessionTracker). */
  since: number;
  /** Epoch seconds of the most recent event for this session. */
  ts: number;
}

/** Selectable status-label theme. Default is "kitchen". */
export type LabelTheme = "kitchen" | "mood" | "garden";
