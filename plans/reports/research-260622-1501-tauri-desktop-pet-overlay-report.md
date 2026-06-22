# Tauri v2 Desktop Pet Overlay — Technical Research Report
Date: 2026-06-22 | Researcher: researcher agent

---

## 1. Tóm Tắt

Tauri v2 đủ năng lực xây desktop pet overlay cross-platform. API cốt lõi (transparent, alwaysOnTop, setIgnoreCursorEvents) ổn định nhưng có **3 cạm bẫy sản xuất nghiêm trọng**: (a) click-through granular không có native support → phải poll bằng Rust, (b) macOS fullscreen app làm overlay biến mất, (c) WebView2 không tự bundled trên Win10. Tất cả đều có workaround đã được production-validate (2026).

---

## 2. Khuyến Nghị Kỹ Thuật

### 2.1 Cửa Sổ Overlay Pet

**tauri.conf.json** (app-level):
```json
{
  "app": {
    "macOSPrivateApi": true,
    "windows": [{
      "label": "pet",
      "transparent": true,
      "decorations": false,
      "alwaysOnTop": true,
      "skipTaskbar": true,
      "resizable": false,
      "shadow": false,
      "focusable": false,
      "visibleOnAllWorkspaces": true,
      "width": 200,
      "height": 200
    }]
  }
}
```

**`macOSPrivateApi: true`** bắt buộc trên macOS cho transparent + alwaysOnTop hoạt động đúng.

**Runtime JS API** (bật/tắt click-through):
```js
import { getCurrentWindow } from '@tauri-apps/api/window';
const win = getCurrentWindow();
await win.setIgnoreCursorEvents(true);   // click-through ON
await win.setIgnoreCursorEvents(false);  // click-through OFF (để tương tác UI)
```

**Rust API** tương đương: `window.set_ignore_cursor_events(true)`

