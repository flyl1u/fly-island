mod download;
mod elevated;
mod manifest;
mod netease;
mod record;
mod service;

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};

pub(crate) const PROGRESS_EVENT: &str = "media-plugin-progress";
static BUSY: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Serialize)]
pub(crate) struct PluginError { kind: &'static str, detail: String }
impl PluginError {
    pub(super) fn new(kind: &'static str, detail: impl Into<String>) -> Self { Self { kind, detail: detail.into() } }
    pub(super) fn network(error: reqwest::Error) -> Self { Self::new("Network", error.to_string()) }
}
impl From<std::io::Error> for PluginError {
    fn from(error: std::io::Error) -> Self { Self::new("Io", error.to_string()) }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress { stage: &'static str, detail: Option<String> }
fn progress(app: &tauri::AppHandle, stage: &'static str) {
    let _ = app.emit(PROGRESS_EVENT, Progress { stage, detail: None });
}
struct Operation;
impl Operation {
    fn acquire() -> Result<Self, PluginError> {
        BUSY.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map(|_| Self).map_err(|_| PluginError::new("Busy", "Another plugin operation is running"))
    }
}
impl Drop for Operation { fn drop(&mut self) { BUSY.store(false, Ordering::SeqCst); } }

#[tauri::command]
pub(crate) async fn netease_plugin_status() -> Result<netease::NeteasePluginStatus, PluginError> {
    tauri::async_runtime::spawn_blocking(netease::status).await
        .map_err(|e| PluginError::new("Io", e.to_string()))
}
async fn operate(app: tauri::AppHandle, remove: bool) -> Result<service::OperationResult, PluginError> {
    let guard = Operation::acquire()?;
    let data = app.path().app_data_dir().map_err(|e| PluginError::new("Io", e.to_string()))?;
    // The whole operation (including file IO and UAC waiting) runs off the IPC thread.
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let result = if remove { service::uninstall(&app, &data) }
            else { tauri::async_runtime::block_on(service::install(&app, &data)) };
        progress(&app, if result.is_ok() { "done" } else { "error" });
        result
    }).await.map_err(|e| PluginError::new("Io", e.to_string()))?
}
#[tauri::command]
pub(crate) async fn install_netease_plugin(app: tauri::AppHandle) -> Result<service::OperationResult, PluginError> { operate(app, false).await }
#[tauri::command]
pub(crate) async fn uninstall_netease_plugin(app: tauri::AppHandle) -> Result<service::OperationResult, PluginError> { operate(app, true).await }

pub(crate) fn handle_startup() { elevated::handle_startup(); }
pub(crate) fn diagnostic_state(directory: &std::path::Path) -> &'static str { netease::plugin_state(directory).0 }
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::media_plugins::netease_plugin_status,
            crate::media_plugins::install_netease_plugin,
            crate::media_plugins::uninstall_netease_plugin,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
#[cfg(test)] mod tests;
