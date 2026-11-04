//! Finds and activates the running QQ window, or starts QQ.

use crate::messenger_activation::{activate_existing_window, is_interactive_window};
use crate::win32::{self, process, registry};
use std::{
    path::{Path, PathBuf},
    thread,
    time::{Duration, Instant},
};
use windows::Win32::{
    Foundation::HWND,
    System::Registry::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
    UI::WindowsAndMessaging::{WM_APP, WM_LBUTTONDBLCLK, WM_LBUTTONDOWN, WM_LBUTTONUP},
};

pub(super) fn qq_executable() -> Result<PathBuf, String> {
    for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        for key in [
            "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\QQ",
            "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\QQ",
        ] {
            if let Some(icon) = registry::read_string(root, key, "DisplayIcon") {
                let executable = icon
                    .rsplit_once(',')
                    .filter(|(_, index)| index.trim().parse::<i32>().is_ok())
                    .map_or(icon.as_str(), |(path, _)| path)
                    .trim()
                    .trim_matches('"');
                let path = PathBuf::from(executable);
                if path.is_absolute()
                    && path.is_file()
                    && path
                        .file_name()
                        .is_some_and(|name| name.to_string_lossy().eq_ignore_ascii_case("QQ.exe"))
                {
                    return Ok(path);
                }
            }
        }
    }
    Err("未找到 QQ 安装路径，请确认已安装 Windows 版 QQ。".into())
}

pub(super) struct QQWindowSearch<'a> {
    executable: &'a Path,
    pub(super) windows: Vec<QQWindow>,
    tray_windows: Vec<(HWND, u32)>,
    running: bool,
}

pub(super) struct QQWindow {
    pub(super) handle: HWND,
    pub(super) process_id: u32,
    pub(super) visible: bool,
    pub(super) area: i64,
}

pub(super) fn preferred_qq_window(windows: &[QQWindow], foreground: HWND) -> Option<&QQWindow> {
    windows.iter().max_by_key(|window| {
        (
            window.visible && window.handle == foreground,
            window.visible,
            window.area,
        )
    })
}

fn find_qq_window(search: &mut QQWindowSearch<'_>, window: HWND) {
    let process_id = process::window_process_id(window);
    if let Some(path) = process::image_path(process_id) {
        if !path.eq_ignore_ascii_case(&search.executable.to_string_lossy()) {
            return;
        }
        search.running = true;
        let title = win32::window::window_text(window, 32);
        let class = win32::window::class_name(window);
        if class == "Electron_NotifyIconHostWindow" {
            search.tray_windows.push((window, process_id));
            return;
        }
        if title != "QQ" || !["Chrome_WidgetWin_1", "TXGuiFoundation"].contains(&class.as_str()) {
            return;
        }
        if win32::window::has_owner(window) {
            return;
        }
        let Some(normal_position) = win32::window::normal_position(window) else {
            return;
        };
        let width = normal_position.right - normal_position.left;
        let height = normal_position.bottom - normal_position.top;
        if width >= 500 && height >= 300 {
            search.windows.push(QQWindow {
                handle: window,
                process_id,
                visible: win32::window::is_visible(window),
                area: i64::from(width) * i64::from(height),
            });
        }
    }
}

pub(super) fn existing_qq_windows(executable: &Path) -> Result<QQWindowSearch<'_>, String> {
    let mut search = QQWindowSearch {
        executable,
        windows: Vec::new(),
        tray_windows: Vec::new(),
        running: false,
    };
    win32::window::for_each_top_level_window(|window| find_qq_window(&mut search, window))
        .map_err(|error| format!("无法查找已运行的 QQ 窗口：{error}"))?;
    Ok(search)
}

pub(super) fn activate_existing_qq(executable: &Path) -> Result<(), String> {
    let search = existing_qq_windows(executable)?;
    let original = preferred_qq_window(&search.windows, win32::window::foreground_window())
        .ok_or_else(|| {
            if search.running {
                "QQ 已在运行，但未找到可用的主窗口，请从系统托盘打开 QQ。"
            } else {
                "未找到正在运行的 QQ 窗口，请先打开并登录桌面版 QQ。"
            }
            .to_string()
        })?;
    let expected_process = original.process_id;
    win32::window::allow_set_foreground_window(expected_process);
    let mut trays = search
        .tray_windows
        .iter()
        .filter(|(_, process_id)| *process_id == expected_process);
    let tray = trays
        .next()
        .ok_or("未找到 QQ 的托盘唤回入口，请双击系统托盘中的 QQ 图标。")?;
    if trays.next().is_some() {
        return Err("QQ 有多个托盘入口，无法确认主入口，请从系统托盘打开 QQ。".into());
    }
    // Electron allocates icon ids from 2 and uses WM_APP + 1. Resolve the live id from the shell,
    // since QQ may recreate its tray icon after login. Never invoke an ambiguous icon.
    // https://github.com/electron/electron/blob/main/shell/browser/ui/win/notify_icon_host.cc
    let mut icon_id = None;
    let lookup_deadline = Instant::now() + Duration::from_secs(1);
    for id in 2..=256 {
        if Instant::now() >= lookup_deadline {
            return Err("查询 QQ 托盘图标超时，请从系统托盘打开 QQ。".into());
        }
        if win32::window::notify_icon_exists(tray.0, id) && icon_id.replace(id).is_some() {
            return Err("QQ 有多个托盘图标，无法确认主入口，请双击系统托盘中的 QQ 图标。".into());
        }
    }
    let icon_id = icon_id.ok_or("QQ 托盘图标尚未就绪，请从系统托盘打开 QQ。")?;
    for message in [WM_LBUTTONDOWN, WM_LBUTTONUP, WM_LBUTTONDBLCLK, WM_LBUTTONUP] {
        if !win32::window::send_message_with_timeout(
            tray.0,
            WM_APP + 1,
            icon_id as usize,
            message as isize,
            1_000,
        ) {
            return Err("QQ 没有响应托盘唤回请求，请从系统托盘打开。".into());
        }
    }
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        let current = existing_qq_windows(executable)?;
        if let Some(window) =
            preferred_qq_window(&current.windows, win32::window::foreground_window())
        {
            if window.process_id == expected_process && is_interactive_window(window.handle) {
                return activate_existing_window(window.handle, "QQ");
            }
        }
        thread::sleep(Duration::from_millis(50));
    }
    Err("QQ 未能恢复可交互的主窗口，请双击系统托盘中的 QQ 图标。".into())
}
