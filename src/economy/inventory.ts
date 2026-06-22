/**
 * inventory.ts — Owned items + equipped cosmetics (Phase 05).
 *
 * Inventory and equipped state live inside PetData (pet-store), ensuring
 * they are persisted alongside stats/xp via the existing save mechanism.
 * There is NO second store — all reads/writes go through tamagotchi pet-store.
 *
 * Public API:
 *   getInventory()        — owned cosmetic item ids (string[])
 *   getEquipped()         — { hat?: string; accessory?: string } snapshot
 *   isOwned(id)           — true if id is in inventory
 *   isEquipped(id)        — true if id is the currently equipped item in its slot
 *   buy(item)             — spend tokens + apply effect (food: feed; cosmetic: add to inventory)
 *   equip(itemId)         — equip a cosmetic (must be owned; replaces slot)
 *   unequip(slot)         — clear a cosmetic slot
 *
 * Error handling:
 *   buy() returns BuyResult describing success/failure reason (no throws for UI).
 */

import { getPetData, dispatch } from "../tamagotchi/pet-store.js";
import { spendTokens } from "./economy.js";
import { findItem, getCatalog } from "./item-catalog.js";
import type { ShopItem, CosmeticItem, FoodItem } from "./item-catalog.js";
import type { CosmeticSlot, EquippedMap } from "../tamagotchi/types.js";

// Feed logic inlined here to avoid importing tamagotchi/index.ts which pulls in
// @tauri-apps/api/event (Tauri IPC) — unavailable in Vitest / Node environments.
// This mirrors the same logic as tamagotchi/index.ts:feed().
function _applyFeed(effect: { stat: "hunger" | "energy" | "happiness" | "hygiene"; amount: number }): void {
  const { stats } = getPetData();
  const xpBonus = stats[effect.stat] < 80 ? 2 : 0;
  dispatch({ type: "ADJUST_STAT", stat: effect.stat, delta: effect.amount, xpBonus });
}

export type BuyResult =
  | { ok: true }
  | { ok: false; reason: "insufficient_tokens" | "already_owned" | "unknown_item" };

/**
 * Return the list of owned cosmetic item ids from pet-store.
 */
export function getInventory(): string[] {
  return getPetData().inventory;
}

/**
 * Return the currently equipped cosmetics map.
 */
export function getEquipped(): EquippedMap {
  return getPetData().equipped;
}

/**
 * Check whether the player owns a specific item id.
 */
export function isOwned(id: string): boolean {
  return getPetData().inventory.includes(id);
}

/**
 * Check whether a cosmetic item id is currently equipped in its slot.
 */
export function isEquipped(id: string): boolean {
  const equipped = getPetData().equipped;
  return Object.values(equipped).includes(id);
}

/**
 * Buy an item from the shop.
 *
 * Food:     spend tokens → call feed(effect) immediately. Not added to inventory.
 * Cosmetic: spend tokens → add id to inventory. Does not auto-equip.
 *
 * Returns BuyResult — never throws, so the UI can display the reason directly.
 */
export function buy(item: ShopItem): BuyResult {
  // Validate item exists in catalog (safety check in case of stale reference).
  const catalogItem = findItem(item.id);
  if (!catalogItem) return { ok: false, reason: "unknown_item" };

  if (item.kind === "cosmetic") {
    // Cosmetics are permanent — no re-purchase once owned.
    if (isOwned(item.id)) return { ok: false, reason: "already_owned" };
  }

  // Attempt to spend tokens (returns false if insufficient).
  const spent = spendTokens(item.price);
  if (!spent) return { ok: false, reason: "insufficient_tokens" };

  if (item.kind === "food") {
    // Apply food effect immediately (owner-side only).
    const foodItem = item as FoodItem;
    _applyFeed({ stat: foodItem.stat, amount: foodItem.amount });
  } else {
    // Cosmetic: add to persistent inventory.
    const cosmeticItem = item as CosmeticItem;
    dispatch({ type: "ADD_TO_INVENTORY", itemId: cosmeticItem.id });
  }

  return { ok: true };
}

/**
 * Equip a cosmetic item by id. The item must be owned.
 * Replaces any existing item in the same slot (1 item per slot).
 *
 * Returns false if item is not in inventory or not a cosmetic.
 */
export function equip(itemId: string): boolean {
  if (!isOwned(itemId)) return false;

  const catalogItem = findItem(itemId);
  if (!catalogItem || catalogItem.kind !== "cosmetic") return false;

  const cosmeticItem = catalogItem as CosmeticItem;
  dispatch({ type: "EQUIP_ITEM", slot: cosmeticItem.slot, itemId });
  return true;
}

/**
 * Unequip (clear) a cosmetic slot. No-op if slot is already empty.
 */
export function unequip(slot: CosmeticSlot): void {
  dispatch({ type: "UNEQUIP_SLOT", slot });
}

/**
 * Return all owned cosmetic items as full CosmeticItem objects.
 * Skips any ids that no longer exist in the catalog (graceful forward-compat).
 */
export function getOwnedCosmetics(): CosmeticItem[] {
  const { cosmetics } = getCatalog();
  const owned = getInventory();
  return cosmetics.filter((c) => owned.includes(c.id));
}
