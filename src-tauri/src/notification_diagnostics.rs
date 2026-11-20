use crate::{legacy_migration, qq_notifications, wechat_reminders};
use serde_json::{json, Value};
use std::{
    fs, thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

pub fn verification_identifier() -> Option<String> {
    if legacy_migration::env("FLY_ISLAND_VERIFY_NOTIFICATIONS").as_deref() != Some("1") {
        return None;
    }
    let run_id = legacy_migration::env("FLY_ISLAND_NOTIFICATION_VERIFICATION_ID")?;
    if run_id.len() != 32 || !run_id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    Some(format!("com.flyisland.app.verification.{run_id}"))
}

pub fn start(app: &AppHandle) -> Result<(), String> {
    if legacy_migration::env("FLY_ISLAND_VERIFY_NOTIFICATIONS").as_deref() != Some("1") {
        return Ok(());
    }
    let identifier =
        verification_identifier().ok_or("通知验收必须提供独立的 32 位十六进制运行标识。")?;
    if app.config().identifier != identifier {
        return Err("通知验收未隔离应用数据目录。".into());
    }
    let run_id = legacy_migration::env("FLY_ISLAND_NOTIFICATION_VERIFICATION_ID")
        .ok_or("缺少通知验收运行标识。".to_string())?;
    let seconds = legacy_migration::env("FLY_ISLAND_VERIFY_NOTIFICATION_SECONDS")
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(180)
        .clamp(10, 300);
    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let directory = std::env::temp_dir().join("Fly Island-notification-verification");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join(format!("{run_id}.json"));
    let app = app.clone();
    thread::Builder::new().name("notification-diagnostics".into()).spawn(move || {
        let start = Instant::now();
        let mut history: Vec<Value> = Vec::new();
        let mut previous = Value::Null;
        let mut qq_arrival = false;
        let mut wechat_attention = false;
        loop {
            let qq = qq_notifications::diagnostic_state().unwrap_or_else(|error| json!({"error": error}));
            let wechat = wechat_reminders::diagnostic_state().unwrap_or_else(|error| json!({"error": error}));
            qq_arrival |= qq["itemCount"].as_u64().unwrap_or(0) > 0;
            wechat_attention |= wechat["lastAttentionAt"].as_u64().is_some();
            let current = json!({"qq": qq, "wechat": wechat});
            if current != previous {
                history.push(json!({"elapsedMs": start.elapsed().as_millis(), "state": current}));
                previous = current.clone();
            }
            let completed = start.elapsed() >= Duration::from_secs(seconds);
            let report = json!({
                "schemaVersion": 1,
                "pid": std::process::id(),
                "appVersion": app.package_info().version.to_string(),
                "verificationRunId": run_id,
                "appIdentifier": app.config().identifier,
                "nativeAppDataDirectory": app.path().app_data_dir().ok(),
                "executable": std::env::current_exe().ok(),
                "userDataFolderOverride": std::env::var("WEBVIEW2_USER_DATA_FOLDER").ok(),
                "startedAtUnixMs": started_at,
                "elapsedMs": start.elapsed().as_millis(),
                "completed": completed,
                "windowVisible": app.get_webview_window("main").is_some_and(|window| window.is_visible().unwrap_or(false)),
                "qqArrivalObserved": qq_arrival,
                "wechatAttentionObserved": wechat_attention,
                "current": current,
                "history": history,
            });
            if let Ok(bytes) = serde_json::to_vec_pretty(&report) {
                if let Err(error) = fs::write(&path, bytes) {
                    eprintln!("failed to write notification verification report: {error}");
                    return;
                }
            }
            if completed { return; }
            thread::sleep(Duration::from_millis(500));
        }
    }).map_err(|error| format!("无法启动通知验收记录：{error}"))?;
    Ok(())
}
