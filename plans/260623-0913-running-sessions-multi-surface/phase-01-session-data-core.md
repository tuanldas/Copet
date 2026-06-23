---
phase: 1
title: Session data core
status: completed
priority: P1
dependencies: []
effort: ~0.5d
---

# Phase 1: Session data core

## Overview

Nền dữ liệu dùng chung cho cả 3 surface: mở rộng `SessionTracker` để expose danh sách (`list()`) + mốc `since`; thêm 3 bộ nhãn theme; helper format thời gian; helper theme-store; và cho pet window **broadcast** snapshot qua event `sessions-snapshot`. Không có UI ở phase này.

## Requirements

- Functional:
  - `SessionTracker` giữ thêm `since` mỗi session; `list()` trả `SessionSnapshot[]`.
  - `getStateLabel(theme, state)` trả `{text, emoji}` cho 3 theme × 5 state.
  - `formatDuration(seconds)` → `"7s"/"19m"/"2h"/"3d"`.
  - `label-theme-store`: đọc theme hiện tại (`get_settings`) + subscribe `label-theme-changed`, mặc định `kitchen`.
  - `agent-bridge` emit `sessions-snapshot` (payload `list()`) sau mỗi update và sau khi expire xóa session.
- Non-functional: pure modules không phụ thuộc DOM/Tauri (trừ `label-theme-store` + broadcast) để unit-test được; giữ mỗi file < 200 LOC.

## Architecture

`AgentEvent (Tauri) → agent-bridge._handleEvent → tracker.update(+since) → _broadcast() → emit("sessions-snapshot", tracker.list())`. Expire interval cũng gọi `_broadcast()` khi có session bị xóa. `aggregate()` giữ nguyên (pet reaction không đổi).

`since` rule: đặt `since = ts` khi session mới HOẶC (`prevState ∈ {done,error}` và `newState == working`); còn lại giữ nguyên. ⚠️ per-session KHÔNG bao giờ có `idle` (idle chỉ từ `aggregate()`) → không đưa vào predicate; `waiting→working` KHÔNG reset (cùng lượt); `done/error→working` = lượt mới → reset. `update()` GIỮ signature 5-tham-số, tính `since` nội bộ (đọc entry cũ trước khi set) → 17 test tracker cũ không vỡ.

## Related Code Files

- Create: `src/types/session-snapshot.ts` — `SessionSnapshot`, `LabelTheme`.
- Create: `src/agent-bridge/state-labels.ts` — 3 bộ nhãn + `getStateLabel`.
- Create: `src/ui/shared/session-duration.ts` — `formatDuration`.
- Create: `src/ui/shared/label-theme-store.ts` — `initLabelTheme`, `getCurrentTheme`, `onThemeChange`.
- Modify: `src/ui/shared/tauri-commands.ts` — thêm `label_theme?: LabelTheme` (optional) vào `PersistedSettings` + export type `LabelTheme` (type widening; Phase 5 flip → required). Tránh `tsc` fail khi `label-theme-store` đọc `label_theme` trước Phase 5.
- Modify: `src/agent-bridge/session-tracker.ts` — thêm `since` vào `SessionEntry`; logic `since`; `list()`; **export `PRIORITY` + `compareByPriorityThenTs(a,b)`** (Phase 2/4 import lại, tránh trùng PRIORITY).
- Modify: `src/agent-bridge/agent-bridge.ts` — `_broadcast()` + emit trong `_handleEvent` và expire interval.
- Create (tests): `src/agent-bridge/__tests__/state-labels.test.ts`, `src/ui/shared/__tests__/session-duration.test.ts`.
- Modify (tests): `src/agent-bridge/__tests__/session-tracker.test.ts` — case `since` + `list()`.

## Implementation Steps

### A. Tests first (TDD)

1. `session-duration.test.ts`: `formatDuration` → `0→"0s"`, `7→"7s"`, `59→"59s"`, `60→"1m"`, `1140→"19m"`, `3599→"59m"`, `3600→"1h"`, `86399→"23h"`, `86400→"1d"`; âm/NaN → `"0s"`.
2. `state-labels.test.ts`: với mỗi `LabelTheme` × mỗi `AgentState`, `getStateLabel` trả `text` + `emoji` non-empty; spot-check `kitchen/working = {text:"Cooking", emoji:"🍳"}`, `garden/done = {text:"Bloomed", emoji:"🌸"}`; state lạ → fallback không throw; **theme `undefined`/lạ → fallback `kitchen`, không throw**.
3. `session-tracker.test.ts` (mở rộng):
   - `update()` lần đầu → entry có `since === ts`.
   - working→working (ts tăng) → `since` KHÔNG đổi.
   - waiting→working → `since` KHÔNG đổi (cùng lượt).
   - working→done→working → `since` reset về ts mới nhất (lượt mới).
   - `list()` trả đúng số phần tử + có `sessionId`, `since`.
   - `expireStale` xóa session cũ khỏi `list()`.

### B. Implementation

4. `src/types/session-snapshot.ts`: định nghĩa `SessionSnapshot`, `LabelTheme` (xem Shared Contracts trong `plan.md`).
5. `session-tracker.ts`: `SessionEntry` thêm `since: number`. Trong `update()` áp dụng rule `since` (cần đọc entry cũ trước khi set). Thêm:
   ```ts
   list(): SessionSnapshot[] {
     return Array.from(this.sessions.entries()).map(([sessionId, e]) => ({
       sessionId, agent: e.agent, project: e.project, state: e.state, since: e.since, ts: e.ts,
     }));
   }
   ```
6. `state-labels.ts`: bảng `Record<LabelTheme, Record<AgentState, StateLabel>>` theo `plan.md`; `getStateLabel(theme,state)` guard CẢ theme lẫn state: `(TABLE[theme] ?? TABLE.kitchen)[state] ?? {text: state, emoji: "·"}` — an toàn khi theme `undefined` (Phase 2/4 chạy trước Phase 5).
7. `session-duration.ts`: `formatDuration` theo bậc s/m/h/d, guard âm/NaN.
8. `label-theme-store.ts`: cache module-level (default `"kitchen"`); `initLabelTheme()` gọi `invoke("get_settings")`, **coerce missing/invalid `label_theme` → `kitchen` tại boundary** (không bao giờ trả undefined ra ngoài); `onThemeChange(cb)` dùng `listen("label-theme-changed")` + cập nhật cache; `getCurrentTheme()` trả cache.
9. `agent-bridge.ts`: import `emit`; thêm `function _broadcast(){ emit("sessions-snapshot", _tracker.list()).catch(...) }`; gọi cuối `_handleEvent`; trong expire interval gọi khi `removed`.

### C. Verify

10. `pnpm test` (tracker + labels + duration xanh, toàn bộ suite hiện tại không vỡ). `pnpm exec tsc --noEmit`.

## Success Criteria

- [ ] `list()` trả snapshot có `since`; rule `since` đúng theo test.
- [ ] `getStateLabel` phủ 3×5; `formatDuration` qua hết case.
- [ ] Pet window emit `sessions-snapshot` mỗi update + sau expire (verify bằng log/manual).
- [ ] `pnpm test` + `tsc --noEmit` xanh; pet reaction cũ không đổi.

## Risk Assessment

- `aggregate()`/pet reaction regression → giữ nguyên hàm, chỉ thêm field; test cũ là lưới an toàn.
- `label-theme-store` phụ thuộc Tauri → tách phần thuần (default/cache) khỏi wiring; wiring verify thủ công.
- Emit quá thường xuyên (mỗi tool_call) → payload nhỏ (vài session), chấp nhận; nếu cần sau này debounce.
