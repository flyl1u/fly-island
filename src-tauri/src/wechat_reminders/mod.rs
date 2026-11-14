//! WeChat reminders and optional chat previews from its accessible conversation list.

mod accessibility;
mod conversations;
mod launch;
mod preview_reader;
mod qt_accessibility_pattern;
mod source;

#[cfg(test)]
mod tests;

use crate::win32;
use conversations::ChatPreview;
use preview_reader::{PreviewReader, ReadOutcome};
use serde::Serialize;
use launch::restore_wechat;
use source::{ProcessIdentity, ReminderListener, ReminderSignal};
#[cfg(test)]
use source::{existing_wechat_windows, preferred_window, resolve_executable};
#[cfg(test)]
use windows::Win32::Foundation::HWND;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex, OnceLock,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};

static SERVICE: OnceLock<Arc<ReminderService>> = OnceLock::new();
const MAIN_WINDOW_LABEL: &str = "main";
const REMINDER_EVENT: &str = "wechat-reminder-changed";
const MAX_PREVIEWS: usize = 20;
const FLASH_QUIET_MS: u64 = 4_000;

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
enum PreviewStatus {
    #[default]
    Off,
    Waiting,
    Ready,
    Tray,
    Unsupported,
    Unavailable,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct MessagePreview {
    id: String,
    received_at: u64,
    #[serde(flatten)]
    chat: ChatPreview,
    #[serde(skip)]
    process: ProcessIdentity,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderSnapshot {
    revision: u64,
    enabled: bool,
    status: String,
    pending: bool,
    last_attention_at: Option<u64>,
    error: Option<String>,
    preview_enabled: bool,
    preview_status: PreviewStatus,
    hide_minimized_taskbar: bool,
    messages: Vec<MessagePreview>,
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
            preview_enabled: false,
            preview_status: PreviewStatus::Off,
            hide_minimized_taskbar: false,
            messages: Vec::new(),
        }
    }
}

#[derive(Default)]
struct ReminderState {
    snapshot: ReminderSnapshot,
    generation: u64,
    last_signal_at: Option<u64>,
}

impl ReminderState {
    fn clear(&mut self) {
        self.snapshot.pending = false;
        self.snapshot.messages.clear();
        self.snapshot.revision += 1;
    }

    /// Removes every preview of the conversation `message_id` belongs to (the same
    /// chat appears once per reminder) and keeps the other conversations. When the
    /// newest reminder was that chat's, the reminder counts as seen too, so no
    /// content-free "new reminder" card takes its place.
    fn dismiss_conversation(&mut self, message_id: &str) -> bool {
        let Some(key) = self
            .snapshot
            .messages
            .iter()
            .find(|message| message.id == message_id)
            .map(|message| message.chat.key.clone())
        else {
            return false;
        };
        let newest = self.snapshot.last_attention_at;
        let mut newest_removed = false;
        self.snapshot.messages.retain(|message| {
            let same = message.chat.key == key;
            newest_removed |= same && Some(message.received_at) == newest;
            !same
        });
        if newest_removed || self.snapshot.messages.is_empty() {
            self.snapshot.pending = false;
        }
        self.snapshot.revision += 1;
        true
    }

    fn set_enabled(&mut self, enabled: bool) -> bool {
        if self.snapshot.enabled == enabled {
            return false;
        }
        self.generation += 1;
        self.last_signal_at = None;
        self.snapshot = ReminderSnapshot {
            revision: self.snapshot.revision + 1,
            enabled,
            status: if enabled { "waiting" } else { "disabled" }.into(),
            preview_enabled: self.snapshot.preview_enabled,
            hide_minimized_taskbar: self.snapshot.hide_minimized_taskbar,
            preview_status: if enabled && self.snapshot.preview_enabled {
                PreviewStatus::Waiting
            } else {
                PreviewStatus::Off
            },
            ..Default::default()
        };
        true
    }

    fn set_preview_enabled(&mut self, enabled: bool) -> bool {
        if self.snapshot.preview_enabled == enabled {
            return false;
        }
        self.generation += 1;
        self.snapshot.revision += 1;
        self.snapshot.preview_enabled = enabled;
        self.snapshot.preview_status = if enabled && self.snapshot.enabled {
            PreviewStatus::Waiting
        } else {
            PreviewStatus::Off
        };
        self.snapshot.messages.clear();
        true
    }

