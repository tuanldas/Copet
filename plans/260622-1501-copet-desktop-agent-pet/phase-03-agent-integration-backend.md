# Phase 03 — Agent Integration Backend (Rust)

> `interprocess` socket daemon trong Tauri core + sidecar `copet-hook` + event mapping + emit Tauri event. Hook cho Claude Code/Codex/Gemini + universal wrapper `copet run`. **Phase này định nghĩa EVENT CONTRACT** mà P02/P04/P07 consume.

## Context / Links
- Research: `plans/reports/research-260622-1501-multi-agent-cli-state-detection-report.md` §2 (mapping table), §3 (kiến trúc + event payload), §4 (interprocess crate)
- Stack: `docs/tech-stack.md` §Backend, §Agent state detection table

## Requirements
1. Socket daemon trong Tauri core (tokio + `interprocess`): listen `/tmp/copet-{uid}.sock` (Unix) / named pipe `\\.\pipe\copet-{uid}` (Win). Đọc JSON-line events.
2. Sidecar binary `copet-hook` (Rust, ~500KB, zero runtime dep): đọc hook JSON từ stdin → map → ghi 1 JSON line vào socket → exit 0 (KHÔNG block agent).
3. Event mapping: Claude Code / Codex / Gemini hook events → canonical state `working|waiting|done|idle` (+ error). Cô lập trong 1 module per-agent.
4. Universal wrapper `copet run -- <cmd>`: spawn child, emit working khi start, done (exit 0) / error (exit≠0) khi end; forward stdio.
5. Tauri core emit `agent-status-changed` (broadcast) với payload canonical → webview.
6. Install snippets cho settings.json (Claude), config (Codex notify/hooks), config (Gemini hooks). Document, KHÔNG tự sửa file user trong phase này (install flow ở P08).

## Event contract (CANONICAL — nguồn sự thật)
```jsonc
// Socket line (copet-hook → daemon) AND Tauri event payload (daemon → webview)
{
  "agent": "claude-code" | "codex" | "gemini" | "wrapper",
  "session_id": "string",
  "state": "working" | "waiting" | "done" | "idle" | "error",
  "tool": "string|null",        // tool name nếu có
  "project": "string|null",     // cwd basename cho tooltip
  "ts": 1750000000              // unix seconds
}
```
TS mirror: `frontend/types/agent-event.ts` (P02/P04/P07 import; CHỈ phase này sửa).
Rust mirror: `crates/copet-protocol/src/lib.rs` (shared giữa core + hook + wrapper).

## Mapping (per research §2)
| Agent | hook event | → state |
|---|---|---|
| claude-code | PreToolUse / UserPromptSubmit / SubagentStart | working |
| | Notification[idle_prompt\|permission_prompt] | waiting |
| | Stop / SessionEnd | done |
| codex | preToolUse | working |
| | tui.notifications[approval-requested] | waiting |
| | tui.notifications[agent-turn-complete] | done |
| gemini | BeforeAgent / BeforeTool | working |
| | AfterModel | waiting |
| | AfterAgent | done |
| wrapper | process start / exit0 / exit≠0 | working / done / error |

## Files to create
- `crates/copet-protocol/Cargo.toml` + `crates/copet-protocol/src/lib.rs` — `AgentEvent` struct (serde), `State` enum, socket path helper (`copet_socket_path(uid)`)
- `crates/copet-hook/Cargo.toml` + `crates/copet-hook/src/main.rs` — read stdin → detect agent (argv flag `--agent`) → per-agent parse → `AgentEvent` → write socket line → exit 0
- `crates/copet-hook/src/map_claude.rs`, `map_codex.rs`, `map_gemini.rs` — parse từng format → canonical (mỗi file 1 agent)
- `crates/copet-run/Cargo.toml` + `crates/copet-run/src/main.rs` — wrapper: parse `-- <cmd>`, spawn, emit working/done/error, forward stdio, pass exit code
- `src-tauri/src/ipc/socket_daemon.rs` — tokio listener (`interprocess`), accept conns, parse lines → `app.emit("agent-status-changed", ev)`
- `src-tauri/src/ipc/mod.rs` — module wiring, spawn daemon trong `setup()`
- `frontend/types/agent-event.ts` — TS mirror của AgentEvent (CONTRACT)
- `docs/agent-hook-setup.md` — snippets cài hook cho 3 agent + wrapper usage
- Tests: `crates/copet-hook/tests/mapping_tests.rs` (fixtures JSON mỗi agent → expected state); `src-tauri/src/ipc/socket_daemon.rs` `#[cfg(test)]` round-trip parse

