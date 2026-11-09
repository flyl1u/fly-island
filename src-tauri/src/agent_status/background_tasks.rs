//! Background tasks a Claude Code turn started (`run_in_background`, or a command moved to the
//! background) and that have not ended yet, read from the transcript (roadmap B11 task 7). A turn
//! that ends while one runs has not finished its work: Claude Code wakes the session when the task
//! ends. The tool result names the task's id; its end shows as a task notification carrying
//! `<task-id>`, or as TaskStop's "stopped task" result.

use serde_json::Value;

/// What a tool result says just before the id of a task it left running.
const STARTED: [&str; 2] = ["running in background with ID: ", "moved to the background (ID: "];
/// What the Agent tool answers when it starts a subagent in the background, and where the id is.
const SUBAGENT_LAUNCHED: &str = "Async agent launched";
const SUBAGENT_ID: &str = "agentId: ";

/// The id at the start of `text`: letters, digits, `-` and `_`.
fn leading_id(text: &str) -> Option<&str> {
    let end = text.find(|c: char| !(c.is_ascii_alphanumeric() || c == '-' || c == '_')).unwrap_or(text.len());
    (end > 0).then(|| &text[..end])
}

/// Ids of the background tasks the tool results of a Claude Code user record started.
pub(super) fn started_tasks(content: &Value) -> Vec<String> {
    let mut ids = Vec::new();
    for block in content.as_array().into_iter().flatten().filter(|block| block["type"] == "tool_result") {
        let texts: Vec<&str> = match &block["content"] {
            Value::String(text) => vec![text.as_str()],
            Value::Array(parts) => parts.iter().filter_map(|part| part["text"].as_str()).collect(),
            _ => Vec::new(),
        };
        for text in texts {
            // A background subagent (roadmap B6.4.2): its notification carries the agentId as
            // <task-id>. A foreground subagent's result names its agentId too (for resuming), but
            // it has already ended, so only a launch counts.
            if text.contains(SUBAGENT_LAUNCHED) {
                if let Some(id) = text.find(SUBAGENT_ID).and_then(|at| leading_id(&text[at + SUBAGENT_ID.len()..])) {
                    ids.push(id.to_string());
                }
            }
            for marker in STARTED {
                if let Some(id) = text.find(marker).and_then(|at| leading_id(&text[at + marker.len()..])) {
                    ids.push(id.to_string());
                }
            }
        }
    }
    ids
}

/// Ids of the background tasks a transcript line says have ended: task notifications, which are
/// queued and attached under several record types, and TaskStop's result.
pub(super) fn ended_tasks(line: &str) -> Vec<&str> {
    let mut ids = Vec::new();
    for (marker, needs) in [("<task-id>", "<status>"), ("stopped task: ", "")] {
        if !line.contains(needs) {
            continue;
        }
        let mut rest = line;
        while let Some(at) = rest.find(marker) {
            rest = &rest[at + marker.len()..];
            if let Some(id) = leading_id(rest) {
                ids.push(id);
            }
        }
    }
    ids
}

#[cfg(test)]
mod tests {
    use super::{ended_tasks, started_tasks};
    use serde_json::json;

    #[test]
    fn starts_and_ends_are_read_from_their_records() {
        let started = json!([
            {"type": "tool_result", "tool_use_id": "t1", "content": "Command running in background with ID: bb33es241. Output is being written to: x"},
            {"type": "tool_result", "tool_use_id": "t2", "content": [{"type": "text", "text": "Command did not complete within its 600s timeout and was moved to the background (ID: b08souj39)."}]},
            {"type": "tool_result", "tool_use_id": "t3", "content": "ok"},
        ]);
        assert_eq!(started_tasks(&started), ["bb33es241", "b08souj39"]);
        // Subagents: one started in the background counts, a finished foreground one does not.
        let subagents = json!([
            {"type": "tool_result", "tool_use_id": "t4", "content": [{"type": "text", "text": "Async agent launched successfully. (internal metadata)\nagentId: a21b612aff73df8b0 (internal ID)"}]},
            {"type": "tool_result", "tool_use_id": "t5", "content": [{"type": "text", "text": "Done: three findings.\nagentId: a0f1e2d3c4b5a6978 (use SendMessage to continue)"}]},
        ]);
        assert_eq!(started_tasks(&subagents), ["a21b612aff73df8b0"]);
        let finished = r#"{"type":"attachment","attachment":{"type":"queued_command","prompt":"<task-notification>\n<task-id>a21b612aff73df8b0</task-id>\n<tool-use-id>t4</tool-use-id>\n<status>completed</status>"}}"#;
        assert_eq!(ended_tasks(finished), ["a21b612aff73df8b0"]);
        let notified = r#"{"type":"queue-operation","content":"<task-notification>\n<task-id>bggwywldd</task-id>\n<status>completed</status>"}"#;
        assert_eq!(ended_tasks(notified), ["bggwywldd"]);
        assert_eq!(ended_tasks(r#"{"content":"{\"message\":\"Successfully stopped task: b08souj39 (f=...)\"}"}"#), ["b08souj39"]);
        // A prompt that merely mentions the tag is not an end.
        assert!(ended_tasks(r#"{"content":"what is <task-id>?"}"#).is_empty());
    }
}
