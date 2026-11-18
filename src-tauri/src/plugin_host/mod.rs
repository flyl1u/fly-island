mod manifest;
mod packages;
mod process;
mod protocol;
mod service;
mod storage;
#[cfg(test)] mod tests;

use std::sync::Arc;
use tauri::Manager;
use service::{Host, Snapshot};
use serde_json::Value;

pub(crate) use manifest::Manifest as PluginManifest;
pub(crate) use protocol::Contributions as PluginContributions;
pub(crate) use service::EVENT;

type PluginHost = Arc<Host>;

pub fn init(app: &tauri::AppHandle) -> Result<(), String> {
    crate::eye_care::init(app);
    let host = Arc::new(Host::new(app.path().app_data_dir().map_err(|e| e.to_string())?, Some(app.clone()), crate::release_flags::PLUGINS_ENABLED)?);
    let registry = host.snapshot().registry;
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
pub async fn get_plugins(host: tauri::State<'_, PluginHost>) -> Result<Snapshot, String> { Ok(host.snapshot()) }
#[tauri::command]
pub async fn get_plugins_index(host: tauri::State<'_, PluginHost>) -> Result<Vec<packages::IndexEntry>, String> { host.catalog().await }
#[tauri::command]
pub async fn install_plugin(id: String, host: tauri::State<'_, PluginHost>) -> Result<(), String> {
    let _guard = host.operation.lock().await;
    host.install(&id).await
}
#[tauri::command]
pub async fn set_plugin_enabled(id: String, enabled: bool, host: tauri::State<'_, PluginHost>) -> Result<(), String> {
    let _guard = host.operation.lock().await;
    host.enable(&id, enabled)
}
#[tauri::command]
pub async fn uninstall_plugin(id: String, host: tauri::State<'_, PluginHost>) -> Result<(), String> {
    let _guard = host.operation.lock().await;
    host.uninstall(&id)
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
    if !host.enabled() { return Ok(()); }
    let mut registry = host.snapshot().registry;
    if !registry.developer_mode { return Err("Developer mode is disabled".into()); }
    let directory = std::path::PathBuf::from(directory).canonicalize().map_err(|e| e.to_string())?;
    let manifest = manifest::Manifest::read(&directory.join("fly-island-plugin.json"))?;
    if registry.installed.contains_key(&manifest.id) { return Err("Uninstall the existing plugin first".into()); }
    registry.installed.insert(manifest.id.clone(), storage::Installed { manifest, enabled: false, directory, development: true, settings: Default::default() });
    host.persist(registry)
}

macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)* crate::plugin_host::get_plugins, crate::plugin_host::get_plugins_index,
            crate::plugin_host::install_plugin, crate::plugin_host::set_plugin_enabled,
            crate::plugin_host::uninstall_plugin, crate::plugin_host::set_plugin_setting,
            crate::plugin_host::run_plugin_action, crate::plugin_host::configure_plugins,
            crate::plugin_host::load_development_plugin,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
