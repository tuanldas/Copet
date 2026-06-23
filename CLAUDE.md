# CLAUDE.md

Guidance for Claude Code working in the **Copet** repo. This is the quick orientation + the rules that actually bite; read `docs/` for depth.

## What this is

Copet — a **Tauri v2 desktop pet** (macOS-primary) that reacts to AI coding agents (Claude Code, Codex, Gemini CLI) with Tamagotchi-style gamification. Rust core + SolidJS/Canvas frontend.

## Commands

| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Dev (hot-reload) | `pnpm tauri dev` |
| Frontend tests | `pnpm test` (vitest) |
| Frontend typecheck | `pnpm exec tsc --noEmit` |
| Rust check / lint / test | `cargo check --workspace` · `cargo clippy --workspace --all-targets -- -D warnings` · `cargo test --workspace` |
| Build sidecars | `bash scripts/build-sidecars.sh` (builds `copet-hook` + `copet-run`) |
| Build DMG (macOS) | `pnpm build:mac` |

Requirements: Node ≥20, pnpm ≥9, Rust stable, macOS 13+ (Windows/Linux best-effort).
`pnpm tauri dev` compiles the **working tree** (uncommitted Rust included); a Rust edit triggers a rebuild + app restart — restart it fully (Ctrl+C) if a change doesn't take.

## Layout

- `src/` — frontend. `main.ts` (pet window, owner role), `pet/` (Canvas render + tooltip), `agent-bridge/` (SessionTracker + event wiring), `tamagotchi/` (pet-store, xp-level, stats), `economy/`, `ui/` (hud, settings, shop, sessions popover; `ui/shared/` holds reused components), `types/`.
- `src-tauri/` — Rust app. `lib.rs` (`setup()` split into `init_plugins` / `init_windows` / `init_ipc` / `init_tray`), `commands/`, `ipc/socket_daemon.rs`, `tray/tray.rs`.
- `crates/` — `copet-protocol` (canonical `AgentEvent` contract), `copet-hook` (agent hook → socket sidecar), `copet-run` (universal `copet-run -- <cmd>` wrapper).
- `scripts/`, `docs/`, `plans/`.

## Data flow

agent hook → `copet-hook` maps stdin JSON to `AgentEvent` → local socket (`/tmp/copet-{uid}.sock`) → `src-tauri/ipc/socket_daemon.rs` re-emits as the Tauri event `agent-status-changed` → `agent-bridge.ts` → `SessionTracker` → pet window broadcasts `sessions-snapshot` → rendered in the pet tooltip + HUD + tray popover.

## Conventions / gotchas (these bite)

- **`AgentEvent` is dual-sourced**: `crates/copet-protocol/src/lib.rs` ⇄ `src/types/agent-event.ts` MUST stay in sync. New fields are additive + optional — `#[serde(default)]` on Rust, `| null` on TS. The daemon re-serialises through the Rust struct, so the frontend always receives every field (null when absent).
- **Single-writer state**: the pet window owns `SessionTracker` + the tamagotchi store and is the SOLE broadcaster. HUD / Settings / Shop / popover are read-only clients (`initTamagotchi({ role: "client" })`). Never mutate pet state from a client window.
- **`copet-hook` is a short-lived sidecar** spawned per hook event; it MUST always exit 0 and never block/slow the agent. App→hook opt-ins travel via `~/.copet/hook-config.json` (`copet_config_path()`) — env vars can't cross the agent→hook process boundary.
- **Keep `map_claude/codex/gemini.rs` pure** (no file IO): the integration tests pull them in via `#[path]`, so they can't depend on sibling modules. Side-effectful enrichment (transcript reading) lives in `copet-hook/src/main.rs`.
- **macOS fullscreen**: a window can only float over another app's native-fullscreen Space if it is BUILT AT RUNTIME in `setup()` AFTER `set_activation_policy(Accessory)` (see `build_pet_window` / `build_sessions_window`) and gets `set_overlay_collection_behavior`. Config-declared windows can't be promoted.
- **macOS multi-monitor positioning**: Tauri's `cursor_position()` / monitor coords are unreliable on mixed-DPI (monitor.position is logical, size is physical — tauri#7890). Position windows via AppKit (`NSEvent::mouseLocation` + `NSScreen::visibleFrame`, Cocoa points) — see `tray.rs::position_popover_macos` and `plans/reports/research-260623-1703-macos-multi-monitor-popover-positioning.md`.
- **Window-state** plugin excludes the `VISIBLE` flag so toggled windows stay hidden at launch (the pet shows by default).

## Quality gates (before claiming done)

Run `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `pnpm exec tsc --noEmit`, `pnpm test`. Fix regressions rather than weakening tests. Escape any HTML built from agent/user-controlled strings (see `tooltip-render.ts`). Consider modularising files over ~200 LOC (kebab-case for JS/TS, snake_case for Rust).

## Docs & plans

- Deep detail: `docs/system-architecture.md`, `docs/codebase-summary.md`, `docs/agent-hook-setup.md`, `docs/project-roadmap.md`, `docs/tech-stack.md`.
- In-flight work, phase plans, and research reports live under `plans/`.