    fn set_hide_minimized_taskbar(&mut self, hidden: bool) -> bool {
        if self.snapshot.hide_minimized_taskbar == hidden {
            return false;
        }
        self.snapshot.hide_minimized_taskbar = hidden;
        self.snapshot.revision += 1;
        true
    }

    fn receive_previews(
        &mut self,
        generation: u64,
        process: ProcessIdentity,
        chats: Vec<ChatPreview>,
        now: u64,
    ) -> bool {
        if !self.snapshot.enabled || !self.snapshot.preview_enabled || self.generation != generation
        {
            return false;
        }
        let received_at = now.max(
            self.snapshot
                .last_attention_at
                .unwrap_or_default()
                .saturating_add(1),
        );
        let current = chats
            .into_iter()
            .enumerate()
            .map(|(index, chat)| MessagePreview {
                id: format!("{received_at}-{index}"),
                received_at,
                chat,
                process,
            });
        self.snapshot.messages = current
            .chain(self.snapshot.messages.drain(..))
            .take(MAX_PREVIEWS)
            .collect();
        self.snapshot.pending = true;
        self.last_signal_at = Some(now);
        self.snapshot.last_attention_at = Some(received_at);
        self.snapshot.revision += 1;
        true
    }

    fn apply(&mut self, generation: u64, signal: ReminderSignal, now: u64) -> bool {
        if !self.snapshot.enabled || self.generation != generation {
            return false;
        }
        match signal {
            ReminderSignal::Attention => {
                let repeated = self
                    .last_signal_at
                    .replace(now)
                    .is_some_and(|last| now.saturating_sub(last) < FLASH_QUIET_MS);
                if self.snapshot.pending && repeated {
                    return false;
                }
                self.snapshot.pending = true;
                self.snapshot.last_attention_at = Some(
                    now.max(
                        self.snapshot
                            .last_attention_at
                            .unwrap_or_default()
                            .saturating_add(1),
                    ),
                );
            }
            ReminderSignal::Activated => {
                self.last_signal_at = None;
                if !self.snapshot.pending {
                    return false;
                }
                self.snapshot.pending = false;
            }
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
    stopping: AtomicBool,
    done: Mutex<mpsc::Receiver<()>>,
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    if SERVICE.get().is_some() {
        return Ok(());
    }
    let (wake, receiver) = mpsc::sync_channel(1);
    let (done, finished) = mpsc::channel();
    let service = Arc::new(ReminderService {
        app: app.clone(),
        state: Mutex::new(ReminderState::default()),
        wake,
        stopping: AtomicBool::new(false),
        done: Mutex::new(finished),
    });
    let worker = service.clone();
    thread::Builder::new()
        .name("wechat-reminders".into())
        .spawn(move || {
            monitor(worker, receiver);
            let _ = done.send(());
        })
        .map_err(|error| format!("无法启动微信提醒监听：{error}"))?;
    SERVICE
        .set(service)
        .map_err(|_| "微信提醒服务已启动。".to_string())
}

pub(crate) fn shutdown() {
    if let Some(service) = SERVICE.get() {
        service.stopping.store(true, Ordering::Release);
        let _ = service.wake.try_send(());
        if let Ok(done) = service.done.lock() {
            // A hard kill or blocked provider leaves the recovery marker for the next launch.
            let _ = done.recv_timeout(Duration::from_secs(2));
        }
    }
}

fn service() -> Result<&'static Arc<ReminderService>, String> {
    SERVICE.get().ok_or_else(|| "微信提醒服务尚未就绪。".into())
}

fn publish(service: &ReminderService, snapshot: ReminderSnapshot) {
    let visible = service
        .app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .is_some_and(|window| window.is_visible().unwrap_or(false));
    let mut preferences = snapshot.clone();
    preferences.messages.clear();
    let _ = service.app.emit_to(
        crate::settings_window::WINDOW_LABEL,
        REMINDER_EVENT,
        serde_json::json!({"snapshot": preferences, "windowVisible": visible}),
    );
    let _ = service.app.emit_to(
        MAIN_WINDOW_LABEL,
        REMINDER_EVENT,
        serde_json::json!({"snapshot": snapshot, "windowVisible": visible}),
    );
}

#[tauri::command]
pub fn get_wechat_reminder_state(window: tauri::WebviewWindow) -> Result<ReminderSnapshot, String> {
    let mut snapshot = service()?
        .state
        .lock()
        .map_err(|_| "微信提醒状态不可用。")?
        .snapshot
        .clone();
    if window.label() != MAIN_WINDOW_LABEL {
        snapshot.messages.clear();
    }
    Ok(snapshot)
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
pub fn clear_wechat_reminders() -> Result<ReminderSnapshot, String> {
    configure(|state| {
        state.clear();
        true
    })
}

/// Opening one conversation reads all of its previews; the other chats stay.
#[tauri::command]
pub fn dismiss_wechat_conversation(message_id: String) -> Result<ReminderSnapshot, String> {
    configure(|state| state.dismiss_conversation(&message_id))
}

#[tauri::command]
pub fn set_wechat_reminders_enabled(
    enabled: bool,
    preview_enabled: Option<bool>,
    hide_minimized_taskbar: Option<bool>,
) -> Result<ReminderSnapshot, String> {
    configure(|state| {
        let enabled_changed = state.set_enabled(enabled);
        let preview_changed =
            preview_enabled.is_some_and(|enabled| state.set_preview_enabled(enabled));
        let taskbar_changed =
            hide_minimized_taskbar.is_some_and(|hidden| state.set_hide_minimized_taskbar(hidden));
        enabled_changed || preview_changed || taskbar_changed
    })
}

#[tauri::command]
pub fn set_wechat_message_preview_enabled(enabled: bool) -> Result<ReminderSnapshot, String> {
    configure(|state| state.set_preview_enabled(enabled))
}

#[tauri::command]
pub fn set_wechat_minimized_taskbar_hidden(hidden: bool) -> Result<ReminderSnapshot, String> {
    configure(|state| state.set_hide_minimized_taskbar(hidden))
}

fn configure(change: impl FnOnce(&mut ReminderState) -> bool) -> Result<ReminderSnapshot, String> {
    let service = service()?;
    let (snapshot, changed) = {
        let mut state = service.state.lock().map_err(|_| "微信提醒状态不可用。")?;
        let changed = change(&mut state);
        (state.snapshot.clone(), changed)
    };
    if changed {
        publish(service, snapshot.clone());
        let _ = service.wake.try_send(());
    }
    Ok(snapshot)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn signal(service: &ReminderService, generation: u64, event: ReminderSignal) {
    update(service, |state| state.apply(generation, event, now_ms()));
}

fn update(service: &ReminderService, change: impl FnOnce(&mut ReminderState) -> bool) {
    let snapshot = {
        let Ok(mut state) = service.state.lock() else {
            return;
        };
        if !change(&mut state) {
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
    let marker = service
        .app
        .path()
        .app_data_dir()
        .ok()
        .map(|path| path.join("wechat-accessibility.json"));
    if let Some(marker) = marker.as_deref().filter(|path| path.is_file()) {
        accessibility::recover(marker);
    }
    while !service.stopping.load(Ordering::Acquire) {
        let (enabled, generation, preview_enabled) = match service.state.lock() {
            Ok(state) => (
                state.snapshot.enabled,
                state.generation,
                state.snapshot.preview_enabled,
            ),
            Err(_) => return,
        };
        if !enabled {
            if receiver.recv().is_err() {
                return;
            }
            continue;
        }
        let (send_signal, signals) = mpsc::channel();
        let listener = ReminderListener::new(None, move |event| {
            if matches!(
                event,
                ReminderSignal::Attention
                    | ReminderSignal::Activated
                    | ReminderSignal::ActivatedElsewhere
            ) {
                let _ = send_signal.send(event);
            }
        });
        match listener {
            Ok(listener) => {
                connection(&service, generation, None);
                let still_listening = || {
                    !service.stopping.load(Ordering::Acquire)
                        && service.state.lock().is_ok_and(|state| {
                            state.snapshot.enabled && state.generation == generation
                        })
                };
                let mut reader = preview_enabled.then(|| PreviewReader::new(Instant::now()));
                while still_listening() {
                    listener.poll();
                    let _ = listener.stats();
                    for event in signals.try_iter() {
                        match (&mut reader, event) {
                            (Some(reader), ReminderSignal::Attention) => {
                                reader.attention(Instant::now())
                            }
                            (Some(reader), ReminderSignal::Activated) => {
                                reader.focus(true, Instant::now());
                                signal(&service, generation, event);
                            }
                            (Some(reader), ReminderSignal::ActivatedElsewhere) => {
                                reader.focus(false, Instant::now())
                            }
                            _ => signal(&service, generation, event),
                        }
                    }
                    if let Some(reader) = &mut reader {
                        let hide_minimized_taskbar = service.state.lock().is_ok_and(|state| {
                            state.generation == generation && state.snapshot.hide_minimized_taskbar
                        });
                        let previews = reader.tick(
                            Instant::now(),
                            marker.as_deref(),
                            hide_minimized_taskbar,
                            still_listening,
                        );
                        update(&service, |state| {
                            if state.generation != generation {
                                return false;
                            }
                            let status_changed = state.snapshot.preview_status != reader.status;
                            if status_changed {
                                state.snapshot.preview_status = reader.status;
                                state.snapshot.revision += 1;
                            }
                            let received = match previews {
                                Some(ReadOutcome::Plain) => {
                                    state.apply(generation, ReminderSignal::Attention, now_ms())
                                }
                                Some(ReadOutcome::Messages(process, chats)) => {
                                    state.receive_previews(generation, process, chats, now_ms())
                                }
                                None => false,
                            };
                            status_changed || received
                        });
                    }
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
        if restore_wechat(None)?.is_some() {
            return Ok(());
        }
        launch::launch_installed()
    })
    .await
    .map_err(|error| format!("打开微信的线程失败：{error}"))?
}

#[tauri::command]
pub async fn open_wechat_conversation(message_id: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let service = service()?;
        let conversation = {
            let state = service.state.lock().map_err(|_| "微信提醒状态不可用。")?;
            state
                .snapshot
                .messages
                .iter()
                .find(|message| message.id == message_id)
                .map(|message| (state.generation, message.process, message.chat.key.clone()))
        };
        let process = conversation.as_ref().map(|(_, process, _)| *process);
        let Some(window) = restore_wechat(process)? else {
            if process.is_some() && restore_wechat(None)?.is_some() {
                return Ok(false);
            }
            // Not running: start it; the conversation cannot be located yet.
            launch::launch_installed()?;
            return Ok(false);
        };
        let Some((generation, process, key)) = conversation else {
            return Ok(false);
        };
        let still_allowed = || {
            service.state.lock().is_ok_and(|state| {
                state.generation == generation
                    && state.snapshot.enabled
                    && state.snapshot.preview_enabled
            })
        };
        let id = format!("{}{key}", conversations::SESSION_PREFIX);
        for _ in 0..5 {
            if !still_allowed()
                || win32::process::window_process_id(window) != process.pid
                || win32::process_times::start_time(process.pid) != Some(process.started_at)
            {
                break;
            }
            if win32::uia_list::click_list_row(window, &id, still_allowed) {
                return Ok(true);
            }
            thread::sleep(Duration::from_millis(180));
        }
        Ok(false)
    })
    .await
    .map_err(|error| format!("打开微信会话的线程失败：{error}"))?
}

/// This module's Tauri commands. `lib.rs` chains every module's list into one
/// `generate_handler!`, so adding a command only touches this file.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::wechat_reminders::get_wechat_reminder_state,
            crate::wechat_reminders::clear_wechat_reminders,
            crate::wechat_reminders::dismiss_wechat_conversation,
            crate::wechat_reminders::set_wechat_reminders_enabled,
            crate::wechat_reminders::set_wechat_message_preview_enabled,
            crate::wechat_reminders::set_wechat_minimized_taskbar_hidden,
            crate::wechat_reminders::open_wechat,
            crate::wechat_reminders::open_wechat_conversation,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
