use crate::messenger_activation::{activate_existing_window, is_interactive_window};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::{
    collections::HashMap,
    os::windows::process::CommandExt,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{mpsc, Arc, Mutex, OnceLock},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;
use windows::{
    core::{w, BOOL, HRESULT, HSTRING, PWSTR},
    Win32::{
        Foundation::{CloseHandle, HWND, LPARAM, WPARAM},
        System::{
            Registry::{RegGetValueW, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ},
            Threading::{
                OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
            WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
        },
        UI::{
            Shell::{Shell_NotifyIconGetRect, NOTIFYICONIDENTIFIER},
            WindowsAndMessaging::{
                AllowSetForegroundWindow, EnumWindows, GetClassNameW, GetForegroundWindow,
                GetWindow, GetWindowPlacement, GetWindowTextW, GetWindowThreadProcessId,
                IsWindowVisible, SendMessageTimeoutW, GW_OWNER, SMTO_ABORTIFHUNG, SMTO_BLOCK,
                SMTO_ERRORONEXIT, WINDOWPLACEMENT, WM_APP, WM_LBUTTONDBLCLK, WM_LBUTTONDOWN,
                WM_LBUTTONUP,
            },
        },
    },
    UI::Notifications::{
        KnownNotificationBindings,
        Management::{UserNotificationListener, UserNotificationListenerAccessStatus},
        NotificationKinds, NotificationSetting, ToastNotificationManager, UserNotification,
    },
};

const QQ_APP_ID: &str = "QQ";
const EVENT_NAME: &str = "qq-notifications-changed";
const MAX_ITEMS: usize = 20;
const REGISTRATION_REPAIR: &str =
    include_str!("../../scripts/repair-qq-notification-registration.ps1");
const DIAGNOSTIC_TITLE: &str = "FocuSD QQ 通知诊断";
const DIAGNOSTIC_BODY: &str = "这是本机通道测试，不是聊天消息。";
static SERVICE: OnceLock<Arc<NotificationService>> = OnceLock::new();

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QQNotification {
    id: String,
    title: String,
    body: String,
    created_at: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NotificationStatus {
    Disabled,
    Waiting,
    Listening,
    PermissionDenied,
    PermissionRequired,
    Error,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSnapshot {
    revision: u64,
    enabled: bool,
    status: NotificationStatus,
    items: Vec<QQNotification>,
    error: Option<String>,
}

impl Default for NotificationSnapshot {
    fn default() -> Self {
        Self {
            revision: 0,
            enabled: false,
            status: NotificationStatus::Disabled,
            items: Vec::new(),
            error: None,
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NotificationEvent {
    snapshot: NotificationSnapshot,
    newest_id: Option<String>,
    window_visible: bool,
}

#[derive(Default)]
struct NotificationBuffer {
    baseline: Option<HashMap<String, QQNotification>>,
    items: Vec<QQNotification>,
}

impl NotificationBuffer {
    fn sync(&mut self, mut current: Vec<QQNotification>) -> Option<String> {
        current.sort_by_key(|item| item.created_at);
        let mut newest = None;
        if let Some(previous) = &self.baseline {
            for item in &current {
                if previous.get(&item.id) != Some(item) {
                    self.items.retain(|existing| existing.id != item.id);
                    self.items.insert(0, item.clone());
                    self.items.truncate(MAX_ITEMS);
                    newest = Some(item.id.clone());
                }
            }
        }
        self.baseline = Some(
            current
                .into_iter()
                .map(|item| (item.id.clone(), item))
                .collect(),
        );
        newest
    }
}

#[derive(Default)]
struct MonitorState {
    snapshot: NotificationSnapshot,
    generation: u64,
    buffer: NotificationBuffer,
}

struct NotificationService {
    app: AppHandle,
    state: Mutex<MonitorState>,
    wake: mpsc::SyncSender<()>,
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    if SERVICE.get().is_some() {
        return Ok(());
    }
    let (wake, receiver) = mpsc::sync_channel(1);
    let service = Arc::new(NotificationService {
        app: app.clone(),
        state: Mutex::new(MonitorState::default()),
        wake,
    });
    SERVICE
        .set(service.clone())
        .map_err(|_| "QQ 通知服务已启动。".to_string())?;
    thread::Builder::new()
        .name("qq-notifications".into())
        .spawn(move || monitor(service, receiver))
        .map_err(|error| format!("无法启动 QQ 通知监听：{error}"))?;
    Ok(())
}

fn service() -> Result<&'static Arc<NotificationService>, String> {
    SERVICE
        .get()
        .ok_or_else(|| "QQ 通知服务尚未就绪。".to_string())
}

#[tauri::command]
pub fn get_qq_notification_state() -> Result<NotificationSnapshot, String> {
    Ok(service()?
        .state
        .lock()
        .map_err(|_| "QQ 通知状态不可用。")?
        .snapshot
        .clone())
}

pub(crate) fn diagnostic_state() -> Result<serde_json::Value, String> {
    let state = service()?.state.lock().map_err(|_| "QQ 通知状态不可用。")?;
    Ok(notification_diagnostics(&state.snapshot))
}

fn notification_diagnostics(snapshot: &NotificationSnapshot) -> serde_json::Value {
    serde_json::json!({
        "enabled": snapshot.enabled,
        "status": snapshot.status,
        "error": snapshot.error,
        "itemCount": snapshot.items.len(),
    })
}

#[tauri::command]
pub fn set_qq_notifications_enabled(enabled: bool) -> Result<NotificationSnapshot, String> {
    let service = service()?;
    let snapshot = {
        let mut state = service.state.lock().map_err(|_| "QQ 通知状态不可用。")?;
        if state.snapshot.enabled == enabled {
            return Ok(state.snapshot.clone());
        }
        state.generation += 1;
        state.buffer = NotificationBuffer::default();
        state.snapshot = NotificationSnapshot {
            revision: state.snapshot.revision + 1,
            enabled,
            status: if enabled {
                NotificationStatus::Waiting
            } else {
                NotificationStatus::Disabled
            },
            ..NotificationSnapshot::default()
        };
        state.snapshot.clone()
    };
    publish(service, snapshot.clone(), None);
    let _ = service.wake.try_send(());
    Ok(snapshot)
}

#[tauri::command]
pub fn clear_qq_notifications() -> Result<NotificationSnapshot, String> {
    let service = service()?;
    let snapshot = {
        let mut state = service.state.lock().map_err(|_| "QQ 通知状态不可用。")?;
        state.buffer.items.clear();
        state.snapshot.items.clear();
        state.snapshot.revision += 1;
        state.snapshot.clone()
    };
    publish(service, snapshot.clone(), None);
    Ok(snapshot)
}

#[tauri::command]
pub async fn request_qq_notification_access(app: AppHandle) -> Result<String, String> {
    let (sender, receiver) = mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let operation = (|| {
            let listener = UserNotificationListener::Current()?;
            let access = listener.GetAccessStatus()?;
            let operation = if access == UserNotificationListenerAccessStatus::Unspecified {
                Some(listener.RequestAccessAsync()?)
            } else {
                None
            };
            windows::core::Result::Ok((access, operation))
        })();
        let _ = sender.send(operation);
    })
    .map_err(|error| format!("无法发起通知授权：{error}"))?;
    let (access, operation) =
        tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(Duration::from_secs(5)))
            .await
            .map_err(|error| format!("通知授权线程失败：{error}"))?
            .map_err(|error| format!("无法发起通知授权：{error}"))?
            .map_err(|error| format!("无法请求 Windows 通知权限：{error}"))?;
    let access = match operation {
        Some(operation) => operation
            .await
            .map_err(|error| format!("Windows 通知授权失败：{error}"))?,
        None => access,
    };
    let _ = service()?.wake.try_send(());
    Ok(match access {
        UserNotificationListenerAccessStatus::Allowed => "allowed",
        UserNotificationListenerAccessStatus::Denied => "denied",
        _ => "unspecified",
    }
    .to_string())
}

#[tauri::command]
pub fn open_qq_notification_settings(app: AppHandle, access: bool) -> Result<(), String> {
    let url = if access {
        "ms-settings:privacy-notifications"
    } else {
        "ms-settings:notifications"
    };
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| format!("无法打开 Windows 通知设置：{error}"))
}

fn publish(
    service: &NotificationService,
    snapshot: NotificationSnapshot,
    newest_id: Option<String>,
) {
    let window_visible = service
        .app
        .get_webview_window("main")
        .is_some_and(|window| window.is_visible().unwrap_or(false));
    let event = NotificationEvent {
        snapshot,
        newest_id,
        window_visible,
    };
    let _ = service
        .app
        .emit_to(crate::settings_window::WINDOW_LABEL, EVENT_NAME, event.clone());
    let _ = service.app.emit_to("main", EVENT_NAME, event);
}

fn monitor(service: Arc<NotificationService>, receiver: mpsc::Receiver<()>) {
    let mut repair_generation = None;
    let mut repair_error = None;
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
        let poll = read_notifications();
        let channel_error = if matches!(&poll, Ok((NotificationStatus::Listening, _))) {
            let setting = qq_notification_setting();
            if repair_generation != Some(generation) {
                repair_error = None;
                if should_repair_registration(&setting) {
                    repair_generation = Some(generation);
                    repair_error = repair_registration(&service, generation).err();
                }
            }
            let setting = qq_notification_setting();
            if matches!(setting, Ok(NotificationSetting::Enabled)) {
                repair_error = None;
                None
            } else {
                repair_error.clone().or_else(|| registration_error(setting))
            }
        } else {
            None
        };
        let change = {
            let Ok(mut state) = service.state.lock() else {
                return;
            };
            if state.generation != generation || !state.snapshot.enabled {
                continue;
            }
            let before = state.snapshot.clone();
            let newest = match poll {
                Ok((NotificationStatus::Listening, current)) => {
                    state.snapshot.status = NotificationStatus::Listening;
                    state.snapshot.error = channel_error;
                    let newest = state.buffer.sync(current);
                    state.snapshot.items = state.buffer.items.clone();
                    newest
                }
                Ok((status, _)) => {
                    state.buffer = NotificationBuffer::default();
                    state.snapshot.items.clear();
                    state.snapshot.status = status;
                    state.snapshot.error = None;
                    None
                }
                Err(error) => {
                    state.snapshot.status = NotificationStatus::Error;
                    state.snapshot.error = Some(error);
                    None
                }
            };
            if state.snapshot != before {
                state.snapshot.revision += 1;
                Some((state.snapshot.clone(), newest))
            } else {
                None
            }
        };
        if let Some((snapshot, newest)) = change {
            publish(&service, snapshot, newest);
        }
        if receiver.recv_timeout(Duration::from_secs(1))
            == Err(mpsc::RecvTimeoutError::Disconnected)
        {
            return;
        }
    }
}

fn qq_notification_setting() -> windows::core::Result<NotificationSetting> {
    unsafe { RoInitialize(RO_INIT_MULTITHREADED) }?;
    let _apartment = WinRT;
    ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(QQ_APP_ID))?.Setting()
}

