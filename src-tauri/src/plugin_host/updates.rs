//! Keeping market plugins current: the index and revocation list are read 30 s
//! after start and then every 6 hours while third-party plugins are allowed
//! (and whenever the market page loads). Revocations are applied at once;
//! newer versions are shown on the plugin cards, and installed by themselves
//! only when the user turned on automatic updates, the publisher is trusted,
//! the new version asks for no permission the installed one did not, and it
//! is signed by its author with the key the installed version had
//! (author_signing.rs). An update on another key waits for the user to confirm.

use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Mutex,
    thread,
    time::Duration,
};

use super::{
    app_version,
    author_signing::{check_key, KeyCheck},
    grants::{stop_plugin, update_state},
    host, lock,
    manifest::{version_at_least, LocalizedText},
    market::{self, MarketData, MarketEntry, OFFICIAL_PUBLISHER},
    registry::{rescan, snapshot, PluginsSnapshot},
    revocations,
    store::PluginsState,
};

const FIRST_CHECK_AFTER: Duration = Duration::from_secs(30);
const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);

#[derive(Default)]
struct Status {
    /// Plugin id -> the newer version in the market.
    available: BTreeMap<String, String>,
    /// Plugin id -> the version an automatic update installed this run.
    updated: BTreeMap<String, String>,
    /// Plugin id -> a pre-release in the market newer than its stable version.
    pre_releases: BTreeMap<String, String>,
    /// Plugins whose available update is not signed by the key the installed version had.
    key_changed: BTreeSet<String>,
}

static STATUS: Mutex<Status> = Mutex::new(Status {
    available: BTreeMap::new(),
    updated: BTreeMap::new(),
    pre_releases: BTreeMap::new(),
    key_changed: BTreeSet::new(),
});

/// How `entry` compares with the author key remembered for the installed plugin;
/// None when its signature is wrong (it cannot be installed at all).
pub(super) fn key_check(state: &PluginsState, entry: &MarketEntry) -> Option<KeyCheck> {
    let remembered = state.plugins.get(&entry.id).map(|grant| grant.author_keys.as_slice()).unwrap_or_default();
    entry.signer().ok().map(|signer| check_key(remembered, signer.as_deref()))
}

/// Whether the update the market offers for `id` is signed by another key than the installed version.
pub(super) fn signing_key_changed(id: &str) -> bool {
    lock(&STATUS).key_changed.contains(id)
}

/// Whether updates of `id` may install pre-releases.
pub(super) fn wants_pre_release(state: &PluginsState, id: &str) -> bool {
    state.plugins.get(id).is_some_and(|grant| grant.pre_release)
}

/// (newer version in the market, version installed by an automatic update) for a plugin card.
/// For an installed plugin: the update available, the version auto-updated to,
/// and the pre-release the market offers.
pub(super) fn status_for(id: &str) -> (Option<String>, Option<String>, Option<String>) {
    let status = lock(&STATUS);
    (status.available.get(id).cloned(), status.updated.get(id).cloned(), status.pre_releases.get(id).cloned())
}

/// Whether the user trusts the publisher (the island's own always is).
pub(super) fn trusts(state: &PluginsState, publisher: &str) -> bool {
    publisher == OFFICIAL_PUBLISHER || state.trusted_publishers.iter().any(|name| name == publisher)
}

