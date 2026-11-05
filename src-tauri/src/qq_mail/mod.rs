//! QQ Mail over IMAP: commands, snapshot types and the background service.

mod content;
mod credentials;
mod service;
mod session;

#[cfg(test)]
mod tests;

use serde::Serialize;
use std::{
    sync::{mpsc, Arc, Mutex},
    thread,
    time::Instant,
};
use tauri::AppHandle;

use content::*;
use credentials::*;
use service::*;
use session::*;

const EVENT: &str = "qq-mail-changed";

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailMessage {
    id: String,
    uid: u32,
    sender: String,
    subject: String,
    received_at: Option<i64>,
    unread: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailContent {
    id: String,
    content: String,
    content_type: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MailStatus {
    Disconnected,
    Connecting,
    Connected,
    Paused,
    AuthRequired,
    Error,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailSnapshot {
    revision: u64,
    email: Option<String>,
    configured: bool,
    enabled: bool,
    syncing: bool,
    status: MailStatus,
    unread_count: Option<usize>,
    items: Vec<MailMessage>,
    last_synced_at: Option<i64>,
    error: Option<String>,
}

impl Default for MailSnapshot {
    fn default() -> Self {
        Self {
            revision: 0,
            email: None,
            configured: false,
            enabled: false,
            syncing: false,
            status: MailStatus::Disconnected,
            unread_count: None,
            items: Vec::new(),
            last_synced_at: None,
            error: None,
        }
    }
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    if SERVICE.get().is_some() {
        return Ok(());
    }
    let (sender, receiver) = mpsc::channel();
    let service = Arc::new(MailService {
        app: app.clone(),
        state: Mutex::new(MailState::default()),
        sender,
        idle_socket: Mutex::new(None),
    });
    SERVICE
        .set(service.clone())
        .map_err(|_| "QQ 邮箱服务已启动。")?;
    thread::Builder::new()
        .name("qq-mail".into())
        .spawn(move || worker(service, receiver))
        .map_err(|_| "无法启动 QQ 邮箱服务。".to_string())?;
    Ok(())
}

fn service() -> Result<&'static Arc<MailService>, String> {
    SERVICE.get().ok_or_else(|| "QQ 邮箱服务尚未就绪。".into())
}

#[tauri::command]
pub fn get_qq_mail_state() -> Result<MailSnapshot, String> {
    Ok(service()?.lock()?.snapshot.clone())
}

#[tauri::command]
pub async fn connect_qq_mail(
    email: String,
    authorization_code: String,
) -> Result<MailSnapshot, String> {
    let email = normalize_email(&email)?;
    let secret = authorization_code.trim().to_string();
    if secret.is_empty() || secret.len() > 256 || secret.chars().any(char::is_control) {
        return Err("请输入 QQ 邮箱设置中生成的授权码。".into());
    }
    let service = service()?;
    let (generation, snapshot) = {
        let mut state = service.lock()?;
        if state.snapshot.configured
            && state
                .snapshot
                .email
                .as_ref()
                .is_some_and(|current| current != &email)
        {
            return Err("请先断开当前邮箱，再连接其他账号。".into());
        }
        state.invalidate();
        state.snapshot.email = Some(email.clone());
        state.snapshot.enabled = true;
        state.snapshot.syncing = true;
        state.snapshot.status = MailStatus::Connecting;
        state.snapshot.error = None;
        (state.generation, state.changed())
    };
    service.publish(snapshot, None);
    let (reply, receiver) = mpsc::channel();
    service
        .send(Work::Connect {
            generation,
            email,
            secret,
            reply,
        })
        .map_err(|_| "QQ 邮箱服务不可用。".to_string())?;
    await_reply(receiver).await
}

#[tauri::command]
pub async fn set_qq_mail_enabled(email: String, enabled: bool) -> Result<MailSnapshot, String> {
    let email = normalize_email(&email)?;
    tauri::async_runtime::spawn_blocking(move || {
        let service = service()?;
        let mut state = service.lock()?;
        if state
            .snapshot
            .email
            .as_ref()
            .is_some_and(|current| current != &email)
        {
            return Err("请先断开当前邮箱，再连接其他账号。".into());
        }
        if state.snapshot.email.as_ref() == Some(&email)
            && state.snapshot.configured
            && state.snapshot.enabled == enabled
        {
            return Ok(state.snapshot.clone());
        }
        let configured = read_secret(&email)?.is_some();
        state.invalidate();
        state.snapshot.email = Some(email);
        state.snapshot.configured = configured;
        state.snapshot.enabled = enabled && configured;
        state.snapshot.status = if !configured {
            MailStatus::AuthRequired
        } else if enabled {
            MailStatus::Connecting
        } else {
            MailStatus::Paused
        };
        state.snapshot.error = if configured {
            None
        } else {
            Some("未找到保存的邮箱授权码，请重新连接。".into())
        };
        if enabled && configured {
            state.next_check = Some(Instant::now());
        }
        let snapshot = state.changed();
        drop(state);
        service.publish(snapshot.clone(), None);
        let _ = service.send(Work::Wake);
        Ok(snapshot)
    })
    .await
    .map_err(|_| "无法更新 QQ 邮箱连接。".to_string())?
}

#[tauri::command]
pub async fn refresh_qq_mail() -> Result<MailSnapshot, String> {
    let service = service()?;
    let Some((generation, _)) = service.begin_sync() else {
        let snapshot = service.lock()?.snapshot.clone();
        return if snapshot.syncing {
            Ok(snapshot)
        } else {
            Err("请先连接并开启 QQ 邮箱接收。".into())
        };
    };
    let (reply, receiver) = mpsc::channel();
    service
        .send(Work::Refresh { generation, reply })
        .map_err(|_| "QQ 邮箱服务不可用。".to_string())?;
    await_reply(receiver).await
}

#[tauri::command]
pub async fn read_qq_mail(message_id: String) -> Result<MailContent, String> {
    parse_message_id(&message_id)?;
    let service = service()?;
    let (generation, email) = {
        let state = service.lock()?;
        if !state.snapshot.configured || state.snapshot.status == MailStatus::AuthRequired {
            return Err("请先连接 QQ 邮箱。".into());
        }
        if !state
            .snapshot
            .items
            .iter()
            .any(|item| item.id == message_id)
        {
            return Err("邮件已不在最近列表中，请刷新收件箱。".into());
        }
        (
            state.generation,
            state.snapshot.email.clone().ok_or("请先连接 QQ 邮箱。")?,
        )
    };
    let service = service.clone();
    tauri::async_runtime::spawn_blocking(move || service.read(generation, &email, &message_id))
        .await
        .map_err(|_| "无法读取 QQ 邮件。".to_string())?
}

#[tauri::command]
pub async fn disconnect_qq_mail() -> Result<MailSnapshot, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let service = service()?;
        let mut state = service.lock()?;
        state.invalidate();
        state.snapshot.enabled = false;
        if let Some(email) = &state.snapshot.email {
            if delete_secret(email).is_err() {
                state.snapshot.status = MailStatus::Paused;
                state.snapshot.error =
                    Some("已停止接收，但删除 Windows 邮箱凭据失败，请重试断开。".into());
                let snapshot = state.changed();
                drop(state);
                service.publish(snapshot, None);
                let _ = service.send(Work::Wake);
                return Err("删除邮箱凭据失败，请重试断开。".into());
            }
        }
        let revision = state.snapshot.revision;
        state.snapshot = MailSnapshot {
            revision,
            ..MailSnapshot::default()
        };
        let snapshot = state.changed();
        drop(state);
        service.publish(snapshot.clone(), None);
        let _ = service.send(Work::Wake);
        Ok(snapshot)
    })
    .await
    .map_err(|_| "无法断开 QQ 邮箱。".to_string())?
}

async fn await_reply<T: Send + 'static>(
    receiver: mpsc::Receiver<Result<T, String>>,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        receiver
            .recv()
            .unwrap_or_else(|_| Err("QQ 邮箱服务不可用。".into()))
    })
    .await
    .map_err(|_| "QQ 邮箱连接任务未完成。".to_string())?
}
