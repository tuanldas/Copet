---
phase: 1
title: "Hook payload enrichment"
status: done
priority: P3
dependencies: []
effort: "~1d"
---

# Phase 1: Hook payload enrichment (Group C)

## Overview

Bổ sung thông tin đã có trong hook payload nhưng chưa parse: tool input (lệnh/file cụ thể), cwd đầy đủ, text notification, prompt user. KHÔNG đọc file. Đổi `AgentEvent` (additive optional) + `map_*` + tracker/snapshot/render.

## Requirements

- Functional: hiển thị (khi có) tool input ("Bash: `pnpm test`" / "Edit: `main.ts`"), full cwd (tooltip), notification text khi `waiting`, prompt user gần nhất.
- Non-functional: additive — event/hook cũ không vỡ; Codex/Gemini để null field không có.

## Architecture

`copet-hook map_* (parse thêm field) → AgentEvent (+optional fields) → socket → Tauri emit → SessionTracker (store) → SessionSnapshot → SessionList/renderTooltipHtml (render khi có)`.

## Related Code Files

- Modify: `crates/copet-protocol/src/lib.rs` — thêm `tool_input/cwd_full/message/prompt: Option<String>` vào `AgentEvent` (giữ `#[serde(default)]` để tương thích).
- Modify: `src/types/agent-event.ts` — mirror các field optional.
- Modify: `crates/copet-hook/src/map_claude.rs` — parse `tool_input` (serialize gọn), `cwd` (full), `notification` message, `prompt` (UserPromptSubmit). + tests.
- Modify: `crates/copet-hook/src/map_codex.rs`, `map_gemini.rs` — best-effort; null nếu không có.
- Modify: `src/agent-bridge/session-tracker.ts` (+ snapshot) — store các field; `src/types/session-snapshot.ts` thêm field.
- Modify: `src/agent-bridge/agent-bridge.ts` — truyền field mới vào `update()`.
- Modify: `src/ui/shared/SessionList.tsx` + `src/pet/tooltip-render.ts` — render tool_input thay/bổ sung tool; notification text khi waiting; full cwd vào `title`.
- Tests: `crates/copet-hook/tests/mapping_tests.rs` (field mới), tracker test, tooltip-render test.

## Implementation Steps

1. (TDD) Viết test map_claude: PreToolUse với `tool_input` → event.tool_input; Notification → message; UserPromptSubmit → prompt.
2. Mở rộng `AgentEvent` Rust (+`#[serde(default)]`) + TS mirror.
3. Parse field trong `map_claude` (rút gọn tool_input thành "cmd"/"file" thay vì JSON thô); map_codex/gemini null-safe.
4. Tracker/snapshot/agent-bridge truyền field; render hiển thị có điều kiện (truncate dài).
5. Verify: `cargo test` (mapping) + `pnpm test` + `tsc` + `cargo clippy`.

## Success Criteria

- [x] Hook Claude → session hiện tool_input + notification text + prompt (khi có). Thêm full cwd (hover title).
- [x] Event/hook cũ + Codex/Gemini không vỡ (field null; `#[serde(default)]` + daemon re-serialize).
- [x] `cargo test`/`clippy` + `pnpm test`/`tsc` sạch (clippy `-D warnings`; vitest 272 pass).

## Implementation Notes (done 2026-06-23)

- `AgentEvent` +4 optional fields (`tool_input`, `cwd_full`, `message`, `prompt`) — Rust `Option<String>` `#[serde(default)]` ⇄ TS `string | null`.
- `map_claude`: `summarize_tool_input` (command / file basename / pattern / url; unknown → None, never raw JSON) + `clip` (trim, UTF-8-safe truncate 80/160, ellipsis). Codex/Gemini/copet-run null Claude-only fields (cwd_full populated where cwd available).
- `SessionTracker.update()` takes trailing `info: SessionInfo` object (avoids 10-arg positional). `SessionSnapshot` fields optional (additive).
- Render: pet tooltip = enriched `Tool: input` + waiting message, cwd/prompt in hover `title` (all `escHtml`); HUD `SessionList` = waiting message on line 2 + detail line 3 + cwd in name title.
- Review: `plans/reports/from-cook-self-review-260623-1346-phase1-enrichment-review.md` (Status DONE, no Critical/High/Medium).

## Risk Assessment

- `tool_input` có thể lớn/nhạy cảm → rút gọn + truncate; không hiện toàn bộ JSON.
- Đổi protocol = đổi 2 nơi (Rust+TS) → giữ đồng bộ; `#[serde(default)]` để không vỡ deserialize event cũ.
- Layout chật → ưu tiên hiện ở HUD/popover; panel pet giữ gọn.
