//! Configuration migration: native JSON dialogs, validation, restart and startup recovery.
mod assets;
mod data;
mod format;
mod transaction;
#[cfg(test)] mod tests;

use std::{collections::BTreeMap, path::PathBuf, sync::{Mutex, PoisonError}};
use serde::Serialize;
use tauri::Manager;
use format::{Backup, MAX_BACKUP_BYTES};
use crate::win32::file_dialog::{self, FileType};
pub(crate) use transaction::write as write_export;

const PENDING: &str = "config-transfer-pending.json";
const RESULT: &str = "config-transfer-result.json";
static RESTORE: Mutex<Restore> = Mutex::new(Restore { backup: None, ready: false, report: None });
struct Restore { backup: Option<Backup>, ready: bool, report: Option<Report> }

#[derive(Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Report { pub missing_plugins: Vec<String>, pub warnings: Vec<String> }

fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> { app.path().app_data_dir().map_err(|e| e.to_string()) }
fn save_report(root: &std::path::Path, report: &Report) -> Result<(), String> {
    transaction::write(&root.join(RESULT), Some(&serde_json::to_vec(report).map_err(|e| e.to_string())?))
}

/// Before any service loads persisted data. An interrupted restore is undone before retrying.
/// Never fails the app's start: a broken restore is logged and every window starts as before.
pub(crate) fn prepare(app: &tauri::AppHandle) {
    if let Err(error) = try_prepare(app) {
        eprintln!("config restore skipped: {error}");
        RESTORE.lock().unwrap_or_else(PoisonError::into_inner).ready = true;
    }
}

fn try_prepare(app: &tauri::AppHandle) -> Result<(), String> {
    let root = root(app)?;
    transaction::rollback(&root)?;
    let mut state = RESTORE.lock().unwrap_or_else(PoisonError::into_inner);
    if !root.join(PENDING).exists() { state.ready = true; return Ok(()); }
    let attempt = (|| {
        let backup = Backup::parse(&transaction::read_limited(&root.join(PENDING), MAX_BACKUP_BYTES)?)?;
        let (plan, missing_plugins) = backup.files.plan(&root)?;
        transaction::apply(&root, &plan, backup.files.launch_at_startup)?;
        Ok::<_, String>((backup, Report { missing_plugins, warnings: Vec::new() }))
    })();
    match attempt {
        Ok((backup, report)) => { state.backup = Some(backup); state.report = Some(report); }
        Err(error) => {
            transaction::rollback(&root)?;
            transaction::write(&root.join(PENDING), None)?;
            save_report(&root, &Report { warnings: vec![error], ..Default::default() })?;
            state.ready = true;
        }
    }
    Ok(())
}

pub(crate) async fn dialog(window: &tauri::WebviewWindow, name: Option<String>, title: String, file_type: FileType) -> Result<Option<String>, String> {
    let owner = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    let thread = std::thread::Builder::new().name("config-file-picker".into())
        .spawn(move || file_dialog::choose(owner, name.as_deref(), &title, file_type).map_err(|e| e.to_string()))
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || thread.join()).await.map_err(|e| e.to_string())?
        .map_err(|_| "File picker stopped unexpectedly".to_string())?
}

#[tauri::command]
pub async fn export_config(window: tauri::WebviewWindow, app: tauri::AppHandle,
    local_storage: BTreeMap<String, String>, include_clipboard_history: bool, exported_at: String, title: String,
) -> Result<bool, String> {
    let date = exported_at.get(..10).filter(|date| date.bytes().all(|b| b.is_ascii_digit() || b == b'-')).ok_or("Invalid export date")?;
    let name = format!("fly-island-config-{date}.json");
    let Some(path) = dialog(&window, Some(name), title, FileType::Json).await? else { return Ok(false); };
    let backup = Backup { app: "fly-island".into(), format_version: 1, exported_at,
        app_version: app.package_info().version.to_string(),
        local_storage: local_storage.into_iter().filter(|(key, _)| format::storage_key(key)).collect(),
        files: data::collect(&app, include_clipboard_history).await? };
    backup.validate()?;
    let bytes = serde_json::to_vec_pretty(&backup).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_BACKUP_BYTES { return Err("configTransfer:tooLarge".into()); }
    tauri::async_runtime::spawn_blocking(move || transaction::write(std::path::Path::new(&path), Some(&bytes))).await.map_err(|e| e.to_string())??;
    Ok(true)
}

