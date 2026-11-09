use serde::Serialize;
use serde_json::json;
use std::{
    collections::HashSet,
    process::ExitCode,
    thread,
    time::{Duration, Instant},
};
use windows::{
    Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
    UI::Notifications::{
        KnownNotificationBindings,
        Management::{UserNotificationListener, UserNotificationListenerAccessStatus},
        NotificationKinds,
    },
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NotificationSummary {
    id: u32,
    app_id: String,
    text_elements: usize,
    text_characters: usize,
    has_body: bool,
}

fn main() -> ExitCode {
    match run() {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::from(2),
        Err(error) => {
            println!("{}", json!({"result": "error", "error": error}));
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<bool, String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let seconds = match args.as_slice() {
        [] => 0,
        [flag, value] if flag == "--watch-seconds" => value
            .parse::<u64>()
            .ok()
            .filter(|seconds| *seconds <= 60)
            .ok_or("--watch-seconds must be between 0 and 60")?,
        _ => return Err("Usage: wechat_notification_probe [--watch-seconds 0..60]".into()),
    };
    // SAFETY: RoInitialize takes no pointers; a success is paired with the
    // RoUninitialize below on this thread.
    unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.map_err(|error| error.to_string())?;
    let result = observe(seconds);
    // SAFETY: pairs the successful RoInitialize above, on the same thread.
    unsafe { RoUninitialize() };
    result
}

fn observe(seconds: u64) -> Result<bool, String> {
    let listener = UserNotificationListener::Current().map_err(|error| error.to_string())?;
    let access = listener
        .GetAccessStatus()
        .map_err(|error| error.to_string())?;
    if access != UserNotificationListenerAccessStatus::Allowed {
        println!(
            "{}",
            json!({"result": "access_unavailable", "access": access.0})
        );
        return Ok(false);
    }
    let baseline = read(&listener)?;
    let baseline_ids: HashSet<u32> = baseline.iter().map(|item| item.id).collect();
    println!(
        "{}",
        json!({"phase": "baseline", "wechatNotifications": baseline, "watchSeconds": seconds})
    );
    let deadline = Instant::now() + Duration::from_secs(seconds);
    let mut readable = baseline.iter().any(|item| item.has_body);
    let mut new_ids = HashSet::new();
    while Instant::now() < deadline {
        thread::sleep(
            Duration::from_secs(1).min(deadline.saturating_duration_since(Instant::now())),
        );
        for item in read(&listener)? {
            readable |= item.has_body;
            if !baseline_ids.contains(&item.id) && new_ids.insert(item.id) {
                println!("{}", json!({"phase": "arrival", "notification": item}));
            }
        }
    }
    println!(
        "{}",
        json!({"result": if readable { "wechat_notification_body_available" } else { "not_verified" }, "newWeChatNotifications": new_ids.len()})
    );
    Ok(readable)
}

fn read(listener: &UserNotificationListener) -> Result<Vec<NotificationSummary>, String> {
    if listener
        .GetAccessStatus()
        .map_err(|error| error.to_string())?
        != UserNotificationListenerAccessStatus::Allowed
    {
        return Err("Windows notification access is unavailable.".into());
    }
    let operation = listener
        .GetNotificationsAsync(NotificationKinds::Toast)
        .map_err(|error| error.to_string())?;
    let notifications = pollster::block_on(operation).map_err(|error| error.to_string())?;
    let mut summaries = Vec::new();
    for notification in notifications {
        let Ok(app) = notification.AppInfo() else {
            continue;
        };
        let Ok(app_id) = app.AppUserModelId() else {
            continue;
        };
        let app_id = app_id.to_string_lossy();
        let display_name = app
            .DisplayInfo()
            .and_then(|info| info.DisplayName())
            .map(|name| name.to_string_lossy())
            .unwrap_or_default();
        let lower = app_id.to_ascii_lowercase();
        if !lower.contains("wechat") && !lower.contains("weixin") && !display_name.contains("微信")
        {
            continue;
        }
        let Ok(id) = notification.Id() else { continue };
        let text = notification
            .Notification()
            .and_then(|item| item.Visual())
            .and_then(|visual| visual.GetBinding(&KnownNotificationBindings::ToastGeneric()?))
            .and_then(|binding| binding.GetTextElements());
        let mut lengths = Vec::new();
        if let Ok(elements) = text {
            for element in elements {
                if let Ok(text) = element.Text() {
                    let length = text.to_string_lossy().trim().chars().count();
                    if length > 0 {
                        lengths.push(length);
                    }
                }
            }
        }
        summaries.push(NotificationSummary {
            id,
            app_id,
            text_elements: lengths.len(),
            text_characters: lengths.iter().sum(),
            has_body: lengths.len() > 1,
        });
    }
    Ok(summaries)
}
