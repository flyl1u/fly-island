//! One eye-rest cycle. Idle resets the interval; full-screen pauses it in place.

use std::time::{Duration, Instant};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Working,
    Resting,
}

pub struct Clock {
    phase: Phase,
    deadline: Instant,
    period: Duration,
    rest: Duration,
    snooze_used: bool,
    /// Frozen work remaining during idle or full-screen use.
    fullscreen_remaining: Option<Duration>,
}

impl Clock {
    pub fn new(now: Instant, period: Duration, rest: Duration) -> Self {
        Self {
            phase: Phase::Working,
            deadline: now + period,
            period,
            rest,
            snooze_used: false,
            fullscreen_remaining: None,
        }
    }

    pub fn phase(&self) -> Phase {
        self.phase
    }

    pub fn remaining(&self, now: Instant) -> Duration {
        self.fullscreen_remaining
            .unwrap_or_else(|| self.deadline.saturating_duration_since(now))
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

    pub fn tick(&mut self, now: Instant, idle: bool, fullscreen: bool) {
        match self.phase {
            Phase::Working if idle => {
                // An idle desk starts a completely fresh eye-use interval.
                self.deadline = now + self.period;
                self.fullscreen_remaining = Some(self.period);
            }
            Phase::Working if fullscreen => {
                if self.fullscreen_remaining.is_none() {
                    self.fullscreen_remaining = Some(self.deadline.saturating_duration_since(now));
                }
            }
            Phase::Working => {
                if let Some(remaining) = self.fullscreen_remaining.take() {
                    self.deadline = now + remaining;
                }
                if now >= self.deadline {
                    self.begin_rest(now);
                }
            }
            Phase::Resting if now >= self.deadline => self.begin_work(now),
            Phase::Resting => {}
        }
    }

    /// The current break may be postponed exactly once. When it returns, all snooze
    /// controls stay unavailable until that break has completed or been skipped.
    pub fn snooze(&mut self, now: Instant, minutes: u64) -> bool {
        if !self.can_snooze() || now >= self.deadline || ![10, 15, 20, 25, 30].contains(&minutes) {
            return false;
        }
        self.snooze_used = true;
        self.phase = Phase::Working;
        self.deadline = now + Duration::from_secs(minutes.saturating_mul(60));
        self.fullscreen_remaining = None;
        true
    }

    pub fn rest_now(&mut self, now: Instant) {
        if self.phase == Phase::Working {
            self.fullscreen_remaining = None;
            self.begin_rest(now);
        }
    }

    /// Emergency unlock: skip the rest and grant the next cycle a fresh postponement.
    pub fn skip_rest(&mut self, now: Instant, allowed: bool) -> bool {
        if self.phase != Phase::Resting || !allowed {
            return false;
        }
        self.begin_work(now);
        true
    }

    fn begin_rest(&mut self, now: Instant) {
        self.phase = Phase::Resting;
        self.deadline = now + self.rest;
        self.fullscreen_remaining = None;
    }

    fn begin_work(&mut self, now: Instant) {
        self.phase = Phase::Working;
        self.deadline = now + self.period;
        self.snooze_used = false;
        self.fullscreen_remaining = None;
    }
}

#[cfg(test)]
#[path = "clock_tests.rs"]
mod tests;
