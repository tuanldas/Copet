---
phase: 2
title: Question detection waiting state
status: completed
effort: M (Rust pure module + orchestrator wire + FE line)
---

# Phase 2: Question detection waiting state

## Overview

Khi agent kết thúc lượt (`Stop → Done`) nhưng câu assistant cuối thực ra là **câu hỏi / xin chỉ dẫn**, đổi state thành `Waiting` để pet báo "cần input". Port `looks_like_question` từ agentpet. Áp dụng đồng nhất cho Claude (`last_message` từ transcript opt-in) và Codex (`last_assistant_message` từ Phase 1).

> **Red-team (xem plan.md):** Claude ĐÃ có waiting qua `Notification` (idle/permission) → question-detection Claude trùng một phần + phụ thuộc opt-in. **Codex là người hưởng lợi chính** (Codex turn-complete không phân biệt hỏi/xong). Ưu tiên Codex; phần Claude optional.

## Requirements

- **Functional:**
  - Hàm pure `looks_like_question(text) -> bool`: true khi câu CUỐI là câu hỏi (kết thúc `?`) hoặc mở đầu bằng question-starter ("which/what/how/should i/do you/want me to/shall i/would you/can you/could you/are you"), TRỪ các đuôi "let me know if/feel free to/just let me know…" (completion summary vẫn = done).
  - Trong `main.rs`: sau dispatch + (Claude) `maybe_enrich`, nếu `state==Done` && `last_message` có && `looks_like_question(last_message)` ⇒ `state=Waiting`.
  - Hiển thị: khi `waiting` mà KHÔNG có `message` (notification) nhưng có `lastMessage` → dòng `cpt-cmd--ask` hiện `lastMessage` (câu hỏi).
- **Non-functional:** module pure (no IO) — đặt riêng, KHÔNG nhét vào `map_*` (giữ purity cho `#[path]` tests); áp dụng ở orchestrator; emit đúng **1 state cuối** (không done-rồi-waiting).

## Architecture

- **Create `crates/copet-hook/src/question_detect.rs`** (pure): `looks_like_question`, `last_sentence`, hằng `QUESTION_STARTERS`, `OPTIONAL_FOLLOW_UPS`. Port 1:1 từ agentpet `windows/src-tauri/src/transcript.rs` (đã đọc, logic ổn định).
- **`main.rs`**: thêm `mod question_detect;` + hàm seam testable `apply_question_detection(&mut AgentEvent)` gọi sau enrich/dispatch. Cả 2 agent dồn narration vào `event.last_message` → 1 chỗ áp dụng.
  - Claude: `last_message` chỉ có khi `read_transcript` opt-in BẬT (privacy). Ghi rõ ràng buộc; khi tắt → không detect (giữ Done).
  - Codex: `last_message` inline từ Phase 1 → luôn detect.
- **Frontend `src/pet/tooltip-render.ts` `commandLine`**: nhánh `waiting` — `s.message ?? s.lastMessage` (escape). `SessionList.tsx` tương tự nếu cần.
- **Phụ thuộc:** Phase 1 (Codex `last_message`). Claude dùng enrichment sẵn có.

## Related Code Files

- **Create:** `crates/copet-hook/src/question_detect.rs`
- **Modify:** `crates/copet-hook/src/main.rs` (mod + `apply_question_detection` + wire)
- **Modify:** `src/pet/tooltip-render.ts` (`commandLine` waiting → lastMessage fallback)
- **Modify:** `src/pet/__tests__/tooltip-render.test.ts`
- **(Optional) Modify:** `src/ui/shared/SessionList.tsx` nếu waiting line cần đồng bộ

## Implementation Steps (tests-first)

1. **Test đỏ (pure):** trong `question_detect.rs` `#[cfg(test)]`: "Which file should I edit?"→true; "Want me to continue?"→true; "I've completed the refactoring."→false; "Done. Let me know if you want changes."→false (optional follow-up); ""→false; câu hỏi giữa nhưng câu cuối là statement→false.
2. **Impl `question_detect.rs`** cho test xanh.
3. **Test đỏ (orchestrator seam):** `apply_question_detection` trên event `Done`+`last_message`="...?" ⇒ `Waiting`; `Done`+last_message statement ⇒ giữ `Done`; `Done`+last_message None ⇒ giữ `Done`.
4. **Impl wire** trong `main.rs` (gọi sau enrich, trước `send_event`).
5. **Test đỏ (FE):** `renderTooltipHtml` với session `waiting`, `message=null`, `lastMessage="Which option?"` → output chứa "Which option?" trong `cpt-cmd--ask`, đã escape.
6. **Impl `commandLine`** waiting fallback.
7. **Xanh:** `cargo test --workspace`, `cargo clippy ... -D warnings`, `pnpm test`, `pnpm exec tsc --noEmit`.

## Success Criteria

- [ ] `looks_like_question` đúng trên bộ test (hỏi vs statement vs follow-up vs rỗng).
- [ ] Event Stop+narration-hỏi → Waiting; Stop+statement → Done; emit 1 state cuối.
- [ ] Pet/HUD báo "waiting" khi agent hỏi; dòng hiển thị câu hỏi (escaped).
- [ ] Ràng buộc Claude opt-in được ghi rõ; Codex hoạt động không cần opt-in.
- [ ] cargo + pnpm test/tsc/clippy xanh.

## Risk Assessment

- **State Done→Waiting ripple** (TB-cao): ảnh hưởng pet mood + notification + timer reset. Verify SessionTracker xử lý chuyển state đúng; emit 1 lần (không double-fire). Kiểm bằng test session-tracker hiện có.
- **False positive/negative** (TB): URL/đường dẫn chứa "?"; câu statement kết bằng "?" hiếm. Mitigate bằng `last_sentence` + `OPTIONAL_FOLLOW_UPS` (đã có trong port).
- **Claude phụ thuộc opt-in** (constraint, không phải bug): tài liệu hoá; cân nhắc về sau bật transcript-read tối thiểu chỉ-cho-detect (ngoài scope).
- **SubagentStop**: subagent hỏi hiếm khi cần user; cân nhắc chỉ áp dụng cho `Stop` chính (chốt khi impl).
