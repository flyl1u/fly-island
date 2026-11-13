//! Where the player is in the track, worked out from what its media session reports.
//!
//! A session's timeline is a sample: `Position` as of `LastUpdatedTime`. Players push a new sample
//! when they choose to: Spotify and most browsers on every seek, pause and resume, some only when a
//! track starts. So the position is the last sample moved on by the time since it was taken, not
//! since the island read it. A player that changes play state without a new sample (paused, then
//! resumed hours later) would otherwise jump ahead by the whole pause, so play-state changes
//! re-anchor the estimate on the island's own clock until the player pushes again.

use std::sync::{Mutex, OnceLock, PoisonError};

/// A sample stamped later than this past the island's clock is taken as stamped now.
const FUTURE_TOLERANCE_MS: i64 = 1_000;
/// A sample older than the track by this much is not believed to be the time it was taken.
const STALE_SLACK_MS: i64 = 60_000;

/// One reading of a session's timeline, in milliseconds.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct TimelineSample {
    pub(super) start_ms: i64,
    pub(super) end_ms: i64,
    /// The position when the sample was taken, on the same scale as `start_ms`.
    pub(super) position_ms: i64,
    /// When the player took it (Unix ms), if it said.
    pub(super) updated_ms: Option<i64>,
}

impl TimelineSample {
    pub(super) fn has_timeline(&self, now_ms: i64) -> bool {
        self.end_ms > 0 || (self.position_ms > 0 && self.updated_ms.is_some_and(|updated| believable(updated, now_ms, self.duration())))
    }

    fn duration(&self) -> i64 {
        (self.end_ms - self.start_ms).max(0)
    }

    fn elapsed(&self) -> i64 {
        clamp_to(self.position_ms - self.start_ms, self.duration())
    }
}

/// The estimate: `position_ms` at `at_ms`, moving at `rate` while playing.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Anchor {
    position_ms: i64,
    at_ms: i64,
    playing: bool,
    rate: f64,
}

impl Anchor {
    fn position_at(&self, now_ms: i64, duration: i64) -> i64 {
        let moved = if self.playing {
            ((now_ms - self.at_ms).max(0) as f64 * self.rate).round() as i64
        } else {
            0
        };
        clamp_to(self.position_ms + moved, duration)
    }
}

/// The last sample seen for one session and the estimate built from it.
#[derive(Default)]
pub(super) struct TimelineTracker {
    session: Option<String>,
    sample: Option<TimelineSample>,
    anchor: Option<Anchor>,
}

impl TimelineTracker {
    /// The elapsed time and the length after a reading at `now_ms`.
    pub(super) fn observe(
        &mut self,
        session: &str,
        sample: TimelineSample,
        playing: bool,
        rate: f64,
        now_ms: i64,
    ) -> (i64, i64) {
        let duration = sample.duration();
        let rate = if rate.is_finite() && rate > 0.0 { rate } else { 1.0 };
        let previous = self
            .sample
            .filter(|_| self.session.as_deref() == Some(session))
            .filter(|last| last.start_ms == sample.start_ms && last.end_ms == sample.end_ms);

        let anchor = match (previous, self.anchor) {
            // The player has not pushed since: keep the estimate, re-anchored when play state changes.
            (Some(last), Some(anchor)) if last == sample => {
                if anchor.playing == playing && anchor.rate == rate {
                    anchor
                } else {
                    Anchor { position_ms: anchor.position_at(now_ms, duration), at_ms: now_ms, playing, rate }
                }
            }
            _ => {
                // A new position under an unchanged stamp is from now (a player that moves the
                // position but never the stamp); otherwise the sample is from when it says.
                let restamped = previous.is_some_and(|last| last.updated_ms == sample.updated_ms);
                let at_ms = match sample.updated_ms {
                    Some(updated) if !restamped && believable(updated, now_ms, duration) => updated.min(now_ms),
                    _ => now_ms,
                };
                Anchor { position_ms: sample.elapsed(), at_ms, playing, rate }
            }
        };

        self.session = Some(session.to_string());
        self.sample = Some(sample);
        self.anchor = Some(anchor);
        (anchor.position_at(now_ms, duration), duration)
    }

    /// The island asked the player to move to `elapsed_ms`; hold that until the player says otherwise.
    pub(super) fn seeked(&mut self, session: &str, elapsed_ms: i64, now_ms: i64) {
        if self.session.as_deref() != Some(session) {
            return;
        }
        if let (Some(anchor), Some(sample)) = (self.anchor.as_mut(), self.sample) {
            anchor.position_ms = clamp_to(elapsed_ms, sample.duration());
            anchor.at_ms = now_ms;
        }
    }
}

fn believable(updated_ms: i64, now_ms: i64, duration: i64) -> bool {
    let age = now_ms - updated_ms;
    updated_ms > 0 && age >= -FUTURE_TOLERANCE_MS && (duration == 0 || age <= duration + STALE_SLACK_MS)
}

/// `value` within the track, or just not negative when the length is unknown.
fn clamp_to(value: i64, duration: i64) -> i64 {
    if duration > 0 {
        value.clamp(0, duration)
    } else {
        value.max(0)
    }
}

static TRACKER: OnceLock<Mutex<TimelineTracker>> = OnceLock::new();

fn with_tracker<T>(operation: impl FnOnce(&mut TimelineTracker) -> T) -> T {
    let tracker = TRACKER.get_or_init(|| Mutex::new(TimelineTracker::default()));
    let mut guard = tracker.lock().unwrap_or_else(PoisonError::into_inner);
    operation(&mut guard)
}

