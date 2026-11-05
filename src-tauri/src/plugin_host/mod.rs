//! Plugin host: finds plugins in `plugins/<id>/focusd-plugin.json` under the app
//! data folder, keeps the user's choices in `plugins.json`, and runs the enabled
//! ones as child processes. Design: docs/architecture/plugins.md; guide for
//! plugin authors: docs/plugins/README.md.
//!
//! - registry.rs: which plugins are installed, and the settings-page snapshot
//! - grants.rs: saves the user's choices and starts / stops plugins to match
//! - commands.rs: the Tauri commands
//! - dev.rs: development mode (plugins loaded from any folder, `/v1/dev` routes)
//! - events.rs: island events plugins subscribe to
//! - feeds.rs: messages and media for plugins (`messages.list`, `media.changed`)
//! - activation.rs / lifecycle.rs: when plugin processes run (`activationEvents`),
//!   stopping idle ones, and their memory and CPU
//! - keybindings.rs: global shortcuts of plugin commands
//! - views.rs: what plugins show on the island (`view.*`, `status.update`)
//! - view_specs.rs: `contributes.views` / `statusItems` in the manifest
//! - menus.rs: plugin commands in island menus (`contributes.menus`)
//! - notify.rs: messages plugins show on the island (`island.notify`)
//! - storage.rs: `storage.*` and `secrets.*`, and clearing a plugin's data
//! - sensitive.rs: asking the user before a sensitive permission is first used
//! - runtime.rs: one plugin process; runtime/dispatch.rs answers its requests
//! - market.rs / signature.rs: the market index and its signatures
//! - revocations.rs / updates.rs: revoked versions, background update checks,
//!   automatic updates and trusted publishers

mod activation;
mod baseline;
mod builtin;
mod commands;
mod dev;
mod events;
mod feeds;
mod grants;
mod keybindings;
mod lifecycle;
mod manifest;
mod market;
mod menus;
mod view_specs;
mod views;
mod notify;
mod permissions;
mod registry;
mod revocations;
mod rpc;
mod runtime;
mod sensitive;
mod settings;
mod signature;
mod storage;
mod store;
#[cfg(test)]
mod tests;
mod updates;
mod webviews;

pub use commands::*;
// The Tauri commands of development mode and updates (the macro needs its
// generated items re-exported too).
pub use dev::*;
pub use updates::*;
pub use webviews::*;
pub(crate) use dev::answer_local_api as answer_dev_api;

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
    /// Loaded in development mode from `dir` (dev.rs).
    dev: bool,
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
    keybindings::start();
    lifecycle::start();
    updates::start();
    sync_processes()
}

/// Tells subscribed plugins about a change made outside the island window,
/// e.g. `todos.changed` after a write to todos.json.
pub(crate) fn publish_event(name: &str, payload: serde_json::Value) {
    events::publish_known(name, payload);
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

/// This module's Tauri commands. `lib.rs` chains every module's list into one
/// `generate_handler!`, so adding a command only touches this file.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::plugin_host::list_plugins,
            crate::plugin_host::set_plugins_allowed,
            crate::plugin_host::set_plugin_enabled,
            crate::plugin_host::reload_plugins,
            crate::plugin_host::open_plugins_folder,
            crate::plugin_host::run_plugin_command,
            crate::plugin_host::set_plugin_setting,
            crate::plugin_host::get_plugin_market,
            crate::plugin_host::get_cached_plugin_market,
            crate::plugin_host::install_market_plugin,
            crate::plugin_host::uninstall_plugin,
            crate::plugin_host::run_plugin_notification_action,
            crate::plugin_host::set_plugin_notifications_muted,
            crate::plugin_host::clear_plugin_data,
            crate::plugin_host::list_plugin_menu,
            crate::plugin_host::run_plugin_menu_command,
            crate::plugin_host::answer_plugin_permission,
            crate::plugin_host::revoke_plugin_sensitive_permission,
            crate::plugin_host::list_plugin_views,
            crate::plugin_host::set_plugin_view_visible,
            crate::plugin_host::show_plugin_webview,
            crate::plugin_host::hide_plugin_webview,
            crate::plugin_host::run_plugin_view_action,
            crate::plugin_host::submit_plugin_view,
            crate::plugin_host::search_plugin_view,
            crate::plugin_host::restart_plugin,
            crate::plugin_host::get_plugin_dev_state,
            crate::plugin_host::set_plugin_dev_mode,
            crate::plugin_host::load_dev_plugin,
            crate::plugin_host::reload_dev_plugin,
            crate::plugin_host::unload_dev_plugin,
            crate::plugin_host::get_plugin_rpc_trace,
            crate::plugin_host::send_plugin_dev_event,
            crate::plugin_host::set_plugin_auto_update,
            crate::plugin_host::set_plugin_pre_release,
            crate::plugin_host::set_plugin_publisher_trusted,
            crate::plugin_host::check_plugin_updates,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
