# Agent narration display (Codex/Claude/Gemini)

**Date:** 2026-06-24 · **Branch:** `feat/agent-narration-display` · **Plan:** `plans/260624-1518-agent-narration-display/`

## What & why

Goal: show the assistant's own words (narration) and a friendlier activity line in the pet, instead of only a raw tool name like "Bash". Started from a research question ("can we get the displayed message from claude/codex/gemini?"). Two research passes drove the plan:
- **xia vs `ntd4996/agentpet`**: the reference pet does NOT display assistant narration either — it shows a tool `description` + whimsical themed phrases + conversation title, and reads Claude's last assistant text only to detect questions. So narration-as-display was a partial red herring; the valuable, attainable wins were elsewhere.
- **deep-research (per-CLI)**: Codex exposes end-of-turn prose inline on the `Stop`/`SubagentStop` hook via `last_assistant_message` — the cleanest source, fits Copet's existing hook pipeline. Claude needs the transcript (already wired). Gemini only via headless `--output-format json` (wrapper-only, possibly deprecating).

## The surprise (Phase 1 spike)

The plan's Phase 1 opened with a "confirm the Codex hook schema" spike. Reading the real `~/.codex/hooks.json` (codex-cli 0.134.0) showed Copet's Codex integration was **broken**: `map_codex` parsed `event:"preToolUse"`/`tui.notifications` (a shape the shipped CLI never emits) and the installer appended a YAML block to `config.toml`. Real Codex uses `~/.codex/hooks.json` (ClaudeNested, PascalCase `hook_event_name`) gated by `[features] hooks = true`. So Phase 1 became a rewrite — and incidentally a bug fix for Codex support that was silently a no-op.

## Shipped (4/5)

1. **Codex hook rewrite + narration** — correct schema; installer merges into `hooks.json` (preserving foreign hooks like the AgentPet + engineer hooks already there) + enables the feature flag; `Stop`/`SubagentStop` → `last_message`.
2. **Question-detection** — pure `question_detect` module (ported from agentpet) applied in the orchestrator (kept out of `map_*` to preserve the `#[path]` integration-test purity rule); a finished turn that ends with a question becomes `waiting`. Codex benefits without opt-in; Claude when transcript reading is on.
3. **Claude Bash `description`** — prefer the human label ("run tests") over the raw command in the working line.
5. **Themed activity phrases** — pure, deterministic (djb2 seeded by session id, no `random`/`Date`) tool→phrase map for the pet line.

All gates green throughout (`cargo test --workspace`, `clippy -D warnings`, `tsc`, `pnpm test` 317/317); Phase 1 went through a `code-reviewer` pass (fixed a stale-`.bak` footgun + a wasted `SessionStart` subscription).

## Deferred / open

- **Phase 4 (Gemini wrapper)** deferred by decision — YAGNI: wrapper-only value + likely Gemini CLI mid-2026 deprecation.
- **Open (non-blocking):** `last_assistant_message` is confirmed by docs/issues but not yet captured from a live Codex `Stop` on this machine. Degrades safely to null. Worth a runtime check before relying on the narration end-to-end.

## Lessons

- Scout-first paid off twice: the deep-research reframed the goal (narration is the weak path; description/themed/question-detection are the strong ones), and the Phase 1 spike caught a pre-existing broken integration before building on it.
- A reference impl that "doesn't do X" is itself a finding — agentpet's choice NOT to show narration was the signal to not over-invest there.
