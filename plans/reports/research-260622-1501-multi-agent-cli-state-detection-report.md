# Multi-Agent CLI State Detection — Research Report
Date: 2026-06-22 | Project: Copet (Tauri v2 desktop pet)

---

## 1. Tóm tắt

Copet cần nhận state từ nhiều AI agent CLI (Claude Code, Codex, Gemini CLI, Cursor) và hiển thị dưới dạng pet animation (working / waiting / done). Ba hướng khả thi: (a) **hook script → Unix socket/named pipe → Rust core**, (b) **MCP server**, (c) **universal process wrapper**. Claude Code có hook system đầy đủ nhất; Gemini CLI đang bắt kịp; Codex CLI có hooks nhưng tập trung TUI; Cursor hooks chỉ hoạt động trong IDE (không có CLI hooks). Đề xuất: dùng hook→socket làm luồng chính, MCP làm optional transport, universal wrapper làm fallback.

---

## 2. Agent → Cơ chế phát hiện → State pet

| Agent | Cơ chế chính | Hook/Event cụ thể | Pet state |
|---|---|---|---|
| **Claude Code** | Shell command hooks (stdin JSON) | `PreToolUse` → **working** | working |
| | | `Notification[idle_prompt]` → waiting | waiting |
| | | `Stop` / `SessionEnd` → done | done |
| | | `UserPromptSubmit` → processing started | working |
| | | `SubagentStart/Stop` → sub-task track | working/done |
| | | `Notification[permission_prompt]` → needs input | waiting |
| **Codex CLI** | Shell command hooks + TUI notifications | `preToolUse` → working | working |
| | | `tui.notifications[approval-requested]` → waiting | waiting |
| | | `tui.notifications[agent-turn-complete]` → done | done |
| | | `notify` config (external program) → fire on events | all states |
| **Gemini CLI** | Hook system v1 (config YAML/JSON) | `BeforeAgent`/`BeforeTool` → working | working |
| | | `AfterModel` (waiting LLM) → waiting | waiting |
| | | `AfterAgent` → done | done |
| | | `Notification` hook → notification forward | all states |
| **Cursor** | `hooks.json` (IDE only, not CLI) | `preToolUse`/`subagentStart` → working | working |
| | | `stop`/`sessionEnd` → done | done |
| | **Fallback**: parse stdout/stderr | Cursor CLI: không có hooks → wrap process | limited |
| **Any CLI** | Universal wrapper `agentpet run -- <cmd>` | Process running → working; exit 0 → done | working/done |

### Claude Code — Chi tiết payload JSON (stdin)

```json
{
  "session_id": "abc123",
  "hook_event_name": "PreToolUse",
  "cwd": "/project",
  "permission_mode": "default",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" },
  "agent_id": "sub-agent-uuid",
  "agent_type": "general-purpose"
}
```

Notification payload thêm: `"notification_type": "idle_prompt"`, `"message": "..."`.

### settings.json format (Claude Code)

```json
{
  "hooks": {
    "PreToolUse": [{ "hooks": [{ "type": "command", "command": "/usr/local/bin/copet-hook" }] }],
    "Stop":       [{ "hooks": [{ "type": "command", "command": "/usr/local/bin/copet-hook" }] }],
    "Notification": [{ "matcher": "idle_prompt|permission_prompt",
                        "hooks": [{ "type": "command", "command": "/usr/local/bin/copet-hook" }] }]
  }
}
```

Hook script đọc JSON từ stdin, ghi event → Unix socket. Exit 0 = pass-through (không block).

---

## 3. Kiến trúc đề xuất

```
┌─────────────────────────────────────────────────────────────┐
│                    USER MACHINE                             │
│                                                             │
│  ┌──────────┐   hook script    ┌─────────────────────────┐ │
│  │Claude    │─ stdin JSON ─────►  copet-hook (tiny Rust   │ │
│  │Code      │                  │  CLI ~500KB sidecar)    │ │
│  └──────────┘                  │  • parse JSON stdin     │ │
│                                │  • map event → state    │ │
│  ┌──────────┐   hook script    │  • write to socket      │ │
│  │Codex CLI │─ stdin JSON ─────►                         │ │
│  └──────────┘                  └────────────┬────────────┘ │
│                                             │               │
│  ┌──────────┐   hook script                 │ JSON line     │
│  │Gemini CLI│─ stdin JSON ─────────────────►│               │
│  └──────────┘                               ▼               │
│                                  ┌──────────────────────┐  │
│  ┌──────────┐  process wrap      │  UNIX socket daemon  │  │
│  │Cursor/   │─ stdout parse ─────►  /tmp/copet-{uid}.sock│  │
│  │any CLI   │                    │  (Win: named pipe)   │  │
│  └──────────┘                    └──────────┬───────────┘  │
│                                             │               │
│              MCP (optional)                 ▼               │
│  ┌──────────┐  MCP tool calls   ┌──────────────────────┐  │
│  │Agent với │──────────────────►│  Tauri v2 Rust core  │  │
│  │MCP conf. │                   │  • tokio::net listen  │  │
│  └──────────┘                   │  • emit Tauri event   │  │
│                                 └──────────┬───────────┘  │
│                                            │               │
│                                            ▼               │
│                                 ┌──────────────────────┐  │
│                                 │  WebView (pet UI)     │  │
│                                 │  Tauri emit → JS event│  │
│                                 │  → switch animation   │  │
│                                 └──────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Event mapping (hook → socket payload)

```json
{ "agent": "claude-code", "session_id": "abc", "state": "working",
  "tool": "Bash", "ts": 1750000000 }
