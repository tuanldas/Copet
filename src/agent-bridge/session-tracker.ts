/**
 * session-tracker.ts — Multi-session aggregation for agent events.
 *
 * Tracks per-session state in a Map<session_id, SessionEntry>.
 * aggregate() applies priority policy: working > waiting > error > done > idle.
 * expireStale() removes sessions that have not emitted events within timeoutMs.
 */

import type { AgentId, AgentState } from "../types/agent-event.js";
import type { SessionSnapshot } from "../types/session-snapshot.js";

export interface SessionEntry {
  state: AgentState;
  /** Unix timestamp (seconds) of the last event received for this session */
  ts: number;
  agent: AgentId | null;
  project: string | null;
  /** Active tool name when state === "working" (else null). */
  tool: string | null;
  /** Unix timestamp (seconds) when the current active streak started. */
  since: number;
  /** Condensed tool argument (e.g. "pnpm test" / "main.ts"). */
  toolInput: string | null;
  /** Full cwd path (vs `project`, the basename). */
  cwdFull: string | null;
  /** Notification text shown when state === "waiting". */
  message: string | null;
  /** Most recent user prompt (Claude only). */
  prompt: string | null;
}

/**
 * Optional enrichment fields, bundled into one object so `update()` keeps a
 * readable signature instead of a long positional argument list.
 */
export interface SessionInfo {
  toolInput?: string | null;
  cwdFull?: string | null;
  message?: string | null;
  prompt?: string | null;
}

export interface AggregateResult {
  /** Highest-priority state across all active sessions */
  effectiveState: AgentState;
  /** Number of active (non-expired) sessions */
  sessionCount: number;
  /** Entry with the highest-priority state (or most recent if tied) */
  latest: SessionEntry | null;
}

/** Priority order — lower index = higher priority. */
export const PRIORITY: AgentState[] = ["working", "waiting", "error", "done", "idle"];

export function statePriority(state: AgentState): number {
  const idx = PRIORITY.indexOf(state);
  return idx === -1 ? PRIORITY.length : idx;
}

/**
 * Comparator for ordering sessions in a list view: higher-priority state first,
 * then most-recent `ts` first when priorities tie. Works on any object carrying
 * `state` + `ts` (e.g. SessionSnapshot) so list/tooltip surfaces share one rule.
 */
export function compareByPriorityThenTs(
  a: { state: AgentState; ts: number },
  b: { state: AgentState; ts: number },
): number {
  const pa = statePriority(a.state);
  const pb = statePriority(b.state);
  if (pa !== pb) return pa - pb;
  return b.ts - a.ts;
}

/**
 * SessionTracker: maintains per-session state and aggregates to a single
 * effective state using priority policy. Designed to be pure (no DOM/Tauri deps)
 * so it can be unit-tested outside the browser context.
 */
export class SessionTracker {
  private readonly sessions = new Map<string, SessionEntry>();

  /**
   * Update (or insert) a session entry.
   * @param sessionId - unique session identifier from AgentEvent.session_id
   * @param state - new agent state
   * @param ts - Unix timestamp in seconds (from AgentEvent.ts)
   * @param agent - which agent emitted the event
   * @param project - project (cwd basename) from the event
   */
  update(
    sessionId: string,
    state: AgentState,
    ts: number,
    agent: AgentId | null,
    project: string | null,
    tool: string | null = null,
    info: SessionInfo = {},
  ): void {
    const prev = this.sessions.get(sessionId);
    // `since` marks when the current active streak started so the UI can show
    // "how long this turn has run". Reset for a brand-new session, or when work
    // resumes after a terminal state (done/error → working = a new turn). Keep
    // it across working↔waiting (same turn, e.g. paused for a permission grant).
    let since: number;
    if (!prev) {
      since = ts;
    } else if ((prev.state === "done" || prev.state === "error") && state === "working") {
      since = ts;
    } else {
      since = prev.since;
    }
    this.sessions.set(sessionId, {
      state,
      ts,
      agent,
      project,
      since,
      tool,
      toolInput: info.toolInput ?? null,
      cwdFull: info.cwdFull ?? null,
      message: info.message ?? null,
      prompt: info.prompt ?? null,
    });
  }

  /**
   * Snapshot of all tracked sessions for list/broadcast consumers.
   * Order is not guaranteed — callers sort (see compareByPriorityThenTs).
   */
  list(): SessionSnapshot[] {
    return Array.from(this.sessions.entries()).map(([sessionId, e]) => ({
      sessionId,
      agent: e.agent,
      project: e.project,
      state: e.state,
      tool: e.tool,
      since: e.since,
      ts: e.ts,
      toolInput: e.toolInput,
      cwdFull: e.cwdFull,
      message: e.message,
      prompt: e.prompt,
    }));
  }

  /**
   * Compute the aggregate view across all tracked sessions.
   * Returns effectiveState = highest-priority state in the active session map.
   * If there are no sessions, returns idle.
   */
  aggregate(): AggregateResult {
    if (this.sessions.size === 0) {
      return { effectiveState: "idle", sessionCount: 0, latest: null };
    }

    let bestPriority = Number.MAX_SAFE_INTEGER;
    let bestEntry: SessionEntry | null = null;

    for (const entry of this.sessions.values()) {
      const p = statePriority(entry.state);
      // Set bestEntry when:
      // - found a higher-priority state (lower p), OR
      // - tied priority but this entry is more recent (higher ts).
      // The `bestEntry !== null` guard was removed so the first entry at
      // any priority level is always captured (M1 fix).
      if (p < bestPriority || (p === bestPriority && entry.ts > (bestEntry?.ts ?? -1))) {
        bestPriority = p;
        bestEntry = entry;
      }
    }

    return {
      effectiveState: bestEntry?.state ?? "idle",
      sessionCount: this.sessions.size,
      latest: bestEntry,
    };
  }

  /**
   * Remove sessions that have not emitted an event within timeoutMs.
   * Uses nowMs (epoch ms) and converts session.ts (epoch seconds) for comparison.
   * @param nowMs - current time in milliseconds (e.g. Date.now())
   * @param timeoutMs - session expiry window in ms (default 5 minutes)
   * @returns true if any sessions were removed (caller should re-aggregate)
   */
  expireStale(nowMs: number, timeoutMs = 300_000): boolean {
    let removed = false;
    for (const [id, entry] of this.sessions) {
      const ageMs = nowMs - entry.ts * 1000;
      if (ageMs > timeoutMs) {
        this.sessions.delete(id);
        removed = true;
      }
    }
    return removed;
  }

  /** How many sessions are currently tracked (for testing). */
  get size(): number {
    return this.sessions.size;
  }

  /** Read a specific session entry (for testing / dedup). */
  get(sessionId: string): SessionEntry | undefined {
    return this.sessions.get(sessionId);
  }
}
