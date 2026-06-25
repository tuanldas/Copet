---
title: Stable macOS popover focus via non-activating NSPanel (Tier 2)
description: >-
  Make the pet overlay and the tray sessions popover non-activating NSPanels so
  showing/toggling one never steals key-window status from the other; replace
  fragile webview blur-dismissal with native windowDidResignKey + a global
  outside-click monitor. Removes the togglingPet/justShown focus hacks.
status: completed
priority: P2
branch: main
tags:
  - tauri
  - macos
  - nspanel
  - objc2
  - focus
  - popover
  - tdd
blockedBy: []
blocks: []
created: '2026-06-25T07:23:31.376Z'
createdBy: 'ck:plan'
source: skill
---

# Stable macOS popover focus via non-activating NSPanel (Tier 2)

## Overview

The tray sessions popover auto-hides on webview **blur**, and showing another window (`win.show()` → `makeKeyAndOrderFront:`) **steals key-window status** on macOS. Result: toggling "Show pet" from inside the popover blurs and dismisses it. Current mitigation = ad-hoc `togglingPet` / `justShown` suppress-flags — fragile, re-breaks for every new in-popover control that touches another window.

**Tier 2 canonical fix** (from `plans/reports/research-260625-1412-macos-popover-focus-stability-report.md`): convert the **pet** and **sessions** windows into **non-activating `NSPanel`s** (`NSWindowStyleMask.nonactivatingPanel`) so neither can take key-window status from the other, and dismiss the popover from **native AppKit signals** (`windowDidResignKey` + a global outside-click monitor) instead of webview blur. Deletes the focus hacks entirely.

Verified primitives (HIGH confidence, adversarially checked): a non-activating panel does not activate the app on click (previous window stays key); it takes keyboard focus only when a hit view returns `needsPanelToBecomeKey` AND `becomesKeyOnlyIfNeeded`; `tauri-nspanel` (ahkohd) is the canonical crate; outside-click dismissal via `NSEvent.addGlobalMonitorForEventsMatchingMask`.

## Architecture decision

- **Crate vs DIY (3-way, decided by the Phase 1 spike):** primary = `tauri-nspanel` (`branch = "v2"`) `to_panel()` + `panel_delegate!`. Risk: it historically links `objc`/`cocoa`/`objc_id`, while this repo uses `objc2 0.6` + `objc2-app-kit 0.3`. They can coexist (separate ObjC runtime bindings, no link conflict) but add a second stack. If the spike fails, fall back to a **DIY objc2 class-swap** (`object_setClass` NSWindow→NSPanel + style-mask) reusing the repo's existing objc2 AppKit patterns. **Last-resort rollback:** if BOTH panel paths prove too costly, the Tier-1 `orderFrontRegardless`-on-pet shim (research report §3) still fixes the *reported* bug without panels — ship that and stop. Phase 1 is the kill-switch boundary.
- **Pet first, popover second:** making the pet non-activating (Phase 1) alone fixes the *reported* bug at its root and is independently shippable. Phase 2 upgrades the popover's dismissal to native signals (depends on Phase 1 so `resignKey` only fires on a real outside focus, not on pet toggling).
- **Preserve existing overlay behavior:** `to_panel()` swizzles the class, so `set_overlay_collection_behavior` (collection behavior + `NSScreenSaverWindowLevel`) and `position_popover_macos` (`setFrameOrigin`) must run **after** conversion. NSPanel ⊂ NSWindow, so those AppKit calls still apply.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Pet non-activating panel](./phase-01-pet-non-activating-panel.md) | Completed |
| 2 | [Popover panel and native dismissal](./phase-02-popover-panel-and-native-dismissal.md) | Completed |
| 3 | [Cleanup regression docs](./phase-03-cleanup-regression-docs.md) | Completed |

Dependency chain: Phase 1 → Phase 2 → Phase 3 (each blocks the next).

## TDD approach

Native AppKit key/focus behavior is **not** unit-testable (no AppKit in `cargo test`; existing `tray.rs` tests only cover the pure `popover_position`). So per phase:
- **Tests-first for pure logic only:** the outside-click hit-test (`point ∉ panel frame` in Cocoa points) is a pure function → write failing unit test first, then implement (mirrors `popover_position` tests).
- **Native behavior → explicit manual acceptance gates** (documented smoke-test checklist), since it cannot be asserted in CI. Honesty over false green.
- Frontend: `tsc` + `vitest` stay green; deleted blur logic must not break the `sessions-entry` module load (smoke-rendered indirectly).

