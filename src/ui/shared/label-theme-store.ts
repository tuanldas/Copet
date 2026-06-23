/**
 * label-theme-store.ts — shared cache of the selected status-label theme.
 *
 * Every surface (HUD, popover, pet tooltip) reads the current theme from here
 * and subscribes to changes. The cache is coerced to a valid LabelTheme at the
 * boundary so consumers never receive undefined (the persisted value is absent
 * until the Settings picker writes it).
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LabelTheme } from "../../types/session-snapshot.js";

const VALID: LabelTheme[] = ["kitchen", "mood", "garden"];
const DEFAULT_THEME: LabelTheme = "kitchen";

let _theme: LabelTheme = DEFAULT_THEME;

/** Coerce any value to a valid theme (fallback to the default). */
function coerce(value: unknown): LabelTheme {
  return typeof value === "string" && (VALID as string[]).includes(value)
    ? (value as LabelTheme)
    : DEFAULT_THEME;
}

/** Synchronous getter for the currently cached theme. */
export function getCurrentTheme(): LabelTheme {
  return _theme;
}

/**
 * Load the persisted theme from settings into the cache.
 * Safe before the Rust side returns `label_theme` (falls back to default).
 */
export async function initLabelTheme(): Promise<LabelTheme> {
  try {
    const settings = await invoke<{ label_theme?: unknown }>("get_settings");
    _theme = coerce(settings?.label_theme);
  } catch {
    _theme = DEFAULT_THEME;
  }
  return _theme;
}

/**
 * Subscribe to theme changes broadcast over `label-theme-changed`.
 * Updates the cache before invoking the callback. Returns an unlisten fn.
 */
export async function onThemeChange(cb: (theme: LabelTheme) => void): Promise<() => void> {
  return listen<{ theme?: unknown }>("label-theme-changed", (event) => {
    _theme = coerce(event.payload?.theme);
    cb(_theme);
  });
}
