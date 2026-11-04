use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use imap::{
    extensions::idle::{SetReadTimeout, WaitOutcome},
    types::{Fetch, Flag, UnsolicitedResponse},
    Session,
};
use imap_proto::types::{
    BodyContentCommon, BodyStructure, ContentEncoding, MessageSection, SectionPath, StatusAttribute,
};
use keyring::{Entry, Error as KeyringError};
use mailparse::MailHeaderMap;
use serde::Serialize;
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    net::{Shutdown, TcpStream, ToSocketAddrs},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Arc, Mutex, MutexGuard, OnceLock,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};

const EVENT: &str = "qq-mail-changed";
const CREDENTIAL_SERVICE: &str = "com.focusd.island.qq-mail";
const MAX_ITEMS: u32 = 20;
const SYNC_INTERVAL: Duration = Duration::from_secs(5);
const PUSH_REFRESH_INTERVAL: Duration = Duration::from_secs(60);
const IO_TIMEOUT: Duration = Duration::from_secs(15);
const HEADER_QUERY: &str = "(UID FLAGS INTERNALDATE BODY.PEEK[HEADER]<0.65536>)";
const FLAGS_QUERY: &str = "(UID FLAGS INTERNALDATE)";
const MAX_BODY_BYTES: u32 = 512 * 1024;
const MAX_MIME_BYTES: usize = 65_536;
const MAX_INLINE_IMAGES: usize = 8;
const MAX_INLINE_IMAGE_BYTES: u32 = 512 * 1024;
const MAX_INLINE_TOTAL_BYTES: u32 = 1_536 * 1024;
static APP: OnceLock<AppHandle> = OnceLock::new();
// One service and worker thread per mailbox, keyed by the normalized address.
static SERVICES: Mutex<BTreeMap<String, Arc<MailService>>> = Mutex::new(BTreeMap::new());
// Shared by all mailboxes so a re-added account never reuses revisions the frontend already saw.
static REVISION: AtomicU64 = AtomicU64::new(0);

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
    host: Option<String>,
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
            host: None,
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

#[derive(Clone)]
struct Inbox {
    cursor: Cursor,
    unread_count: usize,
    items: Vec<MailMessage>,
    needs_refresh: bool,
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
            message: "无法同步邮箱，请检查网络、IMAP 服务器地址或稍后重试。",
        }
    }

    fn authentication() -> Self {
        Self {
            authentication: true,
            message: "邮箱拒绝了连接，请确认已开启 IMAP，并重新输入授权码或密码。",
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
        self.snapshot.revision = REVISION.fetch_add(1, Ordering::Relaxed) + 1;
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
    Wake,
    Stop,
}

#[derive(Debug)]
struct BoundedStream<T>(T);

impl<T: Read> Read for BoundedStream<T> {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        self.0.read(buffer)
    }
}

impl<T: Write> Write for BoundedStream<T> {
    fn write(&mut self, buffer: &[u8]) -> std::io::Result<usize> {
        self.0.write(buffer)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.0.flush()
    }
}

impl<T: SetReadTimeout> SetReadTimeout for BoundedStream<T> {
    fn set_read_timeout(&mut self, timeout: Option<Duration>) -> imap::Result<()> {
        // imap 2.4 clears the timeout before IDLE's DONE response is read.
        // Keep that response bounded too, including after a dropped connection.
        self.0.set_read_timeout(Some(timeout.unwrap_or(IO_TIMEOUT)))
    }
}

/// Shares the TLS stream so the ID exchange can run beside the imap session (see `send_client_id`).
#[derive(Debug)]
struct SharedStream<T>(Arc<Mutex<T>>);

impl<T> SharedStream<T> {
    fn lock(&self) -> std::io::Result<MutexGuard<'_, T>> {
        self.0
            .lock()
            .map_err(|_| std::io::Error::other("mail stream lock poisoned"))
    }
}

impl<T: Read> Read for SharedStream<T> {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        self.lock()?.read(buffer)
    }
}

impl<T: Write> Write for SharedStream<T> {
    fn write(&mut self, buffer: &[u8]) -> std::io::Result<usize> {
        self.lock()?.write(buffer)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.lock()?.flush()
    }
}

impl<T: SetReadTimeout> SetReadTimeout for SharedStream<T> {
    fn set_read_timeout(&mut self, timeout: Option<Duration>) -> imap::Result<()> {
        self.0
            .lock()
            .map_err(|_| imap::Error::ConnectionLost)?
            .set_read_timeout(timeout)
    }
}

type MailSession = Session<BoundedStream<SharedStream<native_tls::TlsStream<TcpStream>>>>;

enum MailWake {
    Work(Work),
    Changed,
    TimedOut,
    Failed(imap::Error),
    Closed,
}

fn queued_work(receiver: &mpsc::Receiver<Work>) -> Option<MailWake> {
    match receiver.try_recv() {
        Ok(work) => Some(MailWake::Work(work)),
        Err(mpsc::TryRecvError::Disconnected) => Some(MailWake::Closed),
        Err(mpsc::TryRecvError::Empty) => None,
    }
}

fn interrupt_idle(socket: &Mutex<Option<TcpStream>>) {
    if let Ok(socket) = socket.lock() {
        if let Some(socket) = socket.as_ref() {
            let _ = socket.shutdown(Shutdown::Both);
        }
    }
}

fn wait_for_mail<T: Read + Write + SetReadTimeout>(
    session: &mut Session<T>,
    socket: &TcpStream,
    interrupt: &Mutex<Option<TcpStream>>,
    receiver: &mpsc::Receiver<Work>,
    timeout: Duration,
) -> MailWake {
    let cloned = match socket.try_clone() {
        Ok(socket) => socket,
        Err(error) => return MailWake::Failed(imap::Error::Io(error)),
    };
    let Ok(mut registered) = interrupt.lock() else {
        return MailWake::Closed;
    };
    *registered = Some(cloned);
    drop(registered);
    // Register before checking the queue: a command arriving at either side of
    // this check must interrupt IDLE rather than wait for its keepalive deadline.
    let result = if let Some(work) = queued_work(receiver) {
        work
    } else {
        match session
            .idle()
            .and_then(|idle| idle.wait_with_timeout(timeout))
        {
            Ok(WaitOutcome::MailboxChanged) => MailWake::Changed,
            Ok(WaitOutcome::TimedOut) => MailWake::TimedOut,
            Err(error) => MailWake::Failed(error),
        }
    };
    if let Ok(mut registered) = interrupt.lock() {
        *registered = None;
    }
    // A deliberate socket interruption is a queued user action, not a network
    // error. Process it before considering any server response.
    match result {
        MailWake::Work(_) | MailWake::Closed => result,
        _ => queued_work(receiver).unwrap_or(result),
    }
}

#[derive(Default)]
struct SyncConnection {
    generation: u64,
    session: Option<MailSession>,
    socket: Option<TcpStream>,
    cached: Option<Inbox>,
    idle_supported: bool,
    idle_rejected: bool,
}

impl SyncConnection {
    fn reset(&mut self, generation: u64) {
        if self.generation != generation {
            *self = Self::default();
            self.generation = generation;
        }
    }

