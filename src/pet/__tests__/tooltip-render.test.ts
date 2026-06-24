/**
 * tooltip-render.test.ts — renderTooltipHtml row markup (cpt-* classes), escaping,
 * theme, timer, command line, model/tokens meta. Pure logic — no DOM/Tauri deps.
 */

import { describe, it, expect } from "vitest";
import { renderTooltipHtml, hasActiveSessions } from "../tooltip-render.js";
import type { SessionSnapshot } from "../../types/session-snapshot.js";
import type { AgentState } from "../../types/agent-event.js";

const NOW = 1000;

function snap(state: AgentState, extra: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return { sessionId: "sid123", agent: "claude-code", project: "proj", state, tool: null, since: NOW, ts: NOW, ...extra };
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

  it("formats the prompt-runtime timer from since", () => {
    const html = renderTooltipHtml(
      { sessions: [snap("working", { project: "p", since: NOW - 19 * 60 })], theme: "kitchen" },
      NOW,
    );
    expect(html).toContain("19m");
    expect(html).toContain("cpt-timer");
  });

  it("shows the agent badge", () => {
    const html = renderTooltipHtml({ sessions: [snap("working", { project: "p" })], theme: "kitchen" }, NOW);
    expect(html).toContain("Claude");
    expect(html).toContain("cpt-badge");
  });

  it("marks the status dot with the session state", () => {
    const working = renderTooltipHtml({ sessions: [snap("working", { project: "p" })], theme: "kitchen" }, NOW);
    expect(working).toContain("cpt-dot--working");
    const waiting = renderTooltipHtml({ sessions: [snap("waiting", { project: "p" })], theme: "kitchen" }, NOW);
    expect(waiting).toContain("cpt-dot--waiting");
  });

  it("shows the active tool on its own command line only when working", () => {
    const working = renderTooltipHtml({ sessions: [snap("working", { project: "p", tool: "Bash" })], theme: "kitchen" }, NOW);
    expect(working).toContain("Bash");
    expect(working).toContain("cpt-cmd");
    const done = renderTooltipHtml({ sessions: [snap("done", { project: "p", tool: "Bash" })], theme: "kitchen" }, NOW);
    expect(done).not.toContain("Bash");
  });

  it("shows the enriched tool input next to the tool when working", () => {
    const html = renderTooltipHtml(
      { sessions: [snap("working", { project: "p", tool: "Bash", toolInput: "pnpm test" })], theme: "kitchen" },
      NOW,
    );
    expect(html).toContain("pnpm test");
    expect(html).toContain("cpt-tool");
  });

  it("shows the notification message in an ask command line only when waiting", () => {
    const waiting = renderTooltipHtml(
      { sessions: [snap("waiting", { project: "p", message: "needs permission for Bash" })], theme: "kitchen" },
      NOW,
    );
    expect(waiting).toContain("needs permission for Bash");
    expect(waiting).toContain("cpt-cmd--ask");
    const working = renderTooltipHtml(
      { sessions: [snap("working", { project: "p", message: "needs permission for Bash" })], theme: "kitchen" },
      NOW,
    );
    expect(working).not.toContain("needs permission for Bash");
  });

  it("drops the last-activity 'X trước' line", () => {
    const html = renderTooltipHtml(
      { sessions: [snap("working", { project: "p", ts: NOW - 30 })], theme: "kitchen" },
      NOW,
    );
    expect(html).not.toContain("trước");
  });

  it("puts the full cwd + prompt into the row title (hover) and escapes them", () => {
    const html = renderTooltipHtml(
      {
        sessions: [snap("working", { project: "p", cwdFull: "/Users/dev/<x>", prompt: "do a thing" })],
        theme: "kitchen",
      },
      NOW,
    );
    expect(html).toContain("/Users/dev/&lt;x&gt;");
    expect(html).toContain("&gt; do a thing"); // "> do a thing" with > escaped
    expect(html).not.toContain("<x>");
  });

  it("escapes HTML in enriched tool input", () => {
    const html = renderTooltipHtml(
      { sessions: [snap("working", { project: "p", tool: "Bash", toolInput: "<script>" })], theme: "kitchen" },
      NOW,
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("shows model (claude- prefix stripped) and compact tokens when present", () => {
    const html = renderTooltipHtml(
      {
        sessions: [snap("working", { project: "p", model: "claude-opus-4-8", tokensIn: 248000, tokensOut: 1219 })],
        theme: "kitchen",
      },
      NOW,
    );
    expect(html).toContain("opus-4-8");
    expect(html).not.toContain("claude-opus-4-8");
    expect(html).toContain("248k");
    expect(html).toContain("1.2k");
  });

  it("puts summary + last message into the hover title and escapes them", () => {
    const html = renderTooltipHtml(
      {
        sessions: [snap("working", { project: "p", summary: "Add <b>mode</b>", lastMessage: "all done" })],
        theme: "kitchen",
      },
      NOW,
    );
    expect(html).toContain("Add &lt;b&gt;mode&lt;/b&gt;");
    expect(html).toContain("all done");
    expect(html).not.toContain("<b>mode</b>");
  });

  it("omits the meta line entirely when no model/tokens (opt-in off)", () => {
    const html = renderTooltipHtml({ sessions: [snap("working", { project: "p" })], theme: "kitchen" }, NOW);
    expect(html).not.toContain("↑");
    expect(html).not.toContain("cpt-meta");
  });
});

describe("hasActiveSessions", () => {
  it("false khi không có session", () => {
    expect(hasActiveSessions([])).toBe(false);
  });

  it("false khi chỉ idle/done/error", () => {
    expect(hasActiveSessions([snap("idle"), snap("done"), snap("error")])).toBe(false);
  });

  it("true khi có working", () => {
    expect(hasActiveSessions([snap("done"), snap("working")])).toBe(true);
  });

  it("true khi có waiting", () => {
    expect(hasActiveSessions([snap("waiting")])).toBe(true);
  });
});
