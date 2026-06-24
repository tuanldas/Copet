---
phase: 3
title: Verify and regression
status: completed
effort: S
---

# Phase 3: Verify and regression

## Overview

Verify toàn bộ acceptance + regression thủ công trong app thật. KHÔNG code mới.

## Requirements
- Tất cả test xanh; `tsc` xanh; hành vi đúng trong `pnpm tauri dev`.

## Related Code Files
- (none — chỉ chạy gate + smoke test)

## Implementation Steps
1. `pnpm test` → tất cả pass (gồm `render-loop` + `tooltip-render` mới/cũ).
2. `pnpm exec tsc --noEmit` → 0 lỗi.
3. `pnpm tauri dev`, smoke trên app thật:
   - Pet **không trôi** quanh cửa sổ; animation (idle/walk/working) vẫn chạy tại chỗ.
   - Panel **cố định** phía trên pet; **không nhảy** khi pet đổi state/animate.
   - Panel **hiện** khi có session `working`/`waiting`; **ẩn** khi idle/done/rỗng.
   - Vùng ngoài pet vẫn **click-through**; click/drag trên pet **kéo được cửa sổ**; **right-click mở HUD**.
4. `cargo` gates: KHÔNG cần (không đụng Rust).

## Success Criteria
- [ ] `pnpm test` xanh.
- [ ] `pnpm exec tsc --noEmit` xanh.
- [ ] Smoke: pet đứng yên + panel cố định + ẩn/hiện đúng theo session.
- [ ] Không regress: click-through / drag cửa sổ / right-click HUD.

## Risk Assessment
- Thấp. Nếu smoke lộ panel chồng pet khó chịu → tinh chỉnh `RESTING_MARGIN`/`GAP` (không đổi kiến trúc).
