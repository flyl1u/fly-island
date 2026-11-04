//! Plugin host: finds plugins in `plugins/<id>/focusd-plugin.json` under the app
//! data folder, keeps the user's choices in `plugins.json`, and runs the enabled
//! ones as child processes. Design: docs/architecture/plugins.md; guide for
//! plugin authors: docs/plugins/README.md.

mod manifest;
mod permissions;
mod rpc;
mod runtime;
mod store;
#[cfg(test)]
mod tests;

use serde::Serialize;
use serde_json::json;
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{Arc, Mutex, MutexGuard, OnceLock, PoisonError},
};
use tauri::{AppHandle, Manager};

use manifest::{launch_command, parse_manifest, LocalizedText, PluginCommand, PluginManifest, PluginRuntime, MANIFEST_FILE_NAME};
use permissions::missing_permissions;
use runtime::{LaunchSpec, RuntimeStatus, RuntimeTable, Supervisor};
use store::{load_state, save_state, PluginsState, STATE_FILE_NAME};

const PLUGINS_DIR_NAME: &str = "plugins";
const PLUGIN_DATA_DIR_NAME: &str = "plugins-data";

static HOST: OnceLock<PluginHost> = OnceLock::new();

struct PluginHost {
    app: AppHandle,
    plugins_dir: PathBuf,
    data_dir: PathBuf,
    state_path: PathBuf,
    state: Mutex<PluginsState>,
    installed: Mutex<Vec<InstalledPlugin>>,
    supervisors: Mutex<HashMap<String, Supervisor>>,
    runtimes: RuntimeTable,
}

struct InstalledPlugin {
    folder: String,
    dir: PathBuf,
    manifest: Result<PluginManifest, String>,
}

/// Mirrored by `PluginInfo` in src/features/plugins/api.ts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    id: String,
    /// Why the plugin cannot be used (bad manifest); the other fields are then empty.
    invalid_reason: Option<String>,
    name: Option<LocalizedText>,
    description: Option<LocalizedText>,
    version: String,
    author: String,
    homepage: String,
    permissions: Vec<String>,
    commands: Vec<PluginCommand>,
    has_process: bool,
    enabled: bool,
    /// On, but the plugin now asks for permissions the user has not granted.
    needs_approval: bool,
    status: RuntimeStatus,
    error: Option<String>,
    log: Vec<String>,
}

/// Mirrored by `PluginsSnapshot` in src/features/plugins/api.ts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginsSnapshot {
    allow_third_party: bool,
    plugins_dir: String,
    plugins: Vec<PluginInfo>,
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    let plugins_dir = app_dir.join(PLUGINS_DIR_NAME);
    fs::create_dir_all(&plugins_dir)
        .map_err(|error| format!("Could not create {}: {error}", plugins_dir.display()))?;
    let state_path = app_dir.join(STATE_FILE_NAME);
    let host = PluginHost {
        app: app.clone(),
        installed: Mutex::new(scan(&plugins_dir, &app_version(app))),
        plugins_dir,
        data_dir: app_dir.join(PLUGIN_DATA_DIR_NAME),
        state: Mutex::new(load_state(&state_path)),
        state_path,
        supervisors: Mutex::new(HashMap::new()),
        runtimes: Arc::new(Mutex::new(HashMap::new())),
    };
    if HOST.set(host).is_err() {
        return Err("The plugin host was initialized twice.".into());
    }
    sync_processes()
}

fn host() -> Result<&'static PluginHost, String> {
    HOST.get().ok_or_else(|| "The plugin host is not initialized.".to_string())
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn app_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

