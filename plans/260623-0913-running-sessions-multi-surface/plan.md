---
title: Danh sách session đang chạy (multi-surface)
description: >-
  Hiển thị danh sách các agent session đang chạy ở 3 surface (HUD, tray popover,
  tooltip) từ một nguồn broadcast dùng chung, nhãn trạng thái theme-hóa chọn
  được.
status: completed
priority: P2
branch: main
tags:
  - tauri
  - solidjs
  - agent-bridge
  - ui
  - tray
  - tdd
blockedBy: []
blocks: []
created: '2026-06-23T02:30:01.040Z'
createdBy: 'ck:plan'
source: skill
---

# Danh sách session đang chạy (multi-surface)

## Overview

Copet đã track multi-session nhưng chỉ `aggregate()` thành 1 dominant state cho pet phản ứng — người dùng không thấy toàn cảnh các phiên agent song song. Plan này bổ sung **danh sách session đang chạy** (project + nhãn state theme-hóa + thời gian chạy + agent), hiển thị ở **3 surface**: HUD, **tray popover** (giống FleetView), và **tooltip pet**.

Nguyên tắc cốt lõi (DRY, single-writer): **pet window là nguồn duy nhất**, broadcast 1 snapshot qua Tauri event `sessions-snapshot`; mọi surface chỉ render lại. Mỗi surface có ticker 1s chỉ để cập nhật cột thời gian.

Nguồn: brainstorm report `plans/reports/brainstorm-260623-0913-running-sessions-multi-surface-report.md`. Mode: `--deep --tdd`.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Session data core](./phase-01-session-data-core.md) | Completed |
| 2 | [SessionList and HUD](./phase-02-sessionlist-and-hud.md) | Completed |
| 3 | [Tray popover](./phase-03-tray-popover.md) | Completed |
| 4 | [Tooltip expansion](./phase-04-tooltip-expansion.md) | Completed |
| 5 | [Settings theme picker](./phase-05-settings-theme-picker.md) | Completed |

## Dependencies

Nội bộ (không có cross-plan; plan MVP `260622-1501-...` đã completed):

```
P1 (core) ──┬──▶ P2 (SessionList + HUD) ──▶ P3 (Tray popover)
            ├──▶ P4 (Tooltip)            ┐ (P3, P4 song song được sau P2/P1)
            └──▶ P5 (Settings theme) ◀───┘ (cần ≥1 surface để verify)
```

- P2 cần P1. P3 cần P1 + P2 (tái dùng `SessionList`). P4 cần P1. P5 cần P1 (+ ≥1 surface đã wiring `label-theme-store`).

## Shared Contracts (định nghĩa 1 lần — mọi phase tuân theo)

**Types** (`src/types/session-snapshot.ts` — MỚI):
```ts
import type { AgentId, AgentState } from "./agent-event.js";

export interface SessionSnapshot {
  sessionId: string;
  agent: AgentId | null;
  project: string | null;
  state: AgentState;
  since: number; // epoch giây: mốc bắt đầu "active streak" hiện tại (reset khi done/idle → working)
  ts: number;    // epoch giây: event gần nhất
}

export type LabelTheme = "kitchen" | "mood" | "garden";
```

**Tauri events:**
- `"sessions-snapshot"` — payload `SessionSnapshot[]`. Pet window emit sau mỗi update/expire.
- `"label-theme-changed"` — payload `{ theme: LabelTheme }`. Settings emit khi đổi theme.

**`since` semantics:** trong `SessionTracker.update()`, đặt `since = ts` khi (session mới) HOẶC (`prevState ∈ {done, error}` và `newState == working`). Các trường hợp khác giữ nguyên `since`. → hiển thị "đã chạy bao lâu trong lượt hiện tại".

⚠️ **Lưu ý quan trọng (red-team):** per-session entry **không bao giờ** mang state `idle` — `idle` chỉ là output của `aggregate()` khi map rỗng; hooks (`map_claude/codex/gemini`, `copet-run`) chỉ emit `working/waiting/done/error`. Nên KHÔNG đưa `idle` vào predicate (dead branch). `waiting → working` (vd sau khi cấp quyền) **không** reset (tiếp tục cùng lượt). `done/error → working` = lượt mới → reset. `update()` GIỮ signature 5-tham-số hiện tại; `since` tính nội bộ (đọc entry cũ trước khi set) để 17 test tracker cũ không vỡ.

**Sort trong danh sách:** theo priority state `working > waiting > error > done > idle`, cùng bậc thì `ts` mới nhất trước.

**Làm mờ:** `done` + `idle` render opacity ~0.5. Hết hạn 5' (`expireStale`) → biến mất.

