//! copet-hook — lightweight sidecar called by agent CLI hooks.
//!
//! Usage: copet-hook --agent <claude|codex|gemini>
//!
//! Reads the full hook JSON payload from stdin, maps it to a canonical
//! AgentEvent, then writes a single JSON line to the Copet local socket.
//! ALWAYS exits 0 — must never block or slow the agent process.

mod map_claude;
mod map_codex;
mod map_gemini;
mod question_detect;
mod transcript;

use copet_protocol::{copet_socket_path, AgentEvent};
use std::io::{self, Read, Write};
use std::net::Shutdown;
use std::time::Duration;

fn main() {
    // Parse --agent <name> from argv. Any error → silent exit 0.
    let agent_name = match parse_agent_arg() {
        Some(a) => a,
        None => {
            eprintln!("copet-hook: usage: copet-hook --agent <claude|codex|gemini>");
            std::process::exit(0);
        }
    };

    // Read ALL of stdin — the agent writes the full JSON payload and closes stdin.
    let mut stdin_buf = String::new();
    if io::stdin().read_to_string(&mut stdin_buf).is_err() {
        // Can't read stdin — nothing to do; exit silently.
        std::process::exit(0);
    }

    // Map to canonical event; if no mapping exists, skip silently.
    let mut event: AgentEvent = match dispatch(&agent_name, &stdin_buf) {
        Some(ev) => ev,
        None => std::process::exit(0),
    };

    // Claude only: opt-in transcript enrichment (model / summary / tokens).
    // No-op unless the user enabled it; never blocks or panics.
    if agent_name == "claude" {
        transcript::maybe_enrich(&mut event, &stdin_buf);
    }

    // Reclassify a finished turn that actually ended by ASKING the user something
    // → Waiting ("needs input"). Reads event.last_message (Codex inline / Claude
    // transcript), so it's a no-op when narration is absent.
    question_detect::apply(&mut event);

    // Serialize and send — ignore all socket errors (daemon may not be running).
    let _ = send_event(&event);

    std::process::exit(0);
}

/// Select the per-agent parser based on the --agent flag value.
fn dispatch(agent: &str, json: &str) -> Option<AgentEvent> {
    match agent {
        "claude" => map_claude::parse(json),
        "codex" => map_codex::parse(json),
        "gemini" => map_gemini::parse(json),
        _ => {
            eprintln!("copet-hook: unknown agent '{agent}'; expected claude|codex|gemini");
            None
        }
    }
}

/// Write a single JSON line to the Copet socket.
///
/// Uses a short connection timeout (~200 ms) so the hook never stalls the agent
/// when the daemon is not running. All errors are silently swallowed.
fn send_event(event: &AgentEvent) -> Result<(), Box<dyn std::error::Error>> {
    let path = copet_socket_path();
    let line = serde_json::to_string(event)? + "\n";

    #[cfg(unix)]
    {
        use std::os::unix::net::UnixStream;
        let stream = UnixStream::connect(&path)?;
        stream.set_write_timeout(Some(Duration::from_millis(200)))?;
        let mut stream = stream;
        stream.write_all(line.as_bytes())?;
        let _ = stream.shutdown(Shutdown::Both);
    }

    #[cfg(windows)]
    {
        // Named-pipe client on Windows.
        use std::fs::OpenOptions;
        let mut file = OpenOptions::new().write(true).open(&path)?;
        file.write_all(line.as_bytes())?;
    }

    Ok(())
}

/// Extract the value of `--agent` from process arguments.
fn parse_agent_arg() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    let pos = args.iter().position(|a| a == "--agent")?;
    args.get(pos + 1).cloned()
}
