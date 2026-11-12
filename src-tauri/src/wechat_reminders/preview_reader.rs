//! Refresh the WeChat session list after flashes and periodically while it is in the background.

use std::{
    path::Path,
    time::{Duration, Instant},
};
use windows::Win32::Foundation::HWND;

use crate::win32::{process::window_process_id, window};

use super::{
    accessibility::{self, AccessibilityFlag},
    conversations::{self, ChatPreview, Conversation, ReadTrigger},
    existing_wechat_windows, preferred_window, PreviewStatus, ProcessIdentity, MAX_PREVIEWS,
};

const FIND_WINDOW: Duration = Duration::from_secs(3);
const BACKGROUND_POLL: Duration = Duration::from_secs(2);
const UNAVAILABLE_POLL: Duration = Duration::from_secs(5);
const ACTIVATE_RETRY: Duration = Duration::from_secs(15);
const SETTLE: Duration = Duration::from_millis(400);
const RETRY: Duration = Duration::from_millis(650);
const READ_ATTEMPTS: u8 = 3;

pub(super) enum ReadOutcome {
    Plain,
    Messages(ProcessIdentity, Vec<ChatPreview>),
}

#[derive(Clone, Copy, PartialEq)]
struct Target {
    window: HWND,
    process: ProcessIdentity,
}

struct FlashRead {
    due: Instant,
    remaining: u8,
}

struct ReadSchedule {
    baseline: Option<Vec<Conversation>>,
    flash: Option<FlashRead>,
    next_poll: Instant,
    foreground: bool,
    visited_since_baseline: bool,
}

impl ReadSchedule {
    fn new(now: Instant) -> Self {
        Self {
            baseline: None,
            flash: None,
            next_poll: now,
            foreground: false,
            visited_since_baseline: false,
        }
    }

    fn attention(&mut self, now: Instant) {
        self.flash.get_or_insert(FlashRead {
            due: now + SETTLE,
            remaining: READ_ATTEMPTS,
        });
    }

    fn focus(&mut self, foreground: bool, now: Instant) {
        if self.foreground && !foreground {
            self.next_poll = now + SETTLE;
        }
        if foreground && !self.foreground {
            self.flash = None;
            self.visited_since_baseline = true;
        }
        self.foreground = foreground;
    }

    fn next(&self, now: Instant) -> Option<ReadTrigger> {
        if let Some(flash) = &self.flash {
            return (flash.due <= now && !self.foreground).then_some(ReadTrigger::Flash {
                allow_selected: !self.visited_since_baseline,
            });
        }
        (now >= self.next_poll && (!self.foreground || self.baseline.is_none()))
            .then_some(ReadTrigger::Poll)
    }

    fn sampled(
        &mut self,
        trigger: ReadTrigger,
        rows: Option<Vec<Conversation>>,
        now: Instant,
    ) -> Option<Vec<ChatPreview>> {
        let previews = self
            .baseline
            .as_deref()
            .zip(rows.as_deref())
            .filter(|_| !self.foreground)
            .map_or_else(Vec::new, |(before, after)| {
                conversations::new_previews(before, after, trigger, MAX_PREVIEWS)
            });
        if let Some(flash) = self.flash.as_mut() {
            if previews.is_empty() && self.baseline.is_some() && flash.remaining > 1 {
                flash.remaining -= 1;
                flash.due = now + RETRY;
                return None;
            }
        }
        let flashing = self.flash.take().is_some();
        self.next_poll = now
            + if rows.is_some() {
                BACKGROUND_POLL
            } else {
                UNAVAILABLE_POLL
            };
        // A busy provider or a hidden list does not erase the last good comparison.
        if let Some(rows) = rows {
            self.baseline = Some(rows);
            self.visited_since_baseline = self.foreground;
        }
        (flashing || !previews.is_empty()).then_some(previews)
    }

    fn plain_if_due(&mut self, now: Instant) -> Option<ReadOutcome> {
        if self.flash.as_ref().is_some_and(|flash| flash.due <= now) {
            self.flash = None;
            return Some(ReadOutcome::Plain);
        }
        None
    }
}

pub(super) struct PreviewReader {
    target: Option<Target>,
    next_lookup: Instant,
    next_activation: Instant,
    activation_error: Option<PreviewStatus>,
    flag: Option<AccessibilityFlag>,
    schedule: ReadSchedule,
    pub(super) status: PreviewStatus,
}

impl PreviewReader {
    pub(super) fn new(now: Instant) -> Self {
        Self {
            target: None,
            next_lookup: now,
            next_activation: now,
            activation_error: None,
            flag: None,
            schedule: ReadSchedule::new(now),
            status: PreviewStatus::Waiting,
        }
    }

    pub(super) fn attention(&mut self, now: Instant) {
        self.schedule.attention(now);
    }

    pub(super) fn focus(&mut self, foreground: bool, now: Instant) {
        self.schedule.focus(foreground, now);
    }

