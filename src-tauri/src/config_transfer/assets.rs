//! Only installed sound-pack manifests and the audio files they list are portable assets.
use std::{collections::BTreeMap, fs, path::Path};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use crate::agent_status::sound_packs::{is_valid_id, sound_extension, SoundPack, SOUND_EVENTS};

fn safe_path(path: &str) -> bool {
    let parts: Vec<_> = path.split('/').collect();
    parts.len() == 3 && parts[0] == "sound-packs" && is_valid_id(parts[1])
        && (parts[2] == "pack.json" || SOUND_EVENTS.iter().any(|event| {
            parts[2].strip_prefix(&format!("{event}.")).is_some_and(|ext| sound_extension(&format!("x.{ext}")).as_deref() == Some(ext))
        }))
}

pub(super) fn validate(assets: &BTreeMap<String, String>) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let mut decoded = BTreeMap::new();
    for (path, value) in assets {
        if !safe_path(path) { return Err("Invalid sound-pack asset path".into()); }
        let bytes = STANDARD.decode(value).map_err(|e| e.to_string())?;
        if bytes.is_empty() || bytes.len() > 4 * 1024 * 1024 { return Err("Sound-pack asset is empty or too large".into()); }
        decoded.insert(path.clone(), bytes);
    }
    for (path, bytes) in &decoded {
        let parent = path.rsplit_once('/').map(|(p, _)| p).ok_or("Invalid sound pack")?;
        let manifest_path = format!("{parent}/pack.json");
        let manifest = decoded.get(&manifest_path).ok_or("Missing sound-pack manifest")?;
        let pack: SoundPack = serde_json::from_slice(manifest).map_err(|e| e.to_string())?;
        if parent != format!("sound-packs/{}", pack.id) || pack.from_plugin
            || pack.sounds.iter().any(|(event, name)| !SOUND_EVENTS.contains(&event.as_str())
                || !safe_path(&format!("{parent}/{name}")) || !decoded.contains_key(&format!("{parent}/{name}")))
            || (!path.ends_with("/pack.json") && !pack.sounds.values().any(|name| path == &format!("{parent}/{name}")))
            || (path.ends_with("/pack.json") && bytes.len() > 65536) {
            return Err("Invalid sound-pack manifest or unlisted asset".into());
        }
    }
    Ok(decoded)
}

pub(super) fn collect(root: &Path) -> Result<BTreeMap<String, String>, String> {
    let mut result = BTreeMap::new();
    let directory = root.join("sound-packs");
    if !directory.exists() { return Ok(result); }
    for entry in fs::read_dir(directory).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let id = entry.file_name().to_string_lossy().into_owned();
        if !is_valid_id(&id) || !entry.file_type().map_err(|e| e.to_string())?.is_dir() { continue; }
        let manifest = entry.path().join("pack.json");
        let pack: SoundPack = serde_json::from_slice(&fs::read(&manifest).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        if pack.from_plugin { continue; }
        for name in std::iter::once("pack.json").chain(pack.sounds.values().map(String::as_str)) {
            let key = format!("sound-packs/{id}/{name}");
            if !safe_path(&key) { return Err("Invalid installed sound asset".into()); }
            let path = root.join(&key);
            super::transaction::check_path(&path)?;
            let bytes = super::transaction::read_limited(&path, 4 * 1024 * 1024)?;
            result.insert(key, STANDARD.encode(bytes));
        }
    }
    validate(&result)?;
    Ok(result)
}
