---
phase: 4
title: Tooltip expansion
status: completed
priority: P2
dependencies:
  - 1
effort: ~0.5d
---

# Phase 4: Tooltip expansion

## Overview

Mở rộng tooltip pet (hover) từ 1 dòng tổng hợp → danh sách nhiều dòng các session, dùng cùng `getStateLabel` + `formatDuration`. Tooltip nằm trong pet window nên đọc dữ liệu trực tiếp từ tracker (không cần broadcast). Tách phần render thành hàm thuần để unit-test. Độc lập Phase 2/3 → làm song song sau Phase 1.

## Requirements

- Functional:
  - Tooltip hiện tối đa 5 dòng session (dot/emoji + project + nhãn theme + thời gian); >5 → "+N more".
  - 0 session → "Chưa có session nào".
  - Cập nhật thời gian mỗi 1s khi tooltip đang mở.
- Non-functional: render là hàm thuần (string) để test không cần DOM; giữ `pet-tooltip.ts` < 200 LOC (tách helper).

## Architecture

`agent-bridge._reAggregate → tooltipHandle.update({ sessions: _tracker.list(), theme: getCurrentTheme() })`. `pet-tooltip` giữ `_current` + ticker 1s (chỉ chạy khi visible) → gọi `renderTooltipHtml(_current, nowSeconds)`. Pet window đọc tracker TRỰC TIẾP — **KHÔNG** subscribe `sessions-snapshot`, KHÔNG thêm `createSessionsSignal` vào pet window (tránh việc thừa).

## Related Code Files

- Create: `src/pet/tooltip-render.ts` — `renderTooltipHtml(data, now): string` (thuần) + `escHtml` (chuyển từ pet-tooltip).
- Modify: `src/pet/pet-tooltip.ts` — `TooltipData` = `{ sessions: SessionSnapshot[]; theme: LabelTheme }`; dùng `renderTooltipHtml`; ticker 1s khi visible; `positionTooltip` chiều cao động.
- Modify: `src/agent-bridge/agent-bridge.ts` — đổi payload `tooltipHandle.update(...)` sang `{sessions, theme}`; init theme (initLabelTheme + onThemeChange) trong pet window.
- Create (tests): `src/pet/__tests__/tooltip-render.test.ts`.

## Implementation Steps

### A. Tests first (TDD)

1. `tooltip-render.test.ts`:
   - 0 session → chứa "Chưa có session".
   - 3 session → 3 dòng; mỗi dòng có project + nhãn (theo theme) + duration (`now - since`).
   - 7 session → đúng 5 dòng + "+2 more".
   - project chứa `<script>` → bị escape (`&lt;script&gt;`).
   - đổi `theme` → nhãn đổi (kitchen vs garden).

### B. Implementation

2. `tooltip-render.ts`: dựng HTML từ `sortSessions(data.sessions).slice(0,5)`; mỗi dòng `getStateLabel(data.theme, s.state)` + `formatDuration(Math.max(0, now - s.since))`; escape project; nếu `length>5` thêm dòng `+${length-5} more`; nếu rỗng → empty text. (Tái dùng `sortSessions` từ `session-list-model`.)
3. `pet-tooltip.ts`: đổi `TooltipData`; `_current` default `{sessions:[],theme:"kitchen"}`; trong `show()`/`update()` dùng `renderTooltipHtml(_current, nowSec())`; thêm `setInterval` 1s khi visible (clear khi hide/destroy) để refresh duration; `positionTooltip` tính `tooltipH` theo số dòng (header + rows*rowH, cap ~6 dòng).
4. `agent-bridge.ts`: ĐỔI call site DUY NHẤT `tooltipHandle.update(...)` (≈ dòng 146; chỉ 1 chỗ thật + 1 doc-comment) → `{ sessions: _tracker.list(), theme: getCurrentTheme() }`. Gọi `initLabelTheme()` trong `initAgentBridge`. ⚠️ `onThemeChange` chỉ refresh TOOLTIP, **KHÔNG gọi `_reAggregate`** (sẽ replay animation done/error → pet đột nhiên "ăn mừng" khi đổi theme): dùng `onThemeChange(() => tooltipHandle.update({ sessions: _tracker.list(), theme: getCurrentTheme() }))`.

### C. Verify

5. `pnpm test` (tooltip-render xanh). `tsc --noEmit`. `pnpm tauri dev`: hover pet khi 2-3 session → tooltip liệt kê đúng, thời gian tăng; rời chuột → ẩn; ticker dừng.

## Success Criteria

- [ ] `tooltip-render` test xanh (đếm dòng, "+N more", escape, theme).
- [ ] Hover pet hiện danh sách session nhiều dòng, duration tick 1s, empty state đúng.
- [ ] `pet-tooltip.ts` < 200 LOC (render tách ra); `tsc --noEmit` sạch.

## Risk Assessment

- Tooltip cũ dùng `sessionCount`/`agent` — đổi shape `TooltipData`: thực tế chỉ **1 call site thật** (`agent-bridge.ts:146`) + 1 doc-comment (`pet-tooltip.ts:9`); `mountTooltip` signature giữ nguyên nên `main.ts` không đổi. Grep xác nhận.
- Đổi theme reuse `_reAggregate` → replay celebrate/error particle: tách path refresh tooltip riêng (xem step 4).
- Ticker rò rỉ nếu không clear khi hide/destroy → đảm bảo clear trong `hide()` + `destroy()`.
- Tooltip quá cao khi nhiều session → cap 5 dòng + "+N more" + chiều cao tối đa.
