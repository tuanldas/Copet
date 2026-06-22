/**
 * offline-decay.test.ts — Unit tests for offline gap decay calculation.
 */

import { describe, it, expect } from "vitest";
import { applyOfflineDecay } from "../offline-decay.js";
import type { Stats } from "../types.js";

const FULL: Stats = { hunger: 100, energy: 100, happiness: 100, hygiene: 100 };

const MIN_MS = 60_000; // 1 minute in ms

describe("applyOfflineDecay", () => {
  it("applies no decay for 0 minutes offline", () => {
    const now = Date.now();
    const result = applyOfflineDecay(now, now, FULL);
    expect(result.waitedMinutes).toBe(0);
    expect(result.newStats.hunger).toBe(100);
    expect(result.newStats.energy).toBe(100);
    expect(result.newStats.happiness).toBe(100);
    expect(result.newStats.hygiene).toBe(100);
  });

  it("applies correct decay for 10 minutes offline", () => {
    const now = Date.now();
    const lastSaved = now - 10 * MIN_MS;
    const result = applyOfflineDecay(lastSaved, now, FULL);
    expect(result.waitedMinutes).toBe(10);
    expect(result.newStats.hunger).toBeCloseTo(95);   // 100 - 0.5*10
    expect(result.newStats.energy).toBeCloseTo(97);   // 100 - 0.3*10
    expect(result.newStats.hygiene).toBeCloseTo(98);  // 100 - 0.2*10
  });

  it("caps decay at 120 minutes for 5 hours offline", () => {
    const now = Date.now();
    const fiveHoursAgo = now - 5 * 60 * MIN_MS; // 300 minutes
    const result = applyOfflineDecay(fiveHoursAgo, now, FULL);

    // waitedMinutes should reflect actual time (300 rounded)
    expect(result.waitedMinutes).toBe(300);

    // But decay only applied for 120 minutes
    expect(result.newStats.hunger).toBeCloseTo(100 - 0.5 * 120); // 40
    expect(result.newStats.energy).toBeCloseTo(100 - 0.3 * 120); // 64
    expect(result.newStats.hygiene).toBeCloseTo(100 - 0.2 * 120); // 76
  });

  it("caps decay at 120 minutes for exactly 2 hours offline", () => {
    const now = Date.now();
    const twoHoursAgo = now - 120 * MIN_MS;
    const result = applyOfflineDecay(twoHoursAgo, now, FULL);
    expect(result.waitedMinutes).toBe(120);
    expect(result.newStats.hunger).toBeCloseTo(40);
  });

  it("caps decay at 120 minutes for 24 hours offline", () => {
    const now = Date.now();
    const yesterday = now - 24 * 60 * MIN_MS;
    const result = applyOfflineDecay(yesterday, now, FULL);
    // Decay still capped at 120 min
    expect(result.newStats.hunger).toBeCloseTo(100 - 0.5 * 120); // 40
  });

  it("handles clock skew (negative offline time) gracefully → 0 decay", () => {
    const now = Date.now();
    // lastSaved is in the future (clock jumped back)
    const future = now + 10 * MIN_MS;
    const result = applyOfflineDecay(future, now, FULL);
    expect(result.waitedMinutes).toBe(0);
    expect(result.newStats.hunger).toBe(100);
    expect(result.newStats.energy).toBe(100);
  });

  it("clamps decayed stats to 0 when offline decay is large", () => {
    const low: Stats = { hunger: 1, energy: 1, happiness: 1, hygiene: 1 };
    const now = Date.now();
    const longAgo = now - 5 * 60 * MIN_MS; // 5 hours → capped 120 min
    const result = applyOfflineDecay(longAgo, now, low);
    expect(result.newStats.hunger).toBe(0);
    expect(result.newStats.energy).toBe(0);
    expect(result.newStats.happiness).toBe(0);
    expect(result.newStats.hygiene).toBe(0);
  });

  it("applies hunger<30 happiness multiplier during offline decay", () => {
    const stats: Stats = { hunger: 20, energy: 100, happiness: 100, hygiene: 100 };
    const now = Date.now();
    const tenMinAgo = now - 10 * MIN_MS;
    const result = applyOfflineDecay(tenMinAgo, now, stats);
    // happiness decay = 0.4 * 1.5 * 10 = 6 → 100 - 6 = 94
    expect(result.newStats.happiness).toBeCloseTo(94);
  });

  it("does not mutate the input stats", () => {
    const stats: Stats = { hunger: 80, energy: 80, happiness: 80, hygiene: 80 };
    const now = Date.now();
    applyOfflineDecay(now - 30 * MIN_MS, now, stats);
    expect(stats.hunger).toBe(80);
  });
});
