//! `island.notify`: a plugin shows a short message in the collapsed island's
//! message preview, optionally with buttons the plugin hears about as a
//! `notification.action` notification.

use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

use super::{host, lock, manifest::LocalizedText};
use crate::island;

/// Mirrored by `PLUGIN_NOTIFICATION_EVENT` in src/features/plugins/api.ts.
const NOTIFICATION_EVENT: &str = "plugin-notification";
pub(super) const RATE_LIMIT: usize = 6;
const RATE_WINDOW: Duration = Duration::from_secs(60);
const MAX_TITLE: usize = 80;
const MAX_BODY: usize = 200;
const MAX_ACTIONS: usize = 2;
const MAX_ACTION_TITLE: usize = 16;
const DEFAULT_DURATION_MS: u64 = 5000;
const DURATION_MS: (u64, u64) = (2000, 15000);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(super) struct NotificationAction {
    pub id: String,
    pub title: String,
}

/// Mirrored by `PluginNotification` in src/features/plugins/api.ts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Notification {
    pub title: String,
    pub body: String,
    pub duration_ms: u64,
    pub actions: Vec<NotificationAction>,
}

/// Same rule as command ids: letters, digits and '-', 1 to 32 long.
pub(super) fn is_action_id(id: &str) -> bool {
    (1..=32).contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn text(params: &Value, key: &str, max: usize, required: bool) -> Result<String, String> {
    match params.get(key) {
        None | Some(Value::Null) if !required => Ok(String::new()),
        Some(Value::String(value)) => {
            let value = value.trim();
            if required && value.is_empty() {
                Err(format!("\"{key}\" must not be empty."))
            } else if value.chars().count() > max {
                Err(format!("\"{key}\" is longer than {max} characters."))
            } else {
                Ok(value.to_string())
            }
        }
        _ => Err(format!("\"{key}\" must be a string.")),
    }
}

/// Checks `{ title, body?, durationMs?, actions? }`.
pub(super) fn parse_notification(params: &Value) -> Result<Notification, String> {
    let title = text(params, "title", MAX_TITLE, true)?;
    let body = text(params, "body", MAX_BODY, false)?;
    let duration_ms = match params.get("durationMs") {
        None | Some(Value::Null) => DEFAULT_DURATION_MS,
        Some(value) => value
            .as_f64()
            .filter(|ms| ms.is_finite())
            .ok_or("\"durationMs\" must be a number.")?
            .clamp(DURATION_MS.0 as f64, DURATION_MS.1 as f64) as u64,
    };
    let actions = match params.get("actions") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) if items.len() <= MAX_ACTIONS => {
            let mut seen = HashSet::new();
            items
                .iter()
                .map(|item| {
                    let id = item.get("id").and_then(Value::as_str).unwrap_or_default();
                    if !is_action_id(id) || !seen.insert(id) {
                        return Err(format!("Action id \"{id}\" must be unique: letters, digits and '-', up to 32."));
                    }
                    Ok(NotificationAction { id: id.to_string(), title: text(item, "title", MAX_ACTION_TITLE, true)? })
                })
                .collect::<Result<_, String>>()?
        }
        Some(_) => return Err(format!("\"actions\" must be a list of at most {MAX_ACTIONS}.")),
    };
    Ok(Notification { title, body, duration_ms, actions })
}

/// Drops times older than RATE_WINDOW and records `now` unless RATE_LIMIT
/// notifications were already shown in the window.
pub(super) fn take_slot(times: &mut VecDeque<Instant>, now: Instant) -> bool {
    while times.front().is_some_and(|time| now.duration_since(*time) >= RATE_WINDOW) {
        times.pop_front();
    }
    if times.len() >= RATE_LIMIT {
        return false;
    }
    times.push_back(now);
    true
}

fn shown_times() -> &'static Mutex<HashMap<String, VecDeque<Instant>>> {
    static SHOWN: OnceLock<Mutex<HashMap<String, VecDeque<Instant>>>> = OnceLock::new();
    SHOWN.get_or_init(Mutex::default)
}

/// Answers `island.notify` with `{ muted }`. Errors are (HTTP-like status, message).
pub(super) fn show(app: &AppHandle, plugin_id: &str, params: &Value) -> Result<Value, (u16, String)> {
    let notification = parse_notification(params).map_err(|message| (400, message))?;
    if !take_slot(lock(shown_times()).entry(plugin_id.to_string()).or_default(), Instant::now()) {
        return Err((429, format!("At most {RATE_LIMIT} notifications a minute.")));
    }
    let host = host().map_err(|message| (500, message))?;
    let muted = lock(&host.state).plugins.get(plugin_id).is_some_and(|grant| grant.notifications_muted);
    if !muted {
        let plugin_name: Option<LocalizedText> = lock(&host.installed)
            .iter()
            .find(|plugin| plugin.folder == plugin_id)
            .and_then(|plugin| plugin.manifest.as_ref().ok())
            .map(|manifest| manifest.name.clone());
        let mut payload = json!(notification);
        payload["pluginId"] = json!(plugin_id);
        payload["pluginName"] = json!(plugin_name);
        let _ = app.emit_to(island::WINDOW_LABEL, NOTIFICATION_EVENT, payload);
    }
    Ok(json!({ "muted": muted }))
}
