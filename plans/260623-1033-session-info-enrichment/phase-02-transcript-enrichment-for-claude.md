---
phase: 2
title: "Transcript enrichment for Claude"
status: done
priority: P3
dependencies: [1]
effort: "~2d"
---

# Phase 2: Transcript enrichment for Claude (Group D)

## Overview

Hiển thị **model + task summary + tin nhắn cuối + tokens** (giống ảnh #6) bằng cách đọc file `transcript_path` (JSONL hội thoại) mà Claude Code truyền trong hook. **Chỉ Claude Code.** Có vấn đề **riêng tư** (đọc nội dung hội thoại) → **opt-in, mặc định TẮT**.

## Requirements

- Functional: khi opt-in, mỗi session Claude hiện model (sonnet/opus), tóm tắt task, tin nhắn assistant cuối (truncate), tokens in/out.
- Non-functional: KHÔNG đọc transcript mỗi tool_call (throttle); giới hạn độ dài; không log raw; tắt mặc định.

## Architecture

`Claude hook payload có transcript_path → copet-hook đọc đuôi JSONL → trích model (message.model) + last assistant text + summary + usage tokens → AgentEvent (+optional model/summary/last_message/tokens_*) → … → render (rich row, gated opt-in)`.

JSONL: mỗi dòng 1 message `{role, content, model, usage:{input_tokens,output_tokens}}`. Lấy dòng cuối assistant cho model + last_message; summary có thể từ message đầu/tiêu đề nếu Claude ghi.

## Related Code Files

- Modify: `crates/copet-protocol/src/lib.rs` + `src/types/agent-event.ts` — thêm `model/summary/last_message: Option<String>`, `tokens_in/tokens_out: Option<u64>`.
- Create: `crates/copet-hook/src/transcript.rs` — đọc + parse đuôi JSONL, trích field; giới hạn dòng đọc + độ dài; lỗi → bỏ qua (không chặn agent). + tests trên JSONL mẫu.
- Modify: `crates/copet-hook/src/map_claude.rs` — gọi transcript reader khi opt-in env/flag bật + có transcript_path; throttle.
- Modify: render `SessionList.tsx` + `tooltip-render.ts` — hàng "rich": model badge + summary + tokens (khi có).
- Modify: `src/ui/settings/Settings.tsx` + `system_commands.rs` (store) — toggle "Hiển thị model + tóm tắt task (đọc transcript)" mặc định off; truyền opt-in xuống hook (env var / config file mà copet-hook đọc).
- Docs: cập nhật `docs/agent-hook-setup.md` + privacy note.

## Implementation Steps

1. (TDD) Test `transcript.rs` trên JSONL mẫu: trích model + last assistant + tokens; file thiếu/hỏng → None (không panic).
2. Mở rộng `AgentEvent` (+optional) Rust+TS.
3. Viết transcript reader (đọc tail, cap dòng + cap ký tự summary/last_message).
4. Gọi trong map_claude CHỈ khi opt-in + có transcript_path; throttle (vd lưu last-read ts/session).
5. Settings toggle + lưu opt-in; cơ chế copet-hook đọc opt-in (env/config).
6. Render rich row gated opt-in.
7. Verify: cargo test/clippy + pnpm test/tsc; E2E thủ công với session Claude thật.

## Success Criteria

- [x] Opt-in ON + session Claude → hiện model + tóm tắt + tin nhắn cuối + tokens.
- [x] Opt-in OFF (mặc định) → KHÔNG đọc transcript, không hiện field này.
- [x] File transcript thiếu/hỏng → bỏ qua, agent không bị chặn (no panic; default None).
- [x] Codex/Gemini/wrapper không bị ảnh hưởng.
- [x] cargo test/clippy + pnpm test/tsc sạch.

## Implementation Notes (done 2026-06-23)

- **Schema thật khác plan**: KHÔNG có dòng `summary`. Dùng `ai-title.aiTitle` cho summary; model = `assistant.message.model`; tokens = `message.usage` (input + cache_read + cache_creation, output_tokens); last_message = quét ngược tìm assistant có text block (dòng cuối thường chỉ `tool_use`). Đã verify trên transcript thật.
- **transcript.rs** (mới): `read_tail` (đọc tail ≤256KB, bỏ dòng đầu partial) + `parse_transcript` (pure, last-wins) + `maybe_enrich` + `transcript_enabled`. Lỗi → None, không panic, không log nội dung.
- **map_claude giữ pure**: enrichment gọi ở `main.rs` sau dispatch (chỉ agent claude) → giữ `#[path]` integration test biên dịch được.
- **Opt-in**: `copet_config_path()` (protocol) = `~/.copet/hook-config.json` `{"read_transcript":bool}`. App ghi (`set_transcript_optin`: store + file), hook đọc. Env var không qua được ranh giới process agent→hook nên phải dùng file. Settings toggle có cảnh báo riêng tư, mặc định off.
- **Render**: pet = meta line model + tokens (↑/↓), summary/last_message vào hover title; HUD = model badge + tokens + dòng summary, last_message vào title. `session-format.ts` (`formatTokens`, `shortModel`) dùng chung.
- **Throttle** = bounded tail-read (stateless hook không time-throttle dễ).
- Docs: `docs/agent-hook-setup.md` thêm mục enrichment + privacy.
- Review: `plans/reports/from-cook-self-review-260623-1403-phase2-transcript-enrichment-review.md` (Status DONE).

## Risk Assessment

- **Riêng tư**: đọc hội thoại → opt-in mặc định off + cảnh báo rõ trong Settings; cap độ dài; không persist/log raw.
- **Hiệu năng**: đọc file mỗi event sẽ chậm → throttle + đọc tail, không parse cả file lớn.
- **Format transcript đổi**: Claude Code có thể đổi schema JSONL → parser phòng thủ (None khi không khớp), test trên mẫu, theo dõi changelog.
- **Chỉ Claude**: ghi rõ giới hạn; agent khác để null.
