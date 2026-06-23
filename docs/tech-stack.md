# Copet — Tech Stack

> Cross-platform desktop pet phản ứng theo AI coding agent, full Tamagotchi gamification.
> Status: **Approved** 2026-06-22 (via /bootstrap --full)

## Quyết định cốt lõi
- **Platform:** Tauri v2 (Rust + Web), cross-platform macOS / Windows / Linux
- **Core value:** pet phản ứng theo trạng thái agent — `working` / `waiting` / `done` / `idle`
- **Agents (MVP):** Claude Code, Codex CLI, Gemini CLI qua native hooks; universal wrapper fallback (cover Cursor & CLI khác)
- **Gamification:** Full Tamagotchi — stats decay, feeding, XP/level, evolution, token economy + **shop (food + cosmetics)**
- **Pet variety:** 1 pet MVP, dựng trên **Petdex-compatible pet-pack format** (mở rộng được)

## Stack

### Desktop shell
- **Tauri v2** — window pet trong suốt, always-on-top; windows riêng cho Stats HUD / Settings / Shop / Sessions control panel (runtime-built)
- macOS: `macOSPrivateApi: true`, `ActivationPolicy::Accessory` (ẩn khỏi Dock); NEW AppKit deps (objc2, objc2-app-kit, objc2-foundation) for native fullscreen overlay + multi-monitor popover positioning
- Plugins: `tauri-plugin-positioner`, `window-state`, `global-shortcut`, `autostart`, `notification`, `store`

### Backend (Rust)
- Tauri core: tokio async runtime
- IPC daemon: crate **`interprocess`** — Unix domain socket (mac/linux) / named pipe (win), path `/tmp/copet-{uid}.sock`
- **`copet-hook`** — sidecar binary Rust (~500KB): đọc hook JSON từ stdin → map state → enrich (tool_input, cwd, message, prompt) → opt-in transcript parse (Claude only) → ghi socket
- **`copet run -- <cmd>`** — universal wrapper (process lifecycle → working/done)
- **`objc2`**, **`objc2-app-kit`**, **`objc2-foundation`** — macOS only; native AppKit for fullscreen overlay behavior + multi-monitor popover positioning (NSScreen, NSEvent, NSWindow)

### Frontend (web, trong webview)
- **Pet render:** Vanilla TS + **Canvas 2D + spritesheet** (pause khi `visibilitychange`)
- **UI panels** (HUD / Settings / Shop): **SolidJS** (nhẹ, không VDOM)
- **State machine:** `@xstate/store` (<1KB)
- Build: Vite + TypeScript; package manager **pnpm**

### Persistence
- `tauri-plugin-store` (JSON) cho pet state / stats / economy
- SQLite (`tauri-plugin-sql`) **hoãn** — chỉ thêm nếu cần history/achievements

### Agent state detection
| Agent | Cơ chế | working | waiting | done |
|---|---|---|---|---|
| Claude Code | hooks (settings.json) | PreToolUse / UserPromptSubmit | Notification[idle/permission] | Stop / SessionEnd |
| Codex CLI | hooks + notify | preToolUse | approval-requested | agent-turn-complete |
| Gemini CLI | hooks v1 | BeforeTool / BeforeAgent | AfterModel | AfterAgent |
| Cursor / khác | universal wrapper | process running | — | exit code |

### Pet-pack format
- Petdex-compatible: `pet.json` + spritesheet (8×9 grid, 192×208 px/frame)
- Mở rộng qua field `copet_extensions` cho state thêm (eat / sleep / drag / working / celebrate)

## Rejected alternatives
- **Electron** — nặng (~150MB, RAM cao) vs Tauri (~10MB). Pet chạy nền liên tục → chọn Tauri.
- **Native SwiftUI** — chỉ macOS; cần cross-platform.
- **Live2D / Rive / Lottie / PixiJS** — overhead không xứng cho 1 sprite pet nhỏ.
- **Full XState** (~40KB) — `@xstate/store` (<1KB) là đủ.

## Rủi ro chính (xem research reports)
1. Tauri transparent-window click-through (issue #13070) — MVP: pet bắt click trên pixel của nó, vùng trong suốt pass-through (macOS native). **PoC sớm.** ✅ Shipped macOS; Win/Linux best-effort cursor-poll.
2. Cursor không có CLI hooks — chỉ wrapper (working/done). Awaiting Cursor API release.
3. macOS fullscreen che overlay — ✅ solved AppKit NSScreenSaverWindowLevel + FullScreenAuxiliary (shipped 2026-06-23).
4. macOS multi-monitor popover positioning — ✅ AppKit NSEvent::mouseLocation + NSScreen::visibleFrame (more reliable than Tauri #7890, #7139). Shipped; Win/Linux pending P-0 verification.

## References
- `plans/reports/research-260622-1501-tauri-desktop-pet-overlay-report.md`
- `plans/reports/research-260622-1501-multi-agent-cli-state-detection-report.md`
- `plans/reports/researcher-260622-1511-pet-animation-tamagotchi-report.md`
