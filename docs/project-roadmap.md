# Copet — Project Roadmap

## Release Status

**v0.1.0 (MVP)** — 2026-06-22 ✅ **SHIPPED**
- All 8 phases complete
- DMG builds verified on macOS
- Feature-complete Tamagotchi + token economy + agent integration
- 16 vitest + 1 Rust test suite passing
- Ready for early adopters (unsigned builds + Gatekeeper docs)

---

## Phase Timeline (Completed)

| Phase | Dates | Status | Focus |
|-------|-------|--------|-------|
| 01: Scaffold + transparent overlay PoC | 2d | ✅ | Tauri v2 setup, click-through PoC |
| 02: Pet rendering engine | 4d | ✅ | Canvas 2D, spritesheet, Petdex loader |
| 03: Agent integration backend | 5d | ✅ | Socket daemon, copet-hook, multi-agent |
| 04: Tamagotchi core | 3d | ✅ | Stats, XP, evolution, offline decay |
| 05: Token economy + shop | 2.5d | ✅ | Token gen, food, cosmetics, buy/equip |
| 06: UI shell + system integration | 3d | ✅ | HUD, Settings, Shop, tray, hotkey |
| 07: Wire agent state → pet reaction | 2d | ✅ | Session aggregate, glow+animation |
| 08: Packaging + distribution | 2d | ✅ | DMG, MSI, AppImage, hook install |

---

## Post-MVP Releases

### Feature Release: Session-Info Enrichment (Phase 1 & 2) — 2026-06-23 ✅ **SHIPPED**

**Phase 1: Hook-Payload Enrichment (mvp)** — Copet-hook extracts condensed tool_input, full cwd_full, notification message, user prompt from hook JSON.

**Phase 2: Transcript Enrichment (opt-in)** — NEW copet-hook/transcript.rs reads Claude transcript JSONL (bounded 256KB tail); extracts model, task summary, last_message, tokens_in/out; graceful error handling.

**Key Changes:**
- AgentEvent struct grows 9 optional fields (additive, `#[serde(default)]`): tool_input, cwd_full, message, prompt (always on Claude), + model, summary, last_message, tokens_in, tokens_out (Claude only, opt-in)
- NEW `copet_config_path()` → `~/.copet/hook-config.json`; Settings has privacy-warned toggle "Model & tóm tắt task"
- NEW `set_transcript_optin(enabled: bool)` command; `get_settings` returns `transcript_optin` field
- copet-hook/transcript.rs: parse transcript on demand per event; UTF-8-safe truncation; any error → None (never blocks/panics)
- SessionList.tsx + tooltip-render.ts show model badge, tokens, condensed tool; cwd/prompt/last_message go to hover title
- Helper functions: `pet-status.ts` (mood from stats), `session-counts.ts` (countRunning), `session-format.ts` (formatTokens, shortModel)

**Sessions Control Panel (Multi-Surface)** — sessions window redesigned:
- NEW CompanionCard.tsx: pet avatar/name/level/mood/XP bar/total tokens
- Header: agent counts + Show Pet toggle
- Footer: Settings/Quit buttons
- Size: 320x520

**Popover Positioning (macOS Runtime-Native)** — sessions window built at runtime (not in tauri.conf.json) so it can apply fullscreen overlay behavior + AppKit positioning (NSEvent::mouseLocation + NSScreen::visibleFrame); replaces unreliable Tauri `cursor_position` / `set_position`.

**New Deps:** objc2, objc2-foundation (AppKit for native window positioning + fullscreen overlay).

**Tests:** 261+ vitest + Rust tests passing; tsc clean; cargo check/clippy clean.

**Status:** Complete; shipped.

---

### Feature Release: Running Sessions List (Multi-Surface) — 2026-06-23 ✅ **SHIPPED** (earlier phase)

**Milestone:** Pet window broadcasts per-session snapshot via Tauri event `sessions-snapshot`; HUD + tray popover + tooltip render multi-session list.

