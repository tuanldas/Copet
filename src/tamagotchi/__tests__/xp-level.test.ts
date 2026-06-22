/**
 * xp-level.test.ts — Unit tests for XP and level-up logic.
 */

import { describe, it, expect } from "vitest";
import { xpPerLevel, levelFromXp, addXp, xpWithinLevel } from "../xp-level.js";
import { defaultPetData } from "../types.js";

describe("xpPerLevel", () => {
  it("returns 100 for level 0", () => {
    expect(xpPerLevel(0)).toBe(100);
  });

  it("returns 150 for level 1", () => {
    expect(xpPerLevel(1)).toBe(150);
  });

  it("returns 759 for level 5", () => {
    // Math.round(100 * 1.5^5) = Math.round(100 * 7.59375) = Math.round(759.375) = 759
    expect(xpPerLevel(5)).toBe(759);
  });

  it("is monotonically increasing", () => {
    for (let i = 0; i < 10; i++) {
      expect(xpPerLevel(i + 1)).toBeGreaterThan(xpPerLevel(i));
    }
  });
});

describe("levelFromXp", () => {
  it("returns level 0 for 0 XP", () => {
    expect(levelFromXp(0)).toBe(0);
  });

  it("returns level 0 for 99 XP (just below level 1 threshold)", () => {
    expect(levelFromXp(99)).toBe(0);
  });

  it("returns level 1 for exactly 100 XP", () => {
    // xpPerLevel(0) = 100 → need 100 to reach level 1
    expect(levelFromXp(100)).toBe(1);
  });

  it("returns level 2 for 100 + 150 = 250 XP", () => {
    expect(levelFromXp(250)).toBe(2);
  });

  it("handles large XP values without errors", () => {
    expect(levelFromXp(100_000)).toBeGreaterThan(10);
  });
});

describe("addXp", () => {
  it("adds XP to a fresh pet", () => {
    const data = defaultPetData();
    const result = addXp(data, 50);
    expect(result.xp).toBe(50);
    expect(result.level).toBe(0); // 50 < 100 threshold
  });

  it("triggers level-up when XP crosses threshold", () => {
    const data = defaultPetData();
    const result = addXp(data, 100);
    expect(result.xp).toBe(100);
    expect(result.level).toBe(1);
  });

  it("handles multi-level-up in a single call", () => {
    const data = defaultPetData();
    // xpPerLevel(0)=100, xpPerLevel(1)=150 → need 250 for level 2
    const result = addXp(data, 300);
    expect(result.level).toBe(2);
    expect(result.xp).toBe(300);
  });

  it("floors XP at 0 when penalty exceeds current XP", () => {
    const data = { ...defaultPetData(), xp: 5 };
    const result = addXp(data, -50);
    expect(result.xp).toBe(0);
    expect(result.level).toBe(0);
  });

  it("does not mutate the input data object", () => {
    const data = defaultPetData();
    addXp(data, 200);
    expect(data.xp).toBe(0);
    expect(data.level).toBe(0);
  });

  it("accumulates XP across multiple addXp calls", () => {
    let data = defaultPetData();
    data = addXp(data, 50);  // 50 xp, level 0
    data = addXp(data, 50);  // 100 xp, level 1
    expect(data.xp).toBe(100);
    expect(data.level).toBe(1);
    data = addXp(data, 150); // 250 xp, level 2
    expect(data.level).toBe(2);
  });
});

describe("xpWithinLevel", () => {
  it("returns 0 for 0 total XP", () => {
    expect(xpWithinLevel(0)).toBe(0);
  });

  it("returns 50 when 50 XP into level 0 (threshold 100)", () => {
    expect(xpWithinLevel(50)).toBe(50);
  });

  it("returns 0 when exactly at level threshold", () => {
    // 100 XP = exactly level 1, 0 XP within level 1
    expect(xpWithinLevel(100)).toBe(0);
  });

  it("returns correct remainder within level 1", () => {
    // 100 + 75 = 175; level 1 threshold = 150 → 25 within level 1... wait:
    // level 0 costs 100, level 1 costs 150. At 175 xp: 175-100=75 remaining,
    // 75 < 150 so still level 1 with 75 within.
    expect(xpWithinLevel(175)).toBe(75);
  });
});
