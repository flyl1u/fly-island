//! revoked.json: plugin versions taken off the market. The list is signed like
//! the index (signature.rs), read with every index refresh (updates.rs) and kept
//! in plugins.json, so it still applies when the island starts offline.
//! A revoked plugin is stopped and switched off and cannot be switched on again
//! (`action: "uninstall"` also deletes its folder, keeping plugins-data/). This
//! covers plugins put into the plugins folder by hand; development plugins
//! (dev.rs) are exempt.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;

use super::{
    grants::{stop_plugin, sync_processes, update_state},
    host, lock,
    manifest::LocalizedText,
    registry::rescan,
};

const REVOKED_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum RevokeAction {
    Disable,
    Uninstall,
}

/// `"*"` (every version) or a list of versions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub(super) enum RevokedVersions {
    All(String),
    Some(Vec<String>),
}

/// One entry of revoked.json; also kept in plugins.json (`revoked`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Revocation {
    pub id: String,
    pub versions: RevokedVersions,
    pub reason: LocalizedText,
    pub action: RevokeAction,
}

impl Revocation {
    fn covers(&self, id: &str, version: &str) -> bool {
        self.id == id
            && match &self.versions {
                RevokedVersions::All(all) => all == "*",
                RevokedVersions::Some(list) => list.iter().any(|item| item == version),
            }
    }
}

#[derive(Deserialize)]
struct RevokedFile {
    version: u32,
    #[serde(default)]
    revoked: Vec<Value>,
}

/// Parses revoked.json; entries that do not check out are left out.
pub(super) fn parse_revoked(text: &str) -> Result<Vec<Revocation>, String> {
    let file: RevokedFile = serde_json::from_str(text).map_err(|error| format!("The revocation list is not valid: {error}"))?;
    if file.version != REVOKED_VERSION {
        return Err(format!("The revocation list has format {}; update FocuSD Island.", file.version));
    }
    Ok(file
        .revoked
        .into_iter()
        .filter_map(|value| serde_json::from_value::<Revocation>(value).ok())
        .filter(|item| !item.id.is_empty() && !matches!(&item.versions, RevokedVersions::All(all) if all != "*"))
        .collect())
}

/// The entry that revokes this version of the plugin, if one does.
pub(super) fn find<'a>(list: &'a [Revocation], id: &str, version: &str) -> Option<&'a Revocation> {
    list.iter().find(|item| item.covers(id, version))
}

/// Keeps `list` as the current revocations: matching plugins are switched off,
/// those marked "uninstall" deleted, and running ones stopped.
pub(super) fn apply(list: Vec<Revocation>) -> Result<(), String> {
    let host = host()?;
    let hits: Vec<(String, RevokeAction, std::path::PathBuf)> = lock(&host.installed)
        .iter()
        .filter(|plugin| !plugin.builtin && !plugin.dev)
        .filter_map(|plugin| {
            let manifest = plugin.manifest.as_ref().ok()?;
            let item = find(&list, &plugin.folder, &manifest.version)?;
            Some((plugin.folder.clone(), item.action, plugin.dir.clone()))
        })
        .collect();
    let unchanged = lock(&host.state).revoked == list;
    if unchanged && hits.iter().all(|(id, action, _)| *action == RevokeAction::Disable && !is_on(id)) {
        return Ok(());
    }
    update_state(|state, _| {
        state.revoked = list;
        for (id, action, _) in &hits {
            if *action == RevokeAction::Uninstall {
                state.plugins.remove(id);
            } else if let Some(grant) = state.plugins.get_mut(id) {
                grant.enabled = false;
            }
        }
        Ok(())
    })?;
    let mut removed = false;
    for (id, action, dir) in &hits {
        stop_plugin(id)?;
        if *action == RevokeAction::Uninstall && dir.is_dir() {
            fs::remove_dir_all(dir).map_err(|error| format!("Could not delete the revoked plugin {id}: {error}"))?;
            lock(&host.runtimes).remove(id);
            removed = true;
        }
    }
    if removed {
        rescan()
    } else {
        sync_processes()
    }
}

fn is_on(id: &str) -> bool {
    host().is_ok_and(|host| lock(&host.state).plugins.get(id).is_some_and(|grant| grant.enabled))
}
