// system_commands.rs — Tauri commands for system-level features (Phase 06 + 07).
//
// Commands: enable_autostart, is_autostart_enabled, set_global_shortcut,
//           select_pet, get_settings, set_tray_state (Phase 07)

use tauri::AppHandle;
// ManagerExt provides `.autolaunch()` on AppHandle (the actual method name in v2.5).
use tauri_plugin_autostart::ManagerExt;
use crate::tray::{set_tray_state as tray_set_state, TrayAgentState};
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

/// Valid status-label themes (mirrors LABEL_THEMES on the TS side).
const VALID_THEMES: &[&str] = &["kitchen", "mood", "garden"];

fn is_valid_theme(theme: &str) -> bool {
    VALID_THEMES.contains(&theme)
}

/// Persist the selected status-label theme (kitchen | mood | garden).
/// Rust validates and rejects unknown values (same pattern as select_pet).
#[tauri::command]
pub fn set_label_theme(app: AppHandle, theme: String) -> Result<(), String> {
    if !is_valid_theme(&theme) {
        return Err(format!("Unknown theme '{}'. Valid: {:?}", theme, VALID_THEMES));
    }
    let store = app
        .store("copet-settings.json")
        .map_err(|e| e.to_string())?;
    store.set("label_theme", serde_json::json!(theme));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

/// Write the hook-readable config file (`~/.copet/hook-config.json`).
///
/// This is the channel through which the app tells the separately-spawned
/// copet-hook process about opt-ins — env vars cannot cross that boundary.
fn write_hook_config(read_transcript: bool) -> Result<(), String> {
    let path = copet_protocol::copet_config_path()
        .ok_or_else(|| "cannot resolve home directory".to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let body = serde_json::json!({ "read_transcript": read_transcript });
    let text = serde_json::to_string_pretty(&body).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())
}

/// Persist the transcript-reading opt-in (Claude model/summary/tokens enrichment).
///
/// PRIVACY: reading the transcript means reading conversation content, so this is
/// OFF by default and only ever enabled by an explicit user action here. Writes
/// both the Tauri store (Settings UI state) and the hook-config file (read by
/// copet-hook on each event).
#[tauri::command]
pub fn set_transcript_optin(app: AppHandle, enabled: bool) -> Result<(), String> {
    let store = app
        .store("copet-settings.json")
        .map_err(|e| e.to_string())?;
    store.set("transcript_optin", serde_json::json!(enabled));
    store.save().map_err(|e| e.to_string())?;
    write_hook_config(enabled)
}

/// Read persisted settings for the Settings panel.
/// Returns the stored shortcut string and selected pet id (with defaults).
/// Settings calls this on mount to restore UI state after restart.
#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<serde_json::Value, String> {
    const DEFAULT_SHORTCUT: &str = "CmdOrCtrl+Shift+P";
    const DEFAULT_PET: &str = "blobby";
    const DEFAULT_THEME: &str = "kitchen";

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

    let label_theme = store
        .get("label_theme")
        .and_then(|v| v.as_str().map(|s| s.to_owned()))
        .unwrap_or_else(|| DEFAULT_THEME.to_owned());

    let transcript_optin = store
        .get("transcript_optin")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    Ok(serde_json::json!({
        "shortcut": shortcut,
        "selected_pet": selected_pet,
        "label_theme": label_theme,
        "transcript_optin": transcript_optin,
    }))
}

/// Phase 07: Update the system tray tooltip to reflect the current agent state.
///
/// Called from the frontend agent-bridge on every effectiveState change.
/// Maps the canonical AgentState string (working|waiting|done|error|idle) to
/// TrayAgentState and delegates to tray::set_tray_state().
#[tauri::command]
pub fn set_tray_state(app: AppHandle, state: String) -> Result<(), String> {
    let tray_state = match state.as_str() {
        "working" => TrayAgentState::Working,
        "waiting" => TrayAgentState::Waiting,
        "done"    => TrayAgentState::Done,
        "error"   => TrayAgentState::Error,
        _ => TrayAgentState::Idle, // covers "idle" and any unknown value
    };
    tray_set_state(&app, tray_state);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_valid_theme;

    #[test]
    fn valid_themes_accepted() {
        assert!(is_valid_theme("kitchen"));
        assert!(is_valid_theme("mood"));
        assert!(is_valid_theme("garden"));
    }

    #[test]
    fn invalid_themes_rejected() {
        assert!(!is_valid_theme("bogus"));
        assert!(!is_valid_theme(""));
    }
}
