//! Lane previews (`pnpm dev:lane`, scripts/dev-lane.mjs): a debug build run from
//! an agent's lane next to the user's own island. It gets its own identifier,
//! so its data folder, WebView storage and single-instance lock are separate,
//! and it leaves alone what is shared by the whole Windows account: the
//! focusd:// link handler, launch at startup, and the AI agents' status hooks.
//! Release builds ignore the environment variable.

const ENV: &str = "FOCUSD_DEV_LANE";

/// The lane number when this debug build runs as a lane preview.
pub(crate) fn lane() -> Option<u32> {
    if !cfg!(debug_assertions) {
        return None;
    }
    std::env::var(ENV).ok()?.parse().ok().filter(|lane| (1..=999).contains(lane))
}

/// The app identifier of lane `lane`'s preview, e.g. `com.focusd.island.lane-2`.
pub(crate) fn identifier(lane: u32) -> String {
    format!("com.focusd.island.lane-{lane}")
}

/// The island's default left edge on a monitor: centred, or for a preview
/// centred on the left quarter so it does not sit on top of the user's island.
pub(crate) fn stage_x(monitor_x: i32, monitor_width: i32, window_width: i32) -> i32 {
    match lane() {
        Some(_) => monitor_x + (monitor_width / 4 - window_width / 2).max(0),
        None => monitor_x + (monitor_width - window_width) / 2,
    }
}

/// Refuses an action that would change the user's own setup from a preview.
pub(crate) fn refuse_in_preview(action: &str) -> Result<(), String> {
    match lane() {
        Some(lane) => Err(format!("This is the preview of lane {lane}; it does not {action}. Use your own island for that.")),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::{identifier, stage_x};

    #[test]
    fn the_island_is_centred_on_its_monitor_outside_a_preview() {
        // Tests run without FOCUSD_DEV_LANE: the user's own placement.
        assert_eq!(stage_x(0, 2560, 760), 900);
        assert_eq!(stage_x(-1920, 1920, 760), -1920 + 580);
        assert_eq!(stage_x(0, 2561, 760), 900, "the same rounding as before");
    }

    #[test]
    fn each_lane_gets_its_own_identifier() {
        assert_eq!(identifier(2), "com.focusd.island.lane-2");
        assert_ne!(identifier(2), identifier(12));
    }
}
