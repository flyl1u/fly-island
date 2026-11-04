//! Plugin host: finds plugins in `plugins/<id>/focusd-plugin.json` under the app
//! data folder, keeps the user's choices in `plugins.json`, and runs the enabled
//! ones as child processes. Design: docs/architecture/plugins.md; guide for
//! plugin authors: docs/plugins/README.md.

mod builtin;
mod manifest;
mod market;
mod permissions;
mod rpc;
mod runtime;
mod settings;
mod signature;
mod store;
#[cfg(test)]
mod tests;

use serde::Serialize;
use serde_json::{json, Map, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    sync::{Arc, Mutex, MutexGuard, OnceLock, PoisonError},
};
use tauri::{AppHandle, Manager};

use crate::{agent_status, local_api};

use manifest::{launch_command, parse_manifest, runtime_requirement, LocalizedText, PluginCommand, PluginManifest, PluginRuntime, MANIFEST_FILE_NAME};
use permissions::missing_permissions;
use runtime::{LaunchSpec, RuntimeStatus, RuntimeTable, Supervisor};
use settings::{InfoItem, SettingSpec};
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
    /// Built-in plugins that are running (they have no supervisor).
    builtins_running: Mutex<HashSet<String>>,
    runtimes: RuntimeTable,
}

struct InstalledPlugin {
    folder: String,
    /// Empty for built-in plugins.
    dir: PathBuf,
    manifest: Result<PluginManifest, String>,
    builtin: bool,
}

/// Mirrored by `PluginInfo` in src/features/plugins/api.ts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    id: String,
    /// Comes with the island: no "allow third-party" needed, cannot be uninstalled.
    builtin: bool,
    /// Why the plugin cannot be used (bad manifest); the other fields are then empty.
    invalid_reason: Option<String>,
    name: Option<LocalizedText>,
    description: Option<LocalizedText>,
    version: String,
    author: String,
    homepage: String,
    permissions: Vec<String>,
    commands: Vec<PluginCommand>,
    /// What it needs installed: "exe", "powershell", "node" or "none".
    runtime: &'static str,
    has_process: bool,
    enabled: bool,
    /// On, but the plugin now asks for permissions the user has not granted.
    needs_approval: bool,
    status: RuntimeStatus,
    error: Option<String>,
    log: Vec<String>,
    /// Declared settings and their current values (defaults filled in).
    settings_schema: Vec<SettingSpec>,
    settings: Map<String, Value>,
    /// What the running plugin shows with `ui.setInfo`.
    info: Vec<InfoItem>,
}

