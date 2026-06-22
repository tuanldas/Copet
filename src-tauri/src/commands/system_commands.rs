// system_commands.rs — Tauri commands for system-level features (Phase 06).
//
// Commands: enable_autostart, is_autostart_enabled, set_global_shortcut,
//           select_pet, get_settings

use tauri::AppHandle;
// ManagerExt provides `.autolaunch()` on AppHandle (the actual method name in v2.5).
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_store::StoreExt;

/// Enable or disable OS-level autostart (launch at login).
#[tauri::command]
pub fn enable_autostart(app: AppHandle, enable: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if enable {
        manager.enable().map_err(|e| e.to_string())
    } else {
        manager.disable().map_err(|e| e.to_string())
    }
}

/// Query current autostart state (used by Settings on mount).
#[tauri::command]
pub fn is_autostart_enabled(app: AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|e| e.to_string())
}

/// Re-register the global shortcut for toggling pet visibility.
///
/// M1 fix: validate (dry-run register) BEFORE unregistering the old binding
/// so a typo never leaves the user with no shortcut.
/// H3 fix: persist the accepted shortcut string to copet-settings.json.
#[tauri::command]
pub fn set_global_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    if shortcut.trim().is_empty() {
        return Err("Shortcut string must not be empty".into());
    }

    let gs = app.global_shortcut();

    // Step 1: Attempt to register the new shortcut.
    // on_shortcut() replaces any existing registration for the same accelerator.
    // If the string is invalid, this returns an error and the old binding stays.
    gs.on_shortcut(shortcut.as_str(), move |app_handle, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            crate::tray::toggle_pet_window(app_handle);
        }
    })
    .map_err(|e| format!("Invalid shortcut '{}': {}", shortcut, e))?;

    // Step 2: Persist only after successful registration.
    use tauri_plugin_store::StoreExt;
    let store = app
        .store("copet-settings.json")
        .map_err(|e| e.to_string())?;
    store.set("global_shortcut", serde_json::json!(shortcut));
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

/// Persist the selected pet pack id.
/// MVP: only "blobby" is valid; Rust-side validates and rejects unknown ids.
#[tauri::command]
pub fn select_pet(app: AppHandle, pet_id: String) -> Result<(), String> {
    const VALID_PETS: &[&str] = &["blobby"];
    if !VALID_PETS.contains(&pet_id.as_str()) {
        return Err(format!("Unknown pet id '{}'. Valid: {:?}", pet_id, VALID_PETS));
    }
    let store = app
        .store("copet-settings.json")
        .map_err(|e| e.to_string())?;
    store.set("selected_pet", serde_json::json!(pet_id));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// Read persisted settings for the Settings panel.
/// Returns the stored shortcut string and selected pet id (with defaults).
/// Settings calls this on mount to restore UI state after restart.
#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<serde_json::Value, String> {
    const DEFAULT_SHORTCUT: &str = "CmdOrCtrl+Shift+P";
    const DEFAULT_PET: &str = "blobby";

    let store = app
        .store("copet-settings.json")
        .map_err(|e| e.to_string())?;

    let shortcut = store
        .get("global_shortcut")
        .and_then(|v| v.as_str().map(|s| s.to_owned()))
        .unwrap_or_else(|| DEFAULT_SHORTCUT.to_owned());

    let selected_pet = store
        .get("selected_pet")
        .and_then(|v| v.as_str().map(|s| s.to_owned()))
        .unwrap_or_else(|| DEFAULT_PET.to_owned());

    Ok(serde_json::json!({
        "shortcut": shortcut,
        "selected_pet": selected_pet,
    }))
}
