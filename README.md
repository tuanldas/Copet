# Copet

Desktop pet (Tauri v2) that reacts to your AI coding agent's state — Claude Code, Codex, Gemini CLI, Cursor… — with Tamagotchi-style gamification (feed, evolve, shop).

> **Status: MVP complete** — all 8 phases shipped. Pet overlay, agent reactions, Tamagotchi stats, token economy, shop, HUD, Settings, tray, and packaging.

## Install

See [docs/installation-guide.md](docs/installation-guide.md) for:
- Opening the DMG and bypassing Gatekeeper (unsigned MVP build).
- Installing agent hooks (Claude / Codex / Gemini) via the Settings UI or CLI script.
- Troubleshooting PATH, socket, and permission issues.

## Build

```bash
pnpm install
bash scripts/build-sidecars.sh   # build copet-hook + copet-run for host triple
pnpm build:mac                   # → src-tauri/target/release/bundle/dmg/Copet_*.dmg
```

See [docs/distribution-and-signing.md](docs/distribution-and-signing.md) for:
- Windows / Linux build commands.
- macOS signing + notarization env vars (Apple Developer ID).
- Windows OV cert / Azure Key Vault signing.
- CI matrix build via GitHub Actions.

## Development

```bash
pnpm tauri dev        # hot-reload dev build (pet overlay + all windows)
pnpm test             # vitest unit tests
pnpm exec tsc --noEmit                 # frontend typecheck
cargo check --workspace                # Rust compile check
cargo clippy --workspace               # Rust lint
```

## Requirements

- Node >= 20, pnpm >= 9
- Rust stable + Cargo
- macOS 13+ (primary target). Windows / Linux: built via CI, best-effort overlay behavior.

## Structure

- `index.html`, `src/` — frontend. Pet render: Canvas 2D; UI panels (HUD/Settings/Shop): SolidJS.
- `src-tauri/` — Rust core. `setup()` split into `init_plugins / init_windows / init_ipc / init_tray`.
- `crates/copet-hook` — sidecar binary: maps agent hook events to Copet socket.
- `crates/copet-run` — sidecar binary: universal agent wrapper (`copet-run -- claude ...`).
- `scripts/` — `build-sidecars.sh`, `install-hooks.sh`, `install-hooks.ps1`.
- `docs/` — [installation-guide.md](docs/installation-guide.md), [distribution-and-signing.md](docs/distribution-and-signing.md), [agent-hook-setup.md](docs/agent-hook-setup.md).
- `plans/260622-1501-copet-desktop-agent-pet/` — 8-phase plan + research reports.
