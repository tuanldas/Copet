---
phase: 5
title: Themed activity phrases
status: completed
effort: S-M (FE pure module + wire + tests)
---

# Phase 5: Themed activity phrases

## Overview

Thay tên tool thô ("Bash") bằng cụm từ dễ đọc ("Brewing…"/"Running…") ở dòng hiển thị — port rút gọn `ClaudeActivityFormatter` của agentpet. **Thuần frontend**, chạy cho mọi agent (kể cả Codex/Gemini không có narration), không đụng protocol.

## Requirements

- **Functional:** map tool name → cụm từ thân thiện + `extensionHint` theo loại file (test/doc/config). Khi `working` + có `tool`: dòng hiển thị dùng cụm từ thay tên tool thô; giữ `tool_input` nếu có; tên tool thật vào hover title.
- **Non-functional:** module pure + test; `escHtml` vẫn áp dụng; deterministic (seed theo session id) để test ổn định — KHÔNG dùng random/Date. KISS: bắt đầu **1 theme mặc định** (cấu trúc cho phép thêm theme sau, đừng over-build).

## Architecture

- **Create `src/pet/activity-phrases.ts`** (pure): `toolPhrase(tool, filePath?) -> string` + `extensionHint` (port từ agentpet `windows/src/activity.ts`, rút gọn còn 1 theme). Pick ổn định (seed djb2 theo session id) thay vì rotating random.
- **`src/pet/tooltip-render.ts` `commandLine`**: nhánh `working` — thay `escHtml(s.tool)` bằng `escHtml(toolPhrase(s.tool, fileFromInput))`; vẫn append `tool_input`. Cân nhắc giữ `tool` thật trong `hoverTitle`.
- **`src/ui/shared/SessionList.tsx`**: dùng cùng `toolPhrase` cho nhất quán (nếu list hiện tool).
- Không đụng Rust/protocol.

> **Precedence (xem plan.md):** themed phrase là fallback generic — chỉ dùng khi KHÔNG có `tool_input.description` (Phase 3). Thứ tự: description > themed phrase > tên tool thô. `commandLine` phải kiểm `description`/`tool_input` trước khi rơi về themed phrase.

## Related Code Files

- **Create:** `src/pet/activity-phrases.ts`
- **Create:** `src/pet/__tests__/activity-phrases.test.ts`
- **Modify:** `src/pet/tooltip-render.ts` (`commandLine`, có thể `hoverTitle`)
- **Modify:** `src/pet/__tests__/tooltip-render.test.ts`
- **(Optional) Modify:** `src/ui/shared/SessionList.tsx` (+ test)

## Implementation Steps (tests-first)

1. **Test đỏ (pure):** `toolPhrase("Bash")` ∈ pool "running"; `toolPhrase("Read")` ∈ pool "reading"; `toolPhrase("Edit","x.test.ts")` → "Refining tests…" (extensionHint); tool lạ → generic; cùng seed → cùng kết quả (deterministic).
2. **Impl `activity-phrases.ts`** (1 theme, seed ổn định).
3. **Test đỏ (render):** `renderTooltipHtml` working + `tool:"Bash"` → output chứa cụm từ (không phải literal "Bash"); vẫn có `tool_input` khi có; escaped.
4. **Impl** đổi `commandLine` (+ cập nhật test hiện có dùng `toContain("Bash")` → cụm từ / hoặc kiểm tra qua title).
5. **Xanh:** `pnpm test`, `pnpm exec tsc --noEmit`.

## Success Criteria

- [ ] `toolPhrase` map đúng nhóm + extensionHint; deterministic theo seed.
- [ ] Dòng working hiện cụm từ thân thiện thay tên tool thô; `tool_input` giữ nguyên; tên tool thật còn trong hover.
- [ ] Không hồi quy test tooltip hiện có (cập nhật assert cho phù hợp).
- [ ] pnpm test + tsc xanh.

## Risk Assessment

- **Mất thông tin tool thật** (thấp): giữ tool name trong `hoverTitle`; cụm từ chỉ ở dòng hiển thị.
- **Scope creep nhiều theme** (TB): chốt 1 theme mặc định trước; cấu trúc cho phép mở rộng — KHÔNG làm 5 theme ngay (YAGNI).
- **i18n**: cụm từ tiếng Anh như agentpet; app có Localizations → cân nhắc sau (ghi chú, ngoài scope phase này).
- **Test brittle**: dùng seed deterministic + assert pool-membership thay vì literal cố định.
