# Brainstorm Design: Panel session cố định cạnh pet (hết jitter)

**Ngày:** 2026-06-24
**Tham chiếu nghiên cứu:** `plans/reports/xia-compare-agentpet-260624-0755-fixed-popup-positioning-report.md`

## Problem statement

Panel session ("tooltip") của Copet bám theo vị trí pet mỗi `requestAnimationFrame` (`pet-tooltip.ts::reposition`). Khi pet "đi lại/nhảy" trong cửa sổ (logic `stepWalk` ở `render-loop.ts`), panel nhảy theo → khó đọc. Yêu cầu: popup phải **giữ vị trí cố định**.

## Bằng chứng (agentpet)

`ntd4996/agentpet` (Swift) giữ popup cố định bằng cách **không cho pet roam**: pet pinned bottom-center, bubble xếp dọc phía trên trong cùng cửa sổ (SwiftUI `VStack`), không có cơ chế follow per-frame. → Xác nhận hướng "pet đứng yên + ghim panel". Khác stack (Tauri/DOM) nên **port concept, không port code**.

## Quyết định đã chốt

1. **Phạm vi: tối thiểu** — chỉ sửa frontend TS, **không đụng** Rust/cửa sổ/tray/HUD. Giữ cửa sổ 220×220.
2. **Hiển thị:** panel **chỉ hiện khi có ≥1 session ở working hoặc waiting**; ẩn khi idle/done/rỗng.
3. (Tự quyết) **Pin pet ở đáy-giữa cửa sổ** thay vì giữa → tối đa khoảng trống phía trên cho panel trong 220px.

## Giải pháp đồng thuận

Sửa thuần frontend:

1. **`src/pet/render-loop.ts` → `stepWalk()`**: bỏ phần cập nhật `this.position` (pet không dịch chuyển nữa). Animation walk/sprite **vẫn chạy tại chỗ** (giữ liveliness). Có thể giữ/loại bỏ nhánh walk tùy mức gọn — pet đứng yên là yêu cầu.
2. **Vị trí nghỉ của pet**: đặt `position` khởi tạo ở đáy-giữa: `x=(clientW-petW)/2`, `y=clientH-petH-margin` (thay vì center hiện tại trong constructor `RenderLoop`).
3. **`src/pet/pet-tooltip.ts`**:
   - Gỡ vòng `requestAnimationFrame`/`frame()`/`reposition()` follow.
   - Ghim panel ở **anchor cố định phía trên pet** (tính 1 lần theo vị trí nghỉ; cập nhật khi cửa sổ resize, không phải mỗi frame).
   - Thêm logic **ẩn/hiện**: `el.style.display = hasActive ? "block" : "none"` với `hasActive = sessions.some(s => s.state==="working" || s.state==="waiting")`.
4. **`src/pet/tooltip-render.ts`**: giữ nguyên nội dung row (không đổi contract).

## Acceptance criteria

- [ ] Khi pet ở state `walk`, `loop.position` **không đổi** (pet đứng yên); animation sprite vẫn động.
- [ ] Panel **không di chuyển** khi pet đổi state / animate.
- [ ] Panel **hiện** khi có ≥1 session working/waiting; **ẩn hoàn toàn** khi không có (idle/done/rỗng).
- [ ] Panel neo cố định phía trên pet, không tràn ra ngoài cửa sổ 220px (clamp top ≥ 0).
- [ ] Không regress: click-through, kéo cửa sổ (`startDragging`), right-click mở HUD, `set_pet_hit_rect`.
- [ ] `pnpm test` + `pnpm exec tsc --noEmit` xanh.

## Scope boundary (OUT)

- KHÔNG auto-size cửa sổ (giữ 220×220 cố định).
- KHÔNG sửa Rust/`lib.rs`/window/tray/HUD.
- KHÔNG đổi nội dung/row của `renderTooltipHtml`.
- KHÔNG đụng định vị đa-màn-hình / overlay-fullscreen.

## Touchpoints

| File | Thay đổi |
| --- | --- |
| `src/pet/render-loop.ts` | bỏ dịch chuyển trong `stepWalk()`; đặt vị trí nghỉ đáy-giữa |
| `src/pet/pet-tooltip.ts` | gỡ rAF follow; ghim anchor cố định; thêm ẩn/hiện theo session |
| `src/pet/__tests__/` | thêm test: position bất biến khi walk; predicate ẩn/hiện |
| `src/pet/tooltip-render.ts` | giữ nguyên |

## Risks

- **Thấp.** Chỉ frontend, cô lập. Rủi ro chính: panel cao hơn khoảng trống 220px → cần clamp top và chấp nhận overlap nhẹ với pet (panel `pointer-events:none`, vô hại). Cap `TOOLTIP_MAX_ROWS=5` đã giới hạn chiều cao.
- Nếu sau này muốn popup lớn hơn 220px → cân nhắc hướng "auto-size window" (đã đánh giá MEDIUM risk trong báo cáo xia, hoãn).

## Next steps

- Sang `/ck:plan` để chia phase + test (truyền báo cáo này làm context).

## Unresolved questions

- Có muốn giữ hẳn state `walk` (đứng yên) hay map `walk` về `idle` luôn cho gọn state machine? (chi tiết để plan quyết, không chặn).
