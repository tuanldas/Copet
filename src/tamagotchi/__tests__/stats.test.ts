/**
 * stats.test.ts — Unit tests for applyDecay and related helpers.
 */

import { describe, it, expect } from "vitest";
import { applyDecay, hasStatAtZero, computeDailyCareScore } from "../stats.js";
import type { Stats } from "../types.js";

const FULL: Stats = { hunger: 100, energy: 100, happiness: 100, hygiene: 100 };

describe("applyDecay", () => {
  it("applies correct decay rates for 1 minute", () => {
    const result = applyDecay(FULL, 1);
    expect(result.hunger).toBeCloseTo(99.5);
    expect(result.energy).toBeCloseTo(99.7);
    expect(result.happiness).toBeCloseTo(99.6);
    expect(result.hygiene).toBeCloseTo(99.8);
  });

  it("applies decay over 10 minutes", () => {
    const result = applyDecay(FULL, 10);
    expect(result.hunger).toBeCloseTo(95);
    expect(result.energy).toBeCloseTo(97);
    expect(result.happiness).toBeCloseTo(96);
    expect(result.hygiene).toBeCloseTo(98);
  });

  it("clamps stats to 0 when decay exceeds current value", () => {
    const low: Stats = { hunger: 1, energy: 1, happiness: 1, hygiene: 1 };
    const result = applyDecay(low, 10);
    expect(result.hunger).toBe(0);
    expect(result.energy).toBe(0);
    expect(result.happiness).toBe(0);
    expect(result.hygiene).toBe(0);
  });

  it("never produces values above 100", () => {
    const result = applyDecay(FULL, 0);
    expect(result.hunger).toBe(100);
    expect(result.energy).toBe(100);
    expect(result.happiness).toBe(100);
    expect(result.hygiene).toBe(100);
  });

  it("applies happiness ×1.5 multiplier when hunger < 30", () => {
    const stats: Stats = { hunger: 20, energy: 100, happiness: 100, hygiene: 100 };
    const result = applyDecay(stats, 1);
    // happiness decay = 0.4 * 1.5 = 0.6
    expect(result.happiness).toBeCloseTo(99.4);
    // hunger < 30 does NOT affect energy/hygiene
    expect(result.energy).toBeCloseTo(99.7);
    expect(result.hygiene).toBeCloseTo(99.8);
  });

  it("does NOT apply ×1.5 multiplier when hunger is exactly 30", () => {
    const stats: Stats = { hunger: 30, energy: 100, happiness: 100, hygiene: 100 };
    const result = applyDecay(stats, 1);
    // hunger === 30 is NOT < 30, so normal decay
    expect(result.happiness).toBeCloseTo(99.6);
  });

  it("treats negative minutes as 0 (clock-skew guard)", () => {
    const result = applyDecay(FULL, -5);
    expect(result.hunger).toBe(100);
    expect(result.energy).toBe(100);
    expect(result.happiness).toBe(100);
    expect(result.hygiene).toBe(100);
  });

  it("does not mutate the input stats object", () => {
    const stats: Stats = { hunger: 80, energy: 80, happiness: 80, hygiene: 80 };
    applyDecay(stats, 10);
    expect(stats.hunger).toBe(80);
    expect(stats.energy).toBe(80);
  });

  it("hunger<30 multiplier applies for the full duration (evaluated at start stats)", () => {
    // hunger=25, apply 60 minutes: should decay faster on happiness
    const stats: Stats = { hunger: 25, energy: 100, happiness: 100, hygiene: 100 };
    const result = applyDecay(stats, 60);
    // happiness decay = 0.4 * 1.5 * 60 = 36 → 100 - 36 = 64
    expect(result.happiness).toBeCloseTo(64);
    // hunger decay = 0.5 * 60 = 30 → 25 - 30 < 0 → clamped to 0
    expect(result.hunger).toBe(0);
  });
});

describe("hasStatAtZero", () => {
  it("returns false when all stats > 0", () => {
    expect(hasStatAtZero(FULL)).toBe(false);
  });

  it("returns true when hunger is 0", () => {
    expect(hasStatAtZero({ ...FULL, hunger: 0 })).toBe(true);
  });

  it("returns true when energy is 0", () => {
    expect(hasStatAtZero({ ...FULL, energy: 0 })).toBe(true);
  });

  it("returns true when happiness is 0", () => {
    expect(hasStatAtZero({ ...FULL, happiness: 0 })).toBe(true);
  });

  it("returns true when hygiene is 0", () => {
    expect(hasStatAtZero({ ...FULL, hygiene: 0 })).toBe(true);
  });
});

describe("computeDailyCareScore", () => {
  it("averages hunger+energy+happiness (not hygiene)", () => {
    const stats: Stats = { hunger: 90, energy: 60, happiness: 30, hygiene: 0 };
    // (90+60+30)/3 = 60
    expect(computeDailyCareScore(stats)).toBeCloseTo(60);
  });

  it("returns 100 when all relevant stats are 100", () => {
    expect(computeDailyCareScore(FULL)).toBeCloseTo(100);
  });

  it("returns 0 when relevant stats are all 0", () => {
    const stats: Stats = { hunger: 0, energy: 0, happiness: 0, hygiene: 100 };
    expect(computeDailyCareScore(stats)).toBe(0);
  });
});
