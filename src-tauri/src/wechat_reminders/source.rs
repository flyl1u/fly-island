use std::{cell::RefCell, path::PathBuf};
use windows::{
    core::{w, Error, PWSTR},
    Win32::{
        Foundation::{CloseHandle, HINSTANCE, HWND, LPARAM, LRESULT, WPARAM},
        System::{
            LibraryLoader::GetModuleHandleW,
            Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ},
            Threading::{
                OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
        },
        UI::WindowsAndMessaging::{
            CreateWindowExW, DefWindowProcW, DeregisterShellHookWindow, DestroyWindow,
            DispatchMessageW, GetForegroundWindow, GetWindowThreadProcessId, PeekMessageW,
            RegisterClassW, RegisterShellHookWindow, RegisterWindowMessageW, TranslateMessage,
            UnregisterClassW, HSHELL_REDRAW, HSHELL_WINDOWACTIVATED, HSHELL_WINDOWCREATED, MSG,
            PM_REMOVE, WNDCLASSW, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_POPUP,
        },
    },
};

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

pub fn installed_executable() -> Result<PathBuf, String> {
    for (key, name) in [
        (w!("Software\\Tencent\\Weixin"), "Weixin.exe"),
        (w!("Software\\Tencent\\WeChat"), "WeChat.exe"),
    ] {
        let mut data = [0u16; 2048];
        let mut bytes = (data.len() * 2) as u32;
        if unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                key,
                w!("InstallPath"),
                RRF_RT_REG_SZ,
                None,
                Some(data.as_mut_ptr().cast()),
                Some(&mut bytes),
            )
        }
        .is_ok()
        {
            let length = data
                .iter()
                .position(|value| *value == 0)
                .unwrap_or(data.len());
            let path = PathBuf::from(String::from_utf16_lossy(&data[..length])).join(name);
            if path.is_absolute() && path.is_file() {
                return Ok(path);
            }
        }
    }
    Err("未找到微信安装路径，请确认已安装 Windows 版微信。".into())
}

fn normalized_path(path: &str) -> String {
    path.trim_start_matches(r"\\?\")
        .replace('/', "\\")
        .to_lowercase()
}

unsafe fn matches_window(window: HWND, executable: &str) -> Result<bool, ()> {
    if window.is_invalid() {
        return Ok(false);
    }
    let mut process_id = 0;
    GetWindowThreadProcessId(window, Some(&mut process_id));
    let process =
        OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id).map_err(|_| ())?;
    let mut path = [0u16; 32768];
    let mut length = path.len() as u32;
    let result = QueryFullProcessImageNameW(
        process,
        PROCESS_NAME_WIN32,
        PWSTR(path.as_mut_ptr()),
        &mut length,
    );
    let _ = CloseHandle(process);
    result.map_err(|_| ())?;
    Ok(normalized_path(&String::from_utf16_lossy(&path[..length as usize])) == executable)
}

unsafe extern "system" fn window_proc(
    window: HWND,
    message: u32,
    kind: WPARAM,
    target: LPARAM,
) -> LRESULT {
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
                    && matches_window(GetForegroundWindow(), &context.executable).unwrap_or(false)
                {
                    return;
                }
                (context.callback)(signal);
            }
            Err(()) => context.stats.metadata_errors += 1,
            Ok(false) => {}
        }
    });
    DefWindowProcW(window, message, kind, target)
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
        unsafe {
            let message = RegisterWindowMessageW(w!("SHELLHOOK"));
            if message == 0 {
                return Err(format!("无法注册微信提醒事件：{}", Error::from_win32()));
            }
            let instance = HINSTANCE(GetModuleHandleW(None).map_err(|error| error.to_string())?.0);
            let class = WNDCLASSW {
                hInstance: instance,
                lpszClassName: w!("FocuSDWeChatReminderSource"),
                lpfnWndProc: Some(window_proc),
                ..Default::default()
            };
            if RegisterClassW(&class) == 0 {
                return Err(Error::from_win32().to_string());
            }
            let window = match CreateWindowExW(
                WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
                class.lpszClassName,
                w!(""),
                WS_POPUP,
                0,
                0,
                0,
                0,
                None,
                None,
                Some(instance),
                None,
            ) {
                Ok(window) => window,
                Err(error) => {
                    let _ = UnregisterClassW(class.lpszClassName, Some(instance));
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
            let listener = Self { window, instance };
            RegisterShellHookWindow(window)
                .ok()
                .map_err(|error| format!("无法监听微信任务栏提醒：{error}"))?;
            Ok(listener)
        }
    }

    pub fn poll(&self) {
        let mut message = MSG::default();
        unsafe {
            while PeekMessageW(&mut message, None, 0, 0, PM_REMOVE).as_bool() {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }
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
        unsafe {
            let _ = DeregisterShellHookWindow(self.window);
            let _ = DestroyWindow(self.window);
            let _ = UnregisterClassW(w!("FocuSDWeChatReminderSource"), Some(self.instance));
        }
        CONTEXT.with(|slot| *slot.borrow_mut() = None);
    }
}
