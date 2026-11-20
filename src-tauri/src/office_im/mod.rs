//! DingTalk, Feishu and WeCom reminders (built-in plugins): a flashing taskbar button becomes an
//! unread reminder on the island, activating the client clears it, and the island can bring the
//! client's main window forward. The listener only runs while at least one client is switched on.

mod client;
mod listener;
mod desktop;

use std::{
    sync::{mpsc, Arc, Mutex, OnceLock},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use client::Client;
use listener::{Listener, Signal};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

static SERVICE: OnceLock<Arc<Service>> = OnceLock::new();
const MAIN_WINDOW_LABEL: &str = "main";
const CHANGED_EVENT: &str = "office-im-changed";
/// Clients keep flashing until read; a new reminder needs this much quiet first.
const FLASH_QUIET_MS: u64 = 4_000;
/// How often the shell hook's queued messages are handled. A taskbar flash is not urgent; waking
/// 12 times a second for it, as before, kept the thread busy for nothing.
const SHELL_POLL: Duration = Duration::from_millis(250);

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientState {
    enabled: bool,
    /// `disabled` / `listening` / `error`.
    status: &'static str,
    pending: bool,
    last_attention_at: Option<u64>,
    error: Option<String>,
    #[serde(skip)]
    last_flash_at: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficeImSnapshot {
    revision: u64,
    dingtalk: ClientState,
    feishu: ClientState,
    wecom: ClientState,
}

impl OfficeImSnapshot {
    fn client(&mut self, client: Client) -> &mut ClientState {
        match client {
            Client::Dingtalk => &mut self.dingtalk,
            Client::Feishu => &mut self.feishu,
            Client::Wecom => &mut self.wecom,
        }
    }

    fn any_enabled(&self) -> bool {
        self.dingtalk.enabled || self.feishu.enabled || self.wecom.enabled
    }

    /// Applies a shell signal; returns whether anything the island shows changed.
    fn apply(&mut self, signal: Signal, now: u64) -> bool {
        let (client, attention) = match signal {
            Signal::Attention(client) => (client, true),
            Signal::Activated(client) => (client, false),
        };
        let state = self.client(client);
        if !state.enabled {
            return false;
        }
        let changed = if attention {
            let quiet = now.saturating_sub(state.last_flash_at) >= FLASH_QUIET_MS;
            state.last_flash_at = now;
            if quiet || !state.pending {
                state.pending = true;
                state.last_attention_at = Some(now);
                true
            } else {
                false
            }
        } else {
            std::mem::replace(&mut state.pending, false)
        };
        if changed {
            self.revision += 1;
        }
        changed
    }

    fn set_status(&mut self, error: Option<String>) -> bool {
        let mut changed = false;
        for client in Client::ALL {
            let state = self.client(client);
            let status = match (state.enabled, &error) {
                (false, _) => "disabled",
                (true, Some(_)) => "error",
                (true, None) => "listening",
            };
            let next_error = if state.enabled { error.clone() } else { None };
            if state.status != status || state.error != next_error {
                state.status = status;
                state.error = next_error;
                changed = true;
            }
        }
        if changed {
            self.revision += 1;
        }
        changed
    }
}

struct Service {
    app: AppHandle,
    state: Mutex<OfficeImSnapshot>,
    wake: mpsc::SyncSender<()>,
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    if SERVICE.get().is_some() {
        return Ok(());
    }
    let (wake, receiver) = mpsc::sync_channel(1);
    let mut snapshot = OfficeImSnapshot::default();
    snapshot.set_status(None);
    let service = Arc::new(Service { app: app.clone(), state: Mutex::new(snapshot), wake });
    let worker = service.clone();
    thread::Builder::new()
        .name("office-im".into())
        .spawn(move || monitor(worker, receiver))
        .map_err(|error| format!("无法启动办公消息提醒：{error}"))?;
    SERVICE.set(service).map_err(|_| "办公消息提醒已启动。".to_string())
}

fn service() -> Result<&'static Arc<Service>, String> {
    SERVICE.get().ok_or_else(|| "办公消息提醒尚未就绪。".into())
}

fn publish(service: &Service, snapshot: &OfficeImSnapshot) {
    let _ = service.app.emit_to(MAIN_WINDOW_LABEL, CHANGED_EVENT, snapshot);
    let _ = service.app.emit_to(crate::settings_window::WINDOW_LABEL, CHANGED_EVENT, snapshot);
}

fn update(service: &Service, change: impl FnOnce(&mut OfficeImSnapshot) -> bool) -> Result<OfficeImSnapshot, String> {
    let snapshot = {
        let mut state = service.state.lock().map_err(|_| "办公消息提醒状态不可用。")?;
        if !change(&mut state) {
            return Ok(state.clone());
        }
        state.clone()
    };
    publish(service, &snapshot);
    Ok(snapshot)
}

fn parse_client(client: &str) -> Result<Client, String> {
    match client {
        "dingtalk" => Ok(Client::Dingtalk),
        "feishu" => Ok(Client::Feishu),
        "wecom" => Ok(Client::Wecom),
        _ => Err(format!("未知的办公软件：{client}")),
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

#[tauri::command]
pub fn get_office_im_state() -> Result<OfficeImSnapshot, String> {
    service()?.state.lock().map(|state| state.clone()).map_err(|_| "办公消息提醒状态不可用。".into())
}

#[tauri::command]
pub fn set_office_im_enabled(client: String, enabled: bool) -> Result<OfficeImSnapshot, String> {
    let client = parse_client(&client)?;
    let service = service()?;
    let snapshot = update(service, |state| {
        let entry = state.client(client);
        if entry.enabled == enabled {
            return false;
        }
        entry.enabled = enabled;
        entry.pending &= enabled;
        entry.status = if enabled { "listening" } else { "disabled" };
        entry.error = None;
        state.revision += 1;
        true
    })?;
    let _ = service.wake.try_send(());
    Ok(snapshot)
}

#[tauri::command]
pub fn clear_office_im(client: String) -> Result<OfficeImSnapshot, String> {
    let client = parse_client(&client)?;
    update(service()?, |state| {
        let cleared = std::mem::replace(&mut state.client(client).pending, false);
        if cleared {
            state.revision += 1;
        }
        cleared
    })
}

#[tauri::command]
pub async fn open_office_im(client: String) -> Result<(), String> {
    let client = parse_client(&client)?;
    if let Ok(service) = service() {
        let _ = update(service, |state| {
            let cleared = std::mem::replace(&mut state.client(client).pending, false);
            if cleared {
                state.revision += 1;
            }
            cleared
        });
    }
    tauri::async_runtime::spawn_blocking(move || desktop::open(client))
        .await
        .map_err(|error| error.to_string())?
}

fn monitor(service: Arc<Service>, receiver: mpsc::Receiver<()>) {
    loop {
        let enabled = service.state.lock().is_ok_and(|state| state.any_enabled());
        if !enabled {
            if receiver.recv().is_err() {
                return;
            }
            continue;
        }
        let (send, signals) = mpsc::channel();
        match Listener::new(move |signal| {
            let _ = send.send(signal);
        }) {
            Ok(listener) => {
                let _ = update(&service, |state| state.set_status(None));
                while service.state.lock().is_ok_and(|state| state.any_enabled()) {
                    listener.poll();
                    for signal in signals.try_iter() {
                        let _ = update(&service, |state| state.apply(signal, now_ms()));
                    }
                    if receiver.recv_timeout(SHELL_POLL) == Err(mpsc::RecvTimeoutError::Disconnected) {
                        return;
                    }
                }
            }
            Err(error) => {
                let _ = update(&service, |state| state.set_status(Some(error.clone())));
                if receiver.recv_timeout(Duration::from_secs(5)) == Err(mpsc::RecvTimeoutError::Disconnected) {
                    return;
                }
            }
        }
    }
}

macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::office_im::get_office_im_state,
            crate::office_im::set_office_im_enabled,
            crate::office_im::clear_office_im,
            crate::office_im::open_office_im,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;

#[cfg(test)]
mod tests {
    use super::*;

    fn enabled(client: Client) -> OfficeImSnapshot {
        let mut snapshot = OfficeImSnapshot::default();
        snapshot.client(client).enabled = true;
        snapshot
    }

    #[test]
    fn a_flash_is_one_reminder_until_the_client_goes_quiet() {
        let mut snapshot = enabled(Client::Dingtalk);
        assert!(snapshot.apply(Signal::Attention(Client::Dingtalk), 10_000));
        assert!(!snapshot.apply(Signal::Attention(Client::Dingtalk), 11_000), "a burst of flashes is one reminder");
        assert!(snapshot.apply(Signal::Attention(Client::Dingtalk), 20_000), "after a quiet spell it is a new one");
        assert_eq!(snapshot.dingtalk.last_attention_at, Some(20_000));
        assert!(snapshot.apply(Signal::Activated(Client::Dingtalk), 21_000));
        assert!(!snapshot.dingtalk.pending);
    }

    #[test]
    fn switched_off_clients_are_ignored() {
        let mut snapshot = enabled(Client::Feishu);
        assert!(!snapshot.apply(Signal::Attention(Client::Wecom), 1_000));
        assert!(!snapshot.wecom.pending);
        snapshot.set_status(Some("boom".into()));
        assert_eq!((snapshot.feishu.status, snapshot.wecom.status), ("error", "disabled"));
    }
}
