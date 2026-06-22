/**
 * types.ts — Tamagotchi Core type definitions.
 *
 * PetData is the single serialized state persisted by tauri-plugin-store.
 * SCHEMA_VERSION guards migration when fields change between app releases.
 *
 * IMPORTANT: This file is owned by Phase 04/05. Do NOT modify fields here
 * without updating persistence.ts migration logic and SCHEMA_VERSION.
 *
 * Schema history:
 *   v1 (P04): stats, xp, level, stage, tokens, careScoreBuffer, lastSavedAt, lastCareDay
 *   v2 (P05): + inventory: string[], equipped: { hat?: string; accessory?: string }
 */

/** Schema version — bump on any breaking PetData field change. */
export const SCHEMA_VERSION = 2;

/** Evolution stages in order. Level thresholds match STAGE_LEVELS. */
export enum Stage {
  Egg = "Egg",
  Hatchling = "Hatchling",
  Juvenile = "Juvenile",
  Adult = "Adult",
  Legend = "Legend",
}

/** The 4 core stats, each clamped to [0, 100]. */
export interface Stats {
  hunger: number;
  energy: number;
  happiness: number;
  hygiene: number;
}

/**
 * Rolling 7-day care score buffer.
 * Each entry = daily avg of (hunger+energy+happiness)/3 for that day.
 * Oldest entry first; max 7 entries.
 */
export type CareScoreBuffer = number[];

/** Cosmetic slots available for equipped items. */
export type CosmeticSlot = "hat" | "accessory";

/** Equipped cosmetic map: slot → item id (undefined = nothing equipped). */
export type EquippedMap = Partial<Record<CosmeticSlot, string>>;

/** Full pet state — persisted and managed by pet-store.ts. */
export interface PetData {
  /** Schema version for migration guard on load. */
  schemaVersion: number;
  /** Current stat values. */
  stats: Stats;
  /** Accumulated XP (total, not within current level). */
  xp: number;
  /** Current level (derived from xp, stored for quick reads). */
  level: number;
  /** Current evolution stage. */
  stage: Stage;
  /** Token count (1 token per tool_call from agent events). */
  tokens: number;
  /** Rolling 7-day care score history (daily avg, oldest first). */
  careScoreBuffer: CareScoreBuffer;
  /** Unix ms timestamp of last save (for offline decay calculation). */
  lastSavedAt: number;
  /** Day string (YYYY-MM-DD) of the last care score entry to detect day rollover. */
  lastCareDay: string;
  /** Owned item ids (food consumed on buy; cosmetics remain permanently). */
  inventory: string[];
  /** Currently equipped cosmetics by slot. */
  equipped: EquippedMap;
}

/** Default initial state for new pets or schema version mismatch resets. */
export function defaultPetData(): PetData {
  return {
    schemaVersion: SCHEMA_VERSION,
    stats: {
      hunger: 80,
      energy: 80,
      happiness: 80,
      hygiene: 80,
    },
    xp: 0,
    level: 0,
    stage: Stage.Egg,
    tokens: 0,
    careScoreBuffer: [],
    lastSavedAt: Date.now(),
    lastCareDay: todayString(),
    inventory: [],
    equipped: {},
  };
}

/** Returns today's date as YYYY-MM-DD string (local time). */
export function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Payload emitted after offline decay for toast display (P06 renders). */
export interface OfflineToastPayload {
  waitedMinutes: number;
  newStats: Stats;
}
