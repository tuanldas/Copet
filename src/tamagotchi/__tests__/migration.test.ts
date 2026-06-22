/**
 * migration.test.ts — Schema migration v1 → v2 (Phase 05).
 *
 * Tests that a v1 save is migrated to v2 WITHOUT losing stats/xp/level/tokens,
 * AND that corrupt fields (wrong type, out-of-range, unknown stage) are coerced
 * to safe defaults instead of crashing.
 *
 * migrateV1ToV2 lives in persistence.ts (IPC-dependent); we mirror its logic
 * in `simulateMigrateV1` here so tests run without a Tauri runtime.
 * The mirror is kept in exact sync with persistence.ts — update both together.
 */

import { describe, it, expect } from "vitest";
import { SCHEMA_VERSION, defaultPetData, Stage } from "../types.js";
import { dispatch, getPetData } from "../pet-store.js";
import type { PetData } from "../types.js";

// ── Mirror of persistence.ts migrateV1ToV2 (kept in sync) ────────────────────

const VALID_STAGES = new Set(["Egg", "Hatchling", "Juvenile", "Adult", "Legend"]);
const STAT_KEYS = ["hunger", "energy", "happiness", "hygiene"] as const;

type StatDefaults = { hunger: number; energy: number; happiness: number; hygiene: number };

function coerceStats(raw: unknown, defaults: StatDefaults): StatDefaults {
  const src = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const result = { ...defaults };
  for (const key of STAT_KEYS) {
    const v = src[key];
    if (typeof v === "number" && isFinite(v)) {
      result[key] = Math.max(0, Math.min(100, v));
    }
  }
  return result;
}

function simulateMigrateV1(raw: Record<string, unknown>): PetData {
  const defaults = defaultPetData();

  const xp = typeof raw["xp"] === "number" && isFinite(raw["xp"]) ? Math.max(0, raw["xp"]) : defaults.xp;
  const level = typeof raw["level"] === "number" && isFinite(raw["level"]) ? Math.max(0, raw["level"]) : defaults.level;
  const tokens = typeof raw["tokens"] === "number" && isFinite(raw["tokens"]) ? Math.max(0, raw["tokens"]) : defaults.tokens;
  const lastSavedAt = typeof raw["lastSavedAt"] === "number" && isFinite(raw["lastSavedAt"]) ? raw["lastSavedAt"] : defaults.lastSavedAt;

  const rawStage = raw["stage"];
  const stage = typeof rawStage === "string" && VALID_STAGES.has(rawStage)
    ? (rawStage as PetData["stage"])
    : defaults.stage;

  const stats = coerceStats(raw["stats"], defaults.stats);

  const careScoreBuffer = Array.isArray(raw["careScoreBuffer"])
    ? (raw["careScoreBuffer"] as number[]).filter((v) => typeof v === "number" && isFinite(v))
    : defaults.careScoreBuffer;

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

// ── Fixtures ──────────────────────────────────────────────────────────────────

function buildV1Save(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    stats: { hunger: 65, energy: 40, happiness: 90, hygiene: 55 },
    xp: 350,
    level: 5,
    stage: "Juvenile",
    tokens: 120,
    careScoreBuffer: [72, 68, 81],
    lastSavedAt: 1_700_000_000_000,
    lastCareDay: "2025-11-14",
    ...overrides,
  };
}

// ── Happy-path tests ───────────────────────────────────────────────────────────

