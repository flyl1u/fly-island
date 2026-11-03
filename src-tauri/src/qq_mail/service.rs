//! Background mail worker: owns the IMAP connection, schedules syncs and answers commands.

use serde::Serialize;
use std::{
    net::TcpStream,
    sync::{mpsc, Arc, Mutex, MutexGuard, OnceLock},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};

use super::*;

pub(super) const SYNC_INTERVAL: Duration = Duration::from_secs(5);

pub(super) const PUSH_REFRESH_INTERVAL: Duration = Duration::from_secs(60);

pub(super) static SERVICE: OnceLock<Arc<MailService>> = OnceLock::new();

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct MailEvent {
    pub(super) snapshot: MailSnapshot,
    pub(super) newest_id: Option<String>,
    pub(super) window_visible: bool,
}

#[derive(Default)]
pub(super) struct MailState {
    pub(super) snapshot: MailSnapshot,
    pub(super) generation: u64,
    pub(super) cursor: Option<Cursor>,
    pub(super) failures: u32,
    pub(super) next_check: Option<Instant>,
}

impl MailState {
    pub(super) fn invalidate(&mut self) {
        self.generation += 1;
        self.cursor = None;
        self.failures = 0;
        self.next_check = None;
        self.snapshot.syncing = false;
    }

    pub(super) fn changed(&mut self) -> MailSnapshot {
        self.snapshot.revision += 1;
        self.snapshot.clone()
    }

    pub(super) fn accept(&mut self, generation: u64, inbox: Inbox) -> Option<(MailSnapshot, Option<String>)> {
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

    pub(super) fn fail(&mut self, generation: u64, failure: &MailFailure) -> Option<MailSnapshot> {
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

pub(super) enum Work {
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
}

pub(super) struct MailService {
    pub(super) app: AppHandle,
    pub(super) state: Mutex<MailState>,
    pub(super) sender: mpsc::Sender<Work>,
    pub(super) idle_socket: Mutex<Option<TcpStream>>,
}

impl MailService {
    pub(super) fn send(&self, work: Work) -> Result<(), String> {
        self.sender
            .send(work)
            .map_err(|_| "QQ 邮箱服务不可用。".to_string())?;
        interrupt_idle(&self.idle_socket);
        Ok(())
    }

    pub(super) fn lock(&self) -> Result<MutexGuard<'_, MailState>, String> {
        self.state.lock().map_err(|_| "QQ 邮箱状态不可用。".into())
    }

    pub(super) fn publish(&self, snapshot: MailSnapshot, newest_id: Option<String>) {
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

    pub(super) fn begin_sync(&self) -> Option<(u64, String)> {
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

    pub(super) fn sync(
        &self,
        generation: u64,
        email: &str,
        secret: Option<&str>,
        connection: &mut SyncConnection,
    ) -> Result<MailSnapshot, String> {
        {
            let state = self.lock()?;
            if generation != state.generation || !state.snapshot.enabled {
                return Err("邮箱连接已取消。".into());
            }
        }
        connection.reset(generation);
        let result = connection.fetch(email, secret);
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

    pub(super) fn read(&self, generation: u64, email: &str, message_id: &str) -> Result<MailContent, String> {
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

pub(super) fn worker(service: Arc<MailService>, receiver: mpsc::Receiver<Work>) {
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
                    .ok_or_else(|| "请先连接 QQ 邮箱。".to_string())
                    .and_then(|email| service.sync(generation, &email, None, &mut connection));
                let _ = reply.send(result);
            }
            MailWake::Work(Work::Wake) => {}
            MailWake::Closed => return,
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

pub(super) fn retry_delay(failures: u32) -> Duration {
    Duration::from_secs(match failures {
        0 | 1 => 5,
        2 => 15,
        3 => 30,
        4 => 60,
        5 => 120,
        _ => 300,
    })
}

pub(super) fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