**Default theme:** `kitchen` 🍳.

## Acceptance Criteria (toàn plan)

- [ ] 3 agent chạy song song → HUD + popover + tooltip đều liệt kê đúng 3 session (dot màu state, project, nhãn theme, thời gian cập nhật ~1s).
- [ ] `done`/`idle` hiện mờ tới khi hết hạn 5' rồi biến mất.
- [ ] Left-click tray → popover bật dưới icon; click ra ngoài → tự ẩn.
- [ ] Đổi theme nhãn trong Settings → cả 3 surface đổi nhãn ngay (không cần restart).
- [ ] 0 session → "Chưa có session nào".
- [ ] `pnpm test` xanh (toàn bộ test suite hiện tại + test mới); `pnpm exec tsc --noEmit` sạch; `cargo check --workspace` + `cargo clippy` sạch.

## Out of Scope (chốt)

- Model + task summary (ảnh #6) — cần đọc `transcript_path`, để post-plan.
- Action khi click 1 session (read-only).
- Window "Sessions" riêng; cơ chế "+N" overflow phức tạp (chỉ scroll; tooltip giới hạn dòng + "+N more").
- KHÔNG đổi `AgentEvent` (Rust protocol + hook). `since` chỉ frontend.

## Key Decisions

- **Broadcast snapshot** (pet window emit) thay vì mỗi window tự dựng tracker → 1 nguồn sự thật, khớp single-writer. Pet window emit nhưng **KHÔNG tự subscribe** `sessions-snapshot` (tooltip đọc tracker trực tiếp) → tránh vòng lặp/việc thừa.
- **HUD window label = `stats`** (không phải "hud") — theo `tauri.conf.json`.
- **Positioner cần feature `tray-icon`** (red-team CRITICAL): `Cargo.toml` phải `tauri-plugin-positioner = { version = "2", features = ["tray-icon"] }` — `on_tray_event`, `Position::TrayBottomCenter`, và runtime `Tray` state đều feature-gated; thiếu feature → build fail / panic. Positioning làm **Rust-side** (`WindowExt.move_window` trong tray.rs — KHÔNG bị IPC permission-gate) → sessions capability không cần `positioner:*`.
- **Tray left-click → popover** (toggle pet chuyển sang menu phải + hotkey, vẫn dùng được). `reset_pet_position` (dùng `Position::BottomRight`, non-tray) KHÔNG bị ảnh hưởng.
- **macOS Accessory policy + race #13633**: app chạy `ActivationPolicy::Accessory` (ẩn dock) → set_focus/blur có thể flaky. Mitigation: guard `justShown` + delay `set_focus()` ~30ms; **fallback hide không chỉ dựa blur**: Escape-to-hide + click-lại-tray (toggle). Đánh dấu must-verify E2E trên macOS thật.
- **PRIORITY export từ Phase 1**: `session-tracker.ts` export `PRIORITY` + comparator để `session-list-model` + `tooltip-render` dùng lại (DRY, tránh drift).
- **`getStateLabel` guard theme**: `(TABLE[theme] ?? TABLE.kitchen)[state] ?? fallback` — an toàn khi theme `undefined` (Phase 2/4 chạy trước Phase 5).
- Code comment mô tả hành vi, KHÔNG gắn số phase/plan ID.

## Test Environment (đã xác minh, red-team)

`vitest.config.ts` dùng **`happy-dom`** (có DOM APIs), KHÔNG phải node-only. Tuy vậy **chưa cài** `@solidjs/testing-library` → không render-test component SolidJS. Chiến lược: dồn logic vào **module thuần** (`session-tracker`, `state-labels`, `session-duration`, `session-list-model`, `tooltip-render`) test trực tiếp; component (`SessionList`) verify visual thủ công. `tooltip-render` trả string, có thể dùng happy-dom DOM nếu cần.

## References

- Brainstorm: `plans/reports/brainstorm-260623-0913-running-sessions-multi-surface-report.md`
- Tauri research: `plans/reports/researcher-260623-0926-tauri-v2-tray-popover-report.md`
- `docs/system-architecture.md` §Multi-Session Aggregation
- Tauri v2 positioner: https://v2.tauri.app/plugin/positioner/ ; system tray: https://v2.tauri.app/learn/system-tray/

## Open Questions

- Kích thước popover (đề xuất 300×360, max-height cuộn) + số dòng tối đa tooltip (đề xuất 5) — chốt khi implement theo design-tokens.
- Default theme `kitchen` — xác nhận khi review (đã thống nhất ở brainstorm).