/// Mirrored by `PluginsSnapshot` in src/features/plugins/api.ts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginsSnapshot {
    allow_third_party: bool,
    /// Whether Node.js was found, for plugins whose runtime is "node".
    node_available: bool,
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
    let installed = scan(&plugins_dir, &app_version(app));
    let mut state = load_state(&state_path);
    if migrate_local_api(&mut state, &installed, local_api::legacy_switches()) {
        save_state(&state_path, &state)?;
    }
    let host = PluginHost {
        app: app.clone(),
        installed: Mutex::new(installed),
        plugins_dir,
        data_dir: app_dir.join(PLUGIN_DATA_DIR_NAME),
        state: Mutex::new(state),
        state_path,
        supervisors: Mutex::new(HashMap::new()),
        builtins_running: Mutex::new(HashSet::new()),
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

/// Built-in plugins first, then the plugins folder sorted by id.
fn scan(plugins_dir: &PathBuf, app_version: &str) -> Vec<InstalledPlugin> {
    let mut plugins: Vec<InstalledPlugin> = builtin::manifests(app_version)
        .into_iter()
        .map(|(id, manifest)| InstalledPlugin {
            folder: id.to_string(),
            dir: PathBuf::new(),
            manifest,
            builtin: true,
        })
        .collect();
    let Ok(entries) = fs::read_dir(plugins_dir) else {
        return plugins;
    };
    let mut from_disk: Vec<InstalledPlugin> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter(|entry| !entry.file_name().to_string_lossy().starts_with(market::WORK_DIR_PREFIX))
        .map(|entry| {
            let folder = entry.file_name().to_string_lossy().into_owned();
            let dir = entry.path();
            let manifest = if builtin::is_builtin(&folder) {
                Err("This id belongs to a plugin built into FocuSD Island.".to_string())
            } else {
                fs::read_to_string(dir.join(MANIFEST_FILE_NAME))
                    .map_err(|error| format!("Could not read {MANIFEST_FILE_NAME}: {error}"))
                    .and_then(|text| parse_manifest(&text, &folder, app_version))
            };
            InstalledPlugin { folder, dir, manifest, builtin: false }
        })
        .collect();
    from_disk.sort_by(|left, right| left.folder.cmp(&right.folder));
    plugins.append(&mut from_disk);
    plugins
}

/// The local API used to have its own switches in local-api.json. The first
/// time the plugin host sees no entry for it, those become the plugin's switch
/// and its "allow changes" setting, so scripts keep working. True if changed.
fn migrate_local_api(state: &mut PluginsState, installed: &[InstalledPlugin], legacy: Option<(bool, bool)>) -> bool {
    if state.plugins.contains_key(builtin::LOCAL_API_ID) {
        return false;
    }
    let Some((enabled, allow_write)) = legacy else { return false };
    if !enabled && !allow_write {
        return false;
    }
    let permissions = installed
        .iter()
        .find(|plugin| plugin.folder == builtin::LOCAL_API_ID)
        .and_then(|plugin| plugin.manifest.as_ref().ok())
        .map(|manifest| manifest.permissions.clone())
        .unwrap_or_default();
    let grant = state.plugins.entry(builtin::LOCAL_API_ID.to_string()).or_default();
    grant.enabled = enabled;
    grant.granted_permissions = if enabled { permissions } else { Vec::new() };
    grant.settings.insert(builtin::LOCAL_API_ALLOW_WRITE.to_string(), Value::Bool(allow_write));
    true
}

/// Starts and stops built-in plugins like sync_processes does for processes;
/// they do not need "allow third-party plugins".
fn sync_builtins(host: &PluginHost) {
    let mut wanted: HashMap<String, Map<String, Value>> = HashMap::new();
    {
        let state = lock(&host.state);
        for plugin in lock(&host.installed).iter().filter(|plugin| plugin.builtin) {
            let Ok(manifest) = &plugin.manifest else { continue };
            let Some(grant) = state.plugins.get(&manifest.id) else { continue };
            if grant.enabled && missing_permissions(&manifest.permissions, &grant.granted_permissions).is_empty() {
                wanted.insert(manifest.id.clone(), settings::resolve(&manifest.contributes.settings, &grant.settings));
            }
        }
    }
    let mut running = lock(&host.builtins_running);
    let stopping: Vec<String> = running.iter().filter(|id| !wanted.contains_key(*id)).cloned().collect();
    for id in stopping {
        running.remove(&id);
        let result = builtin::stop(&id);
        let mut runtimes = lock(&host.runtimes);
        let entry = runtimes.entry(id).or_default();
        entry.status = RuntimeStatus::Stopped;
        entry.error = result.err();
        entry.info.clear();
    }
    for (id, settings) in wanted {
        if running.contains(&id) {
            continue;
        }
        let started = builtin::start(&id, &settings);
        let mut runtimes = lock(&host.runtimes);
        let entry = runtimes.entry(id.clone()).or_default();
        match started {
            Ok(info) => {
                running.insert(id);
                entry.status = RuntimeStatus::Running;
                entry.error = None;
                entry.info = info;
            }
            Err(error) => {
                entry.status = RuntimeStatus::Crashed;
                entry.error = Some(error);
                entry.info.clear();
            }
        }
    }
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
                    display_name: manifest.name.en().to_string(),
                    settings: settings::resolve(&manifest.contributes.settings, &grant.settings),
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
        let id = supervisor.plugin_id().to_string();
        supervisor.stop();
        agent_status::clear_external_owner(&id);
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
    drop(supervisors);
    sync_builtins(host);
    Ok(())
}

/// Stops one plugin (if running) and drops the agent statuses it reported.
fn stop_plugin(id: &str) -> Result<(), String> {
    let supervisor = lock(&host()?.supervisors).remove(id);
    if let Some(supervisor) = supervisor {
        supervisor.stop();
    }
    agent_status::clear_external_owner(id);
    Ok(())
}

/// Reads the plugins folder again and starts what should run.
fn rescan() -> Result<(), String> {
    let host = host()?;
    *lock(&host.installed) = scan(&host.plugins_dir, &app_version(&host.app));
    sync_processes()
}

/// Stops every running plugin so the next sync starts them with fresh files.
fn stop_all() -> Result<(), String> {
    let stopping: Vec<Supervisor> = lock(&host()?.supervisors).drain().map(|(_, supervisor)| supervisor).collect();
    for supervisor in stopping {
        let id = supervisor.plugin_id().to_string();
        supervisor.stop();
        agent_status::clear_external_owner(&id);
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
                builtin: plugin.builtin,
                invalid_reason: None,
                name: None,
                description: None,
                version: String::new(),
                author: String::new(),
                homepage: String::new(),
                permissions: Vec::new(),
                commands: Vec::new(),
                runtime: "none",
                has_process: false,
                enabled: grant.enabled,
                needs_approval: false,
                status: runtime.status,
                error: runtime.error,
                log: runtime.log.into_iter().collect(),
                settings_schema: Vec::new(),
                settings: Map::new(),
                info: runtime.info,
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
                    info.has_process = matches!(manifest.runtime, PluginRuntime::Process { .. } | PluginRuntime::Builtin);
                    info.runtime = runtime_requirement(&manifest.runtime);
                    info.settings_schema = manifest.contributes.settings.clone();
                    info.settings = settings::resolve(&manifest.contributes.settings, &grant.settings);
                }
                Err(reason) => info.invalid_reason = Some(reason.clone()),
            }
            info
        })
        .collect();
    Ok(PluginsSnapshot {
        allow_third_party: state.allow_third_party,
        node_available: runtime::find_node().is_some(),
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

/// One index entry with what this install knows about it. Mirrored by
/// `MarketPlugin` in src/features/plugins/api.ts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketPlugin {
    #[serde(flatten)]
    entry: market::MarketEntry,
    installed_version: Option<String>,
    /// Why this FocuSD Island cannot install it, if it cannot.
    incompatible: Option<String>,
}

/// Mirrored by `MarketSnapshot` in src/features/plugins/api.ts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketSnapshot {
    index_url: String,
    node_available: bool,
    plugins: Vec<MarketPlugin>,
}

