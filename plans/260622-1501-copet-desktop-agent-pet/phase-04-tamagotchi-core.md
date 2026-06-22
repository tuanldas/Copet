# Phase 04 — Tamagotchi Core

> Stats decay, XP/level, evolution gate, offline handling, persistence (tauri-plugin-store). Pure-logic-first (testable), tách khỏi render.

## Context / Links
- Research: `plans/reports/researcher-260622-1511-pet-animation-tamagotchi-report.md` §4 (toàn bộ công thức + schema), §6 (rủi ro evolution/offline)
- Design: `docs/design-guidelines.md` §Stat icons (hunger/energy/happiness/hygiene)

## Requirements (công thức CHỐT — không đổi)
1. 4 stats (0-100): `hunger`, `energy`, `happiness`, `hygiene`. Decay/min: hunger -0.5, energy -0.3, happiness -0.4 (×1.5 nếu hunger<30), hygiene -0.2. Clamp [0,100].
2. XP: `xp_per_level(n) = 100 * 1.5^n`. Nguồn: task done +10..50, feed đúng lúc +2, pet/interact +1, penalty pet ngất -5.
3. Evolution 5 stage: Egg(0-4) / Hatchling(5-19) / Juvenile(20-49) / Adult(50-99) / Legend(100+). Trigger = đạt level **AND** `care_score_7d >= 60`. `care_score_7d` = rolling 7-ngày avg của (hunger+energy+happiness)/3.
4. Offline: `decay_time = min(offline_minutes, 120)` (cap 2h); áp decay; clamp. Khi mở app → emit toast payload "Pet đợi X phút, hunger=Y" (UI render ở P06).
5. Persistence: `tauri-plugin-store` JSON. Schema (research §4.5). Auto-save mỗi 60s + on app exit.
6. TICK driver: 1 tick = 1 phút (interval); apply decay + recompute care_score; emit stats update event.

## Data flow
```
app start → store.load() → applyOfflineDecay(last_saved, now) → state
interval(60s) TICK → decay() + careScore.update() + checkEvolution() → store.set() + emit('stats-changed')
FEED/PET event → adjust stat/xp → emit
agent task done (from P03 event) → addXp() [wired P07; P04 exposes addXp API]
app exit (tauri onCloseRequested / AppExit) → store.save()
```
**Boundary:** P04 KHÔNG listen agent event trực tiếp (đó là P07). Expose `applyAgentXp(event)` cho P07 gọi.

## Files to create
- `frontend/tamagotchi/stats.ts` — decay logic, clamp, hunger<30 multiplier
- `frontend/tamagotchi/xp-level.ts` — `xpPerLevel(n)`, `addXp()`, level-up detect
- `frontend/tamagotchi/evolution.ts` — stage table, `careScore` rolling 7d, `checkEvolution()` (level AND care gate)
- `frontend/tamagotchi/offline-decay.ts` — `applyOfflineDecay(lastSaved, now)` với cap 120m → trả delta + toast payload
- `frontend/tamagotchi/persistence.ts` — wrap `@tauri-apps/plugin-store`: `loadState()`, `saveState()`, schema migration guard (version field)
- `frontend/tamagotchi/tick.ts` — 60s interval driver; pause khi window hidden (tránh double-decay vs offline)
- `frontend/tamagotchi/pet-store.ts` — `@xstate/store` cho pet data (stats/level/xp/stage/tokens); single source; emit changes
- `frontend/tamagotchi/index.ts` — init: load → offline decay → start tick; export API (`feed`, `pet`, `applyAgentXp`, `getState`)
- `frontend/tamagotchi/types.ts` — `PetState`, `Stats`, `Stage` types + STORE schema version const
- Tests: `frontend/tamagotchi/__tests__/stats.test.ts`, `xp-level.test.ts`, `evolution.test.ts`, `offline-decay.test.ts`

