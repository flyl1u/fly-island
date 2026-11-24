//! 截图快捷键：默认 Alt+A，可在设置里改。
//!
//! 和翻译快捷键同一套机制：一条独立线程上的消息窗口持有 `RegisterHotKey`，
//! 触发时只往前端发事件，真正抓屏由前端决定选区后再调 `screenshot_capture`。
//! 快捷键本身存在前端（`localStorage`），启动时由前端回填，和翻译一致。

use std::{
    sync::{mpsc, Mutex, OnceLock},
    thread,
    time::{Duration, Instant},
};

use tauri::AppHandle;
use windows::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    UI::WindowsAndMessaging::{WM_APP, WM_HOTKEY},
};

use crate::{
    clipboard_history::{parse_shortcut_binding, ShortcutBinding},
    win32::{
        hotkey,
        message_window::{self, WindowMessages},
    },
};

/// 默认快捷键：和微信截图相同，可在设置里改。
pub(crate) const DEFAULT_SHORTCUT: &str = "Alt+A";

const HOTKEY_ID: i32 = 0x5301;
const REBIND_MESSAGE: u32 = WM_APP + 40;
const WINDOW_CLASS: &str = "FocuSD Screenshot Hotkey";

type Pending = (Option<ShortcutBinding>, mpsc::Sender<Result<String, String>>);

static APP: OnceLock<AppHandle> = OnceLock::new();
static WINDOW: Mutex<Option<isize>> = Mutex::new(None);
static ACTIVE: Mutex<Option<ShortcutBinding>> = Mutex::new(None);
static PENDING: Mutex<Option<Pending>> = Mutex::new(None);

/// 启动快捷键线程；失败只记录，不影响小岛其余功能。
pub(crate) fn init(app: &AppHandle) {
    let _ = APP.set(app.clone());
    thread::spawn(|| {
        if let Err(error) = run_loop() {
            eprintln!("failed to start the screenshot hotkey: {error}");
        }
    });
}

/// 换一个快捷键；`""` 表示关闭。返回实际生效的按键描述。
#[tauri::command]
pub fn set_screenshot_shortcut(shortcut: String) -> Result<String, String> {
    let binding = if shortcut.trim().is_empty() {
        None
    } else {
        Some(parse_shortcut_binding(&shortcut).ok_or_else(|| format!("无法识别快捷键：{shortcut}"))?)
    };
    let (sender, receiver) = mpsc::channel();
    {
        let mut pending = PENDING.lock().map_err(|error| error.to_string())?;
        if pending.is_some() {
            return Err("快捷键正在更新。".to_string());
        }
        *pending = Some((binding, sender));
    }
    let hwnd = wait_for_window()?;
    if let Err(error) = message_window::post_message(HWND(hwnd as *mut _), REBIND_MESSAGE) {
        if let Ok(mut pending) = PENDING.lock() {
            *pending = None;
        }
        return Err(format!("无法更新快捷键：{error}"));
    }
    receiver
        .recv_timeout(Duration::from_secs(2))
        .map_err(|error| format!("快捷键更新超时：{error}"))?
}

fn wait_for_window() -> Result<isize, String> {
    let started = Instant::now();
    loop {
        if let Some(hwnd) = *WINDOW.lock().map_err(|error| error.to_string())? {
            return Ok(hwnd);
        }
        if started.elapsed() >= Duration::from_secs(2) {
            return Err("快捷键服务尚未准备好。".to_string());
        }
        thread::sleep(Duration::from_millis(25));
    }
}

fn run_loop() -> Result<(), String> {
    let instance = message_window::module_instance().map_err(|error| error.to_string())?;
    message_window::register_class::<ScreenshotHotkeyWindow>(instance, WINDOW_CLASS)
        .map_err(|_| "无法注册截图快捷键窗口。".to_string())?;
    let hwnd = message_window::create_message_only_window(instance, WINDOW_CLASS, "FocuSD Screenshot Hotkey")
        .map_err(|error| error.to_string())?;
    if let Some(binding) = parse_shortcut_binding(DEFAULT_SHORTCUT) {
        match hotkey::register(hwnd, HOTKEY_ID, binding.modifiers, binding.key_code) {
            Ok(()) => {
                eprintln!("screenshot hotkey registered: {}", binding.label);
                if let Ok(mut active) = ACTIVE.lock() {
                    *active = Some(binding);
                }
            }
            Err(error) => eprintln!("screenshot hotkey registration failed: {error}"),
        }
    }
    if let Ok(mut window) = WINDOW.lock() {
        *window = Some(hwnd.0 as isize);
    }
    message_window::run_message_loop();
    let _ = hotkey::unregister(hwnd, HOTKEY_ID);
    Ok(())
}

fn apply_pending(hwnd: HWND) {
    let pending = PENDING.lock().ok().and_then(|mut value| value.take());
    let Some((binding, sender)) = pending else { return };
    let previous = ACTIVE.lock().ok().and_then(|mut value| value.take());
    if previous.is_some() {
        let _ = hotkey::unregister(hwnd, HOTKEY_ID);
    }
    let Some(binding) = binding else {
        let _ = sender.send(Ok(String::new()));
        return;
    };
    let result = hotkey::register(hwnd, HOTKEY_ID, binding.modifiers, binding.key_code)
        .map(|()| binding.label.clone())
        .map_err(|error| format!("快捷键 {} 已被占用或无法注册：{error}", binding.label));
    if let Ok(mut active) = ACTIVE.lock() {
        *active = if result.is_ok() {
            Some(binding)
        } else {
            previous.and_then(|old| hotkey::register(hwnd, HOTKEY_ID, old.modifiers, old.key_code).ok().map(|()| old))
        };
    }
    let _ = sender.send(result);
}

struct ScreenshotHotkeyWindow;

impl WindowMessages for ScreenshotHotkeyWindow {
    fn handle(hwnd: HWND, message: u32, wparam: WPARAM, _: LPARAM) -> Option<LRESULT> {
        if message == WM_HOTKEY && wparam.0 == HOTKEY_ID as usize {
            eprintln!("screenshot hotkey pressed");
            if let Some(app) = APP.get() {
                match crate::screenshot::window::show_overlay(app) {
                    Ok(()) => eprintln!("screenshot overlay shown"),
                    Err(error) => eprintln!("failed to open the screenshot overlay: {error}"),
                }
            }
        } else if message == REBIND_MESSAGE {
            apply_pending(hwnd);
        }
        None
    }
}
