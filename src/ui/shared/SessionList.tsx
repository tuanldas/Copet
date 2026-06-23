/**
 * SessionList.tsx — presentational list of running agent sessions.
 *
 * Pure props (sessions / theme / now accessors) so HUD and tray popover reuse
 * it without duplicating subscription logic. Sorting, fading, and labels come
 * from shared helpers.
 */

import { For, Show } from "solid-js";
import type { Accessor, Component } from "solid-js";
import type { SessionSnapshot, LabelTheme } from "../../types/session-snapshot.js";
import type { AgentState } from "../../types/agent-event.js";
import { getStateLabel } from "../../agent-bridge/state-labels.js";
import { formatDuration } from "./session-duration.js";
import { sortSessions, isFaded, displayName } from "./session-list-model.js";

/** AgentState → design-token colour variable (matches the rest of the HUD). */
const STATE_COLOR: Record<AgentState, string> = {
  working: "var(--color-state-working)",
  waiting: "var(--color-state-waiting)",
  done: "var(--color-state-done)",
  idle: "var(--color-state-idle)",
  error: "var(--color-state-error)",
};

interface SessionListProps {
  sessions: Accessor<SessionSnapshot[]>;
  theme: Accessor<LabelTheme>;
  now: Accessor<number>;
}

const SessionList: Component<SessionListProps> = (props) => {
  const sorted = (): SessionSnapshot[] => sortSessions(props.sessions());

  return (
    <div class="session-list" role="list" aria-label="Running sessions">
      <Show
        when={sorted().length > 0}
        fallback={<div class="session-empty">Chưa có session nào</div>}
      >
        <For each={sorted()}>
          {(s) => {
            const label = () => getStateLabel(props.theme(), s.state);
            const elapsed = () => formatDuration(props.now() - s.since);
            return (
              <div
                class={`session-row${isFaded(s.state) ? " is-faded" : ""}`}
                role="listitem"
              >
                <span
                  class="session-dot"
                  style={{ background: STATE_COLOR[s.state] ?? "var(--color-state-idle)" }}
                  aria-hidden="true"
                />
                <span class="session-name" title={displayName(s)}>
                  {displayName(s)}
                </span>
                <span class="session-label">
                  {label().emoji} {label().text}
                </span>
                <span class="session-time">{elapsed()}</span>
              </div>
            );
          }}
        </For>
      </Show>
    </div>
  );
};

export default SessionList;