fn should_repair_registration(setting: &windows::core::Result<NotificationSetting>) -> bool {
    setting
        .as_ref()
        .is_err_and(|error| error.code() == HRESULT(0x80070490u32 as i32))
}

fn registration_error(setting: windows::core::Result<NotificationSetting>) -> Option<String> {
    match setting {
        Ok(NotificationSetting::Enabled) => None,
        Ok(NotificationSetting::DisabledForApplication) => {
            Some("QQ 的 Windows 通知已关闭，请在系统通知设置中开启。".into())
        }
        Ok(NotificationSetting::DisabledForUser) => {
            Some("Windows 系统通知已关闭，请在系统通知设置中开启。".into())
        }
        Ok(NotificationSetting::DisabledByGroupPolicy) => {
            Some("管理员策略禁止了 Windows 通知，请联系管理员。".into())
        }
        Ok(_) => Some("QQ 当前安装方式不支持系统通知，请检查或更新 QQ。".into()),
        Err(error) => Some(format!(
            "QQ 通知通道尚未就绪，请确认已安装 QQ；可关闭后重新开启接收以重试：{error}"
        )),
    }
}

fn repair_registration(service: &NotificationService, generation: u64) -> Result<(), String> {
    // Embed the existing guarded repair so installed builds do not depend on the repository.
    let script = format!("& {{\n{REGISTRATION_REPAIR}\n}} -Repair");
    let bytes: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let system_root = std::env::var_os("SystemRoot").ok_or("无法定位 Windows 通知修复工具。")?;
    let executable =
        PathBuf::from(system_root).join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let mut child = Command::new(executable)
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-EncodedCommand",
            &STANDARD.encode(bytes),
        ])
        .creation_flags(0x08000000)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("无法启动 QQ 通知自动修复：{error}"))?;
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return if status.success() {
                    Ok(())
                } else {
                    Err(
                        "QQ 通知自动修复未完成，请确认 QQ 安装正常；可关闭后重新开启接收以重试。"
                            .into(),
                    )
                }
            }
            Ok(None)
                if Instant::now() < deadline
                    && service.state.lock().is_ok_and(|state| {
                        state.snapshot.enabled && state.generation == generation
                    }) =>
            {
                thread::sleep(Duration::from_millis(50))
            }
            result => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(match result {
                    Err(error) => format!("QQ 通知自动修复失败：{error}"),
                    _ => "QQ 通知自动修复已停止或超时，可关闭后重新开启接收以重试。".into(),
                });
            }
        }
    }
}

