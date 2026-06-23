# Phase 1 Enrichment — Code Review (self-review)

Plan: `plans/260623-1033-session-info-enrichment/` · Phase 1 (Group C: hook-payload enrichment)
Branch: `feat/running-sessions-multi-surface` · Date: 2026-06-23
Reviewer: cook self-review (code-reviewer subagent unavailable — session limit). Done with full authoring context.

## Scope reviewed (this session's changes only)

protocol: `copet-protocol/src/lib.rs` · hook: `map_claude.rs`, `map_codex.rs`, `map_gemini.rs`, `tests/mapping_tests.rs` · wrapper: `copet-run/src/main.rs` · TS contract: `agent-event.ts`, `session-snapshot.ts` · bridge: `session-tracker.ts`, `agent-bridge.ts` · render: `tooltip-render.ts`, `SessionList.tsx`, `session-list.css` · tests: `session-tracker.test.ts`, `tooltip-render.test.ts`, `accounting.test.ts`.

Out of scope (pre-existing uncommitted branch work, NOT reviewed): `src/main.ts`, `src/pet/pet-tooltip.ts`, `session-list-model.test.ts`, `agent-badge.ts`.

## Verification (all green)

- `cargo clippy --workspace --all-targets -- -D warnings` → clean
- `cargo test --workspace` → src-tauri 6, copet-hook 25 unit + 41 integration, protocol 6 — all pass
- `pnpm exec tsc --noEmit` → clean
- `pnpm test` → 272 pass (+6 new)

## Findings

No Critical/High/Medium issues.

- **Security (escaping) — PASS.** All agent/user-controlled new fields (`tool_input`, `message`, `cwd_full`, `prompt`, plus `tool`) are HTML-escaped before entering the `innerHTML` string in `tooltip-render.ts`, including the `title` attribute (whole-string `escHtml`, double-quoted attr). `SessionList.tsx` uses Solid JSX text/attr interpolation (auto-escaped); no `innerHTML`.
- **Backward-compat contract — PASS.** 4 Rust fields are `Option<String>` + `#[serde(default)]`; daemon re-serialises every event through the struct so the frontend always receives them (null when absent). Legacy-event deserialize covered by `enrichment_fields_default_to_none_when_absent`. Codex/Gemini/copet-run literals updated (compile + null for Claude-only fields; `cwd_full` populated where cwd is available).
- **Regression — PASS.** XP/token accounting (`agent-bridge` done/tool gating), `SessionTracker.aggregate()/since/expireStale`, and `socket_daemon` round-trip are logically untouched; `update()` gained a trailing optional `info` arg so all existing positional callers stay valid.
- **Edge cases — PASS.** `clip()` returns `None` for empty/whitespace and truncates by `chars()` (UTF-8-safe, ellipsis); `summarize_tool_input` returns `None` on unknown shapes (never dumps raw JSON); `tool_input` present with `tool` null renders without the `Tool:` prefix.
- **Nit (Low, no action):** `SessionInfo` object param is the right call over a 10-arg positional signature (KISS); detail/title closures in `SessionList` are non-reactive (correct — they don't read clock signals).

## Acceptance criteria — met

tool_input condensed (command/file-basename/pattern/url) · cwd_full full path, project basename · Notification→message · UserPromptSubmit→prompt(working) · legacy/Codex/Gemini→null, no break · truncation 80/160 UTF-8-safe · pet shows `Tool: input` + waiting message, cwd/prompt in hover title · HUD adds waiting message + detail line + cwd title.

## Unresolved questions

- None for Phase 1. Phase 2 (transcript/model/tokens, Settings opt-in) deferred per user scope decision.

Status: DONE
Summary: Phase 1 enrichment is correct, secure (full escaping), backward-compatible, and regression-free; all lint/type/test gates green.
