//! The todo and note calls of plugins and the local API (docs/local-api.md),
//! answered from todos.json. Same rules, messages and results as
//! src/features/todos/apiCommands.ts, which still answers them while the todos
//! are in localStorage.

use serde_json::{json, Number, Value};

use super::history;
use super::model::{is_date, ScheduledTodo, TodoItem, TodosData};

const MAX_TITLE_LENGTH: usize = 500;

/// A call's answer, and the data to save if it changed anything.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CallOutcome {
    pub result: Value,
    pub next: Option<TodosData>,
}

pub(crate) type CallError = (u16, String);

/// The methods answered here; anything else is not a todo call.
pub(crate) fn is_todo_call(method: &str) -> bool {
    matches!(method, "todos.list" | "todos.days" | "todos.add" | "todos.update" | "todos.remove" | "note.get" | "note.set")
}

fn bad(message: impl Into<String>) -> CallError {
    (400, message.into())
}

fn title_error() -> CallError {
    bad(format!("\"title\" must be a non-empty string of at most {MAX_TITLE_LENGTH} characters."))
}

/// A trimmed, non-empty title; length is counted like JavaScript (UTF-16 units).
fn read_title(value: Option<&Value>) -> Option<String> {
    let title = value?.as_str()?.trim();
    (!title.is_empty() && title.encode_utf16().count() <= MAX_TITLE_LENGTH).then(|| title.to_string())
}

/// `id` is a new todo id and `now` the time in ms, used only by `todos.add`.
pub(crate) fn run(method: &str, params: &Value, data: &TodosData, id: &str, now: u64) -> Result<CallOutcome, CallError> {
    let input = params.as_object().cloned().unwrap_or_default();
    let unchanged = |result: Value| Ok(CallOutcome { result, next: None });
    let changed = |result: Value, next: TodosData| Ok(CallOutcome { result, next: Some(next) });
    let target_id = input.get("id").and_then(Value::as_str);

    match method {
        "todos.list" if input.contains_key("date") => match history::list(&input, data)? {
            Some(day) => unchanged(day),
            None => run("todos.list", &Value::Null, data, id, now),
        },
        "todos.days" => unchanged(history::days(&input, data)?),
        "todos.list" => unchanged(json!({
            "date": data.date,
            "todos": data.todos,
            "scheduled": data.scheduled,
            "activeTodoId": data.active_todo_id,
        })),
        "todos.add" => {
            let title = read_title(input.get("title")).ok_or_else(title_error)?;
            let date = match input.get("date") {
                None => None,
                Some(Value::String(date)) if is_date(date) => Some(date.clone()),
                Some(_) => return Err(bad("\"date\" must look like YYYY-MM-DD.")),
            };
            let mut next = data.clone();
            match date {
                Some(date) if date < data.date => Err(bad(format!("\"date\" cannot be before the list's day ({}).", data.date))),
                Some(date) if date > data.date => {
                    let todo = ScheduledTodo { id: id.to_string(), title, date, created_at: Number::from(now) };
                    next.scheduled.push(todo.clone());
                    sort_scheduled(&mut next.scheduled);
                    changed(json!(todo), next)
                }
                _ => {
                    let todo = TodoItem { id: id.to_string(), title, completed: false, created_at: Number::from(now) };
                    next.todos.insert(0, todo.clone());
                    changed(json!(todo), next)
                }
            }
        }
        "todos.update" => {
            let index = target_id
                .and_then(|target| data.todos.iter().position(|todo| todo.id == target))
                .ok_or((404, "Todo not found.".to_string()))?;
            let mut todo = data.todos[index].clone();
            if input.contains_key("title") {
                todo.title = read_title(input.get("title")).ok_or_else(title_error)?;
            }
            match input.get("completed") {
                None => {}
                Some(Value::Bool(completed)) => todo.completed = *completed,
                Some(_) => return Err(bad("\"completed\" must be true or false.")),
            }
            let mut next = data.clone();
            next.todos[index] = todo.clone();
            // The island drops a finished todo from "in progress"; so does this.
            if todo.completed && next.active_todo_id.as_deref() == Some(todo.id.as_str()) {
                next.active_todo_id = None;
            }
            changed(json!(todo), next)
        }
        "todos.remove" => {
            let target = target_id
                .filter(|target| data.todos.iter().any(|todo| todo.id == *target))
                .ok_or((404, "Todo not found.".to_string()))?;
            let mut next = data.clone();
            next.todos.retain(|todo| todo.id != target);
            if next.active_todo_id.as_deref() == Some(target) {
                next.active_todo_id = None;
            }
            changed(json!({ "id": target }), next)
        }
        "note.get" => match history::note(&input, data)? {
            Some(day) => unchanged(day),
            None => unchanged(json!({ "date": data.date, "note": data.daily_note })),
        },
        "note.set" => {
            let note = input.get("note").and_then(Value::as_str);
            let append = input.get("append").and_then(Value::as_str);
            let daily_note = match (note, append) {
                (Some(note), None) => note.to_string(),
                (None, Some(append)) => [data.daily_note.as_str(), append]
                    .into_iter()
                    .filter(|part| !part.is_empty())
                    .collect::<Vec<_>>()
                    .join("\n"),
                _ => return Err(bad("Send either \"note\" (replace) or \"append\" (add a line), as a string.")),
            };
            let mut next = data.clone();
            next.daily_note = daily_note.clone();
            changed(json!({ "date": data.date, "note": daily_note }), next)
        }
        _ => Err((404, format!("Unknown method {method}."))),
    }
}

/// By date, then in the order they were added (schedule.ts sortScheduledTodos).
pub(crate) fn sort_scheduled(todos: &mut [ScheduledTodo]) {
    let time = |todo: &ScheduledTodo| todo.created_at.as_f64().unwrap_or(0.0);
    todos.sort_by(|a, b| a.date.cmp(&b.date).then(time(a).total_cmp(&time(b))));
}

/// Why the todos changed, for the `todos.changed` event; None if only the note
/// or the archives changed.
pub(crate) fn todos_reason(old: &TodosData, new: &TodosData) -> Option<&'static str> {
    if old.date != new.date {
        return Some("dayChanged");
    }
    let ids = |todos: &[TodoItem]| todos.iter().map(|todo| todo.id.clone()).collect::<Vec<_>>();
    let scheduled_ids = |todos: &[ScheduledTodo]| todos.iter().map(|todo| todo.id.clone()).collect::<Vec<_>>();
    let (old_ids, new_ids) = (ids(&old.todos), ids(&new.todos));
    let (old_later, new_later) = (scheduled_ids(&old.scheduled), scheduled_ids(&new.scheduled));
    if new_ids.iter().any(|id| !old_ids.contains(id)) || new_later.iter().any(|id| !old_later.contains(id)) {
        return Some("add");
    }
    if old_ids.iter().any(|id| !new_ids.contains(id)) || old_later.iter().any(|id| !new_later.contains(id)) {
        return Some("remove");
    }
    if old_ids != new_ids || old_later != new_later {
        return Some("reorder");
    }
    (old.todos != new.todos || old.scheduled != new.scheduled || old.active_todo_id != new.active_todo_id).then_some("update")
}

/// A random (version 4) UUID, the format crypto.randomUUID() gives the island.
pub(crate) fn new_todo_id() -> Result<String, String> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(|error| format!("Could not make a todo id: {error}"))?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    Ok(format!("{}-{}-{}-{}-{}", &hex[0..8], &hex[8..12], &hex[12..16], &hex[16..20], &hex[20..32]))
}
