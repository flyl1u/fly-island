//! The file shelf for plugins: `shelf.list` (sensitive `shelf:read`) and
//! `shelf.add` / `shelf.remove` (sensitive `shelf:write`). Only paths and what
//! the island shows about them; plugins never get file contents from here.

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use super::{current_unix_millis, describe, insert_items, service, FileShelfSnapshot};
use crate::island;

/// Sent to the island window after a plugin changed the shelf. Mirrored by
/// `FILE_SHELF_CHANGED_EVENT` in src/features/file-shelf/api.ts.
const CHANGED_EVENT: &str = "file-shelf-changed";
const MAX_PATHS: usize = 20;

fn answer(snapshot: Result<FileShelfSnapshot, String>) -> Result<Value, (u16, String)> {
    snapshot.map(|snapshot| json!(snapshot)).map_err(|error| (500, error))
}

/// Up to `MAX_PATHS` strings from `params[key]`.
pub(super) fn strings(params: &Value, key: &str) -> Result<Vec<String>, (u16, String)> {
    let bad = || (400, format!("\"{key}\" must be a list of 1-{MAX_PATHS} strings."));
    let list = params.get(key).and_then(Value::as_array).filter(|list| (1..=MAX_PATHS).contains(&list.len())).ok_or_else(bad)?;
    list.iter().map(|value| value.as_str().map(str::to_string).ok_or_else(bad)).collect()
}

pub(crate) fn plugin_shelf_list() -> Result<Value, (u16, String)> {
    answer(service().and_then(|service| service.update(|items| items)))
}

/// `shelf.add { paths }`: absolute paths of existing files or folders; others are skipped.
pub(crate) fn plugin_shelf_add(app: &AppHandle, params: &Value) -> Result<Value, (u16, String)> {
    let paths = strings(params, "paths")?;
    let now = current_unix_millis();
    let added: Vec<_> = paths.iter().filter_map(|path| describe(path, now)).collect();
    let service = service().map_err(|error| (503, error))?;
    let max_items = service.options().max_items;
    let result = answer(service.update(|items| insert_items(items, added, max_items)));
    let _ = app.emit_to(island::WINDOW_LABEL, CHANGED_EVENT, ());
    result
}

/// `shelf.remove { ids }`: takes entries off the shelf; the files stay where they are.
pub(crate) fn plugin_shelf_remove(app: &AppHandle, params: &Value) -> Result<Value, (u16, String)> {
    let ids = strings(params, "ids")?;
    let result = answer(service().and_then(|service| {
        service.update(|mut items| {
            items.retain(|item| !ids.contains(&item.id));
            items
        })
    }));
    let _ = app.emit_to(island::WINDOW_LABEL, CHANGED_EVENT, ());
    result
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{strings, MAX_PATHS};

    #[test]
    fn plugin_lists_must_be_short_lists_of_strings() {
        assert_eq!(strings(&json!({ "paths": ["C:\\a", "D:\\b"] }), "paths").expect("ok"), vec!["C:\\a", "D:\\b"]);
        for bad in [json!({}), json!({ "paths": [] }), json!({ "paths": "C:\\a" }), json!({ "paths": [1] })] {
            assert_eq!(strings(&bad, "paths").expect_err("bad").0, 400);
        }
        let many: Vec<String> = (0..=MAX_PATHS).map(|n| format!("C:\\{n}")).collect();
        assert!(strings(&json!({ "ids": many }), "ids").is_err());
    }
}
