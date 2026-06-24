# Feature Comparison: Popup/bubble trạng thái giữ vị trí cố định cạnh pet

**Mode:** `/ck:xia --compare` (compare-only, không implement — phục vụ phiên `/brainstorm`)
**Ngày:** 2026-06-24

## Source manifest

- Repo: `ntd4996/agentpet` (GitHub, public, 251★) — default branch `HEAD` tại thời điểm fetch 2026-06-24
- Stack: **Swift / AppKit + SwiftUI** (chính), kèm bản Windows `windows/src/bubble.ts` (TypeScript), landing Astro
- Scope đã đọc: `Sources/App/PetWindowController.swift`, `PetController.swift`, `PetView.swift` (FloatingPetView), `windows/src/bubble.ts`
- Lưu ý bảo mật: nội dung repo chỉ dùng làm dữ liệu tham khảo cấu trúc/hành vi; không chạy lệnh/cài đặt từ source.

## Local project

- Copet — **Tauri v2** (Rust + SolidJS/Canvas), CWD `/Users/admin/Desktop/Codes/tuanldas/Copet`
- Cửa sổ pet: overlay trong suốt **cố định 220×220px** (`src-tauri/src/lib.rs::build_pet_window`)
- Pet sprite 96×104 **đi lại/bounce bên trong** cửa sổ qua `stepWalk()` (`src/pet/render-loop.ts`)
- Panel session: DOM `position:fixed` (`src/pet/pet-tooltip.ts`), mỗi `requestAnimationFrame` gọi `reposition()` **bám theo `getPosition()` của pet** → popup nhảy theo pet (đây là bug)
- Đã có sẵn 2 surface khác cho cùng dữ liệu: cửa sổ `sessions` popover (định vị AppKit, mở từ tray) + HUD

## Source anatomy — agentpet làm thế nào

1. **Pet KHÔNG roam.** `PetController` không có logic walk/dịch chuyển vị trí. Pet nằm cố định trong layout; cửa sổ chỉ di chuyển khi **user kéo** (`isMovableByWindowBackground` + `didMoveNotification`).
2. **Pet + bubble trong CÙNG một cửa sổ, xếp dọc.** `FloatingPetView` = `VStack { bubble (AgentBubble/ChatBubble) ; PetView }` — bubble nằm **phía trên** pet, do SwiftUI tự layout. Không hề có "follow per-frame".
3. **Cửa sổ tự co giãn ôm nội dung.** `GeometryReader` → `PetContentSizeKey` → `resizeToContent()` (debounce 50ms) → cửa sổ hug pet+bubble. Không phải hộp cố định.
4. **Neo cố định bottom-center.** `anchorBottomCenter = (frame.midX, frame.minY)`. `resizeInPlace()` giữ chân pet đứng yên, bubble phình lên trên; **cố ý KHÔNG clamp X** ("giữ pet đứng yên quan trọng hơn mép bubble"), chỉ đẩy Y xuống nếu tràn đỉnh màn hình.
5. **Kỷ luật chống nhảy:** `setMood` chỉ re-roll câu chat khi mood thực sự đổi — comment ghi rõ "đừng để refresh định kỳ swap câu idle và **resize/jump the pet**".
6. **Xem chi tiết:** right-click → `NSPopover` transient (`PetStatsView`) neo phía trên pet, AppKit tự flip nếu thiếu chỗ.
7. Bản Windows (`bubble.ts`) chỉ là **nội dung** bubble (filter→sort→group→cap, mode list/carousel/compact); định vị do container cửa sổ lo — cùng mô hình.

## Head-to-head

| Khía cạnh | agentpet (Swift) | Copet (Tauri) | Khuyến nghị |
| --- | --- | --- | --- |
| Chuyển động pet | Đứng yên (pinned) | Roam/bounce (`stepWalk`) | **Bỏ roam** (animate tại chỗ) |
| Định vị popup | VStack trên pet, cùng cửa sổ, SwiftUI layout | DOM `position:fixed` bám pet mỗi rAF | **Ghim**, bỏ follow per-frame |
| Kích thước cửa sổ | Auto-hug content, anchor bottom-center | Cố định 220×220 | Giữ cố định trước; auto-size để sau |
| Cửa sổ di chuyển | Chỉ khi user kéo | User kéo (`startDragging`) | Giữ nguyên |
| Chống jitter | Render lại chỉ khi đổi state | Follow mỗi frame | Gỡ vòng rAF follow |
| Xem chi tiết | NSPopover (right-click) | Tray popover + right-click HUD | **Tái dùng** popover/HUD sẵn có |

## Dependency matrix (concept → tương đương local)