fn scan(plugins_dir: &PathBuf, app_version: &str) -> Vec<InstalledPlugin> {
    let Ok(entries) = fs::read_dir(plugins_dir) else {
        return Vec::new();
    };
    let mut plugins: Vec<InstalledPlugin> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| {
            let folder = entry.file_name().to_string_lossy().into_owned();
            let dir = entry.path();
            let manifest = fs::read_to_string(dir.join(MANIFEST_FILE_NAME))
                .map_err(|error| format!("Could not read {MANIFEST_FILE_NAME}: {error}"))
                .and_then(|text| parse_manifest(&text, &folder, app_version));
            InstalledPlugin { folder, dir, manifest }
        })
        .collect();
    plugins.sort_by(|left, right| left.folder.cmp(&right.folder));
    plugins
}

/// Starts plugins that should run and stops the rest. A plugin runs when
/// third-party plugins are allowed, it is on, it has a process, and every
/// permission it asks for was granted.
fn sync_processes() -> Result<(), String> {
    let host = host()?;
    let mut wanted: HashMap<String, LaunchSpec> = HashMap::new();
    {
        let state = lock(&host.state);
        for plugin in lock(&host.installed).iter() {
            let Ok(manifest) = &plugin.manifest else { continue };
            let PluginRuntime::Process { command, args } = &manifest.runtime else { continue };
            let Some(grant) = state.plugins.get(&manifest.id) else { continue };
            if !state.allow_third_party || !grant.enabled || !missing_permissions(&manifest.permissions, &grant.granted_permissions).is_empty() {
                continue;
            }
            let launch = launch_command(&plugin.dir, command, args);
            let (program, args) = match launch {
                Ok(launch) => launch,
                Err(error) => {
                    lock(&host.runtimes).entry(manifest.id.clone()).or_default().error = Some(error);
                    continue;
                }
            };
            wanted.insert(
                manifest.id.clone(),
                LaunchSpec {
                    plugin_id: manifest.id.clone(),
                    program,
                    args,
                    dir: plugin.dir.clone(),
                    data_dir: host.data_dir.join(&manifest.id),
                    granted: manifest.permissions.clone(),
                    app_version: app_version(&host.app),
                },
            );
        }
    }

    let stopping: Vec<Supervisor> = {
        let mut supervisors = lock(&host.supervisors);
        let gone: Vec<String> = supervisors.keys().filter(|id| !wanted.contains_key(*id)).cloned().collect();
        gone.iter().filter_map(|id| supervisors.remove(id)).collect()
    };
    for supervisor in stopping {
        supervisor.stop();
    }

    let mut supervisors = lock(&host.supervisors);
    for (id, spec) in wanted {
        if supervisors.contains_key(&id) {
            continue;
        }
        match Supervisor::start(host.app.clone(), spec, Arc::clone(&host.runtimes)) {
            Ok(supervisor) => {
                supervisors.insert(id, supervisor);
            }
            Err(error) => lock(&host.runtimes).entry(id).or_default().error = Some(error),
        }
    }
    Ok(())
}

/// Stops every running plugin so the next sync starts them with fresh files.
fn stop_all() -> Result<(), String> {
    let stopping: Vec<Supervisor> = lock(&host()?.supervisors).drain().map(|(_, supervisor)| supervisor).collect();
    for supervisor in stopping {
        supervisor.stop();
    }
    Ok(())
}

