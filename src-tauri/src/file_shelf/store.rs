//! The shelf list on disk (`file-shelf.json`) and the rules that keep it tidy.

use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, path::Path};

use super::FileShelfItem;

pub(super) const FILE_SHELF_FILE_NAME: &str = "file-shelf.json";

/// Oldest entries drop off once the shelf holds this many.
pub(super) const MAX_ITEMS: usize = 100;

#[derive(Deserialize)]
struct StoredFileShelf {
    #[serde(default)]
    items: Vec<serde_json::Value>,
}

#[derive(Serialize)]
struct StoredFileShelfRef<'a> {
    items: &'a [FileShelfItem],
}

/// The saved list, or an empty one when the file is missing or unreadable.
pub(super) fn load_items(path: &Path) -> Vec<FileShelfItem> {
    fs::read_to_string(path)
        .map(|content| parse_items(&content))
        .unwrap_or_default()
}

/// Entries that fail to parse are skipped one by one, so a single bad entry does
/// not empty the whole shelf.
pub(super) fn parse_items(content: &str) -> Vec<FileShelfItem> {
    let Ok(stored) = serde_json::from_str::<StoredFileShelf>(content) else {
        return Vec::new();
    };
    let items = stored
        .items
        .into_iter()
        .filter_map(|value| serde_json::from_value::<FileShelfItem>(value).ok())
        .filter(|item| !item.id.is_empty() && !item.path.is_empty())
        .collect();
    normalize(items)
}

/// `added` goes on top in the given order. A path already on the shelf moves up
/// instead of appearing twice.
pub(super) fn insert_items(
    existing: Vec<FileShelfItem>,
    added: Vec<FileShelfItem>,
) -> Vec<FileShelfItem> {
    normalize(added.into_iter().chain(existing).collect())
}

/// Keeps the first entry for each path and at most `MAX_ITEMS` entries.
fn normalize(items: Vec<FileShelfItem>) -> Vec<FileShelfItem> {
    let mut seen = HashSet::new();
    items
        .into_iter()
        .filter(|item| seen.insert(path_key(&item.path)))
        .take(MAX_ITEMS)
        .collect()
}

/// Windows paths are case-insensitive and accept either slash.
pub(super) fn path_key(path: &str) -> String {
    path.replace('/', "\\").to_lowercase()
}

pub(super) fn save_items(path: &Path, items: &[FileShelfItem]) -> Result<(), String> {
    let content = serde_json::to_string_pretty(&StoredFileShelfRef { items })
        .map_err(|error| format!("Failed to encode the file shelf: {error}"))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    }

    // Write beside the target and rename, so a crash never leaves half a file.
    let temporary_path = path.with_extension("tmp");
    fs::write(&temporary_path, content)
        .map_err(|error| format!("Failed to write {}: {error}", temporary_path.display()))?;
    fs::rename(&temporary_path, path)
        .or_else(|_| {
            fs::remove_file(path).ok();
            fs::rename(&temporary_path, path)
        })
        .map_err(|error| format!("Failed to replace {}: {error}", path.display()))
}
