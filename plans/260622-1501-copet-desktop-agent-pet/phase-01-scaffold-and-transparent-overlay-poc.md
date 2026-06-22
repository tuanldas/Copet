# Phase 01 — Scaffold + Transparent Overlay PoC

> **GATE PHASE.** Verify rủi ro #1 (transparent click-through always-on-top) TRƯỚC khi đầu tư build engine. Nếu không pass trên macOS → dừng, revisit architecture với user.

## Context / Links
- Stack: `docs/tech-stack.md` §Desktop shell
- Research: `plans/reports/research-260622-1501-tauri-desktop-pet-overlay-report.md` §2.1, §2.2, §3 (bảng rủi ro)
- Design: `docs/design-guidelines.md` §Accessibility (không steal focus, click-through vùng trong suốt)

## Requirements
1. Repo Tauri v2 chạy được trên macOS với pnpm + Vite + TS.
2. 1 window `pet`: transparent, decorations=false, alwaysOnTop, skipTaskbar, focusable=false, shadow=false, resizable=false.
3. macOS: `macOSPrivateApi:true` + `ActivationPolicy::Accessory` (ẩn Dock + Cmd+Tab).
4. PoC chứng minh: click trên pixel vẽ (alpha>0) bắt được; click vùng trong suốt (alpha=0) pass-through xuống app dưới.
5. Drag pet bằng `startDragging()` thủ công (KHÔNG `data-tauri-drag-region`).
6. Document kết quả PoC per-OS vào `reports/`.

## Data flow
```
tauri.conf.json (window cfg) → Tauri builder (Rust) → WKWebView/WebView2/WebKitGTK
  → index.html canvas vẽ test shape → mousedown → startDragging()
Rust setup(): set_activation_policy(Accessory) [macOS gated]
```

## Files to create
- `package.json` — pnpm scripts (`dev`, `build`, `tauri`), deps: `@tauri-apps/api`, `@tauri-apps/cli`, `vite`, `typescript`
- `pnpm-lock.yaml` (sinh ra)
- `tsconfig.json`, `vite.config.ts`
- `index.html` (entry pet window) + `src/main.ts` (PoC: vẽ shape vào canvas, mousedown → drag)
- `.gitignore` (node_modules, dist, target, .DS_Store, *.log)
- `src-tauri/Cargo.toml` — deps: `tauri` v2, `tokio`, `serde`, `serde_json`
- `src-tauri/tauri.conf.json` — app.windows[pet] config (xem Requirements §2/§3); `bundle.windows.webviewInstallMode = downloadBootstrapper`
- `src-tauri/build.rs`
- `src-tauri/src/main.rs` — builder, `setup()` gọi activation policy (macOS `#[cfg(target_os="macos")]`)
- `src-tauri/src/lib.rs` — `run()` entry (Tauri v2 pattern)
- `src-tauri/capabilities/default.json` — core perms (window, event)
- `src-tauri/icons/` — placeholder icons (dùng `pnpm tauri icon` từ 1 PNG)
- `README.md` — dev setup (pnpm i, pnpm tauri dev), PoC note

## Implementation steps
1. `pnpm create tauri-app` (hoặc init thủ công) → chọn vanilla-ts, pnpm. Dọn template thừa.
2. Sửa `tauri.conf.json` window `pet` theo config trong research §2.1.
3. macOS: thêm `macOSPrivateApi:true`; trong `setup()` Rust gọi `app.set_activation_policy(tauri::ActivationPolicy::Accessory)` (gate `#[cfg(target_os="macos")]`).
4. `main.ts`: vẽ 1 hình tròn đặc giữa canvas trong suốt; `canvas.addEventListener('mousedown', () => getCurrentWindow().startDragging())`.
5. Manual PoC macOS: mở 1 editor dưới pet → click vùng trong suốt phải tương tác editor; click trên hình tròn phải drag pet.
6. (Nếu có máy) lặp Win/Linux: ghi nhận khác biệt (title bar bug #14859 → đảm bảo `shadow:false`; Wayland `visibleOnAllWorkspaces`).
7. Ghi `reports/poc-transparent-overlay-results.md`: OS, pass/fail từng tiêu chí, screenshot, workaround cần.

## Tests / Validation
- `pnpm tsc --noEmit` sạch.
- `cargo check` + `cargo clippy --manifest-path src-tauri/Cargo.toml` sạch.
- `pnpm tauri dev` mở pet window trong suốt (manual visual).
- **PoC pass criteria (macOS, MUST):** alpha=0 pass-through ✓; pixel vẽ bắt click ✓; drag hoạt động ✓; app không hiện ở Dock/Cmd+Tab ✓; không steal focus khi tương tác ✓.
- Win/Linux: best-effort, ghi nhận giới hạn (không block MVP nếu macOS pass).

## Risks & Rollback
| Risk | Mức | Mitigation |
|---|---|---|
| macOS click-through fail (#13070) | High | Nếu alpha=0 không pass-through → thử Rust `set_ignore_cursor_events` + cursor-poll 60fps toggle theo bounding box pet (research §3); nếu vẫn fail → **STOP, báo user** |
| Win title bar hiện dù decorations=false | Med | `shadow:false` + check wry version (#14859) |
| Wayland always-on-top/all-workspaces không nhất quán | Med | Document; chấp nhận giới hạn Linux MVP |
| macOS Tahoe RAM regression | Low | Ngoài tầm app; chỉ note để monitor |

**Rollback:** Phase tạo repo mới — rollback = `git reset`/xóa scaffold. Không ảnh hưởng phase khác (chưa có).

## Open questions
1. Target OS bắt buộc cho MVP release? (ảnh hưởng mức độ đầu tư Win/Linux PoC ngay) — **cần user.**
2. Có máy Windows/Linux để test sớm không, hay dùng CI matrix?
