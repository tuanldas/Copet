/**
 * agent-badge.test.ts — agentBadge mapping.
 */

import { describe, it, expect } from "vitest";
import { agentBadge } from "../agent-badge.js";

describe("agentBadge", () => {
  it("maps known agents to short labels", () => {
    expect(agentBadge("claude-code")).toBe("Claude");
    expect(agentBadge("codex")).toBe("Codex");
    expect(agentBadge("gemini")).toBe("Gemini");
    expect(agentBadge("wrapper")).toBe("run");
  });

  it("returns empty string for null agent", () => {
    expect(agentBadge(null)).toBe("");
  });
});