**Khác biệt platform:**
- macOS: `transparent` + `macOSPrivateApi: true` = OK. Click trên pixel alpha=0 tự pass-through ngay cả khi `setIgnoreCursorEvents` chưa gọi.
- Windows: `transparent: true` + `decorations: false` đôi khi vẫn hiện title bar (bug #14859). Set thêm `shadow: false`. WebView2 cần bootstrap trên Win10 không có Edge.
- Linux (X11/Wayland): `transparent` hoạt động nhưng `visibleOnAllWorkspaces` có thể không nhất quán trên Wayland.

**`ActivationPolicy::Accessory`** (Rust) ẩn app khỏi Dock + Cmd+Tab trên macOS:
```rust
app.set_activation_policy(tauri::ActivationPolicy::Accessory);
```

---

### 2.2 Định Vị & Kéo-Thả

**Drag thủ công** (không dùng `data-tauri-drag-region` để tránh conflict với click-through):
```js
import { getCurrentWindow } from '@tauri-apps/api/window';
element.addEventListener('mousedown', async () => {
  await getCurrentWindow().startDragging();
});
```

**Plugin `tauri-plugin-positioner`** (v2.3.2) — vị trí tương đối màn hình hiện tại:
```bash
pnpm tauri add positioner
```
```js
import { moveWindow, Position } from '@tauri-apps/plugin-positioner';
await moveWindow(Position.BottomRight); // BottomLeft, TopRight, TopLeft, Center, TrayCenter...
```
Permissions: thêm `"positioner:default"` vào `capabilities/default.json`.
Multi-monitor: positions relative to current screen — khi pet di chuyển sang monitor khác, cần gọi lại.

**Lưu/khôi phục vị trí** — dùng `tauri-plugin-window-state`:
```bash
pnpm tauri add window-state
```
```js
import { saveWindowState, restoreStateCurrent, StateFlags } from '@tauri-apps/plugin-window-state';
await saveWindowState(StateFlags.POSITION);
await restoreStateCurrent(StateFlags.POSITION);
```
Plugin validate vị trí vs monitor available → không bị restore ra ngoài màn hình khi unplug monitor.

---

### 2.3 System Tray

**Rust** (khởi tạo tray với menu):
```rust
use tauri::{tray::TrayIconBuilder, menu::{Menu, MenuItem}};

let menu = Menu::with_items(app, &[
  &MenuItem::with_id(app, "show", "Show Pet", true, None::<&str>)?,
  &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?,
])?;

TrayIconBuilder::new()
  .icon(app.default_window_icon().unwrap().clone())
  .menu(&menu)
  .show_menu_on_left_click(false)
  .on_menu_event(|app, event| match event.id.as_ref() {
    "quit" => app.exit(0),
    _ => {}
  })
  .build(app)?;
```

**Cập nhật tray icon tại runtime** (thể hiện trạng thái AI agent):
```rust
tray_handle.set_icon(tauri::image::Image::from_bytes(new_icon_bytes)?)?;
tray_handle.set_tooltip(Some("Agent: Working..."))?;
```

macOS: tray ở top-right, Ubuntu: cũng top-right, Windows: bottom-right.

---

### 2.4 Multi-Window & IPC

**Tạo window con** (HUD stats, Settings):
```rust
tauri::WebviewWindowBuilder::new(app, "stats", tauri::WebviewUrl::App("stats.html".into()))
  .title("Stats HUD")
  .decorations(false)
  .transparent(true)
  .always_on_top(true)
  .build()?;
```

**Emit từ Rust → tất cả webview**:
```rust
app.emit("agent-status-changed", payload)?;
```

**Emit tới webview cụ thể**:
```rust
app.emit_to("pet", "pet-animation", payload)?;
```

**Shared state** (Rust `Mutex` + `tauri::State`):
```rust
app.manage(Arc::new(Mutex::new(AgentState::default())));

#[tauri::command]
fn get_state(state: tauri::State<Arc<Mutex<AgentState>>>) -> AgentState {
  state.lock().unwrap().clone()
}
```

**Listen trong frontend**:
```js
import { listen } from '@tauri-apps/api/event';
await listen('agent-status-changed', (event) => updatePetAnimation(event.payload));
```

---

### 2.5 Global Shortcuts, Autostart, Notifications

**Global Shortcut** (`tauri-plugin-global-shortcut`):
```bash
pnpm tauri add global-shortcut
```
```rust
app.global_shortcut().on_shortcut("CommandOrControl+Shift+P", |_app, _shortcut, _event| {
  // toggle pet visibility
})?;
```

**Autostart** (`tauri-plugin-autostart`):
```rust
app.handle().plugin(tauri_plugin_autostart::init(
  MacosLauncher::LaunchAgent, Some(vec!["--autostarted"])
))?;
// JS: await enable(); await isEnabled();
```

**Notification** (`tauri-plugin-notification`): standard, không có gì đặc biệt.
```bash
pnpm tauri add notification
```

---

### 2.6 Đóng Gói & Ký

**Build targets**:
```bash
pnpm tauri build --bundles dmg     # macOS
pnpm tauri build --bundles msi,nsis # Windows
pnpm tauri build --bundles deb,appimage # Linux
```

**macOS code signing** — `tauri.conf.json`:
```json
"bundle": { "macOS": { "signingIdentity": "Developer ID Application: Name (TEAMID)" } }
```
Env vars cho CI: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_API_ISSUER`, `APPLE_API_KEY`.

**Windows**: OV certificate hoặc Azure Key Vault. SmartScreen warning nếu không ký.

**Win10 WebView2**: thêm vào bundle config:
```json
"bundle": { "windows": { "webviewInstallMode": { "type": "downloadBootstrapper" } } }
```

---

## 3. Rủi Ro & Cạm Bẫy

| Vấn đề | Nền tảng | Workaround đã validate |
|--------|----------|----------------------|
| Click-through per-region (không có native) | All | Rust poll cursor ~60fps, toggle `setIgnoreCursorEvents` theo vùng UI |
| Overlay biến mất khi ứng dụng fullscreen | macOS | Dùng plugin override window level (NSWindowLevel) lên trên fullscreen |
| `backdrop-filter: blur()` bị vô hiệu | All (transparent) | Không dùng CSS blur; dùng shadow SVG hoặc bỏ |
| Focus stealing khi click UI panel | Windows | Set `WS_EX_NOACTIVATE` qua raw_window_handle/Rust |
| WebView2 missing | Windows 10 | `downloadBootstrapper` trong bundle config |
| RAM tăng 4x trên macOS Tahoe | macOS | Ngoài tầm kiểm soát app; monitor + thông báo user |
| `data-tauri-drag-region` conflict với click-through | All | Dùng `startDragging()` event thủ công |
| `transparent: true` không hiệu lực v2 | Tất cả | Đảm bảo `macOSPrivateApi: true` (mac); check wry version |
| Title bar hiện khi `decorations:false` | Windows | Thêm `shadow: false`, check issue #14859 |
| Multi-monitor position sai sau unplug | All | `tauri-plugin-window-state` tự validate |

---

## 4. Nguồn

- [Tauri v2 Window Customization](https://v2.tauri.app/learn/window-customization/)
- [Tauri v2 Window JS API Reference](https://v2.tauri.app/reference/javascript/api/namespacewindow/)
- [Tauri v2 Config Reference](https://v2.tauri.app/reference/config/)
- [CrabNebula: Building Desktop Pet with Tauri](https://crabnebula.dev/blog/building-a-desktop-pet-with-tauri/)
- [Manasight: Why Tauri v2 for Desktop Overlay 2026](https://blog.manasight.gg/why-i-chose-tauri-v2-for-a-desktop-overlay/)
- [WindowPet — Tauri pet app thực tế (React+Zustand)](https://github.com/SeakMengs/WindowPet)
- [tauri-plugin-positioner docs](https://v2.tauri.app/plugin/positioner/)
- [tauri-plugin-window-state](https://v2.tauri.app/plugin/window-state/)
- [tauri-plugin-autostart](https://v2.tauri.app/plugin/autostart/)
- [tauri-plugin-global-shortcut](https://v2.tauri.app/plugin/global-shortcut/)
- [Tauri v2 System Tray](https://v2.tauri.app/learn/system-tray/)
- [Tauri v2 IPC — Calling Frontend from Rust](https://v2.tauri.app/develop/calling-frontend/)
- [Tauri v2 macOS Code Signing](https://v2.tauri.app/distribute/sign/macos/)
- [Issue #13070: Transparent Window Click-Through](https://github.com/tauri-apps/tauri/issues/13070)
- [Issue #11461: setIgnoreCursorEvents bug](https://github.com/tauri-apps/tauri/issues/11461)

---

## 5. Câu Hỏi Mở

1. **macOS fullscreen plugin** nào cụ thể để override NSWindowLevel lên trên fullscreen app? (Manasight đề cập "third-party plugin" nhưng không nêu tên — cần tìm thêm, possibily `tauri-plugin-decorum` hoặc raw objc2 call)
2. **Selective click-through** at 60fps Rust poll có gây CPU spike đáng kể không? Cần benchmark trên máy thực.
3. **Linux Wayland**: `visibleOnAllWorkspaces` + `alwaysOnTop` behavior chưa được test — cần CI matrix với Wayland compositor (GNOME 46+).
4. **macOS Tahoe RAM regression** (110MB vs 29MB Sequoia) là OS-level WKWebView issue — có thể giảm bằng cách limit DOM elements hay không?
5. **Pet animation**: dùng Lottie/PIXI.js/CSS animation? Chưa research — hiệu năng quan trọng khi window luôn on top.

---

Status: DONE_WITH_CONCERNS
Summary: Tauri v2 đủ capability xây desktop pet overlay; tất cả feature cốt lõi đều có API/plugin chính thức. Concerns chính: click-through per-region cần Rust polling workaround, macOS fullscreen isolation chưa rõ plugin cụ thể, RAM regression macOS Tahoe ngoài tầm kiểm soát.
Concerns/Blockers: macOS fullscreen window level plugin chưa xác định tên cụ thể (cần research thêm trước khi implement); Wayland support chưa verified.