/// A GitHub user or organization name.
fn is_valid_publisher(name: &str) -> bool {
    (1..=39).contains(&name.len()) && name.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

/// Applies a freshly read market: revocations, and which installed plugins have
/// a newer version. Returns the updates to install by themselves.
pub(super) fn absorb(data: &MarketData) -> Result<Vec<MarketEntry>, String> {
    revocations::apply(data.revoked.clone())?;
    let host = host()?;
    let version = app_version(&host.app);
    let state = lock(&host.state).clone();
    let mut available = BTreeMap::new();
    let mut pre_releases = BTreeMap::new();
    let mut key_changed = BTreeSet::new();
    let mut automatic = Vec::new();
    for plugin in lock(&host.installed).iter().filter(|plugin| !plugin.builtin && !plugin.dev) {
        let Ok(manifest) = &plugin.manifest else { continue };
        if let Some(pre) = data.pre_release_of(&plugin.folder) {
            pre_releases.insert(pre.id.clone(), pre.version.clone());
        }
        let Some(entry) = data.entry_for(&plugin.folder, wants_pre_release(&state, &plugin.folder)) else { continue };
        if !entry.is_newer_than(&manifest.version)
            || market::incompatibility(entry, &version).is_some()
            || revocations::find(&data.revoked, &entry.id, &entry.version).is_some()
        {
            continue;
        }
        available.insert(entry.id.clone(), entry.version.clone());
        let check = key_check(&state, entry);
        if check == Some(KeyCheck::Changed) {
            key_changed.insert(entry.id.clone());
        }
        let no_new_permissions = entry.permissions.iter().all(|name| manifest.permissions.contains(name));
        let signed = check.is_some_and(KeyCheck::may_install_by_itself);
        if state.auto_update && no_new_permissions && signed && trusts(&state, entry.publisher()) {
            automatic.push(entry.clone());
        }
    }
    let mut status = lock(&STATUS);
    status.available = available;
    status.pre_releases = pre_releases;
    status.key_changed = key_changed;
    Ok(automatic)
}

/// Stops the plugin, swaps in the new package and starts what should run, then
/// remembers the author key that signed it. A package signed by another key
/// than the installed version (or no longer signed) needs `accept_key_change`.
pub(super) fn install_entry(entry: &MarketEntry, bytes: &[u8], accept_key_change: bool) -> Result<(), String> {
    let host = host()?;
    let signer = entry.signer()?;
    let remembered = lock(&host.state).plugins.get(&entry.id).map(|grant| grant.author_keys.clone()).unwrap_or_default();
    if check_key(&remembered, signer.as_deref()) == KeyCheck::Changed && !accept_key_change {
        return Err(format!(
            "{} {} is not signed with the key of the installed version; confirm the update to install it anyway.",
            entry.id, entry.version
        ));
    }
    stop_plugin(&entry.id)?;
    let installed = market::install_package(&host.plugins_dir, entry, bytes, &app_version(&host.app));
    lock(&host.runtimes).remove(&entry.id);
    rescan()?;
    installed?;
    update_state(|state, _| {
        state.plugins.entry(entry.id.clone()).or_default().author_keys = signer.into_iter().collect();
        Ok(())
    })?;
    let mut status = lock(&STATUS);
    status.available.remove(&entry.id);
    status.key_changed.remove(&entry.id);
    Ok(())
}

/// Reads the market and applies it; installs automatic updates.
async fn check() -> Result<(), String> {
    let data = market::fetch_market().await?;
    let automatic = tauri::async_runtime::spawn_blocking(move || absorb(&data))
        .await
        .map_err(|error| format!("The update task failed: {error}"))??;
    for entry in automatic {
        let bytes = market::fetch_package(&entry).await?;
        let installed = entry.clone();
        tauri::async_runtime::spawn_blocking(move || install_entry(&installed, &bytes, false))
            .await
            .map_err(|error| format!("The update task failed: {error}"))??;
        lock(&STATUS).updated.insert(entry.id.clone(), entry.version.clone());
    }
    Ok(())
}

fn third_party_allowed() -> bool {
    host().is_ok_and(|host| lock(&host.state).allow_third_party)
}

pub(super) fn start() {
    let _ = thread::Builder::new().name("plugin-updates".into()).spawn(|| {
        thread::sleep(FIRST_CHECK_AFTER);
        loop {
            // No network traffic for people who do not use third-party plugins.
            if third_party_allowed() {
                if let Err(error) = tauri::async_runtime::block_on(check()) {
                    eprintln!("plugin update check failed: {error}");
                }
            }
            thread::sleep(CHECK_EVERY);
        }
    });
}

/// Why `entry` may not be installed: revoked (in this market or in the saved
/// list), older than the installed version, or from a publisher the user has
/// not trusted.
pub(super) fn install_refusal(entry: &MarketEntry, revoked: &[revocations::Revocation]) -> Option<String> {
    let host = host().ok()?;
    let state = lock(&host.state);
    let revocation = revocations::find(revoked, &entry.id, &entry.version)
        .or_else(|| revocations::find(&state.revoked, &entry.id, &entry.version));
    if let Some(item) = revocation {
        return Some(format!("This version was taken off the market: {}", item.reason.en()));
    }
    let installed = lock(&host.installed)
        .iter()
        .find(|plugin| plugin.folder == entry.id && !plugin.dev)
        .and_then(|plugin| plugin.manifest.as_ref().ok().map(|manifest| manifest.version.clone()));
    if let Some(installed) = installed.filter(|installed| downgrade(installed, &entry.version)) {
        return Some(format!("Version {installed} is installed; the market offers the older {}.", entry.version));
    }
    (!trusts(&state, entry.publisher())).then(|| format!("Trust the publisher \"{}\" first.", entry.publisher()))
}

/// True when `offered` is older than `installed` (an old or stale index must not roll a plugin back).
pub(super) fn downgrade(installed: &str, offered: &str) -> bool {
    installed != offered && version_at_least(installed, offered)
}

/// The reason a revoked plugin version shows.
pub(super) fn revoked_reason(state: &PluginsState, id: &str, version: &str) -> Option<LocalizedText> {
    revocations::find(&state.revoked, id, version).map(|item| item.reason.clone())
}

#[tauri::command]
pub async fn set_plugin_auto_update(enabled: bool) -> Result<PluginsSnapshot, String> {
    update_state(|state, _| {
        state.auto_update = enabled;
        Ok(())
    })?;
    snapshot()
}

/// Lets updates of an installed plugin install its pre-releases, or go back to
/// stable versions only (an installed pre-release stays until a newer stable).
#[tauri::command]
pub async fn set_plugin_pre_release(id: String, enabled: bool) -> Result<PluginsSnapshot, String> {
    update_state(|state, installed| {
        if !installed.iter().any(|plugin| plugin.folder == id && !plugin.builtin && !plugin.dev) {
            return Err("Only plugins installed from the market have pre-releases.".into());
        }
        state.plugins.entry(id.clone()).or_default().pre_release = enabled;
        Ok(())
    })?;
    // Show the right update at once when the market was read this session.
    if let Some(data) = market::recent_market(Duration::from_secs(CHECK_EVERY.as_secs())) {
        let _ = absorb(&data);
    }
    snapshot()
}

/// Trusting a publisher lets its plugins be installed (the market asks first).
#[tauri::command]
pub async fn set_plugin_publisher_trusted(publisher: String, trusted: bool) -> Result<PluginsSnapshot, String> {
    if !is_valid_publisher(&publisher) {
        return Err("A publisher is a GitHub user or organization name.".into());
    }
    if publisher == OFFICIAL_PUBLISHER {
        return Err("FocuSD Island's own plugins are always trusted.".into());
    }
    update_state(|state, _| {
        state.trusted_publishers.retain(|name| *name != publisher);
        if trusted {
            state.trusted_publishers.push(publisher.clone());
            state.trusted_publishers.sort();
        }
        Ok(())
    })?;
    snapshot()
}

/// Checks the market now (Settings > Plugins > Check for updates).
#[tauri::command]
pub async fn check_plugin_updates() -> Result<PluginsSnapshot, String> {
    check().await?;
    snapshot()
}