    pub(super) fn tick(
        &mut self,
        now: Instant,
        executable: &Path,
        marker: Option<&Path>,
        still_enabled: impl Fn() -> bool,
    ) -> Option<ReadOutcome> {
        if now >= self.next_lookup {
            self.update_target(now, executable);
        }
        let Some(target) = self
            .target
            .filter(|target| window_process_id(target.window) == target.process.pid)
        else {
            self.status = PreviewStatus::Waiting;
            return self.schedule.plain_if_due(now);
        };
        let hwnd = target.window;
        if !window::is_visible(hwnd) && !window::is_minimized(hwnd) {
            self.status = PreviewStatus::Tray;
            return self.schedule.plain_if_due(now);
        }
        let is_foreground = || window_process_id(window::foreground_window()) == target.process.pid;
        self.focus(is_foreground(), now);
        let trigger = self.schedule.next(now)?;
        let rows = conversations::read(hwnd);
        let sampled_at = Instant::now();
        self.focus(is_foreground(), sampled_at);
        let can_read = rows.is_some();
        let result = self.schedule.sampled(trigger, rows, sampled_at);
        if can_read {
            self.status = PreviewStatus::Ready;
        } else {
            self.status = self.activation_error.unwrap_or(PreviewStatus::Unavailable);
            if matches!(trigger, ReadTrigger::Poll) {
                self.ensure_accessibility(
                    target.process,
                    executable,
                    marker,
                    &still_enabled,
                    sampled_at,
                );
            }
        }
        result.map(|previews| {
            if previews.is_empty() {
                ReadOutcome::Plain
            } else {
                ReadOutcome::Messages(target.process, previews)
            }
        })
    }

    fn update_target(&mut self, now: Instant, executable: &Path) {
        self.next_lookup = now + FIND_WINDOW;
        let target = existing_wechat_windows(executable).ok().and_then(|search| {
            let window = preferred_window(&search.found)?;
            Some(Target {
                window: window.handle,
                process: window.process,
            })
        });
        if target == self.target {
            return;
        }
        if target.map(|target| target.process) != self.target.map(|target| target.process) {
            self.flag = None;
            self.activation_error = None;
            self.next_activation = now;
        }
        self.target = target;
        self.schedule.baseline = None;
        self.schedule.next_poll = now;
    }

    fn ensure_accessibility(
        &mut self,
        process: ProcessIdentity,
        executable: &Path,
        marker: Option<&Path>,
        still_enabled: &impl Fn() -> bool,
        now: Instant,
    ) {
        if now < self.next_activation
            || self.activation_error == Some(PreviewStatus::Unsupported)
            || !still_enabled()
        {
            return;
        }
        self.next_activation = now + ACTIVATE_RETRY;
        if let Some(flag) = &self.flag {
            if flag.reenable_if_cleared() {
                self.schedule.next_poll = Instant::now() + SETTLE;
            }
            return;
        }
        let Some(marker) = marker else { return };
        accessibility::recover(executable, marker);
        match AccessibilityFlag::activate(executable, process.pid, marker, still_enabled) {
            Ok(Some(flag)) => {
                self.flag = Some(flag);
                self.activation_error = None;
                self.schedule.next_poll = Instant::now() + SETTLE;
            }
            Ok(None) => self.activation_error = None,
            Err(status) => {
                self.activation_error = Some(status);
                self.status = status;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_failed_flash_read_keeps_its_baseline_for_the_background_poll() {
        let now = Instant::now();
        let mut schedule = ReadSchedule::new(now);
        assert!(schedule
            .sampled(ReadTrigger::Poll, Some(vec![]), now)
            .is_none());
        schedule.attention(now);
        let first_read = now + SETTLE;
        assert!(schedule.next(now).is_none());
        assert!(schedule
            .sampled(schedule.next(first_read).unwrap(), None, first_read)
            .is_none());
        let second_read = first_read + RETRY;
        assert!(schedule
            .sampled(schedule.next(second_read).unwrap(), None, second_read)
            .is_none());
        let last_read = second_read + RETRY;
        assert!(schedule
            .sampled(schedule.next(last_read).unwrap(), None, last_read)
            .unwrap()
            .is_empty());
        assert!(schedule.baseline.is_some());
        assert!(matches!(
            schedule.next(last_read + UNAVAILABLE_POLL),
            Some(ReadTrigger::Poll)
        ));
    }

    #[test]
    fn a_flash_on_leaving_wechat_is_read_before_rebasing() {
        let now = Instant::now();
        let mut schedule = ReadSchedule::new(now);
        schedule.sampled(ReadTrigger::Poll, Some(vec![]), now);
        schedule.focus(true, now);
        schedule.focus(false, now);
        schedule.attention(now);
        assert!(matches!(
            schedule.next(now + SETTLE),
            Some(ReadTrigger::Flash {
                allow_selected: false
            })
        ));
        assert!(schedule.baseline.is_some());
    }
}
