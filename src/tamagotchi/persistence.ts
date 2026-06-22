/**
 * persistence.ts — tauri-plugin-store wrapper for PetData (Phase 04/05).
 *
 * Store file: "copet-pet.json" in Tauri's app data directory.
 * Key: "petData"
 *
 * Schema migration strategy (P05 change: v1→v2 additive):
 *   - If no data found → return defaultPetData() (first run).
 *   - If schemaVersion === current → return as-is.
 *   - If schemaVersion === 1 (P04 save) → merge default v2 fields (inventory/equipped)
 *     while PRESERVING stats, xp, level, stage, tokens, careScoreBuffer, etc.
 *   - If schemaVersion < 1 or unknown → reset to defaults (corrupted/very old).
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

/** Valid Stage enum values for migration guard. */
const VALID_STAGES = new Set(["Egg", "Hatchling", "Juvenile", "Adult", "Legend"]);

/** Stat keys required in PetData.stats. */
const STAT_KEYS = ["hunger", "energy", "happiness", "hygiene"] as const;

/**
 * Coerce a raw stats object into a valid Stats shape.
 * Each key must be a finite number in [0,100]; falls back to default per key.
 */
function coerceStats(raw: unknown, defaults: { hunger: number; energy: number; happiness: number; hygiene: number }): typeof defaults {
  const src = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const result = { ...defaults };
  for (const key of STAT_KEYS) {
    const v = src[key];
    if (typeof v === "number" && isFinite(v)) {
      result[key] = Math.max(0, Math.min(100, v));
    }
    // else: leave default
  }
  return result;
}

/**
 * Migrate a v1 save to v2 by merging additive fields.
 * Preserves: stats, xp, level, stage, tokens, careScoreBuffer, lastSavedAt, lastCareDay.
 * Adds: inventory:[], equipped:{}.
 * Validates/coerces: stats (4-key numeric), tokens/xp/level (typeof number), stage (enum).
 */
function migrateV1ToV2(raw: Record<string, unknown>): PetData {
  console.info("[persistence] Migrating save v1 → v2 (adding inventory/equipped fields).");
  const defaults = defaultPetData();

  // Coerce numeric scalar fields — fall back to defaults when corrupt.
  const xp = typeof raw["xp"] === "number" && isFinite(raw["xp"]) ? Math.max(0, raw["xp"]) : defaults.xp;
  const level = typeof raw["level"] === "number" && isFinite(raw["level"]) ? Math.max(0, raw["level"]) : defaults.level;
  const tokens = typeof raw["tokens"] === "number" && isFinite(raw["tokens"]) ? Math.max(0, raw["tokens"]) : defaults.tokens;
  const lastSavedAt = typeof raw["lastSavedAt"] === "number" && isFinite(raw["lastSavedAt"]) ? raw["lastSavedAt"] : defaults.lastSavedAt;

  // Stage must be a known enum value.
  const rawStage = raw["stage"];
  const stage = typeof rawStage === "string" && VALID_STAGES.has(rawStage)
    ? (rawStage as PetData["stage"])
    : defaults.stage;

  // Stats: each key must be a finite number in [0, 100].
  const stats = coerceStats(raw["stats"], defaults.stats);

  // careScoreBuffer must be an array (values validated lazily by consumers).
  const careScoreBuffer = Array.isArray(raw["careScoreBuffer"])
    ? (raw["careScoreBuffer"] as number[]).filter((v) => typeof v === "number" && isFinite(v))
    : defaults.careScoreBuffer;

  // lastCareDay must be a YYYY-MM-DD string.
  const lastCareDay = typeof raw["lastCareDay"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw["lastCareDay"])
    ? raw["lastCareDay"]
    : defaults.lastCareDay;

  return {
    schemaVersion: SCHEMA_VERSION,
    stats,
    xp,
    level,
    stage,
    tokens,
    careScoreBuffer,
    lastSavedAt,
    lastCareDay,
    inventory: [],
    equipped: {},
  };
}

/**
 * Load PetData from disk.
 * Returns defaultPetData() on first run or unrecoverable schema.
 * For v1 saves: merges new fields, preserving player progress.
 */
export async function loadState(): Promise<PetData> {
  try {
    const store = await getStore();
    const raw = await store.get<Record<string, unknown>>(STORE_KEY);

    if (!raw) {
      // First run — no data yet.
      return defaultPetData();
    }

    const storedVersion = typeof raw["schemaVersion"] === "number" ? raw["schemaVersion"] : 0;

    if (storedVersion === SCHEMA_VERSION) {
      // Up-to-date — return as typed PetData.
      return raw as unknown as PetData;
    }

    if (storedVersion === 1) {
      // Additive migration: v1 → v2 (P05 adds inventory/equipped).
      return migrateV1ToV2(raw);
    }

    // Unknown/older version — safe reset.
    console.warn(
      `[persistence] Unrecognised schema v${storedVersion} (current=${SCHEMA_VERSION}). Resetting to defaults.`
    );
    return defaultPetData();
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
