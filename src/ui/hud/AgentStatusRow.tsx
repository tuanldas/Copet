/**
 * AgentStatusRow.tsx — Agent state display row for the HUD (Phase 06).
 *
 * Shows: icon + agent name + state label + coloured dot.
 * Listens to 'agent-status-changed' Tauri event; falls back to "idle" on mount.
 * Colour of dot matches design-tokens agent-state accent palette.
 */

import { createSignal, onCleanup } from "solid-js";
import type { Component } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import type { AgentEvent, AgentState } from "../../types/agent-event.js";

/** Map AgentState → CSS variable name from design-tokens. */
const STATE_COLOR: Record<AgentState, string> = {
  working: "var(--color-state-working)",
  waiting: "var(--color-state-waiting)",
  done:    "var(--color-state-done)",
  idle:    "var(--color-state-idle)",
  error:   "var(--color-state-error)",
};

/** Human-readable label for each state (icon + text per accessibility rule). */
const STATE_LABEL: Record<AgentState, string> = {
  working: "⚙ Working",
  waiting: "⏳ Waiting",
  done:    "✓ Done",
  idle:    "– Idle",
  error:   "✕ Error",
};

const AgentStatusRow: Component = () => {
  const [event, setEvent] = createSignal<AgentEvent | null>(null);

  // Subscribe to agent-status-changed Tauri event.
  const unlistenPromise = listen<AgentEvent>("agent-status-changed", (e) => {
    setEvent(e.payload);
  });

  onCleanup(async () => {
    const unlisten = await unlistenPromise;
    unlisten();
  });

  const state = (): AgentState => event()?.state ?? "idle";
  const agentName = (): string => event()?.agent ?? "—";
  const project = (): string => event()?.project ?? "";
  const tool = (): string => event()?.tool ?? "";

  return (
    <div class="agent-row" aria-label={`Agent: ${agentName()}, ${STATE_LABEL[state()]}`}>
      {/* Status dot */}
      <span
        class="agent-dot"
        style={{ background: STATE_COLOR[state()] }}
        aria-hidden="true"
      />

      {/* Agent name */}
      <span class="agent-name" title={project() || agentName()}>
        {agentName()}
      </span>

      {/* State label with icon */}
      <span class="agent-state" style={{ color: STATE_COLOR[state()] }}>
        {STATE_LABEL[state()]}
      </span>

      {/* Tool name (mono, only when working) */}
      {tool() && (
        <span class="agent-tool" title={tool()}>
          {tool()}
        </span>
      )}
    </div>
  );
};

export default AgentStatusRow;
