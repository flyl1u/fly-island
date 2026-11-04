//! Local API: lets scripts and other programs read and change todos and the
//! daily note over HTTP on 127.0.0.1. It is the built-in plugin
//! `focusd.local-api` (plugin_host/builtin.rs), which switches it on and off;
//! the port and token stay in `local-api.json` so scripts can find them.
//! See docs/local-api.md.

mod bridge;
mod config;
mod routes;
mod server;
#[cfg(test)]
mod tests;

use std::{
    path::PathBuf,
    sync::{Mutex, MutexGuard, OnceLock, PoisonError},
};
use tauri::{AppHandle, Manager};

pub use bridge::BridgeResponse;
use config::{load_config, save_config, LocalApiConfig, CONFIG_FILE_NAME};

static SERVICE: OnceLock<LocalApiService> = OnceLock::new();

struct LocalApiService {
    app: AppHandle,
    path: PathBuf,
    config: Mutex<LocalApiConfig>,
    /// The switches as saved before the API became a plugin, read once at start.
    legacy: (bool, bool),
}

/// What the local API's plugin page shows.
pub(crate) struct LocalApiStatus {
    pub url: String,
    pub token: String,
    pub config_path: String,
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
    let _ = SERVICE.set(LocalApiService {
        app: app.clone(),
        path,
        legacy: (config.enabled, config.allow_write),
        config: Mutex::new(config),
    });
    Ok(())
}

fn service() -> Result<&'static LocalApiService, String> {
    SERVICE
        .get()
        .ok_or_else(|| "The local API is not initialized.".to_string())
}

fn config(service: &LocalApiService) -> MutexGuard<'_, LocalApiConfig> {
    service.config.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Config snapshot for request handling. Before `init` it is the (disabled,
/// tokenless) default, which rejects every request.
fn current_config() -> LocalApiConfig {
    SERVICE.get().map(|service| config(service).clone()).unwrap_or_default()
}

/// `(enabled, allow_write)` from local-api.json as it was when the island
/// started, so plugin_host can carry the old settings over to the plugin once.
pub(crate) fn legacy_switches() -> Option<(bool, bool)> {
    SERVICE.get().map(|service| service.legacy)
}

/// Starts listening (keeping the saved port when it is free) and records the
/// switches in local-api.json, which scripts read.
pub(crate) fn start(allow_write: bool) -> Result<LocalApiStatus, String> {
    let service = service()?;
    {
        let mut config = config(service);
        let port = server::start(service.app.clone(), config.port)?;
        config.enabled = true;
        config.allow_write = allow_write;
        config.port = port;
        save_config(&service.path, &config)?;
    }
    status()
}

pub(crate) fn stop() -> Result<(), String> {
    let service = service()?;
    server::stop();
    // Agent statuses reported over HTTP would otherwise stay lit.
    crate::agent_status::clear_external_owner(server::LOCAL_API_OWNER);
    let mut config = config(service);
    config.enabled = false;
    save_config(&service.path, &config)
}

pub(crate) fn set_allow_write(allow_write: bool) -> Result<(), String> {
    let service = service()?;
    let mut config = config(service);
    config.allow_write = allow_write;
    save_config(&service.path, &config)
}

/// Replaces the token; scripts holding the old one stop working.
pub(crate) fn reset_token() -> Result<LocalApiStatus, String> {
    let service = service()?;
    {
        let mut config = config(service);
        config.token = config::generate_token()?;
        save_config(&service.path, &config)?;
    }
    status()
}

pub(crate) fn status() -> Result<LocalApiStatus, String> {
    let service = service()?;
    let config = config(service).clone();
    Ok(LocalApiStatus {
        url: format!("http://127.0.0.1:{}/v1", server::running_port().unwrap_or(config.port)),
        token: config.token,
        config_path: service.path.display().to_string(),
    })
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
