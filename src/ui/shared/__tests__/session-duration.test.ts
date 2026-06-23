/**
 * session-duration.test.ts — formatDuration bucketing + guards.
 * Pure logic — no DOM/Tauri deps.
 */

import { describe, it, expect } from "vitest";
import { formatDuration } from "../session-duration.js";

describe("formatDuration", () => {
  it("formats seconds", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(7)).toBe("7s");
    expect(formatDuration(59)).toBe("59s");
  });

  it("formats minutes", () => {
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(1140)).toBe("19m");
    expect(formatDuration(3599)).toBe("59m");
  });

  it("formats hours", () => {
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(86399)).toBe("23h");
  });

  it("formats days", () => {
    expect(formatDuration(86400)).toBe("1d");
  });

  it("guards negative / non-finite → 0s", () => {
    expect(formatDuration(-5)).toBe("0s");
    expect(formatDuration(NaN)).toBe("0s");
    expect(formatDuration(Infinity)).toBe("0s");
  });
});
