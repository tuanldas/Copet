/**
 * agent-icon.test.ts — inline SVG brand mark per agent; "" for null/unknown.
 */

import { describe, it, expect } from "vitest";
import { agentIcon } from "../agent-icon.js";
import type { AgentId } from "../../../types/agent-event.js";

const AGENTS: AgentId[] = ["claude-code", "codex", "gemini", "wrapper"];

describe("agentIcon", () => {
  it("returns an inline svg for every known agent", () => {
    for (const a of AGENTS) {
      expect(agentIcon(a)).toContain("<svg");
      expect(agentIcon(a)).toContain("viewBox");
    }
  });

  it("returns empty string for null", () => {
    expect(agentIcon(null)).toBe("");
  });

  it("uses brand colours for the brand marks", () => {
    expect(agentIcon("claude-code")).toContain("#D97757");
    expect(agentIcon("codex")).toContain("#10A37F");
    expect(agentIcon("gemini")).toContain("#4285F4");
  });
});
