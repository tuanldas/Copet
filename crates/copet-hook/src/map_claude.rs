//! Maps Claude Code hook JSON payloads → canonical AgentEvent.
//!
//! Claude Code hook schema (stdin JSON):
//! {
//!   "hook_event_name": "PreToolUse" | "UserPromptSubmit" | "SubagentStart"
//!                    | "Notification" | "Stop" | "SessionEnd",
//!   "session_id": "string",
//!   "tool_name": "string|null",
//!   "cwd": "string|null",
//!   "notification_type": "idle_prompt" | "permission_prompt" | null
//! }

use copet_protocol::{Agent, AgentEvent, State};
use serde::Deserialize;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Deserialize)]
struct ClaudeHookPayload {
    hook_event_name: Option<String>,
    session_id: Option<String>,
    tool_name: Option<String>,
    cwd: Option<String>,
    notification_type: Option<String>,
}

/// Parse a Claude Code hook JSON string → AgentEvent.
///
/// Returns `None` when the payload cannot be parsed or does not map to a
/// recognised state (unknown events are silently skipped — never block agent).
pub fn parse(json: &str) -> Option<AgentEvent> {
    let p: ClaudeHookPayload = serde_json::from_str(json).ok()?;
    let event_name = p.hook_event_name.as_deref().unwrap_or("");
    let session_id = p.session_id.clone().unwrap_or_default();

    let state = match event_name {
        "PreToolUse" | "UserPromptSubmit" | "SubagentStart" => State::Working,
        "Notification" => {
            // Only idle/permission notifications map to Waiting; others are noise.
            let ntype = p.notification_type.as_deref().unwrap_or("");
            if ntype == "idle_prompt" || ntype == "permission_prompt" {
                State::Waiting
            } else {
                return None;
            }
        }
        "Stop" | "SessionEnd" => State::Done,
        _ => return None,
    };

    let project = p
        .cwd
        .as_deref()
        .and_then(|c| Path::new(c).file_name())
        .and_then(|n| n.to_str())
        .map(str::to_owned);

    Some(AgentEvent {
        agent: Agent::ClaudeCode,
        session_id,
        state,
        tool: p.tool_name,
        project,
        ts: unix_now(),
    })
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
        let json = r#"{"hook_event_name":"PreToolUse","session_id":"s1","tool_name":"read_file","cwd":"/home/user/my-project"}"#;
        let ev = parse(json).unwrap();
        assert_eq!(ev.state, State::Working);
        assert_eq!(ev.tool.as_deref(), Some("read_file"));
        assert_eq!(ev.project.as_deref(), Some("my-project"));
    }

    #[test]
    fn stop_is_done() {
        let json = r#"{"hook_event_name":"Stop","session_id":"s2","cwd":"/proj"}"#;
        let ev = parse(json).unwrap();
        assert_eq!(ev.state, State::Done);
    }

    #[test]
    fn notification_idle_prompt_is_waiting() {
        let json = r#"{"hook_event_name":"Notification","session_id":"s3","notification_type":"idle_prompt"}"#;
        let ev = parse(json).unwrap();
        assert_eq!(ev.state, State::Waiting);
    }

    #[test]
    fn notification_other_returns_none() {
        let json = r#"{"hook_event_name":"Notification","session_id":"s4","notification_type":"something_else"}"#;
        assert!(parse(json).is_none());
    }

    #[test]
    fn unknown_event_returns_none() {
        let json = r#"{"hook_event_name":"Bogus","session_id":"s5"}"#;
        assert!(parse(json).is_none());
    }

    #[test]
    fn malformed_json_returns_none() {
        assert!(parse("not json at all").is_none());
    }
}