fn installed_version(host: &PluginHost, id: &str) -> Option<String> {
    lock(&host.installed)
        .iter()
        .find(|plugin| plugin.folder == id)
        .map(|plugin| plugin.manifest.as_ref().map(|manifest| manifest.version.clone()).unwrap_or_default())
}

#[tauri::command]
pub async fn get_plugin_market() -> Result<MarketSnapshot, String> {
    let host = host()?;
    let version = app_version(&host.app);
    let plugins = market::fetch_index()
        .await?
        .into_iter()
        .map(|entry| MarketPlugin {
            installed_version: installed_version(host, &entry.id),
            incompatible: market::incompatibility(&entry, &version),
            entry,
        })
        .collect();
    Ok(MarketSnapshot {
        index_url: market::INDEX_URL.to_string(),
        node_available: runtime::find_node().is_some(),
        plugins,
    })
}

/// Installs or updates a plugin from the market. A fresh install starts off; an
/// update keeps the plugin's switch, and pauses it if it now asks for more
/// permissions.
#[tauri::command]
pub async fn install_market_plugin(id: String) -> Result<PluginsSnapshot, String> {
    if builtin::is_builtin(&id) {
        return Err("This plugin is built into FocuSD Island.".into());
    }
    let host = host()?;
    let version = app_version(&host.app);
    let entry = market::fetch_index()
        .await?
        .into_iter()
        .find(|entry| entry.id == id)
        .ok_or("The plugin is no longer in the market.")?;
    if let Some(reason) = market::incompatibility(&entry, &version) {
        return Err(reason);
    }
    let bytes = market::fetch_package(&entry).await?;
    let plugins_dir = host.plugins_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        stop_plugin(&entry.id)?;
        let installed = market::install_package(&plugins_dir, &entry, &bytes, &version);
        lock(&host.runtimes).remove(&entry.id);
        rescan()?;
        installed
    })
    .await
    .map_err(|error| format!("The install task failed: {error}"))??;
    snapshot()
}

