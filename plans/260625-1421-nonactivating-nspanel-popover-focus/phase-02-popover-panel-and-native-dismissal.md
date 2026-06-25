---
phase: 2
title: Popover panel and native dismissal
status: completed
effort: L
---

# Phase 2: Popover panel and native dismissal

## Overview

Convert the `sessions` popover to a non-activating `NSPanel` and replace the webview blur auto-hide with native AppKit dismissal: a global outside-click monitor (primary) plus `windowDidResignKey` (secondary). With the pet non-activating (Phase 1), the popover only loses key on a *real* outside focus, so dismissal becomes correct and the suppress-flags are obsolete.

## Requirements

- Functional: popover dismisses on a genuine click outside its frame (any monitor) and on real app/window deactivation; never on our own window toggles.
- Functional: `Escape` still hides; clicking buttons inside the popover works (no keyboard focus needed yet).
- Non-functional: dismissal hit-test is a pure, unit-tested function; no reliance on webview `onFocusChanged`.

## Architecture

- `to_panel()` the `sessions` window; non-activating style mask; re-apply `set_overlay_collection_behavior` + `setFrameOrigin` positioning AFTER conversion (positioning stays in `position_popover_macos`).
- **Two dismissal signals that cover DISJOINT cases (both required, not redundant):**
  - **Global monitor — other-app clicks:** on show, install `NSEvent::addGlobalMonitorForEventsMatchingMask(NSLeftMouseDown|NSRightMouseDown)`; read `NSEvent::mouseLocation` (Cocoa points), hide if **outside** the panel frame. A global monitor only observes events delivered to OTHER apps (never your own), so this is precisely "user clicked another app → dismiss". Store the token; `removeMonitor` on hide (no leak/double-fire).
  - **`windowDidResignKey` delegate — same-app / deactivation:** `panel_delegate!{ window_did_resign_key }` → hide. Catches the cases the global monitor structurally CANNOT see: clicking another Copet window (HUD/Settings) takes key → resignKey; app deactivation → resignKey. Route both through one idempotent `hide_popover()`.
  - (Open question #3: if `resignKey` proves to misfire on benign same-app focus, fall back to monitor-only.)
- The outside-click decision is pure: `fn point_outside_frame(px, py, fx, fy, fw, fh) -> bool` in Cocoa points — unit-testable like `popover_position`.

## Related Code Files

- Modify: `src-tauri/src/tray/tray.rs` — `to_panel()` the sessions window (or in `lib.rs` init); `toggle_sessions_popover` installs/removes the global monitor around show/hide; add `point_outside_frame` pure fn + `#[cfg(test)]` cases; wire `panel_delegate!`
- Modify: `src-tauri/src/lib.rs` — convert `sessions` to panel in `init_windows` after build + Accessory; keep `set_overlay_collection_behavior(&sessions)` after conversion
- Modify: `src/ui/sessions/sessions-entry.tsx` — **remove** the `win.onFocusChanged` blur-hide block and `justShown`; keep the `Escape` keydown→`hide`. `handleTogglePet` becomes a plain optimistic toggle (no focus tricks).
- Reference: `plans/reports/research-260625-1412-macos-popover-focus-stability-report.md` (F1/F2/F4)

## Implementation Steps

0. **Webview-interactivity gate (do FIRST — kill switch).** After converting `sessions` to a non-activating panel, confirm the WebView buttons (toggle / Settings / Quit) still fire on click while the panel is NOT key. Proven by Cap/Lume/Overlayed but verify on-device before building the rest — if clicks don't register, stop and revisit the mask config (`acceptsFirstResponder` on the content view) before any dismissal work.
1. **Write failing unit tests first** for `point_outside_frame` (inside, on-edge, outside on same monitor, outside on negative-origin monitor) — mirror the `popover_position` test style.
2. Implement `point_outside_frame`; convert `sessions` → non-activating panel; re-apply collection behavior.
3. Implement `show_popover`/`hide_popover` that also add/remove the global monitor (idempotent; guard against double-add). Monitor callback: hide when `point_outside_frame`.
4. Add the `panel_delegate!` `window_did_resign_key` → `hide_popover`.
5. Remove the webview blur-hide + `justShown` from `sessions-entry.tsx`; keep `Escape`.
6. Run all gates.

## Tests (TDD)

- **Unit (Rust, tests-first):** `point_outside_frame` truth table — at least: centre-inside=false, just-outside-right=true, on external/negative-origin monitor outside=true, exactly-on-edge defined (document inclusive/exclusive).
- **Frontend:** `tsc` + `vitest` green after deleting blur logic; confirm `sessions-entry` still has no dangling refs to removed symbols.
- **Manual acceptance gate:**
  - [ ] Click another app/window → popover hides.
  - [ ] Toggle pet on/off inside popover → popover stays (Phase 1 + this).
  - [ ] Click a different monitor's empty desktop → popover hides.
  - [ ] `Escape` hides. Re-open via tray works; no leaked monitor (toggle 10× then click-away still single-hides).

## Success Criteria

- [ ] `sessions` is a non-activating panel; positioning + fullscreen-Space float preserved.
- [ ] `point_outside_frame` unit-tested (tests written before impl) and green.
- [ ] Outside-click + `resignKey` dismissal works; webview blur-hide + `justShown` deleted.
- [ ] Global monitor removed on hide (no leak / double-fire); all four CI gates green.

## Risk Assessment

- **Monitor leak / double-fire** → store token, `removeMonitor` on hide, guard double-add; manual 10× toggle gate.
- **resignKey fires on benign focus** (e.g., another of our own panels) → route all dismissal through one `hide_popover`; if a benign path dismisses wrongly, drop `resignKey` and keep monitor-only (open question #3).
- **Text input later** → buttons need no key focus; a future popover text field requires `becomesKeyOnlyIfNeeded`/`needsPanelToBecomeKey` on its hit view (research F2). Out of scope until that input exists; noted for the popover plan.
- **Coordination:** deletes blur logic added by `260623-1454-tray-popover-control-panel`; land before resuming that plan's UI phases or rebase.
