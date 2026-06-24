---
phase: 1
title: Codex narration via Stop hook
status: completed
effort: 'M (Rust: map + install + tests; 1 spike)'
---

# Phase 1: Codex narration via Stop hook

## Overview

Đổ **assistant narration của Codex** vào `event.last_message` từ field `last_assistant_message` của Stop/SubagentStop hook (inline stdin, KHÔNG đọc file) — sau khi reconcile tích hợp hook Codex của Copet với schema Codex thật. `last_message` đã flow tới UI nên không cần đổi frontend.

## Requirements

- **Functional:**
  - Codex `Stop`/`SubagentStop` → `event.state = Done`, `event.last_message = last_assistant_message` (clip ≤200 ký tự, như `MAX_MESSAGE`).
  - Cài hook Codex bổ sung event Stop/SubagentStop (hiện thiếu) + bật cơ chế hook Codex yêu cầu (`[features] hooks = true` nếu schema thật cần).
  - `map_codex.rs` map đúng schema Codex hiện hành (xác nhận ở spike).
- **Non-functional:** `map_codex.rs` giữ **pure** (no IO, no sibling deps — gotcha `#[path]` integration tests); hook luôn exit 0; thay đổi **additive** (không đổi shape `AgentEvent`); install idempotent + giữ `.bak` gốc.

## Architecture

**✅ SPIKE RESOLVED (2026-06-24, đọc `~/.codex/hooks.json` thật trên máy — codex-cli 0.134.0):**
- Hook config thật ở **`~/.codex/hooks.json`** (JSON, **ClaudeNested**: `{"hooks":{"<Event>":[{"hooks":[{"type":"command","command":...}],"matcher"?:...}]}}`), KHÔNG phải block YAML trong config.toml.
- Event name **PascalCase**: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `Stop`, `SubagentStop` (snake_case `pre_tool_use` trong config.toml chỉ là internal state-key). Payload stdin dùng `hook_event_name` (giống Claude), KHÔNG phải `event`.
- `[features] hooks = true` bật sẵn; có hook-trust (`--dangerously-bypass-hook-trust`).
- AgentPet đang cài trên máy hook đúng các event này (gồm Stop/SubagentStop) → xác nhận.

**⛔ Hệ quả (red-team #2 xác nhận): Codex support hiện tại của Copet ĐANG HỎNG** — `map_codex.rs` parse `event:"preToolUse"`/`"tui.notifications"` (sai), `patch_codex_config` ghi YAML vào config.toml (sai chỗ + sai format). **Phase 1 = VIẾT LẠI tích hợp Codex** (không chỉ "thêm Stop"):
- `map_codex.rs` → parse `hook_event_name` PascalCase; `Stop`/`SubagentStop`→Done, `PermissionRequest`→Waiting, `SessionStart`/`UserPromptSubmit`/`PreToolUse`→Working; extract `last_assistant_message`→`last_message` (clip).
- `patch_codex_config` → ghi/merge `~/.codex/hooks.json` (ClaudeNested, idempotent theo command-string như agentpet `hooks.rs`) + đảm bảo `[features] hooks=true`; bỏ đường YAML cũ. Tham chiếu code: agentpet `windows/src-tauri/src/hooks.rs` (đã phân tích ở xia report).

**⚠️ Còn 1 điểm cần verify runtime:** field `last_assistant_message` trên Stop payload — confirmed bởi research (developers.openai.com/codex/hooks, openai/codex#23784) nhưng CHƯA capture payload thật trên máy này. Degrade an toàn: nếu field khác tên → `last_message` = None (không vỡ). Có thể verify bằng temp-hook dump stdin (cần chạy 1 lượt Codex).

**Luồng:** Codex hook → `copet-hook --agent codex` (stdin JSON) → `map_codex::parse` → AgentEvent với `last_message` → socket → UI (đã render `lastMessage` ở hover + SessionList).

## Related Code Files

- **Modify:** `crates/copet-hook/src/map_codex.rs` (parse schema thật + `last_assistant_message`)
- **Modify:** `crates/copet-hook/tests/mapping_tests.rs` (fixture + assert Codex)
- **Modify:** `src-tauri/src/commands/install_commands.rs` (`patch_codex_config`, `restore_config`, `hook_status`/`check_hook_present_*` cho Codex)
- **Modify:** `docs/agent-hook-setup.md` (cập nhật hướng dẫn Codex)
- **Create (fixture):** `crates/copet-hook/tests/fixtures/codex-stop.json` (payload thật capture được)

## Implementation Steps (tests-first)

1. **Spike — chốt schema:** chạy Codex thật với 1 hook tạm in stdin ra file (hoặc dùng `copet-hook --agent codex` log), capture payload Stop. Lưu thành fixture. Đối chiếu research; ghi kết luận vào Open Questions của plan. (Nếu không chạy được Codex: dùng payload trong openai/codex#23784 làm fixture tạm, đánh dấu cần verify.)
2. **Test đỏ (mapping):** thêm test: fixture Stop có `last_assistant_message:"I've completed the refactoring."` → `parse` cho `state==Done`, `last_message==Some("I've completed the refactoring.")`.
3. **Test đỏ:** PreToolUse (không có narration) → `last_message==None`. SubagentStop → Done + last_message.
4. **Impl `map_codex.rs`:** nhận cả `hook_event_name` lẫn `event` (tương thích ngược), map Stop/SubagentStop→Done với `last_assistant_message`→`last_message` (clip). Giữ mapping working/waiting hiện có nếu spike xác nhận còn đúng; nếu schema đổi hẳn thì thay theo fixture. Thêm `clip` cục bộ (giữ pure, như `map_claude.rs`).
5. **Test đỏ (install):** `patch_codex_config` ghi entry Stop/SubagentStop + (nếu cần) `[features] hooks=true`; idempotent; `hook_status` đọc đúng.
6. **Impl install/uninstall:** cập nhật `patch_codex_config` theo schema thật (hooks.json ClaudeNested hoặc giữ YAML nếu spike xác nhận); thêm Stop/SubagentStop; reconcile `check_hook_present_*`.
7. **Xanh:** `cargo test -p copet-hook`, `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`.

## Success Criteria

- [ ] Spike chốt được schema Codex thật (fixture lưu trong repo) hoặc đánh dấu rõ payload cần verify.
- [ ] `map_codex::parse` trên Stop/SubagentStop trả `last_message` = narration; non-Stop trả None.
- [ ] `patch_codex_config` cài Stop/SubagentStop (+ enable hooks nếu cần), idempotent, giữ `.bak` gốc, uninstall sạch.
- [ ] `map_codex.rs` vẫn pure (integration test `#[path]` chạy).
- [ ] cargo test + clippy workspace xanh.

## Risk Assessment

- **Schema sai/đổi** (cao): spike + fixture từ payload thật; giữ tương thích cả `hook_event_name` lẫn `event`; không xoá mapping working/waiting cũ tới khi xác nhận.
- **Đổi install phá Codex working/waiting cũ** (TB): thêm event, không thay thế; test idempotent + uninstall.
- **Mojibake non-ASCII trên Windows** (thấp, macOS-primary): xử lý `last_assistant_message` null/cắt cụt phòng thủ (đã `Option` + clip).
- **Codex chưa cài / hooks tắt:** install bật `[features] hooks=true`; nếu user chưa trust hook (Codex yêu cầu `/hooks` trust) → ghi chú trong `agent-hook-setup.md`.
