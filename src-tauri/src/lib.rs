// Copet — Tauri v2 desktop pet entry point.
//
// `setup()` is split into `init_*` helpers so later phases can extend their own area
// without merge conflicts (see plans/260622-1501-copet-desktop-agent-pet/plan.md):
//   - init_plugins : positioner / window-state / autostart / global-shortcut (Phase 06)
//   - init_windows : window setup, macOS accessory policy, click-through (Phase 01)
//   - init_ipc     : agent-event socket daemon (Phase 03)
//   - init_tray    : system tray + menu (Phase 06)

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{App, AppHandle, Manager, WebviewWindow};

mod ipc;

/// The pet's interactive rect in logical px, relative to the pet window's content top-left.
/// The frontend reports it (and updates it as the pet moves) via `set_pet_hit_rect` so the
/// click-through hit-test tracks wherever the pet actually is, not a fixed centre.
#[derive(Clone, Copy, Default)]
struct PetRect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

struct PetHit {
    rect: Mutex<PetRect>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Arc::new(PetHit {
            rect: Mutex::new(PetRect::default()),
        }))
        .invoke_handler(tauri::generate_handler![set_pet_hit_rect])
        .setup(|app| {
            init_plugins(app)?;
            init_windows(app)?;
            init_ipc(app)?;
            init_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Frontend reports the pet's interactive rect (logical px, window-content coordinates),
/// updating it as the pet moves so click-through tracks the pet.
#[tauri::command]
fn set_pet_hit_rect(state: tauri::State<'_, Arc<PetHit>>, x: f64, y: f64, w: f64, h: f64) {
    if [x, y, w, h].iter().all(|v| v.is_finite()) && w >= 0.0 && h >= 0.0 {
        *state.rect.lock().unwrap() = PetRect { x, y, w, h };
    }
}

/// Runtime plugin initialization. tauri-plugin-store added in Phase 04.
fn init_plugins(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    app.handle().plugin(tauri_plugin_store::Builder::new().build())?;
    Ok(())
}

/// Window setup: macOS accessory policy + transparent-overlay click-through.
fn init_windows(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    // macOS: live as an accessory overlay — no Dock icon, no Cmd+Tab, never steal focus.
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    let pet = app
        .get_webview_window("pet")
        .ok_or("pet window not found in tauri.conf.json")?;

    // Start fully click-through; the poll below re-enables capture over the pet body.
    pet.set_ignore_cursor_events(true)?;
    start_click_through_poll(app.handle().clone());

    Ok(())
}

/// Agent-event IPC socket daemon (Phase 03).
///
/// Spawns an async tokio task that listens on the platform local socket
/// (`/tmp/copet-{uid}.sock` on Unix) and emits `agent-status-changed` Tauri
/// events to the webview whenever copet-hook or copet-run writes a JSON line.
fn init_ipc(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    ipc::spawn_daemon(app.handle().clone());
    Ok(())
}

/// System tray + menu. Filled in Phase 06.
fn init_tray(_app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

/// Poll the OS cursor (~30 fps) and toggle the pet window between click-through (cursor
/// away → clicks pass to the app underneath) and capture (cursor over the pet body → the
/// pet is draggable/clickable). Works around Tauri transparent-window hit-testing
/// (issue #13070). All window calls are marshalled onto the main thread.
fn start_click_through_poll(app: AppHandle) {
    // Last successfully-applied ignore state. `None` until the first apply so the first tick
    // always syncs the window; only updated on success so a failed toggle is retried next
    // tick instead of being silently assumed-applied.
    let applied: Arc<Mutex<Option<bool>>> = Arc::new(Mutex::new(None));
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(33));
        let app_main = app.clone();
        let applied = applied.clone();
        let dispatched = app.run_on_main_thread(move || {
            let Some(pet) = app_main.get_webview_window("pet") else {
                return;
            };
            // Nothing to do while the pet is hidden.
            if !pet.is_visible().unwrap_or(true) {
                return;
            }
            let want_ignore = !cursor_over_pet(&app_main, &pet);
            let mut applied = applied.lock().unwrap();
            if *applied != Some(want_ignore) && pet.set_ignore_cursor_events(want_ignore).is_ok()
            {
                *applied = Some(want_ignore);
            }
        });
        // run_on_main_thread errors once the event loop is gone (app quitting) → stop.
        if dispatched.is_err() {
            break;
        }
    });
}

/// Is the OS cursor within the pet's interactive rect? The cursor (physical desktop coords)
/// is converted to the window's content-local logical px and tested against the rect.
fn cursor_over_pet(app: &AppHandle, pet: &WebviewWindow) -> bool {
    let (Ok(cursor), Ok(pos)) = (app.cursor_position(), pet.outer_position()) else {
        return false;
    };
    let scale = pet.scale_factor().unwrap_or(1.0);
    let rel_x = (cursor.x - pos.x as f64) / scale;
    let rel_y = (cursor.y - pos.y as f64) / scale;
    let r = *app.state::<Arc<PetHit>>().rect.lock().unwrap();
    rel_x >= r.x && rel_x <= r.x + r.w && rel_y >= r.y && rel_y <= r.y + r.h
}
