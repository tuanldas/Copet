/**
 * persistence.ts — tauri-plugin-store wrapper for PetData (Phase 04).
 *
 * Store file: "copet-pet.json" in Tauri's app data directory.
 * Key: "petData"
 *
 * Schema migration guard:
 *   - If no data found → return defaultPetData() (first run).
 *   - If schemaVersion mismatches SCHEMA_VERSION → reset to default (safe).
 *     Future versions can do field-level migration before this fallback.
 *
 * Auto-save: called by tick.ts every 60s + by index.ts on app exit.
 */

import { load, type Store } from "@tauri-apps/plugin-store";
import { defaultPetData, SCHEMA_VERSION } from "./types.js";
import type { PetData } from "./types.js";

const STORE_FILE = "copet-pet.json";
const STORE_KEY = "petData";

/** Lazily initialized store instance (one per session). */
let _store: Store | null = null;

/** Get or create the store instance. */
async function getStore(): Promise<Store> {
  if (!_store) {
    // `defaults` is required by StoreOptions; pass empty object so the store
    // starts empty and we control all keys via loadState/saveState.
    _store = await load(STORE_FILE, { defaults: {} });
  }
  return _store;
}

/**
 * Load PetData from disk.
 * Returns defaultPetData() on first run or schema version mismatch.
 */
export async function loadState(): Promise<PetData> {
  try {
    const store = await getStore();
    const raw = await store.get<PetData>(STORE_KEY);

    if (!raw) {
      // First run — no data yet.
      return defaultPetData();
    }

    if (raw.schemaVersion !== SCHEMA_VERSION) {
      // Schema changed between releases — safe reset.
      // Future: add field-level migration here before resetting.
      console.warn(
        `[persistence] Schema mismatch (stored=${raw.schemaVersion}, current=${SCHEMA_VERSION}). Resetting to defaults.`
      );
      return defaultPetData();
    }

    return raw;
  } catch (err) {
    // Corrupted or missing file — safe default.
    console.error("[persistence] loadState error, using defaults:", err);
    return defaultPetData();
  }
}

/**
 * Persist PetData to disk immediately.
 * Updates lastSavedAt to now before saving.
 */
export async function saveState(data: PetData): Promise<void> {
  try {
    const store = await getStore();
    const toSave: PetData = { ...data, lastSavedAt: Date.now() };
    await store.set(STORE_KEY, toSave);
    await store.save();
  } catch (err) {
    console.error("[persistence] saveState error:", err);
    // Non-fatal — next auto-save will retry.
  }
}
