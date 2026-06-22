// Copet — Tauri v2 desktop pet entry point.
//
// `setup()` is split into `init_*` helpers so each phase extends its own area
// without merge conflicts (see plans/260622-1501-copet-desktop-agent-pet/plan.md):
//   - init_plugins : store / positioner / window-state / autostart /
//                    global-shortcut / notification   (Phase 04 + 06)
//   - init_windows : macOS accessory policy, click-through poll, shop  (Phase 01/05)
//   - init_ipc     : agent-event socket daemon                          (Phase 03)
//   - init_tray    : system tray + menu                                 (Phase 06)

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{App, AppHandle, Manager, WebviewWindow};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

mod commands;
mod ipc;
mod tray;

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
        .invoke_handler(tauri::generate_handler![
            // Phase 01: click-through hit rect
            set_pet_hit_rect,
            // Phase 06: window commands
            commands::window_commands::open_hud,
            commands::window_commands::open_settings,
            commands::window_commands::open_shop,
            commands::window_commands::toggle_pet,
            commands::window_commands::reset_pet_position,
            // Phase 06: system commands
            commands::system_commands::enable_autostart,
            commands::system_commands::is_autostart_enabled,
            commands::system_commands::set_global_shortcut,
            commands::system_commands::select_pet,
            commands::system_commands::get_settings,
            // Phase 07: agent state → tray icon
            commands::system_commands::set_tray_state,
        ])
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

/// Runtime plugin initialization.
/// Uses `app.handle().plugin(...)` with `?` propagation — never panics.
fn init_plugins(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    // Phase 04: persistent store
    app.handle()
        .plugin(tauri_plugin_store::Builder::new().build())?;

    // Phase 06: window position memory (saves/restores per-monitor position)
    app.handle()
        .plugin(tauri_plugin_window_state::Builder::new().build())?;

    // Phase 06: positioner (preset corner snapping)
    app.handle()
        .plugin(tauri_plugin_positioner::init())?;

    // Phase 06: global keyboard shortcut
    app.handle()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())?;

    // Phase 06: OS autostart (launch at login)
    app.handle()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            // No extra CLI args on autostart
            None::<Vec<&str>>,
        ))?;

    // Phase 06: desktop notifications
    app.handle()
        .plugin(tauri_plugin_notification::init())?;

    // Register global shortcut from persisted settings (or default).
    // H3 fix: read stored shortcut so user's custom binding survives restarts.
    register_startup_shortcut(app)?;

    Ok(())
}

/// Register the toggle-pet global shortcut at startup.
///
/// H3 fix: reads the persisted shortcut from copet-settings.json;
/// falls back to the default if not set or if the stored string is invalid.
fn register_startup_shortcut(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_store::StoreExt;

    const DEFAULT_SHORTCUT: &str = "CmdOrCtrl+Shift+P";

    // Read the persisted shortcut (may not exist on first launch).
    let shortcut = app
        .handle()
        .store("copet-settings.json")
        .ok()
        .and_then(|s| s.get("global_shortcut"))
        .and_then(|v| v.as_str().map(|s| s.to_owned()))
        .unwrap_or_else(|| DEFAULT_SHORTCUT.to_owned());

    let result = app
        .handle()
        .global_shortcut()
        .on_shortcut(shortcut.as_str(), |app_handle, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                tray::toggle_pet_window(app_handle);
            }
        });

    if result.is_err() {
        // Stored shortcut is invalid (e.g. OS conflict); fall back to default.
        app.handle()
            .global_shortcut()
            .on_shortcut(DEFAULT_SHORTCUT, |app_handle, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    tray::toggle_pet_window(app_handle);
                }
            })
            .map_err(|e| -> Box<dyn std::error::Error> { e.to_string().into() })?;
    }

    Ok(())
}

/// Window setup: macOS accessory policy + transparent-overlay click-through + shop window.
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

    // Shop window: show in debug for visual verification; hidden in release.
    init_shop_window(app)?;

    Ok(())
}

/// Initialise the shop window. In debug builds, show it for visual verification.
fn init_shop_window(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let shop = app
        .get_webview_window("shop")
        .ok_or("shop window not found in tauri.conf.json — check windows array")?;

    #[cfg(debug_assertions)]
    {
        shop.show()?;
        shop.set_focus()?;
    }

    let _ = shop; // suppress unused warning in release
    Ok(())
}

/// Agent-event IPC socket daemon (Phase 03).
fn init_ipc(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    ipc::spawn_daemon(app.handle().clone());
    Ok(())
}

/// System tray + menu (Phase 06).
fn init_tray(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    tray::init_tray(app)
}

/// Poll the OS cursor (~30 fps) and toggle the pet window between click-through
/// (cursor away → clicks pass through) and capture (cursor over pet body → draggable).
fn start_click_through_poll(app: AppHandle) {
    let applied: Arc<Mutex<Option<bool>>> = Arc::new(Mutex::new(None));
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(33));
        let app_main = app.clone();
        let applied = applied.clone();
        let dispatched = app.run_on_main_thread(move || {
            let Some(pet) = app_main.get_webview_window("pet") else {
                return;
            };
            if !pet.is_visible().unwrap_or(true) {
                return;
            }
            let want_ignore = !cursor_over_pet(&app_main, &pet);
            let mut applied = applied.lock().unwrap();
            if *applied != Some(want_ignore) && pet.set_ignore_cursor_events(want_ignore).is_ok() {
                *applied = Some(want_ignore);
            }
        });
        if dispatched.is_err() {
            break;
        }
    });
}

/// Is the OS cursor within the pet's interactive rect?
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
