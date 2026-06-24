/**
 * tooltip-render.ts — pure HTML builder for the pet session panel.
 *
 * No DOM/Tauri deps so it can be unit-tested directly. Emits semantic `cpt-*`
 * classes only (colours/fonts live in the scoped stylesheet injected by
 * pet-tooltip.ts). Each session is a compact card: header (status dot + agent
 * brand icon + name + prompt-runtime timer), a state-label line, and an optional
 * command line (tool+input while working / permission message while waiting).
 * Shows up to MAX_ROWS + "+N more".
 */

import type { SessionSnapshot, LabelTheme } from "../types/session-snapshot.js";
import { getStateLabel } from "../agent-bridge/state-labels.js";
import { formatDuration } from "../ui/shared/session-duration.js";
import { sortSessions, displayName } from "../ui/shared/session-list-model.js";
import { agentIcon } from "../ui/shared/agent-icon.js";
import { toolPhrase } from "./activity-phrases.js";

/** Data shown in the panel. */
export interface TooltipData {
  sessions: SessionSnapshot[];
  theme: LabelTheme;
}

/** Max session rows before collapsing into "+N more". */
export const TOOLTIP_MAX_ROWS = 5;

/** Escape user-controlled text before interpolating into innerHTML. */
export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Panel chỉ hiển thị khi có ≥1 session đang cần chú ý (working/waiting).
 * Hàm thuần (không DOM) để pet-tooltip.ts toggle display + unit-test trực tiếp.
 */
export function hasActiveSessions(sessions: SessionSnapshot[]): boolean {
  return sessions.some((s) => s.state === "working" || s.state === "waiting");
}

/**
 * Build the command line for a row: tool (+ enriched input) while working, the
 * permission message while waiting, empty otherwise. Tool name is wrapped so the
 * stylesheet can accent it; everything agent-controlled is escaped.
 */
function commandLine(s: SessionSnapshot): string {
  if (s.state === "working" && s.tool) {
    // A friendly themed phrase ("Bash" → "Compiling…") replaces the raw tool name;
    // tool_input (command / description / file) stays as the specific detail.
    // Seeded by sessionId so the phrase is stable per session across re-renders.
    const phrase = toolPhrase(s.tool, s.toolInput ?? undefined, s.sessionId);
    const label = `<span class="cpt-tool">${escHtml(phrase)}</span>`;
    return s.toolInput
      ? `<div class="cpt-cmd">${label} · ${escHtml(s.toolInput)}</div>`
      : `<div class="cpt-cmd">${label}</div>`;
  }
  if (s.state === "waiting") {
    // Permission/notification text wins; else the assistant's own question
    // (lastMessage) — the narration that flipped this session to "waiting"
    // via question-detection (Codex inline / Claude transcript).
    const ask = s.message ?? s.lastMessage;
    if (ask) return `<div class="cpt-cmd cpt-cmd--ask">${escHtml(ask)}</div>`;
  }
  return "";
}

/**
 * Hover title: full cwd + last prompt + summary + last message, escaped. Kept to
 * preserve the detail (panel stays compact); shown by the browser on hover.
 */
function hoverTitle(s: SessionSnapshot): string {
  const bits = [displayName(s)];
  if (s.cwdFull) bits.push(s.cwdFull);
  if (s.prompt) bits.push(`> ${s.prompt}`);
  if (s.summary) bits.push(`≡ ${s.summary}`);
  if (s.lastMessage) bits.push(s.lastMessage);
  return escHtml(bits.join("\n"));
}

/** Build the panel inner HTML for the given data + clock (epoch seconds). */
export function renderTooltipHtml(data: TooltipData, nowSeconds: number): string {
  const sessions = sortSessions(data.sessions);
  if (sessions.length === 0) {
    return `<div class="cpt-empty">Chưa có session nào</div>`;
  }

  const rows = sessions.slice(0, TOOLTIP_MAX_ROWS).map((s) => {
    const label = getStateLabel(data.theme, s.state);
    const name = escHtml(displayName(s));
    // Agent brand icon (trusted SVG keyed by enum — not escaped). State colour is
    // carried separately by the status dot.
    const badge = agentIcon(s.agent);
    // Prompt-runtime: how long the current turn has run (since = turn start).
    const dur = formatDuration(nowSeconds - s.since);
    const badgePart = badge ? `<span class="cpt-badge" data-agent="${s.agent}">${badge}</span>` : "";

    return (
      `<div class="cpt-row cpt-row--${s.state}">` +
        `<div class="cpt-head">` +
          `<span class="cpt-dot cpt-dot--${s.state}"></span>` +
          badgePart +
          `<span class="cpt-name" title="${hoverTitle(s)}">${name}</span>` +
          `<span class="cpt-state cpt-state--${s.state}">${escHtml(label.emoji)} ${escHtml(label.text)}</span>` +
          `<span class="cpt-timer">${dur}</span>` +
        `</div>` +
        commandLine(s) +
      `</div>`
    );
  });

  if (sessions.length > TOOLTIP_MAX_ROWS) {
    rows.push(`<div class="cpt-more">+${sessions.length - TOOLTIP_MAX_ROWS} more</div>`);
  }

  return rows.join("");
}
