//! Sound packs from the plugin market (roadmap B6.1.11): a plugin with `runtime: none` whose
//! manifest lists sound files under `contributes.sounds`. Nothing runs; the Sounds page lists
//! the pack while the plugin is installed and switched on (agent_status/sound_packs.rs), so
//! switching it off or uninstalling it takes the pack away with no files left behind.

use std::{
    collections::BTreeMap,
    path::{Component, Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use super::{host, lock, revocations};
use crate::agent_status::sound_packs::{sound_extension, SOUND_EVENTS};

const MAX_LICENSE_CHARS: usize = 120;

/// `contributes.sounds`: the pack's licence and, per agent event, a file in the plugin folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct SoundContribution {
    /// SPDX id or a short name such as "CC0-1.0"; the market only lists packs that may be shared.
    pub license: String,
    /// Event (`complete`, `approval`, ...) to a path relative to the plugin folder.
    pub files: BTreeMap<String, String>,
}

/// A relative path that stays inside the plugin folder.
fn is_inner_path(path: &str) -> bool {
    let path = Path::new(path);
    !path.as_os_str().is_empty() && path.components().all(|part| matches!(part, Component::Normal(_)))
}

/// Checks `contributes.sounds`. Events this build does not know are dropped, so a pack made for a
/// newer island still installs here.
pub(super) fn check(sounds: &mut Option<SoundContribution>) -> Result<(), String> {
    let Some(contribution) = sounds else { return Ok(()) };
    contribution.license = contribution.license.trim().to_string();
    if contribution.license.is_empty() || contribution.license.chars().count() > MAX_LICENSE_CHARS {
        return Err("contributes.sounds needs a \"license\" (such as \"CC0-1.0\"), at most 120 characters.".into());
    }
    contribution.files.retain(|event, _| SOUND_EVENTS.contains(&event.as_str()));
    for (event, file) in &contribution.files {
        if !is_inner_path(file) || sound_extension(file).is_none() {
            return Err(format!(
                "contributes.sounds.files.{event} must be a .wav, .mp3, .ogg, .m4a or .flac file inside the plugin folder."
            ));
        }
    }
    if contribution.files.is_empty() {
        return Err("contributes.sounds.files lists no sound for a known event.".into());
    }
    Ok(())
}

/// A sound pack an installed plugin brings.
pub(crate) struct PluginSoundPack {
    pub id: String,
    pub dir: PathBuf,
    pub name_zh: String,
    pub name_en: String,
    pub author: String,
    pub license: String,
    pub files: BTreeMap<String, String>,
}

/// Sound packs of plugins that are installed, switched on and not revoked.
pub(crate) fn plugin_sound_packs() -> Vec<PluginSoundPack> {
    let Ok(host) = host() else { return Vec::new() };
    let state = lock(&host.state);
    lock(&host.installed)
        .iter()
        .filter_map(|plugin| {
            let manifest = plugin.manifest.as_ref().ok()?;
            let sounds = manifest.contributes.sounds.as_ref()?;
            let revoked = revocations::find(&state.revoked, &manifest.id, &manifest.version).is_some();
            let enabled = state.plugins.get(&manifest.id).is_some_and(|grant| grant.enabled);
            (plugin.dev || !revoked && enabled).then(|| PluginSoundPack {
                id: manifest.id.clone(),
                dir: plugin.dir.clone(),
                name_zh: manifest.name.zh_cn().to_string(),
                name_en: manifest.name.en().to_string(),
                author: manifest.author.clone(),
                license: sounds.license.clone(),
                files: sounds.files.clone(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn contribution(files: &[(&str, &str)], license: &str) -> Option<SoundContribution> {
        Some(SoundContribution {
            license: license.into(),
            files: files.iter().map(|(event, file)| (event.to_string(), file.to_string())).collect(),
        })
    }

    #[test]
    fn a_pack_needs_a_licence_and_files_inside_the_plugin() {
        let mut ok = contribution(&[("complete", "sounds/done.wav"), ("someNewEvent", "x.wav")], " CC0-1.0 ");
        assert!(check(&mut ok).is_ok());
        let ok = ok.unwrap();
        assert_eq!(ok.license, "CC0-1.0");
        assert_eq!(ok.files.len(), 1, "unknown events are dropped");

        assert!(check(&mut contribution(&[("complete", "done.wav")], "")).is_err());
        assert!(check(&mut contribution(&[("complete", "../done.wav")], "MIT")).is_err());
        assert!(check(&mut contribution(&[("complete", "C:/done.wav")], "MIT")).is_err());
        assert!(check(&mut contribution(&[("complete", "done.exe")], "MIT")).is_err());
        assert!(check(&mut contribution(&[("someNewEvent", "x.wav")], "MIT")).is_err());
        assert!(check(&mut None).is_ok());
    }
}
