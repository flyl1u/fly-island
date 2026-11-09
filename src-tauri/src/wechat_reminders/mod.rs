//! WeChat reminders: watches WeChat's tray flash and restores its window on request.

mod source;

#[cfg(test)]
mod tests;

use serde::Serialize;
use source::{installed_executable, ReminderListener, ReminderSignal};
use std::{
    sync::{mpsc, Arc, Mutex, OnceLock},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};
use windows::Win32::Foundation::HWND;


use crate::win32;

static SERVICE: OnceLock<Arc<ReminderService>> = OnceLock::new();

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderSnapshot {
    revision: u64,
    enabled: bool,
    status: String,
    pending: bool,
    last_attention_at: Option<u64>,
    error: Option<String>,
}

impl Default for ReminderSnapshot {
    fn default() -> Self {
        Self {
            revision: 0,
            enabled: false,
            status: "disabled".into(),
            pending: false,
            last_attention_at: None,
            error: None,
        }
    }
}

#[derive(Default)]
struct ReminderState {
    snapshot: ReminderSnapshot,
    generation: u64,
}

impl ReminderState {
    fn set_enabled(&mut self, enabled: bool) -> bool {
        if self.snapshot.enabled == enabled {
            return false;
        }
        self.generation += 1;
        self.snapshot = ReminderSnapshot {
            revision: self.snapshot.revision + 1,
            enabled,
            status: if enabled { "waiting" } else { "disabled" }.into(),
            ..Default::default()
        };
        true
    }

    fn apply(&mut self, generation: u64, signal: ReminderSignal, now: u64) -> bool {
        if !self.snapshot.enabled || self.generation != generation {
            return false;
        }
        match signal {
            ReminderSignal::Attention if !self.snapshot.pending => {
                self.snapshot.pending = true;
                self.snapshot.last_attention_at = Some(now);
            }
            ReminderSignal::Activated if self.snapshot.pending => self.snapshot.pending = false,
            _ => return false,
        }
        self.snapshot.revision += 1;
        true
    }
}

struct ReminderService {
    app: AppHandle,
    state: Mutex<ReminderState>,
    wake: mpsc::SyncSender<()>,
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    if SERVICE.get().is_some() {
        return Ok(());
    }
    let (wake, receiver) = mpsc::sync_channel(1);
    let service = Arc::new(ReminderService {
        app: app.clone(),
        state: Mutex::new(ReminderState::default()),
        wake,
    });
    let worker = service.clone();
    thread::Builder::new()
        .name("wechat-reminders".into())
        .spawn(move || monitor(worker, receiver))
        .map_err(|error| format!("无法启动微信提醒监听：{error}"))?;
    SERVICE
        .set(service)
        .map_err(|_| "微信提醒服务已启动。".to_string())
}

fn service() -> Result<&'static Arc<ReminderService>, String> {
    SERVICE.get().ok_or_else(|| "微信提醒服务尚未就绪。".into())
}

fn publish(service: &ReminderService, snapshot: ReminderSnapshot) {
    let visible = service
        .app
        .get_webview_window("main")
        .is_some_and(|window| window.is_visible().unwrap_or(false));
    let payload = serde_json::json!({"snapshot": snapshot, "windowVisible": visible});
    let _ = service.app.emit_to(
        crate::settings_window::WINDOW_LABEL,
        "wechat-reminder-changed",
        payload.clone(),
    );
    let _ = service
        .app
        .emit_to("main", "wechat-reminder-changed", payload);
}

#[tauri::command]
pub fn get_wechat_reminder_state() -> Result<ReminderSnapshot, String> {
    Ok(service()?
        .state
        .lock()
        .map_err(|_| "微信提醒状态不可用。")?
        .snapshot
        .clone())
}

pub(crate) fn diagnostic_state() -> Result<serde_json::Value, String> {
    let state = service()?
        .state
        .lock()
        .map_err(|_| "微信提醒状态不可用。")?;
    Ok(serde_json::json!({
        "enabled": state.snapshot.enabled,
        "status": state.snapshot.status,
        "pending": state.snapshot.pending,
        "lastAttentionAt": state.snapshot.last_attention_at,
        "error": state.snapshot.error,
    }))
}

#[tauri::command]
pub fn set_wechat_reminders_enabled(enabled: bool) -> Result<ReminderSnapshot, String> {
    let service = service()?;
    let (snapshot, changed) = {
        let mut state = service.state.lock().map_err(|_| "微信提醒状态不可用。")?;
        let changed = state.set_enabled(enabled);
        (state.snapshot.clone(), changed)
    };
    if changed {
        publish(service, snapshot.clone());
        let _ = service.wake.try_send(());
    }
    Ok(snapshot)
}

fn signal(service: &ReminderService, generation: u64, event: ReminderSignal) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let snapshot = {
        let Ok(mut state) = service.state.lock() else {
            return;
        };
        if !state.apply(generation, event, now) {
            return;
        }
        state.snapshot.clone()
    };
    publish(service, snapshot);
}

