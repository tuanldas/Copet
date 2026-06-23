//! Transcript enrichment for Claude Code (opt-in, privacy-sensitive).
//!
//! Claude Code passes `transcript_path` (a conversation JSONL file) in its hook
//! payload. When the user opts in (`~/.copet/hook-config.json` → `read_transcript`),
//! we read a bounded tail of that file and extract: model, task title (ai-title),
//! last assistant text, and token usage — then attach them to the AgentEvent.
//!
//! Privacy + performance constraints:
//! - OFF by default; only runs when the config flag is explicitly true.
//! - Reads at most `TAIL_CAP_BYTES` from the end (bounded work on multi-MB files).
//! - Caps the length of extracted text; never logs raw conversation.
//! - Any error (missing/corrupt file, bad JSON) → fields stay None; never panics
//!   and never blocks the agent.
//!
//! Real Claude Code JSONL schema (verified):
//! - `{"type":"assistant","message":{"model":"claude-...","content":[{"type":"text","text":"..."}|{"type":"tool_use",...}],"usage":{"input_tokens":N,"cache_read_input_tokens":N,"cache_creation_input_tokens":N,"output_tokens":N}}}`
//! - `{"type":"ai-title","aiTitle":"...","sessionId":"..."}`

use copet_protocol::{copet_config_path, AgentEvent};

/// Max bytes read from the end of the transcript (bounds per-event work).
const TAIL_CAP_BYTES: u64 = 256 * 1024;
const MAX_MODEL: usize = 60;
const MAX_SUMMARY: usize = 120;
const MAX_MESSAGE: usize = 200;

/// Fields extracted from a transcript tail. All optional / best-effort.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct TranscriptInfo {
    pub model: Option<String>,
    pub summary: Option<String>,
    pub last_message: Option<String>,
    pub tokens_in: Option<u64>,
    pub tokens_out: Option<u64>,
}

/// Read the user's opt-in flag from `~/.copet/hook-config.json`.
/// Missing file / key / parse error → false (default OFF).
pub fn transcript_enabled() -> bool {
    let Some(path) = copet_config_path() else {
        return false;
    };
    let Ok(content) = std::fs::read_to_string(&path) else {
        return false;
    };
    serde_json::from_str::<serde_json::Value>(&content)
        .ok()
        .and_then(|v| v.get("read_transcript").and_then(|b| b.as_bool()))
        .unwrap_or(false)
}

/// If opt-in is enabled and the payload carries a `transcript_path`, read the
/// transcript and attach model/summary/last_message/tokens to `event`.
/// No-op (event unchanged) when disabled or anything goes wrong.
pub fn maybe_enrich(event: &mut AgentEvent, raw_json: &str) {
    if !transcript_enabled() {
        return;
    }
    let Some(path) = serde_json::from_str::<serde_json::Value>(raw_json)
        .ok()
        .and_then(|v| {
            v.get("transcript_path")
                .and_then(|p| p.as_str())
                .map(str::to_owned)
        })
    else {
        return;
    };
    let info = read_transcript(&path);
    event.model = info.model;
    event.summary = info.summary;
    event.last_message = info.last_message;
    event.tokens_in = info.tokens_in;
    event.tokens_out = info.tokens_out;
}

/// Read a bounded tail of `path` and parse it. Missing/unreadable → default.
pub fn read_transcript(path: &str) -> TranscriptInfo {
    match read_tail(path, TAIL_CAP_BYTES) {
        Some(content) => parse_transcript(&content),
        None => TranscriptInfo::default(),
    }
}

/// Read at most `cap` bytes from the END of the file. When we start mid-file the
/// first (partial) line is dropped so we never feed a truncated JSON line in.
fn read_tail(path: &str, cap: u64) -> Option<String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = std::fs::File::open(path).ok()?;
    let len = f.metadata().ok()?.len();
    let start = len.saturating_sub(cap);
    f.seek(SeekFrom::Start(start)).ok()?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).ok()?;
    let s = String::from_utf8_lossy(&buf).into_owned();
    if start > 0 {
        if let Some(nl) = s.find('\n') {
            return Some(s[nl + 1..].to_owned());
        }
    }
    Some(s)
}

/// Parse JSONL lines, taking the LAST occurrence of each field (most recent).
/// Pure (no IO) so it is directly unit-testable on a string fixture.
fn parse_transcript(content: &str) -> TranscriptInfo {
    let mut info = TranscriptInfo::default();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
            continue; // skip corrupt line, keep going
        };
        match v.get("type").and_then(|t| t.as_str()) {
            Some("assistant") => {
                let Some(msg) = v.get("message") else { continue };
                if let Some(model) = msg.get("model").and_then(|m| m.as_str()) {
                    info.model = clip(model, MAX_MODEL);
                }
                if let Some(usage) = msg.get("usage") {
                    let g = |k: &str| usage.get(k).and_then(|x| x.as_u64()).unwrap_or(0);
                    info.tokens_in = Some(
                        g("input_tokens")
                            + g("cache_read_input_tokens")
                            + g("cache_creation_input_tokens"),
                    );
                    info.tokens_out = Some(g("output_tokens"));
                }
                if let Some(text) = extract_text(msg) {
                    info.last_message = clip(&text, MAX_MESSAGE);
                }
            }
            Some("ai-title") => {
                if let Some(title) = v.get("aiTitle").and_then(|t| t.as_str()) {
                    info.summary = clip(title, MAX_SUMMARY);
                }
            }
            _ => {}
        }
    }
    info
}

