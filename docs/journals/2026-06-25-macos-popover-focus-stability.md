# macOS tray-popover focus stability (pure objc2)

**Date:** 2026-06-25 · **Branch:** `main` · **Plan:** `plans/260625-1421-nonactivating-nspanel-popover-focus/`

## What & why

Bug: toggling "Show pet" from inside the tray sessions popover dismissed the popover. Root cause — Tauri `win.show()` on macOS maps to `makeKeyAndOrderFront:`, so re-showing the pet stole key-window status; the popover auto-hides on webview blur, so it dismissed itself. A first pass removed `set_focus()` from `toggle_pet_window`, but `show()` itself still stole key → still broken. A second pass added a `togglingPet` suppress-flag in the frontend (worked), but the user pushed back: stop fixing case-by-case, find a stable architecture.

That reframed it into research → plan → implement:
- **deep-research** (the cited report under `plans/reports/`) confirmed the canonical primitive is the macOS **non-activating panel** (`NSWindowStyleMask.nonactivatingPanel`) and outside-click dismissal via `addGlobalMonitorForEventsMatchingMask`; `tauri-nspanel` is the textbook crate.
- **`/ck:plan --deep --tdd`** produced a 3-phase plan whose Phase 1 opened with a crate-compatibility spike.

## The surprise (Phase 1 spike → pivot)

The spike rejected the "textbook" answer. `cargo tree` showed the repo is **pure `objc2 0.6`** (tao 0.35 / wry 0.55), while `tauri-nspanel` (v2/v2.1) builds on a legacy `cocoa`/`objc`/`objc_id` stack it would inject into an otherwise-clean codebase. With the user's call, we went **pure objc2, no crate, no NSPanel class-swap** — the repo already does heavy objc2 AppKit work (`tray.rs`, `set_overlay_collection_behavior`), so the simpler native path fit better than the canonical one.

## Shipped (3/3 phases)

1. **Pet shows without taking key** — `tray.rs::show_pet_without_activating` uses AppKit `orderFrontRegardless` (ordered front, never key), main-thread-dispatched via `run_on_main_thread` because `toggle_pet_window` is also called off-main (commands, global shortcut). Removed the `togglingPet` + `setFocus` frontend hack.
2. **Native popover dismissal** — `tray.rs::install_popover_dismiss_monitor` registers ONE app-lifetime global `NSEvent` mouse monitor (leaked via `mem::forget`; needs `block2` + the objc2-app-kit `block2` feature). A global monitor only sees clicks delivered to OTHER apps, so every fire is an outside click → hide if visible; **no frame math, no NSStatusItem self-dismiss race** (our own tray click is local, invisible to the monitor). Removed the webview blur listener + `justShown`; footer Settings/Escape hide explicitly.
3. **Cleanup + docs** — grep-clean of suppress-flags; documented the focus/dismiss model in `CLAUDE.md` gotchas + `docs/system-architecture.md` so a future `win.show()` regression is warned against.

Two `code-reviewer` passes (Phase 1; Phase 2/3) — both APPROVE, each verifying the load-bearing claims against vendored objc2/block2/AppKit sources (the `mem::forget` idiom, AppKit copying the handler block, and the no-own-app-events monitor semantics). Gates green throughout: `clippy -D warnings`, `cargo test` (128), `tsc`, `pnpm test` (317).

## Deferred / open

- **On-device manual gate (user):** focus/dismiss behavior is not CI-testable — toggle pet repeatedly (popover stays), click-away dismisses, open-via-tray doesn't flicker. Code + review + CI done; live confirmation pending.
- **Accepted non-coverage:** clicking another Copet window (e.g. HUD) while the popover is open won't auto-dismiss it (global monitor can't see same-app clicks) — a pre-existing edge, not a regression.
- **Future popover text input** would need `becomesKeyOnlyIfNeeded` handling — only relevant if the overlapping `260623-1454-tray-popover-control-panel` plan adds a rename field.

## Lessons

- The spike earned its keep: the "canonical" answer (an NSPanel crate) was the *wrong* fit for a deliberately-objc2 repo. Cheap empirical check (`cargo tree`) beat following the textbook.
- A global mouse monitor's "only sees other apps" property collapsed the design — it removed the need for the planned `point_outside_frame` hit-test and the `windowDidResignKey` panel delegate entirely. The simplest correct mechanism was simpler than the plan assumed.
