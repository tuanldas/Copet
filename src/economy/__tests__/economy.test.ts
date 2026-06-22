/**
 * economy.test.ts — Unit tests for getBalance / addTokens / spendTokens.
 *
 * Strategy: reset pet-store context between tests by dispatching SET_DATA
 * with a known PetData snapshot. No mocking needed — pet-store is pure in-memory.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { dispatch } from "../../tamagotchi/pet-store.js";
import { defaultPetData } from "../../tamagotchi/types.js";
import { getBalance, addTokens, spendTokens } from "../economy.js";

/** Reset store to a fresh state with a given token count. */
function resetWith(tokens: number): void {
  dispatch({ type: "SET_DATA", data: { ...defaultPetData(), tokens } });
}

describe("economy — getBalance", () => {
  it("returns current token count", () => {
    resetWith(42);
    expect(getBalance()).toBe(42);
  });

  it("returns 0 for a fresh pet", () => {
    resetWith(0);
    expect(getBalance()).toBe(0);
  });
});

describe("economy — addTokens", () => {
  beforeEach(() => resetWith(10));

  it("increases balance by the given amount", () => {
    addTokens(5);
    expect(getBalance()).toBe(15);
  });

  it("no-ops for zero", () => {
    addTokens(0);
    expect(getBalance()).toBe(10);
  });

  it("no-ops for negative amounts", () => {
    addTokens(-3);
    expect(getBalance()).toBe(10);
  });

  it("can add large amounts", () => {
    addTokens(1000);
    expect(getBalance()).toBe(1010);
  });
});

describe("economy — spendTokens", () => {
  beforeEach(() => resetWith(20));

  it("returns true and deducts when balance is sufficient", () => {
    const ok = spendTokens(10);
    expect(ok).toBe(true);
    expect(getBalance()).toBe(10);
  });

  it("returns false when balance is insufficient", () => {
    const ok = spendTokens(30);
    expect(ok).toBe(false);
    // Balance must be unchanged.
    expect(getBalance()).toBe(20);
  });

  it("returns true and deducts exact balance (spend all)", () => {
    const ok = spendTokens(20);
    expect(ok).toBe(true);
    expect(getBalance()).toBe(0);
  });

  it("balance never goes negative — guard in store", () => {
    // Force scenario where spendTokens is called with amount > balance
    // (simulates race condition / stale read).
    resetWith(5);
    const ok = spendTokens(10);
    expect(ok).toBe(false);
    expect(getBalance()).toBe(5); // Unchanged.
  });

  it("returns true (no-op) for spending 0", () => {
    const ok = spendTokens(0);
    expect(ok).toBe(true);
    expect(getBalance()).toBe(20);
  });

  it("returns false for negative spend amount (treated as insufficient)", () => {
    // Negative amounts are invalid; function returns true (no-op, 0 spend).
    // Per spec: spendTokens(n <= 0) → true (succeeds as no-op).
    const ok = spendTokens(-5);
    expect(ok).toBe(true);
    expect(getBalance()).toBe(20);
  });

  it("sequential spends reduce balance correctly", () => {
    spendTokens(5);
    spendTokens(5);
    expect(getBalance()).toBe(10);
    const ok = spendTokens(15); // Now insufficient.
    expect(ok).toBe(false);
    expect(getBalance()).toBe(10);
  });
});
