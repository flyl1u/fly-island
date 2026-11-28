use crate::plugin_host::{PluginContributions, PluginManifest};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex, PoisonError,
};

pub(super) const PLUGIN_ID: &str = "eye-care";

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BreakState {
    /// Unix milliseconds the break began; the windows count the rest up from here.
    pub started_at: i64,
    pub can_snooze: bool,
    pub can_skip: bool,
    /// 0–100 share of the break behind the user, as the plugin measured it; absent when it cannot.
    pub percent: Option<f64>,
    /// The break ran its full length: the windows stay, counting up, until the user acts.
    pub done: bool,
    pub language: &'static str,
}

/// Coalesce plugin updates while the UI is busy; a cancelled producer cannot overwrite its successor.
#[derive(Default)]
pub(super) struct PendingBreak {
    latest: Mutex<Option<(u64, Option<BreakState>)>>,
    queued: AtomicBool,
}

impl PendingBreak {
    pub fn queue(&self, session: u64, snapshot: Option<BreakState>) -> bool {
        let mut latest = self.latest.lock().unwrap_or_else(PoisonError::into_inner);
        if latest
            .as_ref()
            .is_some_and(|(current, _)| *current > session)
        {
            return false;
        }
        *latest = Some((session, snapshot));
        !self.queued.swap(true, Ordering::AcqRel)
    }

    pub fn take(&self) -> Option<(u64, Option<BreakState>)> {
        let mut latest = self.latest.lock().unwrap_or_else(PoisonError::into_inner);
        let value = latest.take();
        self.queued.store(false, Ordering::Release);
        value
    }
}

/// Old eye-care executables still own native windows; never open a second set for them.
pub(crate) fn supports_host_windows(manifest: &PluginManifest) -> bool {
    manifest.id == PLUGIN_ID
        && manifest
            .permissions
            .iter()
            .any(|value| value == "desktop-windows")
        && [
            "skip",
            "snooze_10",
            "snooze_15",
            "snooze_20",
            "snooze_25",
            "snooze_30",
        ]
        .iter()
        .all(|id| manifest.actions.iter().any(|action| action.id == *id))
}

pub(crate) fn from_publish(
    data: &PluginContributions,
    status: &str,
    english: bool,
) -> Option<BreakState> {
    let panel = data.panel.as_ref()?;
    if status != "running" || !panel.attention {
        return None;
    }
    let row = panel.rows.iter().find(|row| row.id == "timer")?;
    // Only a running break makes a window: its row counts the rest up. A held timer and a
    // round whose time is up publish a fixed duration instead and stay on the island.
    let started_at = row.count_up_from?;
    (started_at > 0).then(|| BreakState {
        started_at,
        can_snooze: panel.actions.iter().any(|id| id == "snooze_10"),
        can_skip: panel.actions.iter().any(|id| id == "skip"),
        percent: row.percent,
        done: panel.done,
        language: if english { "en" } else { "zh-CN" },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rest_is_driven_by_typed_state_and_current_actions() {
        let mut data: PluginContributions = serde_json::from_value(json!({"panel": {
            "headline":"任意文案", "note":null, "attention":true,
            "rows":[{"id":"timer","title":"timer","countUpFrom":1234,"percent":62.5}],
            "actions":["snooze_10","skip"]
        }}))
        .unwrap();
        let state = from_publish(&data, "running", true).unwrap();
        assert_eq!(state.started_at, 1234);
        assert_eq!(state.percent, Some(62.5));
        assert!(state.can_snooze && state.can_skip);
        assert!(!state.done);
        assert_eq!(state.language, "en");
        data.panel.as_mut().unwrap().done = true;
        assert!(from_publish(&data, "running", false).unwrap().done, "a completed break keeps its window");
        data.panel.as_mut().unwrap().done = false;
        for status in ["starting", "restarting", "failed", "stopped"] {
            assert!(from_publish(&data, status, false).is_none());
        }
        data.panel.as_mut().unwrap().actions.clear();
        let state = from_publish(&data, "running", false).unwrap();
        assert!(!state.can_snooze && !state.can_skip);
        data.panel.as_mut().unwrap().attention = false;
        assert!(from_publish(&data, "running", false).is_none());
        assert!(from_publish(&PluginContributions::default(), "running", false).is_none());
    }

    #[test]
    fn legacy_plugins_do_not_create_duplicate_rest_windows() {
        let old = include_bytes!("../../../plugins/eye-care/fly-island-plugin.json");
        let mut manifest = PluginManifest::parse(old).unwrap();
        assert!(supports_host_windows(&manifest));
        manifest.actions.retain(|action| action.id == "rest_now");
        assert!(!supports_host_windows(&manifest));
        manifest.id = "device-battery".into();
        assert!(!supports_host_windows(&manifest));
    }

    #[test]
    fn busy_ui_coalesces_updates_and_stale_sessions_cannot_undo_cancellation() {
        let pending = PendingBreak::default();
        let rest = BreakState {
            started_at: 10_000,
            can_snooze: true,
            can_skip: false,
            percent: None,
            done: false,
            language: "en",
        };
        assert!(pending.queue(1, Some(rest.clone())));
        for _ in 0..1000 {
            assert!(!pending.queue(1, Some(rest.clone())));
        }
        assert!(!pending.queue(2, None));
        assert!(!pending.queue(1, Some(rest.clone())));
        assert_eq!(pending.take(), Some((2, None)));
        assert!(pending.take().is_none());
        assert!(pending.queue(3, Some(rest.clone())));
        assert_eq!(pending.take(), Some((3, Some(rest))));
    }
}
