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
  /** Active tool name when state === "working" (else null). */
  tool: string | null;
  /** Epoch seconds when the current active streak started (see SessionTracker). */
  since: number;
  /** Epoch seconds of the most recent event for this session. */
  ts: number;

  // ── Enrichment (optional; present when the agent supplied it). Optional so
  //    existing snapshot literals/consumers stay valid (additive contract). ──
  /** Condensed tool argument, e.g. "pnpm test" or "main.ts". */
  toolInput?: string | null;
  /** Full cwd path (vs `project`, the basename) — shown on hover. */
  cwdFull?: string | null;
  /** Notification text shown when state === "waiting". */
  message?: string | null;
  /** Most recent user prompt (Claude only). */
  prompt?: string | null;
}

/** Selectable status-label theme. Default is "kitchen". */
export type LabelTheme = "kitchen" | "mood" | "garden";