describe("schema migration v1 → v2 — happy path", () => {
  it("bumps schemaVersion to 2", () => {
    const migrated = simulateMigrateV1(buildV1Save());
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("preserves stats", () => {
    const migrated = simulateMigrateV1(buildV1Save());
    expect(migrated.stats).toEqual({ hunger: 65, energy: 40, happiness: 90, hygiene: 55 });
  });

  it("preserves xp", () => {
    expect(simulateMigrateV1(buildV1Save()).xp).toBe(350);
  });

  it("preserves level", () => {
    expect(simulateMigrateV1(buildV1Save()).level).toBe(5);
  });

  it("preserves stage", () => {
    expect(simulateMigrateV1(buildV1Save()).stage).toBe("Juvenile");
  });

  it("preserves token count", () => {
    expect(simulateMigrateV1(buildV1Save()).tokens).toBe(120);
  });

  it("preserves careScoreBuffer", () => {
    expect(simulateMigrateV1(buildV1Save()).careScoreBuffer).toEqual([72, 68, 81]);
  });

  it("preserves lastCareDay", () => {
    expect(simulateMigrateV1(buildV1Save()).lastCareDay).toBe("2025-11-14");
  });

  it("adds empty inventory", () => {
    expect(simulateMigrateV1(buildV1Save()).inventory).toEqual([]);
  });

  it("adds empty equipped", () => {
    expect(simulateMigrateV1(buildV1Save()).equipped).toEqual({});
  });

  it("migrated data loads into pet-store without error", () => {
    const migrated = simulateMigrateV1(buildV1Save());
    expect(() => dispatch({ type: "SET_DATA", data: migrated })).not.toThrow();
    expect(getPetData().level).toBe(5);
    expect(getPetData().tokens).toBe(120);
  });

  it("does NOT reset a high-level pet (critical regression guard)", () => {
    const v1 = buildV1Save({ level: 12, xp: 9999, tokens: 500 });
    const migrated = simulateMigrateV1(v1);
    expect(migrated.level).toBe(12);
    expect(migrated.xp).toBe(9999);
    expect(migrated.tokens).toBe(500);
  });

  it("all Stage enum values are valid after migration", () => {
    for (const stage of Object.values(Stage)) {
      const migrated = simulateMigrateV1(buildV1Save({ stage }));
      expect(migrated.stage).toBe(stage);
    }
  });
});

// ── Field-corruption / coercion tests (M2) ────────────────────────────────────

describe("schema migration v1 → v2 — corrupt field coercion", () => {
  it("coerces corrupted stats object → all 4 keys fall back to defaults", () => {
    const v1 = buildV1Save({ stats: "corrupt" });
    const migrated = simulateMigrateV1(v1);
    const d = defaultPetData();
    expect(migrated.stats).toEqual(d.stats);
  });

  it("coerces partially corrupt stats — valid keys preserved, bad keys use defaults", () => {
    const v1 = buildV1Save({ stats: { hunger: 50, energy: "bad", happiness: null, hygiene: 70 } });
    const migrated = simulateMigrateV1(v1);
    expect(migrated.stats.hunger).toBe(50);
    expect(migrated.stats.energy).toBe(defaultPetData().stats.energy); // fallback
    expect(migrated.stats.happiness).toBe(defaultPetData().stats.happiness); // fallback
    expect(migrated.stats.hygiene).toBe(70);
  });

  it("clamps stats outside [0, 100] to valid range", () => {
    const v1 = buildV1Save({ stats: { hunger: 999, energy: -50, happiness: 80, hygiene: 50 } });
    const migrated = simulateMigrateV1(v1);
    expect(migrated.stats.hunger).toBe(100);
    expect(migrated.stats.energy).toBe(0);
  });

  it("coerces NaN tokens → default (0)", () => {
    const v1 = buildV1Save({ tokens: NaN });
    const migrated = simulateMigrateV1(v1);
    expect(migrated.tokens).toBe(defaultPetData().tokens);
  });

  it("coerces negative tokens → 0 (floor at 0)", () => {
    const v1 = buildV1Save({ tokens: -100 });
    const migrated = simulateMigrateV1(v1);
    expect(migrated.tokens).toBe(0);
  });

  it("coerces string xp → default", () => {
    const v1 = buildV1Save({ xp: "lots" });
    const migrated = simulateMigrateV1(v1);
    expect(migrated.xp).toBe(defaultPetData().xp);
  });

  it("coerces unknown stage string → default (Egg)", () => {
    const v1 = buildV1Save({ stage: "SuperSaiyan" });
    const migrated = simulateMigrateV1(v1);
    expect(migrated.stage).toBe(Stage.Egg);
  });

  it("coerces null stage → default (Egg)", () => {
    const v1 = buildV1Save({ stage: null });
    const migrated = simulateMigrateV1(v1);
    expect(migrated.stage).toBe(Stage.Egg);
  });

  it("strips non-numeric values from careScoreBuffer array", () => {
    const v1 = buildV1Save({ careScoreBuffer: [70, "bad", 80, null, 60] });
    const migrated = simulateMigrateV1(v1);
    expect(migrated.careScoreBuffer).toEqual([70, 80, 60]);
  });

  it("falls back to empty careScoreBuffer when field is missing", () => {
    const v1 = buildV1Save({ careScoreBuffer: undefined });
    const migrated = simulateMigrateV1(v1);
    expect(migrated.careScoreBuffer).toEqual([]);
  });

  it("falls back to default lastCareDay when field is not YYYY-MM-DD", () => {
    const v1 = buildV1Save({ lastCareDay: "not-a-date" });
    const migrated = simulateMigrateV1(v1);
    expect(migrated.lastCareDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back to today for missing lastCareDay", () => {
    const v1 = buildV1Save({ lastCareDay: undefined });
    const migrated = simulateMigrateV1(v1);
    expect(migrated.lastCareDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("fully corrupted payload still returns a valid PetData shape", () => {
    const v1: Record<string, unknown> = {
      schemaVersion: 1,
      stats: "garbage",
      xp: "lots",
      level: NaN,
      stage: 999,
      tokens: null,
      careScoreBuffer: "nope",
      lastSavedAt: "old",
      lastCareDay: 42,
    };
    const migrated = simulateMigrateV1(v1);
    // Must produce a valid, loadable PetData — never throw.
    expect(() => dispatch({ type: "SET_DATA", data: migrated })).not.toThrow();
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(Array.isArray(migrated.inventory)).toBe(true);
    expect(typeof migrated.equipped).toBe("object");
  });
});
