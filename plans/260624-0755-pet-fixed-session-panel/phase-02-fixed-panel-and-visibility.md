---
phase: 2
title: Fixed panel and visibility
status: completed
effort: S
---

# Phase 2: Fixed panel and visibility

## Overview

Panel ghim cố định phía trên pet (bỏ follow mỗi frame); chỉ hiện khi có ≥1 session `working`/`waiting`. Predicate ẩn/hiện tách thành **hàm thuần** trong `tooltip-render.ts` để test không cần DOM (theo đúng pattern `renderTooltipHtml` hiện có).

## Requirements
- Functional: panel KHÔNG di chuyển theo frame; `display` toggle theo session state.
- Non-functional: giữ `pointer-events:none`, read-only; KHÔNG đổi row của `renderTooltipHtml`.

## Architecture
- `src/pet/tooltip-render.ts` — thêm & export hàm thuần:
  ```ts
  export function hasActiveSessions(sessions: SessionSnapshot[]): boolean {
    return sessions.some((s) => s.state === "working" || s.state === "waiting");
  }
  ```
- `src/pet/pet-tooltip.ts`:
  - Bỏ `frame()` + vòng `requestAnimationFrame`/`_raf` + `cancelAnimationFrame` trong `destroy()`.
  - Đổi `reposition()` → `positionPanel()`: tính **1 lần** lúc mount + khi `resize`. Anchor trên pet: `top = rect.top + pos.y - h - GAP`; nếu `top < 0` → `top = 0`. Giữ clamp `left`.
  - Thêm `window.addEventListener("resize", onResize)` (gọi `positionPanel`); remove trong `destroy()`.
  - `update(data)`:
    ```ts
    const show = hasActiveSessions(data.sessions);
    el.style.display = show ? "block" : "none";
    if (show) { paint(); positionPanel(); }
    ```
  - Interval 1s: chỉ `paint()` khi `el.style.display !== "none"`.
  - `getPosition` vẫn nhận vào; đọc lúc `positionPanel` (pet đứng yên → hằng).

## Related Code Files
- Modify: `src/pet/tooltip-render.ts`, `src/pet/pet-tooltip.ts`
- Modify (tests): `src/pet/__tests__/tooltip-render.test.ts`

## Implementation Steps (TDD — tests first)
1. **Viết test trước** (`tooltip-render.test.ts`, dùng `snap()` helper sẵn có):
   - `hasActiveSessions([])` → false.
   - `hasActiveSessions([snap("idle")])` → false; `[snap("done")]` → false.
   - `hasActiveSessions([snap("working")])` → true; `[snap("waiting")]` → true; hỗn hợp có working → true.
2. Chạy → **đỏ**.
3. Thêm `hasActiveSessions` vào `tooltip-render.ts` → test xanh.
4. Sửa `pet-tooltip.ts`: bỏ rAF follow, fixed anchor, toggle `display` qua `hasActiveSessions`.
5. `pnpm exec tsc --noEmit` xanh.

## Success Criteria
- [ ] `hasActiveSessions` test pass (true/false đúng theo state).
- [ ] `pet-tooltip.ts` KHÔNG còn `requestAnimationFrame`.
- [ ] Panel `display:none` khi không có `working`/`waiting`.
- [ ] Anchor cố định phía trên pet, clamp `top ≥ 0`.
- [ ] `renderTooltipHtml` + test cũ giữ nguyên (pass).

## Risk Assessment
- Kéo cửa sổ (`startDragging`) di chuyển window nhưng tọa độ webview (`getBoundingClientRect`) không đổi → anchor vẫn đúng, KHÔNG cần recompute on drag.
- Resize/DPR → `onResize` recompute.
- Panel cao hơn khoảng trống 220px → `top=0`, có thể chồng nhẹ lên pet — vô hại (`pointer-events:none`); cap `TOOLTIP_MAX_ROWS=5` giới hạn chiều cao.