/// Concatenate the `text` blocks of an assistant `message.content` array.
fn extract_text(msg: &serde_json::Value) -> Option<String> {
    let blocks = msg.get("content")?.as_array()?;
    let mut out = String::new();
    for b in blocks {
        if b.get("type").and_then(|t| t.as_str()) == Some("text") {
            if let Some(t) = b.get("text").and_then(|t| t.as_str()) {
                if !out.is_empty() {
                    out.push(' ');
                }
                out.push_str(t);
            }
        }
    }
    if out.trim().is_empty() {
        None
    } else {
        Some(out)
    }
}

/// Trim then truncate to `max` chars (UTF-8 safe), ellipsis on cut.
/// None for empty/whitespace-only input. (Local copy: map_claude.rs keeps its
/// own so it stays self-contained for the #[path]-included integration tests.)
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

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"
{"type":"user","message":{"role":"user","content":"hi"}}
{"type":"ai-title","aiTitle":"Add dark mode toggle","sessionId":"s1"}
{"type":"assistant","message":{"model":"claude-sonnet-4-6","content":[{"type":"text","text":"Working on it"}],"usage":{"input_tokens":10,"cache_read_input_tokens":1000,"cache_creation_input_tokens":200,"output_tokens":50}}}
{"type":"assistant","message":{"model":"claude-opus-4-8","content":[{"type":"tool_use","name":"Bash","input":{}}],"usage":{"input_tokens":2,"cache_read_input_tokens":5000,"cache_creation_input_tokens":0,"output_tokens":80}}}
"#;

    #[test]
    fn extracts_model_from_last_assistant() {
        // Last assistant line is tool_use only → model is the most recent (opus).
        assert_eq!(parse_transcript(SAMPLE).model.as_deref(), Some("claude-opus-4-8"));
    }

    #[test]
    fn extracts_summary_from_ai_title() {
        assert_eq!(parse_transcript(SAMPLE).summary.as_deref(), Some("Add dark mode toggle"));
    }

    #[test]
    fn last_message_takes_last_assistant_with_text() {
        // The opus line has no text block → falls back to the previous assistant text.
        assert_eq!(parse_transcript(SAMPLE).last_message.as_deref(), Some("Working on it"));
    }

    #[test]
    fn tokens_sum_input_and_cache_from_last_usage() {
        let info = parse_transcript(SAMPLE);
        // Last assistant usage: 2 + 5000 + 0 = 5002 in, 80 out.
        assert_eq!(info.tokens_in, Some(5002));
        assert_eq!(info.tokens_out, Some(80));
    }

    #[test]
    fn corrupt_lines_are_skipped() {
        let input = "not json\n{\"type\":\"ai-title\",\"aiTitle\":\"OK\"}\n{bad";
        assert_eq!(parse_transcript(input).summary.as_deref(), Some("OK"));
    }

    #[test]
    fn empty_or_unknown_yields_default() {
        assert_eq!(parse_transcript(""), TranscriptInfo::default());
        assert_eq!(parse_transcript("{\"type\":\"system\"}\n"), TranscriptInfo::default());
    }

    #[test]
    fn long_message_truncated_utf8_safe() {
        let long = "é".repeat(300);
        let line = format!(
            r#"{{"type":"assistant","message":{{"model":"m","content":[{{"type":"text","text":"{long}"}}],"usage":{{"output_tokens":1}}}}}}"#
        );
        let msg = parse_transcript(&line).last_message.unwrap();
        assert!(msg.ends_with('…'));
        assert_eq!(msg.chars().count(), MAX_MESSAGE + 1);
    }

    #[test]
    fn missing_file_returns_default() {
        assert_eq!(read_transcript("/no/such/copet/transcript.jsonl"), TranscriptInfo::default());
    }

    #[test]
    fn read_tail_drops_partial_first_line() {
        // Write a temp file larger than the cap and confirm we still parse the
        // trailing complete lines (the partial head line is dropped).
        let dir = std::env::temp_dir();
        let path = dir.join("copet_tail_test_unique.jsonl");
        let mut body = String::new();
        for i in 0..50 {
            body.push_str(&format!(
                "{{\"type\":\"assistant\",\"message\":{{\"model\":\"m{i}\",\"content\":[],\"usage\":{{\"output_tokens\":{i}}}}}}}\n"
            ));
        }
        std::fs::write(&path, &body).unwrap();
        let info = read_transcript(path.to_str().unwrap());
        // Last line wins → model "m49", output 49.
        assert_eq!(info.model.as_deref(), Some("m49"));
        assert_eq!(info.tokens_out, Some(49));
        let _ = std::fs::remove_file(&path);
    }
}
