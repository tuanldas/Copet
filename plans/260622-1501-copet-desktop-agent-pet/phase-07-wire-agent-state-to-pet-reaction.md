# Phase 07 — Wire Agent State → Pet Reaction

> Integration phase. Nối `agent-status-changed` (P03) → pet animation/mood/tooltip (P02) + tray (P06) + XP (P04). Xử lý multi-session aggregation. Depends P02+P03+P04+P06.

## Context / Links
- Research: `plans/reports/research-260622-1501-multi-agent-cli-state-detection-report.md` §7.4 (multi-instance question)
- Research: `plans/reports/researcher-260622-1511-pet-animation-tamagotchi-report.md` §3 (agent state→pet mood map)
- Design: `docs/design-guidelines.md` §Color (state accent), §Motion (state-change squash+flash), §Tooltip (agent+state+project)

## Requirements
1. Frontend listener nhận `agent-status-changed` (canonical AgentEvent từ P03) → dispatch `AGENT_EVENT` vào pet state machine (P02) → đổi animation.
2. State→reaction map: working→working anim + blue glow; waiting→idle + amber + (optional notify); done(success)→celebrate + green + hearts particle; error→error anim + red flash; idle→idle/walk + slate.
3. Tooltip hover pet: agent hiện tại + state + project name (từ event payload).
4. Tray: nối `agent-status-changed` → `set_tray_state` (P06) đổi icon/tooltip.
5. XP: task done event → `applyAgentXp` (P04); tool_call → `addTokens` (P05 economy).
6. **Multi-session aggregation:** nhiều session_id đồng thời → 1 policy hiển thị: priority `working > waiting > error > done > idle`; badge số session active; tooltip liệt kê sessions (hoặc session mới nhất). Track session map trong frontend (per-session last state + ts), expire session sau timeout (vd 5 phút không event → idle/remove).

## Data flow
```
P03 daemon emit('agent-status-changed', AgentEvent)
  → frontend agent-bridge listen()
      → SessionTracker.update(session_id, state, ts)
      → aggregate() → effectiveState (priority policy)
      → pet machine.send({type:'AGENT_EVENT', state: effectiveState})  [P02]
      → tooltip.update(agent, state, project, sessionCount)
      → if state==done → P04.applyAgentXp(); if tool present → P05.addTokens(1)
      → invoke('set_tray_state', effectiveState)  [P06]
SessionTracker timer → expire stale sessions → re-aggregate
```

## Files to create
- `frontend/agent-bridge/agent-bridge.ts` — `listen('agent-status-changed')`; orchestrate dispatch tới pet/tooltip/xp/tray
- `frontend/agent-bridge/session-tracker.ts` — Map<session_id,{state,ts,agent,project}>; `update()`, `aggregate()` (priority), `expireStale(timeout)`
- `frontend/agent-bridge/reaction-map.ts` — canonical state → {petEvent, glowColor, particle, notify?} (DRY, dùng design accent colors)
- `frontend/pet/pet-tooltip.ts` — tooltip DOM overlay (agent+state+project+count); hover handling
- Tests: `frontend/agent-bridge/__tests__/session-tracker.test.ts` — aggregate priority đúng; expire stale; single/multi session

## Files to modify
- `src/main.ts` — init `agent-bridge` sau khi pet mounted
- `frontend/pet/index.ts` (P02) — expose `mountPet` trả handle có `sendAgentEvent()` + glow/particle API; **coordinate P02 owner** (thêm public API, không sửa render core)
- `frontend/pet/animation-controller.ts` (P02) — glow color + celebrate particle hook (nếu chưa có)
- `src-tauri/src/commands/system_commands.rs` (P06) — add `set_tray_state` command (nếu P06 expose qua tray module, chỉ cần invoke wrapper)
- `frontend/tamagotchi/index.ts` (P04) — đảm bảo `applyAgentXp(event)` public (P04 đã expose)
- `frontend/economy/economy.ts` (P05) — `addTokens` public (đã có)

## Implementation steps
1. `session-tracker.ts`: Map theo session_id; `aggregate()` chọn state ưu tiên cao nhất trong sessions active; `expireStale(now, timeoutMs)`.
2. `reaction-map.ts`: bảng state→reaction (glow hex từ design: working#3B82F6, waiting#F59E0B, done#22C55E, error#EF4444, idle#94A3B8).
3. `agent-bridge.ts`: listen event → tracker.update → aggregate → dispatch pet machine + tooltip + tray invoke; done→xp, tool→token; setInterval expire stale → re-aggregate.
4. `pet-tooltip.ts`: hover pet (canvas mouseenter/leave) → show overlay với agent/state/project/count.
5. P02 glow/particle: animation-controller áp glow color theo current agent state; celebrate → hearts/sparkle particle (Canvas draw).
6. Tray: invoke `set_tray_state(effectiveState)` mỗi lần aggregate đổi.
7. e2e wiring test với agent thật.

## Tests / Validation
- `pnpm vitest run` — session-tracker: 1 session working→pet working; 2 sessions (1 working,1 done)→aggregate working; stale expire→idle; done triggers xp callback (mock); priority order đúng.
- `pnpm tsc --noEmit` sạch.
- **e2e (manual, KEY):** Claude Code thật chạy task → pet working (blue glow) + tray icon đổi + tooltip hiện project; task done → celebrate + green + XP tăng (HUD); trigger permission prompt → waiting (amber). `copet run -- sleep 3` → working→done. Mở 2 session → pet phản ánh aggregate (không nhảy loạn).
- Latency event→animation < 300ms (manual).

## Risks & Rollback
| Risk | Mức | Mitigation |
|---|---|---|
| Multi-session flicker (states nhảy loạn) | Med | Aggregation priority + debounce; expire stale; test 2-3 session |
| Event flood (nhiều tool_call/s) → animation giật | Med | Coalesce: chỉ re-dispatch khi effectiveState đổi; token cộng dồn |
| done/error phân biệt sai (success vs fail) | Med | Dựa exit code (wrapper) + agent done event; error chỉ khi rõ ràng |
| XP double-count (done emit nhiều lần) | Med | Dedup theo session_id+ts; chỉ XP 1 lần/turn |
| Stale session không expire → kẹt working | Med | Timer expire + idle fallback |

**Rollback:** `frontend/agent-bridge/*` là lớp nối; nếu lỗi, disable bridge → pet về idle thuần (mất phản ứng agent nhưng app + tamagotchi vẫn chạy). Public API thêm vào P02/P04/P05 là additive, không phá core.

## File ownership
SEQUENTIAL (sau Wave A + Wave B). Là phase tích hợp — chạm public API nhiều module nhưng chỉ ADD listener/wiring, không sửa internal. Chạy một mình (không song song) để kiểm soát integration.

## Open questions
1. Multi-session UI: hiện 1 pet aggregate (đề xuất MVP) hay nhiều pet/badge chi tiết? — **cần user.**
2. Session expire timeout hợp lý? (đề xuất 5 phút) — tinh chỉnh khi test thật.
3. "done success vs error" cho Claude Code (Stop event không kèm exit code) — phân biệt thế nào? Đề xuất: mặc định success; error chỉ từ wrapper exit≠0 hoặc agent error signal rõ ràng.
