//! Events plugins subscribe to with `events.subscribe` and receive as `event`
//! notifications. The island window reports changes with the Tauri event
//! `plugin-host-event` ({ name, payload }); bursts of one event are merged so
//! a plugin hears about it at most once per COALESCE.

use serde_json::Value;
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Listener};

use super::{host, lock};

/// Mirrored by `PLUGIN_HOST_EVENT` in src/features/plugins/api.ts.
const HOST_EVENT: &str = "plugin-host-event";
const COALESCE: Duration = Duration::from_millis(200);
/// At most this many events in one subscribe call.
pub(super) const MAX_SUBSCRIBE: usize = 16;

/// (event, the permission a plugin needs to subscribe to it). Listed in
/// plugins/schema/rpc.json too (checked by a test).
pub(super) const EVENTS: [(&str, Option<&str>); 6] = [
    ("todos.changed", Some("todos:read")),
    ("note.changed", Some("notes:read")),
    ("agentStatus.changed", Some("agent-status:read")),
    ("island.expanded", None),
    ("island.collapsed", None),
    ("app.locale.changed", None),
];

/// The event's static name and the permission it needs, or `None` if there is
/// no such event.
pub(super) fn event_permission(name: &str) -> Option<(&'static str, Option<&'static str>)> {
    EVENTS.iter().copied().find(|(event, _)| *event == name)
}

/// The latest payload of each event waiting for its COALESCE to pass.
fn pending() -> &'static Mutex<HashMap<&'static str, Value>> {
    static PENDING: OnceLock<Mutex<HashMap<&'static str, Value>>> = OnceLock::new();
    PENDING.get_or_init(Mutex::default)
}

pub(super) fn listen(app: &AppHandle) {
    app.listen(HOST_EVENT, |event| {
        let Ok(message) = serde_json::from_str::<Value>(event.payload()) else { return };
        let Some((name, _)) = message.get("name").and_then(Value::as_str).and_then(event_permission) else { return };
        let payload = message.get("payload").cloned().unwrap_or(Value::Object(Default::default()));
        publish(name, payload);
    });
}

/// For changes Rust notices itself (todos.json); unknown names are ignored.
pub(super) fn publish_known(name: &str, payload: Value) {
    if let Some((name, _)) = event_permission(name) {
        publish(name, payload);
    }
}

/// Sends `name` to subscribed plugins after COALESCE; later payloads in the
/// meantime replace earlier ones.
fn publish(name: &'static str, payload: Value) {
    if lock(pending()).insert(name, payload).is_some() {
        return;
    }
    let spawned = thread::Builder::new().name("plugin-event".into()).spawn(move || {
        thread::sleep(COALESCE);
        if let Some(payload) = lock(pending()).remove(name) {
            deliver(name, &payload);
        }
    });
    if spawned.is_err() {
        lock(pending()).remove(name);
    }
}

fn deliver(name: &str, payload: &Value) {
    let Ok(host) = host() else { return };
    for supervisor in lock(&host.supervisors).values() {
        supervisor.deliver_event(name, payload);
    }
}
