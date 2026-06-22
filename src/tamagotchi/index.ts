/**
 * index.ts — Tamagotchi Core public API (Phase 04/05).
 *
 * Orchestrates: load → applyOfflineDecay → startTick → auto-save.
 * Exposes the minimal API surface consumed by other phases.
 *
 * DUAL-WINDOW ARCHITECTURE (P05):
 *   Each Tauri webview is a separate OS process with its own JS heap and
 *   in-memory @xstate/store. Writing to "copet-pet.json" from both windows
 *   causes a last-writer-wins race. Fix: single writer (owner) + broadcast.
 *
 *   role "owner" (pet window / main.ts):
 *     - Full lifecycle: load → decay → hydrate → tick → auto-save → persist.
 *     - Listens for "tama:mutate" events from client windows; applies them and
 *       then saves and broadcasts the new state via "tama:state".
 *     - Subscribes to own pet-store; debounce-broadcasts on every change.
 *
 *   role "client" (shop window / shop-entry.tsx):
 *     - Loads once for initial display then NEVER saves or ticks.
 *     - Listens to "tama:state" broadcasts; mirrors into local pet-store (read-only).
 *     - All mutations emitted as "tama:mutate" events to the owner.
 *
 * BOUNDARY: P04 does NOT listen to agent events directly.
 * P07 calls applyAgentXp(event) after receiving the Tauri event.
 */

import { listen, emit } from "@tauri-apps/api/event";
import { loadState, saveState } from "./persistence.js";
import { applyOfflineDecay } from "./offline-decay.js";
import { startTick, stopTick } from "./tick.js";
import { dispatch, getPetData, onPetDataChange } from "./pet-store.js";
import type { PetData, OfflineToastPayload } from "./types.js";
import type { AgentEvent } from "../types/agent-event.js";
import { spendTokens } from "../economy/economy.js";
import { findItem } from "../economy/item-catalog.js";
import type { FoodItem, CosmeticItem } from "../economy/item-catalog.js";
import type { CosmeticSlot } from "./types.js";

/** Auto-save interval (ms) — matches tick interval. */
const AUTO_SAVE_INTERVAL_MS = 60_000;

/** Debounce delay for broadcasting state to client windows (ms). */
const BROADCAST_DEBOUNCE_MS = 100;

// ── Tauri event names ──────────────────────────────────────────────────────────

/** Owner broadcasts full PetData to client windows after any mutation. */
const EVENT_STATE = "tama:state";

/**
 * Client emits a mutation request to the owner.
 * Payload: MutatePayload (see below).
 */
const EVENT_MUTATE = "tama:mutate";

// ── Mutation payload types ─────────────────────────────────────────────────────

export type MutateAction =
  | { action: "buy_food"; itemId: string }
  | { action: "buy_cosmetic"; itemId: string }
  | { action: "equip"; itemId: string }
  | { action: "unequip"; slot: CosmeticSlot };

// ── Module state ──────────────────────────────────────────────────────────────

/** Offline toast payload stored on init for P06 to read. */
let _offlineToast: OfflineToastPayload | null = null;

/** Auto-save interval handle (owner only). */
let _autoSaveId: ReturnType<typeof setInterval> | null = null;

/** Broadcast debounce timer (owner only). */
let _broadcastTimer = 0;

/** Unlisteners for Tauri event subscriptions (call on teardown). */
const _unlisteners: Array<() => void> = [];

// ── Init ──────────────────────────────────────────────────────────────────────

export interface InitOptions {
  /** "owner" = pet window (single writer). "client" = shop window (read-only mirror). */
  role: "owner" | "client";
}

/**
 * Initialize the Tamagotchi Core for the given window role.
 *
 * owner (pet window):
 *   loadState → offline decay → hydrate → startTick → auto-save → mutation listener → broadcaster.
 *
 * client (shop window):
 *   loadState for initial display → SET_DATA (no tick / no save) → mirror listener.
 */
export async function initTamagotchi(options: InitOptions): Promise<void> {
  const { role } = options;

  // 1. Load persisted state (or defaults on first run / schema mismatch).
  const saved = await loadState();

  if (role === "owner") {
    // 2. Compute and apply offline decay since last save.
    const offlineResult = applyOfflineDecay(saved.lastSavedAt, Date.now(), saved.stats);
    _offlineToast = offlineResult;

    // 3. Hydrate store with post-offline-decay state.
    const hydrated: PetData = { ...saved, stats: offlineResult.newStats };
    dispatch({ type: "SET_DATA", data: hydrated });

    // Eager save on init.
    await saveState(hydrated);

    // 4. Start the 60s tick.
    startTick(() => {
      dispatch({ type: "APPLY_DECAY", minutes: 1 });
    });

    // 5. Auto-save every 60s.
    _autoSaveId = setInterval(() => {
      saveState(getPetData()).catch(() => {});
    }, AUTO_SAVE_INTERVAL_MS);

    // 6. Save on page unload (app exit / refresh).
    window.addEventListener("beforeunload", _handleBeforeUnload);

    // 7. On visibility restore: apply offline decay for hidden gap.
    document.addEventListener("visibilitychange", _handleVisibilityChange);

    // 8. Broadcast state to client windows on every pet-store change.
    const unsubBroadcast = onPetDataChange(_scheduleBroadcast);
    _unlisteners.push(unsubBroadcast);

    // 9. Listen for mutation requests from client windows.
    const unlistenMutate = await listen<MutateAction>(EVENT_MUTATE, (event) => {
      _applyMutation(event.payload);
    });
    _unlisteners.push(unlistenMutate);
  } else {
    // client role: hydrate local store for initial read; no tick/save.
    dispatch({ type: "SET_DATA", data: saved });

    // Listen for state broadcasts from the owner.
    const unlistenState = await listen<PetData>(EVENT_STATE, (event) => {
      dispatch({ type: "SET_DATA", data: event.payload });
    });
    _unlisteners.push(unlistenState);
  }
}

