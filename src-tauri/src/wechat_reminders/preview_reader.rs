//! Refresh the WeChat session list after flashes and periodically while it is in the background.

use std::{
    path::Path,
    time::{Duration, Instant},
};
use windows::Win32::Foundation::HWND;

use crate::win32::{caption_close::CaptionCloseHook, process::window_process_id, taskbar, window};

use super::{
    accessibility::{self, AccessibilityFlag},
    conversations::{self, ChatPreview, Conversation, ReadTrigger},
    source::{executable_for_process, existing_wechat_windows, preferred_window},
    PreviewStatus, ProcessIdentity, MAX_PREVIEWS,
};

const FIND_WINDOW: Duration = Duration::from_secs(3);
const TASKBAR_REFRESH: Duration = Duration::from_millis(500);
const CAPTION_REFRESH: Duration = Duration::from_millis(400);
const MINIMIZE_TIMEOUT: Duration = Duration::from_secs(1);
const BACKGROUND_POLL: Duration = Duration::from_secs(2);
const UNAVAILABLE_POLL: Duration = Duration::from_secs(5);
const ACTIVATE_RETRY: Duration = Duration::from_secs(15);
const SETTLE: Duration = Duration::from_millis(400);
const RETRY: Duration = Duration::from_millis(650);
const READ_ATTEMPTS: u8 = 3;
const SELECTED_CHANGE_WINDOW: Duration = Duration::from_secs(5);

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
    pending_selected: Option<(Instant, ChatPreview)>,
    flash: Option<FlashRead>,
    next_poll: Instant,
    foreground: bool,
    visited_since_baseline: bool,
}

impl ReadSchedule {
    fn new(now: Instant) -> Self {
        Self {
            baseline: None,
            pending_selected: None,
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
            self.pending_selected = None;
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
        let mut previews = Vec::new();
        let mut muted_only = false;
        if let Some((before, after)) = self
            .baseline
            .as_deref()
            .zip(rows.as_deref())
            .filter(|_| !self.foreground)
        {
            previews = conversations::new_previews(before, after, trigger, MAX_PREVIEWS);
            let pending = self.pending_selected.take().filter(|(at, preview)| {
                now.duration_since(*at) <= SELECTED_CHANGE_WINDOW
                    && after
                        .iter()
                        .any(|row| row.matches_selected_preview(preview))
                    && !previews.iter().any(|message| message.key == preview.key)
            });
            match trigger {
                ReadTrigger::Poll if !self.visited_since_baseline => {
                    // A poll can see the selected chat change before its taskbar flash arrives.
                    // Keep the change briefly without treating a synced reply as incoming.
                    self.pending_selected = conversations::selected_change(before, after)
                        .filter(|preview| {
                            !previews.iter().any(|message| message.key == preview.key)
                        })
                        .map(|preview| (now, preview))
                        .or(pending);
                }
                ReadTrigger::Flash {
                    allow_selected: true,
                } if previews.is_empty() => {
                    previews.extend(pending.map(|(_, preview)| preview));
                }
                _ => {}
            }
            muted_only = previews.is_empty()
                && matches!(trigger, ReadTrigger::Flash { .. })
                && conversations::only_muted_changed(before, after);
        }
        if muted_only {
            // The flash came from a muted chat: no plain reminder for it.
            self.flash = None;
        }
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
            self.pending_selected = None;
            return Some(ReadOutcome::Plain);
        }
        None
    }
}

