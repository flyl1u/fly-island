//! Portable clipboard settings, with history and managed PNGs only on explicit opt-in.
use std::{collections::BTreeMap, path::{Path, PathBuf}};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use super::{service, ClipboardHistoryItem, ClipboardHistorySettings};
use super::store::{PersistedClipboardHistory, MAX_IMAGE_PNG_BYTES};

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct ClipboardTransfer {
    settings: ClipboardHistorySettings,
    history: Option<History>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct History { items: Vec<ClipboardHistoryItem>, images: BTreeMap<String, String> }

fn image_name(name: &str) -> bool {
    name.ends_with(".png") && name.len() < 100 && !name.contains("..")
        && name.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.'))
}

pub(crate) fn export(include_history: bool) -> Result<ClipboardTransfer, String> {
    let service = service()?;
    let state = service.state.lock().map_err(|e| e.to_string())?;
    let history = if include_history {
        let mut items = state.items.clone();
        let mut images = BTreeMap::new();
        for image in items.iter_mut().filter_map(|item| item.image.as_mut()) {
            for stored in [&mut image.original_path, &mut image.thumbnail_path] {
                let name = Path::new(stored).file_name().and_then(|p| p.to_str()).filter(|n| image_name(n))
                    .ok_or("Invalid clipboard image name")?.to_owned();
                if Path::new(stored).exists() {
                    let data = super::image_access::read_image(&service.image_dir(), stored)?;
                    let encoded = data.strip_prefix("data:image/png;base64,").ok_or("Invalid clipboard PNG")?;
                    images.insert(name.clone(), encoded.into());
                }
                *stored = name;
            }
        }
        Some(History { items, images })
    } else { None };
    Ok(ClipboardTransfer { settings: state.settings.clone(), history })
}

impl ClipboardTransfer {
    pub(crate) fn includes_history(&self) -> bool { self.history.is_some() }

    pub(crate) fn validate(&self) -> Result<(), String> {
        if let Some(history) = &self.history {
            if history.items.len() > 10000 { return Err("Too many clipboard items".into()); }
            for image in history.items.iter().filter_map(|item| item.image.as_ref()) {
                if !image_name(&image.original_path) || !image_name(&image.thumbnail_path) {
                    return Err("Invalid clipboard image path".into());
                }
            }
            for (name, encoded) in &history.images {
                let bytes = STANDARD.decode(encoded).map_err(|e| e.to_string())?;
                if !image_name(name) || bytes.len() > MAX_IMAGE_PNG_BYTES || !bytes.starts_with(b"\x89PNG\r\n\x1a\n")
                    || !history.items.iter().filter_map(|i| i.image.as_ref()).any(|i| &i.original_path == name || &i.thumbnail_path == name) {
                    return Err("Invalid clipboard image data".into());
                }
            }
        }
        Ok(())
    }

    /// Called at startup, before the capture service exists. Preserve this machine's directory.
    pub(crate) fn plan(&self, root: &Path) -> Result<BTreeMap<PathBuf, Vec<u8>>, String> {
        self.validate()?;
        let directory = super::location::custom_directory(root).unwrap_or_else(|| root.to_path_buf());
        let path = directory.join("clipboard-history.json");
        let mut history = super::store::load_history(&path);
        history.settings = self.settings.clone().normalized();
        let mut files = BTreeMap::new();
        if let Some(imported) = &self.history {
            history.items = imported.items.clone();
            for image in history.items.iter_mut().filter_map(|item| item.image.as_mut()) {
                for stored in [&mut image.original_path, &mut image.thumbnail_path] {
                    *stored = directory.join("clipboard-images").join(&*stored).to_string_lossy().into_owned();
                }
            }
            for (name, encoded) in &imported.images {
                files.insert(directory.join("clipboard-images").join(name), STANDARD.decode(encoded).map_err(|e| e.to_string())?);
            }
        }
        files.insert(path, serde_json::to_vec_pretty(&PersistedClipboardHistory { settings: history.settings, items: history.items }).map_err(|e| e.to_string())?);
        Ok(files)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    #[test]
    fn rejects_paths_and_non_png_payloads() {
        let mut transfer = ClipboardTransfer { settings: Default::default(), history: Some(History { items: vec![], images: BTreeMap::from([("../x.png".into(), STANDARD.encode(b"bad"))]) }) };
        assert!(transfer.validate().is_err());
        transfer.history = None;
        let root = std::env::temp_dir().join(format!("fly-transfer-clip-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let old = br#"{"settings":{"enabled":false,"captureImages":false,"maxItems":50},"items":[{"id":"1","kind":"text","hash":"h","createdAt":1,"copiedAt":1,"preview":"keep","text":"keep","image":null}]}"#;
        fs::write(root.join("clipboard-history.json"), old).unwrap();
        let plan = transfer.plan(&root).unwrap();
        let parsed: serde_json::Value = serde_json::from_slice(&plan[&root.join("clipboard-history.json")]).unwrap();
        assert_eq!(parsed["items"][0]["text"], "keep");
        assert_eq!(parsed["settings"]["enabled"], true);
        fs::remove_dir_all(root).unwrap();
    }
}
