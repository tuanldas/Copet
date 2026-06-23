---
phase: 1
title: "Popover layout + existing data"
status: done
priority: P2
dependencies: []
effort: "~0.5d"
---

# Phase 1: Popover layout + existing data

## Overview

Dựng lại sessions popover thành control panel theo ảnh AgentPet, CHỈ dùng dữ liệu có sẵn. KHÔNG thêm tracking/feature mới (để Phase 2-4). Không render nút/feature chưa chạy được.

## Scope (build now)

- Header: "AgentPet"/tên app + "N agents · M running".
- Companion card: emoji avatar + tên pack ("Blobby") + "Lv N" + status (từ stats) + XP bar (within/needed) + tổng token.
- Agents list: `SessionList` (giữ nguyên, đã có enrichment).
- Toggle "Show pet" (gọi `togglePet`).
- Footer: Settings (`openSettings`) + Quit (lệnh mới `quit_app`).

## Out of scope (Phase 2-4)

today token/bữa, tên pet tùy chỉnh, pet size slider, count/chat/bubble trên menu bar, Updates, Clear-all agents.

## Related Code Files

- Create: `src/ui/sessions/CompanionCard.tsx` — companion card (đọc `getPetData/onPetDataChange`, `xpWithinLevel/xpForCurrentLevel`).
- Create: `src/ui/shared/pet-status.ts` — `petStatusLabel(stats)` → nhãn ngắn ("No căng"/"Đói"/...). + test.
- Create: `src/ui/shared/session-counts.ts` — `countRunning(sessions)` (pure) + test (tránh nhồi logic vào JSX).
- Modify: `src/ui/sessions/sessions-entry.tsx` — layout panel mới (header + CompanionCard + SessionList + Show-pet toggle + footer); giữ auto-hide.
- Modify: `src/ui/sessions/sessions.css` — style panel/card/toggle/footer (tham chiếu design-tokens.css; reuse `.toggle` của settings.css nếu hợp).
- Create cmd: `quit_app` trong `src-tauri/src/commands/window_commands.rs` (`app.exit(0)`), đăng ký ở `lib.rs`, wrapper `quitApp()` ở `tauri-commands.ts`.

## Implementation Steps

1. `pet-status.ts` + test: map stats → nhãn (ngưỡng thấp nhất quyết định; mặc định "No căng").
2. `session-counts.ts` + test: countRunning.
3. `CompanionCard.tsx`: subscribe petStore, render avatar/tên/Lv/status/XP bar/token.
4. Rewrite `sessions-entry.tsx`: panel = header(count) + CompanionCard + SessionList + Show-pet toggle + footer(Settings/Quit).
5. `quit_app` cmd + đăng ký + `quitApp()` wrapper.
6. CSS.
7. Verify: tsc + vitest + cargo clippy/test.

## Success Criteria

- [x] Popover hiện companion card (Lv/status/XP/token) + đếm "N agents · M running" + agents list + Show-pet + Settings/Quit.
- [x] Không có nút/feature chết (chỉ render cái chạy được).
- [x] tsc + vitest + cargo clippy/test sạch (284 vitest; src-tauri 12).
- [x] Không vỡ HUD/pet/popover hiện có (chỉ thêm CompanionCard read-only + quit_app).
- [ ] **Visual verify (cần người dùng)**: chạy `pnpm tauri dev`, bấm tray icon, xem layout giống ảnh tham chiếu + vừa cửa sổ 320×520.

## Implementation Notes (done 2026-06-23)

- Files mới: `pet-status.ts` (+test), `session-counts.ts` (+test), `CompanionCard.tsx`. Sửa: `sessions-entry.tsx` (layout panel), `sessions.css`, `tauri.conf.json` (sessions 320×520), `window_commands.rs`+`lib.rs`+`tauri-commands.ts` (`quit_app`).
- CompanionCard tái dùng đúng pattern HUD: `initTamagotchi({role:"client"})` + `onPetDataChange` + `xpWithinLevel/xpForCurrentLevel`; token = TỔNG (chưa "hôm nay"), tên = "Blobby" (pack).
- "Show pet" dùng state cục bộ (default on) — chưa đồng bộ shortcut (ghi nhận, để sau).

## Risk Assessment

- Popover cao hơn → đảm bảo scroll (max-height) cho agents list.
- "Show pet" state cục bộ (default on) chưa đồng bộ shortcut → chấp nhận Phase 1, ghi chú.
- `quit_app` = `app.exit(0)` → đảm bảo lưu state trước thoát (tauri-plugin-store tự lưu; window-state lưu on exit).
