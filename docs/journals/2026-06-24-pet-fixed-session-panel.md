# Fixed pet session panel jitter by pinning the pet (concept port from agentpet)

**Date**: 2026-06-24 08:35
**Severity**: Low (UX bugfix)
**Component**: pet (render-loop, pet-tooltip, tooltip-render)
**Status**: Resolved (committed to `main` @ eeeabc6; regression fix @ ab14906)

## What Happened

Session panel ("tooltip") nhảy theo pet mỗi khi pet "đi lại". Root cause: `pet-tooltip.ts` chạy vòng `requestAnimationFrame` gọi `reposition()` bám theo `getPosition()` của pet, trong khi pet roam quanh cửa sổ 220×220 qua `RenderLoop.stepWalk()` (dịch `position` + bounce mỗi frame).

Fix (frontend-only): **pet đứng yên** — bỏ dịch chuyển trong `stepWalk` (xóa luôn `walkVector`/`walkStepsLeft` + field `config` write-only), pin vị trí nghỉ ở **giữa** cửa sổ; **panel ghim cố định** phía trên pet (bỏ vòng rAF, chỉ tính anchor lúc mount + on resize, clamp `top ≥ 0`); panel **chỉ hiện khi có session working/waiting** qua hàm thuần `hasActiveSessions`.

## The Brutal Truth

Trước khi code đã dùng `/ck:xia --compare` soi `ntd4996/agentpet` (Swift/AppKit, cùng loại sản phẩm). Phát hiện quyết định: agentpet **không hề** có mô hình "pet roam + bubble đuổi theo" — pet pinned bottom-center, bubble xếp `VStack` phía trên trong cùng cửa sổ, window auto-size quanh anchor. Tức **popup cố định vì pet cố định**. Điều này biến một bài toán "định vị popup động" thành "bỏ chuyển động" — đơn giản hơn nhiều và đúng hướng. Bài học: với UI nhỏ, copy *hành vi/cấu trúc* của một sản phẩm trưởng thành rẻ hơn tự nghĩ cơ chế định vị.

## Technical Details

**Decisions locked:**
- Giữ state `walk` trong `pet-state-machine.ts` (chỉ bỏ dịch chuyển) thay vì xóa hẳn → blast radius nhỏ nhất, không đụng state machine + test của nó.
- Phạm vi tối thiểu: KHÔNG auto-size window kiểu agentpet (đụng Rust/overlay-fullscreen/multi-monitor — vùng docs đã đánh dấu mong manh). Bản chi tiết lớn đã có tray popover + HUD.
- Predicate ẩn/hiện tách thành hàm thuần (`tooltip-render.ts`) để unit-test không cần DOM (đúng pattern `renderTooltipHtml`).

**Regression an toàn:** `loop.position` còn nuôi hit-rect (`set_pet_hit_rect`), `isPointerOnPet` (drag + right-click HUD), `getPosition`. Pet đứng yên ở đáy-giữa → AABB vẫn khớp sprite vẽ tại `position`; kéo cửa sổ (`startDragging`) dời window OS-level, tọa độ webview bất biến nên anchor panel vẫn đúng. Code-review xác nhận 4/4 acceptance, 0 regression.

**Outcome:**
- 290/290 vitest pass (mới: `render-loop.test.ts` resting+walk-invariant; `hasActiveSessions` 4 cases).
- `tsc --noEmit` clean. Rust không đụng (clippy/cargo N/A).
- Code review: DONE (chỉ doc-nit low, đã sửa).

**Còn lại:** smoke thủ công `pnpm tauri dev` (pet đứng yên + panel cố định + ẩn/hiện + click-through/drag/HUD) — logic đã được test + review bảo chứng.

## Follow-up fix (regression post-ship)

Sau khi chạy thật, pet **biến mất**. Nguyên nhân: pin vị trí nghỉ ban đầu ở **đáy** cửa sổ (`clientHeight - petHeight - 8`) rơi vào phần cửa sổ overlay bị khuất/ngoài vùng nhìn trên setup của user (góc BottomRight). Pet cũ roam nên luôn lộ ra; pet mới đứng yên nên kẹt luôn ở vùng khuất → "mất pet". Fix (`ab14906`): nghỉ ở **GIỮA** cửa sổ (điểm khởi đầu cũ, luôn hiển thị) + fallback `window.innerHeight` + clamp `≥ 0` để không bao giờ rơi ra ngoài. User xác nhận pet hiện lại. **Bài học:** với pet đứng yên, vị trí nghỉ phải nằm chắc trong vùng nhìn — không còn roam để tự sửa.

## Artifacts

- Plan: `plans/260624-0755-pet-fixed-session-panel/plan.md`
- Brainstorm design: `plans/reports/brainstorm-design-260624-0755-pet-fixed-session-panel-report.md`
- xia compare (agentpet): `plans/reports/xia-compare-agentpet-260624-0755-fixed-popup-positioning-report.md`
