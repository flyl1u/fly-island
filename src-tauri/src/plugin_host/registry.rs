//! Which plugins are installed: built-in ones plus the plugins folder, the
//! one-time carry-over of the old local API switches, and the snapshot the
//! settings pages show.

use serde::Serialize;
use serde_json::{Map, Value};
use std::{collections::BTreeMap, fs, path::PathBuf};

use super::{
    app_version, builtin, dev,
    grants::sync_processes,
    host, keybindings, lock,
    manifest::{parse_manifest, runtime_requirement, LocalizedText, PluginCommand, PluginRuntime, MANIFEST_FILE_NAME},
    market,
    permissions::missing_permissions,
    runtime::{self, Resources, RuntimeStatus},
    sensitive::SensitiveChoice,
    settings::{self, InfoItem, SettingSpec},
    store::PluginsState,
    updates, InstalledPlugin, PluginHost,
};

/// Mirrored by `PluginInfo` in src/features/plugins/api.ts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    id: String,
    /// Comes with the island: no "allow third-party" needed, cannot be uninstalled.
    builtin: bool,
    /// Loaded in development mode from a folder (dev.rs): always on, every permission granted.
    dev: bool,
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
    /// The user turned off its `island.notify` messages.
    notifications_muted: bool,
    /// Command shortcuts another app or plugin already uses.
    keybinding_conflicts: Vec<String>,
    /// Remembered answers for sensitive permissions, which the user can revoke.
    sensitive: BTreeMap<String, SensitiveChoice>,
    /// "startup" (runs while the island runs) or "onDemand" (activationEvents).
    activation: &'static str,
    /// The activation events, as written plus those the contributions imply.
    activation_events: Vec<String>,
    /// From starting the process to its first message, in ms.
    startup_ms: Option<u64>,
    /// Memory and CPU of the plugin's process tree while it runs.
    resources: Option<Resources>,
    /// Why an on-demand plugin asked to keep running (`host.keepAlive`).
    keep_alive: Option<String>,
    /// This version was taken off the market (revocations.rs), and why.
    revoked: Option<LocalizedText>,
    /// A newer version in the market (updates.rs).
    update_available: Option<String>,
    /// The version an automatic update installed while the island has been running.
    auto_updated: Option<String>,
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
    /// Install market updates that ask for no new permissions by themselves.
    auto_update: bool,
    /// Market publishers the user trusts.
    trusted_publishers: Vec<String>,
}

/// Built-in plugins first, then the plugins folder sorted by id.
pub(super) fn scan(plugins_dir: &PathBuf, app_version: &str) -> Vec<InstalledPlugin> {
    let mut plugins: Vec<InstalledPlugin> = builtin::manifests(app_version)
        .into_iter()
        .map(|(id, manifest)| InstalledPlugin {
            folder: id.to_string(),
            dir: PathBuf::new(),
            manifest,
            builtin: true,
            dev: false,
        })
        .collect();
    plugins.extend(scan_folder(plugins_dir, app_version));
    plugins
}

/// The plugins folder, sorted by id, with development plugins (dev.rs) in place
/// of an installed plugin with the same id.
fn scan_folder(plugins_dir: &PathBuf, app_version: &str) -> Vec<InstalledPlugin> {
    let development = dev::plugins();
    let mut found: Vec<InstalledPlugin> = development
        .iter()
        .map(|(id, dir)| InstalledPlugin {
            folder: id.clone(),
            dir: dir.clone(),
            manifest: dev::read_manifest(dir, app_version).and_then(|manifest| {
                if &manifest.id == id { Ok(manifest) } else { Err(format!("The id changed to \"{}\"; load the folder again.", manifest.id)) }
            }),
            builtin: false,
            dev: true,
        })
        .collect();
    let Ok(entries) = fs::read_dir(plugins_dir) else {
        return found;
    };
    let mut installed: Vec<InstalledPlugin> = entries
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
                    .and_then(dev::check_installed)
            };
            InstalledPlugin { folder, dir, manifest, builtin: false, dev: false }
        })
        .filter(|plugin| !development.iter().any(|(id, _)| *id == plugin.folder))
        .collect();
    found.append(&mut installed);
    found.sort_by(|left, right| left.folder.cmp(&right.folder));
    found
}

/// The local API used to have its own switches in local-api.json. The first
/// time the plugin host sees no entry for it, those become the plugin's switch
/// and its "allow changes" setting, so scripts keep working. True if changed.
pub(super) fn migrate_local_api(state: &mut PluginsState, installed: &[InstalledPlugin], legacy: Option<(bool, bool)>) -> bool {
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

/// Reads the plugins folder again and starts what should run.
pub(super) fn rescan() -> Result<(), String> {
    let host = host()?;
    *lock(&host.installed) = scan(&host.plugins_dir, &app_version(&host.app));
    sync_processes()
}

pub(super) fn installed_version(host: &PluginHost, id: &str) -> Option<String> {
    lock(&host.installed)
        .iter()
        .find(|plugin| plugin.folder == id)
        .map(|plugin| plugin.manifest.as_ref().map(|manifest| manifest.version.clone()).unwrap_or_default())
}

pub(super) fn snapshot() -> Result<PluginsSnapshot, String> {
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
                dev: plugin.dev,
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
                enabled: grant.enabled || plugin.dev,
                needs_approval: false,
                status: runtime.status,
                error: runtime.error,
                log: runtime.log.into_iter().collect(),
                settings_schema: Vec::new(),
                settings: Map::new(),
                info: runtime.info,
                notifications_muted: grant.notifications_muted,
                keybinding_conflicts: keybindings::conflicts(&plugin.folder),
                sensitive: grant.sensitive.clone(),
                activation: "startup",
                activation_events: Vec::new(),
                startup_ms: runtime.startup_ms,
                resources: runtime.resources,
                keep_alive: runtime.keep_alive.clone(),
                revoked: None,
                update_available: None,
                auto_updated: None,
            };
            if !plugin.builtin && !plugin.dev {
                (info.update_available, info.auto_updated) = updates::status_for(&plugin.folder);
            }
            match &plugin.manifest {
                Ok(manifest) => {
                    info.needs_approval = grant.enabled
                        && !plugin.dev
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
                    info.activation = if manifest.activation.is_eager() { "startup" } else { "onDemand" };
                    info.activation_events = manifest.activation.events.iter().map(|event| event.label()).collect();
                    if !plugin.builtin && !plugin.dev {
                        info.revoked = updates::revoked_reason(&state, &plugin.folder, &manifest.version);
                    }
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
        auto_update: state.auto_update,
        trusted_publishers: state.trusted_publishers.clone(),
    })
}
