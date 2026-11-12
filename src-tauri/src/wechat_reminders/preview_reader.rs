//! Read a baseline, then compare the WeChat conversation list after each taskbar flash.

use std::{
    path::Path,
    time::{Duration, Instant},
};
use windows::Win32::Foundation::HWND;

use crate::win32::{process::window_process_id, window};

use super::{
    accessibility::{self, AccessibilityFlag},
    conversations::{self, ChatPreview, Conversation},
    existing_wechat_windows, preferred_window, PreviewStatus, MAX_PREVIEWS,
};

const CHECK_WINDOW: Duration = Duration::from_secs(3);
const SETTLE: Duration = Duration::from_millis(400);
const RETRY: Duration = Duration::from_millis(650);
const READ_ATTEMPTS: u8 = 3;

struct Attempt {
    due: Instant,
    remaining: u8,
}

pub(super) struct PreviewReader {
    target: Option<(HWND, u32)>,
    next_lookup: Instant,
    next_baseline: Instant,
    tried_pid: Option<u32>,
    activation_error: Option<PreviewStatus>,
    flag: Option<AccessibilityFlag>,
    baseline: Option<Vec<Conversation>>,
    attempt: Option<Attempt>,
    foreground: bool,
    pub(super) status: PreviewStatus,
}

impl PreviewReader {
    pub(super) fn new(now: Instant) -> Self {
        Self {
            target: None,
            next_lookup: now,
            next_baseline: now,
            tried_pid: None,
            activation_error: None,
            flag: None,
            baseline: None,
            attempt: None,
            foreground: false,
            status: PreviewStatus::Waiting,
        }
    }

    pub(super) fn attention(&mut self, now: Instant) {
        self.attempt.get_or_insert(Attempt {
            due: now + SETTLE,
            remaining: READ_ATTEMPTS,
        });
    }

    pub(super) fn activated(&mut self) {
        self.attempt = None;
        self.baseline = None;
        self.foreground = true;
    }

    /// None while idle or settling. An empty batch means only the taskbar flash was observed.
    pub(super) fn tick(
        &mut self,
        now: Instant,
        executable: &Path,
        marker: Option<&Path>,
        still_enabled: impl Fn() -> bool,
    ) -> Option<Vec<ChatPreview>> {
        if now >= self.next_lookup {
            self.update_target(now, executable);
        }
        let target = self
            .target
            .filter(|&(handle, pid)| window_process_id(handle) == pid);
        let Some((handle, pid)) = target else {
            self.status = PreviewStatus::Waiting;
            return self.plain_if_due(now);
        };
        if !window::is_visible(handle) {
            self.baseline = None;
            self.next_baseline = now;
            self.status = PreviewStatus::Tray;
            return self.plain_if_due(now);
        }
        let foreground = window_process_id(window::foreground_window()) == pid;
        if foreground != self.foreground {
            self.baseline = None;
            self.next_baseline = now;
            self.foreground = foreground;
        }
        if foreground {
            self.attempt = None;
        }
        if self
            .attempt
            .as_ref()
            .is_some_and(|attempt| now >= attempt.due)
        {
            let result = self.read_after_attention(handle, now);
            // The user may have switched to WeChat during a blocking UIA call.
            if window_process_id(window::foreground_window()) == pid {
                self.activated();
                return None;
            }
            return result;
        }
        if self.attempt.is_none() && self.baseline.is_none() && now >= self.next_baseline {
            self.seed(handle, pid, now, executable, marker, still_enabled);
        }
        None
    }

    fn update_target(&mut self, now: Instant, executable: &Path) {
        self.next_lookup = now + CHECK_WINDOW;
        let target = existing_wechat_windows(executable).ok().and_then(|search| {
            let handle = preferred_window(&search.found)?.handle;
            let pid = window_process_id(handle);
            (pid != 0).then_some((handle, pid))
        });
        if target == self.target {
            return;
        }
        if target.map(|(_, pid)| pid) != self.target.map(|(_, pid)| pid) {
            self.flag = None;
            self.activation_error = None;
            self.tried_pid = None;
        }
        self.target = target;
        self.baseline = None;
        self.next_baseline = now;
    }

    fn seed(
        &mut self,
        handle: HWND,
        pid: u32,
        now: Instant,
        executable: &Path,
        marker: Option<&Path>,
        still_enabled: impl Fn() -> bool,
    ) {
        self.next_baseline = now + CHECK_WINDOW;
        self.baseline = conversations::read(handle);
        if self.baseline.is_none() && self.tried_pid != Some(pid) && still_enabled() {
            self.tried_pid = Some(pid);
            if let Some(marker) = marker {
                accessibility::recover(executable, marker);
                match AccessibilityFlag::activate(executable, pid, marker, still_enabled) {
                    Ok(flag) => {
                        self.flag = flag;
                        self.next_baseline = Instant::now() + SETTLE;
                        return;
                    }
                    Err(status) => self.activation_error = Some(status),
                }
            }
        }
        self.status = if self.baseline.is_some() {
            PreviewStatus::Ready
        } else {
            self.activation_error.unwrap_or(PreviewStatus::Unavailable)
        };
    }

    fn read_after_attention(&mut self, handle: HWND, now: Instant) -> Option<Vec<ChatPreview>> {
        let rows = conversations::read(handle);
        let previews = self
            .baseline
            .as_deref()
            .zip(rows.as_deref())
            .map_or_else(Vec::new, |(before, after)| {
                conversations::new_previews(before, after, MAX_PREVIEWS)
            });
        let attempt = self.attempt.as_mut()?;
        attempt.remaining -= 1;
        if previews.is_empty() && attempt.remaining > 0 {
            attempt.due = now + RETRY;
            return None;
        }
        self.attempt = None;
        if let Some(rows) = rows {
            self.baseline = Some(rows);
            self.status = PreviewStatus::Ready;
        } else {
            self.baseline = None;
            self.status = self.activation_error.unwrap_or(PreviewStatus::Unavailable);
        }
        Some(previews)
    }

    fn plain_if_due(&mut self, now: Instant) -> Option<Vec<ChatPreview>> {
        if self
            .attempt
            .as_ref()
            .is_some_and(|attempt| now >= attempt.due)
        {
            self.attempt = None;
            return Some(Vec::new());
        }
        None
    }
}
