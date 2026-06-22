/**
 * item-catalog.ts — Item type definitions + catalog loader (Phase 05).
 *
 * Types:
 *   FoodItem      — consumable; applied immediately on buy (no inventory entry).
 *   CosmeticItem  — permanent; stays in inventory, can be equipped.
 *   ShopItem      — union of both, narrowed by `kind` discriminant.
 *
 * Loader:
 *   loadCatalog() — parses items.json; validates shape; throws on bad data.
 *   getCatalog()  — returns already-loaded catalog (must call loadCatalog first).
 *   findItem(id)  — O(n) lookup by id across all categories.
 */

import type { CosmeticSlot } from "../tamagotchi/types.js";
import catalogJson from "../assets/shop/items.json";

/** Consumable food item — applied to a stat immediately on purchase. */
export interface FoodItem {
  kind: "food";
  id: string;
  name: string;
  price: number;
  /** Which stat this food restores. */
  stat: "hunger" | "energy" | "happiness" | "hygiene";
  /** Delta applied to the stat (clamped to 100 in pet-store). */
  amount: number;
  emoji: string;
  description: string;
}

/** Permanent cosmetic item — goes into inventory and can be equipped per slot. */
export interface CosmeticItem {
  kind: "cosmetic";
  id: string;
  name: string;
  price: number;
  /** Which cosmetic slot this item occupies (hat | accessory). */
  slot: CosmeticSlot;
  /** Public URL of the overlay PNG sprite (served from /public). */
  overlaySprite: string;
  emoji: string;
  description: string;
}

/** Union of all buyable item types. */
export type ShopItem = FoodItem | CosmeticItem;

/** Shape expected in items.json for food entries. */
interface RawFoodEntry {
  id: string;
  name: string;
  price: number;
  stat: string;
  amount: number;
  emoji: string;
  description: string;
}

/** Shape expected in items.json for cosmetic entries. */
interface RawCosmeticEntry {
  id: string;
  name: string;
  price: number;
  slot: string;
  overlaySprite: string;
  emoji: string;
  description: string;
}

interface RawCatalog {
  food: RawFoodEntry[];
  cosmetics: RawCosmeticEntry[];
}

const VALID_STATS = new Set(["hunger", "energy", "happiness", "hygiene"]);
const VALID_SLOTS = new Set(["hat", "accessory"]);

/** Validate and transform a raw food entry. Throws on invalid shape. */
function parseFoodItem(raw: RawFoodEntry): FoodItem {
  if (!raw.id || !raw.name || typeof raw.price !== "number") {
    throw new Error(`[item-catalog] Invalid food entry: ${JSON.stringify(raw)}`);
  }
  if (!VALID_STATS.has(raw.stat)) {
    throw new Error(`[item-catalog] Unknown stat "${raw.stat}" in food item "${raw.id}"`);
  }
  return {
    kind: "food",
    id: raw.id,
    name: raw.name,
    price: raw.price,
    stat: raw.stat as FoodItem["stat"],
    amount: raw.amount,
    emoji: raw.emoji ?? "🍪",
    description: raw.description ?? "",
  };
}

/** Validate and transform a raw cosmetic entry. Throws on invalid shape. */
function parseCosmeticItem(raw: RawCosmeticEntry): CosmeticItem {
  if (!raw.id || !raw.name || typeof raw.price !== "number") {
    throw new Error(`[item-catalog] Invalid cosmetic entry: ${JSON.stringify(raw)}`);
  }
  if (!VALID_SLOTS.has(raw.slot)) {
    throw new Error(`[item-catalog] Unknown slot "${raw.slot}" in cosmetic item "${raw.id}"`);
  }
  return {
    kind: "cosmetic",
    id: raw.id,
    name: raw.name,
    price: raw.price,
    slot: raw.slot as CosmeticSlot,
    overlaySprite: raw.overlaySprite,
    emoji: raw.emoji ?? "✨",
    description: raw.description ?? "",
  };
}

export interface ItemCatalog {
  food: FoodItem[];
  cosmetics: CosmeticItem[];
  /** All items flattened for lookup. */
  all: ShopItem[];
}

let _catalog: ItemCatalog | null = null;

/**
 * Parse and validate the bundled items.json catalog.
 * Idempotent — subsequent calls return the cached result.
 */
export function loadCatalog(): ItemCatalog {
  if (_catalog) return _catalog;

  const raw = catalogJson as RawCatalog;

  if (!Array.isArray(raw.food) || !Array.isArray(raw.cosmetics)) {
    throw new Error("[item-catalog] items.json must have 'food' and 'cosmetics' arrays.");
  }

  const food = raw.food.map(parseFoodItem);
  const cosmetics = raw.cosmetics.map(parseCosmeticItem);

  _catalog = { food, cosmetics, all: [...food, ...cosmetics] };
  return _catalog;
}

/**
 * Return the loaded catalog. Calls loadCatalog() if not yet loaded.
 */
export function getCatalog(): ItemCatalog {
  return _catalog ?? loadCatalog();
}

/**
 * Find any item by id across all categories. Returns undefined if not found.
 */
export function findItem(id: string): ShopItem | undefined {
  return getCatalog().all.find((item) => item.id === id);
}
