---
title: Agent narration display (Codex/Claude/Gemini)
description: >-
  Hiển thị 'lời tường thuật assistant' (prose) cho mỗi session thay vì chỉ tên
  tool. Lấy narration Codex qua Stop-hook last_assistant_message, thêm
  question-detection (Stop+hỏi ⇒ waiting), bù tool description Claude, Gemini
  qua wrapper, và themed activity phrases.
status: pending
priority: P2
branch: feat/agent-narration-display
tags:
  - rust
  - hook
  - protocol
  - codex
  - claude
  - gemini
  - frontend
  - tdd
  - narration
blockedBy: []
blocks: []
created: '2026-06-24T08:26:09.929Z'
createdBy: 'ck:plan'
source: skill
---

# Agent narration display (Codex/Claude/Gemini)

## Overview

Mục tiêu: popup/HUD hiển thị **lời tường thuật assistant** (prose agent vừa nói) thay cho chỉ tên tool ("Bash"). Dựa trên research (`plans/reports/deep-research-260624-1518-*` + `plans/reports/xia-compare-260624-1423-*`):

- **Claude** narration ĐÃ chảy tới UI (`last_message`, từ plan đã DONE `260623-1033-session-info-enrichment`). Gap còn lại: Codex/Gemini + question-detection + polish.
- **Codex** có đường sạch nhất: Stop/SubagentStop hook đẩy `last_assistant_message` inline → đổ vào `last_message` (cùng kênh hook Copet đã có, không đọc file). **Leapfrog agentpet** (repo mẫu KHÔNG làm narration cho Codex).
- **Question-detection**: chính `last_assistant_message`/`last_message` cho phép phát hiện agent kết thúc bằng câu hỏi → đổi `done`→`waiting` ("cần input"), đúng pain point Copet (hiện map `Stop→Done` cứng).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Codex narration via Stop hook](./phase-01-codex-narration-via-stop-hook.md) | Completed |
| 2 | [Question detection waiting state](./phase-02-question-detection-waiting-state.md) | Pending |
| 3 | [Claude tool description enrichment](./phase-03-claude-tool-description-enrichment.md) | Pending |
| 4 | [Gemini narration via wrapper](./phase-04-gemini-narration-via-wrapper.md) | Pending |
| 5 | [Themed activity phrases](./phase-05-themed-activity-phrases.md) | Pending |

**Thứ tự đề xuất:** 1 → 2 (Phase 2 phần Codex phụ thuộc Phase 1) → 3 → 5 → **4 cuối** (rủi ro cao nhất, giá trị thấp nhất). Phase 3/4/5 độc lập nhau.

## Dependencies

- **Xây trên plan đã DONE** `260623-1033-session-info-enrichment`: contract `AgentEvent.last_message` (Rust `crates/copet-protocol/src/lib.rs` ⇄ TS `src/types/agent-event.ts`) + pipeline `SessionTracker → SessionSnapshot → render` đã ship. **KHÔNG cross-plan blocking** (plan kia completed).
- Phase 2 (Codex) blockedBy Phase 1. Phase 2 (Claude) dùng `transcript::maybe_enrich` sẵn có.

## Shared Contract (KHÔNG đổi shape)

`last_message: Option<String>` ĐÃ tồn tại trong `AgentEvent` (Rust + TS mirror) và đã flow tới UI. **Không thêm field mới** → không cần đụng dual-source sync cho narration:
- Phase 1: Codex đổ `last_assistant_message` → `last_message` (field cũ).
- Phase 3: `tool_input.description` gộp vào `tool_input` (string cũ), không thêm field.
- Phase 4: wrapper đổ `.response` → `last_message` (field cũ).
- Phase 5: thuần frontend, không đụng protocol.

→ Mọi event cũ + agent không cấp narration vẫn chạy (graceful null). Nếu một phase quyết định thêm field mới, MỚI phải sync `copet-protocol/src/lib.rs` ⇄ `src/types/agent-event.ts` (additive, `#[serde(default)]` + `| null`) — xem gotcha CLAUDE.md.

## Key Decisions