/** Flush state and stop all timers. Call during graceful teardown if needed. */
export async function teardownTamagotchi(): Promise<void> {
  stopTick();
  if (_autoSaveId !== null) {
    clearInterval(_autoSaveId);
    _autoSaveId = null;
  }
  clearTimeout(_broadcastTimer);
  window.removeEventListener("beforeunload", _handleBeforeUnload);
  document.removeEventListener("visibilitychange", _handleVisibilityChange);
  for (const unlisten of _unlisteners) unlisten();
  _unlisteners.length = 0;
  await saveState(getPetData());
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Food effect descriptor from shop items (P05).
 * stat: which stat to bump; amount: delta to apply (clamped to 100).
 */
export interface FoodEffect {
  stat: "hunger" | "energy" | "happiness" | "hygiene";
  amount: number;
}

/**
 * Feed action — owner-side only.
 * - Without args: bumps hunger by 30 (legacy/default); +2 XP if hunger < 80.
 * - With FoodEffect: applies the item's specific stat+amount; +2 XP if stat < 80.
 */
export function feed(effect?: FoodEffect): void {
  const { stats } = getPetData();
  const stat = effect?.stat ?? "hunger";
  const delta = effect?.amount ?? 30;
  const xpBonus = stats[stat] < 80 ? 2 : 0;
  dispatch({ type: "ADJUST_STAT", stat, delta, xpBonus });
}

/**
 * Pet/interact action — owner-side only.
 * Bumps happiness by 10 and awards +1 XP.
 */
export function pet(): void {
  dispatch({ type: "ADJUST_STAT", stat: "happiness", delta: 10, xpBonus: 1 });
}

/**
 * Apply XP/tokens from an agent event. Called by P07 after receiving
 * an `agent-status-changed` Tauri event.
 */
export function applyAgentXp(event: AgentEvent): void {
  if (event.state === "done") {
    dispatch({ type: "ADD_XP", amount: 10 });
  }
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
 */
export function getToastPayload(): OfflineToastPayload | null {
  if (_offlineToast === null) return null;
  return _offlineToast.waitedMinutes >= 1 ? _offlineToast : null;
}

/**
 * Emit a mutation to the owner window (client-side shop actions).
 * The owner will apply the mutation, persist, and broadcast the new state.
 */
export async function emitMutation(payload: MutateAction): Promise<void> {
  await emit(EVENT_MUTATE, payload);
}

// ── Owner: apply mutation from client ────────────────────────────────────────

/**
 * Apply a mutation action on the owner side (invoked when EVENT_MUTATE fires).
 * All economy/inventory logic runs here in the owner process — single writer.
 */
function _applyMutation(payload: MutateAction): void {
  switch (payload.action) {
    case "buy_food": {
      const item = findItem(payload.itemId);
      if (!item || item.kind !== "food") return;
      const foodItem = item as FoodItem;
      const spent = spendTokens(foodItem.price);
      if (!spent) return; // Insufficient tokens — no-op (UI already checked).
      feed({ stat: foodItem.stat, amount: foodItem.amount });
      break;
    }
    case "buy_cosmetic": {
      const item = findItem(payload.itemId);
      if (!item || item.kind !== "cosmetic") return;
      const cosmeticItem = item as CosmeticItem;
      // No re-purchase if already owned.
      if (getPetData().inventory.includes(cosmeticItem.id)) return;
      const spent = spendTokens(cosmeticItem.price);
      if (!spent) return;
      dispatch({ type: "ADD_TO_INVENTORY", itemId: cosmeticItem.id });
      break;
    }
    case "equip": {
      const item = findItem(payload.itemId);
      if (!item || item.kind !== "cosmetic") return;
      if (!getPetData().inventory.includes(payload.itemId)) return;
      const cosmeticItem = item as CosmeticItem;
      dispatch({ type: "EQUIP_ITEM", slot: cosmeticItem.slot, itemId: payload.itemId });
      break;
    }
    case "unequip": {
      dispatch({ type: "UNEQUIP_SLOT", slot: payload.slot });
      break;
    }
  }

  // Persist immediately after any mutation (don't wait for auto-save).
  saveState(getPetData()).catch(() => {});
}

// ── Owner: debounced broadcast ────────────────────────────────────────────────

/** Schedule a broadcast of the current state to client windows (debounced). */
function _scheduleBroadcast(): void {
  clearTimeout(_broadcastTimer);
  _broadcastTimer = window.setTimeout(() => {
    emit(EVENT_STATE, getPetData()).catch(() => {});
  }, BROADCAST_DEBOUNCE_MS);
}

// ── Internal handlers ─────────────────────────────────────────────────────────

function _handleBeforeUnload(): void {
  saveState(getPetData()).catch(() => {});
}

let _hiddenAt: number | null = null;

function _handleVisibilityChange(): void {
  if (document.hidden) {
    _hiddenAt = Date.now();
    return;
  }
  if (_hiddenAt !== null) {
    const current = getPetData();
    const result = applyOfflineDecay(_hiddenAt, Date.now(), current.stats);
    dispatch({ type: "SET_DATA", data: { ...current, stats: result.newStats } });
    _hiddenAt = null;
  }
}