**Key Changes:**
- New shared types: `SessionSnapshot` (sessionId, agent, project, state, since, ts), `LabelTheme` enum (kitchen/mood/garden)
- `SessionTracker` gains `since` per session, `list()` method, exported `PRIORITY` + comparator
- New modules: `state-labels.ts` (3 selectable label themes), `session-duration.ts`, `label-theme-store.ts`, `session-list-model.ts`, `use-sessions.ts` hook, `SessionList.tsx` component
- New tray control panel window (`sessions` label, runtime-built)
- **Tray behavior changed:** Left-click now opens sessions control panel (pet visibility via menu + global shortcut)
- `Cargo.toml`: `tauri-plugin-positioner` has `features = ["tray-icon"]`; NEW objc2 deps for AppKit
- New Rust command `set_label_theme`; `get_settings` returns `label_theme` field
- Removed `AgentStatusRow.tsx` (superseded by SessionList)
- Status labels are theme-flavoured; done/idle rows render dimmed; sessions expire after 5 min inactivity

**Status:** Complete; shipped.

---

## Post-MVP Roadmap (Prioritized)

### In-Flight: Sessions Control-Panel Refinements (deferred)

**Ticket:** plans/260623-1454-tray-popover-control-panel/

Features for later phases:
- Daily token/earnings display in popover header
- Custom pet name (currently hardcoded "Copet")
- Pet size slider (currently fixed 96×96)
- Floating menu bar (Claude Code plugin style)
- Notification bubble for new sessions

All deferred pending user demand + bandwidth.

---

### P-0: Multi-Monitor Fullscreen Popover on Win/Linux (Optional)

**Estimated:** 1 dev week  
**Dependency:** P-1 (no critical bugs)

The macOS AppKit positioning (`NSEvent::mouseLocation` + `NSScreen::visibleFrame`) works natively. Windows/Linux need verification:
- Win 10/11: test taskbar position + multi-monitor DPI edge cases
- Linux: test X11 + Wayland; may need alternative positioning library (libappindicator3 for Wayland?)

If issues found, fallback: use Tauri `cursor_position` with bounds clamping (safer but less native-feeling).

---

### P-1: Bug Fixes & Critical Issues (if any)

**Estimated:** 1–2 weeks  
**Trigger:** User reports or e2e verification on Win/Linux

- [ ] Verify transparent overlay behavior on Windows 10/11
- [ ] Verify transparent overlay behavior on Linux (X11 / Wayland)
- [ ] Fix any socket path bugs (Windows named pipe edge cases)
- [ ] Fix any offline decay edge cases (clock skew, resume from sleep)

**Acceptance:** E2E passing on all 3 OS; no critical bug reports in 7 days post-release.

---

### P-2: Code-Signing & Distribution (High Priority)

**Estimated:** 2 weeks  
**Dependency:** P-1 (no critical bugs)  
**Owner:** TBD (team with Apple Developer ID / Windows code-signing cert access)

#### Milestone 2a: macOS Code-Signing & Notarization

**Tasks:**
- [ ] Acquire Apple Developer ID ($99 1-time or $12.99/month)
- [ ] Set up `produce` (fastlane) for Apple team provisioning
- [ ] Integrate code-signing into CI (GitHub Actions):
  - Env var: `APPLE_DEVELOPER_ID_* ` (cert + password)
  - Build + sign DMG
  - Submit to Apple notarization service
  - Wait for approval (typically 5–30 min)
  - Staple notarization ticket
- [ ] Test notarized DMG on clean macOS 13+ (cold boot, verify Gatekeeper passes)
- [ ] Update docs/distribution-and-signing.md with env vars + CI config

**Acceptance:** DMG notarized; Gatekeeper auto-approves; no "unidentified developer" warning.

#### Milestone 2b: Windows Code-Signing

**Tasks:**
- [ ] Acquire OV (Organization Validation) certificate
- [ ] Integrate code-signing into CI:
  - Env var: `WINDOWS_CERT_*` (cert file + password)
  - MSI signed during build
- [ ] Test signed MSI on Windows 10/11 (SmartScreen bypass verification)
- [ ] Update docs/distribution-and-signing.md

**Acceptance:** MSI signed; SmartScreen doesn't warn; installer installs cleanly.

#### Milestone 2c: macOS Fullscreen NSWindowLevel Override

