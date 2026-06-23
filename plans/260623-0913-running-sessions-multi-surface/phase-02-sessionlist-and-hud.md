---
phase: 2
title: SessionList and HUD
status: completed
priority: P1
dependencies:
  - 1
effort: ~0.5d
---

# Phase 2: SessionList and HUD

## Overview

Component danh sách dùng chung `SessionList` (presentational) + các hook subscribe tái dùng (`use-sessions`), rồi tích hợp vào HUD window (`stats`) thay cho `AgentStatusRow` 1-dòng. Đây là surface đầu tiên dùng lõi Phase 1; `SessionList` sẽ được Phase 3 (popover) tái dùng nguyên vẹn.

## Requirements

- Functional:
  - `SessionList` render: mỗi dòng = dot màu state + project (hoặc sessionId rút gọn nếu null) + nhãn theme + thời gian (`formatDuration(now - since)`); sort theo priority; `done/idle` mờ; empty → "Chưa có session nào"; danh sách dài → cuộn.
  - HUD nghe `sessions-snapshot`, đọc theme qua `label-theme-store`, ticker 1s cập nhật thời gian.
- Non-functional: `SessionList` không tự subscribe (presentational, nhận accessor) để Phase 3 dùng lại; logic sort/faded tách ra `session-list-model.ts` thuần để test.

## Architecture

```
window entry (HUD/popover)
  ├─ createSessionsSignal()  → listen("sessions-snapshot") → Accessor<SessionSnapshot[]>
  ├─ createThemeSignal()     → label-theme-store (init + onThemeChange) → Accessor<LabelTheme>
  ├─ createNowSignal(1000)   → Accessor<number> (epoch giây, tick mỗi 1s)
  └─ <SessionList sessions={..} theme={..} now={..} />
```
`SessionList` gọi `sortSessions()` + `getStateLabel()` + `formatDuration()`. Dot màu: CSS var `--color-state-*` (như `AgentStatusRow` cũ).

## Related Code Files

- Create: `src/ui/shared/session-list-model.ts` — `sortSessions(list)`, `isFaded(state)`, `displayName(snapshot)`.
- Create: `src/ui/shared/use-sessions.ts` — `createSessionsSignal()`, `createThemeSignal()`, `createNowSignal(ms)`.
- Create: `src/ui/shared/SessionList.tsx` — component presentational.
- Create: `src/ui/shared/session-list.css` — style danh sách (import bởi mỗi surface).
- Modify: `src/ui/hud/StatsHud.tsx` — thay `<AgentStatusRow/>` → `<SessionList/>` + wiring.
- Modify: `src/ui/hud/hud.css` — điều chỉnh section (nếu cần).
- Delete: `src/ui/hud/AgentStatusRow.tsx` — bị `SessionList` thay thế (chỉ dùng trong StatsHud).
- Create (tests): `src/ui/shared/__tests__/session-list-model.test.ts`.

## Implementation Steps

### A. Tests first (TDD)

1. `session-list-model.test.ts`:
   - `sortSessions`: hỗn hợp 5 state → thứ tự `working,waiting,error,done,idle`; 2 working khác `ts` → ts mới trước.
   - `isFaded`: `done`/`idle` → true; `working`/`waiting`/`error` → false.
   - `displayName`: có `project` → project; `project===null` → sessionId rút gọn (vd 6 ký tự đầu) — không throw khi null.

### B. Implementation

2. `session-list-model.ts`: import `PRIORITY` + `compareByPriorityThenTs` đã export từ `session-tracker.ts` (Phase 1) — KHÔNG định nghĩa lại (tránh drift thứ tự state).
3. `use-sessions.ts`:
   - `createSessionsSignal()`: `createSignal<SessionSnapshot[]>([])`; `listen("sessions-snapshot", e => set(e.payload))`; `onCleanup(unlisten)`.
   - `createThemeSignal()`: signal init `getCurrentTheme()`; `onMount(initLabelTheme → set)`; `onThemeChange(set)`; cleanup.
   - `createNowSignal(ms=1000)`: signal `epochSeconds`; `setInterval`; `onCleanup(clear)`.
4. `SessionList.tsx`: props `{ sessions: Accessor<SessionSnapshot[]>; theme: Accessor<LabelTheme>; now: Accessor<number> }`. `<For>` qua `sortSessions(sessions())`; mỗi dòng dùng `getStateLabel(theme(), s.state)` + `formatDuration(Math.max(0, now() - s.since))`; class `is-faded` khi `isFaded`. `<Show when={sessions().length===0}>` → empty state.
5. `StatsHud.tsx`: bỏ import/section `AgentStatusRow`; trong `hud-agent-section` mount `SessionList` với 3 signal trên. Xóa file `AgentStatusRow.tsx`.
6. CSS: `.session-row` (flex: dot | name | label | time), `.session-row.is-faded{opacity:.5}`, container `max-height` + `overflow-y:auto`.

### C. Verify

7. `pnpm test` + `tsc --noEmit`. `pnpm tauri dev`: chạy 2-3 agent (hoặc giả lập event), mở HUD → thấy danh sách, thời gian tăng mỗi giây, done mờ dần rồi mất sau 5'.

## Success Criteria

- [ ] `session-list-model` test xanh (sort/faded/displayName).
- [ ] HUD hiển thị danh sách session đúng, duration tick 1s, done/idle mờ, empty state hoạt động.
- [ ] `SessionList` không chứa logic subscribe (chỉ nhận props) → sẵn sàng tái dùng Phase 3.
- [ ] `AgentStatusRow.tsx` đã xóa, không còn tham chiếu; `tsc --noEmit` sạch.

## Risk Assessment

- vitest dùng **happy-dom** nhưng chưa cài `@solidjs/testing-library` → không render-test component SolidJS; dồn logic vào `session-list-model` (thuần) test trực tiếp + verify visual thủ công.
- Nhiều `<For>` re-render mỗi giây do `now()` → chỉ cột thời gian phụ thuộc `now`; chấp nhận với vài session. Nếu cần, tách `<TimeCell>` memo.
- PRIORITY: import từ `session-tracker` (đã export ở Phase 1), KHÔNG copy → tránh lệch thứ tự state giữa pet reaction và danh sách.
