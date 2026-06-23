/**
 * tooltip-render.test.ts — renderTooltipHtml row count, "+N more", escaping, theme.
 * Pure logic — no DOM/Tauri deps.
 */

import { describe, it, expect } from "vitest";
import { renderTooltipHtml } from "../tooltip-render.js";
import type { SessionSnapshot } from "../../types/session-snapshot.js";
import type { AgentState } from "../../types/agent-event.js";

const NOW = 1000;

function snap(state: AgentState, extra: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return { sessionId: "sid123", agent: "claude-code", project: "proj", state, since: NOW, ts: NOW, ...extra };
}

describe("renderTooltipHtml", () => {
  it("shows empty state when no sessions", () => {
    expect(renderTooltipHtml({ sessions: [], theme: "kitchen" }, NOW)).toContain("Chưa có session");
  });

  it("renders a row per session", () => {
    const sessions = [
      snap("working", { sessionId: "a", project: "pa" }),
      snap("waiting", { sessionId: "b", project: "pb" }),
      snap("done", { sessionId: "c", project: "pc" }),
    ];
    const html = renderTooltipHtml({ sessions, theme: "kitchen" }, NOW);
    expect(html).toContain("pa");
    expect(html).toContain("pb");
    expect(html).toContain("pc");
  });

  it("caps at 5 rows + '+N more'", () => {
    const sessions = Array.from({ length: 7 }, (_, i) =>
      snap("working", { sessionId: `s${i}`, project: `proj${i}` }),
    );
    const html = renderTooltipHtml({ sessions, theme: "kitchen" }, NOW);
    expect(html).toContain("+2 more");
    expect(html).not.toContain("proj6");
  });

  it("escapes HTML in project names", () => {
    const html = renderTooltipHtml({ sessions: [snap("working", { project: "<script>" })], theme: "kitchen" }, NOW);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("applies the selected theme labels", () => {
    const k = renderTooltipHtml({ sessions: [snap("working", { project: "p" })], theme: "kitchen" }, NOW);
    const g = renderTooltipHtml({ sessions: [snap("working", { project: "p" })], theme: "garden" }, NOW);
    expect(k).toContain("Cooking");
    expect(g).toContain("Growing");
  });

  it("formats duration from since", () => {
    const html = renderTooltipHtml(
      { sessions: [snap("working", { project: "p", since: NOW - 19 * 60 })], theme: "kitchen" },
      NOW,
    );
    expect(html).toContain("19m");
  });
});
