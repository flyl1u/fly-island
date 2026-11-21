use windows::{
    core::{BOOL, PWSTR},
    Win32::{
        Foundation::{CloseHandle, HWND, LPARAM},
        System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
            PROCESS_QUERY_LIMITED_INFORMATION,
        },
        UI::WindowsAndMessaging::{
            EnumWindows, GetWindowThreadProcessId, IsIconic, IsWindowVisible, SetForegroundWindow,
            ShowWindow, SW_RESTORE,
        },
    },
};

pub(super) fn focus() -> bool {
    let mut activated = false;
    // SAFETY: EnumWindows calls visit synchronously while this stack slot remains alive.
    let _ = unsafe { EnumWindows(Some(visit), LPARAM(&mut activated as *mut bool as isize)) };
    activated
}

unsafe extern "system" fn visit(hwnd: HWND, data: LPARAM) -> BOOL {
    // SAFETY: EnumWindows supplies an HWND. These calls use a valid PID output and a queried process handle.
    let activated = unsafe {
        if !IsWindowVisible(hwnd).as_bool() {
            return true.into();
        }
        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return true.into();
        };
        let mut path = [0_u16; 1024];
        let mut length = path.len() as u32;
        let queried = QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(path.as_mut_ptr()),
            &mut length,
        )
        .is_ok();
        let _ = CloseHandle(process);
        if !queried || !is_minimax(&String::from_utf16_lossy(&path[..length as usize])) {
            return true.into();
        }
        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        }
        SetForegroundWindow(hwnd).as_bool()
    };
    // SAFETY: focus passes the address of its initialized bool as the callback data.
    unsafe { *(data.0 as *mut bool) = activated };
    (!activated).into()
}

fn is_minimax(path: &str) -> bool {
    std::path::Path::new(path)
        .file_name()
        .and_then(|part| part.to_str())
        .is_some_and(|name| {
            ["MiniMax Code.exe", "MiniMaxCode.exe", "minimax-code.exe"]
                .iter()
                .any(|expected| name.eq_ignore_ascii_case(expected))
        })
}
