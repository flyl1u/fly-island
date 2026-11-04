//! Process lookups for windows owned by other applications (QQ, WeChat).
//!
//! Also compiled into `examples/wechat_reminder_probe.rs` through `#[path]`, so it
//! must not depend on anything else in the crate.

use windows::{
    core::PWSTR,
    Win32::{
        Foundation::{CloseHandle, HANDLE, HWND},
        System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
            PROCESS_QUERY_LIMITED_INFORMATION,
        },
        UI::WindowsAndMessaging::GetWindowThreadProcessId,
    },
};

/// Longest Win32 path QueryFullProcessImageNameW can return, in UTF-16 units.
const MAX_IMAGE_PATH_UNITS: usize = 32768;

/// Owns a process handle and closes it when dropped.
pub(super) struct ProcessHandle(pub(super) HANDLE);

/// Opens `process_id` for limited queries (path, times); `None` when the process
/// does not exist or cannot be opened.
pub(super) fn open_for_limited_query(process_id: u32) -> Option<ProcessHandle> {
    // SAFETY: OpenProcess takes no pointers; a returned handle is owned by
    // ProcessHandle, which closes it.
    unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) }
        .ok()
        .map(ProcessHandle)
}

impl Drop for ProcessHandle {
    fn drop(&mut self) {
        // SAFETY: the handle came from a successful OpenProcess call, is owned only
        // by this value, and is closed exactly once here.
        let _ = unsafe { CloseHandle(self.0) };
    }
}

/// Id of the process that created `window`; 0 when the window is invalid.
pub(crate) fn window_process_id(window: HWND) -> u32 {
    let mut process_id = 0;
    // SAFETY: GetWindowThreadProcessId tolerates any HWND value (it fails for
    // invalid ones) and writes the id into a valid local.
    unsafe { GetWindowThreadProcessId(window, Some(&mut process_id)) };
    process_id
}

/// Full Win32 path of the executable running as `process_id`. `None` when the
/// process cannot be opened for limited queries or its path cannot be read.
pub(crate) fn image_path(process_id: u32) -> Option<String> {
    let process = open_for_limited_query(process_id)?;
    let mut path = [0u16; MAX_IMAGE_PATH_UNITS];
    let mut length = path.len() as u32;
    // SAFETY: `process.0` is a live handle opened with
    // PROCESS_QUERY_LIMITED_INFORMATION; `path` is a writable buffer of `length`
    // UTF-16 units and `length` is a valid in/out pointer for the call.
    unsafe {
        QueryFullProcessImageNameW(
            process.0,
            PROCESS_NAME_WIN32,
            PWSTR(path.as_mut_ptr()),
            &mut length,
        )
    }
    .ok()?;
    Some(String::from_utf16_lossy(&path[..length as usize]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_image_path_of_the_current_process() {
        let path = image_path(std::process::id()).map(std::path::PathBuf::from);
        let current = std::env::current_exe().ok();
        assert!(path.is_some());
        assert_eq!(
            path.and_then(|path| path.file_name().map(|name| name.to_os_string())),
            current.and_then(|path| path.file_name().map(|name| name.to_os_string()))
        );
    }

    #[test]
    fn invalid_windows_and_missing_processes_have_no_owner() {
        assert_eq!(window_process_id(HWND::default()), 0);
        assert_eq!(image_path(u32::MAX), None);
    }
}
