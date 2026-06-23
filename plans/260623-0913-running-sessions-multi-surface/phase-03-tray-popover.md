---
phase: 3
title: Tray popover
status: completed
priority: P2
dependencies:
  - 1
  - 2
effort: ~1d
---

# Phase 3: Tray popover

## Overview

Cửa sổ popover nhỏ kiểu menu-bar bật ra khi **left-click tray icon**, neo ngay dưới icon, tái dùng `SessionList` từ Phase 2, tự ẩn khi mất focus. Toggle pet chuyển sang dùng menu phải + hotkey (vẫn còn). Đây là phần phụ thuộc Tauri/macOS nhiều nhất → TDD hạn chế, chủ yếu E2E thủ công.

## Requirements

- Functional:
  - Window `sessions` (transparent, frameless, always-on-top, skipTaskbar, ẩn mặc định).
  - Left-click tray → hiện popover neo dưới icon (`Position::TrayBottomCenter`); click lại khi đang hiện → ẩn.
  - Click ra ngoài (mất focus) → popover tự ẩn.
  - Popover render `SessionList` (nghe `sessions-snapshot`, theme, ticker) y như HUD.
- Non-functional: không phá toggle-pet (giữ menu "Show / Hide Pet" + global shortcut). macOS-first; Win/Linux best-effort.

## Architecture

```
Tray left-click (tray.rs)
  → tauri_plugin_positioner::on_tray_event(app, &event)   // BẮT BUỘC: đăng ký vị trí tray
  → nếu popover visible → hide; ngược lại → move_window(TrayBottomCenter) + show + set_focus
Popover window (sessions-entry.tsx)
  → onFocusChanged(focused => if(!focused && !justShown) hide())   // blur-to-hide
  → <SessionList/> (createSessionsSignal + createThemeSignal + createNowSignal)
```

## Related Code Files

- Modify: `src-tauri/Cargo.toml` — bật `tauri-plugin-positioner = { version = "2", features = ["tray-icon"] }` (BẮT BUỘC: `on_tray_event` + `Position::TrayBottomCenter` + runtime `Tray` state đều feature-gated).
- Modify: `src-tauri/tauri.conf.json` — thêm window `sessions`.
- Modify: `vite.config.ts` — `rollupOptions.input.sessions = "sessions.html"`.
- Create: `sessions.html` (root) — mirror `hud.html`, div `#sessions-root` + script `src/ui/sessions/sessions-entry.tsx`.
- Create: `src/ui/sessions/sessions-entry.tsx` — mount `SessionList` + blur-to-hide.
- Create: `src/ui/sessions/sessions.css` — nền trong suốt (html/body transparent) + panel.
- Create: `src-tauri/capabilities/sessions.json` — capability window `sessions`.
- Modify: `src-tauri/src/tray/tray.rs` — `on_tray_event` forward + left-click → popover; cập nhật comment (left-click không còn toggle pet).

## Implementation Steps

### A. Cargo feature + config + window

0. **`Cargo.toml` (LÀM TRƯỚC TIÊN):** `tauri-plugin-positioner = "2"` → `tauri-plugin-positioner = { version = "2", features = ["tray-icon"] }`. Thiếu feature → `on_tray_event`/`Position::TrayBottomCenter`/runtime `Tray` state KHÔNG tồn tại → build fail/panic. `cargo check` lại sau khi đổi.
1. `tauri.conf.json` thêm:
   ```json
   { "label": "sessions", "title": "Copet Sessions", "url": "sessions.html",
     "width": 300, "height": 360, "transparent": true, "decorations": false,
     "alwaysOnTop": true, "skipTaskbar": true, "visible": false, "resizable": false, "focus": true, "shadow": false }
   ```
2. `vite.config.ts`: thêm `sessions: "sessions.html"` vào input.
3. `sessions.html`: copy cấu trúc `hud.html`, đổi root id + script entry.
4. `sessions.css`: `html,body{background:transparent;margin:0}` + `.sessions-panel` (nền mờ, bo góc, padding) — dùng design-tokens.

### B. Capability

