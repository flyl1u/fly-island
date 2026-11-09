use serde_json::{json, Value};
use std::{
    collections::HashSet,
    env,
    process::ExitCode,
    thread,
    time::{Duration, Instant},
};
use windows::{
    core::{Error, HSTRING},
    Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
    UI::Notifications::{
        KnownNotificationBindings,
        Management::{UserNotificationListener, UserNotificationListenerAccessStatus},
        NotificationKinds, NotificationSetting, ToastNotificationManager,
    },
};

const QQ_APP_ID: &str = "QQ";

#[derive(Default)]
struct Observation {
    ids: HashSet<(u32, i64)>,
    readable_ids: HashSet<(u32, i64)>,
    metadata_errors: usize,
    text_errors: usize,
}

fn main() -> ExitCode {
    match run() {
        Ok(verified) => {
            if verified {
                ExitCode::SUCCESS
            } else {
                ExitCode::from(2)
            }
        }
        Err(error) => {
            println!("{}", json!({ "result": "error", "error": error }));
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<bool, String> {
    let watch_seconds = parse_watch_seconds()?;
    // SAFETY: RoInitialize takes no pointers; a success is paired with the
    // RoUninitialize below on this thread.
    unsafe { RoInitialize(RO_INIT_MULTITHREADED) }
        .map_err(|error| describe_error("initialize_winrt", error))?;
    let result = observe(watch_seconds);
    // SAFETY: pairs the successful RoInitialize above, on the same thread.
    unsafe { RoUninitialize() };
    result
}

fn parse_watch_seconds() -> Result<u64, String> {
    let args: Vec<String> = env::args().skip(1).collect();
    match args.as_slice() {
        [] => Ok(30),
        [flag, value] if flag == "--watch-seconds" => value
            .parse::<u64>()
            .ok()
            .filter(|seconds| *seconds <= 300)
            .ok_or_else(|| "--watch-seconds must be an integer between 0 and 300".to_string()),
        _ => Err("Usage: qq_notification_probe [--watch-seconds 0..300]".to_string()),
    }
}

fn observe(watch_seconds: u64) -> Result<bool, String> {
    let listener = UserNotificationListener::Current()
        .map_err(|error| describe_error("create_listener", error))?;
    let access = listener
        .GetAccessStatus()
        .map_err(|error| describe_error("read_access_status", error))?;
    println!(
        "{}",
        json!({
            "phase": "initial",
            "qqAppId": QQ_APP_ID,
            "access": access_label(access),
            "qqNotificationSetting": qq_notification_setting(),
            "watchSeconds": watch_seconds,
        })
    );
    if access != UserNotificationListenerAccessStatus::Allowed {
        println!("{}", json!({ "result": "access_unavailable" }));
        return Ok(false);
    }

    let baseline = read_qq_notifications(&listener)?;
    let mut observed = Observation::default();
    let deadline = Instant::now() + Duration::from_secs(watch_seconds);
    while Instant::now() < deadline {
        thread::sleep(
            Duration::from_secs(1).min(deadline.saturating_duration_since(Instant::now())),
        );
        let access = listener
            .GetAccessStatus()
            .map_err(|error| describe_error("read_access_status", error))?;
        if access != UserNotificationListenerAccessStatus::Allowed {
            println!(
                "{}",
                json!({ "result": "access_changed", "access": access_label(access) })
            );
            return Ok(false);
        }
        let current = read_qq_notifications(&listener)?;
        observed.ids.extend(current.ids.difference(&baseline.ids));
        observed
            .readable_ids
            .extend(current.readable_ids.difference(&baseline.ids));
        observed.metadata_errors += current.metadata_errors;
        observed.text_errors += current.text_errors;
    }
    let verified = !observed.readable_ids.is_empty();
    println!(
        "{}",
        json!({
            "result": if verified { "qq_notification_observed" } else { "not_verified" },
            "baselineQQNotifications": baseline.ids.len(),
            "baselineReadableQQNotifications": baseline.readable_ids.len(),
            "newQQNotifications": observed.ids.len(),
            "newReadableQQNotifications": observed.readable_ids.len(),
            "metadataErrors": baseline.metadata_errors + observed.metadata_errors,
            "textErrors": baseline.text_errors + observed.text_errors,
        })
    );
    Ok(verified)
}

fn read_qq_notifications(listener: &UserNotificationListener) -> Result<Observation, String> {
    let operation = listener
        .GetNotificationsAsync(NotificationKinds::Toast)
        .map_err(|error| describe_error("start_read_notifications", error))?;
    let notifications = pollster::block_on(operation)
        .map_err(|error| describe_error("read_notifications", error))?;
    let mut observation = Observation::default();
    for notification in notifications {
        let app_id = notification.AppInfo().and_then(|app| app.AppUserModelId());
        match app_id {
            Ok(app_id) if app_id == QQ_APP_ID => {}
            Ok(_) => continue,
            Err(_) => {
                observation.metadata_errors += 1;
                continue;
            }
        }
        let identity = notification.Id().and_then(|id| {
            notification
                .CreationTime()
                .map(|created_at| (id, created_at.UniversalTime))
        });
        let identity = match identity {
            Ok(identity) => identity,
            Err(_) => {
                observation.metadata_errors += 1;
                continue;
            }
        };
        observation.ids.insert(identity);
        let text = notification
            .Notification()
            .and_then(|notification| notification.Visual())
            .and_then(|visual| visual.GetBinding(&KnownNotificationBindings::ToastGeneric()?))
            .and_then(|binding| binding.GetTextElements());
        let mut parts = Vec::new();
        match text {
            Ok(elements) => {
                for element in elements {
                    match element.Text() {
                        Ok(text) if !text.to_string_lossy().trim().is_empty() => {
                            parts.push(text.to_string_lossy());
                            observation.readable_ids.insert(identity);
                        }
                        Ok(_) => {}
                        Err(_) => observation.text_errors += 1,
                    }
                }
            }
            Err(_) => observation.text_errors += 1,
        }
        let diagnostic = parts
            .first()
            .is_some_and(|title| title == "FocuSD QQ 通知诊断")
            && parts
                .iter()
                .any(|body| body == "这是本机通道测试，不是聊天消息。")
            || parts
                .first()
                .is_some_and(|title| title == "FocuSD QQ notification diagnostic")
                && parts
                    .iter()
                    .any(|body| body == "Local channel test; this is not a chat message.");
        if diagnostic {
            observation.ids.remove(&identity);
            observation.readable_ids.remove(&identity);
        }
    }
    Ok(observation)
}

fn qq_notification_setting() -> Value {
    let notifier =
        match ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(QQ_APP_ID)) {
            Ok(notifier) => notifier,
            Err(error) => {
                return json!({ "error": describe_error("create_qq_notifier", error) });
            }
        };
    match notifier.Setting() {
        Ok(setting) => json!({ "status": notification_setting_label(setting) }),
        Err(error) => json!({ "error": describe_error("read_qq_notification_setting", error) }),
    }
}

fn access_label(access: UserNotificationListenerAccessStatus) -> &'static str {
    match access {
        UserNotificationListenerAccessStatus::Allowed => "allowed",
        UserNotificationListenerAccessStatus::Denied => "denied",
        UserNotificationListenerAccessStatus::Unspecified => "unspecified",
        _ => "unknown",
    }
}

fn notification_setting_label(setting: NotificationSetting) -> &'static str {
    match setting {
        NotificationSetting::Enabled => "enabled",
        NotificationSetting::DisabledForApplication => "disabled_for_application",
        NotificationSetting::DisabledForUser => "disabled_for_user",
        NotificationSetting::DisabledByGroupPolicy => "disabled_by_group_policy",
        NotificationSetting::DisabledByManifest => "disabled_by_manifest",
        _ => "unknown",
    }
}

fn describe_error(operation: &str, error: Error) -> String {
    format!("{operation}: {} ({})", error.code(), error.message())
}
