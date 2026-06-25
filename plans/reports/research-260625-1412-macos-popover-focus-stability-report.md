# Research: Stable macOS menu-bar popover focus architecture (Tauri v2)

**Date:** 2026-06-25 · **Branch:** main · **Trigger:** popover auto-dismiss when toggling pet from inside it; user wants a stable pattern, not case-by-case blur guards.
**Method:** deep-research workflow (101 agents, ~4.4M tokens, adversarial 3-vote verification). Final JSON-packaging stage crashed; findings salvaged from transcripts + URL-consensus ranking. Confidence noted per claim.

---

## 1. Root cause (why the case-by-case patch is fragile)

Two separate fragilities compound:

1. **Showing the overlay steals key-window status.** Tauri/`tao` `WebviewWindow::show()` on macOS effectively does `makeKeyAndOrderFront:`, so re-showing the **pet** overlay makes it the key window — even though it was built `focused(false)`. `focused(false)` only governs the *initial* show. (Tauri gap tracked upstream: issues #14102, #12568, #13034, tao #414.)
2. **Dismissal is driven by webview blur.** The popover hides from a JS `onFocusChanged(false)`. Any focus change — including our own `show()` of another window — trips it. The code comment already concedes "macOS Accessory can make blur unreliable." Blur is the wrong signal for "user clicked away."

`togglingPet` / `justShown` flags paper over (1) by muting (2) for a time window. Every new in-popover control that touches another window re-introduces the bug → not generalizable.

## 2. Verified findings (the stable primitives)

**F1 — Non-activating panel keeps the previous app/window frontmost.** `NSWindowStyleMask.nonactivatingPanel`: clicking the panel does **not** activate the owning app; the previously active window stays key. This is *the* mechanism for a popover that survives focus changes. — **Confidence: HIGH** (Apple primary docs + philz.blog + tauri-nspanel all corroborate; survived adversarial verification).

**F2 — A non-activating panel can refuse keyboard focus per-click.** It becomes key only if the hit view returns `true` from `needsPanelToBecomeKey`, **and** the panel returns `true` from `becomesKeyOnlyIfNeeded`. Gives fine control: buttons work without stealing key; a text field can opt in. — **Confidence: HIGH**, with the precision caveat that `needsPanelToBecomeKey` gating only applies when `becomesKeyOnlyIfNeeded == true`.

**F3 — `tauri-nspanel` (ahkohd) is the canonical crate** to convert a Tauri v2 `WebviewWindow` into an `NSPanel`, set the non-activating style mask, window level, and `collectionBehavior`, and attach a delegate. `ahkohd/tauri-macos-menubar-app-example` is the reference menu-bar app. — **Confidence: HIGH** (84 refs to the crate, 46 to the example; most-cited sources by a wide margin).

**F4 — Robust dismissal uses an outside-click signal, not webview blur:** either the panel delegate's `windowDidResignKey` (fires on a *real* key loss to another window/app) or a global click monitor `NSEvent.addGlobalMonitorForEventsMatchingMask(.leftMouseDown)` that hides the panel when the click lands outside its frame. — **Confidence: HIGH** (Apple Event-Monitoring guide; standard menubar-app idiom).

## 3. Recommended architecture (two tiers)

### Tier 1 — Minimal root-cause fix: show the pet WITHOUT taking key
Make the overlay never steal focus. The pet is `always_on_top` + click-through; it has no reason to be key window — ever (global shortcut, tray menu, popover toggle all benefit).

- In `toggle_pet_window`, on the show branch replace Tauri `win.show()` with a native **`orderFrontRegardless()`** on the pet `NSWindow` (objc2 — already used in `tray.rs`). `orderFrontRegardless` makes the window visible+frontmost **without** making it key, so the popover stays key and never blurs.
- Then **delete `togglingPet`** (and optionally `justShown`) from `sessions-entry.tsx`.
- Cost: ~10 lines objc2, no new dependency. **Caveat to verify on-device:** confirm `orderFrontRegardless` keeps the popover key (it should, same-app key window isn't reassigned without `makeKey`). `is_visible()` reads live `NSWindow.isVisible`, so Tauri state stays in sync; keep using Tauri `hide()` for hiding.

### Tier 2 — Canonical architecture: both windows become non-activating panels
Adopt `tauri-nspanel` and convert **pet** and **sessions** windows to non-activating panels:

- **Pet panel:** `nonactivatingPanel` mask, `canBecomeKey=false` → showing it can never take key. (Generalizes Tier 1 — no native show shim needed.)
- **Sessions popover panel:** `nonactivatingPanel` + status/floating window level + `collectionBehavior` (canJoinAllSpaces / fullScreenAuxiliary — replaces today's `set_overlay_collection_behavior`). Dismiss via `windowDidResignKey` **and/or** a global left-mouse-down monitor for clicks outside the frame. **Remove the webview `onFocusChanged` blur dismissal entirely** (F4) — kills both the unreliable-blur problem and all the suppress-flag hacks.

This is the idiomatic macOS menu-bar pattern; it also fixes the latent "blur unreliable under Accessory policy" issue the code already flags.

## 4. Trade-offs / pitfalls

- **Keyboard input in the panel (F2):** today the popover has only buttons (clicks work in a non-activating panel without taking key). Future Phase 2-4 controls — size slider is fine; any **text field** must live in a hit view returning `needsPanelToBecomeKey=true` (or set `becomesKeyOnlyIfNeeded`). Plan for this before adding text input.
- **Tauri visibility desync:** after `to_panel()`, prefer the crate's panel show/hide/order methods over mixing Tauri `show()`; verify `is_visible()` and the window-state plugin still behave.
- **Re-apply existing behaviors on the panel:** transparency, `always_on_top`, fullscreen-Space overlay collection behavior, and runtime-build-after-Accessory-policy ordering must be preserved (panels set these via level + collectionBehavior).
- **Dependency surface:** `tauri-nspanel` is a focused community crate (ahkohd, the de-facto standard for Tauri menubar apps) — acceptable, but it is a new native dependency vs. the existing in-repo objc2 usage.
- **DIY option:** the repo already calls AppKit via objc2 (`tray.rs`), so Tier 2 could be done without the crate (set style mask / level / collection behavior + a delegate directly). More code, no dependency. The crate is recommended for maintainability.

## 5. Recommendation

Do **Tier 1 now** (kills the reported bug at its root, removes `togglingPet`, ~10 lines, no dependency), and adopt **Tier 2** when touching the popover next or before adding any in-popover text input — it is the durable menu-bar architecture and retires the blur-dismissal fragility for good.

## 6. Sources (consensus-ranked from the run)

- `github.com/ahkohd/tauri-nspanel` + `docs.aremu.dev/tauri-nspanel` — canonical crate/API
- `github.com/ahkohd/tauri-macos-menubar-app-example` — reference menu-bar app
- Apple AppKit: `nonactivatingPanel`, `NSPanel/becomesKeyOnlyIfNeeded`, `NSView/needsPanelToBecomeKey`, `canBecomeKey`, `addGlobalMonitorForEventsMatchingMask`, ChangingMainKeyWindow guide
- `philz.blog/nspanel-nonactivating-style-mask-flag` — non-activating deep dive
- `dev.to/hiyoyok/building-a-menubar-app-with-tauri-v2-what-nobody-tells-you`
- Tauri issues #14102, #12568, #13034, #9755, #12834, discussion #9876; tao #414 — show-without-activating / focus gaps

## 7. Open questions

1. Tier 1 vs Tier 2 first — preference on dependency (`tauri-nspanel`) vs. minimal objc2 shim?
2. Any near-term plan to put a **text input** in the popover (affects whether Tier 2's `becomesKeyOnlyIfNeeded` handling is needed now)?
3. On-device check needed: does `orderFrontRegardless` on the pet keep the popover key as predicted? (Tier 1 acceptance test.)
