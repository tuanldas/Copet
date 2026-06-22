//! Async local-socket daemon that bridges copet-hook/copet-run → Tauri events.
//!
//! Binds to the platform socket path returned by `copet_protocol::copet_socket_path()`,
//! reads newline-delimited JSON lines from each connection, deserialises them as
//! `AgentEvent`, and emits `agent-status-changed` to all Tauri webview listeners.
//!
//! Design constraints:
//! - Parse errors → log + skip line (daemon MUST NOT crash on garbage input).
//! - Uses `interprocess` 2.x async API with the `tokio` feature.

use copet_protocol::{copet_socket_path, AgentEvent};
use interprocess::local_socket::{
    tokio::prelude::*,
    GenericFilePath, ListenerOptions,
};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader, AsyncRead};

/// Tauri event name consumed by the frontend (Phase 02/04/07).
pub const EVENT_AGENT_STATUS_CHANGED: &str = "agent-status-changed";

/// Spawn the socket daemon as a detached tokio task.
///
/// Call once from `init_ipc` in `lib.rs`. Safe to call multiple times (subsequent
/// calls will fail to bind and log a warning — they do not panic).
pub fn spawn_daemon(app: AppHandle) {
    // Use Tauri's managed async runtime — at `setup()` time there is no ambient tokio
    // runtime on this thread, so a bare `tokio::spawn` would panic (and abort the app).
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_daemon(app).await {
            eprintln!("[copet-ipc] daemon exited with error: {e}");
        }
    });
}

async fn run_daemon(app: AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let socket_path = copet_socket_path();

    // Remove stale socket file from a previous run (Unix only; no-op on Windows).
    #[cfg(unix)]
    {
        let _ = std::fs::remove_file(&socket_path);
    }

    let name = socket_path.as_str().to_fs_name::<GenericFilePath>()?;
    let listener = ListenerOptions::new().name(name).create_tokio()?;

    eprintln!("[copet-ipc] listening on {socket_path}");

    loop {
        let conn = match listener.accept().await {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[copet-ipc] accept error: {e}");
                // Back off to avoid a busy-spin if the error persists (e.g. fd exhaustion).
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                continue;
            }
        };

        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            handle_connection(conn, app_clone).await;
        });
    }
}

/// Read all newline-delimited JSON lines from one connection and emit events.
async fn handle_connection(stream: impl AsyncRead + Unpin, app: AppHandle) {
    let reader = BufReader::new(stream);
    let mut lines = reader.lines();

    loop {
        let line = match lines.next_line().await {
            Ok(Some(line)) => line,
            Ok(None) => break, // clean EOF
            Err(e) => {
                eprintln!("[copet-ipc] read error (closing connection): {e}");
                break;
            }
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<AgentEvent>(trimmed) {
            Ok(event) => {
                if let Err(e) = app.emit(EVENT_AGENT_STATUS_CHANGED, &event) {
                    eprintln!("[copet-ipc] emit error: {e}");
                }
            }
            Err(e) => {
                // Garbage input → log and skip. Never crash the daemon.
                eprintln!("[copet-ipc] parse error (skipping line): {e}");
            }
        }
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use copet_protocol::{Agent, State};

    /// Verify that a canonical JSON line round-trips cleanly through the
    /// same serde path used by handle_connection.
    #[test]
    fn parse_round_trip() {
        let json = r#"{"agent":"claude-code","session_id":"s1","state":"working","tool":"read_file","project":"my-proj","ts":1750000000}"#;
        let ev: AgentEvent = serde_json::from_str(json).expect("deserialize");
        assert_eq!(ev.agent, Agent::ClaudeCode);
        assert_eq!(ev.state, State::Working);
        assert_eq!(ev.tool.as_deref(), Some("read_file"));
        assert_eq!(ev.ts, 1_750_000_000);

        // Re-serialize and deserialize to confirm full round-trip.
        let back: AgentEvent =
            serde_json::from_str(&serde_json::to_string(&ev).unwrap()).unwrap();
        assert_eq!(back.session_id, "s1");
    }

    #[test]
    fn parse_garbage_returns_error() {
        let result = serde_json::from_str::<AgentEvent>("not json");
        assert!(result.is_err());
    }

    #[test]
    fn parse_unknown_state_returns_error() {
        // "unknown_state" is not a valid State variant.
        let json = r#"{"agent":"codex","session_id":"s2","state":"unknown_state","tool":null,"project":null,"ts":0}"#;
        let result = serde_json::from_str::<AgentEvent>(json);
        assert!(result.is_err());
    }

    #[test]
    fn all_states_deserialize() {
        for state in ["working", "waiting", "done", "idle", "error"] {
            let json = format!(
                r#"{{"agent":"gemini","session_id":"x","state":"{state}","tool":null,"project":null,"ts":0}}"#
            );
            assert!(
                serde_json::from_str::<AgentEvent>(&json).is_ok(),
                "failed for state={state}"
            );
        }
    }
}
