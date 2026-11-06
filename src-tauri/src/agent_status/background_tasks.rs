//! Background tasks a Claude Code turn started (`run_in_background`, or a command moved to the
//! background) and that have not ended yet, read from the transcript (roadmap B11 task 7). A turn
//! that ends while one runs has not finished its work: Claude Code wakes the session when the task
//! ends. The tool result names the task's id; its end shows as a task notification carrying
//! `<task-id>`, or as TaskStop's "stopped task" result.

use serde_json::Value;

/// What a tool result says just before the id of a task it left running.
const STARTED: [&str; 2] = ["running in background with ID: ", "moved to the background (ID: "];

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
        let notified = r#"{"type":"queue-operation","content":"<task-notification>\n<task-id>bggwywldd</task-id>\n<status>completed</status>"}"#;
        assert_eq!(ended_tasks(notified), ["bggwywldd"]);
        assert_eq!(ended_tasks(r#"{"content":"{\"message\":\"Successfully stopped task: b08souj39 (f=...)\"}"}"#), ["b08souj39"]);
        // A prompt that merely mentions the tag is not an end.
        assert!(ended_tasks(r#"{"content":"what is <task-id>?"}"#).is_empty());
    }
}
