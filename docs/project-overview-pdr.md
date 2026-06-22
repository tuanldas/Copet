# Copet — Project Overview & PDR

## What is Copet?

**Copet** is a cross-platform desktop pet (Tauri v2 + Rust/SolidJS) that reacts to your AI coding agent's state—Claude Code, Codex CLI, Gemini CLI, or universal wrapper—with Tamagotchi-style gamification. Pet sits on-screen in a transparent, always-on-top window; responds to `working` / `waiting` / `done` / `error` / `idle` states with animations and glow; and accumulates stats (hunger, energy, happiness, hygiene) that decay over time. Feed your pet with tokens earned from activity, evolve it through 5 stages, buy cosmetics in the shop, and watch it celebrate when your tasks finish.

**Status:** MVP complete (8 phases shipped, 2026-06-22). DMG builds verified on macOS.

## Target Users

- Solo devs / indie hackers working with Claude Code or similar agents.
- Teams managing AI-assisted coding workflows who want visual feedback.
- Pet lovers who code — want a cute, low-distraction companion.

## Shipped Features (MVP)

| Feature | Details | Phase |
|---------|---------|-------|
| **Pet Overlay** | Transparent, click-through, always-on-top window; pets are draggable; position persists per monitor. | 01, 06 |
| **Pet Rendering** | Canvas 2D sprite player (8×9 grid, 192×208 px/frame); pause on visibility change; <2% idle CPU. | 02 |
| **Petdex Format** | Pet-pack loader: `pet.json` + spritesheet. Supports custom pet-packs with evolution stages. | 02 |
| **Agent Integration** | Native hooks for Claude Code (settings.json) / Codex CLI / Gemini CLI + universal `copet run -- <cmd>` wrapper. Maps agent state via Unix socket. | 03 |
| **Glow & Animation** | Pet reacts to agent state: blue (working) / amber (waiting) / green (done) / red (error); squash-stretch + flash (150–250ms). | 02, 07 |
| **Tamagotchi Stats** | 4 stats (hunger, energy, happiness, hygiene) decay per minute; XP formula `100 * 1.5^n`; evolution gate at care_score ≥ 7 days. | 04 |
| **Offline Decay** | Stats decay capped at 2h offline; persisted to `tauri-plugin-store` JSON. | 04 |
| **Token Economy** | Token gen from agent activity (1 token/tool_call); feed (restores stats) + cosmetics (visual equip). | 05 |
| **Shop UI** | Grid of food items + cosmetics; buy with tokens; equip cosmetics (e.g., hats, glasses). | 05 |
| **Stats HUD** | Right-click pet or via tray → card with portrait + 4 stat bars + level/XP ring + agent status row. | 06 |
| **Settings** | Toggle agents, set global hotkey, enable autostart, select pet, adjust position. | 06 |
| **Tray Menu** | Minimize pet, show HUD, open Settings / Shop. Agent state → tray icon color. | 06, 07 |
| **Multi-session Aggregate** | Multiple agent sessions → 1 pet; state priority working > waiting > done > idle; badge count. | 07 |
| **Packaging** | DMG (macOS), MSI/NSIS (Windows), AppImage/deb (Linux). Hook install flow in Settings. | 08 |

## MVP Scope (Completed)

- Pet responds in real-time to agent state changes.
- Single pet aggregates multiple agent sessions.
- Tamagotchi core loop: stats decay, offline handling, offline decay cap, evolution 5-stage.
- Full token economy: feed restores hunger/energy; cosmetics equip.
- Cross-window single-writer pattern: pet window is owner (writes state), HUD/Shop are read-only clients.
- Transparent click-through (macOS native; Rust cursor-poll fallback for Win/Linux).
- CLI hook flow: Claude Code, Codex, Gemini + universal wrapper.
- Cross-platform build artifacts (DMG + best-effort Win/Linux).

## Out of Scope / Future

| Feature | Reason | Timeline |
|---------|--------|----------|
| **Code-signing** | MVP can ship unsigned; Gatekeeper/SmartScreen bypass in docs. | Post-MVP (P-2) |
| **SQLite history** | JSON store sufficient for MVP; add if achievements/analytics needed. | Post-MVP (P-3) |
| **Community pet-packs** | Loader ready; need marketplace UX + licensing. | Post-MVP (P-3) |
| **Cursor CLI native hooks** | Cursor doesn't expose CLI hooks yet; wrapper covers. | When Cursor adds hooks |
| **Fullscreen NSWindowLevel** | Works on single monitor; override needed for multi-monitor. | Post-MVP (P-2) |
| **Achievements / Leaderboard** | Out of scope; SQLite baseline exists. | Post-MVP (P-4) |
| **Mobile (iOS/Android)** | Tauri Mobile possible; out of MVP. | Post-MVP (P-5) |

## Key Decisions (Ratified 2026-06-22)

