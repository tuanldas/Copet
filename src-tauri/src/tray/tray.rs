// tray.rs — System tray icon + menu for Copet (Phase 06).
//
// Menu items: Show/Hide Pet | Open HUD | Settings | Shop | Quit
// set_tray_state(app, state) — updates tooltip per agent state (P07 will call this).
// init_tray(app) — called once from lib.rs setup().

use tauri::{
    App, AppHandle, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    image::Image,
};

/// Tray icon PNG embedded at compile time — avoids runtime path resolution.
static TRAY_ICON_BYTES: &[u8] = include_bytes!("../../icons/tray/tray.png");

/// Decode embedded PNG bytes into a Tauri `Image` (RGBA8).
fn decode_png_to_tauri_image(png_bytes: &[u8]) -> Result<Image<'static>, Box<dyn std::error::Error>> {
    use std::io::Cursor;
    let decoder = png::Decoder::new(Cursor::new(png_bytes));
    let mut reader = decoder.read_info()?;
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf)?;
    let width = info.width;
    let height = info.height;

    // Ensure we have RGBA8 data; convert RGB → RGBA if needed.
    let rgba_buf: Vec<u8> = match info.color_type {
        png::ColorType::Rgba => buf[..info.buffer_size()].to_vec(),
        png::ColorType::Rgb => {
            buf[..info.buffer_size()]
                .chunks(3)
                .flat_map(|rgb| [rgb[0], rgb[1], rgb[2], 255])
                .collect()
        }
        _ => return Err("Unsupported PNG colour type for tray icon".into()),
    };

    Ok(Image::new_owned(rgba_buf, width, height))
}

/// Agent states reflected in tray tooltip (P07 calls set_tray_state).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)] // P07 will use all variants
pub enum TrayAgentState {
    Idle,
    Working,
    Waiting,
    Done,
    Error,
}

impl TrayAgentState {
    pub fn tooltip(self) -> &'static str {
        match self {
            TrayAgentState::Idle => "Copet — idle",
            TrayAgentState::Working => "Copet — agent working",
            TrayAgentState::Waiting => "Copet — waiting for input",
            TrayAgentState::Done => "Copet — task done",
            TrayAgentState::Error => "Copet — error",
        }
    }
}

/// Build and register the system tray. Called once from lib.rs init_tray().
pub fn init_tray(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    // Two separate clones: one per closure (they cannot share ownership).
    let handle_menu = app.handle().clone();
    let handle_click = app.handle().clone();

    // ── Menu items ────────────────────────────────────────────────────────────
    let show_hide = MenuItem::with_id(app, "show_hide", "Show / Hide Pet", true, None::<&str>)?;
    let open_hud = MenuItem::with_id(app, "open_hud", "Open HUD", true, None::<&str>)?;
    let open_settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let open_shop = MenuItem::with_id(app, "shop", "Shop", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = PredefinedMenuItem::quit(app, Some("Quit Copet"))?;

    let menu = Menu::with_items(
        app,
        &[&show_hide, &open_hud, &open_settings, &open_shop, &sep, &quit],
    )?;

    // ── Embedded tray icon ────────────────────────────────────────────────────
    let icon = decode_png_to_tauri_image(TRAY_ICON_BYTES)?;

    TrayIconBuilder::with_id("main-tray")
        .tooltip("Copet — idle")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |_app, event| {
            handle_menu_event(&handle_menu, event.id.as_ref());
        })
        .on_tray_icon_event(move |_tray, event| {
            // Left-click toggles pet visibility (same as Show/Hide menu item).
            if let TrayIconEvent::Click { button, button_state, .. } = event {
                if button == MouseButton::Left && button_state == MouseButtonState::Up {
                    // Clone into the run_on_main_thread closure — avoids borrow+move conflict.
                    let h = handle_click.clone();
                    let _ = handle_click.run_on_main_thread(move || toggle_pet_window(&h));
                }
            }
        })
        .build(app)?;

    Ok(())
}

/// Route tray menu events to window actions or app quit.
fn handle_menu_event(app: &AppHandle, id: &str) {
    match id {
        "show_hide" => toggle_pet_window(app),
        "open_hud" => open_window(app, "stats"),
        "settings" => open_window(app, "settings"),
        "shop" => open_window(app, "shop"),
        _ => {} // "quit" is a PredefinedMenuItem — handled by Tauri automatically.
    }
}

/// Toggle pet window visibility.
pub fn toggle_pet_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("pet") {
        let visible = win.is_visible().unwrap_or(false);
        if visible {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

/// Show and focus a window by label (declared in tauri.conf.json).
pub fn open_window(app: &AppHandle, label: &str) {
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// Update tray tooltip to reflect current agent state.
/// Called from P07 (agent-status-changed handler) on state transitions.
#[allow(dead_code)] // P07 will call this
pub fn set_tray_state(app: &AppHandle, state: TrayAgentState) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_tooltip(Some(state.tooltip()));
    }
}
