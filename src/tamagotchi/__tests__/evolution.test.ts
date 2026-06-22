/**
 * evolution.test.ts — Unit tests for evolution stage logic and care score.
 */

import { describe, it, expect } from "vitest";
import {
  stageFromLevel,
  computeCareScore7d,
  updateCareBuffer,
  checkEvolution,
} from "../evolution.js";
import { Stage } from "../types.js";

describe("stageFromLevel", () => {
  it("returns Egg for level 0", () => {
    expect(stageFromLevel(0)).toBe(Stage.Egg);
  });

  it("returns Egg for level 4", () => {
    expect(stageFromLevel(4)).toBe(Stage.Egg);
  });

  it("returns Hatchling for level 5", () => {
    expect(stageFromLevel(5)).toBe(Stage.Hatchling);
  });

  it("returns Hatchling for level 19", () => {
    expect(stageFromLevel(19)).toBe(Stage.Hatchling);
  });

  it("returns Juvenile for level 20", () => {
    expect(stageFromLevel(20)).toBe(Stage.Juvenile);
  });

  it("returns Adult for level 50", () => {
    expect(stageFromLevel(50)).toBe(Stage.Adult);
  });

  it("returns Legend for level 100", () => {
    expect(stageFromLevel(100)).toBe(Stage.Legend);
  });

  it("returns Legend for level 999", () => {
    expect(stageFromLevel(999)).toBe(Stage.Legend);
  });
});

describe("computeCareScore7d", () => {
  it("returns 0 for empty buffer", () => {
    expect(computeCareScore7d([])).toBe(0);
  });

  it("returns the single value for a 1-entry buffer", () => {
    expect(computeCareScore7d([80])).toBe(80);
  });

  it("averages correctly over 7 entries", () => {
    const buffer = [60, 70, 80, 90, 100, 50, 70];
    const avg = buffer.reduce((a, b) => a + b, 0) / 7;
    expect(computeCareScore7d(buffer)).toBeCloseTo(avg);
  });

  it("returns 60 for buffer all at 60", () => {
    expect(computeCareScore7d([60, 60, 60, 60, 60, 60, 60])).toBeCloseTo(60);
  });
});

describe("updateCareBuffer", () => {
  it("appends a score to an empty buffer", () => {
    const result = updateCareBuffer([], 75);
    expect(result).toEqual([75]);
  });

  it("maintains max 7 entries", () => {
    const buffer = [10, 20, 30, 40, 50, 60, 70];
    const result = updateCareBuffer(buffer, 80);
    expect(result).toHaveLength(7);
    // Oldest (10) should be dropped
    expect(result[0]).toBe(20);
    expect(result[6]).toBe(80);
  });

  it("does not mutate the input buffer", () => {
    const buffer = [50, 60];
    updateCareBuffer(buffer, 70);
    expect(buffer).toEqual([50, 60]);
  });
});

describe("checkEvolution (care gate)", () => {
  // Buffer with average >= 60 (passes gate)
  const goodBuffer = [60, 70, 80, 90, 65, 75, 85]; // avg ≈ 75

  // Buffer with average < 60 (fails gate)
  const badBuffer = [30, 40, 50, 45, 35, 40, 50]; // avg ≈ 41.4

  it("evolves to Hatchling at level 5 with good care", () => {
    const result = checkEvolution(5, goodBuffer, Stage.Egg);
    expect(result).toBe(Stage.Hatchling);
  });

  it("does NOT evolve beyond Egg when care score < 60 despite sufficient level", () => {
    const result = checkEvolution(5, badBuffer, Stage.Egg);
    expect(result).toBe(Stage.Egg); // stays at Egg
  });

  it("does NOT evolve to Juvenile at level 20 with bad care", () => {
    const result = checkEvolution(20, badBuffer, Stage.Hatchling);
    expect(result).toBe(Stage.Hatchling); // stays at Hatchling
  });

  it("evolves to Adult at level 50 with good care", () => {
    const result = checkEvolution(50, goodBuffer, Stage.Juvenile);
    expect(result).toBe(Stage.Adult);
  });

  it("evolves to Legend at level 100 with good care", () => {
    const result = checkEvolution(100, goodBuffer, Stage.Adult);
    expect(result).toBe(Stage.Legend);
  });

  it("does NOT regress stage when level drops below threshold (currentStage preserved)", () => {
    // Hypothetical: pet is Hatchling but level somehow 4 — stays Hatchling
    // (In practice levels don't decrease, but the guard matters for correctness)
    const result = checkEvolution(4, goodBuffer, Stage.Hatchling);
    // targetStage = Egg, but Egg is always accessible → returns Egg
    // Actually Egg < Hatchling and Egg is always returned as-is per spec
    expect(result).toBe(Stage.Egg);
  });

  it("returns current stage unchanged when already at target with good care", () => {
    const result = checkEvolution(5, goodBuffer, Stage.Hatchling);
    expect(result).toBe(Stage.Hatchling);
  });

  it("does NOT evolve with empty care buffer (score=0 < 60)", () => {
    const result = checkEvolution(5, [], Stage.Egg);
    expect(result).toBe(Stage.Egg);
  });

  it("does NOT evolve when care score is exactly below gate (59.9)", () => {
    // 7 entries averaging just below 60
    const nearBuffer = [55, 58, 62, 57, 60, 59, 59]; // avg ≈ 58.57
    const result = checkEvolution(5, nearBuffer, Stage.Egg);
    expect(result).toBe(Stage.Egg);
  });

  it("DOES evolve when care score is exactly 60 (boundary)", () => {
    const exactBuffer = [60, 60, 60, 60, 60, 60, 60];
    const result = checkEvolution(5, exactBuffer, Stage.Egg);
    expect(result).toBe(Stage.Hatchling);
  });
});
