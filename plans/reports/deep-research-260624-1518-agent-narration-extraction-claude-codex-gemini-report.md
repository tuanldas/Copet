# Deep Research: Lấy "assistant narration" từ Claude Code / Codex / Gemini cho popup Copet

**Ngày:** 2026-06-24 · **Phương pháp:** deep-research harness (6 angles, 24 nguồn, 115 claims → 25 verify adversarial 3-vote → 21 confirmed / 4 killed). Tích hợp với báo cáo xia `agentpet` (`plans/reports/xia-compare-260624-1423-*`).

## Câu hỏi
Có lấy được **assistant narration** (prose agent hiển thị cho user, không phải tên tool "Bash") từ Claude Code, Codex CLI, Gemini CLI để đưa vào popup không, và bằng cách nào (file path + format)?

---

## Kết luận đầu (per-agent verdict)

| Agent | Lấy được? | Đường CHÍNH THỐNG nhất cho Copet | Cơ chế |
|---|---|---|---|
| **Claude Code** | ✅ **CÓ** (Copet đã có sẵn) | Đọc transcript JSONL → `last_message` (đã implement) | File-read. Hook **chỉ** đưa `transcript_path`, **không** có text inline |
| **Codex CLI** | ✅ **CÓ** (đường sạch nhất) | **Stop/SubagentStop hook → `last_assistant_message`** (inline stdin, KHÔNG đọc file) | Hook inline ✅ · hoặc `codex exec --json` · hoặc `-o <path>` |
| **Gemini CLI** | ⚠️ **CÓ-NHƯNG-RỦI-RO** (yếu nhất) | Chỉ qua wrapper: `gemini --output-format json` → `.response` | KHÔNG có narration qua hook interactive. Possible deprecation mid-2026 |

**Điểm mấu chốt cho Copet:** kiến trúc Copet là hook-driven (`agent hook → copet-hook → AgentEvent`). Phân biệt 2 ngữ cảnh:
- **Session interactive (TUI)** — user chat trực tiếp với agent, Copet bám qua hook. Đây là use-case chính.
- **Wrapper** — `copet-run -- <cmd>` chạy agent non-interactive.

→ Narration **inline qua hook** (không phải đọc file, không phải wrapper) chỉ có ở: **Claude = KHÔNG** (chỉ transcript_path), **Codex = CÓ** (`last_assistant_message`), **Gemini = KHÔNG**.

---

## Chi tiết từng agent

### 1. Claude Code — ✅ CÓ (đã có trong Copet)
- **Nguồn:** transcript JSONL `~/.claude/projects/<sanitized-cwd>/<session_id>.jsonl`; dòng `"type":"assistant"` → `message.content[]` block `{"type":"text","text":...}`. Đọc 128KB cuối, duyệt ngược. (= cách agentpet + `crates/copet-hook/src/transcript.rs` đang làm → field `last_message`).
- **Hook inline?** Strongly-indicated **KHÔNG**: Stop/SubagentStop hook stdin chỉ có common fields (`session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`) — **không có text assistant**. Phải đọc file qua `transcript_path`. *(Nguồn: code.claude.com/docs/en/hooks — đây là 1 open question chưa chốt 100%, nhưng evidence rõ.)*
- **Ổn định:** format JSONL **không tài liệu hóa** (internal). Đã proven nhưng có risk drift.
- **Trạng thái Copet:** đã extract `last_message` (opt-in transcript enrichment). Chỉ thiếu *hiển thị*.

### 2. Codex CLI — ✅ CÓ, 3 đường chính thống (confidence: high, 3-0)
Narration cuối-lượt lấy được **không cần đọc session file**:

