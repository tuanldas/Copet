---
title: "Brainstorm — Danh sách session đang chạy (multi-surface)"
type: brainstorm-report
date: 2026-06-23
slug: running-sessions-multi-surface
status: approved
flags: []          # không dùng --html / --wiki
handoff: "/ck:plan --deep --tdd"
related:
  - docs/system-architecture.md
  - src/agent-bridge/session-tracker.ts
  - src/agent-bridge/agent-bridge.ts
  - src/ui/hud/StatsHud.tsx
  - src/ui/hud/AgentStatusRow.tsx
  - src-tauri/src/tray/tray.rs
---

# Brainstorm — Danh sách "session đang chạy" cho Copet

## 1. Problem statement

User muốn Copet **hiển thị thông tin các session agent đang chạy** dưới dạng danh sách (tham khảo FleetView của Claude Code — ảnh #5/#6: mỗi dòng có project, trạng thái, thời gian chạy, model/task).

Vấn đề nền (problem-first): Copet hiện đã track multi-session nhưng **chỉ gộp thành 1 dominant state** để pet phản ứng → người dùng **không nhìn được toàn cảnh** các session song song. Nhu cầu thực: "liếc nhanh xem mình đang có mấy phiên agent chạy, mỗi phiên ở trạng thái gì, bao lâu rồi".

## 2. Hiện trạng codebase (scout)

- **Copet** = Tauri v2 (Rust core + SolidJS/Canvas 2D frontend). MVP xong 8 phase. Roadmap KHÔNG có feature này → post-MVP mới, không đụng kế hoạch dở.
- `src/agent-bridge/session-tracker.ts`: đã giữ `Map<session_id, {state, ts, agent, project}>`, có `aggregate()` (dominant: working>waiting>error>done>idle) + `expireStale()` (timeout 5'). **Chưa có `list()`**.
- `src/agent-bridge/agent-bridge.ts`: chạy ở pet window (owner). Nhận `agent-status-changed` → update tracker → aggregate → pet reaction + tooltip + tray. `_tracker` **private trong pet window**.
- `src/ui/hud/AgentStatusRow.tsx`: chỉ hiện **1 dòng = event mới nhất**, thậm chí không dùng SessionTracker.
- `AgentEvent` (Rust `crates/copet-protocol/src/lib.rs` + mirror TS): chỉ có `agent, session_id, state, tool, project, ts`. **Không có model, không có task summary.**
- `src-tauri/src/tray/tray.rs`: left-click = toggle pet; right-click = menu. `show_menu_on_left_click(false)`.
- `tauri-plugin-positioner` đã dùng (`reset_pet_position` → `move_window`). Hỗ trợ neo theo tray nếu forward tray event.

## 3. Brutal honesty — gap dữ liệu vs ảnh tham khảo

Ảnh #5/#6 là **FleetView native của Claude Code**, đọc được internal state. Copet chỉ nhận hook events nên:

| Thông tin | Có qua hook? | Ghi chú |
|---|---|---|
| project name | ✅ | sẵn (`project`) |
| state | ✅ | sẵn (`state`) |
| thời gian chạy | ⚠️ tính được | cần mốc `since` (frontend) |
| model (claude/sonnet…) | ❌ | hook không gửi |
| task summary (ảnh #6) | ❌ | hook không gửi; cần đọc `transcript_path` |

→ Muốn model + task summary phải đọc transcript Claude Code (chỉ áp dụng Claude, sửa hook/protocol, parse JSONL, cân nhắc privacy). **Quyết định: để NGOÀI phạm vi vòng này.**

## 4. Quyết định của user (qua Discovery)

| Câu hỏi | Quyết định |
|---|---|
| Phạm vi data/session | **Chỉ field có sẵn**: agent + project + state + duration |
| Kiểu nhãn state | **Theme-hóa Tamagotchi**, làm **nhiều bộ cho người dùng chọn** (Settings), mặc định Bếp núc |
| Bao nhiêu surface | **3 chỗ: HUD + Tray popover + Tooltip** (bỏ Window riêng vì trùng HUD) |
| done/idle trong list | **Hiện nhưng làm mờ** tới khi hết hạn 5' |
| Mở Tray popover | **Left-click tray** (toggle pet chuyển sang menu phải + hotkey) |

## 5. Approaches đã cân nhắc

### Vị trí hiển thị (đã chọn 3/4)
- **HUD mở rộng** — ít việc nhất, tái dùng window. (chọn)
- **Tray popover** — giống ảnh nhất, positioner sẵn; trung bình việc (window mới + blur). (chọn)
- **Tooltip pet** — rẻ (đã có), nhưng chật khi nhiều session. (chọn)
- **Window "Sessions" riêng** — trùng HUD, giá trị thêm thấp. (LOẠI)

### Chia sẻ dữ liệu giữa các window
- **A. Pet window broadcast snapshot** (`emit "sessions-snapshot"`) → mọi surface render lại. (CHỌN — DRY, single source, khớp "single writer")
- B. Mỗi window tự dựng SessionTracker từ event thô. (LOẠI — 4 bản copy logic, dễ lệch expire/duration)

## 6. Giải pháp chốt

### 6.1 Kiến trúc (lõi dùng chung)
```
socket_daemon (Rust) ──emit "agent-status-changed"──▶ (đã có)
        │
  Pet window: agent-bridge.ts (NGUỒN DUY NHẤT)
   • SessionTracker.update() + track `since`
   • SessionTracker.list()  ← MỚI: snapshot[]
   • emit "sessions-snapshot" ← MỚI: broadcast
        │
   ┌────┼─────────────┐
   ▼    ▼             ▼
  HUD  Tray popover  Tooltip (đọc tracker trực tiếp vì cùng pet window)
   └ nghe snapshot → <SessionList/>
```
Mỗi surface có **ticker 1s** chỉ để re-render cột duration.

### 6.2 Thành phần

**Lõi (frontend, tái dùng):**
- `agent-bridge/session-tracker.ts` (SỬA): thêm `list(): SessionSnapshot[]` (sessionId, agent, project, state, `since`, ts); thêm field `since`.
- `agent-bridge/agent-bridge.ts` (SỬA): sau update/expire → `emit("sessions-snapshot", list())`.
- `agent-bridge/state-labels.ts` (MỚI): 3 bộ nhãn, map state → {label, emoji}; `getLabel(theme, state)`.
- `ui/shared/SessionList.tsx` (MỚI): component danh sách dùng chung — dot màu theo state + project + nhãn theme + duration; sort priority; làm mờ done/idle; empty state; scroll.
- `ui/shared/session-duration.ts` (MỚI): format giây → `7s/1m/19m/2h`.

**Surface:**
- `ui/hud/StatsHud.tsx` (SỬA): thay `<AgentStatusRow/>` → `<SessionList/>` (nghe snapshot). (AgentStatusRow có thể bỏ.)
- `pet/pet-tooltip.ts` (SỬA): tooltip nhiều dòng (giới hạn ~5 dòng, "…" nếu vượt).
- `src-tauri/tauri.conf.json` (SỬA): thêm window `sessions` (transparent, no-decoration, alwaysOnTop, skipTaskbar, visible:false).
- `src-tauri/src/tray/tray.rs` (SỬA): left-click → show popover + forward tray event vào positioner + `move_window(TrayCenter)` + focus; blur → hide.
- popover entry (html + ts, kiểu `hud-entry`) (MỚI): mount `<SessionList/>`.

**Setting chọn nhãn:**
- `ui/settings/Settings.tsx` (SỬA): dropdown "Nhãn trạng thái" (Bếp núc/Cảm xúc/Vườn tược).
- `commands/system_commands.rs` + store (SỬA): lưu `label_theme` (giống `select_pet`); broadcast để 3 surface đổi ngay.

**KHÔNG đụng** `AgentEvent` (Rust protocol + hook). `since` chỉ frontend.

### 6.3 Ba bộ nhãn (mặc định Bếp núc 🍳)
| state | Bếp núc 🍳 | Cảm xúc 😊 | Vườn tược 🌱 |
|---|---|---|---|
| working | 🍳 Cooking | ⚡ Playing | 🌱 Growing |
| waiting | 🍽️ Hungry | 👀 Curious | 💧 Thirsty |
| done | 😋 Full | 😊 Happy | 🌸 Bloomed |
| idle | 💤 Sleeping | 💤 Sleeping | 🌙 Dormant |
| error | 🔥 Burnt | 😢 Sad | 🥀 Wilting |

### 6.4 Quyết định kỹ thuật
- `since`/duration: reset mốc khi session chuyển `done/idle → working` (turn mới) để hiện đúng "đã chạy bao lâu".
- Dot màu giữ palette `--color-state-*` sẵn có; nhãn chữ theo theme.

## 7. Acceptance / validation
- 3 agent chạy song song → HUD + popover + tooltip đều liệt kê đúng 3 session (dot màu, project, nhãn theme, duration cập nhật ~1s).
- `done/idle` hiện mờ tới hết hạn 5' rồi biến mất.
- Left-click tray → popover bật dưới icon; click ra ngoài → ẩn.
- Đổi theme nhãn trong Settings → 3 surface đổi nhãn ngay.
- 0 session → "Chưa có session nào".
- Test: mở rộng `session-tracker.test.ts` cho `list()` + `since`; unit cho `session-duration` + `state-labels`. TDD: viết test trước, giữ 16 vitest + Rust test hiện có xanh.

## 8. Ngoài phạm vi (chốt)
- Model + task summary (ảnh #6) — cần transcript, để sau.
- Action khi click session (read-only).
- Window "Sessions" riêng; cơ chế "+N" (chỉ scroll).

## 9. Rủi ro & giảm thiểu
- Tray popover (neo + blur-to-hide) macOS-first; Win/Linux best-effort — đúng giới hạn known của project (transparent window Tauri #13070).
- Tooltip chật khi nhiều session → giới hạn dòng (tooltip chỉ phụ trợ).
- 3 surface cùng nghe broadcast → dọn listener qua `onCleanup` (pattern sẵn có).
- Modularization: giữ mỗi file < 200 LOC (SessionList, state-labels, duration tách riêng).

## 10. Next steps & dependencies
- Handoff: **`/ck:plan --deep --tdd`** với report này làm input.
- Dependency: không có blocker; toàn bộ trong codebase hiện tại, không thêm crate/dep mới.

## 11. Unresolved questions
- **Default `label_theme`**: chốt Bếp núc 🍳 (khớp ảnh) — xác nhận lại ở bước plan nếu cần.
- **Kích thước popover** (width/max-height) + số dòng tối đa tooltip: để plan chốt theo design-tokens.
- **Sort khi cùng priority**: hiện đề xuất "mới nhất trước" — xác nhận ở plan.
- **`since` per-turn vs first-seen**: đề xuất per-turn; nếu phức tạp, plan có thể hạ xuống first-seen cho v1.