**Tasks:**
- [ ] Research macOS fullscreen behavior (private API or workaround)
- [ ] Test multi-monitor fullscreen (pet should visible on all monitors or top monitor)
- [ ] If needed, override `NSWindowLevel` via objc2 raw call
- [ ] Add regression test

**Acceptance:** Pet visible when user's IDE goes fullscreen on macOS.

---

### P-3: Community Features (Medium Priority)

**Estimated:** 3–4 weeks  
**Dependency:** P-2 (distribution solid)

#### Milestone 3a: Community Pet-Packs

**Tasks:**
- [ ] Build pet-pack submission & licensing guidelines (docs/pet-pack-guidelines.md)
  - Spritesheet format (8×9 grid, 192×208 px/frame)
  - pet.json schema
  - License manifest (CC0, CC-BY, CC-BY-SA, etc.)
  - Submission process (GitHub PR to public/assets/pets/)
- [ ] Create pet-pack marketplace UX:
  - [ ] Settings panel: list downloadable pet-packs
  - [ ] Download + install flow
  - [ ] Preview before install
- [ ] Curate 3–5 community pet-packs (reach out to pixel artists)
- [ ] Publish pet-pack guidelines on public docs site

**Acceptance:** 3+ community pets submitted + installed + working in app.

#### Milestone 3b: Achievements System (Optional)

**Tasks:**
- [ ] Design 5–10 achievements (e.g., "Evolve to stage 5", "Earn 1000 tokens", "Feed pet 100 times")
- [ ] Add SQLite persistence (optional, if not too heavy):
  - [ ] Migrate from tauri-plugin-store JSON to SQLite for history
  - [ ] Store achievement unlock timestamps
- [ ] Achievement badge UI (HUD or dedicated panel)
- [ ] Achievement notifications (tray toast)

**Acceptance:** 5 achievements working; users earn + see badges.

---

### P-4: Advanced Integrations (Lower Priority)

**Estimated:** 2–3 weeks per agent  
**Dependency:** P-2, P-3 (solid foundation)

#### Milestone 4a: Cursor CLI Native Hooks

**Trigger:** Cursor releases CLI hook API  
**Tasks:**
- [ ] Implement map_cursor.rs in copet-hook (once Cursor docs available)
- [ ] Test with real Cursor agent sessions
- [ ] Update agent-hook-setup.md

**Acceptance:** Cursor sessions trigger pet reactions (working/done/error).

#### Milestone 4b: Anthropic API Direct Integration (Advanced)

**Trigger:** User demand  
**Tasks:**
- [ ] Research Anthropic API webhook support (if added)
- [ ] Direct API → socket (no CLI hook needed)
- [ ] Useful for non-CLI Anthropic SDK users (e.g., Python, Node.js scripts)

**Acceptance:** Anthropic SDK usage triggers pet reactions.

---

### P-5: Mobile & Extensibility (Far Future)

**Estimated:** 6+ weeks  
**Dependency:** P-2, P-3, P-4 (desktop mature)

#### Milestone 5a: iOS/Android Support (Tauri Mobile)

**Tasks:**
- [ ] Evaluate Tauri Mobile readiness (WIP as of 2026-06)
- [ ] Port UI to mobile-first responsive design
- [ ] Test pet overlay on mobile (different interaction model)
- [ ] iOS App Store + Google Play distribution

**Acceptance:** Copet runs on iOS/Android; pet reacts to agent state (if background hook available).

#### Milestone 5b: Plugin System

**Tasks:**
- [ ] Design plugin API for custom pet-packs + reactions
- [ ] Add plugin loader (WASM or scripting)
- [ ] Example: custom agent mapping (user-written)

**Acceptance:** 1 user-created plugin working.

---

## Known Limitations & Workarounds

