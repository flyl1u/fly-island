//! Optional screenshot feature gate and the versioned entry point for future capture modes.
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;

static ENABLED: AtomicBool = AtomicBool::new(false);
static CONFIGURATION: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Clone, Copy, Debug, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum CaptureMode { Screenshot, Scroll, Recording }

#[derive(serde::Serialize)]
pub(crate) struct CaptureCapabilities { version: u32, screenshot: bool, scroll: bool, recording: bool }

pub(crate) fn enabled() -> bool { ENABLED.load(Ordering::Acquire) }
pub(crate) fn require_enabled() -> Result<(), String> {
    if enabled() { Ok(()) } else { Err("请先在设置 → 插件中安装并启用截图。".into()) }
}
fn require_available(mode: CaptureMode) -> Result<(), String> {
    match mode {
        CaptureMode::Screenshot => Ok(()),
        CaptureMode::Scroll => Err("长截图开发中。".into()),
        CaptureMode::Recording => Err("录屏开发中。".into()),
    }
}

#[tauri::command]
pub(crate) fn screenshot_capabilities() -> CaptureCapabilities {
    CaptureCapabilities { version: 1, screenshot: true, scroll: false, recording: false }
}

#[tauri::command]
pub(crate) fn screenshot_start_task(app: AppHandle, mode: CaptureMode) -> Result<(), String> {
    require_available(mode)?;
    require_enabled()?;
    super::window::show_overlay(&app)
}

#[tauri::command]
pub(crate) async fn configure_screenshot_plugin(app: AppHandle, enabled: bool, shortcut: String) -> Result<String, String> {
    let _configuration = CONFIGURATION.lock().await;
    // Register first: a conflicting replacement must leave the previous working binding intact.
    let shortcut = if enabled { shortcut } else { String::new() };
    let registered = tauri::async_runtime::spawn_blocking(move || super::hotkey::set_shortcut(shortcut))
        .await.map_err(|error| error.to_string())??;
    ENABLED.store(enabled, Ordering::Release);
    if !enabled {
        super::window::shutdown(&app).await?;
        super::capture::release();
        super::ocr_engine::release();
    }
    Ok(registered)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn future_modes_are_advertised_but_cannot_start() {
        let caps = screenshot_capabilities();
        assert!(caps.screenshot && !caps.scroll && !caps.recording);
        assert_eq!(caps.version, 1);
        assert!(require_available(CaptureMode::Screenshot).is_ok());
        assert!(require_available(CaptureMode::Scroll).unwrap_err().contains("开发中"));
        assert!(require_available(CaptureMode::Recording).unwrap_err().contains("开发中"));
    }
}