    fn fetch(&mut self, host: &str, email: &str, secret: Option<&str>) -> Result<Inbox, MailFailure> {
        // Only a failed connection needs another TLS handshake, login and credential lookup.
        if let Some(session) = &mut self.session {
            if let Ok(inbox) = fetch_inbox_cached(session, self.cached.as_ref()) {
                self.cached = Some(inbox.clone());
                return Ok(inbox);
            }
            self.session = None;
            self.socket = None;
        }
        let stored_secret;
        let secret = match secret {
            Some(secret) => secret,
            None => {
                stored_secret = read_secret(email).map_err(|_| MailFailure {
                    authentication: true,
                    message: "无法读取 Windows 邮箱凭据，请重新连接。",
                })?;
                stored_secret
                    .as_deref()
                    .ok_or_else(MailFailure::authentication)?
            }
        };
        let (mut session, socket) = open_connection(host, email, secret)?;
        self.idle_supported = session
            .capabilities()
            .map_err(|_| MailFailure::network())?
            .has_str("IDLE")
            && !self.idle_rejected;
        let inbox = fetch_inbox_cached(&mut session, self.cached.as_ref())?;
        self.cached = Some(inbox.clone());
        self.session = Some(session);
        self.socket = Some(socket);
        Ok(inbox)
    }
}

struct MailService {
    app: AppHandle,
    state: Mutex<MailState>,
    sender: mpsc::Sender<Work>,
    idle_socket: Mutex<Option<TcpStream>>,
}

impl MailService {
    fn send(&self, work: Work) -> Result<(), String> {
        self.sender
            .send(work)
            .map_err(|_| "邮箱服务不可用。".to_string())?;
        interrupt_idle(&self.idle_socket);
        Ok(())
    }

    fn lock(&self) -> Result<MutexGuard<'_, MailState>, String> {
        self.state.lock().map_err(|_| "邮箱状态不可用。".into())
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
        connection: &mut SyncConnection,
    ) -> Result<MailSnapshot, String> {
        let host = {
            let state = self.lock()?;
            if generation != state.generation || !state.snapshot.enabled {
                return Err("邮箱连接已取消。".into());
            }
            state.snapshot.host.clone().ok_or("请先连接邮箱。")?
        };
        connection.reset(generation);
        let result = connection.fetch(&host, email, secret);
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
                let needs_refresh = inbox.needs_refresh;
                let (snapshot, newest_id) = state
                    .accept(generation, inbox)
                    .ok_or_else(|| "邮箱连接已取消。".to_string())?;
                if needs_refresh {
                    state.next_check = Some(Instant::now());
                } else if connection.idle_supported {
                    state.next_check = Some(Instant::now() + PUSH_REFRESH_INTERVAL);
                }
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
        let current = || -> Result<String, String> {
            let state = self.lock()?;
            if state.generation != generation
                || !state.snapshot.configured
                || state.snapshot.email.as_deref() != Some(email)
            {
                return Err("邮箱连接已改变，请重新打开邮件。".into());
            }
            state.snapshot.host.clone().ok_or_else(|| "请先连接邮箱。".into())
        };
        let host = current()?;
        let secret = read_secret(email)?.ok_or("未找到邮箱授权码，请重新连接。")?;
        let mut session = open_session(&host, email, &secret)
            .map_err(|failure| failure.message.to_string())?;
        let result = fetch_content(&mut session, message_id);
        let _ = session.logout();
        current()?;
        result
    }
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    let _ = APP.set(app.clone());
    Ok(())
}

fn services() -> Result<MutexGuard<'static, BTreeMap<String, Arc<MailService>>>, String> {
    SERVICES.lock().map_err(|_| "邮箱服务不可用。".into())
}

fn service(email: &str) -> Result<Arc<MailService>, String> {
    services()?
        .get(email)
        .cloned()
        .ok_or_else(|| "请先连接该邮箱。".into())
}

fn service_or_start(email: &str) -> Result<Arc<MailService>, String> {
    let mut services = services()?;
    if let Some(service) = services.get(email) {
        return Ok(service.clone());
    }
    let app = APP.get().ok_or("邮箱服务尚未就绪。")?.clone();
    let (sender, receiver) = mpsc::channel();
    let service = Arc::new(MailService {
        app,
        state: Mutex::new(MailState::default()),
        sender,
        idle_socket: Mutex::new(None),
    });
    let worker_service = service.clone();
    thread::Builder::new()
        .name(format!("mail-{email}"))
        .spawn(move || worker(worker_service, receiver))
        .map_err(|_| "无法启动邮箱服务。".to_string())?;
    services.insert(email.to_string(), service.clone());
    Ok(service)
}

fn worker(service: Arc<MailService>, receiver: mpsc::Receiver<Work>) {
    let mut connection = SyncConnection::default();
    loop {
        let (wait, can_idle) = match service.lock() {
            Ok(state) => {
                connection.reset(state.generation);
                (
                    state
                        .next_check
                        .map(|deadline| deadline.saturating_duration_since(Instant::now()))
                        .unwrap_or(Duration::from_secs(3_600)),
                    state.snapshot.enabled
                        && !state.snapshot.syncing
                        && state.snapshot.status == MailStatus::Connected,
                )
            }
            Err(_) => return,
        };
        let wake = if can_idle && connection.idle_supported && !wait.is_zero() {
            match (&mut connection.session, &connection.socket) {
                (Some(session), Some(socket)) => {
                    wait_for_mail(session, socket, &service.idle_socket, &receiver, wait)
                }
                _ => MailWake::TimedOut,
            }
        } else {
            match receiver.recv_timeout(wait) {
                Ok(work) => MailWake::Work(work),
                Err(mpsc::RecvTimeoutError::Timeout) => MailWake::TimedOut,
                Err(mpsc::RecvTimeoutError::Disconnected) => MailWake::Closed,
            }
        };
        match wake {
            MailWake::Work(Work::Connect {
                generation,
                email,
                secret,
                reply,
            }) => {
                let _ =
                    reply.send(service.sync(generation, &email, Some(&secret), &mut connection));
            }
            MailWake::Work(Work::Refresh { generation, reply }) => {
                let email = service
                    .lock()
                    .ok()
                    .and_then(|state| state.snapshot.email.clone());
                let result = email
                    .ok_or_else(|| "请先连接邮箱。".to_string())
                    .and_then(|email| service.sync(generation, &email, None, &mut connection));
                let _ = reply.send(result);
            }
            MailWake::Work(Work::Wake) => {}
            MailWake::Work(Work::Stop) | MailWake::Closed => return,
            change => {
                if let MailWake::Failed(error) = change {
                    if matches!(error, imap::Error::No(_) | imap::Error::Bad(_)) {
                        connection.idle_rejected = true;
                    }
                    connection.session = None;
                    connection.socket = None;
                }
                if let Some((generation, email)) = service.begin_sync() {
                    let _ = service.sync(generation, &email, None, &mut connection);
                }
            }
        }
    }
}

