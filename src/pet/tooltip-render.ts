/**
 * tooltip-render.ts — pure HTML builder for the pet tooltip session list.
 *
 * No DOM/Tauri deps so it can be unit-tested directly. Shows up to MAX_ROWS
 * sessions (sorted by the shared comparator) + a "+N more" line when truncated.
 */

import type { SessionSnapshot, LabelTheme } from "../types/session-snapshot.js";
import { getStateLabel } from "../agent-bridge/state-labels.js";
import { formatDuration } from "../ui/shared/session-duration.js";
import { sortSessions, displayName } from "../ui/shared/session-list-model.js";

/** Data shown in the tooltip overlay. */
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

/** Build the tooltip inner HTML for the given data + clock (epoch seconds). */
export function renderTooltipHtml(data: TooltipData, nowSeconds: number): string {
  const sessions = sortSessions(data.sessions);
  if (sessions.length === 0) {
    return `<div style="opacity:0.8">Chưa có session nào</div>`;
  }

  const rows = sessions.slice(0, TOOLTIP_MAX_ROWS).map((s) => {
    const label = getStateLabel(data.theme, s.state);
    const name = escHtml(displayName(s));
    const time = formatDuration(nowSeconds - s.since);
    return (
      `<div style="display:flex;gap:6px;justify-content:space-between">` +
      `<span>${escHtml(label.emoji)} ${name}</span>` +
      `<span style="opacity:0.7">${escHtml(label.text)} · ${time}</span>` +
      `</div>`
    );
  });

  if (sessions.length > TOOLTIP_MAX_ROWS) {
    rows.push(`<div style="opacity:0.6">+${sessions.length - TOOLTIP_MAX_ROWS} more</div>`);
  }

  return rows.join("");
}
