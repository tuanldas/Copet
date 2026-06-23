/**
 * session-counts.test.ts — countRunning over session snapshots.
 */

import { describe, it, expect } from "vitest";
import { countRunning } from "../session-counts.js";
import type { SessionSnapshot } from "../../../types/session-snapshot.js";
import type { AgentState } from "../../../types/agent-event.js";

function snap(state: AgentState, id: string): SessionSnapshot {
  return { sessionId: id, agent: "claude-code", project: "p", state, tool: null, since: 0, ts: 0 };
}

describe("countRunning", () => {
  it("counts only working sessions", () => {
    const list = [snap("working", "a"), snap("waiting", "b"), snap("working", "c"), snap("done", "d")];
    expect(countRunning(list)).toBe(2);
  });

  it("returns 0 for empty list", () => {
    expect(countRunning([])).toBe(0);
  });

  it("returns 0 when none are working", () => {
    expect(countRunning([snap("idle", "a"), snap("done", "b")])).toBe(0);
  });
});
