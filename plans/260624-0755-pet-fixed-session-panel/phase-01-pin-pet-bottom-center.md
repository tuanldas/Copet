---
phase: 1
title: Pin pet bottom-center
status: completed
effort: S
---

# Phase 1: Pin pet bottom-center

## Overview

Pet đứng yên: pin ở **đáy-giữa** cửa sổ 220×220, bỏ dịch chuyển khi state=`walk`. Animation sprite vẫn chạy tại chỗ. `loop.position` trở thành hằng → hit-rect / click-through / drag / right-click tự khớp (tất cả đọc cùng `loop.position`).

## Requirements
- Functional: `RenderLoop.position` khởi tạo ở đáy-giữa; KHÔNG đổi khi `walk`.
- Non-functional: KHÔNG xóa state `walk` khỏi `pet-state-machine.ts`; KHÔNG đụng Rust/`index.ts`.

## Architecture
- `src/pet/render-loop.ts`:
  - Thêm hằng `RESTING_MARGIN = 8`.
  - Constructor: `position = { x: (clientW - petW)/2, y: clientH - petH - RESTING_MARGIN }` (thay vì center theo cả 2 trục).
  - `tick()`: bỏ nhánh `if (this.currentState === "walk") this.stepWalk();`.
  - Xóa `stepWalk()` + field `walkVector` + `walkStepsLeft` (dead code sau khi bỏ) → tránh lỗi `tsc` unused.
- State machine giữ nguyên: `walk` vẫn là sub-state idle (TICK 15% toggle); `AnimationController` vẫn resolve animation `walk` (frame cycling tại chỗ).

## Related Code Files
- Modify: `src/pet/render-loop.ts`
- Create: `src/pet/__tests__/render-loop.test.ts`

## Implementation Steps (TDD — tests first)
1. **Viết test trước** (`render-loop.test.ts`):
   - Fake canvas: `{ clientWidth: 220, clientHeight: 220 } as unknown as HTMLCanvasElement`.
   - Resting position: `new RenderLoop({petWidth:96, petHeight:104, canvas}, res, () => {})` → assert `position.x === (220-96)/2` và `position.y === 220-104-8`.
   - Position bất biến khi walk: mock `globalThis.requestAnimationFrame` (lưu callback, return id; KHÔNG auto-loop) + `performance.now`; `loop.updateResolution(walkRes, "walk")`; `loop.start()` rồi gọi callback đã bắt vài lần (mô phỏng tick); assert `loop.position` không đổi so với resting.
2. Chạy `pnpm test render-loop` → **đỏ** (chưa có file/hành vi).
3. Sửa `render-loop.ts` theo Architecture.
4. Chạy lại → **xanh**.

## Success Criteria
- [ ] Test: resting position = đáy-giữa (pass).
- [ ] Test: position bất biến qua nhiều tick khi state=`walk` (pass).
- [ ] `pnpm exec tsc --noEmit` xanh (không còn ref tới `walkVector`/`walkStepsLeft`/`stepWalk`).
- [ ] KHÔNG sửa `pet-state-machine.ts`.

## Risk Assessment
- `clientHeight === 0` lúc mount → position lệch. Mitig: rủi ro pre-existing (center cũ cũng dùng `clientHeight`); canvas fill 220px nên thực tế OK. Optional fallback `(clientH || 220)`.
- hit-rect: `index.ts` report lần đầu + forced khi state đổi → vẫn đúng vì đọc `position` mới. Không cần đổi `index.ts`.
