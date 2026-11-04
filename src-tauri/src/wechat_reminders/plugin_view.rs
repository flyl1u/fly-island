//! What plugins with the sensitive `messages:read` permission see of WeChat
//! reminders. The island only knows that WeChat's tray icon flashes, so there
//! is no sender or text: one entry while a reminder is pending.

use serde_json::{json, Value};
use std::sync::Mutex;

use super::{service, ReminderSnapshot};

fn entry(at: u64) -> Value {
    json!({ "source": "wechat", "id": format!("wechat-{at}"), "sender": null, "preview": null, "receivedAt": at })
}

/// The pending reminder, if any; empty while WeChat reminders are off.
pub(crate) fn plugin_messages() -> Vec<Value> {
    let Ok(service) = service() else { return Vec::new() };
    let Ok(state) = service.state.lock() else { return Vec::new() };
    let snapshot = &state.snapshot;
    match snapshot.last_attention_at {
        Some(at) if snapshot.enabled && snapshot.pending => vec![entry(at)],
        _ => Vec::new(),
    }
}

/// `messages.received` once per new reminder (status updates repeat the snapshot).
pub(super) fn publish_received(snapshot: &ReminderSnapshot) {
    static LAST: Mutex<Option<u64>> = Mutex::new(None);
    let Some(at) = snapshot.last_attention_at.filter(|_| snapshot.enabled && snapshot.pending) else { return };
    let Ok(mut last) = LAST.lock() else { return };
    if *last != Some(at) {
        *last = Some(at);
        crate::plugin_host::publish_event("messages.received", entry(at));
    }
}
