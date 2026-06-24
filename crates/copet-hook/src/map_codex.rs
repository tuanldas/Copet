//! Maps OpenAI Codex hook JSON payloads → canonical AgentEvent.
//!
//! Codex hook schema (stdin JSON):
//! {
//!   "event": "preToolUse" | "tui.notifications",
//!   "session_id": "string|null",
//!   "cwd": "string|null",
//!   "tool": "string|null",
//!   // for tui.notifications:
//!   "notification": { "type": "approval-requested" | "agent-turn-complete" }
//! }

use copet_protocol::{Agent, AgentEvent, State};
use serde::Deserialize;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Deserialize)]
struct CodexPayload {
    event: Option<String>,
    session_id: Option<String>,
    cwd: Option<String>,
    tool: Option<String>,
    notification: Option<CodexNotification>,
}

#[derive(Deserialize)]
struct CodexNotification {
    #[serde(rename = "type")]
    kind: Option<String>,
}

/// Parse a Codex hook JSON string → AgentEvent.
pub fn parse(json: &str) -> Option<AgentEvent> {
    let p: CodexPayload = serde_json::from_str(json).ok()?;
    let event = p.event.as_deref().unwrap_or("");
    let session_id = p.session_id.clone().unwrap_or_default();

    let state = match event {
        "preToolUse" => State::Working,
        "tui.notifications" => {
            let ntype = p
                .notification
                .as_ref()
                .and_then(|n| n.kind.as_deref())
                .unwrap_or("");
            match ntype {
                "approval-requested" => State::Waiting,
                "agent-turn-complete" => State::Done,
                _ => return None,
            }
        }
        _ => return None,
    };

    let project = p
        .cwd
        .as_deref()
        .and_then(|c| Path::new(c).file_name())
        .and_then(|n| n.to_str())
        .map(str::to_owned);

    Some(AgentEvent {
        agent: Agent::Codex,
        session_id,
        state,
        tool: p.tool,
        project,
        // Enrichment fields are Claude-only for now; Codex leaves them null.
        tool_input: None,
        cwd_full: p.cwd,
        message: None,
        prompt: None,
        model: None,
        summary: None,
        last_message: None,
        tokens_in: None,
        tokens_out: None,
        // Codex has no session-end hook; never flagged as ended.
        ended: false,
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
        let json = r#"{"event":"preToolUse","session_id":"c1","tool":"bash","cwd":"/home/user/proj"}"#;
        let ev = parse(json).unwrap();
        assert_eq!(ev.state, State::Working);
        assert_eq!(ev.tool.as_deref(), Some("bash"));
        assert_eq!(ev.project.as_deref(), Some("proj"));
    }

    #[test]
    fn approval_requested_is_waiting() {
        let json = r#"{"event":"tui.notifications","session_id":"c2","notification":{"type":"approval-requested"}}"#;
        let ev = parse(json).unwrap();
        assert_eq!(ev.state, State::Waiting);
    }

    #[test]
    fn agent_turn_complete_is_done() {
        let json = r#"{"event":"tui.notifications","session_id":"c3","notification":{"type":"agent-turn-complete"}}"#;
        let ev = parse(json).unwrap();
        assert_eq!(ev.state, State::Done);
    }

    #[test]
    fn unknown_notification_returns_none() {
        let json = r#"{"event":"tui.notifications","session_id":"c4","notification":{"type":"other"}}"#;
        assert!(parse(json).is_none());
    }

    #[test]
    fn unknown_event_returns_none() {
        let json = r#"{"event":"something","session_id":"c5"}"#;
        assert!(parse(json).is_none());
    }

    #[test]
    fn malformed_json_returns_none() {
        assert!(parse("{bad").is_none());
    }
}
