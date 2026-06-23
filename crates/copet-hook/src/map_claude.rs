//! Maps Claude Code hook JSON payloads → canonical AgentEvent.
//!
//! Claude Code hook schema (stdin JSON):
//! {
//!   "hook_event_name": "PreToolUse" | "UserPromptSubmit" | "SubagentStart"
//!                    | "Notification" | "Stop" | "SessionEnd",
//!   "session_id": "string",
//!   "tool_name": "string|null",
//!   "tool_input": { ... },         // tool-specific args (PreToolUse)
//!   "cwd": "string|null",
//!   "notification_type": "idle_prompt" | "permission_prompt" | null,
//!   "message": "string|null",      // human-readable notification text
//!   "prompt": "string|null"        // user input (UserPromptSubmit)
//! }

use copet_protocol::{Agent, AgentEvent, State};
use serde::Deserialize;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Max length (chars, not bytes) for the condensed tool argument.
const MAX_TOOL_INPUT: usize = 80;
/// Max length for free-text fields (notification message / user prompt).
const MAX_TEXT: usize = 160;

#[derive(Deserialize)]
struct ClaudeHookPayload {
    hook_event_name: Option<String>,
    session_id: Option<String>,
    tool_name: Option<String>,
    /// Tool-specific argument object (shape depends on the tool).
    tool_input: Option<serde_json::Value>,
    cwd: Option<String>,
    notification_type: Option<String>,
    /// Notification text (Notification events).
    message: Option<String>,
    /// User prompt text (UserPromptSubmit events).
    prompt: Option<String>,
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

    let tool_input = p.tool_input.as_ref().and_then(summarize_tool_input);
    let cwd_full = p.cwd.as_deref().and_then(|c| clip(c, MAX_TEXT));
    let message = p.message.as_deref().and_then(|m| clip(m, MAX_TEXT));
    let prompt = p.prompt.as_deref().and_then(|m| clip(m, MAX_TEXT));

    Some(AgentEvent {
        agent: Agent::ClaudeCode,
        session_id,
        state,
        tool: p.tool_name,
        project,
        tool_input,
        cwd_full,
        message,
        prompt,
        // Transcript fields are filled later by transcript::maybe_enrich (opt-in).
        model: None,
        summary: None,
        last_message: None,
        tokens_in: None,
        tokens_out: None,
        ts: unix_now(),
    })
}

/// Condense a Claude `tool_input` object into one short human-readable string.
///
/// The object shape is tool-specific, so the most informative key is picked in
/// priority order (command → file → pattern → url → path). File paths are
/// reduced to their basename to keep the line short. Returns None when no known
/// key is present, so we never dump a raw JSON blob into the UI.
fn summarize_tool_input(v: &serde_json::Value) -> Option<String> {
    let obj = v.as_object()?;
    let str_field = |k: &str| obj.get(k).and_then(|x| x.as_str());

    if let Some(cmd) = str_field("command") {
        return clip(cmd, MAX_TOOL_INPUT);
    }
    if let Some(fp) = str_field("file_path").or_else(|| str_field("path")) {
        let name = Path::new(fp).file_name().and_then(|n| n.to_str()).unwrap_or(fp);
        return clip(name, MAX_TOOL_INPUT);
    }
    if let Some(pat) = str_field("pattern") {
        return clip(pat, MAX_TOOL_INPUT);
    }
    if let Some(url) = str_field("url") {
        return clip(url, MAX_TOOL_INPUT);
    }
    None
}

/// Trim, then truncate to `max` chars (UTF-8 safe), appending an ellipsis when
/// content was cut. Returns None for empty/whitespace-only input.
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
        let json = r#"{"hook_event_name":"PreToolUse","session_id":"s1","tool_name":"read_file","cwd":"/home/user/my-project"}"#;
        let ev = parse(json).unwrap();
        assert_eq!(ev.state, State::Working);
        assert_eq!(ev.tool.as_deref(), Some("read_file"));
        assert_eq!(ev.project.as_deref(), Some("my-project"));
        // cwd_full carries the whole path; project is just the basename.
        assert_eq!(ev.cwd_full.as_deref(), Some("/home/user/my-project"));
    }

    #[test]
    fn pre_tool_use_bash_extracts_command() {
        let json = r#"{"hook_event_name":"PreToolUse","session_id":"s1","tool_name":"Bash","tool_input":{"command":"pnpm test","description":"run tests"}}"#;
        let ev = parse(json).unwrap();
        assert_eq!(ev.tool_input.as_deref(), Some("pnpm test"));
    }

    #[test]
    fn pre_tool_use_edit_extracts_file_basename() {
        let json = r#"{"hook_event_name":"PreToolUse","session_id":"s1","tool_name":"Edit","tool_input":{"file_path":"/Users/dev/app/src/main.ts","old_string":"a","new_string":"b"}}"#;
        let ev = parse(json).unwrap();
        assert_eq!(ev.tool_input.as_deref(), Some("main.ts"));
    }

    #[test]
    fn tool_input_unknown_shape_is_none() {
        // No recognised key → None (never dump raw JSON).
        let json = r#"{"hook_event_name":"PreToolUse","session_id":"s1","tool_name":"Mystery","tool_input":{"foo":"bar"}}"#;
        let ev = parse(json).unwrap();
        assert!(ev.tool_input.is_none());
    }

    #[test]
    fn long_command_is_truncated_with_ellipsis() {
        let long = "x".repeat(200);
        let json = format!(
            r#"{{"hook_event_name":"PreToolUse","session_id":"s1","tool_name":"Bash","tool_input":{{"command":"{long}"}}}}"#
        );
        let ev = parse(&json).unwrap();
        let ti = ev.tool_input.unwrap();
        assert!(ti.ends_with('…'));
        assert_eq!(ti.chars().count(), MAX_TOOL_INPUT + 1); // 80 chars + ellipsis
    }

    #[test]
    fn notification_captures_message() {
        let json = r#"{"hook_event_name":"Notification","session_id":"s3","notification_type":"permission_prompt","message":"Claude needs permission to use Bash"}"#;
        let ev = parse(json).unwrap();
        assert_eq!(ev.state, State::Waiting);
        assert_eq!(ev.message.as_deref(), Some("Claude needs permission to use Bash"));
    }

    #[test]
    fn user_prompt_submit_captures_prompt() {
        let json = r#"{"hook_event_name":"UserPromptSubmit","session_id":"s1","prompt":"add a dark mode toggle"}"#;
        let ev = parse(json).unwrap();
        assert_eq!(ev.state, State::Working);
        assert_eq!(ev.prompt.as_deref(), Some("add a dark mode toggle"));
    }

    #[test]
    fn missing_enrichment_fields_are_none() {
        let json = r#"{"hook_event_name":"PreToolUse","session_id":"s1","tool_name":"read_file"}"#;
        let ev = parse(json).unwrap();
        assert!(ev.tool_input.is_none());
        assert!(ev.message.is_none());
        assert!(ev.prompt.is_none());
        assert!(ev.cwd_full.is_none());
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