## Files to modify
- `package.json` — add `@tauri-apps/plugin-store`; (vitest đã có từ P02)
- `src-tauri/Cargo.toml` + `src-tauri/src/lib.rs` — add `tauri-plugin-store` init (`.plugin(tauri_plugin_store::Builder::new().build())`)
- `src-tauri/capabilities/default.json` — add `store:default` permission
- `src-tauri/tauri.conf.json` — (nếu cần) plugins entry

## Implementation steps
1. `types.ts`: định nghĩa schema + `SCHEMA_VERSION` (cho migration guard).
2. `stats.ts`: `applyDecay(stats, minutes)` pure fn; hunger<30 → happiness ×1.5; clamp.
3. `xp-level.ts`: `xpPerLevel(n)=Math.round(100*1.5**n)`; `addXp(state, amount)` → cộng dồn, detect multi-level-up.
4. `evolution.ts`: stage từ level; `careScore` lưu buffer rolling (vd mảng daily avg 7 phần tử) → avg; `checkEvolution` chỉ trigger khi qua ngưỡng level VÀ care_score≥60.
5. `offline-decay.ts`: `min(offlineMin,120)` → `applyDecay`; trả `{newStats, waitedMinutes}` cho toast.
6. `persistence.ts`: load (default nếu chưa có / version mismatch → migrate/reset an toàn), save; auto-save interval + flush on exit.
7. `tick.ts`: `setInterval(60000)`; on hidden pause (offline-decay xử lý gap khi visible lại) để tránh decay 2 lần.
8. `index.ts`: orchestrate; expose API cho P05 (tokens, feed) + P07 (applyAgentXp).
9. Rust: đăng ký `tauri-plugin-store` + permission.

## Tests / Validation
- `pnpm vitest run` — decay đúng rate + clamp; hunger<30 multiplier; `xpPerLevel` đúng giá trị (n=0→100, n=1→150, n=5→759...); multi-level-up; evolution KHÔNG trigger khi care_score<60 dù đủ level; offline cap đúng 120m (test offline 5h → chỉ decay 2h).
- `pnpm tsc --noEmit` sạch.
- `cargo check` sạch (plugin-store init).
- Manual: chạy app, để 2-3 phút thấy stats giảm; đóng/mở app sau vài phút thấy offline toast + stats giảm hợp lý; restart giữ nguyên level/xp.

## Risks & Rollback
| Risk | Mức | Mitigation |
|---|---|---|
| Double-decay (tick + offline overlap) | Med | Tick pause khi hidden; offline chỉ tính gap từ last_saved |
| Offline decay quá khắt khe → user quit | Med | Cap 2h; toast thân thiện; KHÔNG trừ XP offline |
| Evolution trigger lúc stats thấp | Low | care_score 7d gate (đã thiết kế) |
| Store schema đổi giữa version → crash load | Med | `SCHEMA_VERSION` guard; default/reset an toàn |
| Clock skew / time đổi → offline âm | Low | clamp offline_minutes ≥ 0 |

**Rollback:** thuần frontend logic (`frontend/tamagotchi/*`) + plugin-store init nhỏ trong Rust. Revert không ảnh hưởng pet render (P02) — chỉ mất stat loop.

## File ownership (song song)
Wave A. SỞ HỮU `frontend/tamagotchi/*`. Đụng `src-tauri/Cargo.toml`/`lib.rs`/`capabilities` cùng P03/P06 → coordinate qua tách init fn (xem P03 ghi chú). Consume `frontend/types/agent-event.ts` (P03 owns) — chỉ import.

## Open questions
1. XP per task: tính theo số tool_calls, token, hay wall-clock? (research câu hỏi mở §7.3) — đề xuất MVP: +10 mỗi task done, +1 mỗi tool_call; **cần user xác nhận.**
2. Pet "ngất/chết" khi stat=0: hành vi? (sleep ép vs reset) — đề xuất: forced sleep + happiness penalty, không chết hẳn (tránh frustrate).
