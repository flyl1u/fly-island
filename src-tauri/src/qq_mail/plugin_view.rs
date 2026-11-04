//! What plugins with the sensitive `messages:read` permission see of QQ Mail:
//! sender and subject of the listed mail. Never the body, the address or the
//! authorization code.

use serde_json::{json, Value};

use super::{service, MailMessage, MailSnapshot};

fn entry(item: &MailMessage) -> Value {
    json!({
        "source": "qqMail",
        "id": item.id,
        "sender": item.sender,
        "preview": item.subject,
        "receivedAt": item.received_at,
        "unread": item.unread,
    })
}

/// The mail the island lists; empty while QQ Mail is off or not set up.
pub(crate) fn plugin_messages() -> Vec<Value> {
    let Ok(service) = service() else { return Vec::new() };
    let Ok(state) = service.lock() else { return Vec::new() };
    if !state.snapshot.enabled || !state.snapshot.configured {
        return Vec::new();
    }
    state.snapshot.items.iter().map(entry).collect()
}

/// `messages.received` for the mail that just arrived.
pub(super) fn publish_received(snapshot: &MailSnapshot, newest_id: Option<&str>) {
    let Some(item) = newest_id.and_then(|id| snapshot.items.iter().find(|item| item.id == id)) else { return };
    if snapshot.enabled {
        crate::plugin_host::publish_event("messages.received", entry(item));
    }
}