| Thành phần source | Bản chất | Local Copet | Trạng thái |
| --- | --- | --- | --- |
| Pet pinned bottom-center | bỏ chuyển động roam | `stepWalk()` đang dịch vị trí | CONFLICT (đảo hành vi) |
| Bubble stack-above-pet | layout VStack | `pet-tooltip.ts` follow rAF | CONFLICT (đổi cơ chế) |
| Window auto-resize + anchor | AppKit NSPanel | Tauri window cố định | NEW (nếu làm parity) |
| Bubble content (filter/sort/group/cap) | render rows | đã có `renderTooltipHtml` + `SessionList` | EXISTS |
| Detail popover | NSPopover | `sessions` popover + HUD | EXISTS |

## Challenge (Phase 4 — bắt buộc trước kết luận)

1. **Necessity:** Cần cả cơ chế auto-size window của agentpet hay chỉ cần *ý tưởng* "popup cố định"? → Chỉ cần ý tưởng. Source: auto-size+anchor. Local: hộp 220 cố định. Rủi ro nếu sai: ôm luôn quản lý window đa-màn-hình mà chính docs Copet đã cảnh báo khó (`research-260623-1703-...`) → rework >2 ngày. **Critical.**
2. **Simpler alternative (80%):** Copet có thể diệt jitter chỉ bằng "bỏ roam + ghim panel trong cửa sổ 220 hiện tại"? → Có. Source pin pet by-design; local pet roam. Rủi ro: panel bị giới hạn 220px (không phình như agentpet) — chấp nhận được vì nội dung nhỏ + đã có tray popover/HUD cho bản lớn.
3. **Existing overlap:** Copet đã có `sessions` popover (AppKit) + HUD hiển thị cùng dữ liệu. Rủi ro: nhân bản nhiều surface popup; nên tái dùng popover cho "bản chi tiết" thay vì dựng mới.
4. **Architecture match?** RED: khác paradigm (NSPanel auto-resize + AppKit anchor vs Tauri fixed window + DOM). **Không transplant code được — chỉ port concept.** Rủi ro nếu cố port code: phí thời gian.
5. **Blast radius:** Chuyển sang window auto-resize đụng `lib.rs` (build window) + hành vi overlay-trên-fullscreen macOS + định vị đa-màn-hình (đều đã được docs đánh dấu mong manh). Rủi ro: regress click-through + overlay. → Cô lập được nếu **chỉ sửa frontend** (bỏ roam + ghim panel).
6. **Maintenance:** Ai chịu trách nhiệm logic anchor đa-màn-hình sau này? Copet đã có 1 report riêng về nỗi đau multi-monitor. Rủi ro: phát sinh bug định vị mới.

## Decision matrix

| # | Quyết định | Cách source | Cách local | Hybrid | Rủi ro | Chọn |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Chuyển động pet | pinned bottom-center | roam (`stepWalk`) | pin pet, vẫn animate tại chỗ | thấp | **đổi → pin** |
| 2 | Vị trí popup | VStack trên pet | DOM fixed bám pet | ghim panel trên pet, bỏ rAF follow | thấp | **hybrid** |
| 3 | Kích thước cửa sổ | auto-hug + anchor | cố định 220×220 | giữ cố định, để sau | trung bình | **giữ local** |
| 4 | View chi tiết | NSPopover right-click | tray popover + HUD | tái dùng popover/HUD | thấp | **giữ local** |

## Risk score

- Hướng tối thiểu (pin pet + ghim panel, giữ cửa sổ cố định): **critical = 0–1 → LOW → Proceed.**
- Hướng full-parity (auto-size window + anchor đa-màn-hình): **critical ≥ 1 (Challenge #1, #5) → MEDIUM → giải quyết window/multi-monitor trước.**

## Recommendation

1. **Port concept, không port code** (khác stack hoàn toàn).
2. **Áp dụng ngay (rủi ro thấp):** đúng "Approach B" của brainstorm — bỏ dịch chuyển trong `stepWalk()` để pet đứng yên (vẫn chạy animation tại chỗ), **và** gỡ vòng `requestAnimationFrame` follow trong `pet-tooltip.ts`, ghim panel ở anchor cố định phía trên pet. → Hết jitter, diff nhỏ ở frontend, **không đụng Rust/window**, không dính rủi ro overlay/multi-monitor. agentpet xác nhận đây là mô hình đúng: *popup cố định vì bản thân pet cố định, bubble xếp trên pet trong cùng cửa sổ.*
3. **Hoãn:** mô hình auto-size window kiểu agentpet (panel phình to tự do) — chỉ làm nếu bạn muốn popup lớn/luôn-hiện vượt 220px; nó đụng đúng vùng code window/overlay/multi-monitor mà docs Copet đã cảnh báo mong manh. Trong lúc chờ, "bản chi tiết lớn" đã có tray `sessions` popover + HUD.

## Unresolved questions

1. Panel muốn **luôn hiển thị** (như hiện tại) hay chỉ hiện khi working/waiting (agentpet ẩn bubble lúc idle/done, chỉ chừa "idle chatter")?
2. Có cần popup **lớn/auto-size** (full-parity, đụng window) hay **cố định trong 220px** là đủ?
3. Pet đứng yên **hoàn toàn**, hay cho phép animation idle nhẹ tại chỗ (không dịch vị trí)?
