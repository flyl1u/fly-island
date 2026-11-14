//! Bounded, de-duplicated buffer of recent QQ notifications.

use std::collections::HashMap;

use super::QQNotification;

pub(super) const MAX_ITEMS: usize = 20;

#[derive(Default)]
pub(super) struct NotificationBuffer {
    baseline: Option<HashMap<String, QQNotification>>,
    pub(super) items: Vec<QQNotification>,
}

impl NotificationBuffer {
    pub(super) fn sync(&mut self, mut current: Vec<QQNotification>) -> Option<String> {
        current.sort_by_key(|item| item.created_at);
        let mut newest = None;
        if let Some(previous) = &self.baseline {
            for item in &current {
                if previous.get(&item.id) != Some(item) {
                    self.items.retain(|existing| existing.id != item.id);
                    self.items.insert(0, item.clone());
                    self.items.truncate(MAX_ITEMS);
                    newest = Some(item.id.clone());
                }
            }
        }
        self.baseline = Some(
            current
                .into_iter()
                .map(|item| (item.id.clone(), item))
                .collect(),
        );
        newest
    }

    /// Drops every notification of one contact or group, which share the toast
    /// title, and keeps the others. The baseline is untouched, so they only come
    /// back when QQ posts something new for them.
    pub(super) fn dismiss_contact(&mut self, title: &str) -> bool {
        let before = self.items.len();
        self.items.retain(|item| item.title != title);
        self.items.len() != before
    }
}
