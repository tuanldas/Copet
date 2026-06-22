---
title: "Copet — Desktop AI-Agent Pet (Tauri v2 + Tamagotchi)"
description: "Cross-platform desktop pet phản ứng theo AI coding agent, full Tamagotchi gamification + shop."
status: in_progress
priority: P2
effort: ~22d
branch: main
tags: [tauri, rust, solidjs, canvas, tamagotchi, desktop-pet]
created: 2026-06-22
---

# Copet — Implementation Plan

MVP-first. Stack đã chốt (xem `docs/tech-stack.md`). Phase 1 là gate rủi ro #1 (transparent click-through PoC) — không pass thì revisit architecture trước khi build tiếp.

## Phases

| # | Phase | Mục tiêu 1 dòng | Effort | Status |
|---|---|---|---|---|
| 01 | scaffold-and-transparent-overlay-poc | Scaffold Tauri v2 + Vite/TS/pnpm + PoC pet window trong suốt, always-on-top, click-through | 2.5d | ✅ done |
| 02 | pet-rendering-engine | Canvas 2D sprite player + Petdex pet-pack loader + @xstate/store + base anim (idle/walk/drag) | 4d | ✅ done |
| 03 | agent-integration-backend | `interprocess` socket daemon + sidecar `copet-hook` + event mapping + emit; hook Claude/Codex/Gemini + `copet run` wrapper | 5d | ✅ done |
| 04 | tamagotchi-core | Stats decay, XP/level, evolution gate, offline handling, persistence (tauri-plugin-store) | 3d | ✅ done |
| 05 | token-economy-and-shop | Token từ activity + Shop UI (food + cosmetics) + buy/equip | 2.5d | ✅ done |
| 06 | ui-shell-and-system-integration | Stats HUD, Settings, tray menu, global shortcut, autostart, notification, positioner/window-state | 3d | ✅ done |
| 07 | wire-agent-state-to-pet-reaction | Nối agent event → pet animation/mood/tooltip + xử lý multi-session | 2d | pending |
| 08 | packaging-and-distribution | Build dmg/msi/nsis/appimage/deb + hook install flow + signing notes | 2d | pending |

## Dependency graph

```
P01 (scaffold + PoC) ── gate ──┐
                               ├─► P02 (render engine) ──┐
                               ├─► P03 (agent backend) ──┤
                               └─► P04 (tamagotchi core)─┤
                                                         ▼
                              P05 (economy+shop)  needs P04 + P02
                              P06 (UI shell)      needs P01 (+ P02 for HUD portrait)
                                                         ▼
                              P07 (wire-up)       needs P02 + P03 + P04 + P06
                                                         ▼
                              P08 (packaging)     needs ALL
```

Song song được (file ownership tách bạch sau khi P01 xong):
- **Wave A (parallel):** P02 (frontend/pet/*), P03 (src-tauri/ + crates/), P04 (frontend/tamagotchi/*). Touch điểm chung duy nhất: event contract (định nghĩa cứng trong P03, P02/P04 chỉ consume types) + `tauri.conf.json` window list (P01 chốt; P06 thêm window → sửa sau, không song song với P01).
- **Wave B (parallel):** P05 (frontend/shop/* + economy), P06 (frontend/ui/* + src-tauri tray/tray.rs). Khác file, OK.
- P07, P08 tuần tự (integration + release).

## Acceptance criteria (tổng)

- [ ] Pet trong suốt, always-on-top, không steal focus; click trên pixel pet tương tác được, vùng trong suốt pass-through (verified 3 OS hoặc ≥ macOS + 1 khác).
- [ ] Pet render mượt từ Petdex pet-pack (pet.json + spritesheet 8×9); CPU idle < 2%, pause khi window ẩn.
- [ ] State agent (working/waiting/done/idle/error) từ ≥ 2 agent thật (Claude Code + 1 khác) đẩy qua socket → đổi animation pet < 300ms.
- [ ] `copet run -- <cmd>` đổi pet sang working khi process chạy, done/error theo exit code.
- [ ] 4 stats decay theo thời gian; XP/level theo `100*1.5^n`; evolution gate bằng care_score 7 ngày; offline decay cap 2h; state persist qua restart.
- [ ] Token sinh từ activity; mua food (hồi stat) + cosmetic (equip đổi visual) trong Shop; trừ token đúng.
- [ ] Tray menu + global shortcut toggle + autostart + Settings hoạt động; vị trí pet nhớ theo monitor.
- [ ] Build artifact cho ≥ macOS (dmg) + 1 OS khác; có flow cài hook cho user.
- [ ] `pnpm tsc --noEmit` sạch; `cargo check` + `cargo clippy` sạch; unit test core (tamagotchi math, event mapping, pet-pack parse) pass.

## Risks (tổng — chi tiết trong từng phase)

| Risk | Phase | Mức | Mitigation |
|---|---|---|---|
| Transparent click-through không native (#13070) | P01 | High | PoC sớm; macOS alpha=0 auto pass-through; Rust cursor-poll fallback cho Win/Linux |
| macOS fullscreen che overlay | P01/P06 | Med | NSWindowLevel override (objc2 raw call); xác minh plugin name |
| Cursor không có CLI hooks | P03 | High (scope) | Chỉ `copet run` wrapper (working/done); document giới hạn |
| Gemini/Codex hook API còn mới | P03 | Med | Event mapping table cô lập 1 module; test với agent thật |
| Multi-session UI ambiguity | P07 | Med | Aggregate state policy (working > waiting > done > idle); badge count |
| Asset license mơ hồ | P02 | Med | Chỉ CC0 (Kenney) hoặc tự vẽ; license manifest mỗi pack |

## Decisions (resolved 2026-06-22)

1. **Target OS MVP:** macOS-first. Win/Linux: code cross-platform nhưng test best-effort/sau (giảm scope test P01/P08).
2. **Code-signing:** quyết ở P08 (MVP có thể ship unsigned + doc Gatekeeper/SmartScreen bypass).
3. **Evolution art:** palette-swap + overlay/size cho MVP; pet-pack loader (P02) vẫn hỗ trợ spritesheet-riêng/stage qua field optional → upgrade sau không phá format.
4. **Multi-session UI:** 1 pet aggregate, ưu tiên state `working > waiting > done > idle` + badge count (P07).
5. **XP/token formula:** dùng draft planner (XP `100*1.5^n`; XP/task theo tool_calls; token = 1/tool_call), tinh chỉnh ở P04/P05.

## Links

- Phase files: `phase-01-*.md` … `phase-08-*.md` (cùng thư mục)
- Stack: `docs/tech-stack.md` · Design: `docs/design-guidelines.md`
- Research: `plans/reports/research-260622-1501-tauri-desktop-pet-overlay-report.md` · `plans/reports/research-260622-1501-multi-agent-cli-state-detection-report.md` · `plans/reports/researcher-260622-1511-pet-animation-tamagotchi-report.md`
- Reports (impl): `plans/260622-1501-copet-desktop-agent-pet/reports/`
