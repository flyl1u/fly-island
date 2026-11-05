//! Tauri commands for the settings pages (插件扩展 and 插件市场).

use serde::Serialize;
use serde_json::{json, Map, Value};
use std::{fs, time::Duration};

use super::{
    app_version, builtin,
    grants::{stop_all, stop_plugin, sync_processes, update_state},
    host, lifecycle, lock,
    manifest::LocalizedText,
    market, menus, notify, revocations, sensitive, updates,
    registry::{installed_version, rescan, scan, snapshot, PluginsSnapshot},
    runtime, settings, storage,
    views::{self, PluginViewsSnapshot},
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
    /// This version was taken off the market (revoked.json), and why.
    revoked: Option<LocalizedText>,
}

/// Mirrored by `MarketSnapshot` in src/features/plugins/api.ts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketSnapshot {
    index_url: String,
    node_available: bool,
    plugins: Vec<MarketPlugin>,
    /// Publishers the user trusts; the official one is always trusted.
    trusted_publishers: Vec<String>,
    official_publisher: &'static str,
}

/// How long a market read stays good enough to show first or to install from.
/// Installing still checks the package against the hash in that verified index.
const MARKET_REUSE_FOR: Duration = Duration::from_secs(10 * 60);
/// The cached market may be older; it is only shown while a fresh copy loads.
const MARKET_SHOW_CACHED_FOR: Duration = Duration::from_secs(24 * 60 * 60);

/// Reads the market; also applies its revocations and notes available updates.
#[tauri::command]
pub async fn get_plugin_market() -> Result<MarketSnapshot, String> {
    let data = market::fetch_market().await?;
    let absorbed = data.clone();
    tauri::async_runtime::spawn_blocking(move || updates::absorb(&absorbed))
        .await
        .map_err(|error| format!("The market task failed: {error}"))??;
    market_snapshot(data)
}

/// The market as last read this session (by the page or the background update
/// check), without going online; None before the first read.
#[tauri::command]
pub fn get_cached_plugin_market() -> Result<Option<MarketSnapshot>, String> {
    market::recent_market(MARKET_SHOW_CACHED_FOR).map(market_snapshot).transpose()
}

fn market_snapshot(data: market::MarketData) -> Result<MarketSnapshot, String> {
    let host = host()?;
    let version = app_version(&host.app);
    let market::MarketData { entries, revoked, .. } = data;
    let plugins = entries
        .into_iter()
        .map(|entry| MarketPlugin {
            installed_version: installed_version(host, &entry.id),
            incompatible: market::incompatibility(&entry, &version),
            revoked: revocations::find(&revoked, &entry.id, &entry.version).map(|item| item.reason.clone()),
            entry,
        })
        .collect();
    Ok(MarketSnapshot {
        index_url: market::INDEX_URL.to_string(),
        node_available: runtime::find_node().is_some(),
        plugins,
        trusted_publishers: lock(&host.state).trusted_publishers.clone(),
        official_publisher: market::OFFICIAL_PUBLISHER,
    })
}

