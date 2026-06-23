---
phase: 5
title: Settings theme picker
status: completed
priority: P2
dependencies:
  - 1
  - 2
effort: ~0.5d
---

# Phase 5: Settings theme picker

## Overview

Cho người dùng chọn 1 trong 3 bộ nhãn (kitchen/mood/garden) trong Settings, lưu store `copet-settings.json`, và broadcast `label-theme-changed` để cả 3 surface đổi nhãn ngay (không restart). Nhân bản pattern `select_pet` có sẵn.

## Requirements

- Functional:
  - Command `set_label_theme(theme)` validate + lưu; `get_settings` trả thêm `label_theme` (default `kitchen`).
  - Settings có section chọn theme (3 nút), hiển thị theme đang chọn, đổi → lưu + emit `label-theme-changed`.
  - 3 surface (HUD/popover/tooltip) đã wiring `label-theme-store` ở các phase trước → tự cập nhật khi nhận event.
- Non-functional: validate theme ở Rust (reject giá trị lạ) như `select_pet`.

## Architecture

`Settings click → setLabelTheme(theme) [invoke] → store.save → emit("label-theme-changed",{theme})`. Receivers: `label-theme-store.onThemeChange` (đã dùng bởi HUD/popover qua `createThemeSignal`, và bởi tooltip qua agent-bridge `onThemeChange`).

## Related Code Files

- Modify: `src-tauri/src/commands/system_commands.rs` — `set_label_theme` + thêm `label_theme` vào `get_settings`; `const VALID_THEMES = ["kitchen","mood","garden"]`.
- Modify: `src-tauri/src/lib.rs` — đăng ký `set_label_theme` trong `tauri::generate_handler![...]`.
- Modify: `src/ui/shared/tauri-commands.ts` — `setLabelTheme(theme)`; type `LabelTheme`; `getSettings()` trả thêm `label_theme`.
- Modify: `src/ui/settings/Settings.tsx` — section "Status Labels" + handler emit.
- Modify: `src/ui/settings/settings.css` — style nút theme (nếu cần; tái dùng `.pet-option`).
- Create (tests): `src-tauri/src/commands/` test cho `is_valid_theme` (nếu tách hàm thuần) — hoặc ghi rõ verify thủ công.

## Implementation Steps

### A. Tests first (TDD — phần khả thi)

1. Rust: tách `fn is_valid_theme(&str)->bool` (thuần) + `#[cfg(test)]` test `kitchen/mood/garden` hợp lệ, `"x"`/`""` không. (Phần `set_label_theme`/store + emit verify thủ công vì cần AppHandle.)

### B. Implementation

2. `system_commands.rs`:
   ```rust
   const VALID_THEMES: &[&str] = &["kitchen","mood","garden"];
   fn is_valid_theme(t: &str) -> bool { VALID_THEMES.contains(&t) }
   #[tauri::command]
   pub fn set_label_theme(app: AppHandle, theme: String) -> Result<(), String> {
     if !is_valid_theme(&theme) { return Err(format!("Unknown theme '{}'", theme)); }
     let store = app.store("copet-settings.json").map_err(|e| e.to_string())?;
     store.set("label_theme", serde_json::json!(theme));
     store.save().map_err(|e| e.to_string())
   }
   ```
   Trong `get_settings`: đọc `label_theme` default `"kitchen"`, thêm vào JSON trả về.
3. `lib.rs`: thêm `set_label_theme` vào `generate_handler!`.
4. `tauri-commands.ts`: `export const setLabelTheme = (theme: LabelTheme) => invoke<void>("set_label_theme",{theme});`. `LabelTheme` + `label_theme?` (optional) đã thêm ở Phase 1 → ở đây flip `label_theme` thành **required** trong `PersistedSettings` (Rust nay luôn trả).
5. `Settings.tsx`: signal `labelTheme` (default kitchen); load từ `getSettings()` onMount; section 3 nút (Bếp núc/Cảm xúc/Vườn tược) `.pet-option`-style; handler:
   ```ts
   async function handleSelectTheme(t: LabelTheme){
     await setLabelTheme(t); setLabelTheme_(t);
     await emit("label-theme-changed", { theme: t });   // @tauri-apps/api/event
   }
   ```

### C. Verify

6. `cargo test` (is_valid_theme) + `cargo clippy`. `pnpm test` + `tsc --noEmit`.
7. E2E: mở Settings + HUD (+ popover, hover tooltip) → đổi theme → cả 3 surface đổi nhãn ngay; restart app → theme vẫn giữ (persisted).

## Success Criteria

- [ ] `is_valid_theme` test xanh; theme lạ bị reject.
- [ ] Đổi theme trong Settings → HUD + popover + tooltip đổi nhãn ngay (không restart).
- [ ] Theme persisted qua restart (đọc từ `get_settings`).
- [ ] `cargo check`/`clippy` + `tsc --noEmit` sạch.

## Risk Assessment

- Quên đăng ký command trong `lib.rs` → invoke lỗi "command not found": checklist B.3.
- `emit` từ Settings không tới window khác nếu thiếu `core:event:default` — đã có ở các capability; xác nhận.
- Lệch key store (`label_theme`) giữa Rust set/get và `label-theme-store` đọc → dùng đúng `label_theme` cả 2 nơi.
- Surfaces chưa wiring theme (nếu Phase 2/4 bỏ sót) → đổi theme không ăn: đảm bảo `createThemeSignal`/`onThemeChange` đã dùng.
