//! `contributes.views` and `contributes.statusItems` (API version 2): pages a
//! plugin adds to the expanded island and short texts it shows on the
//! collapsed bar. The island draws both from templates (views.rs, and
//! src/features/plugin-views/); plugins never send markup.

use serde::{Deserialize, Serialize};

use super::manifest::LocalizedText;

const MAX_VIEWS: usize = 2;
const MAX_STATUS_ITEMS: usize = 2;
const MAX_PRIORITY: i32 = 100;

/// lucide icon names a view may use; anything else is refused. Listed in
/// plugins/schema/manifest.schema.json and src/features/plugin-views/icons.ts
/// too (checked by tests).
pub(super) const VIEW_ICONS: [&str; 47] = [
    "list", "list-checks", "list-todo", "kanban", "square-check", "timer", "clock", "calendar", "bell", "book-open",
    "bookmark", "star", "heart", "folder", "file-text", "git-pull-request", "bug", "code", "terminal", "cloud", "sun",
    "music", "newspaper", "rss", "mail", "message-square", "globe", "link", "activity", "chart-column", "zap", "flame",
    "coffee", "puzzle", "gauge", "target", "trophy", "rocket", "sparkles", "inbox", "tag", "hash", "search", "house",
    "notebook", "circle-check", "info",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ViewTemplate {
    List,
    Detail,
    Form,
    Status,
}

/// One page on the island. Mirrored by `PluginViewSpec` in src/features/plugin-views/api.ts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ViewSpec {
    pub id: String,
    pub title: LocalizedText,
    #[serde(default = "default_icon")]
    pub icon: String,
    pub template: ViewTemplate,
}

fn default_icon() -> String {
    "puzzle".into()
}

/// One status text slot on the collapsed bar; the highest priority with text wins.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StatusItemSpec {
    pub id: String,
    #[serde(default)]
    pub priority: i32,
}

fn is_valid_id(id: &str) -> bool {
    (1..=32).contains(&id.len()) && id.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

fn read<T: serde::de::DeserializeOwned>(raw: &serde_json::Value, field: &str) -> Result<Vec<T>, String> {
    if raw.is_null() {
        return Ok(Vec::new());
    }
    serde_json::from_value(raw.clone()).map_err(|error| format!("contributes.{field} is not valid: {error}"))
}

/// Reads and checks the manifest's views and status items. Version 1 plugins
/// never had them, so whatever they wrote there is ignored, as before.
pub(super) fn check(
    views_raw: &serde_json::Value,
    status_raw: &serde_json::Value,
    api_version: u32,
) -> Result<(Vec<ViewSpec>, Vec<StatusItemSpec>), String> {
    if api_version < 2 {
        return Ok((Vec::new(), Vec::new()));
    }
    let views: Vec<ViewSpec> = read(views_raw, "views")?;
    let status_items: Vec<StatusItemSpec> = read(status_raw, "statusItems")?;
    if views.len() > MAX_VIEWS {
        return Err(format!("A plugin can add at most {MAX_VIEWS} views."));
    }
    for (index, view) in views.iter().enumerate() {
        if !is_valid_id(&view.id) || views[..index].iter().any(|earlier| earlier.id == view.id) {
            return Err(format!("View \"{}\" needs a unique id (letters, digits, '-', 1-32 characters).", view.id));
        }
        if !view.title.is_filled() {
            return Err(format!("View \"{}\" needs a title in both languages.", view.id));
        }
        if !VIEW_ICONS.contains(&view.icon.as_str()) {
            return Err(format!("View \"{}\" uses the icon \"{}\", which is not in the list of allowed icons.", view.id, view.icon));
        }
    }
    if status_items.len() > MAX_STATUS_ITEMS {
        return Err(format!("A plugin can add at most {MAX_STATUS_ITEMS} status items."));
    }
    for (index, item) in status_items.iter().enumerate() {
        if !is_valid_id(&item.id) || status_items[..index].iter().any(|earlier| earlier.id == item.id) {
            return Err(format!("Status item \"{}\" needs a unique id (letters, digits, '-', 1-32 characters).", item.id));
        }
        if item.priority.abs() > MAX_PRIORITY {
            return Err(format!("Status item \"{}\" has a priority outside -{MAX_PRIORITY}..{MAX_PRIORITY}.", item.id));
        }
    }
    Ok((views, status_items))
}
