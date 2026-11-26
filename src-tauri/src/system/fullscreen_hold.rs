//! What to answer while one of Fly Island's own windows is in front (B2-4).
//!
//! When a full-screen app exits or is minimized, Windows often hands the foreground to the
//! island or the settings window. #73 made that case keep the last answer, so that the island
//! getting in a game's way does not end game mode; but then nothing ever cleared it: `active`
//! stayed true, game mode kept the island quiet and tucked, and a tucked island under game
//! quiet is not even hit-tested. Now the held answer must still be backed by the very window
//! that was judged full screen, and is dropped after a bounded time when nothing backs it.

use std::time::Duration;
use windows::Win32::Foundation::RECT;

/// How long our own window may stay in front with nothing proving the full-screen app is still
/// there (no remembered window: presentation mode, a signal-only answer) before the answer is
/// dropped. Long enough for a click on the island; short enough that a stuck state ends.
pub(super) const OWN_FOREGROUND_LIMIT: Duration = Duration::from_secs(6);

/// What can be read about the window judged full screen, now.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct HeldWindowFacts {
    /// Still exists and is visible (a destroyed window is not).
    pub(super) visible: bool,
    pub(super) minimized: bool,
    /// Still covers its whole monitor.
    pub(super) covers_monitor: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum HoldDecision {
    Keep,
    Clear(&'static str),
}

/// Decides for an own-process foreground. `held` is `None` when no full-screen window was
/// remembered; `own_for` is how long our windows have been in front without interruption.
pub(super) fn decide_own_foreground(previous_active: bool, held: Option<HeldWindowFacts>, own_for: Duration) -> HoldDecision {
    if !previous_active {
        return HoldDecision::Keep;
    }
    match held {
        Some(facts) if !facts.visible => HoldDecision::Clear("held_window_gone"),
        Some(facts) if facts.minimized => HoldDecision::Clear("held_window_minimized"),
        Some(facts) if !facts.covers_monitor => HoldDecision::Clear("held_window_not_covering"),
        Some(_) => HoldDecision::Keep,
        None if own_for >= OWN_FOREGROUND_LIMIT => HoldDecision::Clear("own_foreground_timeout"),
        None => HoldDecision::Keep,
    }
}

pub(super) fn covers_monitor(window: Option<RECT>, monitor: Option<RECT>) -> bool {
    matches!((window, monitor), (Some(window), Some(monitor)) if window.left <= monitor.left && window.top <= monitor.top
        && window.right >= monitor.right && window.bottom >= monitor.bottom)
}

#[cfg(test)]
mod tests {
    use super::*;

    const OK: HeldWindowFacts = HeldWindowFacts { visible: true, minimized: false, covers_monitor: true };

    #[test]
    fn a_game_still_covering_its_monitor_keeps_game_mode_when_the_island_takes_the_focus() {
        assert_eq!(decide_own_foreground(true, Some(OK), Duration::from_secs(60)), HoldDecision::Keep);
    }

    #[test]
    fn a_closed_minimized_or_shrunk_game_ends_game_mode_even_with_our_window_in_front() {
        let gone = HeldWindowFacts { visible: false, ..OK };
        let minimized = HeldWindowFacts { minimized: true, ..OK };
        let shrunk = HeldWindowFacts { covers_monitor: false, ..OK };
        assert_eq!(decide_own_foreground(true, Some(gone), Duration::ZERO), HoldDecision::Clear("held_window_gone"));
        assert_eq!(decide_own_foreground(true, Some(minimized), Duration::ZERO), HoldDecision::Clear("held_window_minimized"));
        assert_eq!(decide_own_foreground(true, Some(shrunk), Duration::ZERO), HoldDecision::Clear("held_window_not_covering"));
    }

    #[test]
    fn nothing_remembered_is_held_only_for_a_bounded_time() {
        assert_eq!(decide_own_foreground(true, None, Duration::from_secs(2)), HoldDecision::Keep);
        assert_eq!(decide_own_foreground(true, None, OWN_FOREGROUND_LIMIT), HoldDecision::Clear("own_foreground_timeout"));
    }

    #[test]
    fn nothing_active_means_nothing_to_hold() {
        assert_eq!(decide_own_foreground(false, Some(HeldWindowFacts { visible: false, ..OK }), Duration::from_secs(99)), HoldDecision::Keep);
    }

    #[test]
    fn covering_needs_both_rectangles() {
        let monitor = RECT { left: 0, top: 0, right: 1920, bottom: 1080 };
        assert!(covers_monitor(Some(RECT { left: -8, top: -8, right: 1928, bottom: 1088 }), Some(monitor)));
        assert!(!covers_monitor(Some(RECT { left: 0, top: 0, right: 1920, bottom: 1040 }), Some(monitor)));
        assert!(!covers_monitor(None, Some(monitor)));
    }
}
