/**
 * tauri-commands.ts — Typed wrappers for all Copet invoke() commands (Phase 06).
 *
 * Import from HUD, Settings, and pet/index.ts instead of calling invoke() directly.
 * All functions throw on Rust-side errors (invoke rejects the Promise).
 */

import { invoke } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

// ── Window commands ───────────────────────────────────────────────────────────

/** Show and focus the HUD (stats) window. */
export function openHud(): Promise<void> {
  return invoke("open_hud");
}

/** Show and focus the Settings window. */
export function openSettings(): Promise<void> {
  return invoke("open_settings");
}

/** Show and focus the Shop window. */
export function openShop(): Promise<void> {
  return invoke("open_shop");
}

/** Toggle the pet window between visible and hidden. */
export function togglePet(): Promise<void> {
  return invoke("toggle_pet");
}

/**
 * Snap the PET window (label "pet") to the BottomRight corner.
 * Rust-side acts on the pet window — safe to call from any window.
 */
export function resetPetPosition(): Promise<void> {
  return invoke("reset_pet_position");
}

// ── System commands ────────────────────────────────────────────────────────────

/** Enable or disable launch-at-login (OS autostart). */
export function enableAutostart(enable: boolean): Promise<void> {
  return invoke("enable_autostart", { enable });
}

/** Query whether autostart is currently enabled. */
export function isAutostartEnabled(): Promise<boolean> {
  return invoke("is_autostart_enabled");
}

/**
 * Re-register the global shortcut for toggling pet visibility.
 * Accepts Tauri shortcut strings, e.g. "CmdOrCtrl+Shift+P".
 */
export function setGlobalShortcut(shortcut: string): Promise<void> {
  if (!shortcut.trim()) {
    return Promise.reject(new Error("Shortcut must not be empty"));
  }
  return invoke("set_global_shortcut", { shortcut });
}

/**
 * Persist the selected pet pack id.
 * MVP: only "blobby" is valid; Rust-side validates and rejects unknown ids.
 */
export function selectPet(petId: string): Promise<void> {
  return invoke("select_pet", { petId });
}

export interface PersistedSettings {
  shortcut: string;
  selected_pet: string;
}

/**
 * Read persisted settings (shortcut string + selected pet id).
 * Settings panel calls this on mount to restore UI after restart.
 */
export function getSettings(): Promise<PersistedSettings> {
  return invoke("get_settings");
}

// ── Notification helper ────────────────────────────────────────────────────────

/**
 * Send a desktop notification.
 * Requests permission on first call if not already granted.
 * Silent no-op if user denies permission.
 */
export async function notify(title: string, body: string): Promise<void> {
  let permitted = await isPermissionGranted();
  if (!permitted) {
    const result = await requestPermission();
    permitted = result === "granted";
  }
  if (permitted) {
    sendNotification({ title, body });
  }
}
