use crate::win32::{
    message_window::{self, WindowMessages},
    process, process_times, registry, shell_hook, window,
};
use std::{
    cell::RefCell,
    path::{Path, PathBuf},
};
use windows::Win32::{
    Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM},
    System::Registry::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
    UI::WindowsAndMessaging::{HSHELL_REDRAW, HSHELL_WINDOWACTIVATED, HSHELL_WINDOWCREATED},
};

const CLASS_NAME: &str = "FocuSDWeChatReminderSource";
const HSHELL_FLASH: u32 = HSHELL_REDRAW | 0x8000;
const HSHELL_RUDEAPPACTIVATED: u32 = HSHELL_WINDOWACTIVATED | 0x8000;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ReminderSignal {
    Attention,
    Activated,
    ActivatedElsewhere,
    Redraw,
    WindowCreated,
}

#[derive(Clone, Copy, Default)]
pub struct SourceStats {
    pub shell_events: u64,
    pub metadata_errors: u64,
}

struct ListenerContext {
    message: u32,
    executable: Option<PathBuf>,
    callback: Box<dyn FnMut(ReminderSignal)>,
    stats: SourceStats,
}

thread_local! {
    static CONTEXT: RefCell<Option<ListenerContext>> = const { RefCell::new(None) };
}

/// Weixin 4.x first, then the older WeChat 3.x.
const EXECUTABLES: [(&str, &str); 2] = [("Weixin", "Weixin.exe"), ("WeChat", "WeChat.exe")];

/// Prefer the live main instance, including portable and parallel installations.
/// Registry paths are only a fallback when no readable WeChat process is running.
pub fn resolve_executable() -> Result<PathBuf, String> {
    let running = running_executable();
    let registry = running.is_none().then(registry_executable).flatten();
    select_executable(registry, running)
        .ok_or_else(|| "未找到微信安装路径。打开微信后会自动连接。".into())
}

fn select_executable(registry: Option<PathBuf>, running: Option<PathBuf>) -> Option<PathBuf> {
    running.or(registry)
}

pub fn is_wechat_executable(path: &str) -> bool {
    path.rsplit(['\\', '/']).next().is_some_and(|name| {
        EXECUTABLES
            .iter()
            .any(|(_, expected)| name.eq_ignore_ascii_case(expected))
    })
}

pub fn registry_executable() -> Option<PathBuf> {
    let existing = |path: PathBuf, name: &str| {
        let named = path
            .file_name()
            .is_some_and(|file| file.to_string_lossy().eq_ignore_ascii_case(name));
        (path.is_absolute() && named && path.is_file()).then_some(path)
    };
    for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        for (product, name) in EXECUTABLES {
            for key in [
                format!("Software\\Tencent\\{product}"),
                format!("Software\\WOW6432Node\\Tencent\\{product}"),
            ] {
                if let Some(path) = registry::read_string(root, &key, "InstallPath")
                    .and_then(|folder| existing(PathBuf::from(folder.trim_matches('"')).join(name), name))
                {
                    return Some(path);
                }
            }
            for key in [
                format!("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{product}"),
                format!("Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{product}"),
            ] {
                let from_icon = registry::read_string(root, &key, "DisplayIcon")
                    .and_then(|icon| existing(PathBuf::from(registry::display_icon_path(&icon)), name));
                let from_folder = || {
                    registry::read_string(root, &key, "InstallLocation")
                        .and_then(|folder| existing(PathBuf::from(folder.trim_matches('"')).join(name), name))
                };
                if let Some(path) = from_icon.or_else(from_folder) {
                    return Some(path);
                }
            }
        }
    }
    None
}

/// A specific live process must supply its own path, rather than a different install's registry key.
pub(crate) fn executable_for_process(pid: u32) -> Option<PathBuf> {
    process::image_path(pid)
        .filter(|path| is_wechat_executable(path))
        .map(PathBuf::from)
}

pub fn running_executable() -> Option<PathBuf> {
    if let Some(path) = existing_wechat_windows().ok().and_then(|search| {
        if !search.running {
            return None;
        }
        let main = preferred_window(&search.found)?;
        // Ignore a window destroyed or reused between enumeration and path lookup.
        (process::window_process_id(main.handle) == main.process.pid)
            .then(|| executable_for_process(main.process.pid))
            .flatten()
    }) {
        return Some(path);
    }
    let names = EXECUTABLES.map(|(_, name)| name);
    process::running_executable(&names)
        .filter(|path| is_wechat_executable(path))
        .map(PathBuf::from)
}

