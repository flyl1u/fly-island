//! Local API: lets scripts and other programs read and change todos and the
//! daily note over HTTP on 127.0.0.1. Off by default; the port and token are
//! saved in `local-api.json` so scripts can find them. See docs/local-api.md.

mod bridge;
mod config;
mod routes;
mod server;
#[cfg(test)]
mod tests;

use serde::Serialize;
use std::{
    path::PathBuf,
    sync::{Mutex, OnceLock, PoisonError},
};
use tauri::{AppHandle, Manager};

pub use bridge::BridgeResponse;
use config::{load_config, save_config, LocalApiConfig, CONFIG_FILE_NAME};

static SERVICE: OnceLock<LocalApiService> = OnceLock::new();

struct LocalApiService {
    app: AppHandle,
    path: PathBuf,
    config: Mutex<LocalApiConfig>,
    /// Why the server is not running although it is switched on.
    error: Mutex<Option<String>>,
}

/// Mirrored by `LocalApiState` in src/features/local-api/api.ts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalApiState {
    enabled: bool,
    allow_write: bool,
    running: bool,
    url: String,
    token: String,
    config_path: String,
    error: Option<String>,
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?
        .join(CONFIG_FILE_NAME);
    let (config, changed) = load_config(&path)?;
    if changed {
        save_config(&path, &config)?;
    }
    let enabled = config.enabled;
    let _ = SERVICE.set(LocalApiService {
        app: app.clone(),
        path,
        config: Mutex::new(config),
        error: Mutex::new(None),
    });
    if enabled {
        apply_running_state()?;
    }
    Ok(())
}

fn service() -> Result<&'static LocalApiService, String> {
    SERVICE
        .get()
        .ok_or_else(|| "The local API is not initialized.".to_string())
}

/// Config snapshot for request handling. Before `init` it is the (disabled,
/// tokenless) default, which rejects every request.
fn current_config() -> LocalApiConfig {
    SERVICE
        .get()
        .map(|service| service.config.lock().unwrap_or_else(PoisonError::into_inner).clone())
        .unwrap_or_default()
}

/// Starts or stops the listener to match `enabled`, saving the actual port.
fn apply_running_state() -> Result<(), String> {
    let service = service()?;
    let mut config = service.config.lock().unwrap_or_else(PoisonError::into_inner);
    let mut error = service.error.lock().unwrap_or_else(PoisonError::into_inner);
    if !config.enabled {
        server::stop();
        *error = None;
        return Ok(());
    }
    match server::start(service.app.clone(), config.port) {
        Ok(port) => {
            *error = None;
            if config.port != port {
                config.port = port;
                save_config(&service.path, &config)?;
            }
        }
        Err(message) => *error = Some(message),
    }
    Ok(())
}

fn snapshot() -> Result<LocalApiState, String> {
    let service = service()?;
    let config = service.config.lock().unwrap_or_else(PoisonError::into_inner).clone();
    let running = server::running_port();
    Ok(LocalApiState {
        enabled: config.enabled,
        allow_write: config.allow_write,
        running: running.is_some(),
        url: format!("http://127.0.0.1:{}/v1", running.unwrap_or(config.port)),
        token: config.token,
        config_path: service.path.display().to_string(),
        error: service.error.lock().unwrap_or_else(PoisonError::into_inner).clone(),
    })
}

#[tauri::command]
pub fn get_local_api_state() -> Result<LocalApiState, String> {
    snapshot()
}

#[tauri::command]
pub async fn set_local_api_settings(enabled: bool, allow_write: bool) -> Result<LocalApiState, String> {
    {
        let service = service()?;
        let mut config = service.config.lock().unwrap_or_else(PoisonError::into_inner);
        config.enabled = enabled;
        config.allow_write = allow_write;
        save_config(&service.path, &config)?;
    }
    apply_running_state()?;
    snapshot()
}

/// Replaces the token; scripts holding the old one stop working.
#[tauri::command]
pub fn reset_local_api_token() -> Result<LocalApiState, String> {
    {
        let service = service()?;
        let mut config = service.config.lock().unwrap_or_else(PoisonError::into_inner);
        config.token = config::generate_token()?;
        save_config(&service.path, &config)?;
    }
    snapshot()
}

/// Runs a todo / note method (e.g. `todos.add`) in the island window. Used by
/// plugins; works whether or not the HTTP API is switched on. Errors carry an
/// HTTP-style status.
pub(crate) fn call_island(app: &AppHandle, method: &'static str, params: serde_json::Value) -> Result<serde_json::Value, (u16, String)> {
    let call = routes::ApiCall { method, params, writes: false };
    bridge::dispatch(app, call).map_err(|error| (error.status, error.message))
}

/// The island window's answer to a `local-api-request` event.
#[tauri::command]
pub fn answer_local_api_request(id: u64, response: BridgeResponse) {
    bridge::complete(id, response);
}