| Issue | Status | Workaround | Timeline |
|-------|--------|-----------|----------|
| Transparent window click-through (Tauri #13070) | Resolved for MVP | macOS native (works); Win/Linux cursor-poll fallback | Depends on Tauri |
| Unsigned builds (MVP) | Expected | Docs explain Gatekeeper bypass | P-2 |
| No CLI hook for Cursor | Limitation | Universal wrapper covers | P-4 (await Cursor) |
| Petdex format not auto-downloaded | MVP scope | Manual copy to public/assets/pets/ | P-3 |
| No SQLite (MVP) | Design choice | JSON store sufficient; SQLite optional later | P-3 |
| No Wayland multi-monitor fullscreen (Linux) | Known | Test when Wayland support improves | TBD |

---

## Maintenance & Support Plan

### Quarterly Reviews

Every 3 months:
- [ ] Review bug reports + user feedback
- [ ] Update roadmap priorities based on community demand
- [ ] Backlog grooming (P-1 critical fixes)

### Continuous Improvements

- [ ] Monitor Tauri releases (new plugin APIs, bug fixes)
- [ ] Monitor agent CLI updates (Claude Code, Codex, Gemini)
- [ ] Keep hook mappings in sync with agent changes
- [ ] Gather anonymous telemetry (opt-in: hook install success rate)

### Documentation

- Keep `docs/` in sync with code changes
- Maintain changelog in README.md or separate CHANGELOG.md
- Document each post-MVP milestone in `docs/`

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Early adopters** | 50+ within 1 month | GitHub stars, release downloads |
| **Agent coverage** | 3+ agents (MVP: Claude/Codex/Gemini + wrapper) | Hook install success logs |
| **Community pet-packs** | 5+ by P-3 | Community submissions (GitHub PR) |
| **Uptime** | >99% (socket daemon stable) | Error logs + user reports |
| **Performance** | CPU <2% idle, <50MB RAM | Benchmarks per release |
| **Code quality** | Test coverage ≥70% | vitest + Rust test reports |

---

## Budget Estimate (if team-backed)

| Phase | Cost | Notes |
|-------|------|-------|
| P-1: Bug fixes | Free (volunteer time) | 1–2 weeks dev + QA |
| P-2a: Apple code-signing | $99–130 (cert + time) | 1 dev week |
| P-2b: Windows code-signing | $300–500 (OV cert) | 1 dev week |
| P-2c: Fullscreen fix | Free (internal) | 1 dev day |
| P-3a: Pet-packs | $500 (artist commissions) | 3–5 commissioned packs |
| P-3b: Achievements | Free (internal) | 1–2 dev weeks |
| P-4a: Cursor hooks | Free (when available) | 1 dev day |
| P-4b: Anthropic API | Free (internal) | 1 dev week |
| P-5a: Mobile | Free (Tauri Mobile) | 4–6 dev weeks |
| P-5b: Plugin system | Free (internal) | 2–3 dev weeks |

**Total (P-1 through P-4):** ~$900–1200 + ~8–10 dev weeks.

---

## Risks & Contingencies

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Transparent overlay breaks in Tauri v2.1+ | Low | High | Pin Tauri version; monitor releases |
| Agent CLI API changes break hooks | Medium | Medium | Weekly test against real agents; monitor changelogs |
| Community pet-packs spam/malware | Low | Medium | Require code review before merge; license manifest |
| Mobile OS restrictions (iOS sandbox) | Medium | Medium | Design offline mode; minimal permissions |
| User churn if game loop boring | Medium | High | Engagement metrics; iterate on cosmetics/achievements |

---

## Next Immediate Actions (Week 1 Post-Release)

1. [ ] Monitor GitHub issues + community feedback
2. [ ] Verify e2e on Windows 10/11 + Linux (popover positioning, click-through)
3. [ ] Test transcript opt-in toggle with real Claude Code agent (verify privacy + correctness)
4. [ ] Prepare P-0 verification report (multi-monitor fullscreen)
5. [ ] Begin P-1 bug fix sprint if issues found
6. [ ] Begin P-2a planning (Apple code-signing setup)
7. [ ] Reach out to pixel artists for community pet-pack commissions
8. [ ] Set up telemetry (optional: hook install success rate, transcript opt-in adoption)

---

**Last Updated:** 2026-06-23  
**Status:** MVP + running-sessions + session-info enrichment complete; ready for P-0 verification or P-1 bug fixes  
**Next Review:** 2026-07-23 (1 month post-enrichment-release)
