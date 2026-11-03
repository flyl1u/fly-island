//! WinRT user notification listener: reads QQ toasts and repairs the QQ registration.

use base64::{engine::general_purpose::STANDARD, Engine};
use std::{
    os::windows::process::CommandExt,
    path::PathBuf,
    process::{Command, Stdio},
    sync::{mpsc, Arc},
    thread,
    time::{Duration, Instant},
};
use windows::{
    core::{HRESULT, HSTRING},
    Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
    UI::Notifications::{
        KnownNotificationBindings,
        Management::{UserNotificationListener, UserNotificationListenerAccessStatus},
        NotificationKinds, NotificationSetting, ToastNotificationManager, UserNotification,
    },
};

use super::*;

pub(super) const QQ_APP_ID: &str = "QQ";

pub(super) const REGISTRATION_REPAIR: &str =
    include_str!("../../../scripts/repair-qq-notification-registration.ps1");

pub(super) const DIAGNOSTIC_TITLE: &str = "FocuSD QQ 通知诊断";

pub(super) const DIAGNOSTIC_BODY: &str = "这是本机通道测试，不是聊天消息。";

pub(super) fn monitor(service: Arc<NotificationService>, receiver: mpsc::Receiver<()>) {
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

pub(super) fn qq_notification_setting() -> windows::core::Result<NotificationSetting> {
    unsafe { RoInitialize(RO_INIT_MULTITHREADED) }?;
    let _apartment = WinRT;
    ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(QQ_APP_ID))?.Setting()
}

pub(super) fn should_repair_registration(setting: &windows::core::Result<NotificationSetting>) -> bool {
    setting
        .as_ref()
        .is_err_and(|error| error.code() == HRESULT(0x80070490u32 as i32))
}

pub(super) fn registration_error(setting: windows::core::Result<NotificationSetting>) -> Option<String> {
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

pub(super) fn repair_registration(service: &NotificationService, generation: u64) -> Result<(), String> {
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

pub(super) struct WinRT;

impl Drop for WinRT {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

pub(super) fn read_notifications() -> Result<(NotificationStatus, Vec<QQNotification>), String> {
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

pub(super) fn read_qq_notification(
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
