# Phase 2 Transcript Enrichment — Code Review (self-review)

Plan: `plans/260623-1033-session-info-enrichment/` · Phase 2 (Group D: transcript enrichment, Claude only, opt-in)
Branch: `feat/running-sessions-multi-surface` · Date: 2026-06-23
Reviewer: cook self-review (code-reviewer subagent unreliable under session limit). Done with full authoring context + real-data validation.

## Scope reviewed (this session's changes)

protocol: `lib.rs` (+5 fields, `copet_config_path()`) · hook: `transcript.rs` (NEW), `main.rs` (enrich wiring), `map_claude/codex/gemini.rs` (+5 None), `copet-run/main.rs` (+5 None ×3) · app: `system_commands.rs` (`set_transcript_optin`, `write_hook_config`, get_settings), `lib.rs` (handler) · TS contract: `agent-event.ts`, `session-snapshot.ts` · bridge: `session-tracker.ts`, `agent-bridge.ts` · settings: `tauri-commands.ts`, `Settings.tsx` · render: `session-format.ts` (NEW), `tooltip-render.ts`, `SessionList.tsx`, `session-list.css` · tests: `transcript.rs` (9), `session-tracker.test.ts`, `tooltip-render.test.ts`, `accounting.test.ts` · docs: `agent-hook-setup.md`.

## Verification

- `cargo clippy --workspace --all-targets -- -D warnings` clean
- `cargo test --workspace` pass (src-tauri 6, copet-hook 34, mapping 41, protocol 7)
- `pnpm exec tsc --noEmit` clean; `pnpm test` 276 pass
- **Real-data validation**: ran the exact parse logic on a live transcript → model `claude-opus-4-8`, summary "Enrichment session info cooking plans", tokens_in 315841 / out 874, last_message extracted. Schema mapping confirmed against actual Claude Code JSONL (not the plan's simplified schema).

## Findings

No Critical/High/Medium issues.

- **Privacy (PASS).** Transcript read is gated by `transcript_enabled()` (reads `~/.copet/hook-config.json` → `read_transcript`), checked first in `maybe_enrich`; default OFF on missing file/key/parse-error. Settings toggle defaults off, has an explicit privacy warning. Bounded 256KB tail read; text capped (model 60 / summary 120 / message 200 chars); no raw conversation logged or persisted.
- **Never blocks agent (PASS).** No `unwrap/expect/panic` on the production path (only in `#[cfg(test)]`). Missing/corrupt file → `TranscriptInfo::default()`; bad JSON lines skipped; missing `transcript_path` → no-op. Hook still always exits 0.
- **Schema correctness (PASS).** Verified against real transcripts: model = last `assistant` `message.model`; summary = last `ai-title.aiTitle` (the plan's assumed `summary` lines do not exist); last_message = backward-scan for last assistant `text` content block (last line is often `tool_use` only); tokens_in = input + cache_read + cache_creation, tokens_out = output.
- **IPC channel (PASS).** App and hook share `copet_protocol::copet_config_path()` (single source for `~/.copet/hook-config.json`). Env vars can't cross the agent→hook process boundary, so a config file is the correct mechanism. `set_transcript_optin` writes both the Tauri store (UI state) and the config file (hook); `get_settings` returns `transcript_optin`.
- **Contract / regression (PASS).** 5 Rust fields `#[serde(default)]` ↔ TS `… | null`; all `AgentEvent` literals updated. `map_claude` stays pure (transcript done in `main.rs`) so `#[path]` integration tests still compile. Phase 1 + XP/aggregate/since logic untouched.
- **Escaping (PASS).** `model`/`summary`/`last_message` escaped in `tooltip-render`; tokens numeric; HUD uses auto-escaped Solid JSX.
- **Throttle note (Low, by design).** Stateless hook can't easily time-throttle; bounded tail-read (256KB) caps per-event cost instead. Read happens on every event when opt-in; acceptable since the read is bounded. Logged here rather than silently chosen.

## Acceptance criteria — met

opt-in ON + Claude → model + summary + last message + tokens shown · opt-in OFF (default) → no transcript read, fields null · missing/corrupt transcript → skip, agent not blocked · Codex/Gemini/wrapper unaffected · clippy/test/tsc clean.

## Unresolved questions

- None blocking. Future: time-based throttle if per-event tail-read ever shows up in profiling; surfacing token cost trend (would need persistence — Group F, out of scope).

Status: DONE
Summary: Phase 2 transcript enrichment is correct (schema validated on real data), privacy-gated (opt-in default OFF, bounded read, no raw logging), non-blocking, and regression-free; all gates green.
