//! Bounded, de-duplicated buffer of recent QQ notifications.

use std::collections::HashMap;

use super::*;

pub(super) const MAX_ITEMS: usize = 20;

#[derive(Default)]
pub(super) struct NotificationBuffer {
    pub(super) baseline: Option<HashMap<String, QQNotification>>,
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
}
