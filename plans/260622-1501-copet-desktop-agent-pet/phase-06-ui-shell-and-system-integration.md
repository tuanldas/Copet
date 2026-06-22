# Phase 06 — UI Shell + System Integration

> Stats HUD + Settings (SolidJS), system tray menu, global shortcut, autostart, notification, positioner + window-state. Depends P01 (windows) + P02 (pet portrait cho HUD) + P04 (stats data).

## Context / Links
- Research: `plans/reports/research-260622-1501-tauri-desktop-pet-overlay-report.md` §2.3 (tray), §2.2 (positioner/window-state), §2.5 (shortcut/autostart/notification)
- Design: `docs/design-guidelines.md` §UI components (HUD ~280px, Settings toggles), §Color/Typography/Spacing

## Requirements
1. Stats HUD window (SolidJS, right-click pet mở): card ~280px — pet portrait + 4 stat bar (đổi màu green→amber→red) + vòng level/XP + hàng agent status (icon+text+dot màu theo state).
2. Settings window (SolidJS): toggle tích hợp từng agent, hotkey config, autostart toggle, chọn pet, vị trí pet, reduced-motion toggle.
3. System tray: icon + menu (Show/Hide Pet, Open HUD, Settings, Shop, Quit); tray icon/tooltip đổi theo agent state (nối ở P07; P06 expose `set_tray_state`).
4. Global shortcut: toggle pet visibility (default `CmdOrCtrl+Shift+P`, đổi được trong Settings).
5. Autostart: enable/disable qua plugin; reflect trong Settings.
6. Notification: helper emit notification (vd evolution, pet ngất) — dùng plugin.
7. Window position: `tauri-plugin-positioner` (preset corner) + `tauri-plugin-window-state` (nhớ vị trí pet per-monitor, restore validate).

## Data flow
```
right-click pet (P02 canvas) → invoke('open_hud') → show/create HUD window
HUD subscribes listen('stats-changed') (P04) + listen('agent-status-changed') (P03) → render bars/status
Settings toggle → invoke commands (enable_autostart, set_shortcut, set_pet, ...) → persist (store)
tray menu event → show/hide windows / quit
global-shortcut → toggle pet window visible
drag end (P02) → saveWindowState(POSITION); app start → restoreStateCurrent(POSITION)
```

## Files to create
- `frontend/ui/hud/StatsHud.tsx` — SolidJS HUD (portrait, stat bars, xp ring, agent status row)
- `frontend/ui/hud/StatBar.tsx`, `frontend/ui/hud/AgentStatusRow.tsx` — subcomponents
- `frontend/ui/hud/hud.css` + `hud.html`
- `frontend/ui/settings/Settings.tsx` — toggles (agents, hotkey, autostart, pet select, position, reduced-motion)
- `frontend/ui/settings/settings.css` + `settings.html`
- `frontend/ui/shared/design-tokens.css` — colors/spacing/radius/fonts từ design-guidelines (DRY, dùng chung HUD/Settings/Shop)
- `frontend/ui/shared/tauri-commands.ts` — typed wrappers cho invoke() commands
- `src-tauri/src/tray/tray.rs` — TrayIconBuilder + menu + on_menu_event; `set_tray_state(state)` API (icon+tooltip)
- `src-tauri/src/tray/mod.rs`
- `src-tauri/src/commands/window_commands.rs` — `open_hud`, `open_settings`, `open_shop`, `toggle_pet`, `set_position`
- `src-tauri/src/commands/system_commands.rs` — `enable_autostart`, `set_shortcut`, `select_pet`
- `src-tauri/src/commands/mod.rs` — register handlers
- `src-tauri/icons/tray/` — tray icons per-state (working/waiting/done/idle/error) — hoặc tint runtime

## Files to modify
- `src-tauri/src/lib.rs` — register `tauri-plugin-positioner`, `window-state`, `global-shortcut`, `autostart`, `notification`; `init_tray()`; `invoke_handler` add commands; (window-state restore)
- `src-tauri/Cargo.toml` — add 5 plugins (positioner, window-state, global-shortcut, autostart, notification)
- `src-tauri/tauri.conf.json` — add windows `stats`(hud), `settings` (hidden default, decorations false, KHÔNG transparent — panel đặc); plugins config
- `src-tauri/capabilities/default.json` — perms: positioner, window-state, global-shortcut, autostart, notification, tray, các command
- `frontend/pet/index.ts` (P02) — add right-click handler → `invoke('open_hud')` → **coordinate P02** (chỉ thêm listener, không sửa render core)
- `package.json` — `solid-js`, `vite-plugin-solid` (nếu chưa); `vite.config.ts` multi-page (hud.html, settings.html)

