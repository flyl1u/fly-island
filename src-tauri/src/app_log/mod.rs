//! The diagnostic log (用户要求 2026-11-18：很多报错没法复现). Off by default. While on, standard
//! error (every `eprintln!` and panic message in the app) and the windows' console errors and
//! warnings (`append_app_log`) are written with the local time to `logs/focusd-island.log` in
//! the app data directory, which users send along with a problem. Nothing leaves the machine.

mod file;

use std::{
    fs,
    io::{BufRead, BufReader},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex, OnceLock, PoisonError,
    },
    thread,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::win32::std_handle::{local_timestamp, redirect_stderr};
use file::LogFile;

/// Mirrored by APP_LOG_CHANGED_EVENT in src/features/diagnostics/api.ts.
const APP_LOG_CHANGED_EVENT: &str = "app-log-changed";
/// The switch, in the app data directory: Rust reads it at startup, before any window loads.
const SETTINGS_FILE: &str = "app-log.json";
const LOG_DIR: &str = "logs";
/// One frontend message is cut here: a stack trace is enough, a dumped object is not needed.
const MAX_MESSAGE_CHARS: usize = 4000;

static ENABLED: AtomicBool = AtomicBool::new(false);
static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();
static OUTPUT: Mutex<Option<LogFile>> = Mutex::new(None);
/// The write end standard error points at, kept open for the life of the process.
static STDERR_PIPE: OnceLock<std::io::PipeWriter> = OnceLock::new();
static VERSION: OnceLock<String> = OnceLock::new();
/// The version line goes in once per run: written on every switch, turning the log on and off
/// over and over grew the file each time (2026-11-19, owner).
static HEADER_WRITTEN: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Deserialize, Default)]
struct LogSettings {
    enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppLogState {
    enabled: bool,
    /// The log file, shown so users know what to send.
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

/// Writes one line when the log is on. Never reports its own failures on standard error,
/// which would come straight back here.
pub(crate) fn write_line(source: &str, message: &str) {
    if !ENABLED.load(Ordering::Relaxed) {
        return;
    }
    let Some(dir) = log_dir() else { return };
    let line = format!("{} [{source}] {}\n", local_timestamp(), message.trim_end());
    let mut output = OUTPUT.lock().unwrap_or_else(PoisonError::into_inner);
    if output.is_none() {
        *output = LogFile::open(&dir);
    }
    if let Some(log) = output.as_mut() {
        if log.write(&line).is_err() {
            *output = None;
        }
    }
}

/// From the first time the log is turned on, standard error goes through a pipe whose lines a
/// thread writes to the log (and drops while it is off).
fn capture_stderr() {
    if STDERR_PIPE.get().is_some() {
        return;
    }
    let Ok((reader, writer)) = std::io::pipe() else { return };
    if !redirect_stderr(&writer) || STDERR_PIPE.set(writer).is_err() {
        return;
    }
    let _ = thread::Builder::new().name("app-log-stderr".into()).spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut line = Vec::new();
        while reader.read_until(b'\n', &mut line).is_ok_and(|read| read > 0) {
            write_line("rust", &String::from_utf8_lossy(&line));
            line.clear();
        }
    });
}

fn turn_on(reason: &str) {
    ENABLED.store(true, Ordering::Relaxed);
    capture_stderr();
    write_header(reason);
}

/// The version line, unless this run already wrote one into the current log.
fn write_header(reason: &str) {
    if HEADER_WRITTEN.swap(true, Ordering::Relaxed) {
        return;
    }
    let version = VERSION.get().map_or("?", String::as_str);
    let webview = tauri::webview_version().unwrap_or_else(|_| "?".into());
    write_line("app", &format!("{reason}: Fly Island v{version}, WebView2 {webview}, {}", windows_version()));
    // Goes the same way as every other `eprintln!`: its [rust] line shows that path works.
    if STDERR_PIPE.get().is_some() {
        eprintln!("标准错误已接入日志");
    }
}

fn turn_off() {
    ENABLED.store(false, Ordering::Relaxed);
    *OUTPUT.lock().unwrap_or_else(PoisonError::into_inner) = None;
}

fn windows_version() -> String {
    use windows::Win32::System::Registry::HKEY_LOCAL_MACHINE;
    let read = |value| crate::win32::registry::read_string(HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows NT\CurrentVersion", value);
    let build = read("CurrentBuild").unwrap_or_default();
    let display = read("DisplayVersion").unwrap_or_default();
    format!("Windows build {build} {display}").trim_end().to_string()
}

fn settings_path() -> Option<PathBuf> {
    DATA_DIR.get().map(|dir| dir.join(SETTINGS_FILE))
}

/// Reads the switch and, when it is on, starts logging before anything else starts up.
pub fn init(app: &AppHandle) {
    let _ = VERSION.set(app.package_info().version.to_string());
    let Ok(dir) = app.path().app_data_dir() else { return };
    let _ = DATA_DIR.set(dir);
    let saved = settings_path()
        .and_then(|path| fs::read(path).ok())
        .and_then(|raw| serde_json::from_slice::<LogSettings>(&raw).ok())
        .unwrap_or_default();
    if saved.enabled {
        turn_on("启动");
    }
}

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
pub fn set_app_log_enabled(app: AppHandle, enabled: bool) -> Result<AppLogState, String> {
    let path = settings_path().ok_or("找不到应用数据目录")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法保存日志设置：{error}"))?;
    }
    let raw = serde_json::to_vec(&LogSettings { enabled }).map_err(|error| error.to_string())?;
    fs::write(&path, raw).map_err(|error| format!("无法保存日志设置：{error}"))?;
    if enabled && !ENABLED.load(Ordering::Relaxed) {
        turn_on("日志已开启");
    } else if !enabled && ENABLED.load(Ordering::Relaxed) {
        turn_off();
    }
    let _ = app.emit(APP_LOG_CHANGED_EVENT, enabled);
    Ok(state())
}

/// Console errors and warnings a window collected; dropped while the log is off.
#[tauri::command]
pub fn append_app_log(window: tauri::Window, entries: Vec<FrontendLogEntry>) {
    for entry in entries.iter().take(200) {
        let message: String = entry.message.chars().take(MAX_MESSAGE_CHARS).collect();
        let level = if entry.level == "error" { "error" } else { "warn" };
        write_line(&format!("{}:{level}", window.label()), &message);
    }
}

#[tauri::command]
pub async fn open_app_log_folder() -> Result<(), String> {
    let dir = log_dir().ok_or("找不到应用数据目录")?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建日志文件夹：{error}"))?;
    tauri_plugin_opener::open_path(&dir, None::<&str>).map_err(|error| format!("无法打开文件夹：{error}"))
}

/// Empties the log (both files) without changing the switch.
#[tauri::command]
pub fn clear_app_log() -> Result<AppLogState, String> {
    let dir = log_dir().ok_or("找不到应用数据目录")?;
    *OUTPUT.lock().unwrap_or_else(PoisonError::into_inner) = None;
    file::remove_all(&dir).map_err(|error| format!("无法清空日志：{error}"))?;
    HEADER_WRITTEN.store(false, Ordering::Relaxed);
    if ENABLED.load(Ordering::Relaxed) {
        write_header("日志已清空");
    }
    Ok(state())
}

/// This module's Tauri commands, chained into `generate_handler!` by `lib.rs`.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::app_log::get_app_log_state,
            crate::app_log::set_app_log_enabled,
            crate::app_log::append_app_log,
            crate::app_log::open_app_log_folder,
            crate::app_log::clear_app_log,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
