use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use imap::{types::Flag, Session};
use imap_proto::types::{
    BodyContentCommon, BodyStructure, ContentEncoding, MessageSection, SectionPath,
};
use keyring::{Entry, Error as KeyringError};
use mailparse::MailHeaderMap;
use serde::Serialize;
use std::{
    io::{Read, Write},
    net::{TcpStream, ToSocketAddrs},
    sync::{mpsc, Arc, Mutex, MutexGuard, OnceLock},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};

const HOST: &str = "imap.qq.com";
const EVENT: &str = "qq-mail-changed";
const CREDENTIAL_SERVICE: &str = "com.focusd.island.qq-mail";
const MAX_ITEMS: u32 = 20;
const SYNC_INTERVAL: Duration = Duration::from_secs(60);
const IO_TIMEOUT: Duration = Duration::from_secs(15);
const HEADER_QUERY: &str = "(UID FLAGS INTERNALDATE BODY.PEEK[HEADER]<0.65536>)";
const MAX_BODY_BYTES: u32 = 512 * 1024;
const MAX_MIME_BYTES: usize = 65_536;
const MAX_INLINE_IMAGES: usize = 8;
const MAX_INLINE_IMAGE_BYTES: u32 = 512 * 1024;
const MAX_INLINE_TOTAL_BYTES: u32 = 1_536 * 1024;
static SERVICE: OnceLock<Arc<MailService>> = OnceLock::new();

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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MailEvent {
    snapshot: MailSnapshot,
    newest_id: Option<String>,
    window_visible: bool,
}

#[derive(Clone, Copy)]
struct Cursor {
    validity: u32,
    high_water: u32,
}

struct Inbox {
    cursor: Cursor,
    unread_count: usize,
    items: Vec<MailMessage>,
}

#[derive(Debug)]
struct MailFailure {
    authentication: bool,
    message: &'static str,
}

impl MailFailure {
    fn network() -> Self {
        Self {
            authentication: false,
            message: "无法同步 QQ 邮箱，请检查网络或稍后重试。",
        }
    }

    fn authentication() -> Self {
        Self {
            authentication: true,
            message: "QQ 邮箱拒绝了连接，请确认已开启 IMAP，并重新输入邮箱授权码。",
        }
    }
}

#[derive(Default)]
struct MailState {
    snapshot: MailSnapshot,
    generation: u64,
    cursor: Option<Cursor>,
    failures: u32,
    next_check: Option<Instant>,
}

impl MailState {
    fn invalidate(&mut self) {
        self.generation += 1;
        self.cursor = None;
        self.failures = 0;
        self.next_check = None;
        self.snapshot.syncing = false;
    }

    fn changed(&mut self) -> MailSnapshot {
        self.snapshot.revision += 1;
        self.snapshot.clone()
    }

    fn accept(&mut self, generation: u64, inbox: Inbox) -> Option<(MailSnapshot, Option<String>)> {
        if generation != self.generation || !self.snapshot.enabled {
            return None;
        }
        let newest_id = self.cursor.and_then(|previous| {
            (previous.validity == inbox.cursor.validity)
                .then(|| {
                    inbox
                        .items
                        .iter()
                        .filter(|item| item.uid > previous.high_water && item.unread)
                        .max_by_key(|item| item.uid)
                        .map(|item| item.id.clone())
                })
                .flatten()
        });
        self.cursor = Some(Cursor {
            validity: inbox.cursor.validity,
            high_water: self
                .cursor
                .filter(|old| old.validity == inbox.cursor.validity)
                .map_or(inbox.cursor.high_water, |old| {
                    old.high_water.max(inbox.cursor.high_water)
                }),
        });
        self.snapshot.configured = true;
        self.snapshot.syncing = false;
        self.snapshot.status = MailStatus::Connected;
        self.snapshot.error = None;
        self.snapshot.items = inbox.items;
        self.snapshot.unread_count = Some(inbox.unread_count);
        self.snapshot.last_synced_at = Some(now_ms());
        self.failures = 0;
        self.next_check = Some(Instant::now() + SYNC_INTERVAL);
        Some((self.changed(), newest_id))
    }

    fn fail(&mut self, generation: u64, failure: &MailFailure) -> Option<MailSnapshot> {
        if generation != self.generation {
            return None;
        }
        self.snapshot.syncing = false;
        self.snapshot.status = if failure.authentication {
            MailStatus::AuthRequired
        } else {
            MailStatus::Error
        };
        self.snapshot.error = Some(failure.message.into());
        self.failures = self.failures.saturating_add(1);
        self.next_check =
            if failure.authentication || !self.snapshot.configured || !self.snapshot.enabled {
                None
            } else {
                Some(Instant::now() + retry_delay(self.failures))
            };
        Some(self.changed())
    }
}

type Reply = mpsc::Sender<Result<MailSnapshot, String>>;

enum Work {
    Connect {
        generation: u64,
        email: String,
        secret: String,
        reply: Reply,
    },
    Refresh {
        generation: u64,
        reply: Reply,
    },
    Read {
        generation: u64,
        email: String,
        message_id: String,
        reply: mpsc::Sender<Result<MailContent, String>>,
    },
    Wake,
}