## Implementation steps
1. Plugins: add 5 Tauri plugins + JS counterparts; permissions trong capabilities.
2. `tray.rs`: build menu (Show/Hide, HUD, Settings, Shop, Quit); on_menu_event route tới window commands/exit; expose `set_tray_state` (set_icon + set_tooltip). Gọi trong `init_tray(app)`.
3. `design-tokens.css`: CSS vars từ design-guidelines (palette, fonts Pixelify Sans/Nunito/JetBrains Mono, spacing/radius scale) — import bởi mọi panel.
4. HUD SolidJS: portrait (canvas nhỏ render pet idle frame hoặc tĩnh), 4 StatBar (màu theo ngưỡng), xp ring (level/xp từ P04), AgentStatusRow (listen agent event). Window ~280px.
5. Settings SolidJS: toggles → invoke commands → persist store; hotkey input → `set_shortcut` (re-register global-shortcut); autostart toggle → plugin enable/disable + isEnabled reflect.
6. global-shortcut: register default toggle pet visibility; cho Settings đổi.
7. window-state: on drag end (P02 emits) save POSITION; on start restore (validate monitor). positioner cho "reset vị trí" preset corner.
8. notification helper: `tauri-commands.ts` expose `notify(title,body)`.

## Tests / Validation
- `cargo check` + `cargo clippy` sạch (tray, commands, plugins).
- `pnpm tsc --noEmit` sạch (SolidJS + tsx).
- Manual: tray menu mở HUD/Settings/Shop, Quit thoát; HUD hiện 4 stat bar đổi màu khi stat giảm (chạy cùng P04); right-click pet mở HUD; global shortcut ẩn/hiện pet; autostart toggle (check login items macOS); kéo pet → quit → mở lại đúng vị trí; reduced-motion toggle ảnh hưởng anim (P02).
- (Light) unit test `tauri-commands.ts` typing nếu có logic.

## Risks & Rollback
| Risk | Mức | Mitigation |
|---|---|---|
| macOS fullscreen che pet (overlay) | Med | NSWindowLevel override (objc2 raw call); xác minh plugin/cách cụ thể (research câu hỏi mở §1) |
| Focus stealing khi click panel (Win) | Med | `WS_EX_NOACTIVATE` qua raw window handle; panel KHÔNG focusable nếu được |
| Multi-monitor restore sai sau unplug | Low | window-state tự validate available monitors |
| global-shortcut conflict app khác | Low | Cho đổi trong Settings; default ít đụng |
| Transparent panel mất blur | Low (by design) | Panel đặc + shadow (design note) — không transparent |

**Rollback:** tray/commands/plugins modular; nếu 1 plugin lỗi, gỡ registration → app core (pet) vẫn chạy. HUD/Settings là window riêng, lỗi không sập pet.

## File ownership (song song)
Wave B (cùng P05). SỞ HỮU `frontend/ui/hud/*`, `frontend/ui/settings/*`, `frontend/ui/shared/*`, `src-tauri/src/tray/*`, `src-tauri/src/commands/*`. **Đụng `lib.rs`/`Cargo.toml`/`tauri.conf.json`/`capabilities` cùng P03+P05** → CRITICAL coordinate: tách `setup()` thành `init_ipc`(P03)/`init_tray`(P06)/`init_windows`/`init_plugins`(P06) ngay từ P01; window list trong tauri.conf.json — P06 thêm hud/settings, P05 thêm shop (khác label, append-only, ít conflict). Nếu lo merge: làm phần Rust shared tuần tự (P06 sau P03), frontend song song.

## Open questions
1. macOS fullscreen overlay: plugin/cách cụ thể override NSWindowLevel? (research §5.1) — cần verify trước khi commit; nếu khó, chấp nhận pet ẩn khi app fullscreen ở MVP.
2. HUD portrait: render canvas live hay frame tĩnh? — MVP đề xuất frame tĩnh (nhẹ).
