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
  /** Unix timestamp in seconds. */
  ts: number;
}
