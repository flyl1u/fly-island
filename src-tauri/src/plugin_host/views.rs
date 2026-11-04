//! What plugins show on the island (API version 2): the models of their views
//! (`view.update`, `view.patch`) and their status texts (`status.update`).
//! The island window draws them from templates; this only keeps the latest
//! value of each, limits how often the window hears about a change, and hands
//! the user's actions back to the plugin.
//!
//! A view's model is sent to the window only while the view is on screen
//! (`set_plugin_view_visible`); status texts always are, for the collapsed bar.
//! When a plugin process starts or stops, its models and texts are dropped.

use serde::Serialize;
use serde_json::{json, Map, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::{Mutex, OnceLock},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter};

use super::{
    host, lock,
    manifest::{LocalizedText, PluginRuntime},
    runtime::RuntimeStatus,
    view_specs::{StatusItemSpec, ViewSpec, ViewTemplate},
};
use crate::island;

/// Sent to the island window. Mirrored by `PLUGIN_VIEW_CHANGED_EVENT` in
/// src/features/plugin-views/api.ts.
const VIEW_EVENT: &str = "plugin-view-changed";
pub(super) const MAX_MODEL_BYTES: usize = 256 * 1024;
const MAX_VALUES_BYTES: usize = 64 * 1024;
/// At most one update per view (or status item) every GAP: 10 a second.
const GAP: Duration = Duration::from_millis(100);
pub(super) const MAX_STATUS_CHARS: usize = 24;
const MAX_TOOLTIP_CHARS: usize = 200;
const MAX_QUERY_CHARS: usize = 200;
const TONES: [&str; 4] = ["neutral", "accent", "warning", "danger"];

/// A plugin and one of its views or status items ("view:<id>" / "status:<id>").
type Slot = (String, String);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusText {
    text: String,
    tooltip: Option<String>,
    tone: &'static str,
}

#[derive(Default)]
struct Store {
    models: HashMap<Slot, Value>,
    status: HashMap<Slot, StatusText>,
    visible: HashSet<Slot>,
    /// Slots whose change waits for GAP to pass; the latest value is sent then.
    pending: HashSet<Slot>,
}

fn store() -> &'static Mutex<Store> {
    static STORE: OnceLock<Mutex<Store>> = OnceLock::new();
    STORE.get_or_init(Mutex::default)
}

fn slot(plugin_id: &str, kind: &str, id: &str) -> Slot {
    (plugin_id.to_string(), format!("{kind}:{id}"))
}

fn bad(message: impl Into<String>) -> (u16, String) {
    (400, message.into())
}

/// The plugin's declared views and status items.
fn declared(plugin_id: &str) -> Option<(Vec<ViewSpec>, Vec<StatusItemSpec>)> {
    let host = host().ok()?;
    let installed = lock(&host.installed);
    let manifest = installed.iter().find(|plugin| plugin.folder == plugin_id)?.manifest.as_ref().ok()?;
    Some((manifest.contributes.views.clone(), manifest.contributes.status_items.clone()))
}

fn view_id<'a>(plugin_id: &str, params: &'a Value) -> Result<&'a str, (u16, String)> {
    let id = params.get("viewId").and_then(Value::as_str).ok_or_else(|| bad("Expected \"viewId\" as a string."))?;
    let known = declared(plugin_id).is_some_and(|(views, _)| views.iter().any(|view| view.id == id));
    if known {
        Ok(id)
    } else {
        Err((404, format!("The plugin has no view \"{id}\" in contributes.views.")))
    }
}

fn check_size(model: &Value) -> Result<(), (u16, String)> {
    let size = serde_json::to_vec(model).map(|bytes| bytes.len()).unwrap_or(usize::MAX);
    if size > MAX_MODEL_BYTES {
        return Err((413, format!("The model is {size} bytes; at most {MAX_MODEL_BYTES}.")));
    }
    Ok(())
}