fn connection(service: &ReminderService, generation: u64, error: Option<String>) {
    let snapshot = {
        let Ok(mut state) = service.state.lock() else {
            return;
        };
        if !state.snapshot.enabled || state.generation != generation {
            return;
        }
        let status = if error.is_some() {
            "error"
        } else {
            "listening"
        };
        if state.snapshot.status == status && state.snapshot.error == error {
            return;
        }
        state.snapshot.status = status.into();
        state.snapshot.error = error;
        state.snapshot.revision += 1;
        state.snapshot.clone()
    };
    publish(service, snapshot);
}

fn monitor(service: Arc<ReminderService>, receiver: mpsc::Receiver<()>) {
    loop {
        let (enabled, generation) = match service.state.lock() {
            Ok(state) => (state.snapshot.enabled, state.generation),
            Err(_) => return,
        };
        if !enabled {
            if receiver.recv().is_err() {
                return;
            }
            continue;
        }
        let callback_service = service.clone();
        let listener = installed_executable().and_then(|executable| {
            ReminderListener::new(executable, move |event| {
                signal(&callback_service, generation, event)
            })
        });
        match listener {
            Ok(listener) => {
                connection(&service, generation, None);
                loop {
                    if !service
                        .state
                        .lock()
                        .is_ok_and(|state| state.snapshot.enabled && state.generation == generation)
                    {
                        break;
                    }
                    listener.poll();
                    let _ = listener.stats();
                    if receiver.recv_timeout(Duration::from_millis(50))
                        == Err(mpsc::RecvTimeoutError::Disconnected)
                    {
                        return;
                    }
                }
            }
            Err(error) => {
                connection(&service, generation, Some(error));
                if receiver.recv_timeout(Duration::from_secs(5))
                    == Err(mpsc::RecvTimeoutError::Disconnected)
                {
                    return;
                }
            }
        }
    }
}

#[tauri::command]
pub async fn open_wechat() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        let executable = installed_executable()?;
        if activate_existing_wechat(&executable)? {
            return Ok(());
        }
        Err("未找到正在运行的微信窗口，请先打开并登录桌面版微信。".into())
    })
    .await
    .map_err(|error| format!("打开微信的线程失败：{error}"))?
}

struct WeChatWindow {
    handle: HWND,
    started_at: u64,
    main_sized: bool,
    visible: bool,
}

struct WindowSearch {
    executable: String,
    found: Vec<WeChatWindow>,
    running: bool,
}

fn preferred_window(windows: &[WeChatWindow]) -> Option<&WeChatWindow> {
    // Only full main windows qualify; prefer the visible window, then the older instance.
    windows
        .iter()
        .filter(|window| window.main_sized)
        .min_by_key(|window| (!window.visible, window.started_at))
}

fn find_wechat_window(search: &mut WindowSearch, window: HWND) {
    let process_id = win32::process::window_process_id(window);
    let Some(path) = win32::process::image_path(process_id) else {
        return;
    };
    if !path.eq_ignore_ascii_case(&search.executable) {
        return;
    }
    let started_at = win32::process_times::start_time(process_id).unwrap_or(u64::MAX);
    search.running = true;
    let title = win32::window::window_text(window, 32);
    if !["微信", "WeChat", "Weixin"].contains(&title.as_str()) {
        return;
    }
    let main_sized = win32::window::normal_position(window).is_some_and(|position| {
        position.right - position.left >= 500 && position.bottom - position.top >= 300
    });
    search.found.push(WeChatWindow {
        handle: window,
        started_at,
        main_sized,
        visible: win32::window::is_visible(window),
    });
}

fn existing_wechat_windows(executable: &std::path::Path) -> Result<WindowSearch, String> {
    let mut search = WindowSearch {
        executable: executable.to_string_lossy().into_owned(),
        found: Vec::new(),
        running: false,
    };
    win32::window::for_each_top_level_window(|window| find_wechat_window(&mut search, window))
        .map_err(|error| format!("无法查找已运行的微信窗口：{error}"))?;
    Ok(search)
}

fn activate_existing_wechat(executable: &std::path::Path) -> Result<bool, String> {
    let search = existing_wechat_windows(executable)?;
    if !search.running {
        return Ok(false);
    }
    let original = preferred_window(&search.found)
        .ok_or("微信已在运行，但未定位到主窗口，请先从系统托盘打开并登录微信。")?;
    let expected_process = win32::process::window_process_id(original.handle);
    // The registered handler restores Qt's own UI state. Showing its HWND directly can leave it blank.
    tauri_plugin_opener::open_url("weixin://", None::<&str>).map_err(|error| {
        format!("无法通过微信注册入口唤回客户端，请从系统托盘打开微信：{error}")
    })?;
    for _ in 0..40 {
        thread::sleep(Duration::from_millis(50));
        let current = existing_wechat_windows(executable)?;
        if let Some(window) = preferred_window(&current.found) {
            let process_id = win32::process::window_process_id(window.handle);
            if process_id == expected_process
                && window.visible
                && !win32::window::is_minimized(window.handle)
            {
                return Ok(true);
            }
        }
    }
    Err("微信未能恢复原来的主窗口，请双击系统托盘中的微信图标。".into())
}

/// This module's Tauri commands. `lib.rs` chains every module's list into one
/// `generate_handler!`, so adding a command only touches this file.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::wechat_reminders::get_wechat_reminder_state,
            crate::wechat_reminders::set_wechat_reminders_enabled,
            crate::wechat_reminders::open_wechat,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
