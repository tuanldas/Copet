# Research: macOS multi-monitor popover positioning (Tauri v2)

Date: 2026-06-23 · Component: `src-tauri/src/tray/tray.rs` (sessions popover) · Tauri 2.11.3 / tao 0.35.3 / positioner 2.3.2

## Problem

Click tray icon on the 2nd (right) monitor → popover appears at the right EDGE of the PRIMARY (left) monitor, not under the cursor on the right monitor. First fix (cursor-based, manual bounds check) did NOT work.

## Root cause (proven by sources + code reading)

On macOS, when displays have **different scale factors** (e.g. MacBook Retina @2x + external @1x), the coordinate conventions are **inconsistent across the Tauri/tao API**:

- **`monitor.position()`** → reported in **logical/scaled points** (e.g. external at x=1800 = primary's *logical* width), but typed as `PhysicalPosition`.
- **`monitor.size()`** → reported in **physical pixels**.
- **`cursor_position()`** → physical, relative to desktop top-left, scaled by the **primary** monitor's factor.

So mixing `position` (logical) with `size` (physical) in one bounds check, or feeding `cursor` (primary-scaled physical) into a per-monitor physical comparison, yields garbage. My first fix used `point_in_rect(cursor, monitor.position(), monitor.size())` → mismatch → hit-test failed → fell back to PRIMARY monitor → clamped cursor_x into the primary's right edge. That exactly matches the observed symptom.

This is a documented, still-open class of bug:
- tauri#7890 — "[macos] physical position of windows and monitors reported incorrectly" (maintainer: *"monitors and windows need to be completely consistent about whether physical position corresponds to scaled or unscaled sizes"*).
- tauri#10263 — "when multiple monitors have different scaling, the window cannot switch correctly between monitors".
- tauri#7139 — "Cannot set window position correctly between monitors for tray".
- tao#707 — `cursor_position()` correctness.

## Fix applied (best-informed hypothesis)

`src-tauri/src/tray/tray.rs`:
1. **Detection** via the official `win.monitor_from_point(cursor.x, cursor.y)` (hit-tests physical coords internally) instead of the hand-rolled mixed-unit bounds check. Falls back to `current_monitor` → `primary_monitor`.
2. **Placement in LOGICAL points** (macOS's native global space — the one space that stays consistent across scale factors): treat `monitor.position()` as logical; convert `monitor.size()` and the window width to logical via the monitor's scale; convert `cursor.x` via the **primary** scale; place via `LogicalPosition`. Non-macOS keeps a single physical space.
3. The clamp math (`popover_position`) is pure + unit-tested (centre-on-cursor, clamp to edges, external monitor left/right, pin-left).

## Why a diagnostic is still needed

The EXACT convention (is `monitor.position()` logical or physical? is `cursor` scaled by primary or by its own monitor?) **varies by macOS version + the specific scale-factor mix** and is not guaranteed by docs (the bug is literally about this inconsistency). So the code now emits **debug-only** `[copet-mon]` logs of cursor + every monitor's `pos/size/scale` + `monitor_from_point` result. Running on the real hardware confirms whether the hypothesis holds or which term to adjust.

### How to capture (user)

```
pnpm tauri dev
# move mouse to the RIGHT monitor, click the Copet menu-bar icon
# copy every line starting with [copet-mon] from the dev terminal
```

Paste those lines back. From the real numbers I finalize the conversion (e.g. if `monitor.position()` turns out physical, drop the /scale on origin; if cursor is per-monitor-scaled, use mscale not primary_scale).

## Verification so far

- `cargo clippy -p copet --all-targets -- -D warnings` clean (confirms `monitor_from_point` exists on WebviewWindow in 2.11).
- `cargo test -p copet` pass (11; incl. 5 popover-math tests).
- Runtime multi-monitor behaviour: UNVERIFIED here (no 2-monitor GUI) — pending the `[copet-mon]` capture.

## Resolution

Both issues fixed and confirmed on-device: (1) multi-monitor positioning via AppKit `NSEvent`/`NSScreen`; (2) fullscreen-Space visibility via runtime window creation + overlay collection behavior.

## Unresolved questions

- HUD / Settings / Shop windows still anchor to the primary monitor on open (not reported as a problem; same AppKit pattern could be applied if wanted — deferred).

## UPDATE — on-device data proved the Tauri APIs unusable → AppKit rewrite

Captured `[copet-mon]` on the user's hardware:
- PRIMARY (MacBook Retina **@2x**): `pos=(0,0) size=3456×2234` → logical 1728×1117.
- External (**@1x**): `pos=(1728,0) size=1920×1080`. So `monitor.position()`=**logical** (1728 = primary's logical width), `monitor.size()`=**physical**. Confirmed mismatch.
- **`cursor_position()` is provably broken here**: click 1 → `2078.9` (looks logical); click 2 → `5904.2` (= 2952×2, **outside every monitor frame**) and `monitor_from_point` returned **None** for an on-screen click. The scaling is inconsistent between consecutive clicks (the "first 1-2 clicks" timing bug, #7139).

Conclusion: NO formula over `cursor_position()`/monitor coords can be reliable on mixed-DPI macOS. **Rewrote positioning with AppKit** (`src-tauri/src/tray/tray.rs::position_popover_macos`):
- `NSEvent::mouseLocation()` + `NSScreen::frame()/visibleFrame()` — all in Cocoa global **points** (bottom-left origin), the one space macOS keeps consistent.
- Find the screen whose `frame` contains the mouse; centre the popover on the mouse X clamped to the screen's `visibleFrame`; place the top 8 pt below the visible top (just under the menu bar) via `NSWindow::setFrameOrigin`.
- Bypasses Tauri's broken `cursor_position`/`set_position` entirely. Non-macOS keeps the Tauri `monitor_from_point` + physical path.
- Deps added (macOS only): `objc2`, `objc2-foundation`; `objc2-app-kit` features `NSScreen`+`NSEvent`.

**Confirmed working on-device** (user verified): popover now appears on the correct monitor under the cursor. Debug `[appkit]` logging removed after confirmation.

### Follow-on: fullscreen Spaces

After the monitor fix, the popover still didn't appear while another app was in macOS **native fullscreen**. Root cause: a config-declared window is born under the Regular activation policy and can never be promoted onto another app's fullscreen Space (same finding as the pet — `build_pet_window`). Fix: build the `sessions` window at **runtime in `setup()` after `set_activation_policy(Accessory)`** (removed from `tauri.conf.json`) and apply `set_overlay_collection_behavior` (`CanJoinAllSpaces | FullScreenAuxiliary | Stationary` + `NSScreenSaverWindowLevel`). Confirmed working on-device.

## Sources

- [tauri#7890 — macOS physical position reported incorrectly](https://github.com/tauri-apps/tauri/issues/7890)
- [tauri#10263 — different scaling, window can't switch monitors](https://github.com/tauri-apps/tauri/issues/10263)
- [tauri#7139 — set window position between monitors for tray](https://github.com/tauri-apps/tauri/issues/7139)
- [tauri#3057 — Monitor::from_point / cursor_position](https://github.com/tauri-apps/tauri/issues/3057)
- [tao#707 — cursor_position correctness](https://github.com/tauri-apps/tao/issues/707)
- [tauri Window docs (cursor_position, monitor_from_point)](https://docs.rs/tauri/latest/tauri/window/struct.Window.html)
- [Building a Menubar App with Tauri v2 (dev.to)](https://dev.to/hiyoyok/building-a-menubar-app-with-tauri-v2-what-nobody-tells-you-2nae)
