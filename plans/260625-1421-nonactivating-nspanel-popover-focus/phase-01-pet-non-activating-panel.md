---
phase: 1
title: Pet non-activating panel
status: completed
effort: M
---

# Phase 1: Pet non-activating panel

## Overview

Make the pet overlay a non-activating `NSPanel` so `show()`/toggle never makes it the key window — the root cause of the popover dismissing when "Show pet" is toggled. Independently shippable: fixes the reported bug even before Phase 2. Opens with a crate-compatibility spike that gates the crate-vs-DIY decision for the whole plan.

## Requirements

- Functional: showing the pet (tray menu, global shortcut, popover toggle, `reset_pet_position` path) never steals key-window status from any other window/app.
- Functional: pet keeps click-through hit-testing (`set_pet_hit_rect`), `startDragging`, transparency, always-over-fullscreen, and window-state position restore.
- Non-functional: no second ObjC binding stack unless the spike proves it conflict-free; no clippy/test regressions.

## Architecture

- `win.show()` on tao maps to `makeKeyAndOrderFront:` → key theft. A `nonactivatingPanel`-masked NSPanel cannot become key on show, eliminating the theft for ALL pet callers at once (vs the Tier-1 `orderFrontRegardless` shim, which only patches the show path).
- Conversion swizzles the class; all existing AppKit mutations (`set_overlay_collection_behavior`, `position`/drag) must run after `to_panel()`.

### Spike (go/no-go, do FIRST)
Add `tauri-nspanel = { git = "https://github.com/ahkohd/tauri-nspanel", branch = "v2" }`, register `tauri_nspanel::init()`, call `to_panel()` on the pet window in `init_windows`, `cargo build --workspace`. Verify it compiles alongside `objc2 0.6` / `objc2-app-kit 0.3` with no symbol/link conflict and the app launches.
- **Pass** → proceed with crate path below.
- **Fail** → fallback: DIY objc2 in a new `src-tauri/src/macos/panel.rs` — `object_setClass(ns_window, NSPanel::class())` + add `NSWindowStyleMask::NonactivatingPanel` via `setStyleMask`, reusing the `ns_window()` pointer pattern from `tray.rs`/`set_overlay_collection_behavior`. Document which path was taken in the phase report.

## Related Code Files

- Modify: `src-tauri/Cargo.toml` (add `tauri-nspanel` dep)
- Modify: `src-tauri/src/lib.rs` — register `tauri_nspanel::init()`; in `init_windows`, after `build_pet_window` + `set_activation_policy(Accessory)`, `to_panel()` the pet and set the non-activating style mask; keep `set_overlay_collection_behavior(&pet)` AFTER conversion
- Modify: `src-tauri/src/tray/tray.rs` — `toggle_pet_window` shows via the panel (no `set_focus`; already removed)
- Create (fallback only): `src-tauri/src/macos/panel.rs` (+ `mod macos;`) — DIY class-swap helper, pure of business logic
- Modify: `src/ui/sessions/sessions-entry.tsx` — remove `togglingPet` guard + the `win.setFocus()` reclaim in `handleTogglePet` (pet can no longer steal focus, so the suppress hack is dead). Keep optimistic `petShown` state.

## Implementation Steps

1. **Spike** (above). Record pass/fail + chosen path.
2. Register the plugin; convert the pet window to a non-activating panel post-Accessory-policy. Ensure `becomes_key_only_if_needed(true)` (or style-mask equivalent) so the panel never grabs key on its own.
3. Re-apply `set_overlay_collection_behavior(&pet)` and confirm level/collection still set on the swizzled panel.
4. Delete the `togglingPet` flag, the `onFocusChanged`-coupled guard usage for it, and the `win.setFocus()` reclaim in `handleTogglePet`. Leave `sessions` blur-hide intact for now (Phase 2 removes it).
5. `cargo clippy --workspace --all-targets -- -D warnings` + `cargo test --workspace`; `pnpm exec tsc --noEmit` + `pnpm test`.

## Tests (TDD)

- No new pure logic in this phase → no new unit test (honest: the change is native-window config). Existing `tray.rs` `popover_position` tests must stay green.
- **Manual acceptance gate (run via `pnpm tauri dev`, full restart for Rust):**
  - [ ] Open popover → toggle "Show pet" OFF then ON repeatedly → popover stays open every time.
  - [ ] Pet draggable across monitors; click-through still passes clicks beneath it.
  - [ ] Global shortcut shows the pet while another app stays frontmost/active (menu bar unchanged).
  - [ ] Pet floats over a fullscreen app's Space.

## Success Criteria

- [ ] Spike resolved; crate-vs-DIY decision recorded.
- [ ] Pet is a non-activating panel; showing it never steals key (manual gate passes).
- [ ] `togglingPet` + `setFocus` reclaim removed from `sessions-entry.tsx`.
- [ ] All four CI gates green; existing Rust unit tests unchanged.

## Risk Assessment

- **Crate/objc2 conflict** → mitigated by the up-front spike + DIY fallback.
- **Click-through/drag regression on a panel** → manual gate; if broken, panels accept `acceptsMouseMovedEvents`/`ignoresMouseEvents` tuning — re-apply the pet's click-through config after conversion.
- **Collection behavior lost on swizzle** → re-apply after `to_panel()`; verify fullscreen-Space float in the gate.