fn snapshot() -> Result<PluginsSnapshot, String> {
    let host = host()?;
    let state = lock(&host.state).clone();
    let runtimes = lock(&host.runtimes).clone();
    let plugins = lock(&host.installed)
        .iter()
        .map(|plugin| {
            let runtime = runtimes.get(&plugin.folder).cloned().unwrap_or_default();
            let grant = state.plugins.get(&plugin.folder).cloned().unwrap_or_default();
            let mut info = PluginInfo {
                id: plugin.folder.clone(),
                invalid_reason: None,
                name: None,
                description: None,
                version: String::new(),
                author: String::new(),
                homepage: String::new(),
                permissions: Vec::new(),
                commands: Vec::new(),
                has_process: false,
                enabled: grant.enabled,
                needs_approval: false,
                status: runtime.status,
                error: runtime.error,
                log: runtime.log.into_iter().collect(),
            };
            match &plugin.manifest {
                Ok(manifest) => {
                    info.needs_approval = grant.enabled
                        && !missing_permissions(&manifest.permissions, &grant.granted_permissions).is_empty();
                    info.name = Some(manifest.name.clone());
                    info.description = Some(manifest.description.clone());
                    info.version = manifest.version.clone();
                    info.author = manifest.author.clone();
                    info.homepage = manifest.homepage.clone();
                    info.permissions = manifest.permissions.clone();
                    info.commands = manifest.contributes.commands.clone();
                    info.has_process = matches!(manifest.runtime, PluginRuntime::Process { .. });
                }
                Err(reason) => info.invalid_reason = Some(reason.clone()),
            }
            info
        })
        .collect();
    Ok(PluginsSnapshot {
        allow_third_party: state.allow_third_party,
        plugins_dir: host.plugins_dir.display().to_string(),
        plugins,
    })
}

fn update_state(change: impl FnOnce(&mut PluginsState, &[InstalledPlugin]) -> Result<(), String>) -> Result<(), String> {
    let host = host()?;
    let installed = lock(&host.installed);
    let mut state = lock(&host.state);
    let mut next = state.clone();
    change(&mut next, &installed)?;
    save_state(&host.state_path, &next)?;
    *state = next;
    Ok(())
}

#[tauri::command]
pub fn list_plugins() -> Result<PluginsSnapshot, String> {
    snapshot()
}

#[tauri::command]
pub async fn set_plugins_allowed(allowed: bool) -> Result<PluginsSnapshot, String> {
    update_state(|state, _| {
        state.allow_third_party = allowed;
        Ok(())
    })?;
    sync_processes()?;
    snapshot()
}

/// Turning a plugin on grants the permissions its manifest asks for, which the
/// settings page shows next to the switch.
#[tauri::command]
pub async fn set_plugin_enabled(id: String, enabled: bool) -> Result<PluginsSnapshot, String> {
    update_state(|state, installed| {
        let plugin = installed.iter().find(|plugin| plugin.folder == id).ok_or("Plugin not found.")?;
        let grant = state.plugins.entry(id.clone()).or_default();
        if enabled {
            let manifest = plugin.manifest.as_ref().map_err(Clone::clone)?;
            grant.granted_permissions = manifest.permissions.clone();
        }
        grant.enabled = enabled;
        Ok(())
    })?;
    if !enabled {
        lock(&host()?.runtimes).remove(&id);
    }
    sync_processes()?;
    snapshot()
}

/// Reads the plugins folder again and restarts running plugins with their new files.
#[tauri::command]
pub async fn reload_plugins() -> Result<PluginsSnapshot, String> {
    let host = host()?;
    stop_all()?;
    *lock(&host.installed) = scan(&host.plugins_dir, &app_version(&host.app));
    lock(&host.runtimes).clear();
    sync_processes()?;
    snapshot()
}

#[tauri::command]
pub fn open_plugins_folder() -> Result<(), String> {
    let host = host()?;
    tauri_plugin_opener::open_path(&host.plugins_dir, None::<&str>).map_err(|error| error.to_string())
}

/// Sends a `command` notification for one of the plugin's `contributes.commands`.
#[tauri::command]
pub fn run_plugin_command(id: String, command: String) -> Result<(), String> {
    let host = host()?;
    let known = lock(&host.installed).iter().any(|plugin| {
        plugin.folder == id
            && plugin
                .manifest
                .as_ref()
                .is_ok_and(|manifest| manifest.contributes.commands.iter().any(|item| item.id() == command))
    });
    if !known {
        return Err("Unknown plugin command.".into());
    }
    let supervisors = lock(&host.supervisors);
    let supervisor = supervisors.get(&id).ok_or("The plugin is not running.")?;
    supervisor.notify("command", json!({ "id": command }))
}
