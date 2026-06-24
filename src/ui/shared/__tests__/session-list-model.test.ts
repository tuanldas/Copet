/**
 * session-list-model.test.ts — sort/faded/displayName pure logic.
 */

import { describe, it, expect } from "vitest";
import { sortSessions, isFaded, displayName } from "../session-list-model.js";
import type { SessionSnapshot } from "../../../types/session-snapshot.js";
import type { AgentState } from "../../../types/agent-event.js";

function snap(
  state: AgentState,
  extra: Partial<SessionSnapshot> = {},
): SessionSnapshot {
  return { sessionId: "x", agent: "claude-code", project: "proj", state, tool: null, since: 0, ts: 0, ...extra };
}

describe("sortSessions", () => {
  it("orders by priority working>waiting>error>done>idle", () => {
    const list = [
      snap("idle", { sessionId: "i" }),
      snap("done", { sessionId: "d" }),
      snap("error", { sessionId: "e" }),
      snap("waiting", { sessionId: "w" }),
      snap("working", { sessionId: "k" }),
    ];
    expect(sortSessions(list).map((s) => s.state)).toEqual([
      "working", "waiting", "error", "done", "idle",
    ]);
  });

  it("newer ts first when same priority", () => {
    const list = [
      snap("working", { sessionId: "old", ts: 100 }),
      snap("working", { sessionId: "new", ts: 200 }),
    ];
    expect(sortSessions(list).map((s) => s.sessionId)).toEqual(["new", "old"]);
  });

  it("does not mutate input", () => {
    const list = [snap("done", { sessionId: "d" }), snap("working", { sessionId: "w" })];
    const copy = [...list];
    sortSessions(list);
    expect(list).toEqual(copy);
  });
});

describe("isFaded", () => {
  it("done/idle faded; working/waiting/error not", () => {
    expect(isFaded("done")).toBe(true);
    expect(isFaded("idle")).toBe(true);
    expect(isFaded("working")).toBe(false);
    expect(isFaded("waiting")).toBe(false);
    expect(isFaded("error")).toBe(false);
  });
});

describe("displayName", () => {
  it("uses project when present", () => {
    expect(displayName(snap("working", { project: "copet" }))).toBe("copet");
  });

  it("falls back to short session id when project is null", () => {
    expect(displayName(snap("working", { project: null, sessionId: "abcdef123" }))).toBe("abcdef");
  });
});
