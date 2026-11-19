//! The process's standard error and the local clock, for the diagnostic log (app_log): a
//! windowed app has no console, so `eprintln!` and panic messages are lost unless standard
//! error points somewhere else.

use std::os::windows::io::AsRawHandle;

use windows::Win32::{
    Foundation::HANDLE,
    System::{
        Console::{SetStdHandle, STD_ERROR_HANDLE},
        SystemInformation::GetLocalTime,
    },
};

/// Points standard error at `target`. Rust's `eprintln!` asks for the handle on every write,
/// so everything written afterwards goes there. The caller keeps `target` open for good.
pub(crate) fn redirect_stderr(target: &impl AsRawHandle) -> bool {
    let handle = HANDLE(target.as_raw_handle());
    // SAFETY: `handle` is an open handle borrowed from `target`, which the caller keeps alive
    // for the rest of the process; SetStdHandle only stores it.
    unsafe { SetStdHandle(STD_ERROR_HANDLE, handle) }.is_ok()
}

/// The local date and time as `2026-11-18 20:31:05.123`.
pub(crate) fn local_timestamp() -> String {
    // SAFETY: GetLocalTime takes no arguments and only returns a SYSTEMTIME by value.
    let now = unsafe { GetLocalTime() };
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}.{:03}",
        now.wYear, now.wMonth, now.wDay, now.wHour, now.wMinute, now.wSecond, now.wMilliseconds
    )
}
