---
title: Pet fixed session panel (anti-jitter)
description: >-
  Pet đứng yên (pin đáy-giữa), panel session ghim cố định phía trên pet, chỉ
  hiện khi working/waiting. Frontend-only, không đụng Rust/window.
status: completed
priority: P2
branch: main
tags: []
blockedBy: []
blocks: []
created: '2026-06-24T01:14:40.133Z'
createdBy: 'ck:plan'
source: skill
---

# Pet fixed session panel (anti-jitter)

## Overview

Fix panel session ("tooltip") nhảy theo pet. Nguyên nhân: `src/pet/pet-tooltip.ts` follow `getPosition()` mỗi `requestAnimationFrame` trong khi pet roam (`stepWalk` ở `src/pet/render-loop.ts`). Giải pháp (port concept từ agentpet — *popup cố định vì pet cố định*): **pet đứng yên** (pin đáy-giữa cửa sổ 220×220, bỏ dịch chuyển walk) + **panel ghim cố định** phía trên pet + **chỉ hiện khi có session working/waiting**.

Chỉ sửa frontend TS. KHÔNG đụng Rust/`lib.rs`/window/tray/HUD. Giữ contract `renderTooltipHtml`. Mode: `--deep --tdd`.

**Acceptance (toàn plan):**
- `loop.position` bất biến khi state=`walk`; panel không di chuyển khi pet đổi state/animate.
- Panel hiện ⟺ ∃ session `working`/`waiting`; ẩn lúc idle/done/rỗng.
- Clamp `top ≥ 0` trong 220px.
- Không regress: click-through, `startDragging` drag cửa sổ, right-click mở HUD, `set_pet_hit_rect`.
- `pnpm test` + `pnpm exec tsc --noEmit` xanh.

**Scope OUT:** auto-size window; Rust/window/tray/HUD; đổi row của `renderTooltipHtml`; định vị đa-màn-hình.

**Decision locked (brainstorm — không mở lại):** giữ state `walk` (chỉ bỏ dịch chuyển), KHÔNG xóa walk khỏi `pet-state-machine.ts` → blast radius nhỏ nhất.

**References:**
- Thiết kế: `../reports/brainstorm-design-260624-0755-pet-fixed-session-panel-report.md`
- So sánh agentpet: `../reports/xia-compare-agentpet-260624-0755-fixed-popup-positioning-report.md`

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Pin pet bottom-center](./phase-01-pin-pet-bottom-center.md) | Completed |
| 2 | [Fixed panel and visibility](./phase-02-fixed-panel-and-visibility.md) | Completed |
| 3 | [Verify and regression](./phase-03-verify-and-regression.md) | Completed |

## Dependencies

- **Related (non-blocking):** `260623-1454-tray-popover-control-panel` (in-progress) — tray popover là surface khác (`sessions.html`/`tray.rs`), không trùng file (`pet-tooltip.ts`/`render-loop.ts`/`tooltip-render.ts`). Không blocking, không cần cập nhật chéo.
- Cross-stack: port *concept* từ `ntd4996/agentpet` (Swift), không port code.