- **Đặt question-detection ở orchestrator (`main.rs`), KHÔNG trong `map_*`** — gotcha: `map_claude/codex/gemini.rs` phải pure (no IO/sibling deps) vì integration tests pull qua `#[path]`. Module `question_detect.rs` pure đứng riêng; `main.rs` áp dụng đồng nhất sau khi cả 2 agent dồn narration vào `event.last_message`.
- **Codex là nguồn narration tin cậy nhất** (inline, documented). Claude narration vẫn **opt-in** (đọc transcript, privacy) → question-detection Claude chỉ chạy khi user bật `read_transcript`. Codex luôn chạy.
- **Reconcile schema Codex thật trước khi build** (Phase 1): `map_codex.rs` hiện parse `event:"preToolUse"`/`"tui.notifications"`; research chỉ ra Codex thật dùng `hook_event_name` + Stop/SubagentStop + `last_assistant_message` + cần `[features] hooks=true`. Phase 1 mở bằng spike capture payload thật.
- **Narration là end-of-turn** (lúc Stop) → hợp hiển thị khi `state=done/waiting`, không phải realtime mid-turn.
- **Precedence dòng working** (giải mâu thuẫn Phase 3 ⇄ Phase 5 — cả 2 cùng ghi `cpt-cmd`): thứ tự ưu tiên = `tool_input.description` (Phase 3, cụ thể nhất) → themed phrase (Phase 5, generic) → tên tool thô. `tool_input` (command/file) vẫn append sau nhãn. Cả Phase 3 & 5 phải tuân precedence này.
- **Privacy nhất quán narration** (giải bất đối xứng Claude opt-in vs Codex default): Claude narration gated `read_transcript` (đọc file). Codex `last_assistant_message` đến inline (agent tự đẩy, không đọc file) nên ít xâm phạm hơn — NHƯNG vẫn là nội dung hội thoại lên màn hình. **Quyết định:** hiển thị narration (mọi agent) tôn trọng 1 setting chung "Hiển thị nội dung hội thoại"; mặc định theo setting `read_transcript` hiện có để không lộ ngoài ý muốn. Chốt ở validation (Open Question #5).

## Red-Team & Validation Notes (đã chạy — deep mode)

- **[Phase 2 — value]** Claude ĐÃ có tín hiệu waiting qua `Notification` (`idle_prompt`/`permission_prompt` → Waiting). Question-detection Claude **trùng một phần** → giá trị biên thấp + lại phụ thuộc opt-in. **→ Codex là người hưởng lợi chính** (Codex `agent-turn-complete`→Done không phân biệt hỏi/xong). Phase 2 ưu tiên Codex; phần Claude là optional/secondary.
- **[Phase 1 — blocker thật]** Nếu spike phát hiện `map_codex` hiện KHÔNG khớp Codex thật → **Codex support hiện tại có thể đang hỏng**, Phase 1 phình thành "viết lại tích hợp Codex" chứ không chỉ "thêm Stop". Chấp nhận: spike quyết định độ lớn; báo lại trước khi code.
- **[Phase 4 — YAGNI]** Giá trị thấp + rủi ro cao + nguy cơ Gemini CLI bị khai tử. Giữ ở cuối, gate sau `--capture`; sẵn sàng **bỏ** nếu spike deprecation xác nhận sunset.
- **[Docs]** Khi xong: cập nhật `docs/system-architecture.md`, `docs/codebase-summary.md`, `docs/agent-hook-setup.md` (behavior + hook Codex đổi). Thêm vào bước cuối mỗi phase liên quan.

## Cross-cutting Risks

- **Schema Codex drift/uncertainty** (Phase 1): cao — mitigate bằng spike + fixture từ payload thật, giữ test xanh trước khi đổi install.
- **State `Stop→Waiting`** (Phase 2): ripple sang pet mood + notification (tránh double-fire done-rồi-waiting). Emit đúng 1 state cuối.
- **`copet-run` capture stdout** (Phase 4): phá vỡ passthrough trong suốt nếu làm sai → tee + gate sau cờ tường minh.
- **Escape HTML** (Phase 2/5): narration/phrase là agent-controlled → `escHtml` bắt buộc (gotcha `tooltip-render.ts`).

## Out of Scope

- Đọc rollout/checkpoint file của Codex/Gemini (internal/unstable) — chỉ dùng đường chính thống.
- Narration realtime mid-turn (không khả thi ổn định cho cả 3).
- Gemini narration cho session interactive (không có hook field; chỉ wrapper).

## Success Criteria (toàn plan)

- [ ] Codex session: khi agent xong lượt, `last_message` = câu assistant vừa nói (hiển thị ở HUD/hover).
- [ ] Agent kết thúc bằng câu hỏi → pet/HUD báo `waiting` ("cần input"), không phải `done`.
- [ ] Claude working line đọc dễ hơn (description khi có).
- [ ] `copet-run -- gemini ... --output-format json` → narration cuối hiện ra (best-effort).
- [ ] Tool thô được thay bằng cụm từ dễ đọc ở dòng hiển thị.
- [ ] `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `pnpm exec tsc --noEmit`, `pnpm test` đều xanh.

## Open Questions

1. ✅ **RESOLVED (spike 2026-06-24, codex-cli 0.134.0)**: Codex dùng `hook_event_name` PascalCase (`Stop`/`SubagentStop`/`PreToolUse`/`PermissionRequest`/...); config hook ở `~/.codex/hooks.json` (ClaudeNested) + `[features] hooks=true` — KHÔNG phải YAML. → **Copet Codex support hiện đang hỏng; Phase 1 thành viết-lại tích hợp.** Còn lại: field `last_assistant_message` confirmed bởi research, chưa capture runtime (degrade an toàn → None nếu sai).
2. **Phase 3 UX**: hiện `description` ("run tests") hay `command` ("pnpm test") cho Bash? (default plan: ưu tiên description, fallback command).
3. **Phase 4**: auto-detect `--output-format json` hay gate sau cờ tường minh `copet-run --capture`? (default: gate tường minh để an toàn passthrough).
4. **Gemini deprecation**: xác nhận Gemini CLI có bị thay bởi Antigravity CLI ~giữa 2026 trước khi đầu tư Phase 4.
5. **Privacy narration**: Codex narration (inline) có cần gate sau setting "Hiển thị nội dung hội thoại" như Claude không, hay default-on chấp nhận được? (default plan: gate chung để nhất quán privacy).
