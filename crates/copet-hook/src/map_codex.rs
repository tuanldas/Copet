//! Maps OpenAI Codex CLI hook JSON payloads → canonical AgentEvent.
//!
//! Schema verified against codex-cli 0.134.0: Codex reads hooks from
//! `~/.codex/hooks.json` (ClaudeNested) gated by `[features] hooks = true`, and
//! pipes a Claude-shaped JSON object on stdin (NOT the older `{"event":...}` /
//! `tui.notifications` shape, which never matched the shipped CLI):
//! {
//!   "hook_event_name": "SessionStart" | "UserPromptSubmit" | "PreToolUse"
//!                    | "PostToolUse" | "SubagentStart" | "PermissionRequest"
//!                    | "Stop" | "SubagentStop",
//!   "session_id": "string|null",
//!   "cwd": "string|null",
//!   "tool_name": "string|null",              // PreToolUse / PostToolUse
//!   "last_assistant_message": "string|null"  // Stop / SubagentStop: assistant narration
//! }
//!
//! `last_assistant_message` carries the end-of-turn assistant prose inline (no
//! transcript file read needed) — the cleanest narration source of the three
//! agents. If a future Codex renames the field, it deserializes to None and the
//! event degrades gracefully (last_message stays null).

use copet_protocol::{Agent, AgentEvent, State};
use serde::Deserialize;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Max length (chars) for the assistant narration — matches the Claude transcript
/// cap (`transcript.rs::MAX_MESSAGE`) so both agents render consistently.
const MAX_MESSAGE: usize = 200;

#[derive(Deserialize)]
struct CodexPayload {
    hook_event_name: Option<String>,
    session_id: Option<String>,
    cwd: Option<String>,
    tool_name: Option<String>,
    /// Assistant narration, present on Stop / SubagentStop.
    last_assistant_message: Option<String>,
}

/// Parse a Codex hook JSON string → AgentEvent.
///
/// Returns `None` for events that don't map to a state (e.g. SessionStart) so
/// the hook stays a no-op rather than emitting a spurious event.
pub fn parse(json: &str) -> Option<AgentEvent> {
    let p: CodexPayload = serde_json::from_str(json).ok()?;
    let event = p.hook_event_name.as_deref().unwrap_or("");
    let session_id = p.session_id.clone().unwrap_or_default();

    let state = match event {
        "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "SubagentStart" => State::Working,
        "PermissionRequest" => State::Waiting,
        "Stop" | "SubagentStop" => State::Done,
        // SessionStart (session registered, not yet working) and any unknown
        // event: no state change.
        _ => return None,
    };

    let project = p
        .cwd
        .as_deref()
        .and_then(|c| Path::new(c).file_name())
        .and_then(|n| n.to_str())
        .map(str::to_owned);

    // Assistant narration arrives inline on Stop/SubagentStop; absent elsewhere.
    let last_message = p
        .last_assistant_message
        .as_deref()
        .and_then(|m| clip(m, MAX_MESSAGE));

    Some(AgentEvent {
        agent: Agent::Codex,
        session_id,
        state,
        tool: p.tool_name,
        project,
        // tool_input/message/prompt enrichment is Claude-only for now.
        tool_input: None,
        cwd_full: p.cwd,
        message: None,
        prompt: None,
        model: None,
        summary: None,
        last_message,
        tokens_in: None,
        tokens_out: None,
        // Codex has no session-end hook; never flagged as ended.
        ended: false,
        ts: unix_now(),
    })
}

/// Trim, then truncate to `max` chars (UTF-8 safe), appending an ellipsis when
/// content was cut. Returns None for empty/whitespace-only input. (Local copy —
/// map_codex stays self-contained for the `#[path]`-included integration tests.)
fn clip(s: &str, max: usize) -> Option<String> {
    let t = s.trim();
    if t.is_empty() {
        return None;
    }
    let truncated: String = t.chars().take(max).collect();
    if t.chars().count() > max {
        Some(format!("{truncated}…"))
    } else {
        Some(truncated)
    }
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pre_tool_use_is_working() {
        let json = r#"{"hook_event_name":"PreToolUse","session_id":"c1","tool_name":"shell","cwd":"/home/user/proj"}"#;
        let ev = parse(json).unwrap();
        assert_eq!(ev.state, State::Working);
        assert_eq!(ev.tool.as_deref(), Some("shell"));
        assert_eq!(ev.project.as_deref(), Some("proj"));
        assert_eq!(ev.cwd_full.as_deref(), Some("/home/user/proj"));
        // No narration on a working event.
        assert!(ev.last_message.is_none());
    }

    #[test]
    fn user_prompt_submit_is_working() {
        let json = r#"{"hook_event_name":"UserPromptSubmit","session_id":"c2"}"#;
        assert_eq!(parse(json).unwrap().state, State::Working);
    }

    #[test]
    fn permission_request_is_waiting() {
        let json = r#"{"hook_event_name":"PermissionRequest","session_id":"c3"}"#;
        assert_eq!(parse(json).unwrap().state, State::Waiting);
    }

    #[test]
    fn stop_is_done_and_captures_narration() {
        let json = r#"{"hook_event_name":"Stop","session_id":"c4","last_assistant_message":"I've completed the refactoring."}"#;
        let ev = parse(json).unwrap();
        assert_eq!(ev.state, State::Done);
        assert_eq!(ev.last_message.as_deref(), Some("I've completed the refactoring."));
        // Codex Stop is a turn end, not a session end.
        assert!(!ev.ended);
    }

    #[test]
    fn subagent_stop_is_done_and_captures_narration() {
        let json = r#"{"hook_event_name":"SubagentStop","session_id":"c5","last_assistant_message":"Subtask done."}"#;
        let ev = parse(json).unwrap();
        assert_eq!(ev.state, State::Done);
        assert_eq!(ev.last_message.as_deref(), Some("Subtask done."));
    }

    #[test]
    fn stop_without_narration_leaves_last_message_none() {
        let json = r#"{"hook_event_name":"Stop","session_id":"c6"}"#;
        let ev = parse(json).unwrap();
        assert_eq!(ev.state, State::Done);
        assert!(ev.last_message.is_none());
    }

    #[test]
    fn long_narration_truncated_utf8_safe() {
        let long = "é".repeat(300);
        let json = format!(
            r#"{{"hook_event_name":"Stop","session_id":"c7","last_assistant_message":"{long}"}}"#
        );
        let msg = parse(&json).unwrap().last_message.unwrap();
        assert!(msg.ends_with('…'));
        assert_eq!(msg.chars().count(), MAX_MESSAGE + 1);
    }

    #[test]
    fn session_start_returns_none() {
        // SessionStart has no Copet state (no "registered"); skip it.
        let json = r#"{"hook_event_name":"SessionStart","session_id":"c8"}"#;
        assert!(parse(json).is_none());
    }

    #[test]
    fn unknown_event_returns_none() {
        let json = r#"{"hook_event_name":"PreCompact","session_id":"c9"}"#;
        assert!(parse(json).is_none());
    }

    #[test]
    fn claude_only_fields_stay_null() {
        let json = r#"{"hook_event_name":"PreToolUse","session_id":"c10","tool_name":"shell","cwd":"/p"}"#;
        let ev = parse(json).unwrap();
        assert!(ev.tool_input.is_none());
        assert!(ev.message.is_none());
        assert!(ev.prompt.is_none());
        assert!(ev.model.is_none());
    }

    #[test]
    fn malformed_json_returns_none() {
        assert!(parse("{bad").is_none());
    }
}
