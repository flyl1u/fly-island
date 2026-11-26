mod download;
mod jobs;
mod manifest;
mod packages;
mod process;
mod protocol;
mod service;
mod storage;
pub(crate) mod transfer;
#[cfg(test)] mod tests;

use std::sync::Arc;
use tauri::Manager;
use service::{Host, Snapshot};
use serde_json::Value;

pub(crate) use manifest::Manifest as PluginManifest;
pub(crate) use protocol::Contributions as PluginContributions;
pub(crate) use service::EVENT;

pub(crate) type PluginHost = Arc<Host>;

pub fn init(app: &tauri::AppHandle) -> Result<(), String> {
    crate::eye_care::init(app);
    let root = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let host = Arc::new(if crate::release_flags::plugin_market_enabled() && !crate::release_flags::PLUGINS_ENABLED {
        Host::market(root, Some(app.clone()))?
    } else {
        Host::new(root, Some(app.clone()), crate::release_flags::PLUGINS_ENABLED)?
    });
    let registry = host.public_snapshot().registry;
    for (id, p) in registry.installed {
        if p.enabled && (!p.development || registry.developer_mode) {
            if let Err(error) = host.start(&id) { eprintln!("Plugin {id} could not start: {error}"); }
        }
    }
    app.manage(host);
    Ok(())
}

pub fn shutdown(app: &tauri::AppHandle) { crate::eye_care::shutdown(app); if let Some(host) = app.try_state::<PluginHost>() { host.shutdown(); } }

#[tauri::command]
pub async fn get_plugins(host: tauri::State<'_, PluginHost>) -> Result<Snapshot, String> { Ok(host.public_snapshot()) }
#[tauri::command]
pub async fn get_plugins_index(host: tauri::State<'_, PluginHost>) -> Result<Vec<packages::IndexEntry>, String> { host.catalog().await }
#[tauri::command]
pub async fn install_plugin(id: String, enable: Option<bool>, host: tauri::State<'_, PluginHost>) -> Result<(), String> {
    host.install(&id, enable.unwrap_or(false)).await
}
/// True when the running download will stop; false once there is nothing left to cancel.
#[tauri::command]
pub async fn cancel_plugin_install(id: String, host: tauri::State<'_, PluginHost>) -> Result<bool, String> {
    Ok(host.jobs.cancel(&id))
}
#[tauri::command]
pub async fn get_plugin_installs(host: tauri::State<'_, PluginHost>) -> Result<Vec<jobs::Progress>, String> { Ok(host.jobs.list()) }
#[tauri::command]
pub async fn set_plugin_enabled(id: String, enabled: bool, host: tauri::State<'_, PluginHost>) -> Result<(), String> {
    let _guard = host.operation.lock().await;
    host.enable(&id, enabled)?;
    host.jobs.forget_failure(&id);
    Ok(())
}
#[tauri::command]
pub async fn uninstall_plugin(id: String, host: tauri::State<'_, PluginHost>) -> Result<(), String> {
    host.remove(&id).await
}
#[tauri::command]
pub async fn set_plugin_setting(id: String, key: String, value: Value, host: tauri::State<'_, PluginHost>) -> Result<(), String> {
    let _guard = host.operation.lock().await;
    host.setting(&id, &key, value)
}
#[tauri::command]
pub async fn run_plugin_action(id: String, action: String, host: tauri::State<'_, PluginHost>) -> Result<Value, String> {
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || host.action(&id, &action)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn configure_plugins(developer_mode: bool, index_url: String, host: tauri::State<'_, PluginHost>) -> Result<(), String> {
    let _guard = host.operation.lock().await;
    if !host.allows_development() { return Err("Developer mode is unavailable in this build".into()); }
    let mut registry = host.snapshot().registry;
    registry.developer_mode = developer_mode;
    registry.index_url = index_url;
    if !developer_mode {
        for (id, p) in &mut registry.installed { if p.development { host.stop(id); p.enabled = false; } }
    }
    host.persist(registry)
}
#[tauri::command]
pub async fn load_development_plugin(directory: String, host: tauri::State<'_, PluginHost>) -> Result<(), String> {
    let _guard = host.operation.lock().await;
    if !host.allows_development() { return Err("Developer mode is unavailable in this build".into()); }
    let mut registry = host.snapshot().registry;
    if !registry.developer_mode { return Err("Developer mode is disabled".into()); }
    let directory = std::path::PathBuf::from(directory).canonicalize().map_err(|e| e.to_string())?;
    let manifest = manifest::Manifest::read(&directory.join("fly-island-plugin.json"))?;
    if registry.installed.contains_key(&manifest.id) { return Err("Uninstall the existing plugin first".into()); }
    let id = manifest.id.clone();
    let mut installed = storage::Installed { manifest, enabled: false, directory, development: true, settings: Default::default() };
    transfer::restore_install(&host.root, &mut installed);
    let enabled = installed.enabled;
    registry.installed.insert(id.clone(), installed);
    host.persist(registry)?;
    if enabled { host.start(&id)?; }
    Ok(())
}

macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)* crate::plugin_host::get_plugins, crate::plugin_host::get_plugins_index,
            crate::plugin_host::install_plugin, crate::plugin_host::set_plugin_enabled,
            crate::plugin_host::uninstall_plugin, crate::plugin_host::set_plugin_setting,
            crate::plugin_host::run_plugin_action, crate::plugin_host::configure_plugins,
            crate::plugin_host::load_development_plugin,
            crate::plugin_host::get_plugin_installs,
            crate::plugin_host::cancel_plugin_install,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
