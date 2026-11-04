//! Tauri commands for the settings pages (插件扩展 and 插件市场).

use serde::Serialize;
use serde_json::{json, Map, Value};
use std::fs;

use super::{
    app_version, builtin,
    grants::{stop_all, stop_plugin, sync_processes, update_state},
    host, lock, market,
    registry::{installed_version, rescan, scan, snapshot, PluginsSnapshot},
    runtime, settings,
};

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
