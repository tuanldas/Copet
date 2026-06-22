# Copet Bootstrap: 8-Phase Desktop Pet MVP — Technical Challenges & Fixes

**Date**: 2026-06-22
**Severity**: High (blocking ship)
**Component**: Tauri v2 desktop pet, cross-window IPC, persistence
**Status**: Resolved

## What Happened

Copet (GitHub openpets-inspired desktop agent pet) shipped 8 phases + dmg build with 232 vitest + ~58 Rust tests green. 3 critical blocker issues surfaced late in phase dev; 4 cosmetic/data bugs in final polish. All resolved before e2e user verification.

## Brutal Truth

The most painful: **we assumed Tauri/macOS "just works"** for interactive overlays + IPC. Runtime failures exposed laziness in platform integration — Rust compile-pass ≠ app-works. Lost ~6 hours on daemon panic + click-through race conditions because verification stopped at `cargo check`.

## Technical Details

### 1. Click-Through Transparent Overlay (Tauri Issue #13070)
**Problem:** macOS pixel alpha=0 should auto-passthrough to window below. Assumption: false. User test: click pet → click-through to background app instead of interacting.

**Root:** Tauri macOS webview does NOT auto-passthrough transparent regions; must explicitly call `setIgnoreCursorEvents()` per-region.

**Fix:** 
- Rust daemon polls pet position every 50ms via `run_on_main_thread()`
- Toggle `set_ignore_cursor_events(true)` outside pet bounding rect
- Enabled `acceptFirstMouse:true` in Info.plist so first-click doesn't get lost
- Upgraded rect detection from centered-circle to dynamic rect tracking pet walk animation

**Impact:** Interaction latency +50ms, acceptable for pet UX.

### 2. Daemon Panic at Startup
**Problem:** `tokio::spawn()` in `setup()` hook → no tokio runtime → app abort before window render.

**Symptom:** Cargo check pass. App launch: "thread panicked."

**Fix:** Replaced `tokio::spawn` with `tauri::async_runtime::spawn` (uses Tauri's event-loop runtime).

**Lesson:** Verification ≠ compilation. Must spawn app + verify first interaction fires.

### 3. Cross-Window Save Race Condition
**Problem:** Pet window + shop window each maintain in-memory `tama` store. Both auto-save to `copet-pet.json` every 60s → last-writer-wins → data loss.

**Fix:** Single-writer pattern:
- Pet window owns authoritative `tama` state
- Shop window: emit `tama:mutate` event to pet window
- Pet window broadcasts `tama:state` back to shop window on mutation + init
- Only pet window writes to disk

**Trade-off:** Extra IPC latency for mutation; negligible in practice (UI refresh still 16ms).

### 4. Cosmetic: Overlay Asset 404
**Problem:** Asset referenced in CSS as `/src/assets/overlay.png` → 404. Vite only serves from `/public/`.

**Fix:** Move asset to `public/assets/overlay.png`, reference as `/assets/overlay.png`.

### 5. XP/Token Double-Count
**Problem:** Phase 4 (applyAgentXp) + Phase 7 (agent-bridge) both increment token counter for same action → 2x gain.

**Fix:** Agent-bridge calls applyAgentXp, doesn't re-increment.

### 6. Persistence "Not Running"
**Problem:** Launched app 5 times, state not persisting. Turned out: only 60s autosave. User expectations: eager save on init.

**Fix:** Add eager save on `setup()` after init migration; autosave remains for runtime changes.

### 7. Workspace Target Dir Leak
**Problem:** Added Rust crates (agent-bridge, persistence) → `/target` grew to 2GB → git push blocked. Cargo puts workspace target at repo root, not per-crate.

**Fix:** Add `/target` + `/target-*` to `.gitignore`.

## What We Tried

1. **Click-through:** Added `pointer-events: none` in CSS → didn't work (browser-only). Had to go Rust-side polling.
2. **Daemon panic:** Checked `Cargo.toml` deps — tokio already present. Issue was runtime injection, not dep missing. Took 40min to isolate.
3. **Race condition:** Sketched mutex approach first — too heavyweight. Single-writer is simpler + cleaner.
4. **Persistence:** Added logging to see if save() called → discovered 60s window. Shorter polling isn't viable (disk I/O); eager init was correct call.

## Root Cause Analysis

1. **Platform assumption gap:** Assumed Tauri wraps platform behavior cleanly. In reality: transparent passthrough is platform-specific and requires lower-level integration.
2. **Testing gap:** Unit tests passed; integration test (launch app + click) would've caught daemon panic + click-through in 5min.
3. **Architecture debt:** Didn't enforce single source of truth for state early. IPC layer bolted on late.
4. **File organization:** No build-time validation of asset paths. Vite config could check public/ references at compile.

## Lessons Learned

- **Verify app launch, not just compilation.** Tokio runtime + macOS platform integration failures only surface on run.
- **Single-writer for shared state.** Multiple in-memory stores syncing to disk is a footgun. Commit upfront.
- **Build tool asset checks.** Add Vite plugin to validate `public/` references exist. Caught overlay 404 at build time, not user test.
- **Test on actual target platform early.** Transparent overlays + HID integration are macOS-specific. Emulation lies.

## Next Steps

1. ✅ All 8 phases committed; 232 vitest + 58 Rust tests passing
2. ✅ DMG build validated; e2e test: user clicks pet → agent responds → HUD updates → tray icon reacts
3. ✅ Shop window persists state through restart
4. Prevent recurrence: Add pre-commit hook to verify app launch (quick smoke test)
5. Document: Tauri + macOS integration patterns in `docs/platform-integration.md` for future desktop features

---

**Status:** DONE
**Summary:** Bootstrap complete. 8-phase MVP shipped with transparent click-through, cross-window IPC, and persistence. All critical platform issues resolved via Rust integration + single-writer architecture. E2e verified.