## Files to modify
- `src-tauri/Cargo.toml` — add `interprocess`, `copet-protocol` (path dep), workspace members
- `Cargo.toml` (workspace root, tạo nếu chưa) — `[workspace] members = ["src-tauri","crates/*"]`
- `src-tauri/src/lib.rs` — `setup()` gọi `ipc::spawn_daemon(app_handle)`
- `src-tauri/tauri.conf.json` — `bundle.externalBin` thêm `copet-hook`,`copet-run` (sidecar)

## Implementation steps
1. Tạo workspace root `Cargo.toml`; thêm `crates/copet-protocol` (struct + enum + socket path helper, dùng UID suffix).
2. `socket_daemon.rs`: `interprocess::local_socket` async listener; mỗi line `serde_json::from_str::<AgentEvent>` → `app.emit`. Handle parse error gracefully (log, skip line). Bind ở `setup()` qua tokio task.
3. `copet-hook`: argv `--agent <claude|codex|gemini>` chọn parser; đọc toàn stdin; map → AgentEvent; connect socket, ghi 1 line; **luôn exit 0** kể cả lỗi (không block agent). Timeout connect ngắn (vd 200ms) → nếu daemon chưa chạy thì bỏ qua.
4. `map_claude/codex/gemini.rs`: pure fn `parse(json) -> Option<AgentEvent>` theo bảng mapping; unit-testable.
5. `copet-run`: `std::process::Command`, spawn, inherit stdio; gửi working qua socket khi start; chờ exit → done/error; trả đúng exit code.
6. `frontend/types/agent-event.ts`: mirror types (giữ đồng bộ tay với Rust; ghi comment "keep in sync with copet-protocol").
7. `docs/agent-hook-setup.md`: snippet settings.json (Claude `PreToolUse/Stop/Notification`), Codex `notify`/hooks, Gemini hooks YAML — trỏ tới `copet-hook --agent <x>`.
8. Manual e2e: chạy daemon (tauri dev), cài hook Claude Code thật → trigger 1 tool call → thấy Tauri event log working→done.

## Tests / Validation
- `cargo test -p copet-hook` — fixtures mỗi agent (working/waiting/done) → đúng canonical state.
- `cargo test -p copet-protocol` — serde round-trip AgentEvent.
- `cargo check --workspace` + `cargo clippy --workspace` sạch.
- `pnpm tsc --noEmit` (agent-event.ts) sạch.
- Manual e2e: Claude Code hook thật → daemon nhận → emit (log trong devtools `listen('agent-status-changed')`). `copet run -- sleep 2` → working rồi done.

## Risks & Rollback
| Risk | Mức | Mitigation |
|---|---|---|
| Cursor không có CLI hooks | High (scope) | Chỉ `copet run` cho Cursor; document rõ giới hạn (working/done only) |
| Gemini/Codex hook API mới, format đổi | Med | Parser cô lập per-file; fixtures; fallback wrapper |
| Hook block/chậm agent | Med | Luôn exit 0; connect timeout ngắn; non-blocking write |
| Socket path conflict multi-user | Low | UID suffix trong path helper |
| Windows named pipe permission | Low | `interprocess` xử lý; test Win CI (P08) |
| sidecar bundling sai (externalBin) | Med | Verify build copy đúng binary per-target (P08 cross-check) |

**Rollback:** crates độc lập + `ipc/` module — nếu daemon lỗi, comment `spawn_daemon` trong setup → app vẫn chạy (pet không phản ứng agent). Không ảnh hưởng P02/P04.

## File ownership (song song)
Wave A. SỞ HỮU `crates/*`, `src-tauri/src/ipc/*`, `frontend/types/agent-event.ts`, `docs/agent-hook-setup.md`. Sửa `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs setup()`, `tauri.conf.json bundle` — **các file này cũng bị P06 đụng (tray)** → coordinate: P03 sửa `setup()` ipc block + `bundle.externalBin`; P06 sửa `setup()` tray block + window list. Khuyến nghị: nếu chạy song song, tách `setup()` thành các fn `init_ipc()`, `init_tray()`, `init_windows()` ngay từ P01 để tránh merge conflict.

## Open questions
1. Token counting: `PostToolUse` có `usage.input_tokens` hay phải parse `~/.claude/logs/*.jsonl`? (ảnh hưởng P05 economy) — cần verify khi implement.
2. Codex `notify` external program nhận payload qua stdin hay argv? — verify với agent thật.
3. Multi-instance (3 Claude tab) → session_id multiplex: phase này forward đủ session_id; policy hiển thị quyết ở P07.
