/**
 * SessionList.tsx — presentational list of running agent sessions.
 *
 * Pure props (sessions / theme / now accessors) so HUD, tray popover, and the
 * pet panel reuse it. Each row is 2 lines: agent badge + name + running
 * duration, then state label + active tool (when working) + last activity.
 */

import { For, Show } from "solid-js";
import type { Accessor, Component } from "solid-js";
import type { SessionSnapshot, LabelTheme } from "../../types/session-snapshot.js";
import type { AgentState } from "../../types/agent-event.js";
import { getStateLabel } from "../../agent-bridge/state-labels.js";
import { formatDuration } from "./session-duration.js";
import { agentBadge } from "./agent-badge.js";
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
            const dur = () => formatDuration(props.now() - s.since);
            const act = () => formatDuration(props.now() - s.ts);
            // Hover title exposes the full cwd without widening the row.
            const nameTitle = () => {
              const parts = [displayName(s)];
              if (s.cwdFull) parts.push(s.cwdFull);
              return parts.join("\n");
            };
            // Rich third line: the concrete command/file while working, else the
            // most recent user prompt. Empty string → the line is not rendered.
            const detail = () => {
              if (s.state === "working" && s.toolInput) return s.toolInput;
              if (s.prompt) return `> ${s.prompt}`;
              return "";
            };
            return (
              <div class={`session-row${isFaded(s.state) ? " is-faded" : ""}`} role="listitem">
                <span
                  class="session-dot"
                  style={{ background: STATE_COLOR[s.state] ?? "var(--color-state-idle)" }}
                  aria-hidden="true"
                />
                <div class="session-main">
                  <div class="session-line1">
                    <Show when={agentBadge(s.agent)}>
                      <span class="session-badge">{agentBadge(s.agent)}</span>
                    </Show>
                    <span class="session-name" title={nameTitle()}>
                      {displayName(s)}
                    </span>
                    <span class="session-time">{dur()}</span>
                  </div>
                  <div class="session-sub">
                    <span class="session-label">
                      {label().emoji} {label().text}
                    </span>
                    <Show when={s.state === "working" && s.tool}>
                      <span class="session-tool">· {s.tool}</span>
                    </Show>
                    <Show when={s.state === "waiting" && s.message}>
                      <span class="session-message">· {s.message}</span>
                    </Show>
                    <span class="session-activity">· {act()} trước</span>
                  </div>
                  <Show when={detail()}>
                    <div class="session-detail" title={detail()}>
                      {detail()}
                    </div>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
      </Show>
    </div>
  );
};

export default SessionList;
