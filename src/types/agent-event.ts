/**
 * Canonical AgentEvent types — TS mirror of `crates/copet-protocol/src/lib.rs`.
 *
 * KEEP IN SYNC with the Rust definitions. Any change to Agent, State, or
 * AgentEvent in Rust MUST be reflected here (and vice-versa).
 *
 * Wire format: the Tauri event `agent-status-changed` carries an AgentEvent
 * payload. Subscribe with:
 *
 *   import { listen } from "@tauri-apps/api/event";
 *   listen<AgentEvent>("agent-status-changed", (ev) => { ... });
 */

/** Which AI coding agent produced this event. Mirrors Rust enum `Agent`. */
export type AgentId = "claude-code" | "codex" | "gemini" | "wrapper";

/**
 * Canonical agent state. Mirrors Rust enum `State`.
 *
 * - working  : actively executing a tool or generating output
 * - waiting  : paused for user input or a permission grant
 * - done     : finished its turn successfully
 * - idle     : no active session
 * - error    : exited with non-zero code or fatal error
 */
export type AgentState = "working" | "waiting" | "done" | "idle" | "error";

/**
 * Canonical event payload — socket wire format AND Tauri event payload.
 * Mirrors Rust struct `AgentEvent`.
 */
export interface AgentEvent {
  /** Which agent emitted the event. */
  agent: AgentId;
  /** Unique session identifier provided by the agent CLI. */
  session_id: string;
  /** Current agent state. */
  state: AgentState;
  /** Active tool name when state === "working", otherwise null. */
  tool: string | null;
  /** `cwd` basename — tooltip text shown in the pet overlay. */
  project: string | null;

  // ── Enrichment (additive). The daemon re-serialises every event through the
  //    Rust struct, so these always arrive (null when the agent omits them). ──
  /** Condensed tool argument, e.g. a Bash command or edited file basename. */
  tool_input: string | null;
  /** Full `cwd` path (vs `project`, which is only the basename). */
  cwd_full: string | null;
  /** Notification text shown when state === "waiting" (e.g. permission prompt). */
  message: string | null;
  /** Most recent user prompt (Claude UserPromptSubmit). */
  prompt: string | null;

  // ── Transcript enrichment (Claude only, opt-in; null when disabled). ──
  /** Model id from the last assistant turn, e.g. "claude-opus-4-8". */
  model: string | null;
  /** Task title / summary (Claude's ai-title). */
  summary: string | null;
  /** Last assistant text message (truncated). */
  last_message: string | null;
  /** Input/context tokens of the last assistant turn (input + cache). */
  tokens_in: number | null;
  /** Output tokens of the last assistant turn. */
  tokens_out: number | null;

  /**
   * Session-termination signal (Claude SessionEnd — any reason: /clear, logout,
   * exit). When true, the pet window REMOVES this session from the tracker
   * instead of rendering its state, so /clear doesn't leave a stale "done"
   * session behind. Always present from the daemon (false for normal events).
   */
  ended: boolean;

  /** Unix timestamp in seconds. */
  ts: number;
}