#[tauri::command]
pub async fn read_config_import(window: tauri::WebviewWindow, title: String) -> Result<Option<Backup>, String> {
    let Some(path) = dialog(&window, None, title, FileType::Json).await? else { return Ok(None); };
    tauri::async_runtime::spawn_blocking(move || Backup::parse(&transaction::read_limited(std::path::Path::new(&path), MAX_BACKUP_BYTES)?)).await.map_err(|e| e.to_string())?.map(Some)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview { includes_clipboard_history: bool }

#[tauri::command]
pub async fn stage_config_import(app: tauri::AppHandle, backup: Backup) -> Result<ImportPreview, String> {
    let backup = backup.normalize_legacy()?;
    backup.validate()?;
    let includes_clipboard_history = backup.files.includes_history();
    let bytes = serde_json::to_vec(&backup).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_BACKUP_BYTES { return Err("configTransfer:tooLarge".into()); }
    transaction::write(&root(&app)?.join(PENDING), Some(&bytes))?;
    Ok(ImportPreview { includes_clipboard_history })
}

#[tauri::command]
pub async fn restart_after_config_import(app: tauri::AppHandle) -> Result<(), String> {
    if !root(&app)?.join(PENDING).is_file() { return Err("No configuration is staged".into()); }
    app.restart();
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupState { ready: bool, local_storage: Option<BTreeMap<String, String>> }

#[tauri::command]
pub async fn config_transfer_startup(window: tauri::WebviewWindow) -> Result<StartupState, String> {
    let state = RESTORE.lock().map_err(|e| e.to_string())?;
    Ok(StartupState { ready: state.ready, local_storage: (window.label() == crate::island::WINDOW_LABEL)
        .then(|| state.backup.as_ref().map(|b| b.local_storage.clone())).flatten() })
}

#[tauri::command]
pub async fn finish_config_import(app: tauri::AppHandle, window: tauri::WebviewWindow, success: bool) -> Result<(), String> {
    if window.label() != crate::island::WINDOW_LABEL { return Err("Only the main window can finish the restore".into()); }
    let root = root(&app)?;
    let (backup, mut report) = {
        let mut state = RESTORE.lock().map_err(|e| e.to_string())?;
        (state.backup.take().ok_or("No restore is pending")?, state.report.take().unwrap_or_default())
    };
    if success {
        // The storage is in place: the other windows may start even if the bookkeeping below fails.
        RESTORE.lock().unwrap_or_else(PoisonError::into_inner).ready = true;
        report.warnings.extend(backup.files.agents.restore(&app));
        save_report(&root, &report)?;
        transaction::commit(&root)?;
        transaction::write(&root.join(PENDING), None)?;
        crate::settings_window::open_settings_window(app).await?;
        Ok(())
    } else {
        transaction::rollback(&root)?;
        transaction::write(&root.join(PENDING), None)?;
        report.warnings.push("configTransfer:storageUnavailable".into());
        save_report(&root, &report)?;
        app.restart();
    }
}

#[tauri::command]
pub async fn get_config_import_report(app: tauri::AppHandle) -> Result<Option<Report>, String> {
    let path = root(&app)?.join(RESULT);
    if !path.exists() { return Ok(None); }
    let bytes = transaction::read_limited(&path, 1024 * 1024)?;
    serde_json::from_slice(&bytes).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn dismiss_config_import_report(app: tauri::AppHandle) -> Result<(), String> { transaction::write(&root(&app)?.join(RESULT), None) }

macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)* crate::config_transfer::export_config, crate::config_transfer::read_config_import,
            crate::config_transfer::stage_config_import, crate::config_transfer::restart_after_config_import,
            crate::config_transfer::config_transfer_startup, crate::config_transfer::finish_config_import,
            crate::config_transfer::get_config_import_report, crate::config_transfer::dismiss_config_import_report,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