/// `view.update`, `view.patch` and `status.update` from `plugin_id`.
pub(super) fn answer(app: &AppHandle, plugin_id: &str, method: &str, params: &Value) -> Result<Value, (u16, String)> {
    match method {
        "view.update" => {
            let view = view_id(plugin_id, params)?;
            let model = params.get("model").filter(|model| model.is_object()).ok_or_else(|| bad("Expected \"model\" as an object."))?;
            check_size(model)?;
            let key = slot(plugin_id, "view", view);
            lock(store()).models.insert(key.clone(), model.clone());
            schedule(app, key);
            Ok(json!({}))
        }
        "view.patch" => {
            let view = view_id(plugin_id, params)?;
            let items = params.get("items").and_then(Value::as_array).ok_or_else(|| bad("Expected \"items\" as a list."))?;
            let key = slot(plugin_id, "view", view);
            let mut store = lock(store());
            let model = store.models.get(&key).ok_or_else(|| (409, "Send the view with view.update before patching it.".to_string()))?;
            let (next, missing) = patch_items(model, items)?;
            check_size(&next)?;
            store.models.insert(key.clone(), next);
            drop(store);
            schedule(app, key);
            Ok(json!({ "missing": missing }))
        }
        "status.update" => {
            let item = params.get("itemId").and_then(Value::as_str).ok_or_else(|| bad("Expected \"itemId\" as a string."))?;
            if !declared(plugin_id).is_some_and(|(_, items)| items.iter().any(|known| known.id == item)) {
                return Err((404, format!("The plugin has no status item \"{item}\" in contributes.statusItems.")));
            }
            let status = parse_status(params)?;
            let key = slot(plugin_id, "status", item);
            let mut store = lock(store());
            match status {
                Some(status) => store.status.insert(key.clone(), status),
                None => store.status.remove(&key),
            };
            drop(store);
            schedule(app, key);
            Ok(json!({}))
        }
        _ => Err((404, format!("Unknown method {method}."))),
    }
}

/// `{ text, tooltip?, tone? }`; an empty text clears the item.
pub(super) fn parse_status(params: &Value) -> Result<Option<StatusText>, (u16, String)> {
    let text = params.get("text").and_then(Value::as_str).ok_or_else(|| bad("Expected \"text\" as a string."))?.trim();
    if text.chars().count() > MAX_STATUS_CHARS {
        return Err(bad(format!("\"text\" may be at most {MAX_STATUS_CHARS} characters.")));
    }
    let tooltip = match params.get("tooltip") {
        None | Some(Value::Null) => None,
        Some(Value::String(tooltip)) if tooltip.chars().count() <= MAX_TOOLTIP_CHARS => Some(tooltip.clone()),
        Some(_) => return Err(bad(format!("\"tooltip\" must be a string of at most {MAX_TOOLTIP_CHARS} characters."))),
    };
    let tone = match params.get("tone") {
        None | Some(Value::Null) => "neutral",
        Some(value) => value
            .as_str()
            .and_then(|tone| TONES.iter().copied().find(|known| *known == tone))
            .ok_or_else(|| bad(format!("\"tone\" must be one of {}.", TONES.join(", "))))?,
    };
    Ok((!text.is_empty()).then(|| StatusText { text: text.to_string(), tooltip, tone }))
}

/// Replaces the items with the same `id` in `model.items` and every
/// `model.groups[].items`; returns the new model and the ids not found.
pub(super) fn patch_items(model: &Value, items: &[Value]) -> Result<(Value, Vec<String>), (u16, String)> {
    let mut by_id: Map<String, Value> = Map::new();
    for item in items {
        let id = item.get("id").and_then(Value::as_str).ok_or_else(|| bad("Every patched item needs an \"id\" string."))?;
        by_id.insert(id.to_string(), item.clone());
    }
    let mut next = model.clone();
    let mut found: HashSet<String> = HashSet::new();
    let mut replace = |list: &mut Value| {
        for entry in list.as_array_mut().into_iter().flatten() {
            let Some(id) = entry.get("id").and_then(Value::as_str).map(str::to_string) else { continue };
            if let Some(replacement) = by_id.get(&id) {
                *entry = replacement.clone();
                found.insert(id);
            }
        }
    };
    if let Some(list) = next.get_mut("items") {
        replace(list);
    }
    for group in next.get_mut("groups").and_then(Value::as_array_mut).into_iter().flatten() {
        if let Some(list) = group.get_mut("items") {
            replace(list);
        }
    }
    let missing = by_id.keys().filter(|id| !found.contains(*id)).cloned().collect();
    Ok((next, missing))
}

/// Sends the slot's latest value to the window after GAP, unless a send is
/// already waiting (which will carry this value).
fn schedule(app: &AppHandle, key: Slot) {
    if !lock(store()).pending.insert(key.clone()) {
        return;
    }
    let app = app.clone();
    let spawned = thread::Builder::new().name("plugin-view".into()).spawn(move || {
        thread::sleep(GAP);
        send(&app, &key);
    });
    if spawned.is_err() {
        lock(store()).pending.clear();
    }
}

fn send(app: &AppHandle, key: &Slot) {
    let (plugin_id, name) = key;
    let payload = {
        let mut store = lock(store());
        store.pending.remove(key);
        if let Some(view) = name.strip_prefix("view:") {
            if !store.visible.contains(key) {
                return;
            }
            json!({ "kind": "view", "pluginId": plugin_id, "viewId": view, "model": store.models.get(key) })
        } else if let Some(item) = name.strip_prefix("status:") {
            json!({ "kind": "status", "pluginId": plugin_id, "itemId": item, "status": store.status.get(key) })
        } else {
            return;
        }
    };
    let _ = app.emit_to(island::WINDOW_LABEL, VIEW_EVENT, payload);
}