struct MailService {
    app: AppHandle,
    state: Mutex<MailState>,
    sender: mpsc::Sender<Work>,
}

impl MailService {
    fn lock(&self) -> Result<MutexGuard<'_, MailState>, String> {
        self.state.lock().map_err(|_| "QQ 邮箱状态不可用。".into())
    }

    fn publish(&self, snapshot: MailSnapshot, newest_id: Option<String>) {
        let window_visible = self
            .app
            .get_webview_window("main")
            .is_some_and(|window| window.is_visible().unwrap_or(false));
        let _ = self.app.emit(
            EVENT,
            MailEvent {
                snapshot,
                newest_id,
                window_visible,
            },
        );
    }

    fn begin_sync(&self) -> Option<(u64, String)> {
        let mut state = self.lock().ok()?;
        if !state.snapshot.enabled
            || !state.snapshot.configured
            || state.snapshot.syncing
            || state.snapshot.status == MailStatus::AuthRequired
        {
            return None;
        }
        let email = state.snapshot.email.clone()?;
        state.snapshot.syncing = true;
        state.next_check = None;
        if state.snapshot.last_synced_at.is_none() {
            state.snapshot.status = MailStatus::Connecting;
        }
        let generation = state.generation;
        let snapshot = state.changed();
        drop(state);
        self.publish(snapshot, None);
        Some((generation, email))
    }

    fn sync(
        &self,
        generation: u64,
        email: &str,
        secret: Option<&str>,
    ) -> Result<MailSnapshot, String> {
        {
            let state = self.lock()?;
            if generation != state.generation || !state.snapshot.enabled {
                return Err("邮箱连接已取消。".into());
            }
        }
        let result = match secret {
            Some(secret) => fetch_remote(email, secret),
            None => match read_secret(email) {
                Ok(Some(secret)) => fetch_remote(email, &secret),
                Ok(None) => Err(MailFailure::authentication()),
                Err(_) => Err(MailFailure {
                    authentication: true,
                    message: "无法读取 Windows 邮箱凭据，请重新连接。",
                }),
            },
        };
        let mut state = self.lock()?;
        if generation != state.generation || !state.snapshot.enabled {
            return Err("邮箱连接已取消。".into());
        }
        let result = result.and_then(|inbox| {
            if let Some(secret) = secret {
                credential(email)
                    .and_then(|entry| {
                        entry
                            .set_password(secret)
                            .map_err(|_| "无法保存邮箱凭据。".into())
                    })
                    .map_err(|_| MailFailure {
                        authentication: false,
                        message: "无法保存到 Windows 凭据管理器，请重试连接。",
                    })?;
            }
            Ok(inbox)
        });
        match result {
            Ok(inbox) => {
                let (snapshot, newest_id) = state
                    .accept(generation, inbox)
                    .ok_or_else(|| "邮箱连接已取消。".to_string())?;
                drop(state);
                self.publish(snapshot.clone(), newest_id);
                Ok(snapshot)
            }
            Err(failure) => {
                let snapshot = state.fail(generation, &failure);
                drop(state);
                if let Some(snapshot) = snapshot {
                    self.publish(snapshot, None);
                }
                Err(failure.message.into())
            }
        }
    }

    fn read(&self, generation: u64, email: &str, message_id: &str) -> Result<MailContent, String> {
        let current = || -> Result<(), String> {
            let state = self.lock()?;
            if state.generation != generation
                || !state.snapshot.configured
                || state.snapshot.email.as_deref() != Some(email)
            {
                return Err("邮箱连接已改变，请重新打开邮件。".into());
            }
            Ok(())
        };
        current()?;
        let secret = read_secret(email)?.ok_or("未找到邮箱授权码，请重新连接。")?;
        let mut session =
            open_session(email, &secret).map_err(|failure| failure.message.to_string())?;
        let result = fetch_content(&mut session, message_id);
        let _ = session.logout();
        current()?;
        result
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

fn worker(service: Arc<MailService>, receiver: mpsc::Receiver<Work>) {
    loop {
        let wait = match service.lock() {
            Ok(state) => state
                .next_check
                .map(|deadline| deadline.saturating_duration_since(Instant::now()))
                .unwrap_or(Duration::from_secs(3_600)),
            Err(_) => return,
        };
        match receiver.recv_timeout(wait) {
            Ok(Work::Connect {
                generation,
                email,
                secret,
                reply,
            }) => {
                let _ = reply.send(service.sync(generation, &email, Some(&secret)));
            }
            Ok(Work::Refresh { generation, reply }) => {
                let email = service
                    .lock()
                    .ok()
                    .and_then(|state| state.snapshot.email.clone());
                let result = email
                    .ok_or_else(|| "请先连接 QQ 邮箱。".to_string())
                    .and_then(|email| service.sync(generation, &email, None));
                let _ = reply.send(result);
            }
            Ok(Work::Read {
                generation,
                email,
                message_id,
                reply,
            }) => {
                let _ = reply.send(service.read(generation, &email, &message_id));
            }
            Ok(Work::Wake) => {}
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if let Some((generation, email)) = service.begin_sync() {
                    let _ = service.sync(generation, &email, None);
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => return,
        }
    }
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
        .sender
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
        let _ = service.sender.send(Work::Wake);
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
        .sender
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
    let (reply, receiver) = mpsc::channel();
    service
        .sender
        .send(Work::Read {
            generation,
            email,
            message_id,
            reply,
        })
        .map_err(|_| "QQ 邮箱服务不可用。".to_string())?;
    await_reply(receiver).await
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

fn credential(email: &str) -> Result<Entry, String> {
    Entry::new(CREDENTIAL_SERVICE, email).map_err(|_| "无法访问 Windows 邮箱凭据。".into())
}

fn read_secret(email: &str) -> Result<Option<String>, String> {
    match credential(email)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(_) => Err("无法读取 Windows 邮箱凭据。".into()),
    }
}

fn delete_secret(email: &str) -> Result<(), String> {
    match credential(email)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(_) => Err("无法删除 Windows 邮箱凭据。".into()),
    }
}

fn normalize_email(email: &str) -> Result<String, String> {
    let email = email.trim().to_ascii_lowercase();
    let local = email.strip_suffix("@qq.com").unwrap_or("");
    if local.is_empty()
        || local.len() > 64
        || !local
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._+-".contains(&byte))
    {
        return Err("请输入有效的 @qq.com 邮箱地址。".into());
    }
    Ok(email)
}

fn retry_delay(failures: u32) -> Duration {
    Duration::from_secs(match failures {
        0 | 1 => 60,
        2 => 120,
        _ => 300,
    })
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn login_failure(error: imap::Error) -> MailFailure {
    match error {
        imap::Error::No(_) | imap::Error::Bad(_) => MailFailure::authentication(),
        _ => MailFailure::network(),
    }
}

fn fetch_remote(email: &str, secret: &str) -> Result<Inbox, MailFailure> {
    let mut session = open_session(email, secret)?;
    let result = fetch_inbox(&mut session);
    let _ = session.logout();
    result
}

fn open_session(
    email: &str,
    secret: &str,
) -> Result<Session<native_tls::TlsStream<TcpStream>>, MailFailure> {
    let mut stream = None;
    let addresses = (HOST, 993)
        .to_socket_addrs()
        .map_err(|_| MailFailure::network())?;
    for address in addresses {
        if let Ok(connected) = TcpStream::connect_timeout(&address, Duration::from_secs(10)) {
            stream = Some(connected);
            break;
        }
    }
    let stream = stream.ok_or_else(MailFailure::network)?;
    stream
        .set_read_timeout(Some(IO_TIMEOUT))
        .map_err(|_| MailFailure::network())?;
    stream
        .set_write_timeout(Some(IO_TIMEOUT))
        .map_err(|_| MailFailure::network())?;
    let tls = native_tls::TlsConnector::new().map_err(|_| MailFailure::network())?;
    let stream = tls
        .connect(HOST, stream)
        .map_err(|_| MailFailure::network())?;
    let mut client = imap::Client::new(stream);
    client.read_greeting().map_err(|_| MailFailure::network())?;
    client
        .login(email, secret)
        .map_err(|(error, _)| login_failure(error))
}

fn parse_message_id(message_id: &str) -> Result<(u32, u32), String> {
    let parsed = message_id.split_once(':').and_then(|(validity, uid)| {
        if !validity.bytes().all(|byte| byte.is_ascii_digit())
            || !uid.bytes().all(|byte| byte.is_ascii_digit())
        {
            return None;
        }
        Some((validity.parse::<u32>().ok()?, uid.parse::<u32>().ok()?))
    });
    parsed
        .filter(|(validity, uid)| *validity > 0 && *uid > 0)
        .ok_or_else(|| "邮件标识无效，请刷新收件箱。".into())
}

struct TextPart {
    path: Vec<u32>,
    mime: &'static str,
    octets: u32,
}

fn is_attachment(common: &BodyContentCommon<'_>) -> bool {
    common.disposition.as_ref().is_some_and(|disposition| {
        !disposition.ty.eq_ignore_ascii_case("inline")
            || disposition.params.as_ref().is_some_and(|params| {
                params
                    .iter()
                    .any(|(key, _)| key.eq_ignore_ascii_case("filename"))
            })
    }) || common.ty.params.as_ref().is_some_and(|params| {
        params
            .iter()
            .any(|(key, _)| key.eq_ignore_ascii_case("name"))
    })
}

fn text_part(body: &BodyStructure<'_>, path: Vec<u32>) -> Option<TextPart> {
    if path.len() > 16 {
        return None;
    }
    match body {
        BodyStructure::Text { common, other, .. } if !is_attachment(common) => {
            let mime = if common.ty.subtype.eq_ignore_ascii_case("plain") {
                "text/plain"
            } else if common.ty.subtype.eq_ignore_ascii_case("html") {
                "text/html"
            } else {
                return None;
            };
            Some(TextPart {
                path: if path.is_empty() { vec![1] } else { path },
                mime,
                octets: other.octets,
            })
        }
        BodyStructure::Multipart { common, bodies, .. } if !is_attachment(common) => {
            let mut fallback = None;
            for (index, body) in bodies.iter().take(128).enumerate() {
                let mut nested = path.clone();
                nested.push(index as u32 + 1);
                if let Some(part) = text_part(body, nested) {
                    if part.mime == "text/plain" {
                        return Some(part);
                    }
                    if fallback.is_none() {
                        fallback = Some(part);
                    }
                }
            }
            fallback
        }
        // Forwarded messages and text attachments are separate from the mail's own body.
        _ => None,
    }
}

struct InlineImage {
    path: Vec<u32>,
    content_id: String,
    mime: String,
    octets: u32,
    base64: bool,
    quoted_printable: bool,
}

// 只内联正文里真正用 cid: 引用的图片，避免为未被引用的附件白拉数据。
fn cid_references(html: &str) -> Vec<String> {
    let lower = html.to_ascii_lowercase();
    let mut ids: Vec<String> = Vec::new();
    let mut cursor = 0;
    while let Some(found) = lower[cursor..].find("cid:") {
        let start = cursor + found + 4;
        let end = lower[start..]
            .find(|character: char| {
                character.is_whitespace()
                    || matches!(character, '"' | '\'' | ')' | '(' | '<' | '>' | '?')
            })
            .map_or(lower.len(), |offset| start + offset);
        let id = html[start..end].trim().trim_matches(|character| character == '<' || character == '>');
        if !id.is_empty() && !ids.iter().any(|known| known.eq_ignore_ascii_case(id)) {
            ids.push(id.to_string());
        }
        cursor = end.max(start);
    }
    ids
}

fn collect_inline_images(
    body: &BodyStructure<'_>,
    path: Vec<u32>,
    ids: &[String],
    out: &mut Vec<InlineImage>,
) {
    if out.len() >= MAX_INLINE_IMAGES || path.len() > 16 {
        return;
    }
    match body {
        BodyStructure::Basic { common, other, .. } if common.ty.ty.eq_ignore_ascii_case("image") => {
            let Some(id) = other.id.map(|id| id.trim_matches(|character| character == '<' || character == '>')) else {
                return;
            };
            if id.is_empty() || other.octets == 0 || other.octets > MAX_INLINE_IMAGE_BYTES {
                return;
            }
            let Some(matched) = ids.iter().find(|wanted| wanted.eq_ignore_ascii_case(id)) else {
                return;
            };
            out.push(InlineImage {
                path: if path.is_empty() { vec![1] } else { path },
                content_id: matched.clone(),
                mime: format!("image/{}", common.ty.subtype.to_ascii_lowercase()),
                octets: other.octets,
                base64: matches!(other.transfer_encoding, ContentEncoding::Base64),
                quoted_printable: matches!(other.transfer_encoding, ContentEncoding::QuotedPrintable),
            });
        }
        BodyStructure::Multipart { bodies, .. } => {
            for (index, nested) in bodies.iter().take(128).enumerate() {
                let mut nested_path = path.clone();
                nested_path.push(index as u32 + 1);
                collect_inline_images(nested, nested_path, ids, out);
            }
        }
        _ => {}
    }
}

fn replace_ascii_ignore_case(haystack: &str, needle: &str, replacement: &str) -> String {
    let lower_haystack = haystack.to_ascii_lowercase();
    let lower_needle = needle.to_ascii_lowercase();
    let mut out = String::with_capacity(haystack.len());
    let mut cursor = 0;
    while let Some(found) = lower_haystack[cursor..].find(&lower_needle) {
        let start = cursor + found;
        out.push_str(&haystack[cursor..start]);
        out.push_str(replacement);
        cursor = start + needle.len();
    }
    out.push_str(&haystack[cursor..]);
    out
}

fn inline_cid_images<T: Read + Write>(
    session: &mut Session<T>,
    uid: u32,
    structure: &BodyStructure<'_>,
    html: String,
) -> Result<String, String> {
    let ids = cid_references(&html);
    if ids.is_empty() {
        return Ok(html);
    }
    let mut images = Vec::new();
    collect_inline_images(structure, Vec::new(), &ids, &mut images);
    if images.is_empty() {
        return Ok(html);
    }
    let query = format!(
        "(UID {})",
        images
            .iter()
            .map(|image| {
                let section = image.path.iter().map(u32::to_string).collect::<Vec<_>>().join(".");
                format!("BODY.PEEK[{section}]<0.{}>", image.octets as u64 + 1)
            })
            .collect::<Vec<_>>()
            .join(" ")
    );
    let messages = session
        .uid_fetch(uid.to_string(), &query)
        .map_err(|_| "无法加载邮件图片，请检查网络并重试。")?;
    let Some(message) = messages.iter().find(|item| item.uid == Some(uid)) else {
        return Ok(html);
    };
    let mut replacements: Vec<(String, String)> = Vec::new();
    let mut budget = MAX_INLINE_TOTAL_BYTES;
    for image in &images {
        if image.quoted_printable {
            continue;
        }
        let Some(bytes) = message.section(&SectionPath::Part(image.path.clone(), None)) else {
            continue;
        };
        if bytes.len() < image.octets as usize {
            continue;
        }
        let payload = if image.base64 {
            let encoded = bytes
                .iter()
                .copied()
                .filter(|byte| !byte.is_ascii_whitespace())
                .collect::<Vec<u8>>();
            String::from_utf8(encoded).ok()
        } else {
            Some(BASE64.encode(bytes))
        };
        let Some(payload) = payload else {
            continue;
        };
        if payload.len() as u32 > budget {
            continue;
        }
        budget -= payload.len() as u32;
        replacements.push((
            image.content_id.clone(),
            format!("data:{};base64,{payload}", image.mime),
        ));
    }
    let mut html = html;
    for (content_id, data_uri) in replacements {
        html = replace_ascii_ignore_case(&html, &format!("cid:{content_id}"), &data_uri);
    }
    Ok(html)
}

fn fetch_content<T: Read + Write>(
    session: &mut Session<T>,
    message_id: &str,
) -> Result<MailContent, String> {
    let (validity, uid) = parse_message_id(message_id)?;
    let mailbox = session
        .examine("INBOX")
        .map_err(|_| "无法打开收件箱，请稍后重试。")?;
    if mailbox.uid_validity != Some(validity) {
        return Err("收件箱已更新，请刷新列表后重新打开邮件。".into());
    }
    let structures = session
        .uid_fetch(uid.to_string(), "(UID BODYSTRUCTURE)")
        .map_err(|_| "无法读取邮件结构，请稍后重试。")?;
    let structure = structures
        .iter()
        .filter(|item| item.uid == Some(uid))
        .find_map(|item| item.bodystructure())
        .ok_or("邮件已移除或暂不可用，请刷新收件箱。")?;
    let part =
        text_part(structure, Vec::new()).ok_or("这封邮件没有可读取的文字正文，请在网页中查看。")?;
    if part.octets > MAX_BODY_BYTES {
        return Err("邮件正文超过 512 KB，请在网页中查看。".into());
    }
    let section = part
        .path
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(".");
    let mime_path = SectionPath::Part(part.path.clone(), Some(MessageSection::Mime));
    let body_path = SectionPath::Part(part.path, None);
    let query = format!(
        "(UID BODY.PEEK[{section}.MIME]<0.{}> BODY.PEEK[{section}]<0.{}>)",
        MAX_MIME_BYTES + 1,
        MAX_BODY_BYTES + 1
    );
    let messages = session
        .uid_fetch(uid.to_string(), query)
        .map_err(|_| "无法加载邮件正文，请检查网络并重试。")?;
    let message = messages
        .iter()
        .find(|item| {
            item.uid == Some(uid)
                && item.section(&mime_path).is_some()
                && item.section(&body_path).is_some()
        })
        .ok_or("邮件已移除，请刷新收件箱。")?;
    let header = message
        .section(&mime_path)
        .ok_or("无法解析邮件格式，请在网页中查看。")?;
    let body = message
        .section(&body_path)
        .ok_or("无法读取邮件正文，请重试。")?;
    if header.len() > MAX_MIME_BYTES || body.len() > MAX_BODY_BYTES as usize {
        return Err("邮件正文过大，请在网页中查看。".into());
    }
    if body.len() < part.octets as usize {
        return Err("邮件正文未完整加载，请重试。".into());
    }
    let mut raw = header.to_vec();
    if !raw.ends_with(b"\r\n\r\n") && !raw.ends_with(b"\n\n") {
        raw.extend_from_slice(b"\r\n\r\n");
    }
    raw.extend_from_slice(body);
    let parsed = mailparse::parse_mail(&raw).map_err(|_| "无法解析邮件正文，请在网页中查看。")?;
    if !parsed.ctype.mimetype.eq_ignore_ascii_case(part.mime)
        || parsed.get_content_disposition().disposition == mailparse::DispositionType::Attachment
    {
        return Err("邮件正文格式不匹配，请在网页中查看。".into());
    }
    let content = parsed
        .get_body()
        .map_err(|_| "无法解码邮件正文，请在网页中查看。")?;
    let content = if part.mime == "text/html" {
        inline_cid_images(session, uid, structure, content)?
    } else {
        content
    };
    Ok(MailContent {
        id: message_id.into(),
        content,
        content_type: part.mime.into(),
    })
}

fn fetch_inbox<T: Read + Write>(session: &mut Session<T>) -> Result<Inbox, MailFailure> {
    let mailbox = session
        .examine("INBOX")
        .map_err(|_| MailFailure::network())?;
    let validity = mailbox
        .uid_validity
        .filter(|value| *value > 0)
        .ok_or_else(MailFailure::network)?;
    let unseen = session
        .uid_search("UNSEEN")
        .map_err(|_| MailFailure::network())?;
    let mut items = Vec::new();
    if mailbox.exists > 0 {
        let first = mailbox.exists.saturating_sub(MAX_ITEMS - 1).max(1);
        let messages = session
            .fetch(format!("{first}:{}", mailbox.exists), HEADER_QUERY)
            .map_err(|_| MailFailure::network())?;
        for message in messages
            .iter()
            .filter(|message| (first..=mailbox.exists).contains(&message.message))
        {
            let Some(uid) = message.uid else {
                return Err(MailFailure::network());
            };
            // Unsolicited flag-only FETCH responses must not become blank list entries.
            let Some(header) = message.header() else {
                continue;
            };
            let (sender, subject) = parse_header(header);
            items.push(MailMessage {
                id: format!("{validity}:{uid}"),
                uid,
                sender,
                subject,
                received_at: message.internal_date().map(|date| date.timestamp_millis()),
                unread: !message.flags().contains(&Flag::Seen),
            });
        }
    }
    items.sort_by_key(|item| std::cmp::Reverse(item.uid));
    items.dedup_by_key(|item| item.uid);
    items.truncate(MAX_ITEMS as usize);
    let high_water = mailbox
        .uid_next
        .unwrap_or(1)
        .saturating_sub(1)
        .max(items.iter().map(|item| item.uid).max().unwrap_or(0));
    Ok(Inbox {
        cursor: Cursor {
            validity,
            high_water,
        },
        unread_count: unseen.len(),
        items,
    })
}

fn parse_header(raw: &[u8]) -> (String, String) {
    let headers = mailparse::parse_headers(raw)
        .map(|(headers, _)| headers)
        .unwrap_or_default();
    let sender = headers.get_first_value("From").unwrap_or_default();
    let subject = headers.get_first_value("Subject").unwrap_or_default();
    (
        display_header(&sender, "未知发件人"),
        display_header(&subject, "（无主题）"),
    )
}

fn display_header(value: &str, fallback: &str) -> String {
    let value = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if value.is_empty() {
        fallback.into()
    } else {
        value.chars().take(1_000).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor as IoCursor;

    fn inbox(validity: u32, uids: &[u32]) -> Inbox {
        Inbox {
            cursor: Cursor {
                validity,
                high_water: uids.iter().copied().max().unwrap_or(0),
            },
            unread_count: uids.len(),
            items: uids
                .iter()
                .map(|uid| MailMessage {
                    id: format!("{validity}:{uid}"),
                    uid: *uid,
                    sender: "sender@example.com".into(),
                    subject: "主题".into(),
                    received_at: None,
                    unread: true,
                })
                .collect(),
        }
    }

    fn active_state() -> MailState {
        MailState {
            snapshot: MailSnapshot {
                enabled: true,
                configured: true,
                ..MailSnapshot::default()
            },
            ..MailState::default()
        }
    }

    #[test]
    fn validates_qq_addresses_and_rejects_other_hosts_or_commands() {
        assert_eq!(normalize_email(" User@QQ.COM ").unwrap(), "user@qq.com");
        for email in [
            "",
            "@qq.com",
            "a@gmail.com",
            "a@qq.com.evil",
            "a\r\nLOGIN@qq.com",
        ] {
            assert!(normalize_email(email).is_err());
        }
    }

    #[test]
    fn decodes_chinese_mime_headers_and_handles_empty_subjects() {
        let (sender, subject) = parse_header(b"From: =?UTF-8?B?5byg5LiJ?= <sender@example.com>\r\nSubject: =?UTF-8?B?5Lya6K6u?=\r\n\r\n");
        assert!(sender.contains("张三"));
        assert_eq!(subject, "会议");
        assert_eq!(
            parse_header(b"Subject: =?GB2312?B?1tDOxA==?=\r\n\r\n").1,
            "中文"
        );
        assert_eq!(parse_header(b"\r\n").1, "（无主题）");
        assert_eq!(display_header("line\r\n two", ""), "line two");
    }

    #[test]
    fn inlines_only_images_referenced_by_cid() {
        let html = r#"<img src="cid:img001@qq"><img src='cid:IMG002@QQ'>正文提到 cid: 但没有编号。"#;
        assert_eq!(cid_references(html), vec!["img001@qq", "IMG002@QQ"]);
        assert!(cid_references("<p>no images here</p>").is_empty());
        assert_eq!(
            replace_ascii_ignore_case("a CID:x b cid:X c", "cid:x", "data:image/png;base64,AA"),
            "a data:image/png;base64,AA b data:image/png;base64,AA c"
        );
        assert_eq!(replace_ascii_ignore_case("中文 cid:x", "cid:x", "图"), "中文 图");
    }

    #[test]
    fn first_sync_and_uid_validity_reset_do_not_replay_history() {
        let mut state = active_state();
        assert!(state.accept(0, inbox(1, &[1, 2])).unwrap().1.is_none());
        assert!(state.accept(0, inbox(1, &[1, 2])).unwrap().1.is_none());
        assert_eq!(
            state.accept(0, inbox(1, &[1, 2, 3])).unwrap().1.as_deref(),
            Some("1:3")
        );
        assert!(state.accept(0, inbox(2, &[10, 11])).unwrap().1.is_none());
        state.invalidate();
        assert!(state
            .accept(1, inbox(2, &[10, 11, 12]))
            .unwrap()
            .1
            .is_none());
    }

    #[test]
    fn old_or_read_messages_are_not_new_arrivals() {
        let mut state = active_state();
        state.accept(0, inbox(1, &[40]));
        assert!(state.accept(0, inbox(1, &[39])).unwrap().1.is_none());
        let mut read = inbox(1, &[41]);
        read.items[0].unread = false;
        assert!(state.accept(0, read).unwrap().1.is_none());
        assert!(state.accept(0, inbox(1, &[41])).unwrap().1.is_none());
    }

    #[test]
    fn disconnect_invalidates_inflight_success_and_failure() {
        let mut state = active_state();
        state.invalidate();
        state.snapshot = MailSnapshot::default();
        assert!(state.accept(0, inbox(1, &[1])).is_none());
        assert!(state.fail(0, &MailFailure::network()).is_none());
        assert_eq!(state.snapshot.status, MailStatus::Disconnected);
        assert!(state.snapshot.items.is_empty());
    }

    #[test]
    fn network_errors_keep_data_and_authentication_errors_stop_retries() {
        let mut state = active_state();
        state.accept(0, inbox(1, &[1]));
        state.fail(0, &MailFailure::network());
        assert_eq!(state.snapshot.unread_count, Some(1));
        assert_eq!(state.snapshot.items.len(), 1);
        assert!(state.next_check.is_some());
        state.fail(0, &MailFailure::authentication());
        assert_eq!(state.snapshot.status, MailStatus::AuthRequired);
        assert!(state.next_check.is_none());
        assert_eq!(retry_delay(1).as_secs(), 60);
        assert_eq!(retry_delay(2).as_secs(), 120);
        assert_eq!(retry_delay(10).as_secs(), 300);
    }

    #[derive(Debug)]
    struct ScriptedStream {
        input: IoCursor<Vec<u8>>,
        output: Arc<Mutex<Vec<u8>>>,
    }
    impl Read for ScriptedStream {
        fn read(&mut self, bytes: &mut [u8]) -> std::io::Result<usize> {
            self.input.read(bytes)
        }
    }
    impl Write for ScriptedStream {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.output.lock().unwrap().extend_from_slice(bytes);
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    fn client(script: String) -> (imap::Client<ScriptedStream>, Arc<Mutex<Vec<u8>>>) {
        let output = Arc::new(Mutex::new(Vec::new()));
        let mut client = imap::Client::new(ScriptedStream {
            input: IoCursor::new(script.into_bytes()),
            output: output.clone(),
        });
        client.read_greeting().unwrap();
        (client, output)
    }

    #[test]
    fn server_authentication_rejection_is_actionable_and_redacted() {
        let (client, _) = client("* OK ready\r\na1 NO invalid password\r\n".into());
        let (error, _) = client.login("user@qq.com", "test-secret").err().unwrap();
        let failure = login_failure(error);
        assert!(failure.authentication);
        assert!(!failure.message.contains("test-secret"));
    }

    #[test]
    fn reads_only_headers_and_counts_all_unread_not_just_recent_twenty() {
        let mut script = "* OK ready\r\na1 OK login\r\n* 25 EXISTS\r\n* 0 RECENT\r\n* OK [UIDVALIDITY 7] valid\r\n* OK [UIDNEXT 26] next\r\na2 OK [READ-ONLY] examined\r\n* SEARCH".to_string();
        for uid in 1..=25 {
            script.push_str(&format!(" {uid}"));
        }
        script.push_str("\r\na3 OK search\r\n");
        let header = "From: sender@example.com\r\nSubject: Update\r\n\r\n";
        for uid in 6..=25 {
            script.push_str(&format!("* {uid} FETCH (UID {uid} FLAGS () INTERNALDATE \"19-Oct-2026 08:00:00 +0800\" BODY[HEADER]<0> {{{}}}\r\n{header})\r\n", header.len()));
        }
        script.push_str("a4 OK fetch\r\n");
        let (client, output) = client(script);
        let mut session = client.login("user@qq.com", "test-secret").unwrap();
        let inbox = fetch_inbox(&mut session).unwrap();
        assert_eq!(inbox.unread_count, 25);
        assert_eq!(inbox.items.len(), 20);
        assert_eq!(inbox.items[0].id, "7:25");
        let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
        assert!(commands.contains("EXAMINE \"INBOX\""));
        assert!(commands.contains("UID SEARCH UNSEEN"));
        assert!(commands.contains(HEADER_QUERY));
        for forbidden in [" SELECT ", " STORE ", " EXPUNGE", "BODY[]", "BODY[TEXT]"] {
            assert!(!commands.contains(forbidden));
        }
    }

    #[test]
    fn empty_mailbox_is_a_successful_zero_unread_snapshot() {
        let (client, _) = client("* OK ready\r\na1 OK login\r\n* 0 EXISTS\r\n* 0 RECENT\r\n* OK [UIDVALIDITY 1] valid\r\n* OK [UIDNEXT 1] next\r\na2 OK [READ-ONLY] examined\r\n* SEARCH\r\na3 OK search\r\n".into());
        let mut session = client.login("user@qq.com", "test-secret").unwrap();
        let inbox = fetch_inbox(&mut session).unwrap();
        assert_eq!(inbox.unread_count, 0);
        assert!(inbox.items.is_empty());
    }

    fn body_client(
        structure: &str,
        path: &str,
        mime: &str,
        body: &str,
    ) -> (Session<ScriptedStream>, Arc<Mutex<Vec<u8>>>) {
        let script = format!("* OK ready\r\na1 OK login\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\na2 OK [READ-ONLY] examined\r\n* 1 FETCH (UID 9 FLAGS ())\r\n* 1 FETCH (UID 9 BODYSTRUCTURE {structure})\r\na3 OK structure\r\n* 1 FETCH (UID 9 FLAGS ())\r\n* 1 FETCH (UID 9 BODY[{path}.MIME]<0> {{{}}}\r\n{mime} BODY[{path}]<0> {{{}}}\r\n{body})\r\na4 OK body\r\n", mime.len(), body.len());
        let (client, output) = client(script);
        (client.login("user@qq.com", "test-secret").unwrap(), output)
    }

    #[test]
    fn mail_ids_cannot_change_the_imap_query() {
        assert_eq!(parse_message_id("7:9").unwrap(), (7, 9));
        for id in [
            "",
            "0:9",
            "7:0",
            "7:*",
            "7:1,2",
            "7:1\r\nSTORE",
            "7:1:2",
            "+7:9",
            "7:4294967296",
        ] {
            assert!(parse_message_id(id).is_err(), "{id:?}");
        }
    }

    #[test]
    fn reads_only_the_plain_body_and_never_marks_mail_read() {
        let body = "5Lit5paH";
        let structure = format!(
            "(\"TEXT\" \"PLAIN\" (\"CHARSET\" \"UTF-8\") NIL NIL \"BASE64\" {} 1)",
            body.len()
        );
        let (mut session, output) = body_client(
            &structure,
            "1",
            "Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n",
            body,
        );
        let content = fetch_content(&mut session, "7:9").unwrap();
        assert_eq!(content.id, "7:9");
        assert_eq!(content.content, "中文");
        assert_eq!(content.content_type, "text/plain");
        let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
        assert!(commands.contains("UID FETCH 9 (UID BODYSTRUCTURE)"));
        assert!(commands.contains("BODY.PEEK[1.MIME]<0.65537> BODY.PEEK[1]<0.524289>"));
        for forbidden in [" SELECT ", " STORE ", " EXPUNGE", "BODY[]", "RFC822 "] {
            assert!(!commands.contains(forbidden), "{commands}");
        }
    }

    #[test]
    fn multipart_prefers_plain_text_and_skips_attachments_and_html_alternative() {
        let body = "meeting at 3";
        let structure = format!("(((\"TEXT\" \"HTML\" (\"CHARSET\" \"UTF-8\") NIL NIL \"8BIT\" 20 1)(\"TEXT\" \"PLAIN\" (\"CHARSET\" \"UTF-8\") NIL NIL \"8BIT\" {} 1) \"ALTERNATIVE\")(\"APPLICATION\" \"PDF\" (\"NAME\" \"large.pdf\") NIL NIL \"BASE64\" 9999999) \"MIXED\")", body.len());
        let (mut session, output) = body_client(
            &structure,
            "1.2",
            "Content-Type: text/plain; charset=utf-8\r\n\r\n",
            body,
        );
        assert_eq!(fetch_content(&mut session, "7:9").unwrap().content, body);
        let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
        assert!(commands.contains("BODY.PEEK[1.2]"));
        assert!(!commands.contains("BODY.PEEK[2]"));
        assert!(!commands.contains("BODY.PEEK[1.1]"));
    }

    #[test]
    fn html_only_mail_decodes_quoted_printable_chinese() {
        let body = "<p>=D6=D0=CE=C4</p>";
        let structure = format!(
            "(\"TEXT\" \"HTML\" (\"CHARSET\" \"GB2312\") NIL NIL \"QUOTED-PRINTABLE\" {} 1)",
            body.len()
        );
        let (mut session, _) = body_client(&structure, "1", "Content-Type: text/html; charset=GB2312\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n", body);
        let content = fetch_content(&mut session, "7:9").unwrap();
        assert_eq!(content.content, "<p>中文</p>");
        assert_eq!(content.content_type, "text/html");
    }

    #[test]
    fn a_changed_uid_validity_never_reads_a_different_message() {
        let (client, output) = client("* OK ready\r\na1 OK login\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 8] changed\r\na2 OK examined\r\n".into());
        let mut session = client.login("user@qq.com", "test-secret").unwrap();
        assert!(fetch_content(&mut session, "7:9")
            .unwrap_err()
            .contains("刷新"));
        assert!(!String::from_utf8(output.lock().unwrap().clone())
            .unwrap()
            .contains("UID FETCH"));
    }

    #[test]
    fn oversized_bodies_and_text_attachments_are_not_downloaded() {
        for structure in [
            format!("(\"TEXT\" \"PLAIN\" NIL NIL NIL \"8BIT\" {} 1)", MAX_BODY_BYTES + 1),
            "(\"TEXT\" \"PLAIN\" (\"NAME\" \"secret.txt\") NIL NIL \"8BIT\" 8 1 NIL (\"ATTACHMENT\" (\"FILENAME\" \"secret.txt\")) NIL NIL)".into(),
        ] {
            let (mut session, output) = body_client(&structure, "1", "", "");
            assert!(fetch_content(&mut session, "7:9").is_err());
            assert!(!String::from_utf8(output.lock().unwrap().clone()).unwrap().contains("BODY.PEEK"));
        }
    }

    #[test]
    fn incomplete_or_mismatched_mime_bodies_are_rejected() {
        for (size, mime) in [
            (50, "Content-Type: text/plain\r\n\r\n"),
            (5, "Content-Type: text/html\r\n\r\n"),
        ] {
            let structure = format!("(\"TEXT\" \"PLAIN\" NIL NIL NIL \"8BIT\" {size} 1)");
            let (mut session, _) = body_client(&structure, "1", mime, "hello");
            assert!(fetch_content(&mut session, "7:9").is_err());
        }
    }
}
