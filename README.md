# Copet 🐾

Desktop pet (Tauri v2) phản ứng theo trạng thái AI coding agent của bạn — Claude Code, Codex, Gemini CLI, Cursor… — kèm gamification kiểu Tamagotchi (nuôi, tiến hoá, shop).

> **Trạng thái:** đang phát triển — Phase 01 (scaffold + transparent overlay PoC).

## Yêu cầu
- Node ≥ 20, pnpm ≥ 9
- Rust (stable) + Cargo
- macOS 13+ (mục tiêu MVP). Windows / Linux: best-effort.

## Phát triển
```bash
pnpm install
pnpm tauri dev        # mở pet overlay (dev, hot-reload)
pnpm tauri build      # đóng gói app
```

## Kiểm thử nhanh
```bash
pnpm exec tsc --noEmit                              # typecheck frontend
cargo clippy --manifest-path src-tauri/Cargo.toml  # compile + lint Rust
```

## Cấu trúc
- `index.html`, `src/` — frontend. Pet render: Canvas 2D (vanilla TS); UI panels (HUD/Settings/Shop): SolidJS (phase sau).
- `src-tauri/` — Rust core. `setup()` tách `init_plugins / init_windows / init_ipc / init_tray` cho từng phase.
- `docs/` — `tech-stack.md`, `design-guidelines.md`.
- `plans/260622-1501-copet-desktop-agent-pet/` — kế hoạch 8 phase + research reports.

## Phase 01 — Transparent overlay PoC
Pet là window trong suốt, always-on-top, không viền, ẩn khỏi Dock (macOS `Accessory`), không steal focus.
- Giữ chuột **trên thân pet** → kéo di chuyển pet.
- Click **vùng trong suốt** → xuyên xuống app phía dưới.

Mục tiêu PoC: kiểm chứng rủi ro click-through (Tauri #13070) trước khi build engine.
