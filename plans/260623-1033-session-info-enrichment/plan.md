---
title: "Session info enrichment (Group C+D)"
description: "Hiển thị thêm thông tin mỗi session: tool input / cwd / notification / prompt (hook), và model / task summary / last message / tokens (đọc transcript Claude). Mở rộng tính năng running-sessions list."
status: done
priority: P3
branch: "feat/running-sessions-multi-surface"
tags: [tauri, rust, protocol, hook, transcript, privacy, enrichment]
blockedBy: []
blocks: []
created: "2026-06-23T03:44:30.025Z"
createdBy: "ck:plan"
source: skill
---

# Session info enrichment (Group C+D)

## Overview

Mở rộng "running sessions list" (đã ship: `plans/260623-0913-running-sessions-multi-surface/`) để mỗi session hiển thị nhiều thông tin hơn — giống FleetView của Claude Code (ảnh #6: model + tóm tắt task). Chia 2 phase theo chi phí:
- **Phase 1 (Nhóm C)**: thông tin trong hook payload nhưng chưa parse — KHÔNG đọc file. Đổi protocol + `map_*`.
- **Phase 2 (Nhóm D)**: model + task summary + tokens — phải **đọc `transcript_path`** (JSONL), **chỉ Claude Code**, có **vấn đề riêng tư** → opt-in.

Đây là feature post-ship; hiện đang **pending**, chưa triển khai.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Hook payload enrichment](./phase-01-hook-payload-enrichment.md) | ✅ Done (2026-06-23) |
| 2 | [Transcript enrichment for Claude](./phase-02-transcript-enrichment-for-claude.md) | ✅ Done (2026-06-23) |

## Dependencies

Xây trên plan đã hoàn tất `260623-0913-running-sessions-multi-surface` (SessionTracker, SessionSnapshot, SessionList, renderTooltipHtml, broadcast). KHÔNG cross-plan blocking (plan kia đã completed). Phase 2 phụ thuộc Phase 1 (mở rộng cùng `AgentEvent` + render).

## Shared Contract (mở rộng — additive, backward-compatible)

`AgentEvent` (Rust `crates/copet-protocol/src/lib.rs` + mirror `src/types/agent-event.ts`) thêm field **optional** (giữ `Option<...>` / `| null`, default null → không vỡ event cũ):

```
// Phase 1 (hook payload):
tool_input?: string | null     // lệnh Bash / file Edit-Read cụ thể
cwd_full?:   string | null     // đường dẫn cwd đầy đủ (hiện chỉ basename)
message?:    string | null     // text notification/permission ("chờ cấp quyền Bash")
prompt?:     string | null     // câu user vừa gõ (UserPromptSubmit)

// Phase 2 (transcript, Claude only):
model?:        string | null   // claude-sonnet-4-x / opus
summary?:      string | null   // task title / tóm tắt
last_message?: string | null   // tin nhắn assistant cuối (ảnh #6 body)
tokens_in?:    number | null
tokens_out?:   number | null
```

Mọi field mới CHẢY qua `SessionTracker` → `SessionSnapshot` → render (SessionList + renderTooltipHtml), hiển thị khi có (graceful null).

## Out of Scope

- Nhóm E (wrapper/process: PID, CPU/mem) — ít giá trị chung, để sau.
- Lưu lịch sử để vẽ sparkline (Nhóm F) — cần persistence, để sau.

## Key Decisions

- **Privacy opt-in (Phase 2)**: đọc transcript = đọc nội dung hội thoại → mặc định **TẮT**, bật trong Settings ("Hiển thị model + tóm tắt task"). Giới hạn độ dài summary/last_message; không log raw.
- **Additive protocol**: chỉ thêm field optional → hook/event cũ vẫn chạy; Codex/Gemini/wrapper để null các field Claude-only.
- **Hiệu năng (Phase 2)**: KHÔNG đọc transcript mỗi tool_call. Đọc throttled (vd chỉ trên Stop/Notification, hoặc tối đa mỗi N giây/session), parse phần đuôi JSONL.

## Open Questions

- ✅ **(Phase 1, resolved 2026-06-23)** Field hiển thị: cả 4 (tool_input, full cwd, notification text, user prompt).
- ✅ **(Phase 1, resolved)** Layout: "compact pet, rich HUD" — pet tooltip gọn (enriched tool line + notification text; cwd/prompt vào hover title); HUD/popover thêm dòng detail.
- ✅ **(Phase 2, resolved 2026-06-23)** Đọc transcript ở `copet-hook` (Rust), trong `transcript.rs` gọi từ `main.rs` (giữ map_claude pure). Opt-in qua `~/.copet/hook-config.json`. Throttle = bounded 256KB tail-read. Summary lấy từ `ai-title` (schema thật, không có dòng `summary`).