pub(super) struct PreviewReader {
    target: Option<Target>,
    next_lookup: Instant,
    close_hook: Option<CaptionCloseHook>,
    next_caption_refresh: Instant,
    close_minimization: Option<(Target, Option<Instant>)>,
    hidden_button: Option<Target>,
    next_taskbar_refresh: Instant,
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
            close_hook: None,
            next_caption_refresh: now,
            close_minimization: None,
            hidden_button: None,
            next_taskbar_refresh: now,
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
        marker: Option<&Path>,
        hide_minimized_taskbar: bool,
        still_enabled: impl Fn() -> bool,
    ) -> Option<ReadOutcome> {
        if now >= self.next_lookup {
            self.update_target(now);
        }
        self.update_caption_close(now);
        self.update_taskbar(now, hide_minimized_taskbar);
        let Some(target) = self
            .target
            .filter(|target| window_process_id(target.window) == target.process.pid)
        else {
            self.status = PreviewStatus::Waiting;
            return self.schedule.plain_if_due(now);
        };
        let hwnd = target.window;
        if !window::is_visible(hwnd) {
            self.status = PreviewStatus::Tray;
            return self.schedule.plain_if_due(now);
        }
        let is_foreground = || {
            window::is_visible(hwnd)
                && !window::is_minimized(hwnd)
                && window_process_id(window::foreground_window()) == target.process.pid
        };
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
                self.ensure_accessibility(target.process, marker, &still_enabled, sampled_at);
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

    fn update_target(&mut self, now: Instant) {
        self.next_lookup = now + FIND_WINDOW;
        let target = existing_wechat_windows().ok().and_then(|search| {
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
        self.next_caption_refresh = now;
        if let Some(hook) = &self.close_hook {
            hook.clear_button();
        }
        self.schedule.baseline = None;
        self.schedule.pending_selected = None;
        self.schedule.next_poll = now;
    }

    fn update_caption_close(&mut self, now: Instant) {
        let requested = self
            .close_hook
            .as_ref()
            .and_then(CaptionCloseHook::take_minimize_request);
        if let Some(target) = self
            .target
            .filter(|target| requested == Some((target.window, target.process.pid)))
        {
            self.close_minimization = Some((target, Some(now + MINIMIZE_TIMEOUT)));
        }
        if now < self.next_caption_refresh {
            return;
        }
        let Some(target) = self.target.filter(|target| {
            window_process_id(target.window) == target.process.pid
                && window::is_visible(target.window)
                && !window::is_minimized(target.window)
        }) else {
            return;
        };
        self.next_caption_refresh = now + CAPTION_REFRESH;
        if self.close_hook.is_none() {
            self.close_hook = CaptionCloseHook::start();
        }
        if let Some(hook) = &self.close_hook {
            hook.refresh_button(
                target.window,
                target.process.pid,
                "mmui::XButton",
                &["关闭", "關閉", "Close"],
            );
        }
    }

    fn update_taskbar(&mut self, now: Instant, hide: bool) {
        let waiting_for_close = self
            .close_minimization
            .is_some_and(|(_, deadline)| deadline.is_some());
        if (!waiting_for_close && now < self.next_taskbar_refresh)
            || (!hide && self.close_minimization.is_none() && self.hidden_button.is_none())
        {
            return;
        }
        self.next_taskbar_refresh = now + TASKBAR_REFRESH;
        let minimized = self.target.filter(|target| {
            window_process_id(target.window) == target.process.pid
                && window::is_visible(target.window)
                && window::is_minimized(target.window)
        });
        if let Some((target, deadline)) = self.close_minimization {
            self.close_minimization = if minimized == Some(target) {
                Some((target, None))
            } else {
                deadline
                    .filter(|deadline| self.target == Some(target) && now < *deadline)
                    .map(|deadline| (target, Some(deadline)))
            };
        }
        // A click on Close preserves the familiar tray behavior. The separate preference applies to Minimize.
        let desired = minimized.filter(|_| hide || self.close_minimization.is_some());
        if desired == self.hidden_button || !self.restore_taskbar_button() {
            return;
        }
        self.hidden_button =
            desired.filter(|target| taskbar::set_button_visible(target.window, false).is_ok());
    }

    fn restore_taskbar_button(&mut self) -> bool {
        if let Some(target) = self.hidden_button {
            // When WeChat closes to the tray, Windows adds its button again on the next show.
            if window_process_id(target.window) == target.process.pid
                && window::is_visible(target.window)
                && taskbar::set_button_visible(target.window, true).is_err()
            {
                return false;
            }
            self.hidden_button = None;
        }
        true
    }

    fn ensure_accessibility(
        &mut self,
        process: ProcessIdentity,
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
        accessibility::recover(marker);
        let Some(executable) = executable_for_process(process.pid) else {
            return;
        };
        match AccessibilityFlag::activate(&executable, process.pid, marker, still_enabled) {
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

impl Drop for PreviewReader {
    fn drop(&mut self) {
        self.close_hook = None;
        let _ = self.restore_taskbar_button();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::win32::uia_list::ListRow;

    fn selected(body: &str) -> Vec<Conversation> {
        vec![conversations::parse_row(ListRow {
            key: "open".into(),
            name: format!("联系人\n{body}\n12:30"),
            selected: true,
        })
        .unwrap()]
    }

    #[test]
    fn a_poll_before_the_flash_preserves_the_selected_chat_preview() {
        let now = Instant::now();
        let mut schedule = ReadSchedule::new(now);
        schedule.sampled(ReadTrigger::Poll, Some(selected("之前")), now);
        let updated = now + BACKGROUND_POLL;
        assert!(schedule
            .sampled(
                schedule.next(updated).unwrap(),
                Some(selected("新消息")),
                updated
            )
            .is_none());
        schedule.attention(updated);
        let due = updated + SETTLE;
        let previews = schedule
            .sampled(schedule.next(due).unwrap(), Some(selected("新消息")), due)
            .unwrap();
        assert_eq!(previews.len(), 1);
        assert_eq!(previews[0].body, "新消息");
        assert!(schedule.pending_selected.is_none());
    }

    #[test]
    fn a_later_flash_does_not_replay_an_expired_or_visited_selected_chat() {
        for visited in [false, true] {
            let now = Instant::now();
            let mut schedule = ReadSchedule::new(now);
            schedule.sampled(ReadTrigger::Poll, Some(selected("之前")), now);
            let updated = now + BACKGROUND_POLL;
            schedule.sampled(ReadTrigger::Poll, Some(selected("同步回复")), updated);
            let flash = if visited {
                schedule.focus(true, updated + SETTLE);
                schedule.focus(false, updated + SETTLE);
                updated + SETTLE
            } else {
                updated + SELECTED_CHANGE_WINDOW
            };
            schedule.attention(flash);
            let due = flash + SETTLE;
            assert!(schedule
                .sampled(schedule.next(due).unwrap(), Some(selected("同步回复")), due)
                .is_none());
            assert!(schedule.pending_selected.is_none());
        }
    }

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
    fn a_flash_explained_by_a_muted_chat_gives_no_plain_reminder() {
        let muted = |body: &str| {
            vec![conversations::parse_row(ListRow {
                key: "group".into(),
                name: format!("大群\n{body}\n12:30\n消息免打扰"),
                selected: false,
            })
            .unwrap()]
        };
        let now = Instant::now();
        let mut schedule = ReadSchedule::new(now);
        schedule.sampled(ReadTrigger::Poll, Some(muted("张三: 早")), now);
        schedule.attention(now);
        let due = now + SETTLE;
        let trigger = schedule.next(due).unwrap();
        assert!(schedule.sampled(trigger, Some(muted("李四: 好")), due).is_none());
        assert!(schedule.flash.is_none());
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
