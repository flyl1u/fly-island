use crate::win32::{
    message_window::{self, WindowMessages},
    process, registry, shell_hook, window,
};
use std::{cell::RefCell, path::PathBuf};
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
    executable: String,
    callback: Box<dyn FnMut(ReminderSignal)>,
    stats: SourceStats,
}

thread_local! {
    static CONTEXT: RefCell<Option<ListenerContext>> = const { RefCell::new(None) };
}

/// Weixin 4.x first, then the older WeChat 3.x.
const EXECUTABLES: [(&str, &str); 2] = [("Weixin", "Weixin.exe"), ("WeChat", "WeChat.exe")];

/// Where WeChat is installed. The installer's own key is only written for the user who ran it
/// (or under HKLM for every user); portable copies and copies moved to another folder have no
/// key at all, so the uninstall entries and, last, a running WeChat are tried as well.
pub fn installed_executable() -> Result<PathBuf, String> {
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
                    return Ok(path);
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
                    return Ok(path);
                }
            }
        }
    }
    let names = EXECUTABLES.map(|(_, name)| name);
    process::running_executable(&names)
        .map(PathBuf::from)
        .ok_or_else(|| "未找到微信安装路径。打开微信后会自动连接。".into())
}

fn normalized_path(path: &str) -> String {
    path.trim_start_matches(r"\\?\")
        .replace('/', "\\")
        .to_lowercase()
}

fn matches_window(window: HWND, executable: &str) -> Result<bool, ()> {
    if window.is_invalid() {
        return Ok(false);
    }
    let path = process::image_path(process::window_process_id(window)).ok_or(())?;
    Ok(normalized_path(&path) == executable)
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
            match matches_window(HWND(target.0 as *mut _), &context.executable) {
                Ok(true) => {
                    if signal == ReminderSignal::Attention
                        && matches_window(window::foreground_window(), &context.executable)
                            .unwrap_or(false)
                    {
                        return;
                    }
                    (context.callback)(signal);
                }
                Err(()) => context.stats.metadata_errors += 1,
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
    pub fn new(
        executable: PathBuf,
        callback: impl FnMut(ReminderSignal) + 'static,
    ) -> Result<Self, String> {
        if CONTEXT.with(|slot| slot.borrow().is_some()) {
            return Err("微信提醒监听器已在此线程运行。".into());
        }
        let executable = executable
            .canonicalize()
            .map_err(|error| format!("无法确认微信安装路径：{error}"))?;
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
                executable: normalized_path(&executable.to_string_lossy()),
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