/// [`TimelineTracker::observe`] on the island's one tracker.
pub(super) fn observe(session: &str, sample: TimelineSample, playing: bool, rate: f64, now_ms: i64) -> (i64, i64) {
    with_tracker(|tracker| tracker.observe(session, sample, playing, rate, now_ms))
}

/// [`TimelineTracker::seeked`] on the island's one tracker.
pub(super) fn seeked(session: &str, elapsed_ms: i64, now_ms: i64) {
    with_tracker(|tracker| tracker.seeked(session, elapsed_ms, now_ms));
}

#[cfg(test)]
mod tests {
    use super::{TimelineSample, TimelineTracker};

    const NOW: i64 = 1_700_000_000_000;
    const SONG: &str = "Spotify.exe";

    fn sample(position_ms: i64, updated_ms: Option<i64>) -> TimelineSample {
        TimelineSample { start_ms: 0, end_ms: 200_000, position_ms, updated_ms }
    }

    #[test]
    fn a_playing_sample_moves_on_from_when_the_player_took_it() {
        let mut tracker = TimelineTracker::default();
        // Pushed 30 s ago at 10 s: 40 s now, not the 10 s the island just read.
        assert_eq!(tracker.observe(SONG, sample(10_000, Some(NOW - 30_000)), true, 1.0, NOW), (40_000, 200_000));
        assert_eq!(tracker.observe(SONG, sample(10_000, Some(NOW - 30_000)), true, 1.0, NOW + 1_500).0, 41_500);
        // Faster playback moves faster; past the end it stops at the end.
        let mut fast = TimelineTracker::default();
        assert_eq!(fast.observe(SONG, sample(10_000, Some(NOW - 10_000)), true, 2.0, NOW).0, 30_000);
        assert_eq!(fast.observe(SONG, sample(190_000, Some(NOW - 60_000)), true, 1.0, NOW).0, 200_000);
    }

    #[test]
    fn a_seek_in_the_player_snaps_to_the_new_sample() {
        let mut tracker = TimelineTracker::default();
        tracker.observe(SONG, sample(10_000, Some(NOW - 30_000)), true, 1.0, NOW);
        assert_eq!(tracker.observe(SONG, sample(150_000, Some(NOW + 900)), true, 1.0, NOW + 1_000).0, 150_100);
        // Back to the start of the same track.
        assert_eq!(tracker.observe(SONG, sample(0, Some(NOW + 2_000)), true, 1.0, NOW + 2_000).0, 0);
    }

    #[test]
    fn a_pause_without_a_new_sample_holds_where_playback_was() {
        let mut tracker = TimelineTracker::default();
        // The player pushed once, when the track began, and never again.
        tracker.observe(SONG, sample(0, Some(NOW)), true, 1.0, NOW + 60_000);
        assert_eq!(tracker.observe(SONG, sample(0, Some(NOW)), false, 1.0, NOW + 61_000).0, 61_000);
        assert_eq!(tracker.observe(SONG, sample(0, Some(NOW)), false, 1.0, NOW + 3_600_000).0, 61_000);
        // Resumed an hour later: on from 61 s, not 61 s plus the hour.
        assert_eq!(tracker.observe(SONG, sample(0, Some(NOW)), true, 1.0, NOW + 3_600_000).0, 61_000);
        assert_eq!(tracker.observe(SONG, sample(0, Some(NOW)), true, 1.0, NOW + 3_605_000).0, 66_000);
    }

    #[test]
    fn a_pause_the_player_reports_uses_its_position() {
        let mut tracker = TimelineTracker::default();
        tracker.observe(SONG, sample(10_000, Some(NOW)), true, 1.0, NOW + 5_000);
        assert_eq!(tracker.observe(SONG, sample(15_200, Some(NOW + 5_200)), false, 1.0, NOW + 6_000).0, 15_200);
        assert_eq!(tracker.observe(SONG, sample(15_200, Some(NOW + 5_200)), false, 1.0, NOW + 60_000).0, 15_200);
    }

    #[test]
    fn untrustworthy_stamps_count_from_now() {
        // No stamp, a stamp of 0 (1601), one in the future, one older than the track.
        for updated in [None, Some(0), Some(NOW + 60_000), Some(NOW - 600_000)] {
            let mut tracker = TimelineTracker::default();
            assert_eq!(tracker.observe(SONG, sample(10_000, updated), true, 1.0, NOW).0, 10_000, "{updated:?}");
        }
        // A player that moves the position but never the stamp: the position is from now.
        let mut tracker = TimelineTracker::default();
        tracker.observe(SONG, sample(10_000, Some(NOW - 1_000)), true, 1.0, NOW);
        assert_eq!(tracker.observe(SONG, sample(12_000, Some(NOW - 1_000)), true, 1.0, NOW + 2_000).0, 12_000);
    }

    #[test]
    fn a_seek_from_the_island_holds_until_the_player_pushes() {
        let mut tracker = TimelineTracker::default();
        tracker.observe(SONG, sample(0, Some(NOW)), true, 1.0, NOW + 10_000);
        tracker.seeked(SONG, 90_000, NOW + 10_000);
        assert_eq!(tracker.observe(SONG, sample(0, Some(NOW)), true, 1.0, NOW + 11_000).0, 91_000);
        assert_eq!(tracker.observe(SONG, sample(90_300, Some(NOW + 10_300)), true, 1.0, NOW + 12_000).0, 92_000);
        // Another session, or another track, starts over.
        tracker.seeked("chrome.exe", 5_000, NOW + 12_000);
        let other = TimelineSample { start_ms: 0, end_ms: 100_000, position_ms: 0, updated_ms: Some(NOW + 12_000) };
        assert_eq!(tracker.observe(SONG, other, true, 1.0, NOW + 13_000), (1_000, 100_000));
    }
}
