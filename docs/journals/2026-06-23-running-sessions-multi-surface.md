# Shipped running sessions multi-surface feature via deep red-team

**Date**: 2026-06-23 10:15
**Severity**: Low (feature delivery)
**Component**: SessionTracker, Tauri IPC, UI (pet window, HUD, tray popover, tooltip)
**Status**: Resolved (shipped on branch `feat/running-sessions-multi-surface` @ 98fc8db)

## What Happened

Shipped the "running sessions list (multi-surface)" feature. Pet window broadcasts per-session snapshots via Tauri `sessions-snapshot` event. HUD, new tray popover window, and pet tooltip all read and render shared SessionList view — single source of truth design (one tracker, one comparator, one label table). SessionTracker gained `since` field (per-session active streak), `list()` export, and stable PRIORITY/comparator. Added 3 user-selectable Tamagotchi label themes (kitchen/mood/garden) via Settings picker emitting `label-theme-changed`. Tray UX shifted: left-click opens sessions popover; pet show/hide moved to tray menu + global shortcut.

## The Brutal Truth

What could have been a debugging nightmare turned into a clean ship because the plan's red-team phase (2 adversarial reviewers in `/ck:plan --deep --tdd` mode) caught three blocking issues BEFORE a single line was written. This is the only reason the implementation phase was friction-free. Had we skipped red-team or done it shallow, we would have wasted 6+ hours chasing runtime failures that looked like integration bugs but were actually plan flaws.

## Technical Details

**Red-team findings (caught at plan time, not code time):**

1. **Tauri plugin feature gate miss**: `tauri-plugin-positioner` declared without `tray-icon` feature. The plan called for `Position::TrayBottomCenter` and runtime `on_tray_event` handler — both feature-gated. Would have failed compilation with cryptic error: `TrayBottomCenter` not in scope. Corrected: added `features = ["tray-icon"]` to Cargo.toml dependency before any code landed.

2. **`since` reset logic dead branch**: Plan keyed `since` reset on a per-session `idle` state. But `idle` is never emitted as a per-session state — it's only an aggregate output of the entire tracker. The reset condition would never trigger, leaving active streaks running indefinitely. Corrected: reset only on `done` or `error` state transitions (the only actual terminal states).

3. **Test strategy premise error**: Plan stated "vitest has no jsdom, so pure-module tests will work." Vitest actually defaults to happy-dom, not JSDOM. The pure-module design stayed (it's sound), but for the correct reason — vitest's test isolation was already solid without the premise.

**Implementation outcome:**
- 261 vitest passing
- TypeScript clean (tsc)
- Rust clean (cargo check, test, clippy)
- Code review verdict: SHIP
- Branch: `feat/running-sessions-multi-surface` (98fc8db) — not yet pushed

## What We Tried

The workflow was:
1. `brainstorm` → sketch multi-surface broadcast + label picker architecture
2. `/ck:plan --deep --tdd` → 2 adversarial reviewers challenged every assumption
3. Reviewers raised 3 blocking issues (see above); plan edited in-place
4. `/ck:cook` → implementation phase; no blocking surprises

No failed attempts in the code phase because the plan had already been stress-tested.

## Root Cause Analysis

If we'd skipped deep red-team, we would have discovered these issues during implementation or worse, during local dev:
- Compilation failure (feature gate) → 30 min debugging "why doesn't my tray code compile?"
- Runtime idle state never firing → 2 hr+ of Session state logs, "why isn't since resetting?"
- Test assumptions wrong → rebuilding or switching test framework mid-way

The root cause of avoiding this pain: respecting the red-team phase as a design validation gate, not a rubber stamp.

## Lessons Learned

**Deep red-team at plan time converts would-be debugging cycles into plan edits.** A 90-minute adversarial review session is cheaper than 6 hours of code-time debugging. The return on that investment is immediate and measurable here: clean implementation pass.

**Feature gates and state machines must be validated for feasibility before code.** It's easy to overlook that a Tauri feature is required or that a state transition never actually occurs if you're just reading the plan passively. Active red-teaming — "find the way this breaks" — surfaces these gaps.

**Single-source-of-truth design (one tracker, one broadcast, many consumers) only works if the tracker API is correctly specified.** The `since` reset bug could have cascaded into inconsistent state across all consumers (HUD, tray popover, tooltip) if not caught early.

## Next Steps

- [ ] Push branch to origin when CI clears
- [ ] Monitor macOS tray popover behavior (focus/blur-to-hide reliability) — deferred to Phase 3; fallbacks (Escape + click-tray-again) in place; manual E2E needed via `pnpm tauri dev`
- [ ] Deferred: model + task-summary enrichment (would require reading Claude `transcript_path`); file tracking issue #13633

**Owner:** (Commit author: tuan.le@codegym.vn)
