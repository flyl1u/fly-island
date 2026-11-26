mod activation;

use serde::Serialize;
use std::{
    collections::HashSet,
    process::Command,
    sync::{mpsc, Mutex},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;
use windows::UI::Notifications::{
    KnownNotificationBindings,
    Management::{UserNotificationListener, UserNotificationListenerAccessStatus},
    NotificationKinds, UserNotification,
};

const EVENT_NAME: &str = "telegram-notifications-changed";
const POLL_INTERVAL: Duration = Duration::from_secs(1);
const MAX_ITEMS: usize = 50;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
struct ToastId {
    app_id: String,
    windows_id: u32,
    ticks: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct Notice {
    #[serde(skip)]
    target: ToastId,
    id: String,
    title: String,
    body: String,
    created_at: i64,
}

#[derive(Clone, Copy, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
enum Status {
    #[default]
    Disabled,
    Waiting,
    Listening,
    PermissionRequired,
    PermissionDenied,
    Error,
}

#[derive(Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    revision: u64,
    enabled: bool,
    status: Status,
    error: Option<String>,
    items: Vec<Notice>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NotificationEvent {
    snapshot: Snapshot,
    newest_id: Option<String>,
}

#[derive(Default)]
struct MonitorState {
    snapshot: Snapshot,
    generation: u64,
    previous: Option<HashSet<ToastId>>,
    opening: HashSet<ToastId>,
}

pub struct Service {
    state: Mutex<MonitorState>,
    wake: mpsc::SyncSender<()>,
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    let (wake, receiver) = mpsc::sync_channel(1);
    app.manage(Service {
        state: Mutex::new(MonitorState::default()),
        wake,
    });
    let app = app.clone();
    thread::Builder::new()
        .name("telegram-notifications".into())
        .spawn(move || monitor(app, receiver))
        .map_err(|error| format!("Cannot start Telegram notification listener: {error}"))?;
    Ok(())
}

fn publish(app: &AppHandle, snapshot: Snapshot, newest_id: Option<String>) {
    let event = NotificationEvent {
        snapshot,
        newest_id,
    };
    let _ = app.emit_to(
        crate::settings_window::WINDOW_LABEL,
        EVENT_NAME,
        event.clone(),
    );
    let _ = app.emit_to("main", EVENT_NAME, event);
}

#[tauri::command]
pub fn get_telegram_notification_state(service: State<'_, Service>) -> Result<Snapshot, String> {
    Ok(service
        .state
        .lock()
        .map_err(|error| error.to_string())?
        .snapshot
        .clone())
}

#[tauri::command]
pub fn set_telegram_notifications_enabled(
    app: AppHandle,
    service: State<'_, Service>,
    enabled: bool,
) -> Result<Snapshot, String> {
    let snapshot = {
        let mut state = service.state.lock().map_err(|error| error.to_string())?;
        if state.snapshot.enabled == enabled {
            return Ok(state.snapshot.clone());
        }
        state.generation += 1;
        state.previous = None;
        state.snapshot = Snapshot {
            revision: state.snapshot.revision + 1,
            enabled,
            status: if enabled {
                Status::Waiting
            } else {
                Status::Disabled
            },
            ..Snapshot::default()
        };
        state.snapshot.clone()
    };
    publish(&app, snapshot.clone(), None);
    let _ = service.wake.try_send(());
    Ok(snapshot)
}

#[tauri::command]
pub async fn open_telegram_notification(app: AppHandle, id: String) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let service = app.state::<Service>();
        let target = {
            let mut state = service.state.lock().map_err(|error| error.to_string())?;
            let target = state
                .snapshot
                .items
                .iter()
                .find(|item| item.id == id)
                .ok_or("This Telegram notification has expired.")?
                .target
                .clone();
            if !state.opening.insert(target.clone()) {
                return Err("This Telegram notification is already opening.".into());
            }
            target
        };
        let result = activation::open(&target);
        let snapshot = {
            let mut state = service.state.lock().map_err(|error| error.to_string())?;
            state.opening.remove(&target);
            result?;
            state.snapshot.items.retain(|item| item.target != target);
            state.snapshot.revision += 1;
            state.snapshot.clone()
        };
        publish(&app, snapshot.clone(), None);
        Ok(snapshot)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn open_telegram() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        if let Some(executable) = crate::win32::process::running_executable(&["Telegram.exe"]) {
            Command::new(executable)
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("Cannot open TG: {error}"))
        } else if crate::win32::shell_open::open_url_without_ui("tg://") {
            Ok(())
        } else {
            Err("Cannot find TG Desktop or its tg: protocol handler.".into())
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

fn monitor(app: AppHandle, receiver: mpsc::Receiver<()>) {
    let service = app.state::<Service>();
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
        let result = read_toasts();
        let change = {
            let Ok(mut state) = service.state.lock() else {
                return;
            };
            if state.generation != generation {
                continue;
            }
            state.update(result)
        };
        if let Some((snapshot, newest_id)) = change {
            let visible = app
                .get_webview_window("main")
                .is_some_and(|window| window.is_visible().unwrap_or(false));
            publish(&app, snapshot, newest_id.filter(|_| visible));
        }
        if receiver.recv_timeout(POLL_INTERVAL) == Err(mpsc::RecvTimeoutError::Disconnected) {
            return;
        }
    }
}

impl MonitorState {
    fn update(
        &mut self,
        result: Result<(Status, Vec<Notice>), String>,
    ) -> Option<(Snapshot, Option<String>)> {
        let before = self.snapshot.clone();
        let mut newest_id = None;
        match result {
            Ok((Status::Listening, mut items)) => {
                self.snapshot.status = Status::Listening;
                self.snapshot.error = None;
                let current: HashSet<_> = items.iter().map(|item| item.target.clone()).collect();
                self.snapshot
                    .items
                    .retain(|item| current.contains(&item.target));
                let previous = self.previous.replace(current);
                if let Some(previous) = &previous {
                    items.retain(|item| !previous.contains(&item.target));
                }
                self.snapshot.items.extend(items);
                self.snapshot.items.sort_unstable_by_key(|item| {
                    std::cmp::Reverse((item.target.ticks, item.target.windows_id))
                });
                self.snapshot.items.truncate(MAX_ITEMS);
                // Existing Action Center entries are available in the list on startup.
                if let Some(previous) = previous {
                    newest_id = self
                        .snapshot
                        .items
                        .iter()
                        .find(|item| !previous.contains(&item.target))
                        .map(|item| item.id.clone());
                }
            }
            Ok((status, _)) => {
                self.snapshot.status = status;
                self.snapshot.error = None;
                self.snapshot.items.clear();
                self.previous = None;
            }
            Err(error) => {
                self.snapshot.status = Status::Error;
                self.snapshot.error = Some(error);
            }
        }
        (self.snapshot != before).then(|| {
            self.snapshot.revision += 1;
            (self.snapshot.clone(), newest_id)
        })
    }
}

fn read_toasts() -> Result<(Status, Vec<Notice>), String> {
    let result = || -> windows::core::Result<_> {
        let _apartment = crate::win32::com::WinRtApartment::multithreaded()?;
        let listener = UserNotificationListener::Current()?;
        let status = match listener.GetAccessStatus()? {
            UserNotificationListenerAccessStatus::Allowed => Status::Listening,
            UserNotificationListenerAccessStatus::Denied => Status::PermissionDenied,
            _ => Status::PermissionRequired,
        };
        if status != Status::Listening {
            return Ok((status, Vec::new()));
        }
        let items = pollster::block_on(listener.GetNotificationsAsync(NotificationKinds::Toast)?)?
            .into_iter()
            .filter_map(|item| read_toast(&item).ok().flatten())
            .collect();
        Ok((status, items))
    };
    result().map_err(|error| format!("Cannot read Windows notifications: {error}"))
}

fn is_telegram_app_id(app_id: &str) -> bool {
    let app_id = app_id.to_ascii_lowercase();
    const DESKTOP: &str = "telegram.telegramdesktop";
    app_id == DESKTOP
        || app_id == "telegram.telegramdesktop.store"
        || app_id
            == "telegrammessengerllp.telegramdesktop_t4vj0pshhgkwm!telegram.telegramdesktop.store"
        || app_id
            .strip_prefix("telegram.telegramdesktop.")
            .is_some_and(|hash| {
                hash.len() == 32 && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
            })
}

fn read_toast(item: &UserNotification) -> windows::core::Result<Option<Notice>> {
    let app_id = item.AppInfo()?.AppUserModelId()?.to_string_lossy();
    if !is_telegram_app_id(&app_id) {
        return Ok(None);
    }
    let windows_id = item.Id()?;
    let ticks = item.CreationTime()?.UniversalTime;
    let elements = item
        .Notification()?
        .Visual()?
        .GetBinding(&KnownNotificationBindings::ToastGeneric()?)?
        .GetTextElements()?;
    let mut parts = elements.into_iter().filter_map(|part| part.Text().ok());
    let title = parts
        .next()
        .map_or_else(|| "Telegram".to_owned(), |text| text.to_string_lossy());
    let body = parts
        .map(|text| text.to_string_lossy())
        .collect::<Vec<_>>()
        .join("\n");
    Ok(Some(Notice {
        target: ToastId {
            app_id,
            windows_id,
            ticks,
        },
        id: format!("telegram:{windows_id}:{ticks}"),
        title: title.chars().take(120).collect(),
        body: body.chars().take(1000).collect(),
        created_at: ticks / 10_000 - 11_644_473_600_000,
    }))
}

#[tauri::command]
pub async fn request_telegram_notification_access(app: AppHandle) -> Result<(), String> {
    crate::win32::notification_access::request(&app).await?;
    let _ = app.state::<Service>().wake.try_send(());
    Ok(())
}

#[tauri::command]
pub fn open_telegram_notification_settings(app: AppHandle) -> Result<(), String> {
    app.opener()
        .open_url("ms-settings:privacy-notifications", None::<&str>)
        .map_err(|error| error.to_string())
}

macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::telegram_notifications::get_telegram_notification_state,
            crate::telegram_notifications::set_telegram_notifications_enabled,
            crate::telegram_notifications::open_telegram_notification,
            crate::telegram_notifications::open_telegram,
            crate::telegram_notifications::request_telegram_notification_access,
            crate::telegram_notifications::open_telegram_notification_settings,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;

#[cfg(test)]
mod tests {
    use super::*;

    fn notice(id: u32) -> Notice {
        Notice {
            target: ToastId {
                app_id: "Telegram.TelegramDesktop".into(),
                windows_id: id,
                ticks: i64::from(id),
            },
            id: id.to_string(),
            title: "Conversation".into(),
            body: "Test".into(),
            created_at: i64::from(id),
        }
    }

    #[test]
    fn old_toasts_do_not_pop_up_and_opened_toasts_stay_dismissed() {
        let mut state = MonitorState::default();
        let first = notice(1);
        let second = notice(2);
        let (_, newest) = state
            .update(Ok((Status::Listening, vec![first.clone()])))
            .unwrap();
        assert!(newest.is_none());
        assert_eq!(state.snapshot.items, std::slice::from_ref(&first));
        state.snapshot.items.clear();
        let (snapshot, newest) = state
            .update(Ok((Status::Listening, vec![first, second.clone()])))
            .unwrap();
        assert_eq!(newest.as_deref(), Some("2"));
        assert_eq!(snapshot.items, [second]);
        let (snapshot, _) = state.update(Ok((Status::Listening, Vec::new()))).unwrap();
        assert!(snapshot.items.is_empty());
    }

    #[test]
    fn recognizes_only_official_telegram_notification_ids() {
        for id in [
            "Telegram.TelegramDesktop",
            "Telegram.TelegramDesktop.d5ad86eef21b94ddb70b5e36e9dcd9df",
            "Telegram.TelegramDesktop.Store",
            "TelegramMessengerLLP.TelegramDesktop_t4vj0pshhgkwm!Telegram.TelegramDesktop.Store",
        ] {
            assert!(is_telegram_app_id(id));
        }
        assert!(!is_telegram_app_id("Telegram.TelegramDesktop.Unrelated"));
        assert!(!is_telegram_app_id("Some.OtherTelegram"));
    }
}
