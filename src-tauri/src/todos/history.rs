//! Reading other days: `todos.list { date }`, `note.get { date }` and
//! `todos.days { from, to }`. A past day is read from its archive, a later day
//! from the scheduled list. Same rules and messages as
//! src/features/todos/todoHistory.ts.

use serde_json::{json, Map, Value};

use super::calls::CallError;
use super::model::{is_date, TodosData};

/// The `date` asked for: None for today (missing, or the list's own day).
fn asked_date(input: &Map<String, Value>, data: &TodosData) -> Result<Option<String>, CallError> {
    match input.get("date") {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(date)) if is_date(date) => Ok((*date != data.date).then(|| date.clone())),
        Some(_) => Err((400, "\"date\" must look like YYYY-MM-DD.".into())),
    }
}

fn no_archive(date: &str) -> CallError {
    (404, format!("Nothing was archived for {date}."))
}

/// `todos.list` for another day; None means today (answered as before).
pub(super) fn list(input: &Map<String, Value>, data: &TodosData) -> Result<Option<Value>, CallError> {
    let Some(date) = asked_date(input, data)? else { return Ok(None) };
    if date > data.date {
        let scheduled: Vec<_> = data.scheduled.iter().filter(|todo| todo.date == date).collect();
        return Ok(Some(json!({ "date": date, "todos": [], "scheduled": scheduled, "activeTodoId": null })));
    }
    let archive = data.archives.iter().find(|archive| archive.date == date).ok_or_else(|| no_archive(&date))?;
    Ok(Some(json!({ "date": date, "todos": archive.todos, "scheduled": [], "activeTodoId": null, "archived": true })))
}

/// `note.get` for another day; None means today.
pub(super) fn note(input: &Map<String, Value>, data: &TodosData) -> Result<Option<Value>, CallError> {
    let Some(date) = asked_date(input, data)? else { return Ok(None) };
    if date > data.date {
        return Err((400, "A note exists only for today and archived days.".into()));
    }
    let archive = data.archives.iter().find(|archive| archive.date == date).ok_or_else(|| no_archive(&date))?;
    Ok(Some(json!({ "date": date, "note": archive.daily_note, "archived": true })))
}

/// `todos.days { from, to }`: a summary of today and each archived day in the range, oldest first.
pub(super) fn days(input: &Map<String, Value>, data: &TodosData) -> Result<Value, CallError> {
    let bound = |key: &str| match input.get(key) {
        Some(Value::String(date)) if is_date(date) => Ok(date.clone()),
        _ => Err((400, "Send { from, to } as YYYY-MM-DD dates.".to_string())),
    };
    let (from, to) = (bound("from")?, bound("to")?);
    if from > to {
        return Err((400, "\"from\" must not be after \"to\".".into()));
    }
    let in_range = |date: &str| from.as_str() <= date && date <= to.as_str();
    let summary = |date: &str, todos: &[super::model::TodoItem], note: &str, archived: bool| {
        json!({
            "date": date,
            "total": todos.len(),
            "completed": todos.iter().filter(|todo| todo.completed).count(),
            "hasNote": !note.trim().is_empty(),
            "archived": archived,
        })
    };
    let mut days: Vec<(String, Value)> = data
        .archives
        .iter()
        .filter(|archive| in_range(&archive.date) && archive.date != data.date)
        .map(|archive| (archive.date.clone(), summary(&archive.date, &archive.todos, &archive.daily_note, true)))
        .collect();
    if in_range(&data.date) {
        days.push((data.date.clone(), summary(&data.date, &data.todos, &data.daily_note, false)));
    }
    days.sort_by(|left, right| left.0.cmp(&right.0));
    days.dedup_by(|left, right| left.0 == right.0);
    Ok(json!({ "days": days.into_iter().map(|(_, day)| day).collect::<Vec<_>>() }))
}
