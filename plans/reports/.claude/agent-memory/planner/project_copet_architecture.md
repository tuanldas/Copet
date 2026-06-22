---
name: copet-architecture
description: Copet desktop-pet project — locked stack decisions + phased plan location (260622)
metadata:
  type: project
---

Copet = cross-platform desktop pet (Tauri v2) phản ứng theo AI coding agent + full Tamagotchi gamification + shop.

**Why:** project mới, code chưa tồn tại lúc plan (2026-06-22). Stack đã chốt qua /bootstrap, không suy ra được từ repo cho tới khi implement bắt đầu.

**How to apply:** khi quay lại Copet, đọc plan + phase files trước; verify file đã tồn tại chưa (plan có thể đã được implement một phần — re-check repo, đừng giả định).

Locked decisions (xem `docs/tech-stack.md` là nguồn sự thật):
- Tauri v2, pnpm+Vite+TS. Pet render = Vanilla TS + Canvas 2D + Petdex pet-pack (8×9 spritesheet, field `copet_extensions`). UI panels (HUD/Settings/Shop) = SolidJS. State = @xstate/store (KHÔNG xstate full). Persist = tauri-plugin-store JSON.
- Agent detect: hook→socket (`interprocess` crate) là primary; sidecar `copet-hook` (Rust) parse stdin→socket; Tauri core emit `agent-status-changed`. Wrapper `copet run` = fallback (Cursor không có CLI hooks). Canonical event contract trong `crates/copet-protocol` + `frontend/types/agent-event.ts`.
- Top risk = transparent click-through (#13070) → Phase 01 là GATE PoC.

Plan: `plans/260622-1501-copet-desktop-agent-pet/plan.md` (8 phases). Research reports: `plans/reports/research-260622-1501-*` + `researcher-260622-1511-*`.
