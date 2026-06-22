/**
 * index.ts — Tamagotchi Core public API (Phase 04).
 *
 * Orchestrates: load → applyOfflineDecay → startTick → auto-save.
 * Exposes the minimal API surface consumed by other phases:
 *   feed(stat?)      — Phase 05 (tokens/shop)
 *   pet()            — Phase 05 (interaction)
 *   applyAgentXp()   — Phase 07 (agent event wiring)
 *   getState()       — any phase reading current data
 *   getToastPayload() — Phase 06 (offline toast display)
 *
 * BOUNDARY: P04 does NOT listen to agent events directly.
 * P07 calls applyAgentXp(event) after receiving the Tauri event.
 */

import { loadState, saveState } from "./persistence.js";
import { applyOfflineDecay } from "./offline-decay.js";
import { startTick, stopTick } from "./tick.js";
import { dispatch, getPetData } from "./pet-store.js";
import type { PetData, OfflineToastPayload } from "./types.js";
import type { AgentEvent } from "../types/agent-event.js";

/** Auto-save interval (ms) — matches tick interval. */
const AUTO_SAVE_INTERVAL_MS = 60_000;

/** Offline toast payload stored on init for P06 to read. */
let _offlineToast: OfflineToastPayload | null = null;

/** Auto-save interval handle. */
let _autoSaveId: ReturnType<typeof setInterval> | null = null;

/**
 * Initialize the Tamagotchi Core.
 * Call once on app start (before rendering).
 *
 * Flow: loadState → applyOfflineDecay → hydrate store → startTick → auto-save.
 */
export async function initTamagotchi(): Promise<void> {
  // 1. Load persisted state (or defaults on first run / schema mismatch).
  const saved = await loadState();

  // 2. Compute and apply offline decay since last save.
  const offlineResult = applyOfflineDecay(saved.lastSavedAt, Date.now(), saved.stats);
  _offlineToast = offlineResult;

  // 3. Hydrate store with post-offline-decay state.
  const hydrated: PetData = { ...saved, stats: offlineResult.newStats };
  dispatch({ type: "SET_DATA", data: hydrated });

  // Eager save on init: create the store file immediately (first-run persistence +
  // diagnostic) instead of waiting for the first 60s auto-save tick.
  await saveState(hydrated);

  // 4. Start the 60s tick (pauses automatically when window hidden).
  startTick(() => {
    dispatch({ type: "APPLY_DECAY", minutes: 1 });
  });

  // 5. Auto-save every 60s.
  _autoSaveId = setInterval(async () => {
    await saveState(getPetData());
  }, AUTO_SAVE_INTERVAL_MS);

  // 6. Save on page unload (app exit / refresh).
  window.addEventListener("beforeunload", _handleBeforeUnload);

  // 7. On visibility restore: apply offline decay for the gap missed while hidden.
  document.addEventListener("visibilitychange", _handleVisibilityChange);
}

/** Flush state and stop all timers. Call during graceful teardown if needed. */
export async function teardownTamagotchi(): Promise<void> {
  stopTick();
  if (_autoSaveId !== null) {
    clearInterval(_autoSaveId);
    _autoSaveId = null;
  }
  window.removeEventListener("beforeunload", _handleBeforeUnload);
  document.removeEventListener("visibilitychange", _handleVisibilityChange);
  await saveState(getPetData());
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Feed action. Bumps hunger by 30 (capped at 100) and awards +2 XP if hunger
 * was below 80 (feeding at the right time). Called by P05.
 */
export function feed(): void {
  const { stats } = getPetData();
  const xpBonus = stats.hunger < 80 ? 2 : 0;
  dispatch({ type: "ADJUST_STAT", stat: "hunger", delta: 30, xpBonus });
}

/**
 * Pet/interact action. Bumps happiness by 10 and awards +1 XP. Called by P05.
 */
export function pet(): void {
  dispatch({ type: "ADJUST_STAT", stat: "happiness", delta: 10, xpBonus: 1 });
}

/**
 * Apply XP/tokens from an agent event. Called by P07 after receiving
 * an `agent-status-changed` Tauri event.
 *
 * XP rules (chốt):
 *   state === "done"    → +10 XP (task completed)
 *   tool !== null       → +1 XP per tool_call (any working state with active tool)
 *   state === "done" and tool non-null → count as tool_call too (+1 token)
 *
 * Token rules:
 *   Each tool_call (tool !== null) → +1 token
 */
export function applyAgentXp(event: AgentEvent): void {
  // Task completion bonus.
  if (event.state === "done") {
    dispatch({ type: "ADD_XP", amount: 10 });
  }

  // Tool-call bonus: each individual tool invocation.
  if (event.tool !== null) {
    dispatch({ type: "ADD_XP", amount: 1 });
    dispatch({ type: "ADD_TOKENS", count: 1 });
  }
}

/**
 * Read current pet data snapshot (synchronous). Safe to call any time after init.
 */
export function getState(): PetData {
  return getPetData();
}

/**
 * Return the offline toast payload from the last init() call.
 * Returns null if no meaningful offline gap (< 1 minute).
 * P06 reads this to display the "Your pet waited X minutes" toast.
 */
export function getToastPayload(): OfflineToastPayload | null {
  if (_offlineToast === null) return null;
  // Only surface toast when the gap was at least 1 minute.
  return _offlineToast.waitedMinutes >= 1 ? _offlineToast : null;
}

// ── Internal handlers ─────────────────────────────────────────────────────────

function _handleBeforeUnload(): void {
  // Synchronous best-effort save — async save may not complete in time,
  // but lastSavedAt will already be updated from the last auto-save tick.
  saveState(getPetData()).catch(() => {});
}

/** Tracks last-known hidden timestamp to compute gap on resume. */
let _hiddenAt: number | null = null;

function _handleVisibilityChange(): void {
  if (document.hidden) {
    // Record when we went hidden.
    _hiddenAt = Date.now();
    return;
  }

  // Became visible again — apply offline decay for the hidden gap.
  if (_hiddenAt !== null) {
    const current = getPetData();
    const result = applyOfflineDecay(_hiddenAt, Date.now(), current.stats);
    // Only update stats; do not overwrite lastSavedAt (persistence handles that).
    dispatch({ type: "SET_DATA", data: { ...current, stats: result.newStats } });
    _hiddenAt = null;
  }
}
