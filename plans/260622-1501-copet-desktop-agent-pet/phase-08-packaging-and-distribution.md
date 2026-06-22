# Phase 08 — Packaging + Distribution

> Build cross-platform artifacts (dmg/msi/nsis/appimage/deb) + sidecar bundling + hook install flow cho user + signing notes. Depends ALL phases.

## Context / Links
- Research: `plans/reports/research-260622-1501-tauri-desktop-pet-overlay-report.md` §2.6 (build targets, signing, WebView2 bootstrapper)
- Research: `plans/reports/research-260622-1501-multi-agent-cli-state-detection-report.md` §4 (`copet-hook` install path `~/.copet/bin/`)

## Requirements
1. Build artifacts: macOS `dmg`; Windows `msi` + `nsis`; Linux `appimage` + `deb`. Tối thiểu MVP: macOS dmg + ≥1 OS khác.
2. Sidecar `copet-hook` + `copet-run` bundle đúng per-target (Tauri `externalBin`, naming `{name}-{target-triple}`).
3. Hook install flow: cơ chế cho user cài `copet-hook` vào PATH + thêm snippet vào agent config (Claude settings.json / Codex / Gemini). Ưu tiên: lệnh trong app (Settings button "Install hooks") hoặc script `scripts/install-hooks.sh` + docs.
4. WebView2 bootstrapper cho Win10 (`downloadBootstrapper`).
5. Signing notes: macOS (Developer ID + notarization env vars), Windows (OV cert / Azure Key Vault / SmartScreen warning nếu unsigned). Document — KHÔNG bắt buộc ký cho MVP nếu chưa có cert.
6. CI workflow (GitHub Actions) build matrix 3 OS (optional nhưng khuyến nghị cho cross-platform verify — giải quyết câu hỏi mở Wayland/Win của research).

## Data flow (install hooks)
```
User: app Settings → "Install hooks" (per agent toggle)
  → invoke('install_hook', agent) [Rust]
      → copy copet-hook → ~/.copet/bin/ (symlink/PATH)
      → patch agent config (settings.json/codex/gemini) — APPEND hook entry, backup trước
  → verify: copet-hook --version chạy được
Uninstall: revert config (restore backup) + remove entry
```

## Files to create
- `.github/workflows/build-release.yml` — matrix macos/windows/ubuntu; `pnpm tauri build` per-OS; upload artifacts
- `scripts/install-hooks.sh` — (fallback CLI) copy copet-hook → `~/.copet/bin`, append snippet vào agent configs (backup trước), idempotent
- `scripts/install-hooks.ps1` — Windows tương đương (named pipe, %USERPROFILE%\.copet\bin)
- `src-tauri/src/commands/install_commands.rs` — `install_hook(agent)`, `uninstall_hook(agent)`: copy binary + patch config an toàn (backup, idempotent, detect existing entry)
- `docs/installation-guide.md` — user setup: cài app, cài hooks per agent, troubleshooting (PATH, permission, socket)
- `docs/distribution-and-signing.md` — build commands, signing env vars (mac/win), notarization, unsigned warning notes

## Files to modify
- `src-tauri/tauri.conf.json` — `bundle.targets` per-OS; `bundle.externalBin` (copet-hook, copet-run); `bundle.windows.webviewInstallMode=downloadBootstrapper`; `bundle.macOS.signingIdentity` (env-driven, optional); version/identifier/icons
- `src-tauri/src/commands/mod.rs` (P06) — register install commands → **coordinate P06** (append handlers)
- `frontend/ui/settings/Settings.tsx` (P06) — add "Install hooks" buttons per agent → invoke install_commands → **coordinate P06**
- `src-tauri/capabilities/default.json` — perms cho install commands (fs nếu cần)
- `package.json` — build scripts per bundle (`build:mac`, `build:win`, `build:linux`)
- `README.md` — link installation + distribution docs

## Implementation steps
1. `tauri.conf.json`: set targets, externalBin (build copet-hook/copet-run cho từng target-triple trước — cargo build per target), webviewInstallMode, identifier/version/icons.
2. Sidecar prep: script build `copet-hook`/`copet-run` ra `src-tauri/binaries/{name}-{target-triple}` đúng naming Tauri yêu cầu.
3. `install_commands.rs`: `install_hook(agent)` — tạo `~/.copet/bin`, copy binary, patch config (đọc JSON, append hook entry nếu chưa có, ghi backup `.bak`); idempotent; `uninstall_hook` revert.
4. Settings UI (P06 file): buttons + trạng thái installed/not; gọi commands; hiển thị kết quả.
5. `install-hooks.sh`/`.ps1`: fallback CLI cùng logic cho user không muốn dùng UI.
6. CI `build-release.yml`: matrix 3 OS, cache, `pnpm tauri build`, upload artifacts; (chạy được = giải câu hỏi Wayland/Win của research).
7. Build thật macOS dmg + verify chạy; build ≥1 OS khác (CI hoặc máy).
8. Docs: installation-guide + distribution-and-signing.

## Tests / Validation
- `pnpm tauri build --bundles dmg` (macOS) thành công → mở dmg, app chạy, pet hiện, hook install từ Settings hoạt động.
- `cargo check --workspace` sạch (install_commands).
- Verify sidecar có trong bundle (copet-hook chạy được sau install).
- e2e install: từ app cài hook Claude Code → chạy task thật → pet phản ứng (full loop từ binary đã build, không phải dev).
- CI matrix build pass (≥ macOS + 1 OS) — artifacts tạo ra.
- Idempotent test: chạy install_hook 2 lần → config không nhân đôi entry; uninstall → restore sạch.

## Risks & Rollback
| Risk | Mức | Mitigation |
|---|---|---|
| Sidecar naming/triple sai → bundle thiếu binary | Med | Theo đúng `{name}-{target-triple}`; verify trong artifact |
| Patch agent config làm hỏng file user | High | Backup `.bak` trước; parse-validate; append-only; idempotent; uninstall restore |
| macOS notarization fail (chưa cert) | Med | MVP: unsigned + doc Gatekeeper bypass; ký khi có Developer ID |
| Windows SmartScreen block unsigned | Med | Doc warning; OV cert/Azure KV khi có ngân sách |
| Win10 thiếu WebView2 | Low | downloadBootstrapper |
| Linux Wayland overlay behavior khác | Med | CI verify; document giới hạn per-compositor |

**Rollback:** Packaging không sửa runtime logic (chỉ config + install scripts + CI). Rollback = revert tauri.conf bundle + xóa CI/scripts. Install command có backup → uninstall revert config user. App vẫn chạy dev-mode nếu packaging lỗi.

## File ownership
SEQUENTIAL (cuối cùng, sau P07). Chạm `tauri.conf.json` (bundle section — khác section P01/P03/P06 window/ipc) + thêm `install_commands.rs` (file mới) + append vào `commands/mod.rs` & `Settings.tsx` (coordinate P06). Chạy một mình.

## Open questions (cần user)
1. **Target OS bắt buộc cho MVP release?** (mac-only? mac+win? cả 3?) — quyết định build matrix + test effort.
2. **Có Apple Developer ID + Windows code-signing cert không?** — nếu không, MVP ship unsigned + doc bypass.
3. Install hooks: ưu tiên UI button (trong Settings) hay CLI script? — đề xuất cả 2, UI là chính.
4. Distribution channel: GitHub Releases? Homebrew? website? — ảnh hưởng CI publish step.
