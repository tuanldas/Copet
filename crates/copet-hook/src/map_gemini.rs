//! Maps Gemini CLI hook JSON payloads → canonical AgentEvent.
//!
//! Gemini hook schema (stdin JSON):
//! {
//!   "hook_event": "BeforeAgent" | "BeforeTool" | "AfterModel" | "AfterAgent",
//!   "session_id": "string|null",
//!   "tool_name": "string|null",
//!   "cwd": "string|null"
//! }

use copet_protocol::{Agent, AgentEvent, State};
use serde::Deserialize;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Deserialize)]
struct GeminiPayload {
    hook_event: Option<String>,
    session_id: Option<String>,
    tool_name: Option<String>,
    cwd: Option<String>,
}

/// Parse a Gemini CLI hook JSON string → AgentEvent.
pub fn parse(json: &str) -> Option<AgentEvent> {
    let p: GeminiPayload = serde_json::from_str(json).ok()?;
    let event = p.hook_event.as_deref().unwrap_or("");
    let session_id = p.session_id.clone().unwrap_or_default();

    let state = match event {
        "BeforeAgent" | "BeforeTool" => State::Working,
        "AfterModel" => State::Waiting,
        "AfterAgent" => State::Done,
        _ => return None,
    };

    let project = p
        .cwd
        .as_deref()
        .and_then(|c| Path::new(c).file_name())
        .and_then(|n| n.to_str())
        .map(str::to_owned);

    Some(AgentEvent {
        agent: Agent::Gemini,
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
    fn before_agent_is_working() {
        let json = r#"{"hook_event":"BeforeAgent","session_id":"g1","cwd":"/workspace/my-app"}"#;
        let ev = parse(json).unwrap();
        assert_eq!(ev.state, State::Working);
        assert_eq!(ev.project.as_deref(), Some("my-app"));
    }

    #[test]
    fn before_tool_is_working() {
        let json = r#"{"hook_event":"BeforeTool","session_id":"g2","tool_name":"shell","cwd":"/proj"}"#;
        let ev = parse(json).unwrap();
        assert_eq!(ev.state, State::Working);
        assert_eq!(ev.tool.as_deref(), Some("shell"));
    }

    #[test]
    fn after_model_is_waiting() {
        let json = r#"{"hook_event":"AfterModel","session_id":"g3"}"#;
        let ev = parse(json).unwrap();
        assert_eq!(ev.state, State::Waiting);
    }

    #[test]
    fn after_agent_is_done() {
        let json = r#"{"hook_event":"AfterAgent","session_id":"g4","cwd":"/proj"}"#;
        let ev = parse(json).unwrap();
        assert_eq!(ev.state, State::Done);
    }

    #[test]
    fn unknown_event_returns_none() {
        let json = r#"{"hook_event":"BeforeModel","session_id":"g5"}"#;
        assert!(parse(json).is_none());
    }

    #[test]
    fn malformed_json_returns_none() {
        assert!(parse("???").is_none());
    }
}
