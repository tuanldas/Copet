---
phase: 3
title: Cleanup regression docs
status: completed
effort: S
---

# Phase 3: Cleanup regression docs

## Overview

Remove dead focus-workaround code, run the full regression + manual acceptance suite, and update the docs/gotchas that describe the window focus model so the non-activating-panel architecture is the documented source of truth.

## Requirements

- Functional: no behavioral change beyond Phases 1-2; only dead-code removal + docs.
- Non-functional: codebase contains zero focus suppress-flags; CLAUDE.md + architecture docs match reality.

## Architecture

Consolidation phase. Confirms the new invariant: **overlay/popover windows are non-activating panels; popover dismissal is native (outside-click monitor + resignKey); no window steals key on show.** Encodes it where future maintainers will look.

## Related Code Files

- Modify: `src/ui/sessions/sessions-entry.tsx` — final sweep: no `togglingPet`, `justShown`, or `onFocusChanged` remnants; comment block at top updated to describe native dismissal.
- Modify: `src-tauri/src/tray/tray.rs` — `toggle_pet_window` doc comment updated (panel cannot take key; remove the now-redundant "never set_focus" rationale or fold it into the panel rationale).
- Modify: `CLAUDE.md` — update the macOS gotchas: add the non-activating-panel rule next to the existing "runtime-build after Accessory policy" + "position via AppKit" notes.
- Modify: `docs/system-architecture.md` and/or `docs/codebase-summary.md` — document the window/focus model (panels, dismissal signals) where windows are described.
- Modify: `plans/260625-1421-nonactivating-nspanel-popover-focus/plan.md` — mark phases complete via `ck plan check`.

## Implementation Steps

1. Grep sweep: `grep -rn "togglingPet\|justShown\|onFocusChanged" src/ui/sessions` returns nothing (except an intentional Escape handler). Remove any stragglers.
2. Update `toggle_pet_window` + `sessions-entry.tsx` header comments to the panel model.
3. Update `CLAUDE.md` gotchas + `docs/system-architecture.md` window/focus section.
4. Full regression: `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `pnpm exec tsc --noEmit`, `pnpm test`.
5. Run the consolidated manual acceptance checklist (below). Record results in a phase report under `plans/reports/`.
6. `ck plan check 1 && ck plan check 2 && ck plan check 3` from the plan dir.

## Tests (TDD)

- No new logic. Regression-only: all unit tests from Phases 1-2 stay green; no new clippy/tsc warnings.
- **Consolidated manual acceptance gate (the whole-plan criteria):**
  - [ ] Toggle pet on/off inside popover repeatedly → popover stays.
  - [ ] Real click-away (other app + other monitor) → popover hides; `Escape` hides.
  - [ ] Pet: drag across monitors, click-through, fullscreen-Space float, position restore after relaunch.
  - [ ] Global shortcut + tray "Show / Hide Pet" toggle pet without activating Copet over the user's frontmost app.

## Success Criteria

- [ ] Zero focus suppress-flags remain (grep-clean).
- [ ] CLAUDE.md + architecture docs describe the non-activating-panel + native-dismissal model.
- [ ] All four CI gates green; consolidated manual gate passes and is recorded in a phase report.
- [ ] All three phases checked complete in `plan.md`.

## Risk Assessment

- **Doc drift** → update docs in the same phase as the code lands, not later.
- **Hidden remaining caller** of the old behavior → the grep sweep + manual gate catch stragglers; `cargo test`/`tsc` catch dangling symbol refs.
