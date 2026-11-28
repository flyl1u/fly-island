//! One eye-rest cycle. An idle desk or a paused full-screen window restarts the interval and holds it.
//!
//! Two break styles share the cycle: locking starts the full-screen break when the screen time
//! runs out or the user asks for one, while notifying only reminds. In notify mode the cycle
//! turns overdue once the time is up, holding the accumulated screen time until the user
//! postpones the break or calls it done; idling away for the whole idle span counts as the break
//! they took and starts the next interval. A locking break counts its rest up rather than down and
//! stays on screen past its length, waiting for the user to come back.

use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Working,
    Resting,
    /// Notifying: the screen time ran out and the user has not answered yet.
    Overdue,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BreakMode {
    /// The full-screen break opens by itself when the time is up.
    Lock,
    /// Only the island reminds; the full-screen break is the user's choice.
    Notify,
}

pub struct Clock {
    phase: Phase,
    /// Working: when the round ends. Resting: when the break ends. Overdue: when it began.
    deadline: Instant,
    period: Duration,
    rest: Duration,
    mode: BreakMode,
    snooze_used: bool,
    /// Frozen work remaining during idle or full-screen use.
    fullscreen_remaining: Option<Duration>,
    /// Unix milliseconds the break began, so the host can count the rest up from a fixed anchor.
    rest_started_ms: i64,
    /// Screen time counted up to `accumulated_at`, and whether it is held (idle, full screen,
    /// a break, or an overdue round). A held total is what the island shows as it is.
    accumulated: Duration,
    accumulated_at: Instant,
    accumulated_held: bool,
}

fn wall_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX))
}

impl Clock {
    pub fn new(now: Instant, period: Duration, rest: Duration, mode: BreakMode) -> Self {
        Self {
            phase: Phase::Working,
            deadline: now + period,
            period,
            rest,
            mode,
            snooze_used: false,
            fullscreen_remaining: None,
            rest_started_ms: 0,
            accumulated: Duration::ZERO,
            accumulated_at: now,
            accumulated_held: false,
        }
    }

    pub fn phase(&self) -> Phase {
        self.phase
    }

    pub fn remaining(&self, now: Instant) -> Duration {
        match self.phase {
            Phase::Overdue => Duration::ZERO,
            _ => self
                .fullscreen_remaining
                .unwrap_or_else(|| self.deadline.saturating_duration_since(now)),
        }
    }

    /// Screen time since the last completed break, as the break-time page shows it.
    pub fn accumulated(&self, now: Instant) -> Duration {
        if self.accumulated_held {
            self.accumulated
        } else {
            self.accumulated + now.saturating_duration_since(self.accumulated_at)
        }
    }

    /// How much of the current phase is left, 0–100, for the island's bar. An overdue round has
    /// nothing left; its bar stays full.
    pub fn percent_remaining(&self, now: Instant) -> f64 {
        let span = match self.phase {
            Phase::Working => self.period,
            Phase::Resting => self.rest,
            Phase::Overdue => return 100.0,
        };
        let total = span.as_secs_f64();
        if total <= 0.0 {
            return 0.0;
        }
        (self.remaining(now).as_secs_f64() / total * 100.0).clamp(0.0, 100.0)
    }

    pub fn can_snooze(&self) -> bool {
        self.phase == Phase::Resting && !self.snooze_used
    }

    pub fn postponed(&self) -> bool {
        self.snooze_used
    }

    pub fn paused(&self) -> bool {
        self.fullscreen_remaining.is_some()
    }

    /// The break has run its full length: the screens stay covered until the user comes back.
    pub fn rest_done(&self, now: Instant) -> bool {
        self.phase == Phase::Resting && now >= self.deadline
    }

    /// Unix milliseconds the current break began, for the island's and the window's count-up.
    pub fn rest_started_ms(&self) -> i64 {
        self.rest_started_ms
    }

    pub fn tick(&mut self, now: Instant, idle: bool, fullscreen: bool) {
        let away = idle || fullscreen;
        match self.phase {
            Phase::Working if away => {
                // An idle desk, or a full-screen window when that setting is on, starts a
                // completely fresh eye-use interval and holds it until input or the window
                // view returns.
                self.hold_full_interval(now);
            }
            Phase::Working => {
                if let Some(remaining) = self.fullscreen_remaining.take() {
                    self.deadline = now + remaining;
                    self.resume_accumulated(now);
                }
                if now >= self.deadline {
                    match self.mode {
                        BreakMode::Lock => self.begin_rest(now),
                        BreakMode::Notify => {
                            self.phase = Phase::Overdue;
                            // The poll can run late; the total stops when the screen time ran
                            // out, not when the plugin happened to notice it.
                            self.hold_accumulated(self.deadline);
                        }
                    }
                }
            }
            // A break stays on screen past its length; input calls `end_rest`.
            Phase::Resting => {}
            // The total stands still while the user decides; it never counts a break. Idling
            // away for the whole idle span is one, though: the reminder answers itself and the
            // next interval starts, held until the user comes back.
            Phase::Overdue if idle => {
                self.begin_work(now);
                self.hold_full_interval(now);
            }
            Phase::Overdue => {}
        }
    }

