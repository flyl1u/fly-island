use std::{path::Path, sync::Mutex};

use crate::app_log::{event, Category};

use super::service::MediaState;

#[derive(PartialEq, Eq)]
struct Playback {
    aumid: Option<String>,
    status: &'static str,
}

static LAST: Mutex<Option<Playback>> = Mutex::new(None);

pub(super) fn record(state: &MediaState) {
    let Ok(mut last) = LAST.try_lock() else {
        return;
    };
    let next = Playback {
        aumid: state.active_session_id.clone(),
        status: state.playback_status,
    };
    let Some(reason) = change(last.as_ref(), &next) else { return };
    let aumid = next.aumid.as_deref().unwrap_or("none");
    let safe_id = Path::new(aumid)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown");
    event(
        Category::Media,
        "session",
        &[
            ("reason", reason),
            ("aumid", safe_id),
            ("playback", next.status),
        ],
    );
    *last = Some(next);
}

fn change(previous: Option<&Playback>, next: &Playback) -> Option<&'static str> {
    match previous {
        Some(previous) if previous == next => None,
        Some(previous) if previous.aumid == next.aumid => Some("playback_changed"),
        Some(_) => Some("session_changed"),
        None => Some("initial_snapshot"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_session_or_playback_changes_are_logged() {
        let previous = Playback { aumid: Some("first".into()), status: "paused" };
        let playing = Playback { aumid: previous.aumid.clone(), status: "playing" };
        let switched = Playback { aumid: Some("second".into()), status: "playing" };
        assert_eq!(change(None, &previous), Some("initial_snapshot"));
        assert_eq!(change(Some(&previous), &previous), None);
        assert_eq!(change(Some(&previous), &playing), Some("playback_changed"));
        assert_eq!(change(Some(&playing), &switched), Some("session_changed"));
    }
}
