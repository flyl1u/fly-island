//! Development mode: plugins loaded from any folder (Settings > Plugins >
//! Developer, or `fly-island-plugin dev` through the local API's /v1/dev routes).
//! It lives in memory only, so after a restart the user turns it on again.
//! Development plugins run without "allow third-party plugins", get every
//! permission they ask for (sensitive ones are still confirmed on first use),
//! may list `experimentalApis`, and their raw JSON-RPC lines are recorded.

use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, VecDeque},
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use super::{
    app_version, builtin,
    grants::stop_plugin,
    host, lock,
    manifest::{parse_manifest, PluginManifest, MANIFEST_FILE_NAME},
    registry::rescan,
    runtime::TraceEntry,
};

/// Experimental APIs this island has (none right now); a development plugin
/// that lists one in `experimentalApis` is told so in `initialize`.
pub(super) const EXPERIMENTAL_APIS: &[&str] = &[];

struct DevState {
    enabled: bool,
    /// Plugin id -> the folder it was loaded from.
    plugins: BTreeMap<String, PathBuf>,
}

static DEV: Mutex<DevState> = Mutex::new(DevState { enabled: false, plugins: BTreeMap::new() });

/// Mirrored by `PluginDevState` in src/features/plugins/api.ts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevSnapshot {
    enabled: bool,
    plugins: Vec<DevPlugin>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevPlugin {
    id: String,
    path: String,
}

/// An error with an HTTP-style status, for the local API.
type DevResult<T> = Result<T, (u16, String)>;

pub(super) fn is_dev(id: &str) -> bool {
    lock(&DEV).plugins.contains_key(id)
}

/// The loaded development plugins: id and folder.
pub(super) fn plugins() -> Vec<(String, PathBuf)> {
    lock(&DEV).plugins.iter().map(|(id, path)| (id.clone(), path.clone())).collect()
}

/// Reads a development plugin's manifest. Its folder may have any name.
pub(super) fn read_manifest(dir: &Path, app_version: &str) -> Result<PluginManifest, String> {
    let text = fs::read_to_string(dir.join(MANIFEST_FILE_NAME))
        .map_err(|error| format!("Could not read {MANIFEST_FILE_NAME} in {}: {error}", dir.display()))?;
    let id = serde_json::from_str::<Value>(&text)
        .ok()
        .and_then(|value| value.get("id").and_then(Value::as_str).map(str::to_string))
        .ok_or_else(|| format!("{MANIFEST_FILE_NAME} has no \"id\"."))?;
    parse_manifest(&text, &id, app_version)
}

/// `experimentalApis` outside development mode is refused (the market does the same).
pub(super) fn check_installed(manifest: PluginManifest) -> Result<PluginManifest, String> {
    if manifest.experimental_apis.is_empty() {
        Ok(manifest)
    } else {
        Err("This plugin uses experimental APIs (experimentalApis), which only work in development mode.".into())
    }
}

/// The experimental APIs a plugin listed that the island has.
pub(super) fn granted_experimental(listed: &[String]) -> Vec<String> {
    listed.iter().filter(|name| EXPERIMENTAL_APIS.contains(&name.as_str())).cloned().collect()
}

fn require_enabled() -> DevResult<()> {
    if lock(&DEV).enabled {
        Ok(())
    } else {
        Err((403, "Development mode is off: turn it on in Settings > Plugins > Developer.".into()))
    }
}

fn require_loaded(id: &str) -> DevResult<()> {
    require_enabled()?;
    if is_dev(id) {
        Ok(())
    } else {
        Err((404, format!("No development plugin \"{id}\" is loaded.")))
    }
}

fn internal(error: String) -> (u16, String) {
    (500, error)
}

pub(super) fn snapshot() -> DevSnapshot {
    let state = lock(&DEV);
    DevSnapshot {
        enabled: state.enabled,
        plugins: state.plugins.iter().map(|(id, path)| DevPlugin { id: id.clone(), path: path.display().to_string() }).collect(),
    }
}

/// Turning development mode off unloads every development plugin.
pub(super) fn set_enabled(enabled: bool) -> Result<(), String> {
    let unloaded: Vec<String> = {
        let mut state = lock(&DEV);
        state.enabled = enabled;
        if enabled {
            Vec::new()
        } else {
            std::mem::take(&mut state.plugins).into_keys().collect()
        }
    };
    if unloaded.is_empty() {
        return Ok(());
    }
    for id in &unloaded {
        stop_plugin(id)?;
    }
    rescan()
}