fn matches_window(window: HWND, executable: Option<&Path>) -> Result<bool, ()> {
    if window.is_invalid() {
        return Ok(false);
    }
    let path = process::image_path(process::window_process_id(window)).ok_or(())?;
    Ok(is_wechat_executable(&path)
        && executable.is_none_or(|expected| process::same_path(Path::new(&path), expected)))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct ProcessIdentity {
    pub(crate) pid: u32,
    pub(crate) started_at: u64,
}

pub(crate) struct WeChatWindow {
    pub(crate) handle: HWND,
    pub(crate) process: ProcessIdentity,
    pub(crate) main_sized: bool,
    pub(crate) visible: bool,
}

pub(crate) struct WindowSearch {
    pub(crate) found: Vec<WeChatWindow>,
    pub(crate) running: bool,
}

pub(crate) fn preferred_window(windows: &[WeChatWindow]) -> Option<&WeChatWindow> {
    // Only full main windows qualify; prefer the visible window, then the older instance.
    windows
        .iter()
        .filter(|window| window.main_sized)
        .min_by_key(|window| (!window.visible, window.process.started_at))
}

fn find_wechat_window(search: &mut WindowSearch, window: HWND) {
    let process_id = process::window_process_id(window);
    let Some(path) = process::image_path(process_id) else {
        return;
    };
    if !is_wechat_executable(&path) {
        return;
    }
    let started_at = process_times::start_time(process_id).unwrap_or(u64::MAX);
    search.running = true;
    let title = window::window_text(window, 32);
    if !["微信", "WeChat", "Weixin"].contains(&title.as_str()) {
        return;
    }
    let main_sized = window::normal_position(window).is_some_and(|position| {
        position.right - position.left >= 500 && position.bottom - position.top >= 300
    });
    search.found.push(WeChatWindow {
        handle: window,
        process: ProcessIdentity {
            pid: process_id,
            started_at,
        },
        main_sized,
        visible: window::is_visible(window),
    });
}

pub(crate) fn existing_wechat_windows() -> Result<WindowSearch, String> {
    let mut search = WindowSearch {
        found: Vec::new(),
        running: false,
    };
    window::for_each_top_level_window(|window| find_wechat_window(&mut search, window))
        .map_err(|error| format!("无法查找已运行的微信窗口：{error}"))?;
    Ok(search)
}

struct ReminderWindow;

impl WindowMessages for ReminderWindow {
    /// Records shell hook notifications; every message, handled or not, still
    /// goes on to `DefWindowProcW`.
    fn handle(_: HWND, message: u32, kind: WPARAM, target: LPARAM) -> Option<LRESULT> {
        CONTEXT.with(|slot| {
            let Ok(mut context) = slot.try_borrow_mut() else {
                return;
            };
            let Some(context) = context.as_mut() else {
                return;
            };
            if message != context.message {
                return;
            }
            context.stats.shell_events += 1;
            let signal = match kind.0 as u32 {
                HSHELL_FLASH => ReminderSignal::Attention,
                HSHELL_WINDOWACTIVATED | HSHELL_RUDEAPPACTIVATED => ReminderSignal::Activated,
                HSHELL_REDRAW => ReminderSignal::Redraw,
                HSHELL_WINDOWCREATED => ReminderSignal::WindowCreated,
                _ => return, // Other messages may contain pointers instead of window handles.
            };
            match matches_window(HWND(target.0 as *mut _), context.executable.as_deref()) {
                Ok(true) => {
                    if signal == ReminderSignal::Attention
                        && matches_window(window::foreground_window(), context.executable.as_deref())
                            .unwrap_or(false)
                    {
                        return;
                    }
                    (context.callback)(signal);
                }
                Err(()) => context.stats.metadata_errors += 1,
                Ok(false) if signal == ReminderSignal::Activated => {
                    (context.callback)(ReminderSignal::ActivatedElsewhere);
                }
                Ok(false) => {}
            }
        });
        None
    }
}

pub struct ReminderListener {
    window: HWND,
    instance: HINSTANCE,
}

impl ReminderListener {
    /// `executable` is an optional diagnostic filter; the app listens to all WeChat installs.
    pub fn new(
        executable: Option<PathBuf>,
        callback: impl FnMut(ReminderSignal) + 'static,
    ) -> Result<Self, String> {
        if CONTEXT.with(|slot| slot.borrow().is_some()) {
            return Err("微信提醒监听器已在此线程运行。".into());
        }
        if executable.is_none() {
            resolve_executable()?;
        }
        let message =
            shell_hook::hook_message().map_err(|error| format!("无法注册微信提醒事件：{error}"))?;
        let instance = message_window::module_instance().map_err(|error| error.to_string())?;
        message_window::register_class::<ReminderWindow>(instance, CLASS_NAME)
            .map_err(|error| error.to_string())?;
        let window = match message_window::create_tool_popup_window(instance, CLASS_NAME, "") {
            Ok(window) => window,
            Err(error) => {
                let _ = message_window::unregister_class(instance, CLASS_NAME);
                return Err(format!("无法创建微信提醒接收器：{error}"));
            }
        };
        CONTEXT.with(|slot| {
            *slot.borrow_mut() = Some(ListenerContext {
                message,
                executable,
                callback: Box::new(callback),
                stats: SourceStats::default(),
            })
        });
        // Built before registering the hook so a failure below still cleans up
        // through Drop.
        let listener = Self { window, instance };
        shell_hook::register_window(window)
            .map_err(|error| format!("无法监听微信任务栏提醒：{error}"))?;
        Ok(listener)
    }

    pub fn poll(&self) {
        message_window::dispatch_pending_messages();
    }

    pub fn stats(&self) -> SourceStats {
        CONTEXT.with(|slot| {
            slot.borrow()
                .as_ref()
                .map(|context| context.stats)
                .unwrap_or_default()
        })
    }
}

impl Drop for ReminderListener {
    fn drop(&mut self) {
        let _ = shell_hook::deregister_window(self.window);
        let _ = message_window::destroy_window(self.window);
        let _ = message_window::unregister_class(self.instance, CLASS_NAME);
        CONTEXT.with(|slot| *slot.borrow_mut() = None);
    }
}

#[cfg(test)]
#[path = "source_tests.rs"]
mod tests;