## Acceptance criteria (whole plan)

- [ ] Toggling "Show pet" (on AND off) from inside the popover leaves the popover **open**, repeatedly, with zero suppress-flags in the code.
- [ ] Popover still dismisses on a **real** click-away (another app/window) and on `Escape`.
- [ ] Pet overlay still: floats over fullscreen Spaces, is click-through, is draggable (`startDragging`), restores position via window-state plugin.
- [ ] Global shortcut + tray "Show / Hide Pet" still toggle the pet without stealing focus from the user's active app.
- [ ] `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `pnpm exec tsc --noEmit`, `pnpm test` all green.
- [ ] `togglingPet` and `justShown` removed; webview `onFocusChanged` blur-hide removed.

## Dependencies / coordination

- **Overlaps `plans/260623-1454-tray-popover-control-panel` (in-progress).** That plan owns `src/ui/sessions/sessions-entry.tsx` and the popover layout (Phase 2-4 add token tracking / pet-size slider / menu-bar toggles). This plan **refactors that file's dismissal mechanism** and the `sessions` window builder. Not a hard blocker, but to avoid rework/merge conflict, land this plan's Phase 2 before resuming that plan's UI phases, or rebase. Soft coordination only — no `blockedBy` edge set.
- **Future text-input caveat:** that plan's later phases may add a text field (rename pet) inside the popover. A non-activating panel needs `becomesKeyOnlyIfNeeded`/`needsPanelToBecomeKey` handling for keyboard focus (research F2). Flagged in Phase 2 risks; implement only when a text input actually lands.

## Red-team / validation outcomes (deep mode gates)

Adversarial pass hardened three points, folded into the phases:
1. **Dual dismissal is non-redundant** — a global monitor only sees OTHER apps' clicks; `windowDidResignKey` covers same-app/other-window + deactivation. Both required (Phase 2).
2. **Webview-click-in-non-activating-panel is the make-or-break assumption** — promoted to the first kill-switch gate in Phase 2 (proven by Cap/Lume/Overlayed, but verified on-device before further work).
3. **Rollback boundary** — Phase 1 is independently shippable; if both panel paths fail, the Tier-1 `orderFrontRegardless` shim still fixes the bug (Architecture decision).

Validation: acceptance criteria are concrete and mostly manual-gated (native focus behavior is not CI-testable — accepted, documented honestly rather than faked). Exact non-activating style-mask API for `tauri-nspanel` v2 is resolved in the Phase 1 spike.

## Implementation outcome (shipped 2026-06-25 via /ck:cook)

The Phase 1 spike **rejected `tauri-nspanel`**: `cargo tree` showed the repo is pure `objc2 0.6` (tao 0.35 / wry 0.55), while the crate builds on a legacy `cocoa`/`objc`/`objc_id` stack it would inject. User chose **pure objc2** — no crate, no NSPanel class-swap:
- **Phase 1:** pet shows via AppKit `orderFrontRegardless` (`tray.rs::show_pet_without_activating`, main-thread-dispatched) → never takes key. Removed `togglingPet` + `setFocus` reclaim.
- **Phase 2:** popover dismissed by a leaked, app-lifetime global `NSEvent` mouse monitor (`tray.rs::install_popover_dismiss_monitor`) — fires only on other-app clicks (so the NSStatusItem open-click can't self-dismiss), plus explicit footer/Escape hides. Removed webview blur + `justShown`. The phase-02 draft's `to_panel`/`panel_delegate`/`point_outside_frame`/`resignKey` were **not built** — a global monitor only sees outside clicks, so no frame math or panel delegate was needed.
- **Phase 3:** grep-clean of suppress-flags; `CLAUDE.md` + `docs/system-architecture.md` updated.

Two `code-reviewer` passes (Phase 1; Phase 2/3) — both **APPROVE**, verified against vendored objc2/block2/AppKit sources. CI green: clippy `-D warnings`, cargo test (128), tsc, vitest (317). **Remaining: on-device manual acceptance gate (user) — focus/dismiss behavior is not CI-testable.**

## Open questions

1. `tauri-nspanel` dependency stack vs repo `objc2 0.6` — **RESOLVED** by the spike: rejected the crate, went pure objc2.
2. Does the pet keep click-through (`set_pet_hit_rect`) + `startDragging`? `orderFrontRegardless` doesn't alter the window's class/mouse handling, so expected intact — confirm in the manual gate.
3. `windowDidResignKey` — **N/A**: not building NSPanel, so the global monitor + explicit hides are the whole dismissal model.
