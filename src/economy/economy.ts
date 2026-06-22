/**
 * economy.ts — Token balance API (Phase 05).
 *
 * Reads/writes tokens from the single tamagotchi pet-store (PetData.tokens).
 * There is NO separate token store — economy delegates entirely to pet-store.
 *
 * Public API:
 *   getBalance()        — current token count (synchronous)
 *   addTokens(n)        — increment balance (positive n only; no-op otherwise)
 *   spendTokens(n): boolean — deduct n tokens; returns false if insufficient
 *                             (balance never goes negative)
 */

import { getPetData, dispatch } from "../tamagotchi/pet-store.js";

/**
 * Return current token balance (synchronous snapshot).
 */
export function getBalance(): number {
  return getPetData().tokens;
}

/**
 * Add tokens to the balance. Ignores zero or negative amounts.
 * @param n - number of tokens to add (must be > 0)
 */
export function addTokens(n: number): void {
  if (n <= 0) return;
  dispatch({ type: "ADD_TOKENS", count: n });
}

/**
 * Spend n tokens. Returns true on success, false if balance is insufficient.
 * The balance will never go below 0 — the pet-store has a guard too.
 *
 * @param n - number of tokens to spend (must be > 0)
 * @returns true if tokens were deducted, false if balance was insufficient
 */
export function spendTokens(n: number): boolean {
  if (n <= 0) return true; // Spending 0 always succeeds (no-op).
  const current = getBalance();
  if (current < n) return false;
  dispatch({ type: "SPEND_TOKENS", count: n });
  return true;
}