struct WinRT;
impl Drop for WinRT {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

fn read_notifications() -> Result<(NotificationStatus, Vec<QQNotification>), String> {
    unsafe { RoInitialize(RO_INIT_MULTITHREADED) }
        .map_err(|error| format!("无法初始化 Windows 通知：{error}"))?;
    let _apartment = WinRT;
    let listener = UserNotificationListener::Current()
        .map_err(|error| format!("Windows 通知监听不可用：{error}"))?;
    let access = listener
        .GetAccessStatus()
        .map_err(|error| format!("无法检查通知权限：{error}"))?;
    if access != UserNotificationListenerAccessStatus::Allowed {
        return Ok((
            if access == UserNotificationListenerAccessStatus::Denied {
                NotificationStatus::PermissionDenied
            } else {
                NotificationStatus::PermissionRequired
            },
            Vec::new(),
        ));
    }
    let operation = listener
        .GetNotificationsAsync(NotificationKinds::Toast)
        .map_err(|error| format!("无法读取 Windows 通知：{error}"))?;
    let notifications =
        pollster::block_on(operation).map_err(|error| format!("无法读取 Windows 通知：{error}"))?;
    let mut items = Vec::new();
    for notification in notifications {
        if let Ok(Some(item)) = read_qq_notification(&notification) {
            items.push(item);
        }
    }
    Ok((NotificationStatus::Listening, items))
}

fn read_qq_notification(
    notification: &UserNotification,
) -> windows::core::Result<Option<QQNotification>> {
    if notification.AppInfo()?.AppUserModelId()? != QQ_APP_ID {
        return Ok(None);
    }
    let id = notification.Id()?;
    let ticks = notification.CreationTime()?.UniversalTime;
    let mut parts = Vec::new();
    if let Ok(elements) = notification
        .Notification()?
        .Visual()?
        .GetBinding(&KnownNotificationBindings::ToastGeneric()?)
        .and_then(|binding| binding.GetTextElements())
    {
        for element in elements {
            if let Ok(text) = element.Text() {
                parts.push(text.to_string_lossy());
            }
        }
    }
    if parts.first().is_some_and(|title| title == DIAGNOSTIC_TITLE)
        && parts.iter().any(|body| body == DIAGNOSTIC_BODY)
    {
        return Ok(None);
    }
    if parts
        .first()
        .is_some_and(|title| title == "FocuSD QQ notification diagnostic")
        && parts
            .iter()
            .any(|body| body == "Local channel test; this is not a chat message.")
    {
        return Ok(None);
    }
    let title = parts
        .first()
        .filter(|text| !text.trim().is_empty())
        .cloned()
        .unwrap_or_else(|| "QQ".into());
    let body = parts.iter().skip(1).cloned().collect::<Vec<_>>().join("\n");
    Ok(Some(QQNotification {
        id: format!("QQ:{id}:{ticks}"),
        title: title.chars().take(120).collect(),
        body: body.chars().take(1000).collect(),
        created_at: ticks / 10_000 - 11_644_473_600_000,
    }))
}

fn qq_executable() -> Result<PathBuf, String> {
    for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        for key in [
            w!("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\QQ"),
            w!("Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\QQ"),
        ] {
            let mut data = [0u16; 2048];
            let mut bytes = (data.len() * 2) as u32;
            let result = unsafe {
                RegGetValueW(
                    root,
                    key,
                    w!("DisplayIcon"),
                    RRF_RT_REG_SZ,
                    None,
                    Some(data.as_mut_ptr().cast()),
                    Some(&mut bytes),
                )
            };
            if result.is_ok() {
                let length = data.iter().position(|ch| *ch == 0).unwrap_or(data.len());
                let icon = String::from_utf16_lossy(&data[..length]);
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

struct QQWindowSearch<'a> {
    executable: &'a Path,
    windows: Vec<QQWindow>,
    tray_windows: Vec<(HWND, u32)>,
    running: bool,
}

struct QQWindow {
    handle: HWND,
    process_id: u32,
    visible: bool,
    area: i64,
}

fn preferred_qq_window(windows: &[QQWindow], foreground: HWND) -> Option<&QQWindow> {
    windows.iter().max_by_key(|window| {
        (
            window.visible && window.handle == foreground,
            window.visible,
            window.area,
        )
    })
}

unsafe extern "system" fn find_qq_window(window: HWND, context: LPARAM) -> BOOL {
    let search = &mut *(context.0 as *mut QQWindowSearch<'_>);
    let mut process_id = 0;
    GetWindowThreadProcessId(window, Some(&mut process_id));
    if let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) {
        let mut path = [0u16; 32768];
        let mut length = path.len() as u32;
        let result = QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(path.as_mut_ptr()),
            &mut length,
        );
        let matches = result.is_ok()
            && String::from_utf16_lossy(&path[..length as usize])
                .eq_ignore_ascii_case(&search.executable.to_string_lossy());
        let _ = CloseHandle(process);
        if !matches {
            return true.into();
        }
        search.running = true;
        let mut title = [0u16; 32];
        let length = GetWindowTextW(window, &mut title) as usize;
        let mut class = [0u16; 256];
        let class_length = GetClassNameW(window, &mut class) as usize;
        let class = String::from_utf16_lossy(&class[..class_length]);
        if class == "Electron_NotifyIconHostWindow" {
            search.tray_windows.push((window, process_id));
            return true.into();
        }
        let mut placement = WINDOWPLACEMENT {
            length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
            ..Default::default()
        };
        if String::from_utf16_lossy(&title[..length]) != "QQ"
            || !["Chrome_WidgetWin_1", "TXGuiFoundation"].contains(&class.as_str())
            || GetWindow(window, GW_OWNER).is_ok_and(|owner| !owner.is_invalid())
            || GetWindowPlacement(window, &mut placement).is_err()
        {
            return true.into();
        }
        let width = placement.rcNormalPosition.right - placement.rcNormalPosition.left;
        let height = placement.rcNormalPosition.bottom - placement.rcNormalPosition.top;
        if width >= 500 && height >= 300 {
            search.windows.push(QQWindow {
                handle: window,
                process_id,
                visible: IsWindowVisible(window).as_bool(),
                area: i64::from(width) * i64::from(height),
            });
        }
    }
    true.into()
}

fn existing_qq_windows(executable: &Path) -> Result<QQWindowSearch<'_>, String> {
    let mut search = QQWindowSearch {
        executable,
        windows: Vec::new(),
        tray_windows: Vec::new(),
        running: false,
    };
    unsafe {
        EnumWindows(
            Some(find_qq_window),
            LPARAM((&mut search as *mut QQWindowSearch<'_>) as isize),
        )
        .map_err(|error| format!("无法查找已运行的 QQ 窗口：{error}"))?;
    }
    Ok(search)
}

fn activate_existing_qq(executable: &Path) -> Result<(), String> {
    let search = existing_qq_windows(executable)?;
    let original = preferred_qq_window(&search.windows, unsafe { GetForegroundWindow() })
        .ok_or_else(|| {
            if search.running {
                "QQ 已在运行，但未找到可用的主窗口，请从系统托盘打开 QQ。"
            } else {
                "未找到正在运行的 QQ 窗口，请先打开并登录桌面版 QQ。"
            }
            .to_string()
        })?;
    let expected_process = original.process_id;
    unsafe {
        let _ = AllowSetForegroundWindow(expected_process);
    }
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
        let identifier = NOTIFYICONIDENTIFIER {
            cbSize: std::mem::size_of::<NOTIFYICONIDENTIFIER>() as u32,
            hWnd: tray.0,
            uID: id,
            ..Default::default()
        };
        if unsafe { Shell_NotifyIconGetRect(&identifier) }.is_ok() {
            if icon_id.replace(id).is_some() {
                return Err(
                    "QQ 有多个托盘图标，无法确认主入口，请双击系统托盘中的 QQ 图标。".into(),
                );
            }
        }
    }
    let icon_id = icon_id.ok_or("QQ 托盘图标尚未就绪，请从系统托盘打开 QQ。")?;
    unsafe {
        for message in [WM_LBUTTONDOWN, WM_LBUTTONUP, WM_LBUTTONDBLCLK, WM_LBUTTONUP] {
            if SendMessageTimeoutW(
                tray.0,
                WM_APP + 1,
                WPARAM(icon_id as usize),
                LPARAM(message as isize),
                SMTO_ABORTIFHUNG | SMTO_BLOCK | SMTO_ERRORONEXIT,
                1_000,
                None,
            )
            .0 == 0
            {
                return Err("QQ 没有响应托盘唤回请求，请从系统托盘打开。".into());
            }
        }
    }
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        let current = existing_qq_windows(executable)?;
        if let Some(window) =
            preferred_qq_window(&current.windows, unsafe { GetForegroundWindow() })
        {
            if window.process_id == expected_process && is_interactive_window(window.handle) {
                return activate_existing_window(window.handle, "QQ");
            }
        }
        thread::sleep(Duration::from_millis(50));
    }
    Err("QQ 未能恢复可交互的主窗口，请双击系统托盘中的 QQ 图标。".into())
}

#[tauri::command]
pub async fn open_qq() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| activate_existing_qq(&qq_executable()?))
        .await
        .map_err(|error| format!("打开 QQ 的线程失败：{error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::UI::WindowsAndMessaging::IsIconic;

    #[test]
    fn diagnostic_reports_never_include_chat_content() {
        let snapshot = NotificationSnapshot {
            items: vec![QQNotification {
                id: "private-id".into(),
                title: "private-sender".into(),
                body: "private-message".into(),
                created_at: 123,
            }],
            ..Default::default()
        };
        let report = notification_diagnostics(&snapshot);
        assert_eq!(report["itemCount"], 1);
        assert!(!report.to_string().contains("private-"));
        assert!(report.get("items").is_none());
    }

    #[test]
    fn visible_qq_window_is_preferred_but_tray_hidden_main_can_be_reused() {
        let windows = [
            QQWindow {
                handle: HWND::default(),
                process_id: 1,
                visible: false,
                area: 2_000_000,
            },
            QQWindow {
                handle: HWND::default(),
                process_id: 1,
                visible: true,
                area: 800_000,
            },
        ];
        assert_eq!(
            preferred_qq_window(&windows, HWND::default()).unwrap().area,
            800_000
        );
        assert_eq!(
            preferred_qq_window(&windows[..1], HWND::default())
                .unwrap()
                .area,
            2_000_000
        );
    }

    #[test]
    fn foreground_main_is_preferred_over_a_larger_preloaded_window() {
        let windows = [
            QQWindow {
                handle: HWND(1usize as _),
                process_id: 1,
                visible: true,
                area: 2_000_000,
            },
            QQWindow {
                handle: HWND(2usize as _),
                process_id: 1,
                visible: true,
                area: 800_000,
            },
        ];
        assert_eq!(
            preferred_qq_window(&windows, windows[1].handle)
                .unwrap()
                .handle,
            windows[1].handle
        );
    }

    #[test]
    #[ignore = "Invokes QQ's tray double-click handler and verifies the original main process"]
    fn window_activation_reuses_the_existing_qq_process() {
        let executable = qq_executable().unwrap();
        let before = existing_qq_windows(&executable).unwrap();
        let original = preferred_qq_window(&before.windows, unsafe { GetForegroundWindow() })
            .expect("QQ main window is required");
        let mut expected_process = 0;
        unsafe {
            GetWindowThreadProcessId(original.handle, Some(&mut expected_process));
        }
        assert_ne!(expected_process, 0);
        for _ in 0..2 {
            let result = activate_existing_qq(&executable);
            assert!(
                result
                    .as_ref()
                    .err()
                    .is_none_or(|error| error.contains("未能切换到前台")),
                "{result:?}"
            );
            let after = existing_qq_windows(&executable).unwrap();
            let window = preferred_qq_window(&after.windows, unsafe { GetForegroundWindow() })
                .expect("The existing main window must be visible");
            let mut process_id = 0;
            unsafe {
                GetWindowThreadProcessId(window.handle, Some(&mut process_id));
            }
            assert_eq!(process_id, expected_process);
            assert!(window.visible);
            assert!(!unsafe { IsIconic(window.handle) }.as_bool());
            assert!(is_interactive_window(window.handle));
            // A background test runner may be denied focus. That must never launch another QQ.
            if let Err(error) = result {
                assert!(error.contains("未能切换到前台"), "{error}");
                assert_ne!(
                    unsafe { windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow() },
                    window.handle
                );
            }
        }
    }

    #[test]
    #[ignore = "Reads Windows taskbar accessibility metadata; requires a restored QQ main window"]
    fn restored_qq_has_a_taskbar_button() {
        use windows::core::Interface;
        use windows::Win32::{
            System::Com::{
                CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
                COINIT_MULTITHREADED,
            },
            UI::{
                Accessibility::{
                    CUIAutomation8, IUIAutomation, IUIAutomation2, TreeScope_Descendants,
                },
                WindowsAndMessaging::{EnumChildWindows, FindWindowW},
            },
        };
        unsafe extern "system" fn collect_taskbar_children(window: HWND, context: LPARAM) -> BOOL {
            let children = &mut *(context.0 as *mut Vec<HWND>);
            let mut class = [0u16; 256];
            let length = GetClassNameW(window, &mut class) as usize;
            if [
                "MSTaskListWClass",
                "Windows.UI.Composition.DesktopWindowContentBridge",
            ]
            .contains(&String::from_utf16_lossy(&class[..length]).as_str())
            {
                children.push(window);
            }
            true.into()
        }
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED).ok().unwrap();
            let result = (|| -> windows::core::Result<usize> {
                let automation: IUIAutomation =
                    CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER)?;
                let options = automation.cast::<IUIAutomation2>()?;
                options.SetConnectionTimeout(1_000)?;
                options.SetTransactionTimeout(1_000)?;
                let taskbar_handle = FindWindowW(w!("Shell_TrayWnd"), None)?;
                let mut roots = vec![taskbar_handle];
                let _ = EnumChildWindows(
                    Some(taskbar_handle),
                    Some(collect_taskbar_children),
                    LPARAM((&mut roots as *mut Vec<HWND>) as isize),
                );
                let mut count = 0;
                for root in roots {
                    let taskbar = automation.ElementFromHandle(root)?;
                    let elements = taskbar
                        .FindAll(TreeScope_Descendants, &automation.CreateTrueCondition()?)?;
                    for index in 0..elements.Length()? {
                        let element = elements.GetElement(index)?;
                        let class = element.CurrentClassName()?.to_string();
                        if class.contains("TaskListButton")
                            && element.CurrentName()?.to_string().starts_with("QQ")
                        {
                            count += 1;
                        }
                    }
                }
                Ok(count)
            })();
            CoUninitialize();
            assert!(
                result.unwrap() > 0,
                "QQ must have an application button on the primary taskbar"
            );
        }
    }

    #[test]
    fn registration_repair_only_handles_missing_sender_records() {
        assert!(should_repair_registration(&Err(
            windows::core::Error::from_hresult(HRESULT(0x80070490u32 as i32),)
        )));
        assert!(!should_repair_registration(&Err(
            windows::core::Error::from_hresult(HRESULT(0x80070005u32 as i32),)
        )));
        for setting in [
            NotificationSetting::Enabled,
            NotificationSetting::DisabledForApplication,
            NotificationSetting::DisabledForUser,
            NotificationSetting::DisabledByGroupPolicy,
            NotificationSetting::DisabledByManifest,
        ] {
            assert!(!should_repair_registration(&Ok(setting)));
        }
    }

    #[test]
    fn blocked_notification_channels_report_the_actionable_cause() {
        assert!(registration_error(Ok(NotificationSetting::Enabled)).is_none());
        assert!(
            registration_error(Ok(NotificationSetting::DisabledForApplication))
                .unwrap()
                .contains("QQ 的 Windows 通知已关闭")
        );
        assert!(registration_error(Ok(NotificationSetting::DisabledForUser))
            .unwrap()
            .contains("Windows 系统通知已关闭"));
        assert!(
            registration_error(Ok(NotificationSetting::DisabledByGroupPolicy))
                .unwrap()
                .contains("管理员")
        );
    }

    fn notice(id: u32, body: &str) -> QQNotification {
        QQNotification {
            id: id.to_string(),
            title: "QQ".into(),
            body: body.into(),
            created_at: id as i64,
        }
    }
    #[test]
    fn startup_notifications_do_not_replay_and_new_messages_are_deduplicated() {
        let mut buffer = NotificationBuffer::default();
        assert_eq!(buffer.sync(vec![notice(1, "existing")]), None);
        assert!(buffer.items.is_empty());
        let current = vec![notice(1, "existing"), notice(2, "new")];
        assert_eq!(buffer.sync(current.clone()), Some("2".into()));
        assert_eq!(buffer.sync(current), None);
        assert_eq!(buffer.items, vec![notice(2, "new")]);
    }
    #[test]
    fn updated_notifications_replace_content_without_increasing_count() {
        let mut buffer = NotificationBuffer::default();
        buffer.sync(vec![]);
        buffer.sync(vec![notice(1, "first")]);
        assert_eq!(buffer.sync(vec![notice(1, "updated")]), Some("1".into()));
        assert_eq!(buffer.items, vec![notice(1, "updated")]);
    }
    #[test]
    fn clearing_history_does_not_redisplay_unchanged_system_notifications() {
        let mut buffer = NotificationBuffer::default();
        buffer.sync(vec![]);
        let current = vec![notice(1, "new")];
        buffer.sync(current.clone());
        buffer.items.clear();
        assert_eq!(buffer.sync(current), None);
        assert!(buffer.items.is_empty());
    }
    #[test]
    fn notification_history_is_bounded_and_keeps_latest_first() {
        let mut buffer = NotificationBuffer::default();
        buffer.sync(vec![]);
        buffer.sync((1..=25).map(|id| notice(id, "new")).collect());
        assert_eq!(buffer.items.len(), MAX_ITEMS);
        assert_eq!(buffer.items.first().unwrap().id, "25");
        assert_eq!(buffer.items.last().unwrap().id, "6");
    }

    #[test]
    #[ignore = "Requires a real QQ system notification on this Windows account"]
    fn reads_a_real_qq_system_notification() {
        let deadline = std::time::Instant::now() + Duration::from_secs(60);
        loop {
            let (status, items) =
                read_notifications().expect("Windows notifications must be readable");
            assert_eq!(status, NotificationStatus::Listening);
            if !items.is_empty() {
                assert!(items
                    .iter()
                    .all(|item| item.id.starts_with("QQ:") && !item.title.is_empty()));
                return;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "Receive a real QQ notification during this test"
            );
            thread::sleep(Duration::from_secs(1));
        }
    }
}