5. `capabilities/sessions.json` (positioning làm **Rust-side** qua `WindowExt.move_window` — trait call, KHÔNG bị IPC permission-gate → KHÔNG cần `positioner:*`):
   ```json
   { "$schema": "../gen/schemas/desktop-schema.json", "identifier": "sessions",
     "description": "Capability for the sessions popover (listens sessions-snapshot, self show/hide)",
     "windows": ["sessions"],
     "permissions": ["core:default","core:event:default","store:default",
       "core:window:allow-hide","core:window:allow-show","core:window:allow-set-focus"] }
   ```

### C. Tray rewire (Rust)

6. `tray.rs`: import `tauri_plugin_positioner::{on_tray_event, Position, WindowExt}`. Trong `on_tray_icon_event`:
   - Gọi `on_tray_event(_tray.app_handle(), &event)` ĐẦU TIÊN (mọi event).
   - Left-click Up → `run_on_main_thread`: lấy window `sessions`; nếu `is_visible()` → `hide()`; ngược lại `show()` → `move_window(Position::TrayBottomCenter)` → `set_focus()` (`move_window` là trait call `WindowExt`, KHÔNG bị IPC permission-gate).
   - Xóa gọi `toggle_pet_window` ở left-click; sửa comment thành "Left-click toggles the sessions popover; pet visibility via menu + shortcut".
   - Giữ menu item "Show / Hide Pet" (đã có) → toggle vẫn dùng được.

### D. Popover frontend

7. `sessions-entry.tsx`: render `SessionList` (3 signal như HUD). Thêm blur-to-hide:
   ```ts
   import { getCurrentWindow } from "@tauri-apps/api/window";
   const win = getCurrentWindow();
   let justShown = false;
   win.onFocusChanged(({ payload: focused }) => {
     if (focused) { justShown = true; setTimeout(() => justShown = false, 200); }
     else if (!justShown) win.hide();
   });
   ```
   (Guard `justShown` tránh race show→blur tức thời trên macOS, issue #13633.)
7b. **Fallback hide (macOS Accessory):** `window.addEventListener("keydown", e => { if (e.key === "Escape") win.hide(); })`. `ActivationPolicy::Accessory` (ẩn dock) có thể khiến popover không nhận focus / blur fire ngay → KHÔNG chỉ dựa `onFocusChanged`; Escape + click-lại-tray (toggle ở tray.rs) là đường thoát chắc chắn.
8. `onMount`: `initLabelTheme()` (qua createThemeSignal).

### E. Verify (E2E thủ công — macOS)

9. `pnpm tauri dev`: left-click tray → popover bật dưới icon, đúng danh sách; click app khác → popover ẩn; left-click lại → bật lại. Right-click menu "Show/Hide Pet" + hotkey vẫn toggle pet. `cargo clippy --workspace` sạch.

## Success Criteria

- [ ] Left-click tray mở/đóng popover neo dưới icon; blur tự ẩn.
- [ ] Popover hiển thị cùng danh sách như HUD (tái dùng `SessionList`, không copy logic).
- [ ] Toggle pet vẫn hoạt động qua menu phải + global shortcut.
- [ ] `Cargo.toml` bật feature `tray-icon`; `cargo check`/`clippy` sạch; test Rust cũ xanh; `tsc --noEmit` sạch.

## Risk Assessment

- **macOS show→blur race (#13633) + Accessory policy**: app chạy `ActivationPolicy::Accessory` → popover có thể không nhận focus / blur fire ngay. Guard `justShown` 200ms + fallback Escape + click-lại-tray (KHÔNG chỉ dựa blur). JS `moveWindow` (nếu dùng) cũng cần Cargo feature `tray-icon`. Must-verify E2E trên macOS thật.
- **Cargo `tray-icon` feature (CRITICAL)**: thiếu → build fail. Repo có 2 lockfile (root `Cargo.lock` có positioner 2.3.2 + `src-tauri/Cargo.lock`); sau khi đổi `Cargo.toml`, chạy `cargo check` để cập nhật đúng lockfile build dùng.
- Win/Linux: tray-relative position + transparent best-effort (giới hạn known của project) → ghi rõ, không block.
- Capability thiếu quyền → popover không show/hide/move: kiểm tra log permission, bổ sung quyền đúng.
- Quên thêm vite input `sessions` → trắng trang khi build: checklist mục A.2.
