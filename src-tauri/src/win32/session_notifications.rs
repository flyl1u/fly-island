//! The user's session: locked or unlocked, the computer going to sleep or
//! waking, and how long since the last keyboard or mouse input. A hidden
//! message-only window registers for the session and power notifications
//! (which are sent to it directly, so it needs no broadcasts).

use std::sync::OnceLock;

use windows::Win32::{
    Foundation::{HANDLE, HWND, LPARAM, LRESULT, WPARAM},
    System::{
        Power::{RegisterSuspendResumeNotification, UnregisterSuspendResumeNotification, HPOWERNOTIFY},
        RemoteDesktop::{WTSRegisterSessionNotification, WTSUnRegisterSessionNotification, NOTIFY_FOR_THIS_SESSION},
        SystemInformation::GetTickCount,
    },
    UI::{
        Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO},
        WindowsAndMessaging::{
            DEVICE_NOTIFY_WINDOW_HANDLE, PBT_APMRESUMEAUTOMATIC, PBT_APMSUSPEND, WM_POWERBROADCAST, WM_WTSSESSION_CHANGE,
            WTS_SESSION_LOCK, WTS_SESSION_UNLOCK,
        },
    },
};

use super::message_window::{self, WindowMessages};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SessionChange {
    Locked,
    Unlocked,
    Suspended,
    Resumed,
}

/// What a window message says about the session, if anything.
pub(crate) fn classify(message: u32, wparam: usize) -> Option<SessionChange> {
    match (message, wparam as u32) {
        (WM_WTSSESSION_CHANGE, WTS_SESSION_LOCK) => Some(SessionChange::Locked),
        (WM_WTSSESSION_CHANGE, WTS_SESSION_UNLOCK) => Some(SessionChange::Unlocked),
        (WM_POWERBROADCAST, PBT_APMSUSPEND) => Some(SessionChange::Suspended),
        // Sent on every wake, whether or not someone is at the keyboard.
        (WM_POWERBROADCAST, PBT_APMRESUMEAUTOMATIC) => Some(SessionChange::Resumed),
        _ => None,
    }
}

static ON_CHANGE: OnceLock<fn(SessionChange)> = OnceLock::new();

struct SessionWindow;

impl WindowMessages for SessionWindow {
    fn handle(_window: HWND, message: u32, wparam: WPARAM, _lparam: LPARAM) -> Option<LRESULT> {
        let change = classify(message, wparam.0)?;
        if let Some(on_change) = ON_CHANGE.get() {
            on_change(change);
        }
        // WM_POWERBROADCAST wants TRUE; WM_WTSSESSION_CHANGE ignores the result.
        Some(LRESULT(1))
    }
}

/// Unregisters both notifications when the window's thread ends.
struct Registrations {
    window: HWND,
    power: Option<HPOWERNOTIFY>,
    session: bool,
}

impl Drop for Registrations {
    fn drop(&mut self) {
        if let Some(power) = self.power.take() {
            // SAFETY: `power` came from RegisterSuspendResumeNotification and is unregistered once.
            let _ = unsafe { UnregisterSuspendResumeNotification(power) };
        }
        if self.session {
            // SAFETY: the window registered above and still exists on this thread.
            let _ = unsafe { WTSUnRegisterSessionNotification(self.window) };
        }
    }
}

/// Calls `on_change` for every session change, on the calling thread, until the
/// process ends. Run it on a thread of its own; call it once.
pub(crate) fn watch(on_change: fn(SessionChange)) -> Result<(), String> {
    ON_CHANGE.set(on_change).map_err(|_| "Session changes are already watched.".to_string())?;
    const CLASS_NAME: &str = "FocuSDSessionNotifications";
    let instance = message_window::module_instance().map_err(|error| error.to_string())?;
    message_window::register_class::<SessionWindow>(instance, CLASS_NAME).map_err(|error| error.to_string())?;
    let window = message_window::create_message_only_window(instance, CLASS_NAME, "FocuSD Session")
        .map_err(|error| error.to_string())?;
    // SAFETY: `window` is a live window of this thread; the flag asks for this session only.
    let session = unsafe { WTSRegisterSessionNotification(window, NOTIFY_FOR_THIS_SESSION) }.is_ok();
    // SAFETY: as above; DEVICE_NOTIFY_WINDOW_HANDLE says the handle is a window.
    let power = unsafe { RegisterSuspendResumeNotification(HANDLE(window.0), DEVICE_NOTIFY_WINDOW_HANDLE) }.ok();
    let _registrations = Registrations { window, power, session };
    message_window::run_message_loop();
    Ok(())
}

/// Milliseconds since the last keyboard or mouse input in this session; None if Windows cannot say.
pub(crate) fn idle_millis() -> Option<u32> {
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    // SAFETY: `info` is a valid LASTINPUTINFO with cbSize set, which GetLastInputInfo fills in.
    if !unsafe { GetLastInputInfo(&mut info) }.as_bool() {
        return None;
    }
    // SAFETY: GetTickCount takes no arguments.
    let now = unsafe { GetTickCount() };
    // Both are tick counts that wrap after 49.7 days.
    Some(now.wrapping_sub(info.dwTime))
}

#[cfg(test)]
mod tests {
    use super::{classify, idle_millis, SessionChange};
    use windows::Win32::UI::WindowsAndMessaging::{PBT_APMRESUMEAUTOMATIC, PBT_APMSUSPEND, WM_POWERBROADCAST, WM_WTSSESSION_CHANGE};

    #[test]
    fn session_and_power_messages_are_told_apart() {
        assert_eq!(classify(WM_WTSSESSION_CHANGE, 7), Some(SessionChange::Locked));
        assert_eq!(classify(WM_WTSSESSION_CHANGE, 8), Some(SessionChange::Unlocked));
        assert_eq!(classify(WM_WTSSESSION_CHANGE, 1), None, "console connect");
        assert_eq!(classify(WM_POWERBROADCAST, PBT_APMSUSPEND as usize), Some(SessionChange::Suspended));
        assert_eq!(classify(WM_POWERBROADCAST, PBT_APMRESUMEAUTOMATIC as usize), Some(SessionChange::Resumed));
        assert_eq!(classify(WM_POWERBROADCAST, 10), None, "power status change");
        assert_eq!(classify(0x0400, 7), None);
    }

    #[test]
    fn idle_time_is_known() {
        assert!(idle_millis().is_some());
    }
}
