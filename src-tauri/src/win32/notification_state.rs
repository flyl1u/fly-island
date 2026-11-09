//! Whether the user is in something Windows itself holds notifications back for.

use windows::Win32::UI::Shell::{
    SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
};

/// Whether a full-screen app (a game, a full-screen video, a presentation) is in the
/// foreground: the state in which Windows suppresses its own toasts. `false` when the
/// state cannot be read.
pub(crate) fn fullscreen_app_in_front() -> bool {
    // SAFETY: SHQueryUserNotificationState takes no arguments and returns the state
    // by value.
    match unsafe { SHQueryUserNotificationState() } {
        Ok(state) => {
            state == QUNS_BUSY
                || state == QUNS_RUNNING_D3D_FULL_SCREEN
                || state == QUNS_PRESENTATION_MODE
        }
        Err(_) => false,
    }
}
