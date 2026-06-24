---
phase: 3
title: Claude tool description enrichment
status: completed
effort: S (1 fn + tests trong map_claude)
---

# Phase 3: Claude tool description enrichment

## Overview

Bù field `description` mà Claude tự gắn cho mỗi tool call (vd Bash `description:"run tests"`) vào dòng working, để đọc dễ hơn — đúng cách agentpet ưu tiên. Rẻ, lấy thẳng từ stdin hook, không đọc file, không đổi shape contract (gộp vào `tool_input` string sẵn có).

## Requirements

- **Functional:** `summarize_tool_input` (map_claude.rs) cân nhắc `description`. Quy tắc đề xuất (Open Question #2): với Bash → **ưu tiên `description`** ("run tests"), fallback `command` ("pnpm test"); các tool khác giữ nguyên (file_path basename → pattern → url). Clip ≤ `MAX_TOOL_INPUT` (80).
- **Non-functional:** `map_claude.rs` giữ pure; additive (vẫn 1 string `tool_input`, không field mới → không sync dual-source).

## Architecture

`summarize_tool_input(v)` hiện ưu tiên `command → file_path/path → pattern → url`. Thêm `description` vào logic:
- Nếu có `command` **và** `description` → trả `description` (người-đọc) thay vì `command` thô (quyết định mặc định; có thể đổi sang `"desc · command"` nếu validation muốn cả 2).
- Không có `description` → giữ hành vi cũ (command).
- Giữ thứ tự cho tool khác.

Không đổi UI (tool_input đã render ở `cpt-cmd` + SessionList). Đây chỉ là đổi nội dung chuỗi.

> **Precedence (xem plan.md):** dòng working ưu tiên `tool_input.description` (phase này) > themed phrase (Phase 5) > tên tool thô. Phase 3 cung cấp nhãn cụ thể nhất nên thắng khi có.

## Related Code Files

- **Modify:** `crates/copet-hook/src/map_claude.rs` (`summarize_tool_input`)
- **Modify:** `crates/copet-hook/src/map_claude.rs` `#[cfg(test)]` (hoặc `tests/mapping_tests.rs`)

## Implementation Steps (tests-first)

1. **Test đỏ:** PreToolUse Bash `{"command":"pnpm test","description":"run tests"}` → `tool_input == Some("run tests")`.
2. **Test đỏ:** Bash `{"command":"ls"}` (không description) → `tool_input == Some("ls")` (giữ cũ).
3. **Test đỏ (không hồi quy):** Edit `{"file_path":".../main.ts"}` → `Some("main.ts")`; Grep `{"pattern":"foo"}` → `Some("foo")`.
4. **Impl** `summarize_tool_input`: thêm nhánh `description` ưu tiên khi đi cùng `command`.
5. **Xanh:** `cargo test -p copet-hook`, `cargo clippy ... -D warnings`.

## Success Criteria

- [ ] Bash có `description` → hiển thị description; không có → command.
- [ ] Không hồi quy các tool khác (Edit/Read/Grep/WebFetch).
- [ ] `map_claude.rs` vẫn pure; cargo test + clippy xanh.

## Risk Assessment

- **Thị hiếu UX** (thấp): vài user thích thấy lệnh thật ("pnpm test") hơn nhãn ("run tests"). Quyết định mặc định ưu tiên description; dễ đảo. Đưa vào validation.
- **`description` dài/rỗng** (thấp): clip 80 ký tự; rỗng → fallback command. Blast radius = chỉ hiển thị.
