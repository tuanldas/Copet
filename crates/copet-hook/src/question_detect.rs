//! Detects when an agent ended its turn by ASKING the user something, so a
//! `Stop`/`SubagentStop` that looks "done" is reclassified to `waiting` (the pet
//! shows "needs input"). Ported from agentpet's QuestionDetector.
//!
//! Input is the assistant's end-of-turn prose (`AgentEvent.last_message`): Codex
//! supplies it inline (`last_assistant_message`), Claude via opt-in transcript
//! enrichment. When `last_message` is absent the reclassification is a no-op, so
//! agents/sessions without narration keep their original `Done`.
//!
//! This module is the orchestrator's, NOT a `map_*` parser — it may depend on
//! `copet_protocol` (the `#[path]` integration-test purity rule applies only to
//! `map_claude/codex/gemini`).

use copet_protocol::{AgentEvent, State};

/// Phrases that, when starting the LAST sentence, signal a question/request for
/// direction even without a trailing `?`.
const QUESTION_STARTERS: &[&str] = &[
    "which ", "what ", "how ", "should i", "do you", "want me to", "shall i",
    "would you", "can you", "could you", "are you",
];

/// Polite sign-off tails that look interrogative but are really completion
/// summaries — these keep the turn as `Done` (e.g. "…let me know if you'd like
/// changes.").
const OPTIONAL_FOLLOW_UPS: &[&str] = &[
    "let me know if",
    "let me know when",
    "feel free to",
    "if you'd like any",
    "if you want any",
    "if you want to",
    "if you'd like to",
    "if you need any",
    "say which one",
    "say the word",
    "if anything else",
    "happy to help",
    "happy to make",
    "don't hesitate",
    "just let me know",
];

/// Reclassify a finished turn to `Waiting` when its narration is a question.
/// No-op unless `state == Done` and `last_message` looks like a question — so an
/// absent narration (no opt-in / agent without inline text) keeps `Done`.
pub fn apply(event: &mut AgentEvent) {
    if event.state != State::Done {
        return;
    }
    if let Some(text) = event.last_message.as_deref() {
        if looks_like_question(text) {
            event.state = State::Waiting;
        }
    }
}

/// True when the LAST sentence is a direct question or request for direction.
/// Completion summaries with an optional "let me know if…" tail count as done.
pub fn looks_like_question(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }
    let last = last_sentence(trimmed).to_lowercase();
    if last.is_empty() {
        return false;
    }
    if OPTIONAL_FOLLOW_UPS.iter().any(|p| last.contains(p)) {
        return false;
    }
    last.ends_with('?') || QUESTION_STARTERS.iter().any(|s| last.starts_with(s))
}

/// The last sentence of `text` (split on `.`/`!`/`?`, newlines normalised to
/// spaces). Falls back to the whole string when there is no terminator.
fn last_sentence(text: &str) -> String {
    let normalized = text.replace('\n', " ");
    let normalized = normalized.trim();
    let mut segments: Vec<String> = Vec::new();
    let mut current = String::new();
    for ch in normalized.chars() {
        current.push(ch);
        if ch == '.' || ch == '!' || ch == '?' {
            let s = current.trim().to_string();
            if !s.is_empty() {
                segments.push(s);
            }
            current.clear();
        }
    }
    let rest = current.trim();
    if !rest.is_empty() {
        segments.push(rest.to_string());
    }
    segments.pop().unwrap_or_else(|| normalized.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn done_event(last: Option<&str>) -> AgentEvent {
        AgentEvent {
            agent: copet_protocol::Agent::Codex,
            session_id: "s".into(),
            state: State::Done,
            tool: None,
            project: None,
            tool_input: None,
            cwd_full: None,
            message: None,
            prompt: None,
            model: None,
            summary: None,
            last_message: last.map(str::to_owned),
            tokens_in: None,
            tokens_out: None,
            ended: false,
            ts: 0,
        }
    }

    // ── looks_like_question ──────────────────────────────────────────────

    #[test]
    fn direct_question_mark_is_question() {
        assert!(looks_like_question("Which file should I edit?"));
    }

    #[test]
    fn starter_without_question_mark_is_question() {
        assert!(looks_like_question("Want me to continue with the migration"));
    }

    #[test]
    fn plain_completion_is_not_a_question() {
        assert!(!looks_like_question("I've completed the refactoring."));
    }

    #[test]
    fn optional_follow_up_tail_is_not_a_question() {
        // Ends interrogative-ish but is a sign-off, not a real ask.
        assert!(!looks_like_question(
            "Done. Let me know if you want any changes."
        ));
    }

    #[test]
    fn only_the_last_sentence_counts() {
        // A question earlier, but the final sentence is a statement → done.
        assert!(!looks_like_question(
            "Should I refactor this? I went ahead and did it."
        ));
    }

    #[test]
    fn last_sentence_question_after_statements_is_question() {
        assert!(looks_like_question(
            "I finished the first part. What should I tackle next?"
        ));
    }

    #[test]
    fn empty_or_whitespace_is_not_a_question() {
        assert!(!looks_like_question(""));
        assert!(!looks_like_question("   \n  "));
    }

    #[test]
    fn multiline_narration_uses_last_sentence() {
        assert!(looks_like_question("Here is the plan.\nShould I proceed?"));
    }

    // ── apply (orchestrator seam) ────────────────────────────────────────

    #[test]
    fn apply_reclassifies_done_question_to_waiting() {
        let mut ev = done_event(Some("Which approach do you prefer?"));
        apply(&mut ev);
        assert_eq!(ev.state, State::Waiting);
    }

    #[test]
    fn apply_keeps_done_for_statement() {
        let mut ev = done_event(Some("All tests pass."));
        apply(&mut ev);
        assert_eq!(ev.state, State::Done);
    }

    #[test]
    fn apply_keeps_done_when_no_narration() {
        let mut ev = done_event(None);
        apply(&mut ev);
        assert_eq!(ev.state, State::Done);
    }

    #[test]
    fn apply_ignores_non_done_states() {
        // A working turn whose (stale) last_message is a question must NOT flip.
        let mut ev = done_event(Some("What now?"));
        ev.state = State::Working;
        apply(&mut ev);
        assert_eq!(ev.state, State::Working);
    }
}