/// The plugin process started, stopped or crashed: what it showed is gone,
/// and the window looks at the list again.
pub(super) fn runtime_changed(app: &AppHandle, plugin_id: &str, status: RuntimeStatus) {
    {
        let mut store = lock(store());
        store.models.retain(|(plugin, _), _| plugin != plugin_id);
        store.status.retain(|(plugin, _), _| plugin != plugin_id);
    }
    let _ = app.emit_to(island::WINDOW_LABEL, VIEW_EVENT, json!({ "kind": "reset", "pluginId": plugin_id, "status": status }));
}

/// The window shows or hides a view. Returns its model when it becomes visible.
pub(super) fn set_visible(plugin_id: &str, view: &str, visible: bool) -> Option<Value> {
    let key = slot(plugin_id, "view", view);
    let mut store = lock(store());
    if visible {
        store.visible.insert(key.clone());
        store.models.get(&key).cloned()
    } else {
        store.visible.remove(&key);
        None
    }
}

pub(super) fn check_view_values(values: &Value) -> Result<(), String> {
    if !values.is_object() {
        return Err("The form values must be an object.".into());
    }
    let size = serde_json::to_vec(values).map(|bytes| bytes.len()).unwrap_or(usize::MAX);
    if size > MAX_VALUES_BYTES {
        return Err("The form values are too large.".into());
    }
    Ok(())
}

pub(super) fn check_query(query: &str) -> Result<(), String> {
    if query.chars().count() > MAX_QUERY_CHARS {
        return Err(format!("The search text may be at most {MAX_QUERY_CHARS} characters."));
    }
    Ok(())
}

/// Ids users click on (actions, items): short and plain.
pub(super) fn is_action_id(id: &str) -> bool {
    (1..=128).contains(&id.len()) && id.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"-_.:/".contains(&byte))
}

pub(super) fn declares_view(plugin_id: &str, view: &str) -> bool {
    declared(plugin_id).is_some_and(|(views, _)| views.iter().any(|spec| spec.id == view))
}

/// One page a plugin adds. Mirrored by `PluginViewEntry` in src/features/plugin-views/api.ts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginViewEntry {
    plugin_id: String,
    plugin_name: LocalizedText,
    view_id: String,
    title: LocalizedText,
    icon: String,
    template: ViewTemplate,
    status: RuntimeStatus,
    error: Option<String>,
}

/// One status text. Mirrored by `PluginStatusEntry` in src/features/plugin-views/api.ts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginStatusEntry {
    plugin_id: String,
    item_id: String,
    priority: i32,
    #[serde(flatten)]
    text: StatusText,
}

/// Mirrored by `PluginViewsSnapshot` in src/features/plugin-views/api.ts.
#[derive(Debug, Clone, Serialize)]
pub struct PluginViewsSnapshot {
    views: Vec<PluginViewEntry>,
    status: Vec<PluginStatusEntry>,
}

/// The views of plugins that are switched on and allowed to run, with each
/// plugin's run state, and the status texts set now.
pub(super) fn snapshot() -> Result<PluginViewsSnapshot, String> {
    let host = host()?;
    let state = lock(&host.state).clone();
    let runtimes = lock(&host.runtimes).clone();
    let store = lock(store());
    let mut views = Vec::new();
    let mut status = Vec::new();
    for plugin in lock(&host.installed).iter() {
        let Ok(manifest) = &plugin.manifest else { continue };
        let on = state.plugins.get(&manifest.id).is_some_and(|grant| grant.enabled) && (plugin.builtin || state.allow_third_party);
        if !on || !matches!(manifest.runtime, PluginRuntime::Process { .. }) {
            continue;
        }
        let runtime = runtimes.get(&manifest.id).cloned().unwrap_or_default();
        for view in &manifest.contributes.views {
            views.push(PluginViewEntry {
                plugin_id: manifest.id.clone(),
                plugin_name: manifest.name.clone(),
                view_id: view.id.clone(),
                title: view.title.clone(),
                icon: view.icon.clone(),
                template: view.template,
                status: runtime.status,
                error: runtime.error.clone(),
            });
        }
        for item in &manifest.contributes.status_items {
            if let Some(text) = store.status.get(&slot(&manifest.id, "status", &item.id)) {
                status.push(PluginStatusEntry {
                    plugin_id: manifest.id.clone(),
                    item_id: item.id.clone(),
                    priority: item.priority,
                    text: text.clone(),
                });
            }
        }
    }
    Ok(PluginViewsSnapshot { views, status })
}
