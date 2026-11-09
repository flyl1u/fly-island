//! An agent's own task list, for the progress on its session row (roadmap B6.5.4): Claude Code
//! writes the whole list with each `TodoWrite` call, Codex with each `update_plan` call. The
//! newest call is the list as it stands. Pure; both formats are undocumented, so anything
//! unexpected reads as no list.

use serde::Serialize;
use serde_json::Value;

use super::title::shorten;

/// Longest step text shown on the row.
const STEP_MAX_CHARS: usize = 60;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoProgress {
    pub(super) done: u32,
    pub(super) total: u32,
    /// The step in progress (Claude Code's `activeForm`, else its text); `None` between steps.
    pub(super) current: Option<String>,
}

/// Counts steps given as (text, text while it runs, status).
fn progress<'a>(steps: impl Iterator<Item = (&'a str, Option<&'a str>, &'a str)>) -> Option<TodoProgress> {
    let mut result = TodoProgress { done: 0, total: 0, current: None };
    for (text, active, status) in steps {
        result.total += 1;
        match status {
            "completed" => result.done += 1,
            "in_progress" if result.current.is_none() => {
                result.current = shorten(active.filter(|active| !active.trim().is_empty()).unwrap_or(text), STEP_MAX_CHARS);
            }
            _ => {}
        }
    }
    (result.total > 0).then_some(result)
}

/// The list in a Claude Code assistant message's `TodoWrite` call, if it makes one.
pub(super) fn claude_todo_list(content: &Value) -> Option<TodoProgress> {
    let call = content
        .as_array()?
        .iter()
        .rev()
        .find(|block| block["type"] == "tool_use" && block["name"] == "TodoWrite")?;
    let todos = call["input"]["todos"].as_array()?;
    progress(todos.iter().filter_map(|todo| {
        Some((todo["content"].as_str()?, todo["activeForm"].as_str(), todo["status"].as_str().unwrap_or_default()))
    }))
}

/// The plan in a Codex `response_item` payload's `update_plan` call, if it is one.
pub(super) fn codex_plan(payload: &Value) -> Option<TodoProgress> {
    if payload["type"] != "function_call" || payload["name"] != "update_plan" {
        return None;
    }
    let arguments = serde_json::from_str::<Value>(payload["arguments"].as_str()?).ok()?;
    let plan = arguments["plan"].as_array()?;
    progress(plan.iter().filter_map(|step| Some((step["step"].as_str()?, None, step["status"].as_str().unwrap_or_default()))))
}

/// A list worth showing: not every step done (a finished list is just noise on the row).
pub(super) fn unfinished(list: Option<TodoProgress>) -> Option<TodoProgress> {
    list.filter(|list| list.done < list.total)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn claude_todo_write_counts_steps_and_names_the_running_one() {
        let content = json!([{ "type": "tool_use", "name": "TodoWrite", "input": { "todos": [
            { "content": "Read the code", "activeForm": "Reading the code", "status": "completed" },
            { "content": "Write the parser", "activeForm": "Writing the parser", "status": "in_progress" },
            { "content": "Test it", "activeForm": "Testing it", "status": "pending" },
        ] } }]);
        assert_eq!(
            claude_todo_list(&content),
            Some(TodoProgress { done: 1, total: 3, current: Some("Writing the parser".into()) })
        );
        assert_eq!(claude_todo_list(&json!([{ "type": "tool_use", "name": "Bash", "input": {} }])), None);
        assert_eq!(claude_todo_list(&json!([{ "type": "tool_use", "name": "TodoWrite", "input": { "todos": [] } }])), None);
    }

    #[test]
    fn codex_update_plan_counts_steps() {
        let payload = json!({ "type": "function_call", "name": "update_plan", "arguments":
            "{\"plan\":[{\"step\":\"Find the bug\",\"status\":\"completed\"},{\"step\":\"Fix it\",\"status\":\"in_progress\"}]}" });
        assert_eq!(codex_plan(&payload), Some(TodoProgress { done: 1, total: 2, current: Some("Fix it".into()) }));
        assert_eq!(codex_plan(&json!({ "type": "function_call", "name": "shell", "arguments": "{}" })), None);
    }

    #[test]
    fn a_finished_list_is_not_shown() {
        assert_eq!(unfinished(Some(TodoProgress { done: 2, total: 2, current: None })), None);
        assert!(unfinished(Some(TodoProgress { done: 1, total: 2, current: None })).is_some());
    }
}
