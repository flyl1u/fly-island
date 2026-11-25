mod file;
mod format;
pub(crate) mod frontend;
mod startup;
mod worker;

use std::{
    fs,
    io::{BufRead, BufReader, Read},
    path::PathBuf,
    sync::{atomic::{AtomicBool, Ordering}, OnceLock},
    thread,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::win32::std_handle::redirect_stderr;
pub(crate) use format::Category;

const APP_LOG_CHANGED_EVENT: &str = "app-log-changed";
const SETTINGS_FILE: &str = "app-log.json";
const LOG_DIR: &str = "logs";
static ENABLED: AtomicBool = AtomicBool::new(false);
static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();
static STDERR_PIPE: OnceLock<std::io::PipeWriter> = OnceLock::new();

#[derive(Serialize, Deserialize, Default)]
struct LogSettings {
    enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppLogState {
    enabled: bool,
    path: String,
    bytes: u64,
}

#[derive(Deserialize)]
pub struct FrontendLogEntry {
    level: String,
    message: String,
}

fn log_dir() -> Option<PathBuf> {
    DATA_DIR.get().map(|dir| dir.join(LOG_DIR))
}

pub(crate) fn event(category: Category, name: &'static str, fields: &[(&str, &str)]) {
    worker::event(format::body(category, name, fields), Some(category));
}

pub(crate) fn write_line(source: &str, message: &str) {
    if ENABLED.load(Ordering::Relaxed) {
        worker::event(format::legacy(source, message), None);
    }
}

fn capture_stderr() {
    if STDERR_PIPE.get().is_some() { return; }
    let Ok((reader, writer)) = std::io::pipe() else { return };
    if thread::Builder::new().name("app-log-stderr".into()).spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut line = Vec::new();
        while (&mut reader).take(4096).read_until(b'\n', &mut line).is_ok_and(|read| read > 0) {
            write_line("rust", &String::from_utf8_lossy(&line));
            if line.len() == 4096 && !line.ends_with(b"\n") && reader.skip_until(b'\n').is_err() { break; }
            line.clear();
        }
    }).is_ok() && redirect_stderr(&writer) {
        let _ = STDERR_PIPE.set(writer);
    }
}

fn set_capture_enabled(enabled: bool) {
    ENABLED.store(enabled, Ordering::Relaxed);
    if enabled { capture_stderr(); }
}

pub fn init(app: &AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else { return };
    let saved = fs::read(dir.join(SETTINGS_FILE)).ok()
        .and_then(|raw| serde_json::from_slice::<LogSettings>(&raw).ok()).unwrap_or_default();
    let _ = DATA_DIR.set(dir.clone());
    if worker::start(dir, saved.enabled).is_err() { return; }
    set_capture_enabled(saved.enabled);
    startup::record(app);
}

pub(crate) use startup::record_plugins;

fn state() -> AppLogState {
    let path = log_dir().map(|dir| dir.join(file::FILE_NAME)).unwrap_or_default();
    let bytes = file::total_bytes(path.parent().unwrap_or(&path));
    AppLogState { enabled: ENABLED.load(Ordering::Relaxed), path: path.to_string_lossy().into_owned(), bytes }
}

#[tauri::command]
pub fn get_app_log_state() -> AppLogState {
    state()
}

#[tauri::command]
pub async fn set_app_log_enabled(app: AppHandle, enabled: bool) -> Result<AppLogState, String> {
    let state = tauri::async_runtime::spawn_blocking(move || {
        worker::set_enabled(enabled)?;
        Ok::<_, String>(state())
    }).await.map_err(|error| error.to_string())??;
    let _ = app.emit(APP_LOG_CHANGED_EVENT, state.enabled);
    Ok(state)
}

#[tauri::command]
pub fn append_app_log(window: tauri::Window, entries: Vec<FrontendLogEntry>) {
    for entry in entries.iter().take(200) {
        let level = if entry.level == "error" { "error" } else { "warn" };
        write_line(&format!("{}:{level}", window.label()), format::truncate(&entry.message, 4096));
    }
}

#[tauri::command]
pub async fn open_app_log_folder() -> Result<(), String> {
    let dir = log_dir().ok_or("找不到应用数据目录")?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建日志文件夹：{error}"))?;
    tauri_plugin_opener::open_path(&dir, None::<&str>).map_err(|error| format!("无法打开文件夹：{error}"))
}

#[tauri::command]
pub async fn clear_app_log() -> Result<AppLogState, String> {
    tauri::async_runtime::spawn_blocking(|| {
        worker::clear()?;
        Ok(state())
    }).await.map_err(|error| error.to_string())?
}

macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::app_log::get_app_log_state,
            crate::app_log::set_app_log_enabled,
            crate::app_log::append_app_log,
            crate::app_log::open_app_log_folder,
            crate::app_log::clear_app_log,
            crate::app_log::frontend::record_diagnostic,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
