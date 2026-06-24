# Xia Compare: agentpet "message hiển thị" vs Copet `Bash` — cách lấy & hiển thị

**Mode:** `--compare` (phân tích, chưa implement) · **Ngày:** 2026-06-24

## Source manifest
- Repo: `ntd4996/agentpet` (https://github.com/ntd4996/agentpet)
- Branch/SHA: `main` @ `5f4fb9d6d065988015ff20b6e1bec4477a2dbf51`
- Stack: Swift/SwiftUI (macOS, canonical) + **Windows port Tauri+Rust** (`windows/src-tauri/`) — phần Windows trùng stack Copet.
- Scope đọc: `windows/src-tauri/src/{transcript,hooks,statemap,cli,server}.rs`, `windows/src/{activity,state,popover,bubble}.ts`, `Sources/AgentPetCore/{TranscriptReader,ActivityFormatter,QuestionDetector}.swift`.

---

## TL;DR — trả lời trực tiếp câu hỏi

> "Có lấy được **lời tường thuật của assistant** để đưa vào popup thay cho `Bash` không?"

**Về kỹ thuật: CÓ — nhưng CHỈ cho Claude Code, và chính agentpet (repo tham chiếu) đã CỐ Ý KHÔNG hiển thị narration.**

3 sự thật ngược với giả định ban đầu:

1. **agentpet KHÔNG hiển thị assistant narration.** Nó *có đọc* `latest_assistant_text` từ transcript Claude, nhưng chỉ để **phân biệt waiting/done** (`looks_like_question` → Claude kết thúc bằng câu hỏi thì sửa `Stop` thành `waiting`). Text đó **không bao giờ** vào payload UI (`server.rs` chứng minh: payload emit chỉ có `state, tool, file, desc, message, title`).

2. **Thứ agentpet hiển thị "thay cho Bash" là 2 thứ khác, đều RẺ hơn narration:**
   - **`desc` = `tool_input.description`** — nhãn người-đọc Claude tự gắn cho mỗi tool call (vd Bash `description: "run tests"`). Lấy thẳng từ stdin hook, **không cần đọc transcript**. Đây là thứ "gần message hiển thị" nhất.
   - **Cụm từ "whimsical" theo theme** map từ tên tool (Bash → "Brewing…"/"Compiling…", Read → "Inspecting…") — fallback hoạt động cho **mọi agent**, kể cả Codex/Gemini.
   - Headline là **`title`** (tên hội thoại = summary/first-user-msg từ transcript).

3. **Codex & Gemini: KHÔNG có narration.** agentpet **không đọc** rollout/session-log của Codex/Gemini (grep xác nhận: `.codex` chỉ dùng cho `auth.json` usage-limit + bật hooks). Hai agent này chỉ có tool name + event + cwd → chỉ hiển thị được themed phrase / tool name.

➡️ **"Assistant narration" là hướng sai cho mục tiêu hiển thị**: vừa Claude-only, vừa bị chính repo mẫu loại bỏ vì dài/nhiễu. Hướng đúng (mà agentpet dùng) = **`tool_input.description` + themed phrase + conversation title**.

---

## Pipeline agentpet (bản Windows/Rust — port thẳng được sang Copet)

```
agent hook → `agentpet hook --agent <kind>` (cli.rs)
  ├─ đọc stdin JSON, thử nhiều convention field (first_str)
  ├─ trích: event, session, project(cwd), message, tool,
  │         file=tool_input.file_path, desc=tool_input.description,
  │         transcript=transcript_path
  └─ POST localhost:47628 → server.rs
       ├─ statemap::state(kind,event) → working|waiting|done|registered|idle
       ├─ NẾU claude & Stop: đọc transcript (đường dẫn từ payload hoặc inferred_path)
       │     ├─ title()                = summary | first user msg (≤60 ký tự, cache)
       │     └─ latest_assistant_text() → looks_like_question() → done?→waiting
       └─ emit "agent-event" {state, tool, file, desc, message, title, ...}
            → UI: state.ts dựng `live = desc || activityMessage(tool…) || message`
                  popover.ts hiển thị `title || live || state`
```

**Điểm khác mấu chốt với Copet:** agentpet tách `tool_input.description` thành field `desc` riêng và **ưu tiên hiển thị nó**. Copet `summarize_tool_input` (map_claude.rs) chỉ lấy `command → file_path → pattern → url`, **bỏ qua `description`** → Copet hiện hiện "pnpm test" chỗ agentpet hiện "run tests".

---

## Head-to-head: dữ liệu mỗi bên lấy được

| Khía cạnh | agentpet | Copet (hiện tại) | Ghi chú |
|---|---|---|---|
| Tool name | ✅ | ✅ (`tool`) | ngang nhau |
| Tool arg (command/file/url) | ✅ (`file` + `desc`) | ✅ (`tool_input`, 1 chuỗi) | Copet gộp 1 field |
| **Tool `description`** (nhãn người-đọc) | ✅ **ưu tiên hiển thị** | ❌ **không lấy** | khác biệt lớn, dễ bù |
| Notification/permission text | ✅ (`message`) | ✅ (`message`) | ngang |
| Conversation title/summary | ✅ (`title`, đọc transcript) | ✅ (`summary`, opt-in transcript) | ngang |
| **Assistant narration** | ✅ đọc, **KHÔNG hiển thị** (chỉ detect question) | ✅ đọc (`last_message`), opt-in | Copet đã có sẵn! |
| Themed/humanized activity phrase | ✅ 5 theme, per-tool pool | ❌ | UI nicety, không cần agent data |
| Question-detection (Stop→waiting) | ✅ `looks_like_question` | ❌ | Copet map Stop→done cứng |
| Hook events / agent | nhiều hơn (xem dưới) | ít hơn | Copet thiếu PostToolUse, SubagentStop… |

### Coverage hook events
| Agent | agentpet | Copet |
|---|---|---|
| Claude | SessionStart, UserPromptSubmit, PreToolUse, **PostToolUse**, Notification, Stop, SubagentStop, SessionEnd | PreToolUse, UserPromptSubmit, SubagentStart, Notification, Stop, SessionEnd |
| Codex | SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, **PermissionRequest**, Stop, SubagentStop | preToolUse, tui.notifications (approval/turn-complete) |
| Gemini | SessionStart, BeforeAgent, BeforeTool, **AfterTool**, Notification, AfterAgent, SessionEnd | BeforeAgent, BeforeTool, AfterModel, AfterAgent |

---

## 4 ứng viên "message hiển thị" — khả thi theo từng agent

| Ứng viên | Claude | Codex | Gemini | Nguồn | Chi phí |
|---|---|---|---|---|---|
| **A. Tool `description`** ("run tests") | ✅ stdin hook | ⚠️ Codex thường không gửi field này | ⚠️ không chắc | `tool_input.description` | **Rẻ nhất**, không đọc file |
| **B. Themed phrase** ("Brewing…") | ✅ | ✅ | ✅ | map từ tool name (client-side) | Rẻ, thuần UI |
| **C. Conversation title** | ✅ transcript | ❌ (agentpet không đọc) | ❌ | JSONL summary | TB, đọc file (Copet đã có) |
| **D. Assistant narration** (yêu cầu ban đầu) | ✅ (`last_message`, Copet đã có) | ❌ | ❌ | JSONL `type:assistant` | Cao, dài/nhiễu, Claude-only |

Kết luận khả thi: muốn **đồng nhất cả 3 agent** → chỉ **B** phủ được hết. Muốn **giàu thông tin cho Claude** → **A** (rẻ) hoặc **C** (đã có). **D** (narration) chỉ Claude và bị repo mẫu né.

---

## Challenge questions (xia Phase 4)

1. **"Narration sẽ là text hiển thị tốt?"** — Source: agentpet đọc narration nhưng *từ chối hiển thị*, chỉ dùng detect question. Local: Copet có `last_message` nhưng cũng chưa show. **Rủi ro nếu sai:** narration của assistant dài 100–400+ ký tự, nhiều markdown/đa dòng → vỡ layout popup vốn 1 dòng; phải escape HTML (XSS từ agent-controlled string, đúng gotcha `tooltip-render.ts`).

2. **"Lấy được narration cho Codex/Gemini không?"** — Source: KHÔNG, agentpet không đọc log 2 agent này. Local: Copet mapper Codex/Gemini để `last_message: None`. **Rủi ro:** nếu hứa "narration cho cả 3" → bế tắc kỹ thuật; Codex rollout (`~/.codex/sessions/**/rollout-*.jsonl`) tồn tại nhưng format không tài liệu hóa, dễ vỡ khi Codex đổi.

3. **"`tool_input.description` có phổ quát?"** — Source: agentpet ưu tiên `desc`, nhưng `description` là field schema **riêng của tool Claude** (Claude tự sinh cho Bash). Local: Copet bỏ qua nó. **Rủi ro:** Codex/Gemini không gửi `description` → field rỗng → vẫn phải fallback themed phrase. Đừng kỳ vọng `desc` cứu được Codex/Gemini.

4. **"Đọc transcript có chấp nhận được?"** — Source: agentpet đọc JSONL trên Stop (off-thread, ≤128KB cuối, cache summary). Local: Copet đã có `transcript.rs` enrichment opt-in y hệt. **Rủi ro:** thấp cho Claude (đường dẫn ổn định `~/.claude/projects/<sanitized-cwd>/<id>.jsonl`); cao nếu mở sang agent khác.

5. **"Question-detection có đáng port hơn narration?"** — Source: `looks_like_question` biến Claude `Stop` "có hỏi" thành `waiting` → popup báo "cần input" đúng lúc. Local: Copet map `Stop→Done` cứng → bỏ sót trạng thái "đang chờ bạn". **Rủi ro nếu bỏ qua:** Copet hiển thị "done" trong khi Claude thực ra đang hỏi → đúng pain point README agentpet nhấn mạnh. **Đây có thể là tính năng giá trị hơn cả việc đổi text Bash.**

6. **"Themed phrase có hợp Copet?"** — Source: agentpet 5 theme, xoay vòng per tool. Local: Copet `tooltip-render.ts` hiện literal. **Rủi ro:** thấp; thuần client, không đụng contract `AgentEvent`.

---

## Decision matrix

| Quyết định | Cách agentpet | Khuyến nghị cho Copet |
|---|---|---|
| Text thay "Bash" | `desc` → themed phrase → message | **Bù `tool_input.description` vào `summarize_tool_input`** (rẻ, Claude); thêm themed-phrase fallback client-side cho mọi agent |
| Assistant narration | đọc, KHÔNG show | **Không show làm activity mặc định.** Copet đã có `last_message` → để dành cho HUD/expanded view có cuộn, escape kỹ |
| Narration Codex/Gemini | không làm | **Không theo đuổi** (bế tắc/không tài liệu hóa). Chỉ tool name + themed phrase |
| Waiting chính xác (Stop→hỏi) | `looks_like_question` | **Port — giá trị cao**, hợp pain point Copet |
| Conversation title | đọc transcript | Copet đã có `summary`; cân nhắc đưa lên làm headline popover |

---

## Port guidance (nếu sau này chọn implement)

- **Trùng stack:** lấy `windows/src-tauri/src/transcript.rs` làm tham chiếu — gần như chỉ cần đổi sang struct/style Copet. Copet đã có `crates/copet-hook/src/transcript.rs` tương đương cho phần Claude.
- **Đụng contract:** thêm field `tool_input.description` chỉ là enrichment trong `summarize_tool_input` (map_claude.rs) — **không** đổi `AgentEvent`. Nếu muốn field `desc` riêng thì phải sync `copet-protocol/src/lib.rs` ⇄ `src/types/agent-event.ts` (additive + `#[serde(default)]` + `| null`), theo gotcha dual-source.
- **Themed phrase:** thuần frontend (`src/pet/tooltip-render.ts` / `src/ui/`), không cần Rust.
- **Question-detection:** logic thuần (`looks_like_question`), bỏ vào `map_claude.rs` hoặc transcript enrichment; cần đọc `last_message` (đã có) tại sự kiện `Stop`.

---

## Unresolved questions
1. Bạn vẫn muốn **assistant narration prose** (chấp nhận Claude-only + cần expanded/scroll view), hay đổi mục tiêu sang **`tool_input.description` + themed phrase** (đồng nhất 3 agent, hợp popup 1 dòng) như agentpet?
2. Có muốn tôi tiếp tục **`/deep-research`** ban đầu để soi *liệu Codex/Gemini có cách lấy narration nào khác* (rollout files, `codex exec` JSON, Gemini telemetry) ngoài cách agentpet làm không? (Phát hiện hiện tại: agentpet không làm, nhưng web research có thể tìm đường khác — rủi ro: không tài liệu hóa/dễ vỡ.)
3. Ưu tiên port **question-detection (Stop→waiting)** không? Đây là tính năng giá trị cao tôi tình cờ phát hiện, hợp pain point Copet hơn cả việc đổi text Bash.