    /// The current break may be postponed exactly once. When it returns, all snooze
    /// controls stay unavailable until that break has completed or been skipped.
    pub fn snooze(&mut self, now: Instant, minutes: u64) -> bool {
        if !self.can_snooze() || now >= self.deadline || ![5, 10, 15, 20, 25, 30].contains(&minutes) {
            return false;
        }
        self.snooze_used = true;
        self.phase = Phase::Working;
        self.deadline = now + Duration::from_secs(minutes.saturating_mul(60));
        self.fullscreen_remaining = None;
        // Postponing a break is not resting: the screen time goes on counting.
        self.resume_accumulated(now);
        true
    }

    /// The user asks for a break by hand. Locking covers the screens straight away; notifying
    /// only opens the break-time page, freezing the accumulated screen time where it is.
    pub fn rest_now(&mut self, now: Instant) -> bool {
        if self.phase != Phase::Working {
            return false;
        }
        self.fullscreen_remaining = None;
        match self.mode {
            BreakMode::Lock => self.begin_rest(now),
            BreakMode::Notify => {
                self.phase = Phase::Overdue;
                self.deadline = now;
                self.hold_accumulated(now);
            }
        }
        true
    }

    /// Starts the eye-use interval again from the clock: the user answered "not now" after the
    /// screen time ran out. The accumulated screen time keeps counting.
    pub fn defer_break(&mut self, now: Instant) -> bool {
        if self.phase != Phase::Overdue {
            return false;
        }
        self.phase = Phase::Working;
        self.deadline = now + self.period;
        self.snooze_used = false;
        self.fullscreen_remaining = None;
        self.resume_accumulated(now);
        true
    }

    /// The user rested without the full-screen break: the accumulated screen time starts over.
    pub fn finish_break(&mut self, now: Instant) -> bool {
        if self.phase != Phase::Overdue {
            return false;
        }
        self.phase = Phase::Working;
        self.deadline = now + self.period;
        self.snooze_used = false;
        self.fullscreen_remaining = None;
        self.reset_accumulated(now);
        true
    }

    /// Resets the eye-use interval and its accumulated time: the user's own "start over".
    pub fn reset_work(&mut self, now: Instant) -> bool {
        if self.phase != Phase::Working {
            return false;
        }
        self.deadline = now + self.period;
        self.snooze_used = false;
        self.fullscreen_remaining = None;
        self.reset_accumulated(now);
        true
    }

    /// Emergency unlock: skip the rest and grant the next cycle a fresh postponement.
    pub fn skip_rest(&mut self, now: Instant, allowed: bool) -> bool {
        if self.phase != Phase::Resting || !allowed || now >= self.deadline {
            return false;
        }
        self.begin_work(now);
        true
    }

    /// A completed break ends when the user touches the keyboard or mouse again.
    pub fn end_rest(&mut self, now: Instant) -> bool {
        if !self.rest_done(now) {
            return false;
        }
        self.begin_work(now);
        true
    }

    fn begin_rest(&mut self, now: Instant) {
        self.phase = Phase::Resting;
        self.deadline = now + self.rest;
        self.fullscreen_remaining = None;
        self.rest_started_ms = wall_ms();
        self.hold_accumulated(now);
    }

    fn begin_work(&mut self, now: Instant) {
        self.phase = Phase::Working;
        self.deadline = now + self.period;
        self.snooze_used = false;
        self.fullscreen_remaining = None;
        // A completed break is rest: the next reminder counts from zero.
        self.reset_accumulated(now);
    }

    /// The desk is away: a fresh interval waits at its full length until the user returns.
    fn hold_full_interval(&mut self, now: Instant) {
        self.deadline = now + self.period;
        self.fullscreen_remaining = Some(self.period);
        self.hold_accumulated(now);
    }

    fn hold_accumulated(&mut self, now: Instant) {
        if self.accumulated_held {
            return;
        }
        self.accumulated = self.accumulated(now);
        self.accumulated_at = now;
        self.accumulated_held = true;
    }

    fn resume_accumulated(&mut self, now: Instant) {
        if !self.accumulated_held {
            return;
        }
        self.accumulated_at = now;
        self.accumulated_held = false;
    }

    fn reset_accumulated(&mut self, now: Instant) {
        self.accumulated = Duration::ZERO;
        self.accumulated_at = now;
        self.accumulated_held = false;
    }
}

#[cfg(test)]
#[path = "clock_tests.rs"]
mod tests;
