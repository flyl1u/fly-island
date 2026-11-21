//! Desktop idle time, read without installing an input hook.

use std::mem::size_of;
use std::time::Duration;

use windows::Win32::System::SystemInformation::GetTickCount64;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

/// `None` means the probe failed; callers then treat the user as present.
pub fn elapsed() -> Option<Duration> {
    let mut info = LASTINPUTINFO {
        cbSize: size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    // SAFETY: `info` has the exact layout required by GetLastInputInfo.
    if !unsafe { GetLastInputInfo(&mut info) }.as_bool() {
        return None;
    }
    // SAFETY: GetTickCount64 takes no arguments.
    let now = unsafe { GetTickCount64() } as u32;
    Some(Duration::from_millis(u64::from(
        now.wrapping_sub(info.dwTime),
    )))
}