/// Removes a plugin's folder and its switch and grants. Its private data in
/// plugins-data/ is kept, so reinstalling picks it up again.
#[tauri::command]
pub async fn uninstall_plugin(id: String) -> Result<PluginsSnapshot, String> {
    if builtin::is_builtin(&id) {
        return Err("Built-in plugins cannot be uninstalled; switch it off instead.".into());
    }
    let host = host()?;
    let dir = lock(&host.installed)
        .iter()
        .find(|plugin| plugin.folder == id)
        .map(|plugin| plugin.dir.clone())
        .ok_or("Plugin not found.")?;
    tauri::async_runtime::spawn_blocking(move || {
        stop_plugin(&id)?;
        fs::remove_dir_all(&dir).map_err(|error| format!("Could not delete {} (is a file in it open?): {error}", dir.display()))?;
        update_state(|state, _| {
            state.plugins.remove(&id);
            Ok(())
        })?;
        lock(&host.runtimes).remove(&id);
        rescan()
    })
    .await
    .map_err(|error| format!("The uninstall task failed: {error}"))??;
    snapshot()
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
    // Built-in plugins keep running across a reload, and so does what they show.
    lock(&host.runtimes).retain(|id, _| builtin::is_builtin(id));
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
    if builtin::is_builtin(&id) {
        if !lock(&host.builtins_running).contains(&id) {
            return Err("The plugin is not running.".into());
        }
        let info = builtin::run_command(&id, &command)?;
        lock(&host.runtimes).entry(id).or_default().info = info;
        return Ok(());
    }
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

/// Saves one of the plugin's declared settings (checked against its type) and
/// sends the running plugin `settings.changed`.
#[tauri::command]
pub fn set_plugin_setting(id: String, key: String, value: Value) -> Result<PluginsSnapshot, String> {
    let host = host()?;
    let mut resolved = Map::new();
    update_state(|state, installed| {
        let manifest = installed
            .iter()
            .find(|plugin| plugin.folder == id)
            .and_then(|plugin| plugin.manifest.as_ref().ok())
            .ok_or("Plugin not found.")?;
        let specs = &manifest.contributes.settings;
        let spec = specs.iter().find(|spec| spec.key() == key).ok_or("Unknown plugin setting.")?;
        let value = settings::coerce(spec, &value).map_err(|error| format!("\"{key}\" {error}."))?;
        let grant = state.plugins.entry(id.clone()).or_default();
        grant.settings.insert(key.clone(), value);
        resolved = settings::resolve(specs, &grant.settings);
        Ok(())
    })?;
    if lock(&host.builtins_running).contains(&id) {
        builtin::settings_changed(&id, &resolved)?;
    } else if let Some(supervisor) = lock(&host.supervisors).get(&id) {
        supervisor.update_settings(resolved);
    }
    snapshot()
}
