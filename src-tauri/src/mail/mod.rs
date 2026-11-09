//! Mail over IMAP (QQ Mail first, any `imap.<domain>` server): commands,
//! snapshot types and the background service. The module keeps its mail
//! name because the command names are a contract with the frontend.

mod accounts;
mod attachments;
mod client_id;
mod content;
mod credentials;
mod service;
mod session;
mod supervisor;

#[cfg(test)]
mod tests;

use serde::Serialize;
use std::{sync::mpsc, time::Instant};
use tauri::AppHandle;

use content::parse_message_id;

use credentials::{delete_secret, normalize_email, read_secret, resolve_host};
use service::{MailService, Work};

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
    /// The message's attachments; saved one at a time with save_qq_mail_attachment.
    attachments: Vec<attachments::AttachmentInfo>,
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
    accounts::init(app);
    Ok(())
}

#[tauri::command]
pub fn get_qq_mail_state() -> Result<Vec<MailSnapshot>, String> {
    accounts::all()
        .iter()
        .map(|service| Ok(service.lock()?.snapshot.clone()))
        .collect()
}

#[tauri::command]
pub async fn connect_qq_mail(
    email: String,
    authorization_code: String,
    host: Option<String>,
) -> Result<MailSnapshot, String> {
    let email = normalize_email(&email)?;
    let host = resolve_host(&email, host.as_deref())?;
    let secret = authorization_code.trim().to_string();
    if secret.is_empty() || secret.len() > 256 || secret.chars().any(char::is_control) {
        return Err("请输入邮箱设置中生成的授权码。".into());
    }
    let service = accounts::find_or_start(&email, &host)?;
    let (generation, snapshot) = {
        let mut state = service.lock()?;
        state.invalidate();
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
        .map_err(|_| "邮箱服务不可用。".to_string())?;
    let result = await_reply(receiver).await;
    if result.is_err() {
        forget_if_never_connected(&service);
    }
    result
}

/// A mailbox whose first connection failed has no saved code; drop it so it
/// neither lingers as a tab nor counts toward the account limit.
fn forget_if_never_connected(service: &MailService) {
    let Ok(mut state) = service.lock() else { return };
    if state.snapshot.configured {
        return;
    }
    state.invalidate();
    state.snapshot = MailSnapshot {
        email: Some(service.email.clone()),
        ..MailSnapshot::default()
    };
    let snapshot = state.changed();
    drop(state);
    accounts::remove(&service.email);
    service.publish(snapshot, None);
}

#[tauri::command]
pub async fn set_qq_mail_enabled(
    email: String,
    enabled: bool,
    host: Option<String>,
) -> Result<MailSnapshot, String> {
    let email = normalize_email(&email)?;
    let host = resolve_host(&email, host.as_deref())?;
    tauri::async_runtime::spawn_blocking(move || {
        let service = accounts::find_or_start(&email, &host)?;
        let mut state = service.lock()?;
        if state.snapshot.configured && state.snapshot.enabled == enabled {
            return Ok(state.snapshot.clone());
        }
        let configured = read_secret(&email)?.is_some();
        state.invalidate();
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
    .map_err(|_| "无法更新邮箱连接。".to_string())?
}

#[tauri::command]
pub async fn refresh_qq_mail(email: String) -> Result<MailSnapshot, String> {
    let service = accounts::find(&normalize_email(&email)?)?;
    if !service.is_alive() {
        // Checked first: begin_sync would mark it syncing with no worker to finish.
        return Err("邮箱后台连接已停止，请在设置里重新授权，或暂停后再接收。".into());
    }
    let Some((generation, _)) = service.begin_sync() else {
        let snapshot = service.lock()?.snapshot.clone();
        return if snapshot.syncing {
            Ok(snapshot)
        } else {
            Err("请先连接并开启邮箱接收。".into())
        };
    };
    let (reply, receiver) = mpsc::channel();
    service
        .send(Work::Refresh { generation, reply })
        .map_err(|_| "邮箱服务不可用。".to_string())?;
    await_reply(receiver).await
}

#[tauri::command]
pub async fn read_qq_mail(email: String, message_id: String) -> Result<MailContent, String> {
    parse_message_id(&message_id)?;
    let email = normalize_email(&email)?;
    let service = accounts::find(&email)?;
    let generation = {
        let state = service.lock()?;
        if !state.snapshot.configured || state.snapshot.status == MailStatus::AuthRequired {
            return Err("请先连接邮箱。".into());
        }
        if !state
            .snapshot
            .items
            .iter()
            .any(|item| item.id == message_id)
        {
            return Err("邮件已不在最近列表中，请刷新收件箱。".into());
        }
        state.generation
    };
    tauri::async_runtime::spawn_blocking(move || service.read(generation, &email, &message_id))
        .await
        .map_err(|_| "无法读取邮件。".to_string())?
}

/// Saves one attachment of a listed message into the Downloads folder and shows it
/// in Explorer. Returns the path written (never an existing file).
#[tauri::command]
pub async fn save_qq_mail_attachment(email: String, message_id: String, part: String) -> Result<String, String> {
    parse_message_id(&message_id)?;
    if part.is_empty() || part.len() > 64 || !part.split('.').all(|segment| !segment.is_empty() && segment.bytes().all(|byte| byte.is_ascii_digit())) {
        return Err("附件标识无效，请重新打开邮件。".into());
    }
    let email = normalize_email(&email)?;
    let service = accounts::find(&email)?;
    {
        let state = service.lock()?;
        if !state.snapshot.configured || !state.snapshot.items.iter().any(|item| item.id == message_id) {
            return Err("邮件已不在最近列表中，请刷新收件箱。".into());
        }
    }
    let saved = tauri::async_runtime::spawn_blocking(move || service.save_attachment(&email, &message_id, &part))
        .await
        .map_err(|_| "无法保存附件。".to_string())??;
    let _ = tauri_plugin_opener::reveal_item_in_dir(&saved);
    Ok(saved.to_string_lossy().into_owned())
}

/// Marks a listed message read on the server; reading in the island never does.
#[tauri::command]
pub async fn mark_qq_mail_read(email: String, message_id: String) -> Result<MailSnapshot, String> {
    parse_message_id(&message_id)?;
    let email = normalize_email(&email)?;
    let service = accounts::find(&email)?;
    let generation = {
        let state = service.lock()?;
        if !state.snapshot.configured || state.snapshot.status == MailStatus::AuthRequired {
            return Err("请先连接邮箱。".into());
        }
        if !state.snapshot.items.iter().any(|item| item.id == message_id) {
            return Err("邮件已不在最近列表中，请刷新收件箱。".into());
        }
        state.generation
    };
    tauri::async_runtime::spawn_blocking(move || service.mark_read(generation, &email, &message_id))
        .await
        .map_err(|_| "无法把邮件标为已读。".to_string())?
}

#[tauri::command]
pub async fn disconnect_qq_mail(email: String) -> Result<MailSnapshot, String> {
    let email = normalize_email(&email)?;
    tauri::async_runtime::spawn_blocking(move || {
        let disconnected = |revision| MailSnapshot {
            revision,
            email: Some(email.clone()),
            ..MailSnapshot::default()
        };
        let Ok(service) = accounts::find(&email) else {
            // Nothing running for it: still make sure no code stays behind.
            delete_secret(&email)?;
            return Ok(disconnected(accounts::next_revision()));
        };
        let mut state = service.lock()?;
        state.invalidate();
        state.snapshot.enabled = false;
        if delete_secret(&email).is_err() {
            state.snapshot.status = MailStatus::Paused;
            state.snapshot.error =
                Some("已停止接收，但删除 Windows 邮箱凭据失败，请重试断开。".into());
            let snapshot = state.changed();
            drop(state);
            service.publish(snapshot, None);
            let _ = service.send(Work::Wake);
            return Err("删除邮箱凭据失败，请重试断开。".into());
        }
        state.snapshot = disconnected(0);
        let snapshot = state.changed();
        drop(state);
        accounts::remove(&email);
        service.publish(snapshot.clone(), None);
        Ok(snapshot)
    })
    .await
    .map_err(|_| "无法断开邮箱。".to_string())?
}

async fn await_reply<T: Send + 'static>(
    receiver: mpsc::Receiver<Result<T, String>>,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        receiver
            .recv()
            .unwrap_or_else(|_| Err("邮箱服务不可用。".into()))
    })
    .await
    .map_err(|_| "邮箱连接任务未完成。".to_string())?
}

/// This module's Tauri commands. `lib.rs` chains every module's list into one
/// `generate_handler!`, so adding a command only touches this file.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::mail::get_qq_mail_state,
            crate::mail::connect_qq_mail,
            crate::mail::set_qq_mail_enabled,
            crate::mail::refresh_qq_mail,
            crate::mail::read_qq_mail,
            crate::mail::mark_qq_mail_read,
            crate::mail::save_qq_mail_attachment,
            crate::mail::disconnect_qq_mail,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
