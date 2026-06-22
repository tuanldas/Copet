// window_commands.rs — Tauri commands for window management (Phase 06).
//
// Commands: open_hud, open_settings, open_shop, toggle_pet, reset_pet_position
// These are thin wrappers that route to the tray helpers so logic
// is not duplicated between tray menu events and JS invoke() calls.

use tauri::{AppHandle, Manager};
use tauri_plugin_positioner::{Position, WindowExt};

use crate::tray::{open_window, toggle_pet_window};

/// Open (show + focus) the HUD / stats window.
#[tauri::command]
pub fn open_hud(app: AppHandle) {
    open_window(&app, "stats");
}

/// Open (show + focus) the Settings window.
#[tauri::command]
pub fn open_settings(app: AppHandle) {
    open_window(&app, "settings");
}

/// Open (show + focus) the Shop window.
#[tauri::command]
pub fn open_shop(app: AppHandle) {
    open_window(&app, "shop");
}

/// Toggle the pet window between visible and hidden.
#[tauri::command]
pub fn toggle_pet(app: AppHandle) {
    toggle_pet_window(&app);
}

/// Snap the PET window to the BottomRight corner of the current monitor.
///
/// This command acts on window label "pet", NOT on the caller's window.
/// Settings calls this instead of using the JS positioner (which would
/// move the Settings window instead of the pet).
#[tauri::command]
pub fn reset_pet_position(app: AppHandle) -> Result<(), String> {
    let pet = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window not found".to_string())?;
    pet.move_window(Position::BottomRight)
        .map_err(|e| e.to_string())
}
