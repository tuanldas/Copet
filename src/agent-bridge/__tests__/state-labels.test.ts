/**
 * state-labels.test.ts — getStateLabel covers 3 themes × 5 states + guards.
 * Pure logic — no DOM/Tauri deps.
 */

import { describe, it, expect } from "vitest";
import { getStateLabel, LABEL_THEMES } from "../state-labels.js";
import type { AgentState } from "../../types/agent-event.js";
import type { LabelTheme } from "../../types/session-snapshot.js";

const STATES: AgentState[] = ["working", "waiting", "done", "idle", "error"];

describe("getStateLabel", () => {
  it("returns non-empty text + emoji for every theme × state", () => {
    for (const theme of LABEL_THEMES) {
      for (const state of STATES) {
        const label = getStateLabel(theme, state);
        expect(label.text.length).toBeGreaterThan(0);
        expect(label.emoji.length).toBeGreaterThan(0);
      }
    }
  });

  it("spot-checks known labels", () => {
    expect(getStateLabel("kitchen", "working")).toEqual({ text: "Cooking", emoji: "🍳" });
    expect(getStateLabel("garden", "done")).toEqual({ text: "Bloomed", emoji: "🌸" });
    expect(getStateLabel("mood", "error")).toEqual({ text: "Sad", emoji: "😢" });
  });

  it("falls back to kitchen for an unknown theme (no throw)", () => {
    expect(getStateLabel("bogus" as LabelTheme, "working")).toEqual({ text: "Cooking", emoji: "🍳" });
  });

  it("falls back gracefully for an unknown state (no throw)", () => {
    const label = getStateLabel("kitchen", "nope" as AgentState);
    expect(label.text.length).toBeGreaterThan(0);
    expect(label.emoji.length).toBeGreaterThan(0);
  });

  it("handles undefined theme without throwing", () => {
    expect(() => getStateLabel(undefined as unknown as LabelTheme, "working")).not.toThrow();
  });
});