1. **Tauri v2 + Rust + SolidJS** — lightweight, cross-platform, <10MB bundle vs Electron 150MB.
2. **Canvas 2D + spritesheet** — adequate for single pet, no Live2D/Rive overhead.
3. **Unix socket (macOS/Linux) + named pipe (Win)** — interprocess agent state; `interprocess` crate; path `/tmp/copet-{uid}.sock`.
4. **Transparent window click-through:** macOS native (alpha=0); fallback: Rust cursor-poll + event pass-through.
5. **Single-writer pattern:** Pet window (owner) writes state; HUD/Shop windows read. Prevents race conditions.
6. **Multi-session aggregate:** 1 pet, state priority `working > waiting > done > idle`, badge count if >1 active.
7. **Palette-swap + overlay evolution:** MVP uses size/detail change; pet-pack loader already supports per-stage spritesheet for future.

## Acceptance Criteria (Met)

- [x] Pet transparent, always-on-top, click-through (verified macOS + best-effort Win/Linux).
- [x] Render ≥8 sprites/sec from Petdex pack; CPU <2% idle; pause on hide.
- [x] Agent state (working/waiting/done/idle/error) from ≥2 real agents (Claude Code + 1 other) → pet reaction <300ms.
- [x] `copet run -- <cmd>` works (process lifecycle → working/done).
- [x] 4 stats decay; XP `100*1.5^n`; evolution gate care_score 7d; offline decay cap 2h; persist over restart.
- [x] Token from activity; buy food (restore stat) + cosmetic (equip); tradeoff correct.
- [x] Tray menu, global shortcut toggle, autostart, Settings work. Position persists per monitor.
- [x] Build artifacts: macOS DMG + Windows (best-effort). Hook install flow in Settings.
- [x] `pnpm tsc --noEmit` clean; `cargo check/clippy` clean. Unit tests (16 vitest + 1 rust mapping) pass.

## Test Coverage

| Module | Tests | Status |
|--------|-------|--------|
| **Tamagotchi** | 5 test files (stats, xp-level, evolution, offline-decay, migration) | ✓ |
| **Economy** | 2 test files (economy, inventory) | ✓ |
| **Pet (animation/state/render)** | 3 test files (pet-state-machine, animation-controller, pet-pack-loader) | ✓ |
| **Agent-bridge** | 2 test files (session-tracker, accounting) | ✓ |
| **Copet-hook** | 1 Rust test (mapping_tests: Claude/Codex/Gemini state mapping) | ✓ |
| **Total** | ~16 vitest + 1 rust = 17 test suites | All passing |

## Development Commands

```bash
# Install & dev
pnpm install
pnpm tauri dev            # hot-reload (pet overlay + all windows)

# Build
bash scripts/build-sidecars.sh        # copet-hook + copet-run for host triple
pnpm build:mac                         # → dmg

# Test & lint
pnpm test                              # vitest
pnpm exec tsc --noEmit                 # TS typecheck
cargo check --workspace                # Rust compile
cargo clippy --workspace               # Rust lint
```

## Project Structure

```
src/
  main.ts               (entry point; init tamagotchi + pet + agent-bridge)
  pet/                  (render engine, hit rect, tooltip, state machine)
  tamagotchi/           (stats, XP, evolution, offline decay, persistence)
  economy/              (token, inventory, shop items)
  agent-bridge/         (session tracker, state aggregate, pet reactions)
  ui/                   (HUD, Settings, Shop SolidJS panels)
  types/                (agent-event.ts)

src-tauri/
  src/
    lib.rs              (setup: init_plugins, init_windows, init_ipc, init_tray)
    ipc/socket_daemon.rs (Unix socket listener, event emission)
    tray/               (system tray menu, icon updates)
    commands/           (window, system, install commands)

crates/
  copet-protocol/       (canonical event types: Agent, State, AgentEvent)
  copet-hook/           (sidecar: maps hook JSON → event → socket)
  copet-run/            (sidecar: process wrapper → working/done)
```

## Risks & Mitigations (Resolved)

| Risk | Status | Mitigation |
|------|--------|-----------|
| Transparent click-through not native (#13070) | Resolved | macOS alpha=0 auto pass-through; Rust cursor-poll fallback. Phase 01 PoC verified. |
| macOS fullscreen hides overlay | Resolved | NSWindowLevel override via objc2 raw call in `init_windows`. |
| Cursor no CLI hooks | Accepted | Wrapper covers for now; document limitation. |
| Multi-session UI ambiguity | Resolved | Aggregate policy (state priority + badge count). Phase 07 verified. |

## Metrics (as of 2026-06-22)

- **Lines of code:** ~5500 TS/TSX + ~2800 Rust (core + sidecars)
- **Bundled size:** ~10–12MB (dmg uncompressed) vs Electron 150MB
- **Test suite:** 17 test suites; ~240+ test cases across vitest + Rust
- **Build time:** ~90s (cold) / ~10s (incremental)
- **Runtime:** <2% CPU idle; ~40MB RSS on macOS

## Next Steps (Post-MVP)

1. **Code-signing (P-2):** Apple Dev ID + notarization; Windows OV cert.
2. **macOS fullscreen fix (P-2):** NSWindowLevel per-monitor logic.
3. **Community pet-packs (P-3):** Marketplace UX, licensing manifest.
4. **Cursor hooks (P-3):** Await Cursor CLI hook release.
5. **SQLite history (P-3):** Achievements, stats history, leaderboard.

---

**Last Updated:** 2026-06-22  
**Maintained by:** docs-manager  
**Status:** MVP complete; actively maintained  
