/**
 * tooltip-render.ts — pure HTML builder for the pet session panel.
 *
 * No DOM/Tauri deps so it can be unit-tested directly. Each session is a 2-line
 * row: line 1 = agent badge + name + running duration; line 2 = state label +
 * active tool (when working) + last-activity. Shows up to MAX_ROWS + "+N more".
 */

import type { SessionSnapshot, LabelTheme } from "../types/session-snapshot.js";
import { getStateLabel } from "../agent-bridge/state-labels.js";
import { formatDuration } from "../ui/shared/session-duration.js";
import { sortSessions, displayName } from "../ui/shared/session-list-model.js";
import { agentBadge } from "../ui/shared/agent-badge.js";
import { formatTokens, shortModel } from "../ui/shared/session-format.js";

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

/** Build the panel inner HTML for the given data + clock (epoch seconds). */
export function renderTooltipHtml(data: TooltipData, nowSeconds: number): string {
  const sessions = sortSessions(data.sessions);
  if (sessions.length === 0) {
    return `<div style="opacity:0.8">Chưa có session nào</div>`;
  }

  const rows = sessions.slice(0, TOOLTIP_MAX_ROWS).map((s) => {
    const label = getStateLabel(data.theme, s.state);
    const name = escHtml(displayName(s));
    const badge = escHtml(agentBadge(s.agent));
    const dur = formatDuration(nowSeconds - s.since);
    const act = formatDuration(nowSeconds - s.ts);
    // Enriched tool line: "Bash: pnpm test" when tool_input is present, else
    // just the bare tool name (keeps the compact panel from getting noisy).
    const toolPart =
      s.state === "working"
        ? s.toolInput
          ? ` · ${s.tool ? escHtml(s.tool) + ": " : ""}${escHtml(s.toolInput)}`
          : s.tool
            ? ` · ${escHtml(s.tool)}`
            : ""
        : "";
    // Why a session is paused (permission/idle prompt), shown only when waiting.
    const messagePart = s.state === "waiting" && s.message ? ` · ${escHtml(s.message)}` : "";
    const badgePart = badge ? `<b style="opacity:0.55">${badge}</b> ` : "";
    // Transcript enrichment (opt-in): model + tokens on a compact meta line;
    // summary + last message go into the hover title to keep the panel tight.
    const modelPart = s.model ? escHtml(shortModel(s.model)) : "";
    const tokensPart =
      s.tokensIn != null || s.tokensOut != null
        ? `${modelPart ? " · " : ""}↑${formatTokens(s.tokensIn ?? 0)} ↓${formatTokens(s.tokensOut ?? 0)}`
        : "";
    const metaLine =
      modelPart || tokensPart
        ? `<div style="opacity:0.5;font-size:11px">${modelPart}${tokensPart}</div>`
        : "";
    // Full cwd + last prompt + summary + last message go into the row title
    // (hover) to keep the pet panel tight while still exposing the detail.
    const titleBits = [displayName(s)];
    if (s.cwdFull) titleBits.push(s.cwdFull);
    if (s.prompt) titleBits.push(`> ${s.prompt}`);
    if (s.summary) titleBits.push(`≡ ${s.summary}`);
    if (s.lastMessage) titleBits.push(s.lastMessage);
    const title = escHtml(titleBits.join("\n"));
    return (
      `<div style="margin-bottom:3px">` +
      `<div style="display:flex;gap:6px;justify-content:space-between">` +
      `<span title="${title}">${badgePart}${name}</span>` +
      `<span style="opacity:0.7">${dur}</span>` +
      `</div>` +
      `<div style="opacity:0.6;font-size:11px">${escHtml(label.emoji)} ${escHtml(label.text)}${toolPart}${messagePart} · ${act} trước</div>` +
      metaLine +
      `</div>`
    );
  });

  if (sessions.length > TOOLTIP_MAX_ROWS) {
    rows.push(`<div style="opacity:0.6">+${sessions.length - TOOLTIP_MAX_ROWS} more</div>`);
  }

  return rows.join("");
}
