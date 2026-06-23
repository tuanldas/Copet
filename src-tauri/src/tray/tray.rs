// tray.rs — System tray icon + menu for Copet (Phase 06).
//
// Menu items: Show/Hide Pet | Open HUD | Settings | Shop | Quit
// set_tray_state(app, state) — updates tooltip per agent state (P07 will call this).
// init_tray(app) — called once from lib.rs setup().

use tauri::{
    App, AppHandle, Manager, Monitor, PhysicalPosition, WebviewWindow,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    image::Image,
};
use tauri_plugin_positioner::on_tray_event;

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
        .on_tray_icon_event(move |tray, event| {
            // Record the tray icon position so the positioner can anchor the popover.
            on_tray_event(tray.app_handle(), &event);
            // Left-click toggles the sessions popover. Pet visibility is via the
            // tray menu ("Show / Hide Pet") and the global shortcut.
            if let TrayIconEvent::Click { button, button_state, .. } = event {
                if button == MouseButton::Left && button_state == MouseButtonState::Up {
                    // Clone into the run_on_main_thread closure — avoids borrow+move conflict.
                    let h = handle_click.clone();
                    let _ = handle_click.run_on_main_thread(move || toggle_sessions_popover(&h));
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

/// Toggle the sessions popover: show under the cursor (on the cursor's monitor),
/// or hide.
///
/// Multi-monitor fix: the previous `Position::TrayBottomCenter` anchored to the
/// tray-icon rect and reliably landed on the primary monitor only. Instead we
/// place the popover on whichever monitor the cursor is on (the menu-bar icon the
/// user just clicked), so it follows them across displays. Positioning runs
/// before `show()` so the window never flashes on the wrong screen first.
pub fn toggle_sessions_popover(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("sessions") {
        let visible = win.is_visible().unwrap_or(false);
        if visible {
            let _ = win.hide();
        } else {
            position_popover_at_cursor(app, &win);
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

/// Place `win` horizontally centred under the cursor, near the top of whichever
/// monitor the cursor is on (menu-bar popover anchoring). No-op on any failure.
fn position_popover_at_cursor(app: &AppHandle, win: &WebviewWindow) {
    let Ok(cursor) = app.cursor_position() else {
        return;
    };
    let Some(monitor) = cursor_monitor(win, cursor.x, cursor.y) else {
        return;
    };
    let Ok(win_size) = win.outer_size() else {
        return;
    };
    let mpos = monitor.position();
    let msize = monitor.size();
    let margin = (8.0 * monitor.scale_factor()).round() as i32;
    let (x, y) = popover_position(
        cursor.x as i32,
        mpos.x,
        mpos.y,
        msize.width as i32,
        win_size.width as i32,
        margin,
    );
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

/// The monitor whose bounds contain the point (physical px); falls back to primary.
fn cursor_monitor(win: &WebviewWindow, x: f64, y: f64) -> Option<Monitor> {
    let monitors = win.available_monitors().ok()?;
    monitors
        .into_iter()
        .find(|m| {
            let p = m.position();
            let s = m.size();
            point_in_rect(x, y, p.x, p.y, s.width, s.height)
        })
        .or_else(|| win.primary_monitor().ok().flatten())
}

/// Is the physical point (px, py) inside the rect at (x, y) of size (w, h)?
fn point_in_rect(px: f64, py: f64, x: i32, y: i32, w: u32, h: u32) -> bool {
    px >= x as f64 && px < x as f64 + w as f64 && py >= y as f64 && py < y as f64 + h as f64
}

/// Top-left for the popover: horizontally centred on `cursor_x`, clamped within
/// the monitor's horizontal bounds, at `mon_y + margin` (just below the menu bar).
/// Pure (no Tauri types) so the cross-monitor math is unit-testable.
fn popover_position(
    cursor_x: i32,
    mon_x: i32,
    mon_y: i32,
    mon_w: i32,
    win_w: i32,
    margin: i32,
) -> (i32, i32) {
    let min_x = mon_x + margin;
    let max_x = mon_x + mon_w - win_w - margin;
    let centred = cursor_x - win_w / 2;
    // When the window is wider than the monitor's usable width, pin to the left edge.
    let x = if max_x >= min_x {
        centred.clamp(min_x, max_x)
    } else {
        min_x
    };
    (x, mon_y + margin)
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

#[cfg(test)]
mod tests {
    use super::{point_in_rect, popover_position};

    #[test]
    fn point_in_rect_inside_and_boundaries() {
        // 1920x1080 monitor at origin.
        assert!(point_in_rect(100.0, 100.0, 0, 0, 1920, 1080));
        assert!(point_in_rect(0.0, 0.0, 0, 0, 1920, 1080)); // top-left inclusive
        assert!(!point_in_rect(1920.0, 100.0, 0, 0, 1920, 1080)); // right edge exclusive
        assert!(!point_in_rect(-1.0, 100.0, 0, 0, 1920, 1080));
    }

    #[test]
    fn point_in_rect_secondary_monitor_to_the_right() {
        // External monitor at x=1920. A cursor at 2500 is on it, not on primary.
        assert!(point_in_rect(2500.0, 50.0, 1920, 0, 1920, 1080));
        assert!(!point_in_rect(500.0, 50.0, 1920, 0, 1920, 1080));
    }

    #[test]
    fn popover_centres_on_cursor_when_room() {
        // Primary monitor, cursor mid-screen, 300px-wide popover, 8px margin.
        let (x, y) = popover_position(1000, 0, 0, 1920, 300, 8);
        assert_eq!(x, 1000 - 150); // centred
        assert_eq!(y, 8); // just below the menu bar
    }

    #[test]
    fn popover_clamps_to_monitor_right_edge() {
        // Cursor near the right edge → popover stays fully on-screen.
        let (x, _) = popover_position(1900, 0, 0, 1920, 300, 8);
        assert_eq!(x, 1920 - 300 - 8);
    }

    #[test]
    fn popover_on_external_monitor_stays_on_that_monitor() {
        // External monitor to the right (origin x=1920). Cursor at 2000 → popover
        // must land within [1920, 3840), never back on the primary monitor.
        let (x, y) = popover_position(2000, 1920, 0, 1920, 300, 8);
        assert!(x >= 1920 + 8, "x={x} should be on the external monitor");
        assert!(x <= 1920 + 1920 - 300 - 8);
        assert_eq!(y, 8);
    }

    #[test]
    fn popover_on_external_monitor_to_the_left() {
        // External monitor to the LEFT (negative origin). Cursor at -1000.
        let (x, _) = popover_position(-1000, -1920, 0, 1920, 300, 8);
        assert!((-1920 + 8..=-8 - 300).contains(&x));
    }
}