/// Installs or updates a plugin from the market. A fresh install starts off; an
/// update keeps the plugin's switch, and pauses it if it now asks for more
/// permissions. The publisher must be trusted and the version not revoked.
#[tauri::command]
pub async fn install_market_plugin(id: String) -> Result<PluginsSnapshot, String> {
    if builtin::is_builtin(&id) {
        return Err("This plugin is built into FocuSD Island.".into());
    }
    let host = host()?;
    let version = app_version(&host.app);
    // The page loaded a verified index moments ago; read it again only when it is old.
    let data = match market::recent_market(MARKET_REUSE_FOR) {
        Some(data) => data,
        None => market::fetch_market().await?,
    };
    let pre_release = updates::wants_pre_release(&lock(&host.state), &id);
    let entry = data
        .entry_for(&id, pre_release)
        .cloned()
        .ok_or("The plugin is no longer in the market.")?;
    if let Some(reason) = market::incompatibility(&entry, &version).or_else(|| updates::install_refusal(&entry, &data.revoked)) {
        return Err(reason);
    }
    let bytes = market::fetch_package(&entry).await?;
    tauri::async_runtime::spawn_blocking(move || updates::install_entry(&entry, &bytes))
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
        super::webviews::forget_plugin(&id);
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
        if enabled {
            let manifest = plugin.manifest.as_ref().map_err(Clone::clone)?;
            if let Some(item) = revocations::find(&state.revoked, &id, &manifest.version).filter(|_| !plugin.dev) {
                return Err(format!("This version was taken off the market: {}", item.reason.en()));
            }
            let grant = state.plugins.entry(id.clone()).or_default();
            grant.granted_permissions = manifest.permissions.clone();
        }
        let grant = state.plugins.entry(id.clone()).or_default();
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
    // Starts an on-demand plugin first (onCommand).
    lifecycle::deliver(&id, format!("onCommand:{command}"), "command", json!({ "id": command }))
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

/// The user clicked a button of a plugin's `island.notify` message; the plugin
/// gets `notification.action` with the button's id.
#[tauri::command]
pub fn run_plugin_notification_action(id: String, action: String) -> Result<(), String> {
    if !notify::is_action_id(&action) {
        return Err("Unknown notification action.".into());
    }
    // A plugin stopped for being idle since is started again to hear the answer.
    lifecycle::deliver(&id, "notification.action".into(), "notification.action", json!({ "id": action }))
}

/// What running plugins add to an island menu (`contributes.menus`), e.g. "todo/context".
#[tauri::command]
pub fn list_plugin_menu(menu: String) -> Result<Vec<menus::PluginMenuEntry>, String> {
    menus::entries(&menu)
}

/// The user picked a plugin entry in the right-click menu of a todo; the plugin
/// gets `command` with `args.todoId`.
#[tauri::command]
pub fn run_plugin_menu_command(id: String, menu: String, command: String, todo_id: String) -> Result<(), String> {
    menus::run(&id, &menu, &command, &todo_id)
}

/// The user's answer to a sensitive-permission prompt on the island:
/// "allow", "deny" or "once".
#[tauri::command]
pub fn answer_plugin_permission(request_id: u64, answer: String) -> Result<(), String> {
    let answer = sensitive::Answer::parse(&answer).ok_or("Unknown answer.")?;
    sensitive::answer(request_id, answer);
    Ok(())
}

/// Forgets the user's answer for one sensitive permission; the plugin's next
/// call asks again.
#[tauri::command]
pub fn revoke_plugin_sensitive_permission(id: String, permission: String) -> Result<PluginsSnapshot, String> {
    sensitive::revoke(&id, &permission)?;
    snapshot()
}

/// Turns a plugin's `island.notify` messages off or back on.
#[tauri::command]
pub fn set_plugin_notifications_muted(id: String, muted: bool) -> Result<PluginsSnapshot, String> {
    update_state(|state, installed| {
        if !installed.iter().any(|plugin| plugin.folder == id) {
            return Err("Plugin not found.".into());
        }
        state.plugins.entry(id.clone()).or_default().notifications_muted = muted;
        Ok(())
    })?;
    snapshot()
}

/// "清除数据": stops the plugin, deletes its data folder and its secrets, and
/// starts it again if it is on.
#[tauri::command]
pub async fn clear_plugin_data(id: String) -> Result<PluginsSnapshot, String> {
    if builtin::is_builtin(&id) {
        return Err("Built-in plugins keep no plugin data.".into());
    }
    let host = host()?;
    if !lock(&host.installed).iter().any(|plugin| plugin.folder == id) {
        return Err("Plugin not found.".into());
    }
    let data_dir = host.data_dir.join(&id);
    tauri::async_runtime::spawn_blocking(move || {
        stop_plugin(&id)?;
        let cleared = storage::clear_plugin_data(&id, &data_dir);
        sync_processes()?;
        cleared
    })
    .await
    .map_err(|error| format!("The clear task failed: {error}"))??;
    snapshot()
}

/// Sends the plugin a notification about one of its views, starting an
/// on-demand plugin first (onView).
fn notify_view(id: &str, view_id: &str, method: &str, params: Value) -> Result<(), String> {
    if !views::declares_view(id, view_id) {
        return Err("Unknown plugin view.".into());
    }
    lifecycle::deliver(id, format!("onView:{view_id}"), method, params)
}

/// The pages plugins add to the island and the status texts they show now.
#[tauri::command]
pub fn list_plugin_views() -> Result<PluginViewsSnapshot, String> {
    views::snapshot()
}

/// The island shows or hides a plugin page. The plugin gets `view.visible`;
/// while hidden, its updates are not sent to the window. Returns the page's
/// model when it becomes visible (null before the plugin sent one).
#[tauri::command]
pub fn set_plugin_view_visible(id: String, view_id: String, visible: bool) -> Result<Option<Value>, String> {
    if !views::declares_view(&id, &view_id) {
        return Err("Unknown plugin view.".into());
    }
    let model = views::set_visible(&id, &view_id, visible);
    let params = json!({ "viewId": view_id, "visible": visible });
    if visible {
        // Showing the page starts an on-demand plugin.
        let _ = notify_view(&id, &view_id, "view.visible", params);
    } else if let Some(supervisor) = lock(&host()?.supervisors).get(&id).filter(|supervisor| supervisor.is_ready()) {
        // Hiding it never starts one.
        let _ = supervisor.notify("view.visible", params);
    }
    Ok(model)
}

/// The user clicked an action (or a check box, with `checked`) on a plugin page.
#[tauri::command]
pub fn run_plugin_view_action(id: String, view_id: String, item_id: Option<String>, action_id: String, checked: Option<bool>) -> Result<(), String> {
    if !views::is_action_id(&action_id) || item_id.as_deref().is_some_and(|item| !views::is_action_id(item)) {
        return Err("Unknown plugin view action.".into());
    }
    let mut params = json!({ "viewId": view_id, "actionId": action_id });
    if let Some(item) = item_id {
        params["itemId"] = json!(item);
    }
    if let Some(checked) = checked {
        params["checked"] = json!(checked);
    }
    notify_view(&id, &view_id, "view.action", params)
}

/// The user submitted the form on a plugin page.
#[tauri::command]
pub fn submit_plugin_view(id: String, view_id: String, values: Value) -> Result<(), String> {
    views::check_view_values(&values)?;
    notify_view(&id, &view_id, "view.submit", json!({ "viewId": view_id, "values": values }))
}

/// The user typed in the search box of a plugin's list page.
#[tauri::command]
pub fn search_plugin_view(id: String, view_id: String, query: String) -> Result<(), String> {
    views::check_query(&query)?;
    notify_view(&id, &view_id, "view.search", json!({ "viewId": view_id, "query": query }))
}

/// Starts a stopped or crashed plugin again ("插件已停止" on its page).
#[tauri::command]
pub async fn restart_plugin(id: String) -> Result<(), String> {
    if builtin::is_builtin(&id) {
        return Err("Built-in plugins cannot be restarted here.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        stop_plugin(&id)?;
        sync_processes()
    })
    .await
    .map_err(|error| format!("The restart task failed: {error}"))?
}
