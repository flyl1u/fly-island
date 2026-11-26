//! Whether the user is in something Windows itself holds notifications back for.

use windows::Win32::UI::Shell::{
    SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
};

/// What the shell reports about the foreground, as far as full-screen apps go.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum FullscreenSignal {
    None,
    /// QUNS_BUSY or QUNS_RUNNING_D3D_FULL_SCREEN: a full-screen app, by the shell's guess.
    FullscreenApp,
    /// The user turned on presentation settings.
    Presentation,
}

/// The state in which Windows suppresses its own toasts. `None` when it cannot be read.
pub(crate) fn fullscreen_signal() -> (FullscreenSignal, &'static str) {
    // SAFETY: SHQueryUserNotificationState takes no arguments and returns the state
    // by value.
    match unsafe { SHQueryUserNotificationState() } {
        Ok(state) if state == QUNS_BUSY => (FullscreenSignal::FullscreenApp, "busy"),
        Ok(state) if state == QUNS_RUNNING_D3D_FULL_SCREEN => (FullscreenSignal::FullscreenApp, "d3d_full_screen"),
        Ok(state) if state == QUNS_PRESENTATION_MODE => (FullscreenSignal::Presentation, "presentation"),
        Ok(_) => (FullscreenSignal::None, "none"),
        Err(_) => (FullscreenSignal::None, "unavailable"),
    }
}