1. ⭐ **Hook `last_assistant_message`** (string|null, "Latest assistant message text, if available") — trên **Stop / SubagentStop**. Đẩy thẳng vào stdin hook. **Khớp hoàn hảo kiến trúc Copet** — `map_codex.rs` chỉ cần parse thêm field này → `last_message`. Không file IO, đối xứng với Claude. *(developers.openai.com/codex/hooks; payload thật ở openai/codex#23784)*
2. **`codex exec --json`** → stdout JSONL: `{"type":"item.completed","item":{"type":"agent_message","text":"..."}}`. Trích: `jq -r 'select(.item.type=="agent_message").item.text'`. Dùng cho đường **`copet-run` wrapper**. *(developers.openai.com/codex/noninteractive)*
3. **`--output-last-message, -o <path>`** — ghi message cuối ra file. *(developers.openai.com/codex/cli/reference)*

- **Fallback (không khuyến nghị):** rollout JSONL `~/.codex/sessions/YYYY/MM/DD/rollout-<id>.jsonl` — CÓ chứa prose (`response_item` message + `event_msg`/`agent_message`) nhưng **internal/unstable** (`--ephemeral` để tắt persist). *(confirmed source-code: codex-rs/rollout/src/recorder.rs)*
- **Các hook khác** (PreToolUse/PostToolUse/UserPromptSubmit/PermissionRequest…): chỉ metadata + tool I/O, **không** có prose. → narration inline **chỉ end-of-turn**.
- **Caveat:** field từng đổi tên (`assistant_message`→`agent_message`); bug Windows mojibake với non-ASCII (`#23784`, low-risk vì Copet macOS-primary). Hooks "enabled by default", key `hooks` (alias cũ `codex_hooks`).

### 3. Gemini CLI — ⚠️ CÓ-NHƯNG-RỦI-RO (yếu nhất cho popup live)
- **Chính thống:** `gemini --output-format json -p "..."` → 1 JSON object, top-level **`.response`** (string|null) = "the model's final answer". Trích: `... | jq '.response'`. *(google-gemini.github.io/.../headless.html; issue #8022)* — **NHƯNG đây là headless/non-interactive** → chỉ áp dụng cho **`copet-run` wrapper**, KHÔNG cho session TUI interactive.
- **Hook interactive:** **không** có field tài liệu hóa chứa model response text (chỉ metadata).
- **Checkpoint files** `~/.gemini/tmp/<project_hash>/checkpoints` — CÓ full prose (`history: Content[]`, `role:'model'` text parts) NHƯNG: **tắt mặc định** (opt-in settings.json), cần git, chỉ fire khi edit-tool chờ approve, schema internal. → **không tin cậy** làm nguồn chung.
- ⚠️ **Longevity:** Gemini CLI được cho là sẽ **wind down ~mid-2026** nhường chỗ Antigravity CLI (format streaming khác). **Verify trước khi đầu tư.**

---

## Độ tin cậy & version-drift (caveat quan trọng)

- **Output mode chính thống** (Codex `exec --json` / `-o`; Gemini `--output-format json`) = **contract version-stable**, đổi kèm docs+changelog. **Ưu tiên hơn** đọc session file.
- **Session/rollout/checkpoint files** = internal, **không guaranteed**. Codex docs cảnh báo transcript format "is not a stable interface for hooks and may change over time". Pin tên field hiện tại + guard parse.
- **Codex hook `last_assistant_message`** = đường tốt nhất: vừa chính thống (documented), vừa push inline qua kênh hook Copet đã có.

### Claims bị bác (4 killed) — để tránh hiểu nhầm
- "Rollout = complete merged trajectory final output" (1-2): over-claim, nhưng prose VẪN có mặt (đã confirm bởi claim khác).
- "Codex chưa có official flag (Aug 2025)" (0-3): SAI — **giờ ĐÃ có** `--output-last-message`.
- "`--json` alias `--experimental-json` không ổn định" (1-2): `--json` là chính thống.
- "Gemini persist full history vô điều kiện" (1-2): SAI — checkpointing off-by-default, có điều kiện.

---

## Khuyến nghị cho Copet (tích hợp xia + deep-research)

> Nhắc lại từ báo cáo xia: chính `agentpet` **không hiển thị narration** — nó dùng `tool_input.description` + themed phrase + title, và chỉ đọc Claude `latest_assistant_text` để *detect question*. Nên đây là cơ hội Copet **đi xa hơn reference impl**.

**Nếu quyết định hiển thị narration:**
1. **Codex (đường ngon nhất, leapfrog agentpet):** thêm parse `last_assistant_message` vào `crates/copet-hook/src/map_codex.rs` cho event Stop/SubagentStop → đổ vào `last_message`. Cần thêm Stop/SubagentStop vào hook spec Codex (hiện Copet chỉ có `tui.notifications`). **Không** đụng file IO, **không** đổi shape `AgentEvent` (field `last_message` đã tồn tại).
2. **Claude:** đã có `last_message` — chỉ cần đưa lên UI (HUD/expanded, có cuộn + escape HTML; tránh popup 1-dòng vì prose dài).
3. **Gemini:** chỉ khả thi qua `copet-run` wrapper (`gemini --output-format json` → `.response`). Session interactive → **không có narration**; fallback themed phrase. Cân nhắc longevity trước khi làm.

**Lưu ý kiến trúc:** narration inline chỉ là **end-of-turn** (lúc Stop) → hợp hiển thị "agent vừa nói gì" khi `state=done/waiting`, KHÔNG phải narration mid-turn realtime. Khớp tự nhiên với popup trạng thái.

**Đề xuất ưu tiên (từ xia, vẫn đứng vững):** **port question-detection** (`looks_like_question` → Stop+hỏi ⇒ waiting) giá trị cao hơn việc đổi text Bash, và Codex `last_assistant_message` đúng thứ cần để detect cùng cách cho Codex.

---

## Unresolved questions
1. **Claude hook**: xác nhận dứt điểm Stop/SubagentStop/Notification/PostToolUse stdin **chỉ** có `transcript_path` (không text inline)? Nếu đúng → Claude buộc đọc file (đã làm), không có đường inline như Codex.
2. **Gemini deprecation**: Gemini CLI có thực sự sunset ~T6/2026 (Antigravity CLI)? Nếu có, đường `--output-format json` còn giá trị bao lâu, replacement expose narration thế nào?
3. **Gemini streaming**: `--output-format json` chỉ trả object cuối hay có streaming per-turn? (quyết định có narration mid-turn cho Gemini không — hiện đánh giá: không).
4. **Codex `~/.codex/history.jsonl`**: chứa prose assistant hay chỉ user-prompt history? (chưa claim nào chốt — có thể là nguồn 1-file đơn giản hơn rollout date-sharded).

---

## Nguồn chính (primary)
- Codex: developers.openai.com/codex/{hooks, noninteractive, cli/reference, changelog}; openai/codex#{23784, 21660, 2288, 26877}
- Gemini: google-gemini.github.io/.../headless.html; github.com/google-gemini/gemini-cli/{issues/8022, blob/main/docs/cli/checkpointing.md}; geminicli.com/docs/{hooks/reference, cli/headless}
- Claude: code.claude.com/docs/en/{hooks, statusline}
- Reliability: openai/codex#26877 (rollout format drift), anthropics/claude-code#17591
