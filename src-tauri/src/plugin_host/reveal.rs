//! `island.openView { viewId }` (capability `openView`): a plugin opens one of
//! its own pages on the island, e.g. after a sign-in link came back (onUri) or
//! the user clicked a button of its message. So that plugins cannot pop the
//! island open on their own, it works only within OPEN_WINDOW of the user
//! doing something with the plugin: a command or its shortcut, a message
//! button, a link, or an action, form or webview message on one of its pages.

use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

use super::{host, lock};
use crate::island;

pub(super) const OPEN_WINDOW: Duration = Duration::from_secs(15);
/// Mirrored by `PLUGIN_OPEN_VIEW_EVENT` in src/features/plugin-views/api.ts.
const OPEN_VIEW_EVENT: &str = "plugin-open-view";
/// What the island sends a plugin because the user did something.
const USER_ACTIONS: [&str; 6] = ["command", "notification.action", "uri", "view.action", "view.submit", "webview.message"];

fn last_actions() -> &'static Mutex<HashMap<String, Instant>> {
    static LAST: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
    LAST.get_or_init(Mutex::default)
}

/// Called for everything the island sends a plugin (lifecycle::deliver).
pub(super) fn note_delivery(plugin_id: &str, method: &str) {
    if USER_ACTIONS.contains(&method) {
        lock(last_actions()).insert(plugin_id.to_string(), Instant::now());
    }
}

/// Whether a plugin whose user last acted at `last` may open a page `now`.
pub(super) fn may_open(last: Option<Instant>, now: Instant) -> bool {
    last.is_some_and(|last| now.saturating_duration_since(last) <= OPEN_WINDOW)
}

/// Shows the island and opens the plugin's page `viewId`.
pub(super) fn open_view(app: &AppHandle, plugin_id: &str, params: &Value) -> Result<Value, (u16, String)> {
    let view_id = params.get("viewId").and_then(Value::as_str).ok_or((400, "Expected { viewId }.".to_string()))?;
    let declared = {
        let host = host().map_err(|error| (500, error))?;
        let installed = lock(&host.installed);
        installed
            .iter()
            .find(|plugin| plugin.folder == plugin_id)
            .and_then(|plugin| plugin.manifest.as_ref().ok())
            .is_some_and(|manifest| manifest.contributes.views.iter().any(|view| view.id == view_id))
    };
    if !declared {
        return Err((404, format!("\"{view_id}\" is not one of the plugin's contributes.views.")));
    }
    if !may_open(lock(last_actions()).get(plugin_id).copied(), Instant::now()) {
        return Err((
            403,
            format!(
                "A plugin opens its page only within {} s of the user using it (a command, a message button, a link or its page).",
                OPEN_WINDOW.as_secs()
            ),
        ));
    }
    island::show_island(app).map_err(|error| (500, error))?;
    app.emit_to(island::WINDOW_LABEL, OPEN_VIEW_EVENT, json!({ "pluginId": plugin_id, "viewId": view_id }))
        .map_err(|error| (500, error.to_string()))?;
    Ok(json!({}))
}

#[cfg(test)]
mod tests {
    use super::{may_open, OPEN_WINDOW};
    use std::time::{Duration, Instant};

    #[test]
    fn a_page_opens_only_soon_after_the_user_used_the_plugin() {
        let now = Instant::now() + OPEN_WINDOW * 2;
        assert!(!may_open(None, now), "never used");
        assert!(may_open(Some(now - Duration::from_secs(3)), now));
        assert!(may_open(Some(now - OPEN_WINDOW), now));
        assert!(!may_open(Some(now - OPEN_WINDOW - Duration::from_secs(1)), now));
    }
}
