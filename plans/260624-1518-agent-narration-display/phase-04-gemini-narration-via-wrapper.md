---
phase: 4
title: "Gemini narration via wrapper"
status: pending
effort: "L (đổi I/O copet-run: capture+tee; rủi ro cao)"
---

# Phase 4: Gemini narration via wrapper

> 🟥 **DEFERRED (2026-06-24, by decision).** Not implemented this round — plan-flagged YAGNI: low value (wrapper-only, no interactive narration) + likely Gemini CLI mid-2026 deprecation. The other 4 phases shipped. Re-open as its own plan (and first verify Gemini CLI is still the right target) before building this. Spec below is preserved for that future work.

# ⚠️ Phase rủi ro cao nhất / giá trị thấp nhất — làm cuối, cân nhắc deprecation Gemini CLI trước.

## Overview

Khi bọc Gemini bằng `copet-run` ở chế độ JSON (`gemini --output-format json`), parse field `.response` (câu trả lời cuối) và đổ vào `last_message` của event `done`. **Best-effort, chỉ cho wrapper** — session Gemini interactive KHÔNG có narration (không có hook field). Đây là kết luận research, không phải hạn chế impl.

## Requirements

- **Functional:** `copet-run` phát hiện đang bọc Gemini ở JSON mode (args chứa `--output-format json` và/hoặc gate sau cờ tường minh `copet-run --capture` — xem Open Question #3), **capture stdout** (tee để user vẫn thấy output), khi child exit 0 → parse JSON cuối lấy `.response` (string) → `last_message` của event `Done`. Không phải JSON/không capture → giữ nguyên (inherit stdio như hiện tại).
- **Non-functional:** KHÔNG phá passthrough trong suốt khi không capture; không hang (đọc theo luồng, không buffer vô hạn — cap tail); exit code child giữ nguyên.

## Architecture

Hiện `copet-run` `inherit` cả stdout. Để lấy `.response` phải:
- Khi capture-mode: spawn child với `Stdio::piped()` cho stdout, **thread tee**: đọc stdout child → ghi ra stdout thật của copet-run (giữ hiển thị) + giữ buffer **tail bounded** (vd 256KB cuối).
- Sau khi child exit: từ tail, tìm JSON object cuối (Gemini `--output-format json` in 1 object) → `parse_gemini_response(tail) -> Option<String>` (pure, clip).
- Phát hiện mode: mặc định **gate sau cờ `--capture`** (an toàn passthrough); tùy chọn auto khi `basename(cmd)=="gemini"` && args chứa `--output-format json`.
- stderr giữ inherit (Gemini stream tiến trình ra stderr).

## Related Code Files

- **Modify:** `crates/copet-run/src/main.rs` (parse args `--capture`; nhánh piped+tee; gắn `last_message` vào event done)
- **Create (tùy chọn tách module):** `crates/copet-run/src/gemini_capture.rs` (`parse_gemini_response` pure + tee helper)
- **Modify/Create:** test cho `parse_gemini_response`

## Implementation Steps (tests-first)

1. **Test đỏ (pure parse):** `parse_gemini_response('{"response":"4","stats":{}}')` → `Some("4")`; có rác trước JSON → vẫn lấy object cuối; `response:null`/invalid → `None`; clip dài.
2. **Impl `parse_gemini_response`.**
3. **Test đỏ (arg detect):** hàm `capture_requested(args)` → true khi `--capture` (hoặc auto-rule) ; false mặc định.
4. **Impl** nhánh capture+tee trong `main.rs` (chỉ khi `capture_requested`); giữ nhánh inherit cũ làm default.
5. **Verify thủ công:** `copet-run --capture -- gemini --output-format json -p "2+2"` → terminal vẫn thấy JSON, pet hiện `last_message="4"` lúc done; exit code đúng. Không `--capture` → hành vi cũ y nguyên.
6. **Xanh:** `cargo test -p copet-run`, `cargo test --workspace`, `cargo clippy ... -D warnings`.

## Success Criteria

- [ ] `parse_gemini_response` đúng (valid/null/rác/dài).
- [ ] Capture-mode: user vẫn thấy stdout (tee) + `last_message` = `.response` lúc done; exit code child giữ nguyên.
- [ ] Default (không capture): passthrough inherit y như trước (không hồi quy `copet run -- sleep 2`).
- [ ] cargo test + clippy xanh.

## Risk Assessment

- **Phá passthrough/buffering** (cao): tee sai → user mất output hoặc treo. Mitigate: gate sau `--capture`, cap tail, đọc luồng + giữ stderr inherit.
- **Gemini CLI deprecation ~giữa 2026** (cao): xác nhận trước khi đầu tư (Open Question #4). Nếu sunset → cân nhắc bỏ Phase 4.
- **JSON đa dạng/đổi schema** (TB): chỉ phụ thuộc `.response` (documented). Guard null + parse object cuối.
- **Chỉ wrapper, không interactive** (constraint): ghi rõ; interactive Gemini fallback themed phrase (Phase 5).
