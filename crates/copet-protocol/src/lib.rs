//! copet-protocol — canonical event contract shared by copet-hook, copet-run, and src-tauri.
//!
//! Keep this in sync with `src/types/agent-event.ts` (TS mirror).
//! Any change here MUST be reflected in the TS file.

use serde::{Deserialize, Serialize};

/// Which AI coding agent produced this event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Agent {
    ClaudeCode,
    Codex,
    Gemini,
    /// `copet run -- <cmd>` universal wrapper
    Wrapper,
}

/// Canonical agent state — maps onto pet animation/mood.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    /// Agent is actively executing a tool or generating.
    Working,
    /// Agent is waiting for user input or a permission grant.
    Waiting,
    /// Agent finished its turn successfully.
    Done,
    /// No active session.
    Idle,
    /// Agent exited with a non-zero code or fatal error.
    Error,
}

/// Canonical event — wire format on the local socket AND Tauri event payload.
///
/// JSON-line encoding: one compact JSON object per `\n`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentEvent {
    pub agent: Agent,
    /// Unique session identifier provided by the agent CLI.
    pub session_id: String,
    pub state: State,
    /// Active tool name when state == Working (optional).
    pub tool: Option<String>,
    /// `cwd` basename — used as tooltip text in the pet overlay.
    pub project: Option<String>,

    // ── Enrichment (additive, optional). Older hooks omit these fields; the
    //    `#[serde(default)]` makes them deserialize to None so old events and
    //    agents that don't supply them (Codex/Gemini/wrapper) never break. ──
    /// Condensed tool argument — e.g. a Bash command or the edited file's
    /// basename — so the UI can show "Bash: pnpm test" instead of just "Bash".
    #[serde(default)]
    pub tool_input: Option<String>,
    /// Full `cwd` path (vs `project`, which is only the basename).
    #[serde(default)]
    pub cwd_full: Option<String>,
    /// Notification text shown when state == Waiting (e.g. a permission prompt).
    #[serde(default)]
    pub message: Option<String>,
    /// Most recent user prompt (Claude `UserPromptSubmit`).
    #[serde(default)]
    pub prompt: Option<String>,

    /// Unix timestamp in seconds.
    pub ts: u64,
}

/// Returns the local-socket path for the current OS user.
///
/// - Unix  : `/tmp/copet-{uid}.sock`
/// - Windows: `\\.\pipe\copet-{uid}`
pub fn copet_socket_path() -> String {
    let uid = get_uid();
    #[cfg(windows)]
    return format!(r"\\.\pipe\copet-{uid}");
    #[cfg(not(windows))]
    return format!("/tmp/copet-{uid}.sock");
}

#[cfg(not(windows))]
fn get_uid() -> u32 {
    // Use std::os::unix only — avoids pulling in the libc crate.
    // SAFETY: getuid() is a POSIX no-fail syscall; always safe to call.
    extern "C" {
        fn getuid() -> u32;
    }
    unsafe { getuid() }
}

#[cfg(windows)]
fn get_uid() -> u32 {
    // Windows: no UID concept; use a fixed suffix so the pipe name is stable.
    0
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_event() -> AgentEvent {
        AgentEvent {
            agent: Agent::ClaudeCode,
            session_id: "sess-abc123".to_string(),
            state: State::Working,
            tool: Some("read_file".to_string()),
            project: Some("my-project".to_string()),
            tool_input: Some("pnpm test".to_string()),
            cwd_full: Some("/Users/dev/my-project".to_string()),
            message: None,
            prompt: None,
            ts: 1_750_000_000,
        }
    }

    #[test]
    fn serde_round_trip() {
        let ev = sample_event();
        let json = serde_json::to_string(&ev).expect("serialize");
        let back: AgentEvent = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(back.agent, ev.agent);
        assert_eq!(back.state, ev.state);
        assert_eq!(back.session_id, ev.session_id);
        assert_eq!(back.tool, ev.tool);
        assert_eq!(back.project, ev.project);
        assert_eq!(back.tool_input, ev.tool_input);
        assert_eq!(back.cwd_full, ev.cwd_full);
        assert_eq!(back.ts, ev.ts);
    }

    #[test]
    fn enrichment_fields_default_to_none_when_absent() {
        // An event JSON from an older hook (no enrichment fields) must still
        // deserialize — #[serde(default)] fills the missing fields with None.
        let json = r#"{"agent":"codex","session_id":"s","state":"working","tool":null,"project":null,"ts":0}"#;
        let ev: AgentEvent = serde_json::from_str(json).expect("deserialize legacy event");
        assert!(ev.tool_input.is_none());
        assert!(ev.cwd_full.is_none());
        assert!(ev.message.is_none());
        assert!(ev.prompt.is_none());
    }

    #[test]
    fn state_serializes_lowercase() {
        let s = serde_json::to_string(&State::Working).unwrap();
        assert_eq!(s, "\"working\"");
        let s = serde_json::to_string(&State::Idle).unwrap();
        assert_eq!(s, "\"idle\"");
    }

    #[test]
    fn agent_serializes_kebab_case() {
        let s = serde_json::to_string(&Agent::ClaudeCode).unwrap();
        assert_eq!(s, "\"claude-code\"");
        let s = serde_json::to_string(&Agent::Wrapper).unwrap();
        assert_eq!(s, "\"wrapper\"");
    }

    #[test]
    fn null_optional_fields() {
        let mut ev = sample_event();
        ev.tool = None;
        ev.project = None;
        let json = serde_json::to_string(&ev).unwrap();
        let back: AgentEvent = serde_json::from_str(&json).unwrap();
        assert!(back.tool.is_none());
        assert!(back.project.is_none());
    }

    #[test]
    fn socket_path_not_empty() {
        let p = copet_socket_path();
        assert!(!p.is_empty());
        // On Unix, must start with /tmp/copet-
        #[cfg(not(windows))]
        assert!(p.starts_with("/tmp/copet-"), "got: {p}");
    }
}
