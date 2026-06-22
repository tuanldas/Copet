//! Integration-level mapping tests for copet-hook parsers.
//!
//! Each fixture covers one agent × one state transition (working/waiting/done)
//! to verify the mapping table from the phase-03 spec is correct end-to-end.

// ── copet-hook is a binary crate, so we reach into the public modules via
//    the source tree using #[path = ...] — keeps tests in the tests/ dir
//    without making modules pub(crate) just for testing.

#[path = "../src/map_claude.rs"]
mod map_claude;

#[path = "../src/map_codex.rs"]
mod map_codex;

#[path = "../src/map_gemini.rs"]
mod map_gemini;

use copet_protocol::State;

// ──────────────────────────────────────────────────────────
// Claude Code fixtures
// ──────────────────────────────────────────────────────────

#[test]
fn claude_pre_tool_use_working() {
    let json = r#"{
        "hook_event_name": "PreToolUse",
        "session_id": "sess-claude-001",
        "tool_name": "write_file",
        "cwd": "/Users/dev/my-project"
    }"#;
    let ev = map_claude::parse(json).expect("should parse");
    assert_eq!(ev.state, State::Working);
    assert_eq!(ev.tool.as_deref(), Some("write_file"));
    assert_eq!(ev.project.as_deref(), Some("my-project"));
}

#[test]
fn claude_notification_permission_prompt_waiting() {
    let json = r#"{
        "hook_event_name": "Notification",
        "session_id": "sess-claude-002",
        "notification_type": "permission_prompt",
        "cwd": "/Users/dev/my-project"
    }"#;
    let ev = map_claude::parse(json).expect("should parse");
    assert_eq!(ev.state, State::Waiting);
}

#[test]
fn claude_notification_idle_prompt_waiting() {
    let json = r#"{
        "hook_event_name": "Notification",
        "session_id": "sess-claude-003",
        "notification_type": "idle_prompt"
    }"#;
    let ev = map_claude::parse(json).expect("should parse");
    assert_eq!(ev.state, State::Waiting);
}

#[test]
fn claude_stop_done() {
    let json = r#"{
        "hook_event_name": "Stop",
        "session_id": "sess-claude-004",
        "cwd": "/Users/dev/my-project"
    }"#;
    let ev = map_claude::parse(json).expect("should parse");
    assert_eq!(ev.state, State::Done);
}

#[test]
fn claude_session_end_done() {
    let json = r#"{
        "hook_event_name": "SessionEnd",
        "session_id": "sess-claude-005"
    }"#;
    let ev = map_claude::parse(json).expect("should parse");
    assert_eq!(ev.state, State::Done);
}

#[test]
fn claude_subagent_start_working() {
    let json = r#"{
        "hook_event_name": "SubagentStart",
        "session_id": "sess-claude-006",
        "cwd": "/srv/app"
    }"#;
    let ev = map_claude::parse(json).expect("should parse");
    assert_eq!(ev.state, State::Working);
}

// ──────────────────────────────────────────────────────────
// Codex fixtures
// ──────────────────────────────────────────────────────────

#[test]
fn codex_pre_tool_use_working() {
    let json = r#"{
        "event": "preToolUse",
        "session_id": "sess-codex-001",
        "tool": "bash",
        "cwd": "/home/dev/codex-project"
    }"#;
    let ev = map_codex::parse(json).expect("should parse");
    assert_eq!(ev.state, State::Working);
    assert_eq!(ev.tool.as_deref(), Some("bash"));
    assert_eq!(ev.project.as_deref(), Some("codex-project"));
}

#[test]
fn codex_approval_requested_waiting() {
    let json = r#"{
        "event": "tui.notifications",
        "session_id": "sess-codex-002",
        "notification": { "type": "approval-requested" }
    }"#;
    let ev = map_codex::parse(json).expect("should parse");
    assert_eq!(ev.state, State::Waiting);
}

#[test]
fn codex_agent_turn_complete_done() {
    let json = r#"{
        "event": "tui.notifications",
        "session_id": "sess-codex-003",
        "notification": { "type": "agent-turn-complete" }
    }"#;
    let ev = map_codex::parse(json).expect("should parse");
    assert_eq!(ev.state, State::Done);
}

// ──────────────────────────────────────────────────────────
// Gemini fixtures
// ──────────────────────────────────────────────────────────

#[test]
fn gemini_before_agent_working() {
    let json = r#"{
        "hook_event": "BeforeAgent",
        "session_id": "sess-gemini-001",
        "cwd": "/workspace/gemini-app"
    }"#;
    let ev = map_gemini::parse(json).expect("should parse");
    assert_eq!(ev.state, State::Working);
    assert_eq!(ev.project.as_deref(), Some("gemini-app"));
}

#[test]
fn gemini_before_tool_working() {
    let json = r#"{
        "hook_event": "BeforeTool",
        "session_id": "sess-gemini-002",
        "tool_name": "code_execution",
        "cwd": "/workspace/gemini-app"
    }"#;
    let ev = map_gemini::parse(json).expect("should parse");
    assert_eq!(ev.state, State::Working);
    assert_eq!(ev.tool.as_deref(), Some("code_execution"));
}

#[test]
fn gemini_after_model_waiting() {
    let json = r#"{
        "hook_event": "AfterModel",
        "session_id": "sess-gemini-003"
    }"#;
    let ev = map_gemini::parse(json).expect("should parse");
    assert_eq!(ev.state, State::Waiting);
}

#[test]
fn gemini_after_agent_done() {
    let json = r#"{
        "hook_event": "AfterAgent",
        "session_id": "sess-gemini-004",
        "cwd": "/workspace/gemini-app"
    }"#;
    let ev = map_gemini::parse(json).expect("should parse");
    assert_eq!(ev.state, State::Done);
}