/// Loads (or loads again) the plugin in `path`; returns its id.
pub(super) fn load(path: &str) -> DevResult<String> {
    require_enabled()?;
    let host = host().map_err(internal)?;
    let dir = fs::canonicalize(path).map_err(|error| (400, format!("{path}: {error}")))?;
    // canonicalize gives \\?\C:\...; the plugin and its logs see the usual form.
    let dir = PathBuf::from(dir.display().to_string().trim_start_matches(r"\\?\"));
    let manifest = read_manifest(&dir, &app_version(&host.app)).map_err(|error| (400, error))?;
    if builtin::is_builtin(&manifest.id) {
        return Err((400, "This id belongs to a plugin built into FocuSD Island.".into()));
    }
    let id = manifest.id;
    lock(&DEV).plugins.insert(id.clone(), dir);
    // A running copy (installed, or loaded before) starts again from this folder,
    // with a fresh log and trace (`fly-island-plugin dev` prints the log from the start).
    stop_plugin(&id).map_err(internal)?;
    lock(&host.runtimes).remove(&id);
    rescan().map_err(internal)?;
    Ok(id)
}

/// Reads the manifest again and restarts the plugin (after a file changed).
pub(super) fn reload(id: &str) -> DevResult<()> {
    require_loaded(id)?;
    stop_plugin(id).map_err(internal)?;
    rescan().map_err(internal)
}

pub(super) fn unload(id: &str) -> DevResult<bool> {
    require_enabled()?;
    let removed = lock(&DEV).plugins.remove(id).is_some();
    if removed {
        stop_plugin(id).map_err(internal)?;
        rescan().map_err(internal)?;
    }
    Ok(removed)
}

/// Log lines after sequence number `after`, and the plugin's status.
pub(super) fn log_since(id: &str, after: u64) -> DevResult<Value> {
    require_loaded(id)?;
    let host = host().map_err(internal)?;
    let runtimes = lock(&host.runtimes);
    let Some(info) = runtimes.get(id) else {
        return Ok(json!({ "lines": [], "next": after, "status": "stopped", "error": null }));
    };
    let lines = lines_after(&info.log, info.log_seq, after);
    Ok(json!({ "lines": lines, "next": info.log_seq, "status": info.status, "error": info.error }))
}

/// The lines of `log` numbered above `after`; the last line is number `log_seq`.
pub(super) fn lines_after(log: &VecDeque<String>, log_seq: u64, after: u64) -> Vec<Value> {
    let first = (log_seq + 1).saturating_sub(log.len() as u64);
    log.iter()
        .zip(first..)
        .filter(|(_, seq)| *seq > after)
        .map(|(text, seq)| json!({ "seq": seq, "text": text }))
        .collect()
}

/// The raw JSON-RPC lines of a development plugin, oldest first.
pub(super) fn trace(id: &str) -> Result<Vec<TraceEntry>, String> {
    let host = host()?;
    Ok(lock(&host.runtimes).get(id).map(|info| info.trace.iter().cloned().collect()).unwrap_or_default())
}

/// Sends a development plugin an `event` notification, subscribed or not.
pub(super) fn send_event(id: &str, name: &str, payload: Value) -> Result<(), String> {
    if !is_dev(id) {
        return Err("Events can only be sent to development plugins.".into());
    }
    let host = host()?;
    let supervisors = lock(&host.supervisors);
    let supervisor = supervisors.get(id).ok_or("The plugin is not running.")?;
    supervisor.notify("event", json!({ "name": name, "payload": payload }))
}

/// `/v1/dev/...` calls from the local API (routes in local_api/routes.rs).
pub(crate) fn answer_local_api(method: &str, params: &Value) -> DevResult<Value> {
    let text = |key: &str| params.get(key).and_then(Value::as_str).unwrap_or_default().to_string();
    match method {
        "dev.load" => {
            let path = text("path");
            if path.is_empty() {
                return Err((400, "Expected { path }: the plugin's folder.".into()));
            }
            let id = load(&path)?;
            Ok(json!({ "id": id, "path": lock(&DEV).plugins.get(&id).map(|dir| dir.display().to_string()) }))
        }
        "dev.reload" => reload(&text("id")).map(|()| json!({ "id": text("id") })),
        "dev.unload" => unload(&text("id")).map(|removed| json!({ "removed": removed })),
        "dev.log" => log_since(&text("id"), params.get("after").and_then(Value::as_u64).unwrap_or(0)),
        _ => Err((404, "Unknown path.".into())),
    }
}

fn plain<T>(result: DevResult<T>) -> Result<T, String> {
    result.map_err(|(_, message)| message)
}

/// Runs a change that starts or stops processes off the main thread.
async fn blocking<T: Send + 'static>(change: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<DevSnapshot, String> {
    tauri::async_runtime::spawn_blocking(change)
        .await
        .map_err(|error| format!("The development task failed: {error}"))??;
    Ok(snapshot())
}

#[tauri::command]
pub fn get_plugin_dev_state() -> DevSnapshot {
    snapshot()
}

#[tauri::command]
pub async fn set_plugin_dev_mode(enabled: bool) -> Result<DevSnapshot, String> {
    blocking(move || set_enabled(enabled)).await
}

#[tauri::command]
pub async fn load_dev_plugin(path: String) -> Result<DevSnapshot, String> {
    blocking(move || plain(load(&path))).await
}

#[tauri::command]
pub async fn reload_dev_plugin(id: String) -> Result<DevSnapshot, String> {
    blocking(move || plain(reload(&id))).await
}

#[tauri::command]
pub async fn unload_dev_plugin(id: String) -> Result<DevSnapshot, String> {
    blocking(move || plain(unload(&id))).await
}

/// The last raw JSON-RPC lines between the island and a development plugin.
#[tauri::command]
pub fn get_plugin_rpc_trace(id: String) -> Result<Vec<TraceEntry>, String> {
    trace(&id)
}

#[tauri::command]
pub fn send_plugin_dev_event(id: String, name: String, payload: Value) -> Result<(), String> {
    send_event(&id, &name, payload)
}
