//! copet-run — universal wrapper that emits agent events for any CLI command.
//!
//! Usage: copet-run -- <cmd> [args...]
//!
//! Spawns `<cmd>` with inherited stdio, sends `working` (tool = cmd) when the
//! child starts, then `done` or `error` (tool = None) when it finishes.
//! tool is None on done/error so the frontend does NOT award a token for the
//! completion event (tokens are only for real agent tool_call events).
//! Propagates the child's exit code exactly so callers see the real result.

use copet_protocol::{Agent, AgentEvent, State, copet_socket_path};
use std::io::Write;
use std::process::{Command, ExitCode};
use std::time::{SystemTime, UNIX_EPOCH};

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();

    // Expect: copet-run -- <cmd> [args...]
    // Find the `--` separator.
    let sep = args.iter().position(|a| a == "--");
    let cmd_args: &[String] = match sep {
        Some(i) if i + 1 < args.len() => &args[i + 1..],
        _ => {
            eprintln!("copet-run: usage: copet-run -- <cmd> [args...]");
            return ExitCode::FAILURE;
        }
    };

    let cmd = &cmd_args[0];
    let rest = &cmd_args[1..];

    // session_id = wrapper-{secs}-{pid} — PID suffix prevents collisions when two
    // invocations start within the same second.
    let session_id = format!("wrapper-{}-{}", unix_now(), std::process::id());

    // Derive project from cwd basename.
    let project = std::env::current_dir()
        .ok()
        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()));

    // Emit working before spawning.
    send_event(AgentEvent {
        agent: Agent::Wrapper,
        session_id: session_id.clone(),
        state: State::Working,
        tool: Some(cmd.clone()),
        project: project.clone(),
        tool_input: None,
        cwd_full: None,
        message: None,
        prompt: None,
        ts: unix_now(),
    });

    // Spawn child, inherit stdin/stdout/stderr.
    let status = Command::new(cmd)
        .args(rest)
        .stdin(std::process::Stdio::inherit())
        .stdout(std::process::Stdio::inherit())
        .stderr(std::process::Stdio::inherit())
        .status();

    let exit_code = match status {
        Ok(s) => s.code().unwrap_or(1),
        Err(e) => {
            eprintln!("copet-run: failed to spawn '{cmd}': {e}");
            // Emit error event. tool = None: completion is not a tool_call,
            // so the frontend must not award a token for it.
            send_event(AgentEvent {
                agent: Agent::Wrapper,
                session_id,
                state: State::Error,
                tool: None,
                project,
                tool_input: None,
                cwd_full: None,
                message: None,
                prompt: None,
                ts: unix_now(),
            });
            return ExitCode::FAILURE;
        }
    };

    let final_state = if exit_code == 0 {
        State::Done
    } else {
        State::Error
    };

    // tool = None on completion events: wrapper done/error is not a tool_call.
    // The frontend's applyAgentXp only awards tokens when tool != null, so this
    // ensures `copet run -- sleep 2` gives +10 XP / +0 token (not +1 token).
    send_event(AgentEvent {
        agent: Agent::Wrapper,
        session_id,
        state: final_state,
        tool: None,
        project,
        tool_input: None,
        cwd_full: None,
        message: None,
        prompt: None,
        ts: unix_now(),
    });

    // Propagate the child's exact exit code.
    ExitCode::from(exit_code as u8)
}

/// Fire-and-forget: write one JSON line to the Copet socket.
/// All errors are silently swallowed — never interfere with the wrapped command.
fn send_event(event: AgentEvent) {
    let _ = try_send_event(&event);
}

fn try_send_event(event: &AgentEvent) -> Result<(), Box<dyn std::error::Error>> {
    let path = copet_socket_path();
    let line = serde_json::to_string(event)? + "\n";

    #[cfg(unix)]
    {
        use std::os::unix::net::UnixStream;
        use std::net::Shutdown;
        let stream = UnixStream::connect(&path)?;
        stream.set_write_timeout(Some(std::time::Duration::from_millis(200)))?;
        let mut stream = stream;
        stream.write_all(line.as_bytes())?;
        let _ = stream.shutdown(Shutdown::Both);
    }

    #[cfg(windows)]
    {
        use std::fs::OpenOptions;
        let mut file = OpenOptions::new().write(true).open(&path)?;
        file.write_all(line.as_bytes())?;
    }

    Ok(())
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
