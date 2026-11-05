//! Data plugins read from other parts of the island: `messages.list`
//! (messages:read) and the `media.changed` watcher (media:read). The modules
//! that own the data decide what plugins may see (their plugin_view.rs).

use serde_json::{json, Value};
use std::{
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::Duration,
};

use super::events;
use crate::{media_control, qq_mail, qq_notifications, wechat_reminders};

const MEDIA_POLL: Duration = Duration::from_secs(2);
const MEDIA_EVENT: &str = "media.changed";

/// Newest first; entries without a time go last.
pub(super) fn sort_messages(items: &mut [Value]) {
    items.sort_by_key(|item| std::cmp::Reverse(item["receivedAt"].as_i64().unwrap_or(i64::MIN)));
}

/// `messages.list`: QQ notifications, the pending WeChat reminder and QQ Mail,
/// from the sources the user switched on.
pub(super) fn messages_list() -> Result<Value, (u16, String)> {
    let mut items = qq_notifications::plugin_messages();
    items.extend(wechat_reminders::plugin_messages());
    items.extend(qq_mail::plugin_messages());
    sort_messages(&mut items);
    Ok(json!({ "items": items }))
}

/// Starts watching what plays, unless already watching. Called after a plugin
/// subscribes to `media.changed`; the watcher stops once nobody is subscribed.
pub(super) fn watch_media() {
    static WATCHING: AtomicBool = AtomicBool::new(false);
    if WATCHING.swap(true, Ordering::SeqCst) {
        return;
    }
    let started = thread::Builder::new().name("plugin-media-watch".into()).spawn(|| loop {
        let mut last: Option<Value> = None;
        while events::anyone_subscribed(MEDIA_EVENT) {
            if let Ok(now) = media_control::plugin_now_playing() {
                let key = media_control::now_playing_key(&now);
                // The first reading is the baseline; subscribers read the current state themselves.
                if last.as_ref().is_some_and(|previous| *previous != key) {
                    events::publish_known(MEDIA_EVENT, now);
                }
                last = Some(key);
            }
            thread::sleep(MEDIA_POLL);
        }
        WATCHING.store(false, Ordering::SeqCst);
        // A plugin that subscribed after the last check saw WATCHING still set
        // and started nothing: keep watching for it.
        if !events::anyone_subscribed(MEDIA_EVENT) || WATCHING.swap(true, Ordering::SeqCst) {
            return;
        }
    });
    if started.is_err() {
        WATCHING.store(false, Ordering::SeqCst);
    }
}
