//! Plugin host: finds plugins in `plugins/<id>/focusd-plugin.json` under the app
//! data folder, keeps the user's choices in `plugins.json`, and runs the enabled
//! ones as child processes. Design: docs/architecture/plugins.md; guide for
//! plugin authors: docs/plugins/README.md.
//!
//! - registry.rs: which plugins are installed, and the settings-page snapshot
//! - grants.rs: saves the user's choices and starts / stops plugins to match
//! - commands.rs: the Tauri commands
//! - events.rs: island events plugins subscribe to
//! - notify.rs: messages plugins show on the island (`island.notify`)
//! - storage.rs: `storage.*` and `secrets.*`, and clearing a plugin's data
//! - runtime.rs: one plugin process; runtime/dispatch.rs answers its requests

mod builtin;
mod commands;
mod events;
mod grants;
mod manifest;
mod market;
mod notify;
mod permissions;
mod registry;
mod rpc;
mod runtime;
mod settings;
mod signature;
mod storage;
mod store;
#[cfg(test)]
mod tests;

pub use commands::*;

use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    sync::{Arc, Mutex, MutexGuard, OnceLock, PoisonError},
};
use tauri::{AppHandle, Manager};

use crate::local_api;

use grants::sync_processes;
use manifest::PluginManifest;
use registry::{migrate_local_api, scan};
use runtime::{RuntimeTable, Supervisor};
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
    events::listen(app);
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