#[tauri::command]
pub fn get_qq_mail_state() -> Result<Vec<MailSnapshot>, String> {
    let services: Vec<_> = services()?.values().cloned().collect();
    services
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
        return Err("请输入邮箱设置中生成的授权码或密码。".into());
    }
    let service = service_or_start(&email)?;
    let (generation, snapshot) = {
        let mut state = service.lock()?;
        state.invalidate();
        state.snapshot.email = Some(email.clone());
        state.snapshot.host = Some(host);
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
    await_reply(receiver).await
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
        let service = service_or_start(&email)?;
        let mut state = service.lock()?;
        if state.snapshot.email.as_ref() == Some(&email)
            && state.snapshot.configured
            && state.snapshot.enabled == enabled
        {
            return Ok(state.snapshot.clone());
        }
        let configured = read_secret(&email)?.is_some();
        state.invalidate();
        state.snapshot.email = Some(email);
        state.snapshot.host = Some(host);
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
    let service = service(&normalize_email(&email)?)?;
    let Some((generation, _)) = service.begin_sync() else {
        let snapshot = service.lock()?.snapshot.clone();
        return if snapshot.syncing {
            Ok(snapshot)
        } else {
            Err("请先连接并开启该邮箱接收。".into())
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
    let service = service(&normalize_email(&email)?)?;
    let (generation, email) = {
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
        (
            state.generation,
            state.snapshot.email.clone().ok_or("请先连接邮箱。")?,
        )
    };
    tauri::async_runtime::spawn_blocking(move || service.read(generation, &email, &message_id))
        .await
        .map_err(|_| "无法读取邮件。".to_string())?
}

#[tauri::command]
pub async fn disconnect_qq_mail(email: String) -> Result<MailSnapshot, String> {
    let email = normalize_email(&email)?;
    tauri::async_runtime::spawn_blocking(move || {
        let service = service(&email)?;
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
        // Keep the address in the final snapshot so the frontend knows which account left.
        state.snapshot = MailSnapshot {
            email: Some(email.clone()),
            ..MailSnapshot::default()
        };
        let snapshot = state.changed();
        drop(state);
        services()?.remove(&email);
        service.publish(snapshot.clone(), None);
        let _ = service.send(Work::Stop);
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

fn is_domain(value: &str) -> bool {
    value.len() <= 253
        && value.contains('.')
        && value.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        })
}

// The address is also the IMAP login and the credential key, so only plain ASCII is accepted.
fn normalize_email(email: &str) -> Result<String, String> {
    let email = email.trim().to_ascii_lowercase();
    let valid = email.split_once('@').is_some_and(|(local, domain)| {
        !local.is_empty()
            && local.len() <= 64
            && local
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"._+-".contains(&byte))
            && is_domain(domain)
    });
    if !valid {
        return Err("请输入有效的邮箱地址。".into());
    }
    Ok(email)
}

/// An explicit IMAP host, or `imap.<domain>`, which covers QQ, 163, 126 and most school mail.
fn resolve_host(email: &str, host: Option<&str>) -> Result<String, String> {
    let host = match host.map(str::trim).filter(|host| !host.is_empty()) {
        Some(host) => host.to_ascii_lowercase(),
        None => format!("imap.{}", email.split_once('@').map_or("", |(_, domain)| domain)),
    };
    if !is_domain(&host) {
        return Err("IMAP 服务器地址无效。".into());
    }
    Ok(host)
}

fn retry_delay(failures: u32) -> Duration {
    Duration::from_secs(match failures {
        0 | 1 => 5,
        2 => 15,
        3 => 30,
        4 => 60,
        5 => 120,
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

fn open_session(host: &str, email: &str, secret: &str) -> Result<MailSession, MailFailure> {
    open_connection(host, email, secret).map(|(session, _)| session)
}

fn open_connection(
    host: &str,
    email: &str,
    secret: &str,
) -> Result<(MailSession, TcpStream), MailFailure> {
    let mut stream = None;
    let addresses = (host, 993)
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
    let interrupt = stream.try_clone().map_err(|_| MailFailure::network())?;
    let tls = native_tls::TlsConnector::new().map_err(|_| MailFailure::network())?;
    let stream = tls
        .connect(host, stream)
        .map_err(|_| MailFailure::network())?;
    let shared = Arc::new(Mutex::new(stream));
    let mut client = imap::Client::new(BoundedStream(SharedStream(shared.clone())));
    client.read_greeting().map_err(|_| MailFailure::network())?;
    let mut session = client
        .login(email, secret)
        .map_err(|(error, _)| login_failure(error))?;
    if session
        .capabilities()
        .is_ok_and(|capabilities| capabilities.has_str("ID"))
    {
        // A half-finished exchange would leave our tagged reply for imap to trip over, so drop the connection.
        send_client_id(&shared).map_err(|_| MailFailure::network())?;
    }
    Ok((session, interrupt))
}

/// 163/126 reject SELECT ("Unsafe Login") until the client sends a non-empty RFC 2971 ID.
/// imap 2.x cannot parse the `* ID (...)` reply and then panics on the leftover tagged line,
/// so the exchange runs directly on the stream while the session is idle between commands.
fn send_client_id<T: Read + Write>(stream: &Mutex<T>) -> std::io::Result<()> {
    let mut stream = stream
        .lock()
        .map_err(|_| std::io::Error::other("mail stream lock poisoned"))?;
    stream.write_all(b"fly0 ID (\"name\" \"fly-island\" \"version\" \"1.0\" \"vendor\" \"fly-island\")\r\n")?;
    stream.flush()?;
    let mut line = Vec::new();
    let mut byte = [0u8; 1];
    // One byte at a time so nothing after our tagged reply is taken from the session.
    loop {
        if stream.read(&mut byte)? == 0 {
            return Err(std::io::ErrorKind::UnexpectedEof.into());
        }
        line.push(byte[0]);
        if byte[0] == b'\n' {
            if line.starts_with(b"fly0 ") {
                return Ok(());
            }
            line.clear();
        } else if line.len() > 8_192 {
            return Err(std::io::ErrorKind::InvalidData.into());
        }
    }
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
                    // 优先渲染 HTML 版本：纯文本副本里没有排版和图片，图片只有在 HTML 里才存在。
                    if part.mime == "text/html" {
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

// cid 引用的结束位置：遇到分隔符才算 token 结束，否则 cid:image1 会把 cid:image10 一起吞掉。
fn cid_token_end(html: &str, start: usize) -> usize {
    html[start..]
        .find(|character: char| {
            character.is_whitespace()
                || matches!(character, '"' | '\'' | ')' | '(' | '<' | '>' | '?')
        })
        .map_or(html.len(), |offset| start + offset)
}

// 只内联正文里真正用 cid: 引用的图片，避免为未被引用的附件白拉数据。
fn cid_references(html: &str) -> Vec<String> {
    let lower = html.to_ascii_lowercase();
    let mut ids: Vec<String> = Vec::new();
    let mut cursor = 0;
    while let Some(found) = lower[cursor..].find("cid:") {
        let start = cursor + found + 4;
        let end = cid_token_end(&lower, start);
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

// 按完整 cid token 替换，避免 cid:image1 命中 cid:image10 的前缀。
fn replace_cid_references(html: &str, replacements: &[(String, String)]) -> String {
    let lower = html.to_ascii_lowercase();
    let mut out = String::with_capacity(html.len());
    let mut cursor = 0;
    while let Some(found) = lower[cursor..].find("cid:") {
        // 整个 cid:token 都要换掉，只换 token 会留下 "cid:data:image/..." 这种废地址。
        let reference_start = cursor + found;
        let token_start = reference_start + 4;
        let token_end = cid_token_end(&lower, token_start);
        out.push_str(&html[cursor..reference_start]);
        match replacements
            .iter()
            .find(|(content_id, _)| content_id.eq_ignore_ascii_case(&html[token_start..token_end]))
        {
            Some((_, data_uri)) => out.push_str(data_uri),
            None => out.push_str(&html[reference_start..token_end]),
        }
        cursor = token_end;
    }
    out.push_str(&html[cursor..]);
    out
}

// UID FETCH 只查这一封邮件，但服务器可以把分段拆成多条 FETCH 响应发回来，而且续包不一定
// 重复 UID（QQ 实测就只给第一条带 UID）。按 uid 相等过滤会把续包整批丢掉，只剩下第一批分段，
// 所以这里只把带 UID 的响应排在前面，其余响应照样参与合并。
fn responses_for_message<'a>(messages: &'a [Fetch], uid: u32) -> Vec<&'a Fetch> {
    let (mut mine, others): (Vec<&Fetch>, Vec<&Fetch>) =
        messages.iter().partition(|item| item.uid == Some(uid));
    mine.extend(others);
    mine
}

// 内嵌图只是锦上添花：任何一步失败都退回原正文，不能把已经拿到的文字一起弄丢。
fn inline_cid_images<T: Read + Write>(
    session: &mut Session<T>,
    uid: u32,
    structure: &BodyStructure<'_>,
    html: String,
) -> String {
    let ids = cid_references(&html);
    if ids.is_empty() {
        return html;
    }
    let mut images = Vec::new();
    collect_inline_images(structure, Vec::new(), &ids, &mut images);
    if images.is_empty() {
        return html;
    }
    let query = format!(
        "(UID {})",
        images
            .iter()
            .map(|image| {
                let section = image.path.iter().map(u32::to_string).collect::<Vec<_>>().join(".");
                // 和正文一样避开 QQ 不应答的部分取回，图片大小由 octets 限额兜底。
                format!("BODY.PEEK[{section}]")
            })
            .collect::<Vec<_>>()
            .join(" ")
    );
    let Ok(messages) = session.uid_fetch(uid.to_string(), &query) else {
        return html;
    };
    let responses = responses_for_message(&messages, uid);
    if responses.is_empty() {
        return html;
    }
    let mut replacements: Vec<(String, String)> = Vec::new();
    let mut budget = MAX_INLINE_TOTAL_BYTES;
    for image in &images {
        if image.quoted_printable {
            continue;
        }
        let path = SectionPath::Part(image.path.clone(), None);
        // 批量响应里缺这一段时（服务器把后面的批次丢了）再单独要一次：一条命令只请求一个分段，
        // 就谈不上「分批」，保证后面的图片不会漏。
        let retry;
        let bytes = match responses.iter().find_map(|item| item.section(&path)) {
            Some(bytes) => Some(bytes),
            None => {
                let section = image
                    .path
                    .iter()
                    .map(u32::to_string)
                    .collect::<Vec<_>>()
                    .join(".");
                retry = session
                    .uid_fetch(uid.to_string(), format!("(UID BODY.PEEK[{section}])"))
                    .ok();
                retry
                    .as_ref()
                    .and_then(|items| items.iter().find_map(|item| item.section(&path)))
            }
        };
        let Some(bytes) = bytes else {
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
    replace_cid_references(&html, &replacements)
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
    let multipart = matches!(structure, BodyStructure::Multipart { .. });
    let mime_path = SectionPath::Part(part.path.clone(), Some(MessageSection::Mime));
    let body_path = SectionPath::Part(part.path, None);
    // 单段邮件的正文就是整封信，没有 [1.MIME] 这个分段（QQ 会直接不返回），只能取报文头。
    let header_query = if multipart {
        format!("BODY.PEEK[{section}.MIME]")
    } else {
        "BODY.PEEK[HEADER]".to_string()
    };
    // QQ 的 IMAP 对分段的部分取回（BODY[1]<0.n>）不应答，会一直挂到超时；整段取回秒回。
    // 大小仍由 BODYSTRUCTURE 的 octets 和下面的长度校验兜底。
    let query = format!("(UID {header_query} BODY.PEEK[{section}])");
    let messages = session
        .uid_fetch(uid.to_string(), query)
        .map_err(|_| "无法加载邮件正文，请检查网络并重试。")?;
    // 服务器可能把两个分段拆到不同的 FETCH 响应里（续包甚至不重复 UID），合并全部响应，
    // 别要求同一条响应都带齐，也别要求每条响应都带 UID。
    let mut header = None;
    let mut body = None;
    for item in responses_for_message(&messages, uid) {
        if header.is_none() {
            header = if multipart { item.section(&mime_path) } else { item.header() };
        }
        if body.is_none() {
            body = item.section(&body_path);
        }
    }
    let header = header.ok_or("邮件已移除，请刷新收件箱。")?;
    let body = body.ok_or("邮件已移除，请刷新收件箱。")?;
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
        inline_cid_images(session, uid, structure, content)
    } else {
        content
    };
    Ok(MailContent {
        id: message_id.into(),
        content,
        content_type: part.mime.into(),
    })
}

#[cfg(test)]
fn fetch_inbox<T: Read + Write>(session: &mut Session<T>) -> Result<Inbox, MailFailure> {
    fetch_inbox_cached(session, None)
}

fn header_message(message: &Fetch, validity: u32) -> Option<MailMessage> {
    let uid = message.uid?;
    let (sender, subject) = parse_header(message.header()?);
    Some(MailMessage {
        id: format!("{validity}:{uid}"),
        uid,
        sender,
        subject,
        received_at: message.internal_date().map(|date| date.timestamp_millis()),
        unread: !message.flags().contains(&Flag::Seen),
    })
}

fn drain_mail_updates<T: Read + Write>(
    session: &Session<T>,
    exists: u32,
    unread: &mut Option<usize>,
    needs_refresh: &mut bool,
) {
    for response in session.unsolicited_responses.try_iter() {
        match response {
            UnsolicitedResponse::Status {
                mailbox,
                attributes,
            } if mailbox.eq_ignore_ascii_case("INBOX") => {
                if let Some(count) = attributes
                    .into_iter()
                    .find_map(|attribute| match attribute {
                        StatusAttribute::Unseen(count) => Some(count as usize),
                        _ => None,
                    })
                {
                    *unread = Some(count);
                }
            }
            UnsolicitedResponse::Exists(count) if count != exists => *needs_refresh = true,
            UnsolicitedResponse::Expunge(_) => *needs_refresh = true,
            _ => {}
        }
    }
}

fn fetch_inbox_cached<T: Read + Write>(
    session: &mut Session<T>,
    cached: Option<&Inbox>,
) -> Result<Inbox, MailFailure> {
    let mailbox = session
        .examine("INBOX")
        .map_err(|_| MailFailure::network())?;
    let validity = mailbox
        .uid_validity
        .filter(|value| *value > 0)
        .ok_or_else(MailFailure::network)?;
    // STATUS returns the total without enumerating every unread UID in a large inbox.
    for _ in session.unsolicited_responses.try_iter() {}
    session
        .status("INBOX", "(UNSEEN)")
        .map_err(|_| MailFailure::network())?;
    // imap 2.4 forwards STATUS attributes to this channel rather than returning
    // them in Mailbox.unseen (which has different semantics for EXAMINE).
    let mut unread_count = None;
    let mut needs_refresh = false;
    drain_mail_updates(
        session,
        mailbox.exists,
        &mut unread_count,
        &mut needs_refresh,
    );
    let mut items = Vec::new();
    if mailbox.exists > 0 {
        let first = mailbox.exists.saturating_sub(MAX_ITEMS - 1).max(1);
        let cached = cached.filter(|previous| previous.cursor.validity == validity);
        if let Some(cached) = cached {
            let mut missing = Vec::new();
            let messages = session
                .fetch(format!("{first}:{}", mailbox.exists), FLAGS_QUERY)
                .map_err(|_| MailFailure::network())?;
            for message in messages
                .iter()
                .filter(|message| (first..=mailbox.exists).contains(&message.message))
            {
                let Some(uid) = message.uid else {
                    continue;
                };
                if let Some(previous) = cached.items.iter().find(|item| item.uid == uid) {
                    let mut item = previous.clone();
                    item.unread = !message.flags().contains(&Flag::Seen);
                    item.received_at = message
                        .internal_date()
                        .map(|date| date.timestamp_millis())
                        .or(item.received_at);
                    items.push(item);
                } else if !missing.contains(&uid) {
                    missing.push(uid);
                }
            }
            if !missing.is_empty() {
                let sequence = missing
                    .iter()
                    .map(u32::to_string)
                    .collect::<Vec<_>>()
                    .join(",");
                let messages = session
                    .uid_fetch(sequence, HEADER_QUERY)
                    .map_err(|_| MailFailure::network())?;
                for message in messages.iter() {
                    if let Some(item) = header_message(message, validity) {
                        if missing.contains(&item.uid)
                            && !items.iter().any(|old| old.uid == item.uid)
                        {
                            items.push(item);
                        }
                    }
                }
                if missing
                    .iter()
                    .any(|uid| !items.iter().any(|item| item.uid == *uid))
                {
                    return Err(MailFailure::network());
                }
            }
        } else {
            let messages = session
                .fetch(format!("{first}:{}", mailbox.exists), HEADER_QUERY)
                .map_err(|_| MailFailure::network())?;
            for message in messages
                .iter()
                .filter(|message| (first..=mailbox.exists).contains(&message.message))
            {
                if let Some(item) = header_message(message, validity) {
                    items.push(item);
                }
            }
        }
    }
    items.sort_by_key(|item| std::cmp::Reverse(item.uid));
    items.dedup_by_key(|item| item.uid);
    items.truncate(MAX_ITEMS as usize);
    let expected = mailbox.exists.min(MAX_ITEMS) as usize;
    if items.len() != expected {
        return Err(MailFailure::network());
    }
    // UIDNEXT can advance while this snapshot is being fetched. Acknowledge
    // only headers actually received, or the next arrival's preview can be lost.
    let high_water = items.iter().map(|item| item.uid).max().unwrap_or(0);
    drain_mail_updates(
        session,
        mailbox.exists,
        &mut unread_count,
        &mut needs_refresh,
    );
    Ok(Inbox {
        cursor: Cursor {
            validity,
            high_water,
        },
        unread_count: unread_count.ok_or_else(MailFailure::network)?,
        items,
        needs_refresh,
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
            needs_refresh: false,
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
    fn validates_addresses_and_rejects_commands_or_malformed_hosts() {
        assert_eq!(normalize_email(" User@QQ.COM ").unwrap(), "user@qq.com");
        assert_eq!(normalize_email("a.b@example.edu.cn").unwrap(), "a.b@example.edu.cn");
        for email in [
            "",
            "@qq.com",
            "a@",
            "a@qq",
            "a@qq..com",
            "a@-qq.com",
            "a@b@qq.com",
            "a b@qq.com",
            "a\r\nLOGIN@qq.com",
            "a@qq.com\r\nx",
        ] {
            assert!(normalize_email(email).is_err(), "{email:?}");
        }
        assert_eq!(resolve_host("x@163.com", None).unwrap(), "imap.163.com");
        assert_eq!(resolve_host("x@example.edu.cn", Some(" ")).unwrap(), "imap.example.edu.cn");
        assert_eq!(resolve_host("x@foxmail.com", Some("IMAP.QQ.COM")).unwrap(), "imap.qq.com");
        assert!(resolve_host("x@qq.com", Some("imap.qq.com:993")).is_err());
        assert!(resolve_host("x@qq.com", Some("imap.qq.com/x")).is_err());
    }

    #[test]
    #[ignore = "Logs in to the mailbox in FLY_MAIL_TEST with its saved Windows credential; prints counts only"]
    fn live_mailbox_sync_with_saved_credential() {
        let email = normalize_email(&std::env::var("FLY_MAIL_TEST").unwrap()).unwrap();
        let host = resolve_host(&email, None).unwrap();
        let started = Instant::now();
        let mut connection = SyncConnection::default();
        let inbox = connection.fetch(&host, &email, None).map_err(|failure| failure.message).unwrap();
        eprintln!("{email}: unread={} items={} idle={} in {:?}", inbox.unread_count, inbox.items.len(), connection.idle_supported, started.elapsed());
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
        let png = "data:image/png;base64,AA".to_string();
        assert_eq!(
            replace_cid_references("a CID:x b cid:X c", &[("x".into(), png.clone())]),
            format!("a {png} b {png} c")
        );
        assert_eq!(
            replace_cid_references("中文 cid:x", &[("x".into(), "图".into())]),
            "中文 图"
        );
        // cid:image1 不能吃掉 cid:image10 的前缀
        assert_eq!(
            replace_cid_references(
                r#"<img src="cid:image10"><img src="cid:image1">"#,
                &[("image1".into(), png.clone())]
            ),
            format!(r#"<img src="cid:image10"><img src="{png}">"#)
        );
        // 整个 cid:token 都要换掉，不能留下 "cid:data:image/..." 这种无效地址
        assert_eq!(
            replace_cid_references(r#"<img src="cid:x">"#, &[("x".into(), png.clone())]),
            format!(r#"<img src="{png}">"#)
        );
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
        assert_eq!(retry_delay(1).as_secs(), 5);
        assert_eq!(retry_delay(2).as_secs(), 15);
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
    impl SetReadTimeout for ScriptedStream {
        fn set_read_timeout(&mut self, _: Option<Duration>) -> imap::Result<()> {
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
        let mut script = "* OK ready\r\na1 OK login\r\n* 25 EXISTS\r\n* 0 RECENT\r\n* OK [UIDVALIDITY 7] valid\r\n* OK [UIDNEXT 26] next\r\na2 OK [READ-ONLY] examined\r\n* STATUS \"INBOX\" (UNSEEN 25)\r\na3 OK status\r\n".to_string();
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
        assert!(commands.contains("STATUS \"INBOX\" (UNSEEN)"));
        assert!(commands.contains(HEADER_QUERY));
        for forbidden in [" SELECT ", " STORE ", " EXPUNGE", "BODY[]", "BODY[TEXT]"] {
            assert!(!commands.contains(forbidden));
        }
    }

    #[test]
    fn empty_mailbox_is_a_successful_zero_unread_snapshot() {
        let (client, _) = client("* OK ready\r\na1 OK login\r\n* 0 EXISTS\r\n* 0 RECENT\r\n* OK [UIDVALIDITY 1] valid\r\n* OK [UIDNEXT 1] next\r\na2 OK [READ-ONLY] examined\r\n* STATUS \"INBOX\" (UNSEEN 0)\r\na3 OK status\r\n".into());
        let mut session = client.login("user@qq.com", "test-secret").unwrap();
        let inbox = fetch_inbox(&mut session).unwrap();
        assert_eq!(inbox.unread_count, 0);
        assert!(inbox.items.is_empty());
    }

    #[test]
    fn a_reused_session_detects_new_mail_without_another_login() {
        let header = "From: sender@example.com\r\nSubject: New arrival\r\n\r\n";
        let script = format!(
            "* OK ready\r\na1 OK login\r\n* 0 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\n* OK [UIDNEXT 1] next\r\na2 OK [READ-ONLY] examined\r\n* STATUS \"INBOX\" (UNSEEN 0)\r\na3 OK status\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\n* OK [UIDNEXT 2] next\r\na4 OK [READ-ONLY] examined\r\n* STATUS \"INBOX\" (UNSEEN 1)\r\na5 OK status\r\n* 1 FETCH (UID 1 FLAGS () BODY[HEADER]<0> {{{}}}\r\n{header})\r\na6 OK fetch\r\n",
            header.len()
        );
        let (client, output) = client(script);
        let mut session = client.login("user@qq.com", "test-secret").unwrap();
        let mut state = active_state();
        let initial = fetch_inbox(&mut session).unwrap();
        assert!(state.accept(0, initial).unwrap().1.is_none());
        assert!(
            state
                .next_check
                .unwrap()
                .saturating_duration_since(Instant::now())
                <= Duration::from_secs(5)
        );
        let arrival = fetch_inbox(&mut session).unwrap();
        assert_eq!(arrival.items[0].subject, "New arrival");
        assert_eq!(state.accept(0, arrival).unwrap().1.as_deref(), Some("7:1"));
        let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
        assert_eq!(commands.matches("LOGIN").count(), 1);
        assert_eq!(commands.matches("EXAMINE").count(), 2);
    }

    #[test]
    fn cached_sync_updates_flags_without_downloading_headers_again() {
        let (client, output) = client("* OK ready\r\na1 OK login\r\n* 2 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\n* OK [UIDNEXT 3] next\r\na2 OK examined\r\n* STATUS INBOX (UNSEEN 1)\r\na3 OK status\r\n* 1 FETCH (UID 1 FLAGS (\\Seen))\r\n* 2 FETCH (UID 2 FLAGS ())\r\na4 OK flags\r\n".into());
        let mut session = client.login("user@qq.com", "test-secret").unwrap();
        let cached = inbox(7, &[1, 2]);
        let next = fetch_inbox_cached(&mut session, Some(&cached)).unwrap();
        assert_eq!(next.unread_count, 1);
        assert!(!next.items.iter().find(|item| item.uid == 1).unwrap().unread);
        assert_eq!(next.items[0].subject, "主题");
        assert!(!next.needs_refresh);
        let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
        assert!(commands.contains(FLAGS_QUERY));
        assert!(!commands.contains("BODY"));
        assert!(!commands.contains("SEARCH"));
    }

    #[test]
    fn a_new_arrival_downloads_only_its_header_and_preserves_cached_titles() {
        let header = "From: new@example.com\r\nSubject: New arrival\r\n\r\n";
        let script = format!("* OK ready\r\na1 OK login\r\n* 3 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\n* OK [UIDNEXT 4] next\r\na2 OK examined\r\n* STATUS INBOX (UNSEEN 2)\r\na3 OK status\r\n* 1 FETCH (UID 1 FLAGS (\\Seen))\r\n* 2 FETCH (UID 2 FLAGS ())\r\n* 3 FETCH (UID 3 FLAGS ())\r\na4 OK flags\r\n* 3 FETCH (UID 3 FLAGS () BODY[HEADER]<0> {{{}}}\r\n{header})\r\na5 OK header\r\n", header.len());
        let (client, output) = client(script);
        let mut session = client.login("user@qq.com", "test-secret").unwrap();
        let cached = inbox(7, &[1, 2]);
        let next = fetch_inbox_cached(&mut session, Some(&cached)).unwrap();
        assert_eq!(next.items[0].subject, "New arrival");
        assert_eq!(next.items[1].subject, "主题");
        assert_eq!(next.unread_count, 2);
        let mut state = active_state();
        state.accept(0, cached);
        assert_eq!(state.accept(0, next).unwrap().1.as_deref(), Some("7:3"));
        let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
        assert!(commands.contains("UID FETCH 3 (UID FLAGS INTERNALDATE BODY.PEEK[HEADER]"));
        assert_eq!(commands.matches("BODY.PEEK").count(), 1);
    }

    #[test]
    fn rebuilt_mailboxes_do_not_reuse_headers_from_the_old_uid_validity() {
        let header = "Subject: Replacement\r\n\r\n";
        let script = format!("* OK ready\r\na1 OK login\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 8] valid\r\n* OK [UIDNEXT 2] next\r\na2 OK examined\r\n* STATUS INBOX (UNSEEN 1)\r\na3 OK status\r\n* 1 FETCH (UID 1 FLAGS () BODY[HEADER]<0> {{{}}}\r\n{header})\r\na4 OK header\r\n", header.len());
        let (client, _) = client(script);
        let mut session = client.login("user@qq.com", "test-secret").unwrap();
        let cached = inbox(7, &[1]);
        let next = fetch_inbox_cached(&mut session, Some(&cached)).unwrap();
        assert_eq!(next.items[0].id, "8:1");
        assert_eq!(next.items[0].subject, "Replacement");
        let mut state = active_state();
        state.accept(0, cached);
        assert!(state.accept(0, next).unwrap().1.is_none());
    }

    #[test]
    fn arrivals_during_sync_request_an_immediate_followup_before_idling() {
        let (client, _) = client("* OK ready\r\na1 OK login\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\n* OK [UIDNEXT 3] next\r\na2 OK examined\r\n* STATUS INBOX (UNSEEN 2)\r\na3 OK status\r\n* 2 EXISTS\r\n* 1 FETCH (UID 1 FLAGS ())\r\na4 OK flags\r\n".into());
        let mut session = client.login("user@qq.com", "test-secret").unwrap();
        let cached = inbox(7, &[1]);
        let next = fetch_inbox_cached(&mut session, Some(&cached)).unwrap();
        assert!(next.needs_refresh);
        assert_eq!(next.cursor.high_water, 1);
        let mut state = active_state();
        state.accept(0, cached);
        state.accept(0, next);
        assert_eq!(state.accept(0, inbox(7, &[1, 2])).unwrap().1.as_deref(), Some("7:2"));
    }

    #[test]
    fn missing_new_headers_cannot_silently_advance_the_notification_cursor() {
        let (client, _) = client("* OK ready\r\na1 OK login\r\n* 2 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\n* OK [UIDNEXT 3] next\r\na2 OK examined\r\n* STATUS INBOX (UNSEEN 2)\r\na3 OK status\r\n* 1 FETCH (UID 1 FLAGS ())\r\n* 2 FETCH (UID 2 FLAGS ())\r\na4 OK flags\r\na5 OK header\r\n".into());
        let mut session = client.login("user@qq.com", "test-secret").unwrap();
        let cached = inbox(7, &[1]);
        assert!(fetch_inbox_cached(&mut session, Some(&cached)).is_err());
        assert_eq!(cached.cursor.high_water, 1);
    }

    fn socket_pair() -> (TcpStream, TcpStream) {
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let client = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        (client, listener.accept().unwrap().0)
    }

    #[test]
    fn queued_refreshes_are_not_dropped_or_blocked_by_idle() {
        let (client, output) = client("* OK ready\r\na1 OK login\r\n".into());
        let mut session = client.login("user@qq.com", "test-secret").unwrap();
        let (socket, _peer) = socket_pair();
        let gate = Mutex::new(None);
        let (sender, receiver) = mpsc::channel();
        let (reply, _) = mpsc::channel();
        for generation in [1, 2] {
            sender
                .send(Work::Refresh {
                    generation,
                    reply: reply.clone(),
                })
                .unwrap();
        }
        let wake = wait_for_mail(
            &mut session,
            &socket,
            &gate,
            &receiver,
            PUSH_REFRESH_INTERVAL,
        );
        assert!(matches!(
            wake,
            MailWake::Work(Work::Refresh { generation: 1, .. })
        ));
        assert!(matches!(
            receiver.try_recv(),
            Ok(Work::Refresh { generation: 2, .. })
        ));
        assert!(gate.lock().unwrap().is_none());
        assert!(!String::from_utf8(output.lock().unwrap().clone())
            .unwrap()
            .contains("IDLE"));
    }

    #[test]
    fn server_push_wakes_the_worker_without_waiting_for_a_poll_deadline() {
        let (client, output) = client(
            "* OK ready\r\na1 OK login\r\n+ idling\r\n* 2 EXISTS\r\na2 OK idle done\r\n".into(),
        );
        let mut session = client.login("user@qq.com", "test-secret").unwrap();
        let (socket, _peer) = socket_pair();
        let gate = Mutex::new(None);
        let (_sender, receiver) = mpsc::channel();
        let wake = wait_for_mail(
            &mut session,
            &socket,
            &gate,
            &receiver,
            PUSH_REFRESH_INTERVAL,
        );
        assert!(matches!(wake, MailWake::Changed));
        let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
        assert!(commands.contains("a2 IDLE\r\nDONE\r\n"));
        assert!(gate.lock().unwrap().is_none());
    }

    #[test]
    fn idle_rejection_returns_to_the_worker_for_polling_fallback() {
        let (client, _) = client(
            "* OK ready\r\na1 OK login\r\na2 BAD IDLE unsupported\r\na2 BAD not idling\r\n".into(),
        );
        let mut session = client.login("user@qq.com", "test-secret").unwrap();
        let (socket, _peer) = socket_pair();
        let gate = Mutex::new(None);
        let (_sender, receiver) = mpsc::channel();
        assert!(matches!(
            wait_for_mail(
                &mut session,
                &socket,
                &gate,
                &receiver,
                PUSH_REFRESH_INTERVAL
            ),
            MailWake::Failed(imap::Error::Bad(_))
        ));
        assert!(gate.lock().unwrap().is_none());
    }

    #[test]
    fn client_id_consumes_only_its_own_reply() {
        let input = b"* ID (\"name\" \"Coremail Imap\")\r\nfly0 OK ID completed\r\na2 OK next\r\n".to_vec();
        let stream = Mutex::new(ScriptedStream {
            input: IoCursor::new(input),
            output: Arc::new(Mutex::new(Vec::new())),
        });
        send_client_id(&stream).unwrap();
        let mut stream = stream.into_inner().unwrap();
        assert!(String::from_utf8_lossy(&stream.output.lock().unwrap()).starts_with("fly0 ID (\"name\" \"fly-island\""));
        let mut rest = String::new();
        stream.input.read_to_string(&mut rest).unwrap();
        assert_eq!(rest, "a2 OK next\r\n");
        let silent = Mutex::new(ScriptedStream {
            input: IoCursor::new(b"* ID NIL\r\n".to_vec()),
            output: Arc::new(Mutex::new(Vec::new())),
        });
        assert!(send_client_id(&silent).is_err());
    }

    #[test]
    fn clearing_an_idle_timeout_restores_a_bounded_read_timeout() {
        let (socket, _peer) = socket_pair();
        let mut stream = BoundedStream(socket);
        stream.set_read_timeout(None).unwrap();
        assert_eq!(stream.0.read_timeout().unwrap(), Some(IO_TIMEOUT));
    }

    #[test]
    fn pause_or_disconnect_interrupts_a_real_blocked_idle_socket() {
        use std::io::{BufRead, BufReader};
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let address = listener.local_addr().unwrap();
        let (entered, started) = mpsc::channel();
        let peer = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut reader = BufReader::new(socket.try_clone().unwrap());
            socket.write_all(b"* OK ready\r\n").unwrap();
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            assert!(line.starts_with("a1 LOGIN"));
            socket.write_all(b"a1 OK login\r\n").unwrap();
            line.clear();
            reader.read_line(&mut line).unwrap();
            assert_eq!(line, "a2 IDLE\r\n");
            socket.write_all(b"+ idling\r\n").unwrap();
            entered.send(()).unwrap();
            line.clear();
            let _ = reader.read_line(&mut line);
        });
        let socket = TcpStream::connect(address).unwrap();
        socket.set_read_timeout(Some(IO_TIMEOUT)).unwrap();
        let control = socket.try_clone().unwrap();
        let mut client = imap::Client::new(BoundedStream(socket));
        client.read_greeting().unwrap();
        let mut session = client.login("user@qq.com", "test-secret").unwrap();
        let gate = Arc::new(Mutex::new(None));
        let interrupt = gate.clone();
        let (sender, receiver) = mpsc::channel();
        let cancel = thread::spawn(move || {
            started.recv_timeout(Duration::from_secs(3)).unwrap();
            sender.send(Work::Wake).unwrap();
            interrupt_idle(&interrupt);
        });
        let before = Instant::now();
        assert!(matches!(
            wait_for_mail(
                &mut session,
                &control,
                &gate,
                &receiver,
                PUSH_REFRESH_INTERVAL
            ),
            MailWake::Work(Work::Wake)
        ));
        assert!(before.elapsed() < Duration::from_secs(3));
        assert!(gate.lock().unwrap().is_none());
        cancel.join().unwrap();
        peer.join().unwrap();
    }

    fn body_client(
        structure: &str,
        header: &str,
        path: &str,
        mime: &str,
        body: &str,
    ) -> (Session<ScriptedStream>, Arc<Mutex<Vec<u8>>>) {
        let script = format!("* OK ready\r\na1 OK login\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\na2 OK [READ-ONLY] examined\r\n* 1 FETCH (UID 9 FLAGS ())\r\n* 1 FETCH (UID 9 BODYSTRUCTURE {structure})\r\na3 OK structure\r\n* 1 FETCH (UID 9 FLAGS ())\r\n* 1 FETCH (UID 9 BODY[{header}] {{{}}}\r\n{mime} BODY[{path}] {{{}}}\r\n{body})\r\na4 OK body\r\n", mime.len(), body.len());
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
            "HEADER",
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
        assert!(commands.contains("BODY.PEEK[HEADER] BODY.PEEK[1]"));
        for forbidden in [" SELECT ", " STORE ", " EXPUNGE", "BODY[]", "RFC822 "] {
            assert!(!commands.contains(forbidden), "{commands}");
        }
    }

    #[test]
    fn split_fetch_responses_still_build_the_body() {
        let body = "5Lit5paH";
        let mime = "Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n";
        let structure = format!("(\"TEXT\" \"PLAIN\" (\"CHARSET\" \"UTF-8\") NIL NIL \"BASE64\" {} 1)", body.len());
        // 续包只带了分段、没重复 UID（QQ 的拆包形态），正文和报文头都要能拼出来。
        let script = format!("* OK ready\r\na1 OK login\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\na2 OK [READ-ONLY] examined\r\n* 1 FETCH (UID 9 BODYSTRUCTURE {structure})\r\na3 OK structure\r\n* 1 FETCH (UID 9 BODY[HEADER] {{{}}}\r\n{mime})\r\n* 1 FETCH (BODY[1] {{{}}}\r\n{body})\r\na4 OK body\r\n", mime.len(), body.len());
        let (client, _) = client(script);
        let mut session = client.login("user@qq.com", "test-secret").unwrap();
        assert_eq!(fetch_content(&mut session, "7:9").unwrap().content, "中文");
    }

    #[test]
    fn multipart_prefers_html_and_skips_attachments_and_plain_alternative() {
        let body = "<p>meeting at 3</p>";
        let structure = format!("(((\"TEXT\" \"HTML\" (\"CHARSET\" \"UTF-8\") NIL NIL \"8BIT\" {} 1)(\"TEXT\" \"PLAIN\" (\"CHARSET\" \"UTF-8\") NIL NIL \"8BIT\" 12 1) \"ALTERNATIVE\")(\"APPLICATION\" \"PDF\" (\"NAME\" \"large.pdf\") NIL NIL \"BASE64\" 9999999) \"MIXED\")", body.len());
        let (mut session, output) = body_client(
            &structure,
            "1.1.MIME",
            "1.1",
            "Content-Type: text/html; charset=utf-8\r\n\r\n",
            body,
        );
        assert_eq!(fetch_content(&mut session, "7:9").unwrap().content, body);
        let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
        assert!(commands.contains("BODY.PEEK[1.1]"));
        assert!(!commands.contains("BODY.PEEK[1.2]"));
        assert!(!commands.contains("BODY.PEEK[2]"));
    }

    #[test]
    fn images_split_across_fetch_responses_without_repeated_uid_are_all_inlined() {
        let body = r#"<p>两张图</p><img src="cid:img1@qq"><img src="cid:img2@qq">"#;
        let mime = "Content-Type: text/html; charset=utf-8\r\n\r\n";
        let first = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4";
        let second = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR5";
        let structure = format!(
            "((\"TEXT\" \"HTML\" (\"CHARSET\" \"UTF-8\") NIL NIL \"8BIT\" {} 1)(\"IMAGE\" \"PNG\" (\"NAME\" \"img1.png\") \"<img1@qq>\" NIL \"BASE64\" {})(\"IMAGE\" \"PNG\" (\"NAME\" \"img2.png\") \"<img2@qq>\" NIL \"BASE64\" {}) \"RELATED\")",
            body.len(),
            first.len(),
            second.len()
        );
        // 图片多时服务器会把分段拆成多条 FETCH 响应，而且只有第一条带 UID，后面的响应
        // 只给分段——按 uid 过滤的话就只能拿到第一批，两张图都得内联才算过。
        let script = format!(
            "* OK ready\r\na1 OK login\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\na2 OK [READ-ONLY] examined\r\n* 1 FETCH (UID 9 BODYSTRUCTURE {structure})\r\na3 OK structure\r\n* 1 FETCH (UID 9 BODY[1.MIME] {{{}}}\r\n{mime} BODY[1] {{{}}}\r\n{body})\r\na4 OK body\r\n* 1 FETCH (UID 9 BODY[2] {{{}}}\r\n{first})\r\n* 1 FETCH (BODY[3] {{{}}}\r\n{second})\r\na5 OK images\r\n",
            mime.len(),
            body.len(),
            first.len(),
            second.len()
        );
        let (client, _) = client(script);
        let mut session = client.login("user@qq.com", "test-secret").unwrap();
        let content = fetch_content(&mut session, "7:9").unwrap();
        assert!(content
            .content
            .contains(&format!("data:image/png;base64,{first}")));
        assert!(content
            .content
            .contains(&format!("data:image/png;base64,{second}")));
        assert!(!content.content.contains("cid:"));
    }

    #[test]
    fn an_image_missing_from_the_batches_is_fetched_again_on_its_own() {
        let body = r#"<p>两张图</p><img src="cid:img1@qq"><img src="cid:img2@qq">"#;
        let mime = "Content-Type: text/html; charset=utf-8\r\n\r\n";
        let first = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4";
        let second = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR5";
        let structure = format!(
            "((\"TEXT\" \"HTML\" (\"CHARSET\" \"UTF-8\") NIL NIL \"8BIT\" {} 1)(\"IMAGE\" \"PNG\" (\"NAME\" \"img1.png\") \"<img1@qq>\" NIL \"BASE64\" {})(\"IMAGE\" \"PNG\" (\"NAME\" \"img2.png\") \"<img2@qq>\" NIL \"BASE64\" {}) \"RELATED\")",
            body.len(),
            first.len(),
            second.len()
        );
        // 服务器只把第一批发回来（第二张图缺失），得单独再取一次这个分段补上。
        let script = format!(
            "* OK ready\r\na1 OK login\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\na2 OK [READ-ONLY] examined\r\n* 1 FETCH (UID 9 BODYSTRUCTURE {structure})\r\na3 OK structure\r\n* 1 FETCH (UID 9 BODY[1.MIME] {{{}}}\r\n{mime} BODY[1] {{{}}}\r\n{body})\r\na4 OK body\r\n* 1 FETCH (UID 9 BODY[2] {{{}}}\r\n{first})\r\na5 OK images\r\n* 1 FETCH (UID 9 BODY[3] {{{}}}\r\n{second})\r\na6 OK retry\r\n",
            mime.len(),
            body.len(),
            first.len(),
            second.len()
        );
        let (client, output) = client(script);
        let mut session = client.login("user@qq.com", "test-secret").unwrap();
        let content = fetch_content(&mut session, "7:9").unwrap();
        assert!(content
            .content
            .contains(&format!("data:image/png;base64,{first}")));
        assert!(content
            .content
            .contains(&format!("data:image/png;base64,{second}")));
        assert!(!content.content.contains("cid:"));
        let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
        assert_eq!(commands.matches("BODY.PEEK[3]").count(), 2, "{commands}");
    }

    #[test]
    fn inline_image_failures_keep_the_text_body() {
        let body = r#"<p>保留正文</p><img src="cid:image1@qq">"#;
        let mime = "Content-Type: text/html; charset=utf-8\r\n\r\n";
        let structure = format!(
            "((\"TEXT\" \"HTML\" (\"CHARSET\" \"UTF-8\") NIL NIL \"8BIT\" {} 1)(\"IMAGE\" \"PNG\" (\"NAME\" \"image1.png\") \"<image1@qq>\" NIL \"BASE64\" 40) \"RELATED\")",
            body.len()
        );
        let script = format!("* OK ready\r\na1 OK login\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\na2 OK [READ-ONLY] examined\r\n* 1 FETCH (UID 9 BODYSTRUCTURE {structure})\r\na3 OK structure\r\n* 1 FETCH (UID 9 BODY[1.MIME]<0> {{{}}}\r\n{mime} BODY[1]<0> {{{}}}\r\n{body})\r\na4 OK body\r\na5 NO image fetch failed\r\n", mime.len(), body.len());
        let (client, output) = client(script);
        let mut session = client.login("user@qq.com", "test-secret").unwrap();
        let content = fetch_content(&mut session, "7:9").expect("图片失败不应该连正文一起失败");
        assert_eq!(content.content, body);
        let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
        assert!(commands.contains("BODY.PEEK[1]"));
        assert!(commands.contains("BODY.PEEK[2]"));
    }

    #[test]
    fn html_only_mail_decodes_quoted_printable_chinese() {
        let body = "<p>=D6=D0=CE=C4</p>";
        let structure = format!(
            "(\"TEXT\" \"HTML\" (\"CHARSET\" \"GB2312\") NIL NIL \"QUOTED-PRINTABLE\" {} 1)",
            body.len()
        );
        let (mut session, _) = body_client(&structure, "HEADER", "1", "Content-Type: text/html; charset=GB2312\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n", body);
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
            let (mut session, output) = body_client(&structure, "HEADER", "1", "", "");
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
            let (mut session, _) = body_client(&structure, "HEADER", "1", mime, "hello");
            assert!(fetch_content(&mut session, "7:9").is_err());
        }
    }
}