```

States: `working` | `waiting` | `done` | `idle`

### Gamification token counter

Claude Code `PostToolUse` payload có thể include `usage` từ transcript path (`.jsonl`). Parse `~/.claude/logs/*.jsonl` để đếm token/session → XP feed.

---

## 4. So sánh kiến trúc

| Tiêu chí | Hook → Socket | MCP server | Universal wrapper |
|---|---|---|---|
| **Độ chính xác state** | Cao (per-event) | Cao (agent chủ động report) | Thấp (working/done only) |
| **Setup phía user** | Thêm hook vào settings.json | Thêm MCP config | Đổi alias/script |
| **Cross-platform** | Socket: cần `interprocess` crate | HTTP fallback dễ hơn | Đơn giản nhất |
| **Phụ thuộc agent** | Mỗi agent format khác nhau | Agent phải hỗ trợ MCP | Không phụ thuộc |
| **Maturity** | Claude ✅ Gemini ✅ Codex ✅ Cursor ⚠️ | OpenPets đang dùng | AgentPet dùng |
| **Latency** | <5ms | <10ms (localhost) | ~0 (process-level) |

**Kết luận**: Hook → Socket là primary (chính xác, real-time). MCP là secondary optional. Wrapper là fallback cho Cursor CLI và unknown agents.

### IPC: nên dùng gì trong Rust/Tauri?

`interprocess` crate (kotauskas/interprocess): cross-platform local socket, Tokio async, dùng Unix domain socket trên macOS/Linux và named pipe trên Windows. Đây là lựa chọn duy nhất đủ tiêu chuẩn cho Copet (cross-platform, Tokio, no network stack).

### `copet-hook` binary

- Viết bằng **Rust** (single static binary ~500KB, zero runtime dep)
- Đọc stdin JSON → parse event → write JSON line to socket
- Install path: `~/.copet/bin/copet-hook` (symlink vào PATH)
- User chỉ cần thêm 1 dòng vào `~/.claude/settings.json`

---

## 5. Rủi ro

| Rủi ro | Mức | Giải pháp |
|---|---|---|
| Cursor CLI không có hooks | Cao | Wrapper process; theo dõi feature request cursor forum |
| Gemini CLI hook API còn trẻ (v1, 2026) | Trung bình | Test kỹ; fallback wrapper |
| Socket path conflict (multi-user) | Thấp | Dùng `/tmp/copet-{uid}.sock` với UID suffix |
| Hook script bị block agent | Trung bình | Luôn exit 0; hook async mode; timeout ngắn |
| Windows named pipe permission | Thấp | `interprocess` xử lý; test trên Windows CI |
| Codex hooks GA March 2026 | Thấp | Stable; đã ship v0.117+ |

---

## 6. Nguồn

- [Claude Code Hooks Reference (official)](https://code.claude.com/docs/en/hooks)
- [Claude Code Agent SDK Hooks](https://code.claude.com/docs/en/agent-sdk/hooks)
- [Codex CLI Hooks — OpenAI Developers](https://developers.openai.com/codex/hooks)
- [Codex CLI Features](https://developers.openai.com/codex/cli/features)
- [Gemini CLI Hooks docs](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md)
- [Gemini CLI Discussion v0.26.0 (Skills+Hooks)](https://github.com/google-gemini/gemini-cli/discussions/17812)
- [Cursor Hooks docs](https://cursor.com/docs/hooks)
- [Cursor 1.7 Hooks — InfoQ](https://www.infoq.com/news/2025/10/cursor-hooks/)
- [AgentPet — ntd4996/agentpet (GitHub)](https://github.com/ntd4996/agentpet)
- [OpenPets — alterhq/openpets (GitHub)](https://github.com/alterhq/openpets)
- [interprocess crate (Rust)](https://github.com/kotauskas/interprocess)
- [IPC Pipe vs Unix Socket in Tauri — DEV](https://dev.to/hiyoyok/ipc-pipe-vs-unix-socket-for-a-resident-daemon-in-tauri-what-i-learned-fa6)

---

## 7. Câu hỏi mở

1. Cursor CLI hooks: có kế hoạch ship không? (feature request đang mở tại cursor forum, Jan 2026)
2. Token counting: `PostToolUse` payload có bao gồm `usage.input_tokens` không, hay phải parse `.jsonl` transcript riêng?
3. Gamification XP formula: đếm theo số tool calls, số token, hay wall-clock time?
4. Multi-instance: user chạy 3 Claude Code tab cùng lúc → socket cần multiplex session_id, UI hiển thị như thế nào?
5. Codex CLI `notify` config: external program nhận payload qua stdin hay argv?

---

Status: DONE_WITH_CONCERNS
Summary: Đã map đầy đủ hook mechanism của 4 agent CLI; kiến trúc hook→socket→Tauri được xác nhận qua AgentPet/OpenPets precedent; Cursor CLI là blind spot duy nhất.
Concerns/Blockers: Cursor CLI hiện không có hooks (IDE-only); Gemini CLI hooks v1 còn mới (2026), API có thể thay đổi.
